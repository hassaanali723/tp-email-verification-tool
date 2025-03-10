import dns.asyncresolver
import re
import logging
from typing import Dict, List, Optional, Tuple
from ..models.validation import (
    EmailValidationResult,
    ValidationStatus,
    EmailAttributes,
    MailServerInfo,
    ValidationDetails,
    UndeliverableReason,
    RiskyReason,
    BlacklistInfo
)
from ..config import settings

logger = logging.getLogger(__name__)

class DNSValidator:
    def __init__(self):
        self.spf_record_weight = 0.2
        self.mx_record_weight = 0.4
        self.a_record_weight = 0.2
        self.additional_checks_weight = 0.2
        
        # Initialize DNS resolver with timeout
        self.resolver = dns.asyncresolver.Resolver()
        self.resolver.timeout = settings.DNS_TIMEOUT
        self.resolver.lifetime = settings.DNS_TIMEOUT

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
        
        # Common disposable email domains (expanded list)
        self.disposable_domains = {
            'mailinator.com', 'mailinator.net', 'mailinator.org', 'mailinator.info',
            'guerrillamail.com', 'guerrillamail.info', 'guerrillamail.biz',
            'guerrillamail.de', 'guerrillamail.net', 'guerrillamail.org',
            'guerrillamailblock.com', 'grr.la',
            'tempmail.com', 'throwawaymail.com', 'tempmail.net',
            'disposablemail.com', 'yopmail.com', 'maildrop.cc',
            'temp-mail.org', 'fakeinbox.com', '10minutemail.com',
            'trashmail.com', 'sharklasers.com', 'spam4.me'
        }

        # Example/Test domains that should be marked as risky
        self.example_domains = {
            'example.com', 'example.net', 'example.org', 'test.com', 'test.net',
            'test.org', 'domain.com', 'domain.net', 'domain.org'
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
        
        # Providers that commonly use catch-all configurations
        self.common_catchall_providers = {
            'google': ['aspmx.l.google.com', 'alt1.aspmx.l.google.com', 'alt2.aspmx.l.google.com'],
            'microsoft': ['mail.protection.outlook.com'],
            'zoho': ['mx.zoho.com', 'mx2.zoho.com'],
            'proton': ['mail.protonmail.ch']
        }
        
    async def validate(self, email: str) -> EmailValidationResult:
        """
        Perform comprehensive DNS-based validation
        Returns EmailValidationResult in the same format as SMTP validation
        """
        try:
            # Initialize result with same structure as SMTP validation
            result = EmailValidationResult(
                email=email,
                is_valid=False,
                status=ValidationStatus.UNKNOWN,
                details=ValidationDetails(
                    general={"domain": "", "reason": ""},
                    sub_status=None
                )
            )

            # Parse email components
            try:
                local_part, domain = email.split('@')
                result.details.general["domain"] = domain
            except ValueError:
                result.status = ValidationStatus.UNDELIVERABLE
                result.details.general["reason"] = "Invalid email format"
                result.details.sub_status = UndeliverableReason.INVALID_EMAIL
                return result
            
            # Check for example/test domains first
            if domain.lower() in self.example_domains:
                result.status = ValidationStatus.RISKY
                result.is_valid = True  # Still valid but risky
                result.details.general["reason"] = "Example/Test domain"
                result.details.sub_status = RiskyReason.LOW_DELIVERABILITY
                result.risk_level = "high"
                result.deliverability_score = 40  # Lower score for example domains
                return result

            # Check for disposable domains early
            if domain.lower() in self.disposable_domains:
                result.status = ValidationStatus.UNDELIVERABLE
                result.is_valid = False
                result.details.general["reason"] = "Disposable email domain"
                result.details.sub_status = UndeliverableReason.DISPOSABLE_EMAIL
                result.risk_level = "high"
                result.deliverability_score = 0
                return result
            
            # Perform DNS checks
            mx_records = await self._get_mx_records(domain)
            spf_record = await self._get_spf_record(domain)
            a_records = await self._get_a_records(domain)
            additional_checks = await self._perform_additional_checks(domain, mx_records)
            
            # Update mail server info
            if mx_records:
                result.details.mail_server.mx_record = mx_records[0][0]
                result.details.mail_server.smtp_provider = self._identify_smtp_provider(str(mx_records[0][0]))
            
            # Calculate confidence score
            confidence_score = self._calculate_confidence_score(
                bool(mx_records),
                bool(a_records),
                bool(spf_record),
                additional_checks
            )
            
            # Determine if domain is likely a catch-all
            is_catch_all = self._is_likely_catch_all(mx_records, result.details.mail_server.smtp_provider)
            result.details.attributes.catch_all = is_catch_all
            
            # Set validation status based on confidence score
            if not mx_records:
                result.status = ValidationStatus.UNDELIVERABLE
                result.details.general["reason"] = "No MX records found"
                result.details.sub_status = UndeliverableReason.INVALID_DOMAIN
            elif confidence_score >= 0.8:
                result.status = ValidationStatus.DELIVERABLE
                result.is_valid = True
                result.details.general["reason"] = "High confidence in domain validity"
                result.risk_level = "low"
            elif confidence_score >= 0.5:
                result.status = ValidationStatus.RISKY
                result.is_valid = True
                result.details.general["reason"] = "Medium confidence in domain validity"
                result.details.sub_status = RiskyReason.LOW_DELIVERABILITY
                result.risk_level = "medium"
            else:
                result.status = ValidationStatus.UNDELIVERABLE
                result.details.general["reason"] = "Low confidence in domain validity"
                result.details.sub_status = UndeliverableReason.INVALID_DOMAIN
                result.risk_level = "high"
            
            # Calculate base deliverability score (0-100)
            base_score = int(confidence_score * 100)
            
            # Cap DNS validation scores at 80%
            base_score = min(base_score, 80)
            
            # If catch-all domain, reduce score to 50 and mark as risky
            if is_catch_all:
                base_score = min(base_score, 50)
                result.status = ValidationStatus.RISKY
                result.details.general["reason"] = "Catch-all domain detected via DNS"
                result.details.sub_status = RiskyReason.LOW_DELIVERABILITY
                result.risk_level = "medium"
            
            # Set final deliverability score
            result.deliverability_score = base_score
            
            # Set email attributes
            result.details.attributes = EmailAttributes(
                free_email=self._is_free_email(domain),
                role_account=self._is_role_account(local_part),
                disposable=self._is_disposable_domain(domain),
                catch_all=is_catch_all,
                has_plus_tag='+' in local_part,
                no_reply=local_part.lower().startswith(('noreply', 'no-reply'))
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Error during DNS validation for email {email}: {str(e)}")
            return EmailValidationResult(
                email=email,
                is_valid=False,
                status=ValidationStatus.UNKNOWN,
                details=ValidationDetails(
                    general={
                        "domain": domain if 'domain' in locals() else "",
                        "reason": f"DNS validation error: {str(e)}"
                    },
                    sub_status=UndeliverableReason.INVALID_DOMAIN
                )
            )

    async def _get_mx_records(self, domain: str) -> List[Tuple[str, int]]:
        """Get MX records for domain"""
        try:
            mx_records = await self.resolver.resolve(domain, 'MX')
            return sorted(
                [(str(rdata.exchange), rdata.preference) for rdata in mx_records],
                key=lambda x: x[1]  # Sort by MX preference
            )
        except Exception as e:
            logger.warning(f"Failed to get MX records for {domain}: {str(e)}")
            return []
    
    async def _get_a_records(self, domain: str) -> List[str]:
        """Get A records for domain"""
        try:
            a_records = await self.resolver.resolve(domain, 'A')
            return [str(rdata) for rdata in a_records]
        except Exception as e:
            logger.warning(f"Failed to get A records for {domain}: {str(e)}")
            return []
    
    async def _get_spf_record(self, domain: str) -> Optional[str]:
        """Get SPF record for domain"""
        try:
            txt_records = await self.resolver.resolve(domain, 'TXT')
            for record in txt_records:
                txt = str(record.strings[0], 'utf-8')
                if txt.startswith('v=spf1'):
                    return txt
            return None
        except Exception as e:
            logger.warning(f"Failed to get SPF record for {domain}: {str(e)}")
            return None
    
    async def _perform_additional_checks(self, domain: str, mx_records: List[Tuple[str, int]]) -> Dict:
        """Perform additional DNS checks for better confidence"""
        results = {
            "has_valid_mx_syntax": False,
            "mx_has_a_record": False,
            "domain_has_backup_mx": len(mx_records) > 1,
            "uses_major_provider": False
        }
        
        # Check MX syntax
        if mx_records:
            results["has_valid_mx_syntax"] = all(
                self._is_valid_hostname(mx[0]) for mx in mx_records
            )
            
            # Check if primary MX has A record
            try:
                primary_mx = mx_records[0][0]
                a_records = await self._get_a_records(str(primary_mx))
                results["mx_has_a_record"] = bool(a_records)
            except Exception:
                pass
            
            # Check if using major provider
            major_providers = ['google', 'outlook', 'microsoft', 'amazon', 'protonmail']
            results["uses_major_provider"] = any(
                provider in str(mx_records[0][0]).lower() 
                for provider in major_providers
            )
        
        return results
    
    def _is_valid_hostname(self, hostname: str) -> bool:
        """Check if hostname follows valid syntax"""
        if len(hostname) > 255:
            return False
        hostname = hostname.rstrip(".")
        allowed = re.compile(r"(?!-)[A-Z\d-]{1,63}(?<!-)$", re.IGNORECASE)
        return all(allowed.match(x) for x in hostname.split("."))
    
    def _calculate_confidence_score(
        self,
        has_mx: bool,
        has_a: bool,
        has_spf: bool,
        additional_checks: Dict
    ) -> float:
        """Calculate confidence score based on all DNS checks"""
        score = 0.0
        
        # MX record score (40%)
        if has_mx:
            score += self.mx_record_weight
        
        # A record score (20%)
        if has_a:
            score += self.a_record_weight
        
        # SPF record score (20%)
        if has_spf:
            score += self.spf_record_weight
        
        # Additional checks score (20%)
        additional_score = 0
        checks_count = len(additional_checks)
        for check_result in additional_checks.values():
            if check_result:
                additional_score += 1
        if checks_count > 0:
            score += (additional_score / checks_count) * self.additional_checks_weight
        
        return round(score, 2)

    def _identify_smtp_provider(self, mx_record: str) -> Optional[str]:
        """Identify SMTP provider from MX record"""
        mx_lower = mx_record.lower()
        for provider, patterns in self.smtp_providers.items():
            if any(pattern in mx_lower for pattern in patterns):
                return provider
        return None

    def _is_free_email(self, domain: str) -> bool:
        """Check if domain is a free email provider"""
        return domain.lower() in self.free_email_providers

    def _is_role_account(self, local_part: str) -> bool:
        """Check if email is a role account"""
        return local_part.lower().split('+')[0] in self.role_prefixes

    def _is_disposable_domain(self, domain: str) -> bool:
        """Check if domain is a disposable email provider"""
        return domain.lower() in self.disposable_domains
        
    def _is_likely_catch_all(self, mx_records: List[Tuple[str, int]], provider: Optional[str]) -> bool:
        """
        Determine if a domain is likely to be a catch-all based on DNS information
        
        This is a heuristic approach since we can't directly test catch-all via DNS.
        We use the following signals:
        1. Domain uses Google Workspace, Microsoft 365, or other major providers that often have catch-all enabled
        2. Domain has specific MX record patterns associated with catch-all configurations
        """
        if not mx_records:
            return False
            
        # Check if using a provider that commonly has catch-all enabled
        if provider in self.common_catchall_providers:
            primary_mx = mx_records[0][0].lower()
            
            # Check if MX record matches known catch-all patterns for this provider
            for pattern in self.common_catchall_providers[provider]:
                if pattern.lower() in primary_mx:
                    # For Google Workspace and Microsoft 365, many organizations enable catch-all
                    # This is a conservative approach - we assume Google/Microsoft domains are catch-all
                    # unless we can verify otherwise via SMTP
                    if provider in ['google', 'microsoft']:
                        logger.info(f"Domain likely uses catch-all (provider: {provider}, MX: {primary_mx})")
                        return True
                        
        # For non-major providers, we need more signals to determine catch-all status
        # For now, we'll be conservative and not mark them as catch-all without SMTP verification
        return False
