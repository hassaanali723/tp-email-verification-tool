import sys
import json
import re
import socket
import dns.resolver

def validate_email_format(email):
    # Regex for basic email validation
    email_regex = r"^[\w\.-]+@[\w\.-]+\.\w+$"
    return bool(re.match(email_regex, email))

def check_domain_exists(email):
    try:
        domain = email.split("@")[1]
        dns.resolver.resolve(domain, 'MX')  # Check for MX records
        return True
    except Exception:
        return False

def validate_emails(emails):
    results = []
    for email in emails:
        status = {
            "email": email,
            "is_valid_format": validate_email_format(email),
            "domain_exists": check_domain_exists(email) if validate_email_format(email) else False
        }
        results.append(status)
    return results

if __name__ == "__main__":
    try:
        # Get emails from command-line arguments
        input_emails = json.loads(sys.argv[1])
        results = validate_emails(input_emails)
        print(json.dumps(results))
    except Exception as e
        print(json.dumps({"error": str(e)}))
