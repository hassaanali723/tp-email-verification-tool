import asyncio
import sys
import os
import json
import time
from datetime import datetime
import random

# Add the parent directory to Python path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import redis
from app.services.circuit_breaker import CircuitBreaker
from app.services.validator import EmailValidator
from app.config import settings

async def test_circuit_breaker():
    """Test the circuit breaker functionality"""
    print("\nTesting Circuit Breaker Functionality")
    print("=" * 50)
    
    # Initialize Redis client
    redis_client = redis.from_url(
        f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}",
        password=settings.REDIS_PASSWORD,
        db=settings.REDIS_DB,
        decode_responses=True
    )
    
    # Initialize circuit breaker
    circuit_breaker = CircuitBreaker(redis_client)
    
    # Reset circuit breaker state
    circuit_breaker.reset()
    print("Circuit breaker reset to closed state")
    
    # Check initial state
    print(f"Initial state - Circuit open: {circuit_breaker.is_open}")
    print(f"Initial metrics: {json.dumps(circuit_breaker.get_metrics(), indent=2)}")
    
    # Simulate failures
    print("\nSimulating SMTP failures...")
    for i in range(settings.SMTP_CIRCUIT_BREAKER_THRESHOLD + 2):
        circuit_breaker.record_attempt()
        circuit_breaker.record_failure()
        print(f"Failure {i+1} recorded")
        
        # Check if circuit is open
        if circuit_breaker.is_open:
            print(f"Circuit opened after {i+1} failures")
            break
    
    # Check metrics after failures
    print(f"\nMetrics after failures: {json.dumps(circuit_breaker.get_metrics(), indent=2)}")
    
    # Test validation with circuit open
    validator = EmailValidator()
    
    print("\nTesting email validation with circuit open...")
    test_emails = [
         "wrongemail@notarealdomain.abc",
    "invalid@fakeweb..com",
    "missingatsymbol.com",
    "user@.com",
    "randomemail@123.456.789.000",
    "test@@doubleat.com",
    "name@domain,com",
    "space in@domain.com",
    "symbol!@invalid.com",
    "user@domain.toolongtld",
    "email@missingtld.",
    "empty@nodomain.",
    "user@domain..com",
    "@missinguser.com",
    "dot@start..com",
    "wrong@sub..domain.com",
    "extra@dot..com",
    "double@@email.com",
    "invalid@doma#in.com",
    "123@456.789",
    "nodomain@com",
    "user@site.c0m",
    "email@domain-.com",
    "user@-domain.com",
    "badchar{}@domain.com",
    "weird@domain%name.com",
    "wrong@site!.com",
    "missing.com@",
    "user@domain.1234"
    ]
    
    for email in test_emails:
        print(f"\nValidating {email} with circuit open")
        start_time = datetime.now()
        result = await validator.validate_email(email)
        duration = (datetime.now() - start_time).total_seconds()
        
        print(f"Duration: {duration:.2f}s")
        print(f"Status: {result.status}")
        print(f"Valid: {result.is_valid}")
        print(f"Validation Method: {result.details.general.get('validation_method', 'unknown')}")
        
        # Verify that DNS validation was used
        if result.details.general.get('validation_method') == 'dns':
            print("✅ DNS validation was used as expected")
        else:
            print("❌ DNS validation was NOT used")
    
    # Reset circuit breaker
    print("\nResetting circuit breaker...")
    circuit_breaker.reset()
    
    # Check final state
    print(f"Final state - Circuit open: {circuit_breaker.is_open}")
    print(f"Final metrics: {json.dumps(circuit_breaker.get_metrics(), indent=2)}")
    
    # Clean up
    redis_client.close()
    print("\nCircuit breaker test completed")
    print("=" * 50)

if __name__ == "__main__":
    asyncio.run(test_circuit_breaker()) 