# import sys
# import json
# import re
# import socket
# import dns.resolver

# def validate_email_format(email):
#     # Regex for basic email validation
#     email_regex = r"^[\w\.-]+@[\w\.-]+\.\w+$"
#     return bool(re.match(email_regex, email))

# def check_domain_exists(email):
#     try:
#         domain = email.split("@")[1]
#         dns.resolver.resolve(domain, 'MX')  # Check for MX records
#         return True
#     except Exception:
#         return False

# def validate_emails(emails):
#     results = []
#     for email in emails:
#         status = {
#             "email": email,
#             "is_valid_format": validate_email_format(email),
#             "domain_exists": check_domain_exists(email) if validate_email_format(email) else False
#         }
#         results.append(status)
#     return results

# if __name__ == "__main__":
#     try:
#         # Get emails from command-line arguments
#         input_emails = json.loads(sys.argv[1])
#         results = validate_emails(input_emails)
#         print(json.dumps(results))
#     except Exception as e:
#         print(json.dumps({"error": str(e)}))


import sys
import json
import re
import socket
import dns.resolver
import smtplib
import concurrent.futures
from email.utils import parseaddr
from typing import Dict, List

class EmailValidator:
    def __init__(self):
        self.smtp_cache = {}  # Cache SMTP results
        
    def validate_email(self, email: str) -> Dict:
        result = {
            "email": email,
            "isValid": False,
            "riskLevel": "high",
            "deliverabilityScore": 0,
            "_id": None,  # Will be set by MongoDB
            "details": {
                "general": {
                    "fullName": None,
                    "gender": None,
                    "state": "Undeliverable",
                    "reason": None,
                    "domain": None
                },
                "attributes": {
                    "free": False,
                    "role": False,
                    "disposable": False,
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

        # Basic Format Check
        if not self._validate_format(email):
            result["details"]["general"]["state"] = "Undeliverable"
            result["details"]["general"]["reason"] = "Invalid Email Format"
            return result

        # Extract domain and analyze
        _, domain = parseaddr(email)[1].split("@")
        result["details"]["general"]["domain"] = domain

        # Domain Analysis
        mx_records = self._check_mx_records(domain)
        if not mx_records:
            result["details"]["general"]["state"] = "Undeliverable"
            result["details"]["general"]["reason"] = "Invalid Domain"
            return result

        # Set MX Record info
        result["details"]["mailServer"]["mxRecord"] = mx_records[0] if mx_records else None
        
        # SMTP Verification
        smtp_check = self._verify_smtp(email, domain, mx_records)
        
        # Determine email state and details based on SMTP response
        if smtp_check["exists"]:
            if smtp_check["is_catchall"]:
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
            # Categorize based on SMTP response code
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
                result["details"]["general"]["reason"] = smtp_check["smtp_response"]

        # Additional risk factors
        if self._is_disposable_domain(domain):
            result["details"]["general"]["state"] = "Risky"
            result["details"]["attributes"]["disposable"] = True
            result["deliverabilityScore"] = max(result["deliverabilityScore"] - 20, 0)

        if self._is_role_account(email.split('@')[0]):
            result["details"]["attributes"]["role"] = True
            result["deliverabilityScore"] = max(result["deliverabilityScore"] - 10, 0)

        # Set final risk level based on score
        if result["deliverabilityScore"] >= 90:
            result["riskLevel"] = "low"
        elif result["deliverabilityScore"] >= 70:
            result["riskLevel"] = "medium"
        else:
            result["riskLevel"] = "high"

        # Update provider info
        result["details"]["mailServer"]["smtpProvider"] = smtp_check["smtp_provider"]
                
        # Update other details
        local_part = email.split('@')[0]
        result["details"]["attributes"].update({
            "numericalChars": sum(c.isdigit() for c in local_part),
            "alphabeticalChars": sum(c.isalpha() for c in local_part),
            "unicodeSymbols": sum(not c.isalnum() for c in local_part),
            "free": self._is_free_email(domain),
            "role": self._is_role_account(local_part),
            "disposable": self._is_disposable_domain(domain)
        })

        return result

    def _validate_format(self, email: str) -> bool:
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, email))

    def _check_mx_records(self, domain: str) -> List[str]:
        try:
            mx_records = dns.resolver.resolve(domain, 'MX')
            return [str(mx.exchange).rstrip('.') for mx in mx_records]
        except:
            return []

    def _verify_smtp(self, email: str, domain: str, mx_records: List[str]) -> Dict:
        result = {
            "exists": False,
            "is_catchall": False,
            "smtp_response": None,
            "smtp_code": None,
            "smtp_provider": None
        }

        if not mx_records:
            return result

        # Create a random non-existent email for catch-all testing
        random_email = f"nonexistent_{hash(email)}@{domain}"

        for mx_record in mx_records:
            try:
                # Connect to SMTP server
                server = smtplib.SMTP(timeout=10)
                server.set_debuglevel(0)
                
                # Connect to the MX server
                server.connect(mx_record, 25)
                
                # Say HELO to server
                server.helo('example.com')
                
                # MAIL FROM - Using dummy sender
                server.mail('noreply@example.com')
                
                # First test the random email for catch-all
                code_random, _ = server.rcpt(str(random_email))
                
                # Then test the real email
                code, message = server.rcpt(str(email))
                
                # Store response
                result["smtp_code"] = code
                result["smtp_response"] = str(message, 'utf-8') if isinstance(message, bytes) else str(message)
                
                # Interpret SMTP code
                if code == 250:  # Success
                    result["exists"] = True
                    if code_random == 250:  # If random email also accepted, it's catch-all
                        result["is_catchall"] = True
                    result["smtp_response"] = "Email exists"
                elif code == 550:  # Mailbox unavailable
                    result["smtp_response"] = "Mailbox unavailable"
                elif code == 551:  # User not local
                    result["smtp_response"] = "User not local"
                elif code == 552:  # Mailbox full
                    result["exists"] = True
                    result["smtp_response"] = "Mailbox full"
                elif code == 553:  # Invalid mailbox
                    result["smtp_response"] = "Invalid mailbox"
                elif code == 450:  # Mailbox busy
                    result["smtp_response"] = "Mailbox busy"
                elif code == 421:  # Service not available
                    result["smtp_response"] = "Service not available"
                
                # Identify SMTP provider
                result["smtp_provider"] = self._identify_smtp_provider(mx_record)
                
                # Close connection
                server.quit()
                
                # If we got a definitive answer (250 or permanent error), stop trying
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

    def _identify_smtp_provider(self, mx_record: str) -> str:
        """Identify email provider based on MX record."""
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
        free_domains = {'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'}
        return domain.lower() in free_domains

    def _is_role_account(self, local_part: str) -> bool:
        role_accounts = {'admin', 'info', 'support', 'sales', 'contact'}
        return local_part.lower() in role_accounts

    def _is_disposable_domain(self, domain: str) -> bool:
        # Add list of known disposable email domains
        disposable_domains = {'tempmail.com', 'temp-mail.org'}
        return domain.lower() in disposable_domains

    def _calculate_risk_level(self, score: int) -> str:
        if score >= 90:
            return "low"
        elif score >= 70:
            return "medium"
        return "high"

def main():

    try:
        input_emails = json.loads(sys.argv[1])
    
        validator = EmailValidator()
        results = [validator.validate_email(email) for email in input_emails]
        print(json.dumps(results))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()