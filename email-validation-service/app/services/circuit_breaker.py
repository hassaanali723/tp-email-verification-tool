import redis
import logging
from datetime import datetime
from ..config import settings

logger = logging.getLogger(__name__)

class CircuitBreaker:
    """
    Circuit breaker implementation for SMTP validation service.
    Tracks SMTP timeouts and switches to DNS validation after threshold is reached.
    Designed to work across multiple worker processes by using Redis for state.
    """
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.failure_threshold = 10  # Fixed threshold for simplicity
        
        # Redis keys
        self.failures_key = "smtp_timeout_failures"
        self.status_key = "smtp_circuit_status"
        self.last_timeout_key = "smtp_last_timeout"
        
        # Redis keys for historical metrics
        self.total_timeouts_key = "smtp_total_timeouts_historical"
        self.total_dns_fallbacks_key = "smtp_total_dns_fallbacks_historical"
        
        # Set expiration for circuit breaker keys (in seconds)
        # This ensures the circuit will reset after this time period
        self.key_expiry = 3600  # 1 hour
    
    @property
    def is_open(self) -> bool:
        """
        Check if circuit breaker is open (SMTP should not be used)
        Returns True if circuit is open, False otherwise
        """
        # First check if DNS_ONLY_MODE is enabled in settings
        if settings.DNS_ONLY_MODE_ENABLED:
            logger.info("DNS_ONLY_MODE is enabled in settings, circuit is open")
            return True
            
        # Check circuit status in Redis
        status = self.redis.get(self.status_key)
        is_open = status == "open"
        
        if is_open:
            logger.info("Circuit breaker is open, using DNS validation")
        
        return is_open
    
    def record_smtp_timeout(self):
        """
        Record an SMTP timeout failure and potentially open the circuit
        Only called when there's an actual SMTP timeout/connection failure
        """
        # Use Redis transaction to ensure atomicity
        with self.redis.pipeline() as pipe:
            while True:
                try:
                    # Watch the keys we're going to modify
                    pipe.watch(self.failures_key, self.status_key)
                    
                    # Get current values
                    current_failures = int(pipe.get(self.failures_key) or 0)
                    current_status = pipe.get(self.status_key)
                    
                    # Start transaction
                    pipe.multi()
                    
                    # Increment failure counter
                    new_failure_count = current_failures + 1
                    pipe.set(self.failures_key, new_failure_count)
                    pipe.expire(self.failures_key, self.key_expiry)
                    
                    # Set last timeout timestamp
                    now = datetime.now().isoformat()
                    pipe.set(self.last_timeout_key, now)
                    pipe.expire(self.last_timeout_key, self.key_expiry)
                    
                    # Increment total timeouts counter
                    pipe.incr(self.total_timeouts_key)
                    
                    # Check if we should open the circuit
                    if new_failure_count >= self.failure_threshold and current_status != "open":
                        logger.warning(f"SMTP timeout threshold reached ({new_failure_count}/{self.failure_threshold}), opening circuit")
                        pipe.set(self.status_key, "open")
                        pipe.expire(self.status_key, self.key_expiry)
                    
                    # Execute transaction
                    pipe.execute()
                    
                    # Log the current state
                    logger.info(f"SMTP timeout recorded. Current count: {new_failure_count}/{self.failure_threshold}, Status: {'open' if current_status == 'open' else 'closed'}, Time: {now}")
                    
                    break
                    
                except redis.WatchError:
                    # Another client modified the keys, retry
                    logger.warning("Redis WatchError occurred, retrying transaction")
                    continue
    
    def record_dns_fallback(self):
        """
        Record when we fall back to DNS validation
        """
        self.redis.incr(self.total_dns_fallbacks_key)
    
    def open_circuit(self):
        """
        Open the circuit to prevent SMTP usage
        """
        logger.warning("Opening circuit breaker - switching to DNS-only mode")
        self.redis.set(self.status_key, "open")
        self.redis.expire(self.status_key, self.key_expiry)
    
    def reset(self):
        """
        Reset the circuit breaker state
        """
        pipe = self.redis.pipeline()
        pipe.set(self.failures_key, 0)
        pipe.expire(self.failures_key, self.key_expiry)
        pipe.set(self.status_key, "closed")
        pipe.expire(self.status_key, self.key_expiry)
        pipe.execute()
        
        logger.info("Reset circuit breaker state")
    
    def get_metrics(self) -> dict:
        """
        Get current circuit breaker metrics
        """
        pipe = self.redis.pipeline()
        pipe.get(self.failures_key)
        pipe.get(self.status_key)
        pipe.get(self.last_timeout_key)
        pipe.get(self.total_timeouts_key)
        pipe.get(self.total_dns_fallbacks_key)
        
        results = pipe.execute()
        
        consecutive_timeouts = int(results[0] or 0)
        status = results[1]
        last_timeout = results[2]
        total_timeouts = int(results[3] or 0)
        total_dns_fallbacks = int(results[4] or 0)
            
        return {
            "status": status if status else "closed",
            "consecutive_smtp_timeouts": consecutive_timeouts,
            "total_timeouts": total_timeouts,
            "total_dns_fallbacks": total_dns_fallbacks,
            "last_timeout": last_timeout,
            "timeout_threshold": self.failure_threshold
        }