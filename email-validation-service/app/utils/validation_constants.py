"""
Common constants used across validation services.
This module centralizes email validation constants to avoid duplication.
"""

# Common free email providers
FREE_EMAIL_PROVIDERS = {
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
    'icloud.com', 'protonmail.com', 'zoho.com', 'yandex.com'
}

# Common role-based email prefixes
ROLE_PREFIXES = {
    'admin', 'administrator', 'support', 'help', 'info', 'contact',
    'sales', 'marketing', 'billing', 'accounts', 'abuse', 'postmaster'
}

# Common disposable email domains (expanded list)
DISPOSABLE_DOMAINS = {
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
EXAMPLE_DOMAINS = {
    'example.com', 'example.net', 'example.org', 'test.com', 'test.net',
    'test.org', 'domain.com', 'domain.net', 'domain.org'
}

# SMTP provider patterns
SMTP_PROVIDERS = {
    'google': ['google', 'gmail'],
    'microsoft': ['outlook', 'hotmail', 'microsoft'],
    'yahoo': ['yahoo'],
    'aol': ['aol'],
    'proton': ['proton'],
    'zoho': ['zoho'],
    'yandex': ['yandex']
}

# Providers that commonly use catch-all configurations
COMMON_CATCHALL_PROVIDERS = {
    'google': ['aspmx.l.google.com', 'alt1.aspmx.l.google.com', 'alt2.aspmx.l.google.com'],
    'microsoft': ['mail.protection.outlook.com'],
    'zoho': ['mx.zoho.com', 'mx2.zoho.com'],
    'proton': ['mail.protonmail.ch']
} 