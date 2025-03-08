from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Dict, List
from enum import Enum

class ValidationStatus(str, Enum):
    DELIVERABLE = "deliverable"
    UNDELIVERABLE = "undeliverable"
    RISKY = "risky"
    UNKNOWN = "unknown"

class UndeliverableReason(str, Enum):
    INVALID_EMAIL = "Invalid Email"
    INVALID_DOMAIN = "Invalid Domain"
    REJECTED_EMAIL = "Rejected Email"
    INVALID_SMTP = "Invalid SMTP"
    DISPOSABLE_EMAIL = "Disposable Email"
    BLACKLISTED = "Blacklisted"

class RiskyReason(str, Enum):
    LOW_QUALITY = "Low Quality"
    LOW_DELIVERABILITY = "Low Deliverability"

class UnknownReason(str, Enum):
    NO_CONNECT = "No Connect"
    TIMEOUT = "Timeout"
    UNAVAILABLE_SMTP = "Unavailable SMTP"
    UNEXPECTED_ERROR = "Unexpected Error"

class EmailAttributes(BaseModel):
    free_email: bool = Field(default=False, description="Whether the email is from a free email provider")
    role_account: bool = Field(default=False, description="Whether the email is a role account (e.g., admin@, support@)")
    disposable: bool = Field(default=False, description="Whether the email is from a disposable email provider")
    catch_all: bool = Field(default=False, description="Whether the domain is a catch-all domain")
    has_plus_tag: bool = Field(default=False, description="Whether the email contains a plus tag (e.g., user+tag@domain.com)")
    mailbox_full: bool = Field(default=False, description="Whether the mailbox is full")
    no_reply: bool = Field(default=False, description="Whether it's a no-reply email")

class MailServerInfo(BaseModel):
    smtp_provider: Optional[str] = Field(default=None, description="SMTP provider of the domain")
    mx_record: Optional[str] = Field(default=None, description="MX record of the domain")
    implicit_mx: Optional[str] = Field(default=None, description="Implicit MX record if any")

class BlacklistInfo(BaseModel):
    is_blacklisted: bool = Field(default=False, description="Whether the email/domain is blacklisted")
    blacklists_found: List[str] = Field(default_factory=list, description="List of blacklists that flagged this email/domain")
    blacklist_reasons: List[str] = Field(default_factory=list, description="Reasons for blacklisting")
    reputation_score: int = Field(default=100, description="Reputation score from 0 to 100")
    last_checked: Optional[str] = None

class ValidationDetails(BaseModel):
    general: Dict[str, str] = Field(default_factory=lambda: {"domain": "", "reason": ""}, description="General validation information")
    attributes: EmailAttributes = Field(default_factory=EmailAttributes, description="Email attributes")
    mail_server: MailServerInfo = Field(default_factory=MailServerInfo, description="Mail server information")
    blacklist: BlacklistInfo = Field(default_factory=BlacklistInfo, description="Blacklist check results")
    sub_status: Optional[str] = Field(default=None, description="Detailed status category")

class EmailValidationResult(BaseModel):
    email: str
    is_valid: bool
    status: ValidationStatus
    risk_level: str = Field(default="high", description="Risk level: low, medium, or high")
    deliverability_score: int = Field(default=0, description="Deliverability score from 0 to 100")
    details: ValidationDetails = Field(default_factory=ValidationDetails)

class EmailValidationRequest(BaseModel):
    emails: List[str] = Field(..., description="List of emails to validate")
    check_mx: bool = Field(description="Whether to check MX records")
    check_smtp: bool = Field(description="Whether to perform SMTP validation")
    check_disposable: bool = Field(description="Whether to check for disposable emails")
    check_catch_all: bool = Field(description="Whether to check for catch-all domains")
    check_blacklist: bool = Field(description="Whether to check domain against blacklists")

class BatchValidationResponse(BaseModel):
    batchId: str
    status: str  # "processing" or "completed"
    totalEmails: int
    processedEmails: int
    estimatedTime: Optional[str] = None
    results: Optional[List[EmailValidationResult]] = None

class ValidationStatusResponse(BaseModel):
    batchId: str
    status: str  # "processing" or "completed"
    message: Optional[str] = None
    totalEmails: Optional[int] = None
    processedEmails: Optional[int] = None
    results: Optional[List[EmailValidationResult]] = None
    lastUpdated: Optional[str] = None 