import asyncio
import sys
import os
import json
from datetime import datetime
from typing import Dict, Any

# Add the parent directory to Python path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.dns_validator import DNSValidator
from app.models.validation import ValidationStatus

class TestResults:
    def __init__(self):
        self.total = 0
        self.passed = 0
        self.failed = 0
        self.errors = []

    def add_result(self, email: str, success: bool, error: str = None):
        self.total += 1
        if success:
            self.passed += 1
            print(f"✅ {email}: Passed")
        else:
            self.failed += 1
            self.errors.append({"email": email, "error": error})
            print(f"❌ {email}: Failed - {error}")

    def print_summary(self):
        print("\n" + "=" * 50)
        print("Test Summary")
        print("=" * 50)
        print(f"Total Tests: {self.total}")
        print(f"Passed: {self.passed}")
        print(f"Failed: {self.failed}")
        if self.errors:
            print("\nFailures:")
            for error in self.errors:
                print(f"  - {error['email']}: {error['error']}")
        print("=" * 50)

def validate_result(result: Dict[str, Any], email: str) -> tuple[bool, str]:
    """Validate the structure and content of the result"""
    try:
        # Check basic structure
        required_fields = ['email', 'is_valid', 'status', 'risk_level', 'deliverability_score', 'details']
        for field in required_fields:
            if not hasattr(result, field):
                return False, f"Missing required field: {field}"

        # Check details structure
        if not hasattr(result.details, 'general'):
            return False, "Missing details.general"
        if not hasattr(result.details, 'attributes'):
            return False, "Missing details.attributes"
        if not hasattr(result.details, 'mail_server'):
            return False, "Missing details.mail_server"

        # Validate specific cases
        if '@' not in email:
            if result.is_valid:
                return False, "Invalid email marked as valid"
        elif 'gmail.com' in email:
            if not result.details.attributes.free_email:
                return False, "Gmail not marked as free email"
        elif 'noreply' in email:
            if not result.details.attributes.no_reply:
                return False, "Noreply email not marked as role account"
        elif 'mailinator.com' in email:
            if not result.details.attributes.disposable:
                return False, "Mailinator not marked as disposable"

        return True, "OK"
    except Exception as e:
        return False, f"Validation error: {str(e)}"

async def test_dns_validator():
    validator = DNSValidator()
    results = TestResults()
    
    # Test cases
    test_cases = [
        "test@gmail.com",
        "user@microsoft.com",
        "info@protonmail.com",
        "contact@example.com",
        "invalid.email@",
        "@nodomain.com",
        "noreply@company.com",
        "user@mailinator.com",
        "user+tag@domain.com",
        "user@nonexistent.domain",
        "user@localhost",
        "a@b.c",
        "very.long.email.address.test@really.long.domain.name.com"
    ]
    
    print("\nStarting DNS Validation Tests...")
    print("=" * 50)
    
    for email in test_cases:
        print(f"\nTesting: {email}")
        print("-" * 30)
        
        try:
            start_time = datetime.now()
            result = await validator.validate(email)
            duration = (datetime.now() - start_time).total_seconds()
            
            # Print the entire result response
            print(f"Result for {email}:")
            print(json.dumps(result.dict(), indent=2))  # Print the result in JSON format
            
            # Validate result structure and content
            success, message = validate_result(result, email)
            
            # Print detailed result
            print(f"Duration: {duration:.2f}s")
            print(f"Status: {result.status}")
            print(f"Valid: {result.is_valid}")
            print(f"Score: {result.deliverability_score}")
            print(f"Risk Level: {result.risk_level}")
            
            if hasattr(result.details, 'mail_server') and result.details.mail_server.mx_record:
                print(f"MX Record: {result.details.mail_server.mx_record}")
            
            results.add_result(email, success, None if success else message)
            
        except Exception as e:
            results.add_result(email, False, str(e))
    
    # Print final summary
    results.print_summary()

if __name__ == "__main__":
    asyncio.run(test_dns_validator())