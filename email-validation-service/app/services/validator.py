import re
import dns.asyncresolver
import aiosmtplib
import socket
from typing import List, Dict, Optional, Tuple
from email.utils import parseaddr
import asyncio
import logging
from datetime import datetime
from ..models.validation import (
    EmailValidationResult,
    ValidationStatus,
    EmailAttributes,
    MailServerInfo,
    ValidationDetails,
    UnknownReason,
    UndeliverableReason,
    RiskyReason,
    BlacklistInfo
)
from ..config import settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class EmailValidator:
    def __init__(self):
        # Common free email providers
        self.free_email_providers = {
            'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
            'icloud.com', 'protonmail.com', 'zoho.com', 'yandex.com'
        }
        
        # Common role-based email prefixes
        self.role_prefixes = {
            'admin', 'administrator', 'support', 'help', 'info', 'contact',
            'sales', 'marketing', 'billing', 'accounts', 'abuse', 'postmaster'
        }
        
        # Common disposable email domains
        self.disposable_domains = {
            'tempmail.com', 'throwawaymail.com', 'mailinator.com',
            'tempmail.net', 'disposablemail.com'
        }

        # SMTP provider patterns
        self.smtp_providers = {
            'google': ['google', 'gmail'],
            'microsoft': ['outlook', 'hotmail', 'microsoft'],
            'yahoo': ['yahoo'],
            'aol': ['aol'],
            'proton': ['proton'],
            'zoho': ['zoho'],
            'yandex': ['yandex']
        }

        # Connection pool for SMTP
        self._smtp_pool = {}
        self._smtp_semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_VALIDATIONS)

        # Common blacklist servers
        self.blacklist_servers = {
            'domain': [
                'zen.spamhaus.org',        # Spamhaus
                'bl.spamcop.net',          # SpamCop
            ],
            'ip': [
                'sbl.spamhaus.org',        # Spamhaus SBL
                'xbl.spamhaus.org',        # Spamhaus XBL
            ]
        }

        # Cache for blacklist results
        self._blacklist_cache = {}
        self._blacklist_cache_ttl = 3600  # 1 hour cache TTL

        # Reputation factors
        self.reputation_factors = {
            'spamhaus': -40,       # Major impact
            'spamcop': -30,        # High impact
        }

    async def validate_email(self, email: str, check_mx: bool = True, 
                           check_smtp: bool = True, check_disposable: bool = True,
                           check_catch_all: bool = True, check_blacklist: bool = True) -> EmailValidationResult:
        """
        Main method to validate a single email address using step-by-step validation
        """
        logger.info(f"Starting validation for: {email}")

        # Initialize result
        result = EmailValidationResult(
            email=email,
            is_valid=False,
            status=ValidationStatus.UNKNOWN,
            details=ValidationDetails(
                general={"domain": "", "reason": ""},
                sub_status=UnknownReason.NO_CONNECT
            )
        )

        try:
            # STEP 1: Syntax Validation (Always performed)
            logger.info(f"Step 1: Performing syntax validation for {email}")
            
            if not self._validate_format(email):
                result.status = ValidationStatus.UNDELIVERABLE
                result.details.general["reason"] = "Invalid email format"
                result.details.sub_status = UndeliverableReason.INVALID_EMAIL
                logger.info(f"Validation stopped at Step 1: Invalid format for {email}")
                return result

            # Parse email components
            try:
                local_part, domain = email.split('@')
                result.details.general["domain"] = domain
            except ValueError:
                result.status = ValidationStatus.UNDELIVERABLE
                result.details.general["reason"] = "Invalid email format: Missing @ symbol"
                result.details.sub_status = UndeliverableReason.INVALID_EMAIL
                logger.info(f"Validation stopped at Step 1: Missing @ symbol in {email}")
                return result

            # STEP 2: Domain and MX Record Validation (Optional)
            mx_records = []
            if check_mx:
                logger.info(f"Step 2: Checking MX records for domain {domain}")
                try:
                    mx_records = await asyncio.wait_for(
                        self._get_mx_records(domain), 
                        timeout=settings.DNS_TIMEOUT
                    )
                except asyncio.TimeoutError:
                    result.status = ValidationStatus.UNKNOWN
                    result.details.general["reason"] = "DNS lookup timeout"
                    result.details.sub_status = UnknownReason.TIMEOUT
                    logger.warning(f"Validation stopped at Step 2: DNS timeout for {domain}")
                    return result

                if not mx_records:
                    result.status = ValidationStatus.UNDELIVERABLE
                    result.details.general["reason"] = "No MX records found"
                    result.details.sub_status = UndeliverableReason.INVALID_DOMAIN
                    logger.info(f"Validation stopped at Step 2: No MX records for {domain}")
                    return result

            # STEP 3: Email Attributes Check (Optional)
            if check_disposable:
                logger.info(f"Step 3: Checking email attributes for {email}")
                attributes = self._check_email_attributes(local_part, domain)
                if attributes.disposable:
                    result.status = ValidationStatus.UNDELIVERABLE
                    result.details.general["reason"] = "Disposable email address"
                    result.details.sub_status = UndeliverableReason.DISPOSABLE_EMAIL
                    logger.info(f"Validation stopped at Step 3: Disposable email {email}")
                    return result

            # STEP 4: Blacklist Check (Optional)
            if check_blacklist:
                logger.info(f"Step 4: Performing blacklist checks for {domain}")
                ip_addresses = await self._get_ip_addresses(domain)
                blacklist_result = await self._check_blacklists(domain, ip_addresses)
                result.details.blacklist = blacklist_result
                
                if blacklist_result.is_blacklisted:
                    result.status = ValidationStatus.UNDELIVERABLE
                    result.details.general["reason"] = f"Domain blacklisted: {', '.join(blacklist_result.blacklist_reasons)}"
                    result.details.sub_status = UndeliverableReason.BLACKLISTED
                    logger.info(f"Validation stopped at Step 4: Blacklisted domain {domain}")
                    return result

            # STEP 5: SMTP Verification (Optional)
            if check_smtp and mx_records:
                logger.info(f"Step 5: Performing SMTP verification for {email}")
                async with self._smtp_semaphore:
                    try:
                        smtp_result = await asyncio.wait_for(
                            self._verify_smtp(email, domain, mx_records[0]), 
                            timeout=settings.SMTP_TIMEOUT
                        )
                    except asyncio.TimeoutError:
                        result.status = ValidationStatus.UNKNOWN
                        result.details.general["reason"] = "SMTP validation timeout"
                        result.details.sub_status = UnknownReason.TIMEOUT
                        logger.warning(f"Validation stopped at Step 5: SMTP timeout for {email}")
                        return result

                if not smtp_result["exists"]:
                    if smtp_result.get("sub_status") in [UnknownReason.TIMEOUT, UnknownReason.NO_CONNECT, UnknownReason.UNAVAILABLE_SMTP]:
                        result.status = ValidationStatus.UNKNOWN
                    else:
                        result.status = ValidationStatus.UNDELIVERABLE
                    result.details.general["reason"] = smtp_result.get("reason", "Email does not exist")
                    result.details.sub_status = smtp_result.get("sub_status", UndeliverableReason.REJECTED_EMAIL)
                    logger.info(f"Validation stopped at Step 5: SMTP verification failed for {email}")
                    return result

            # STEP 6: Catch-All Check (Optional)
            if check_catch_all and mx_records:
                logger.info(f"Step 6: Checking if {domain} is catch-all")
                is_catch_all = await self._check_catch_all(domain, mx_records[0])
                result.details.attributes.catch_all = is_catch_all
                
                if is_catch_all:
                    result.status = ValidationStatus.RISKY
                    result.details.general["reason"] = "Catch-all domain"
                    result.details.sub_status = RiskyReason.LOW_DELIVERABILITY
                    result.risk_level = "high"
                else:
                    result.status = ValidationStatus.DELIVERABLE
                    result.details.general["reason"] = "All validations passed"
                    result.details.sub_status = None
                    result.risk_level = self._calculate_risk_level(result)
            else:
                # If catch-all check is not performed, mark as deliverable
                result.status = ValidationStatus.DELIVERABLE
                result.details.general["reason"] = "Basic validations passed"
                result.details.sub_status = None
                result.risk_level = self._calculate_risk_level(result)

            # Final result
            result.is_valid = True
            result.deliverability_score = self._calculate_deliverability_score(result)
            
            logger.info(f"Validation completed successfully for {email}")
            return result

        except Exception as e:
            logger.error(f"Unexpected error validating {email}: {str(e)}")
            result.status = ValidationStatus.UNKNOWN
            result.details.general["reason"] = f"Validation error: {str(e)}"
            result.details.sub_status = UnknownReason.UNEXPECTED_ERROR
            return result

    def _identify_smtp_provider(self, mx_record: str) -> Optional[str]:
        """
        Identify SMTP provider from MX record
        """
        mx_lower = mx_record.lower()
        for provider, patterns in self.smtp_providers.items():
            if any(pattern in mx_lower for pattern in patterns):
                return provider
        return None

    async def _get_mx_records(self, domain: str) -> List[str]:
        """
        Get MX records for a domain using async DNS resolver
        """
        try:
            resolver = dns.asyncresolver.Resolver()
            mx_records = await resolver.resolve(domain, 'MX')
            return [str(mx.exchange).rstrip('.') for mx in mx_records]
        except:
            return []

    async def _get_implicit_mx(self, domain: str) -> Optional[str]:
        """
        Get implicit MX record (if domain itself is an MX record)
        """
        try:
            resolver = dns.asyncresolver.Resolver()
            mx_records = await resolver.resolve(domain, 'MX')
            if mx_records:
                return str(mx_records[0].exchange).rstrip('.')
        except:
            pass
        return None

    async def _check_catch_all(self, domain: str, mx_record: str) -> bool:
        """
        Check if a domain is a catch-all domain by attempting to verify
        a non-existent email address
        """
        # Generate a random non-existent email with timestamp to ensure uniqueness
        random_email = f"nonexistent{datetime.utcnow().timestamp()}@{domain}"
        smtp = None
        
        try:
            logger.info(f"Checking catch-all for domain: {domain}")
            
            # For Gmail and other major providers, we need to use their specific SMTP servers
            if domain.lower() in self.free_email_providers:
                if domain.lower() == 'gmail.com':
                    mx_record = 'gmail-smtp-in.l.google.com'
                elif domain.lower() in ['outlook.com', 'hotmail.com']:
                    mx_record = 'outlook.office365.com'
                elif domain.lower() == 'yahoo.com':
                    mx_record = 'mta5.am0.yahoodns.net'
                elif domain.lower() == 'aol.com':
                    mx_record = 'mx.aol.com'
                logger.info(f"Using specific SMTP server for catch-all check: {mx_record}")

            # Create new SMTP connection
            smtp = aiosmtplib.SMTP(
                hostname=mx_record,
                port=25,  # Use port 25 which we confirmed works
                timeout=settings.SMTP_TIMEOUT,
                use_tls=False,  # No TLS on port 25
                tls_context=None
            )
            
            try:
                logger.info(f"Connecting to SMTP server for catch-all check: {mx_record}")
                await asyncio.wait_for(smtp.connect(), timeout=settings.SMTP_TIMEOUT)
                await asyncio.wait_for(smtp.helo('test.com'), timeout=settings.SMTP_TIMEOUT)
            except (asyncio.TimeoutError, Exception) as e:
                logger.warning(f"Catch-all check connection failed for {mx_record}: {str(e)}")
                return False

            try:
                logger.info(f"Sending RCPT command for catch-all check: {random_email}")
                await asyncio.wait_for(smtp.mail('test@test.com'), timeout=settings.SMTP_TIMEOUT)
                code, message = await asyncio.wait_for(smtp.rcpt(random_email), timeout=settings.SMTP_TIMEOUT)
                logger.info(f"Catch-all check response for {domain}: {code} - {message}")
                
                # If we get a 250 (OK) response for a non-existent email,
                # the domain is likely a catch-all
                return code == 250
                
            except (asyncio.TimeoutError, Exception) as e:
                logger.warning(f"Catch-all check command failed for {domain}: {str(e)}")
                return False
                
        except Exception as e:
            logger.error(f"Catch-all check error for {domain}: {str(e)}")
            return False
        finally:
            # Always try to close the connection
            if smtp and smtp.is_connected:
                try:
                    await asyncio.wait_for(smtp.quit(), timeout=2.0)
                except:
                    pass

    def _validate_format(self, email: str) -> bool:
        """
        Basic email format validation
        """
        try:
            local_part, domain = email.split('@')
            if not local_part or not domain:
                return False
            if len(local_part) > 64 or len(domain) > 255:
                return False
            if not re.match(r'^[a-zA-Z0-9._%+-]+$', local_part):
                return False
            if not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$', domain):
                return False
            return True
        except:
            return False

    def _check_email_attributes(self, local_part: str, domain: str) -> EmailAttributes:
        """
        Check various email attributes
        """
        return EmailAttributes(
            free_email=domain.lower() in self.free_email_providers,
            role_account=local_part.lower().split('+')[0] in self.role_prefixes,
            disposable=domain.lower() in self.disposable_domains,
            has_plus_tag='+' in local_part,
            no_reply=local_part.lower().startswith(('noreply', 'no-reply'))
        )

    async def _verify_smtp(self, email: str, domain: str, mx_record: str) -> Dict:
        """
        Verify email existence using SMTP with connection pooling
        """
        smtp = None
        try:
            logger.info(f"Connecting to SMTP server for {email}: {mx_record}")
            # For Gmail and other major providers, we need to use their specific SMTP servers
            if domain.lower() in self.free_email_providers:
                if domain.lower() == 'gmail.com':
                    mx_record = 'gmail-smtp-in.l.google.com'
                elif domain.lower() in ['outlook.com', 'hotmail.com']:
                    mx_record = 'outlook.office365.com'
                elif domain.lower() == 'yahoo.com':
                    mx_record = 'mta5.am0.yahoodns.net'
                elif domain.lower() == 'aol.com':
                    mx_record = 'mx.aol.com'
                logger.info(f"Using specific SMTP server for {domain}: {mx_record}")

            # Create new SMTP connection for each verification
            smtp = aiosmtplib.SMTP(
                hostname=mx_record,
                port=25,  # Use port 25 which we confirmed works
                timeout=settings.SMTP_TIMEOUT,
                use_tls=False,  # No TLS on port 25
                tls_context=None
            )
            
            try:
                logger.info(f"Connecting to SMTP server: {mx_record}")
                await asyncio.wait_for(smtp.connect(), timeout=settings.SMTP_TIMEOUT)
                await asyncio.wait_for(smtp.helo('test.com'), timeout=settings.SMTP_TIMEOUT)
            except asyncio.TimeoutError:
                return {"exists": False, "reason": "Connection timeout", "sub_status": UnknownReason.TIMEOUT}
            except aiosmtplib.SMTPResponseException as e:
                logger.warning(f"Connection failed with SMTP code {e.code}: {e.message}")
                if e.code == 554:  # No SMTP service
                    return {"exists": False, "reason": e.message, "sub_status": UndeliverableReason.INVALID_DOMAIN}
                else:
                    return {"exists": False, "reason": e.message, "sub_status": UndeliverableReason.INVALID_SMTP}
            except Exception as e:
                error_msg = str(e).lower()
                logger.warning(f"Connection failed: {str(e)}")
                if "certificate" in error_msg or "ssl" in error_msg:
                    return {"exists": False, "reason": str(e), "sub_status": UndeliverableReason.INVALID_SMTP}
                elif "dns" in error_msg:
                    return {"exists": False, "reason": str(e), "sub_status": UndeliverableReason.INVALID_DOMAIN}
                else:
                    return {"exists": False, "reason": str(e), "sub_status": UndeliverableReason.INVALID_SMTP}

            try:
                logger.info(f"Sending RCPT command for: {email}")
                await asyncio.wait_for(smtp.mail('test@test.com'), timeout=settings.SMTP_TIMEOUT)
                code, message = await asyncio.wait_for(smtp.rcpt(email), timeout=settings.SMTP_TIMEOUT)
                logger.info(f"SMTP response for {email}: {code} - {message}")
            except asyncio.TimeoutError:
                return {"exists": False, "reason": "SMTP command timeout", "sub_status": UnknownReason.TIMEOUT}
            except aiosmtplib.SMTPResponseException as e:
                logger.warning(f"SMTP command failed with code {e.code}: {e.message}")
                
                # Handle SMTP response codes properly
                if e.code == 450:  # Requested mail action not taken: mailbox unavailable
                    return {"exists": False, "reason": e.message, "sub_status": UnknownReason.UNAVAILABLE_SMTP}
                elif e.code == 451:  # Temporary local error
                    return {"exists": False, "reason": e.message, "sub_status": UndeliverableReason.INVALID_SMTP}
                elif e.code == 550:  # Mailbox unavailable
                    if "spamhaus" in e.message.lower() or "blocked" in e.message.lower():
                        return {"exists": False, "reason": e.message, "sub_status": UndeliverableReason.INVALID_SMTP}
                    else:
                        return {"exists": False, "reason": e.message, "sub_status": UndeliverableReason.REJECTED_EMAIL}
                elif code == 451:  # Temporary local error
                    return {"exists": False, "reason": message, "sub_status": UndeliverableReason.INVALID_SMTP}
                else:
                    return {"exists": False, "reason": message, "sub_status": UndeliverableReason.INVALID_SMTP}
            except Exception as e:
                logger.warning(f"SMTP command failed: {str(e)}")
                return {"exists": False, "reason": str(e), "sub_status": UndeliverableReason.INVALID_SMTP}
            
            # Handle successful SMTP response codes
            if code == 250:  # OK
                return {"exists": True}
            elif code == 450:  # Requested mail action not taken: mailbox unavailable
                return {"exists": False, "reason": message, "sub_status": UnknownReason.UNAVAILABLE_SMTP}
            elif code == 550:  # Mailbox unavailable
                return {"exists": False, "reason": message, "sub_status": UndeliverableReason.REJECTED_EMAIL}
            elif code == 553:  # Invalid mailbox
                return {"exists": False, "reason": message, "sub_status": UndeliverableReason.REJECTED_EMAIL}
            elif code == 552:  # Mailbox full
                return {"exists": True, "reason": message}
            elif code == 554:  # Transaction failed
                if "dns" in message.lower():
                    return {"exists": False, "reason": message, "sub_status": UndeliverableReason.INVALID_DOMAIN}
                else:
                    return {"exists": False, "reason": message, "sub_status": UndeliverableReason.INVALID_SMTP}
            elif code == 451:  # Temporary local error
                return {"exists": False, "reason": message, "sub_status": UndeliverableReason.INVALID_SMTP}
            else:
                return {"exists": False, "reason": message, "sub_status": UndeliverableReason.INVALID_SMTP}

        except Exception as e:
            logger.error(f"SMTP error for {email}: {str(e)}")
            error_str = str(e)
            if "certificate" in error_str.lower() or "ssl" in error_str.lower():
                return {"exists": False, "reason": error_str, "sub_status": UndeliverableReason.INVALID_SMTP}
            elif "dns" in error_str.lower():
                return {"exists": False, "reason": error_str, "sub_status": UndeliverableReason.INVALID_DOMAIN}
            else:
                return {"exists": False, "reason": error_str, "sub_status": UndeliverableReason.INVALID_SMTP}
        finally:
            if smtp and smtp.is_connected:
                try:
                    await asyncio.wait_for(smtp.quit(), timeout=2.0)
                except:
                    pass

    def _calculate_risk_level(self, result: EmailValidationResult) -> str:
        """
        Calculate risk level based on various factors
        """
        score = self._calculate_deliverability_score(result)
        if score >= 80:
            return "low"
        elif score >= 60:
            return "medium"
        else:
            return "high"

    def _calculate_deliverability_score(self, result: EmailValidationResult) -> int:
        """
        Calculate deliverability score based on various factors
        """
        score = 100

        # Major deductions
        if result.details.attributes.disposable:
            score -= 40  # Increased deduction for disposable emails
        if result.details.attributes.catch_all:
            score -= 50  # Significant deduction for catch-all domains

        # Medium deductions
        if result.details.attributes.role_account:
            score -= 20  # Increased deduction for role accounts

        # Minor deductions
        if result.details.attributes.free_email:
            score -= 10  # Slight increase in deduction
        if result.details.attributes.has_plus_tag:
            score -= 10  # Increased deduction for plus tags
        if result.details.attributes.no_reply:
            score -= 15  # New deduction for no-reply addresses

        # Additional deductions based on status
        if result.status == ValidationStatus.RISKY:
            score -= 30
        elif result.status == ValidationStatus.UNKNOWN:
            score -= 40
        elif result.status == ValidationStatus.UNDELIVERABLE:
            score = 0  # Undeliverable emails get a zero score

        return max(0, min(100, score))

    def _create_invalid_result(self, email: str, reason: str) -> EmailValidationResult:
        """
        Create an invalid result with the given reason
        """
        return EmailValidationResult(
            email=email,
            is_valid=False,
            status=ValidationStatus.UNDELIVERABLE,
            details=ValidationDetails(
                general={"domain": "", "reason": reason},
                sub_status=UndeliverableReason.INVALID_EMAIL
            )
        )

    async def _check_blacklists(self, domain: str, ip_addresses: List[str] = None) -> BlacklistInfo:
        """
        Check domain and IP addresses against blacklists
        """
        result = BlacklistInfo()
        result.last_checked = datetime.utcnow().isoformat()
        
        try:
            resolver = dns.asyncresolver.Resolver()
            resolver.timeout = 2
            resolver.lifetime = 2

            # Check domain against blacklists
            domain_reversed = '.'.join(reversed(domain.split('.')))
            
            # Create tasks for parallel execution
            tasks = []
            
            # Domain blacklist checks
            for bl in self.blacklist_servers['domain']:
                tasks.append(self._check_single_blacklist(resolver, domain_reversed, bl, is_ip=False))
            
            # IP blacklist checks
            if ip_addresses:
                for ip in ip_addresses:
                    ip_reversed = '.'.join(reversed(ip.split('.')))
                    for bl in self.blacklist_servers['ip']:
                        tasks.append(self._check_single_blacklist(resolver, ip_reversed, bl, is_ip=True, ip=ip))

            # Execute all checks in parallel
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results
            for check_result in results:
                if isinstance(check_result, Exception):
                    continue
                if check_result.get('is_blacklisted'):
                    result.is_blacklisted = True
                    result.blacklists_found.append(check_result['blacklist'])
                    result.blacklist_reasons.append(check_result['reason'])

            # Calculate reputation score
            result.reputation_score = self._calculate_reputation_score(result.blacklists_found)
            return result

        except Exception as e:
            logger.error(f"Error in blacklist check: {str(e)}")
            return result

    async def _check_single_blacklist(self, resolver: dns.asyncresolver.Resolver, 
                                    reversed_value: str, 
                                    blacklist: str, 
                                    is_ip: bool = False,
                                    ip: str = None) -> Dict:
        """
        Check a single blacklist entry
        """
        try:
            query = f"{reversed_value}.{blacklist}"
            await resolver.resolve(query, 'A')
            
            # If we get here, it's blacklisted
            reason = f"{blacklist}: Listed"
            try:
                txt = await resolver.resolve(query, 'TXT')
                reason = str(txt[0]).strip('"')
            except Exception:
                pass
                
            return {
                'is_blacklisted': True,
                'blacklist': f"{blacklist} (IP: {ip})" if is_ip else blacklist,
                'reason': reason
            }
            
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
            return {'is_blacklisted': False}
        except Exception as e:
            logger.warning(f"Error checking {blacklist}: {str(e)}")
            return {'is_blacklisted': False}

    def _calculate_reputation_score(self, blacklists_found: List[str]) -> int:
        """
        Calculate reputation score based on which blacklists flagged the domain/IP
        """
        score = 100
        for bl in blacklists_found:
            bl_lower = bl.lower()
            for factor, deduction in self.reputation_factors.items():
                if factor in bl_lower:
                    score += deduction
                    break
        return max(0, min(100, score))

    async def _get_ip_addresses(self, domain: str) -> List[str]:
        """
        Get IP addresses for a domain including its mail servers
        """
        ip_addresses = set()
        try:
            resolver = dns.asyncresolver.Resolver()
            
            # Get IPs from A records
            try:
                a_records = await resolver.resolve(domain, 'A')
                for record in a_records:
                    ip_addresses.add(str(record))
            except Exception:
                pass

            # Get IPs from MX records
            try:
                mx_records = await resolver.resolve(domain, 'MX')
                for mx in mx_records:
                    mx_domain = str(mx.exchange).rstrip('.')
                    try:
                        mx_ips = await resolver.resolve(mx_domain, 'A')
                        for ip in mx_ips:
                            ip_addresses.add(str(ip))
                    except Exception:
                        continue
            except Exception:
                pass

        except Exception as e:
            logger.error(f"Error getting IP addresses for {domain}: {str(e)}")
        
        return list(ip_addresses) 