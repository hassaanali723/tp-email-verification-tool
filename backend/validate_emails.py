import sys
import json
import re
import socket
import dns.resolver
import smtplib
import concurrent.futures
import redis
from email.utils import parseaddr
from typing import Dict, List, Tuple

# Redis connection
try:
    redis_client = redis.Redis(host='localhost', port=6379, db=0, socket_timeout=2)
    REDIS_AVAILABLE = redis_client.ping()
except:
    REDIS_AVAILABLE = False
    print("Redis not available, continuing without caching")

# Cache expiration times
CACHE_TTL_EMAIL = 60 * 60 * 24 * 7  # 7 days for email results
CACHE_TTL_MX = 60 * 60 * 24         # 1 day for MX records

class EmailValidator:
    def __init__(self):
        self.local_cache = {
            'mx': {},
            'smtp': {},
            'email': {}
        }
        self.smtp_connections = {}
        
    def validate_emails_batch(self, emails: List[str], max_workers: int = 20) -> List[Dict]:
        """Process emails in parallel, optimized by domain grouping"""
        results = []
        
        # First pass: Quick validation and retrieve from cache
        quick_results = []
        remaining_emails = []
        
        for email in emails:
            # Try cache first
            cached_result = self._get_cached_result(email)
            if cached_result:
                results.append(cached_result)
                continue
                
            # Quick format validation
            quick_result = self._quick_validate(email)
            quick_results.append(quick_result)
            
            # If format is invalid, no need for SMTP check
            if not quick_result['format_valid']:
                final_result = self._create_result_from_quick(email, quick_result)
                self._cache_result(email, final_result)
                results.append(final_result)
            else:
                remaining_emails.append(email)
        
        # Group remaining emails by domain for efficient processing
        domain_groups = {}
        for email in remaining_emails:
            domain = email.split('@')[1]
            if domain not in domain_groups:
                domain_groups[domain] = []
            domain_groups[domain].append(email)
        
        # Process domain groups in parallel
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_domain = {
                executor.submit(self._process_domain_group, domain, domain_emails): domain
                for domain, domain_emails in domain_groups.items()
            }
            
            for future in concurrent.futures.as_completed(future_to_domain):
                domain = future_to_domain[future]
                try:
                    domain_results = future.result()
                    for result in domain_results:
                        self._cache_result(result['email'], result)
                    results.extend(domain_results)
                except Exception as e:
                    print(f"Error processing domain {domain}: {str(e)}")
                    # Create error results for all emails in this domain
                    for email in domain_groups[domain]:
                        error_result = self._create_error_result(email, domain, str(e))
                        self._cache_result(email, error_result)
                        results.append(error_result)
        
        return results
    
    def _process_domain_group(self, domain: str, emails: List[str]) -> List[Dict]:
        """Process all emails for a single domain"""
        results = []
        
        # Get MX records once for all emails in this domain
        mx_records = self._get_mx_records(domain)
        
        # If no MX records, all emails for this domain are invalid
        if not mx_records:
            return [self._create_invalid_domain_result(email, domain) for email in emails]
        
        # Check for catch-all
        is_catchall = self._check_catchall(domain, mx_records)
        
        # Process each email with the shared domain info
        for email in emails:
            result = self._validate_email_smtp(email, domain, mx_records, is_catchall)
            results.append(result)
            
        return results
    
    def _quick_validate(self, email: str) -> Dict:
        """Perform quick validation (format and domain) without SMTP"""
        if '@' not in email:
            return {
                'email': email,
                'format_valid': False,
                'domain': None
            }
            
        # Split email into local part and domain
        local_part, domain = email.split('@', 1)
        
        # Check format
        format_valid = self._validate_format(email)
        
        return {
            'email': email,
            'format_valid': format_valid,
            'domain': domain
        }
    
    def _validate_email_smtp(self, email: str, domain: str, mx_records: List[str], is_catchall: bool) -> Dict:
        """Complete validation including SMTP checks"""
        result = {
            "email": email,
            "isValid": False,
            "riskLevel": "high",
            "deliverabilityScore": 0,
            "_id": None,
            "details": {
                "general": {
                    "fullName": None,
                    "gender": None,
                    "state": "Unknown",
                    "reason": None,
                    "domain": domain
                },
                "attributes": {
                    "free": self._is_free_email(domain),
                    "role": self._is_role_account(email.split('@')[0]),
                    "disposable": self._is_disposable_domain(domain),
                    "acceptAll": is_catchall,
                    "tag": '+' in email.split('@')[0],
                    "numericalChars": sum(c.isdigit() for c in email.split('@')[0]),
                    "alphabeticalChars": sum(c.isalpha() for c in email.split('@')[0]),
                    "unicodeSymbols": sum(not c.isalnum() for c in email.split('@')[0]),
                    "mailboxFull": False,
                    "noReply": email.lower().startswith(('noreply', 'no-reply'))
                },
                "mailServer": {
                    "smtpProvider": self._identify_smtp_provider(mx_records[0]),
                    "mxRecord": mx_records[0],
                    "implicitMXRecord": None
                }
            }
        }
        
        # SMTP Verification
        smtp_check = self._verify_smtp(email, domain, mx_records, is_catchall)
        
        # Determine state based on SMTP result
        if smtp_check["exists"]:
            if is_catchall:
                result["details"]["general"]["state"] = "Risky"
                result["details"]["general"]["reason"] = "Catch-all Domain"
                result["deliverabilityScore"] = 70
                result["riskLevel"] = "medium"
            else:
                result["details"]["general"]["state"] = "Deliverable"
                result["details"]["general"]["reason"] = "Valid Email"
                result["deliverabilityScore"] = 90
                result["riskLevel"] = "low"
                result["isValid"] = True
        else:
            if smtp_check["smtp_code"] == 550:
                result["details"]["general"]["state"] = "Undeliverable"
                result["details"]["general"]["reason"] = "Mailbox Not Found"
            elif smtp_check["smtp_code"] == 552:
                result["details"]["general"]["state"] = "Risky"
                result["details"]["general"]["reason"] = "Mailbox Full"
                result["details"]["attributes"]["mailboxFull"] = True
                result["deliverabilityScore"] = 60
            elif smtp_check["smtp_code"] in [421, 450]:
                result["details"]["general"]["state"] = "Unknown"
                result["details"]["general"]["reason"] = "Server Temporary Error"
                result["deliverabilityScore"] = 30
            elif smtp_check["smtp_code"] == 553:
                result["details"]["general"]["state"] = "Undeliverable"
                result["details"]["general"]["reason"] = "Invalid Mailbox"
            else:
                result["details"]["general"]["state"] = "Unknown"
                result["details"]["general"]["reason"] = smtp_check["smtp_response"] or "Unknown Error"
        
        # Additional risk factors
        if result["details"]["attributes"]["disposable"]:
            result["deliverabilityScore"] = max(result["deliverabilityScore"] - 20, 0)
        
        if result["details"]["attributes"]["role"]:
            result["deliverabilityScore"] = max(result["deliverabilityScore"] - 10, 0)
            
        # Final risk level based on score
        if result["deliverabilityScore"] >= 90:
            result["riskLevel"] = "low"
        elif result["deliverabilityScore"] >= 70:
            result["riskLevel"] = "medium"
        else:
            result["riskLevel"] = "high"
            
        return result
    
    def _get_cached_result(self, email: str) -> Dict:
        """Get cached result from Redis or local cache"""
        # Try local cache first
        if email in self.local_cache['email']:
            return self.local_cache['email'][email]
            
        # Try Redis if available
        if REDIS_AVAILABLE:
            try:
                cached = redis_client.get(f"email:{email}")
                if cached:
                    result = json.loads(cached)
                    # Also store in local cache
                    self.local_cache['email'][email] = result
                    return result
            except:
                pass
                
        return None
    
    def _cache_result(self, email: str, result: Dict) -> None:
        """Cache result in Redis and local cache"""
        # Store in local cache
        self.local_cache['email'][email] = result
        
        # Store in Redis if available
        if REDIS_AVAILABLE:
            try:
                redis_client.setex(f"email:{email}", CACHE_TTL_EMAIL, json.dumps(result))
            except:
                pass
    
    def _get_mx_records(self, domain: str) -> List[str]:
        """Get MX records with caching"""
        # Try local cache first
        if domain in self.local_cache['mx']:
            return self.local_cache['mx'][domain]
            
        # Try Redis cache
        if REDIS_AVAILABLE:
            try:
                cached = redis_client.get(f"mx:{domain}")
                if cached:
                    records = json.loads(cached)
                    self.local_cache['mx'][domain] = records
                    return records
            except:
                pass
        
        # Fetch from DNS
        try:
            mx_records = dns.resolver.resolve(domain, 'MX')
            records = [str(mx.exchange).rstrip('.') for mx in mx_records]
            
            # Cache the result
            self.local_cache['mx'][domain] = records
            if REDIS_AVAILABLE:
                try:
                    redis_client.setex(f"mx:{domain}", CACHE_TTL_MX, json.dumps(records))
                except:
                    pass
                    
            return records
        except:
            self.local_cache['mx'][domain] = []
            return []
    
    def _check_catchall(self, domain: str, mx_records: List[str]) -> bool:
        """Check if domain has catch-all enabled"""
        # Try cache first
        cache_key = f"catchall:{domain}"
        
        if domain in self.local_cache['smtp'] and 'is_catchall' in self.local_cache['smtp'][domain]:
            return self.local_cache['smtp'][domain]['is_catchall']
            
        if REDIS_AVAILABLE:
            try:
                cached = redis_client.get(cache_key)
                if cached:
                    is_catchall = cached == b'1'
                    if domain not in self.local_cache['smtp']:
                        self.local_cache['smtp'][domain] = {}
                    self.local_cache['smtp'][domain]['is_catchall'] = is_catchall
                    return is_catchall
            except:
                pass
        
        # Test with a random non-existent email
        random_email = f"nonexistent_{hash(domain)}@{domain}"
        
        try:
            for mx_record in mx_records:
                try:
                    server = smtplib.SMTP(timeout=5)
                    server.connect(mx_record, 25)
                    server.helo('example.com')
                    server.mail('noreply@example.com')
                    code, _ = server.rcpt(str(random_email))
                    server.quit()
                    
                    is_catchall = (code == 250)
                    
                    # Cache the result
                    if domain not in self.local_cache['smtp']:
                        self.local_cache['smtp'][domain] = {}
                    self.local_cache['smtp'][domain]['is_catchall'] = is_catchall
                    
                    if REDIS_AVAILABLE:
                        try:
                            redis_client.setex(cache_key, CACHE_TTL_EMAIL, '1' if is_catchall else '0')
                        except:
                            pass
                            
                    return is_catchall
                except:
                    continue
        except:
            pass
            
        return False
        
    def _verify_smtp(self, email: str, domain: str, mx_records: List[str], is_catchall: bool) -> Dict:
        """Verify email using SMTP"""
        result = {
            "exists": False,
            "smtp_code": None,
            "smtp_response": None,
            "smtp_provider": self._identify_smtp_provider(mx_records[0]) if mx_records else None
        }
        
        # No need to check if we already know it's catch-all
        if is_catchall:
            result["exists"] = True
            result["smtp_code"] = 250
            result["smtp_response"] = "Catch-all domain"
            return result
            
        # Check SMTP
        for mx_record in mx_records:
            try:
                # Connect and verify
                server = smtplib.SMTP(timeout=5)
                server.connect(mx_record, 25)
                server.helo('example.com')
                server.mail('noreply@example.com')
                code, message = server.rcpt(str(email))
                server.quit()
                
                # Store result
                result["smtp_code"] = code
                result["smtp_response"] = str(message, 'utf-8') if isinstance(message, bytes) else str(message)
                
                if code == 250:
                    result["exists"] = True
                
                # Stop if we got a definitive answer
                if code in [250, 550, 551, 553]:
                    break
            except smtplib.SMTPServerDisconnected:
                result["smtp_response"] = "Server disconnected"
                continue
            except smtplib.SMTPConnectError:
                result["smtp_response"] = "Connection error"
                continue
            except socket.timeout:
                result["smtp_response"] = "Connection timeout"
                continue
            except Exception as e:
                result["smtp_response"] = f"Error: {str(e)}"
                continue
                
        return result
    
    def _validate_format(self, email: str) -> bool:
        """Validate email format using regex"""
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, email))
    
    def _create_result_from_quick(self, email: str, quick_result: Dict) -> Dict:
        """Create a full result from quick validation"""
        domain = quick_result.get('domain')
        
        result = {
            "email": email,
            "isValid": False,
            "riskLevel": "high",
            "deliverabilityScore": 0,
            "_id": None,
            "details": {
                "general": {
                    "fullName": None,
                    "gender": None,
                    "state": "Undeliverable",
                    "reason": "Invalid Email Format",
                    "domain": domain
                },
                "attributes": {
                    "free": domain and self._is_free_email(domain) or False,
                    "role": False,
                    "disposable": domain and self._is_disposable_domain(domain) or False,
                    "acceptAll": False,
                    "tag": False,
                    "numericalChars": 0,
                    "alphabeticalChars": 0,
                    "unicodeSymbols": 0,
                    "mailboxFull": False,
                    "noReply": False
                },
                "mailServer": {
                    "smtpProvider": None,
                    "mxRecord": None,
                    "implicitMXRecord": None
                }
            }
        }
        
        return result
    
    def _create_invalid_domain_result(self, email: str, domain: str) -> Dict:
        """Create result for invalid domain"""
        result = {
            "email": email,
            "isValid": False,
            "riskLevel": "high",
            "deliverabilityScore": 0,
            "_id": None,
            "details": {
                "general": {
                    "fullName": None,
                    "gender": None,
                    "state": "Undeliverable",
                    "reason": "Invalid Domain",
                    "domain": domain
                },
                "attributes": {
                    "free": self._is_free_email(domain),
                    "role": self._is_role_account(email.split('@')[0]),
                    "disposable": self._is_disposable_domain(domain),
                    "acceptAll": False,
                    "tag": '+' in email.split('@')[0],
                    "numericalChars": sum(c.isdigit() for c in email.split('@')[0]),
                    "alphabeticalChars": sum(c.isalpha() for c in email.split('@')[0]),
                    "unicodeSymbols": sum(not c.isalnum() for c in email.split('@')[0]),
                    "mailboxFull": False,
                    "noReply": email.lower().startswith(('noreply', 'no-reply'))
                },
                "mailServer": {
                    "smtpProvider": None,
                    "mxRecord": None,
                    "implicitMXRecord": None
                }
            }
        }
        
        return result
    
    def _create_error_result(self, email: str, domain: str, error: str) -> Dict:
        """Create result for error case"""
        result = {
            "email": email,
            "isValid": False,
            "riskLevel": "high",
            "deliverabilityScore": 0,
            "_id": None,
            "details": {
                "general": {
                    "fullName": None,
                    "gender": None,
                    "state": "Unknown",
                    "reason": f"Error: {error}",
                    "domain": domain
                },
                "attributes": {
                    "free": domain and self._is_free_email(domain) or False,
                    "role": False,
                    "disposable": domain and self._is_disposable_domain(domain) or False,
                    "acceptAll": False,
                    "tag": False,
                    "numericalChars": 0,
                    "alphabeticalChars": 0,
                    "unicodeSymbols": 0,
                    "mailboxFull": False,
                    "noReply": False
                },
                "mailServer": {
                    "smtpProvider": None,
                    "mxRecord": None,
                    "implicitMXRecord": None
                }
            }
        }
        
        return result
    
    def _identify_smtp_provider(self, mx_record: str) -> str:
        """Identify email provider based on MX record"""
        if not mx_record:
            return "Unknown"
            
        mx_lower = mx_record.lower()
        
        smtp_providers = {
            'Google': ['google', 'gmail', 'googlemail'],
            'Microsoft': ['outlook', 'hotmail', 'microsoft'],
            'Yahoo': ['yahoo'],
            'ProtonMail': ['proton'],
            'Zoho': ['zoho'],
            'Amazon SES': ['amazonses'],
            'Mailgun': ['mailgun'],
            'SendGrid': ['sendgrid'],
            'GoDaddy': ['secureserver', 'godaddy'],
            'Rackspace': ['emailsrvr', 'rackspace'],
            'Office 365': ['protection.outlook'],
            'Yandex': ['yandex'],
            'Mail.ru': ['mail.ru'],
            'AOL': ['aol'],
            'iCloud': ['icloud'],
            'Fastmail': ['fastmail']
        }
        
        for provider, keywords in smtp_providers.items():
            if any(keyword in mx_lower for keyword in keywords):
                return provider
                
        return 'Unknown'
    
    def _is_free_email(self, domain: str) -> bool:
        """Check if domain is a free email provider"""
        free_domains = {'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'mail.com'}
        return domain.lower() in free_domains
    
    def _is_role_account(self, local_part: str) -> bool:
        """Check if email is a role account"""
        role_accounts = {'admin', 'info', 'support', 'sales', 'contact', 'help', 'noreply', 'no-reply', 'webmaster'}
        return local_part.lower() in role_accounts
    
    def _is_disposable_domain(self, domain: str) -> bool:
        """Check if domain is a disposable email service"""
        disposable_domains = {
            'tempmail.com', 'temp-mail.org', 'guerrillamail.com', 'mailinator.com',
            'trashmail.com', 'yopmail.com', 'sharklasers.com', '10minutemail.com'
        }
        return domain.lower() in disposable_domains


def main():
    try:
        # Get the input and verify it's valid JSON
        input_arg = sys.argv[1] if len(sys.argv) > 1 else '[]'
        # Clean up input if necessary (for command line arguments with escaping)
        clean_input = input_arg.replace('\\\\', '\\').replace('\\"', '"')
        if clean_input.startswith("'") and clean_input.endswith("'"):
            clean_input = clean_input[1:-1]
            
        input_emails = json.loads(clean_input)
        
        validator = EmailValidator()
        results = validator.validate_emails_batch(input_emails)
        
        print(json.dumps(results))
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"JSON parse error: {str(e)}, input was: {input_arg}"}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()