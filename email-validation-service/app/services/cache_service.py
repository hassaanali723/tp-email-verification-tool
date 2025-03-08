from redis import asyncio as aioredis
import json
from typing import Optional, Dict, Any
from ..config import settings
import logging

logger = logging.getLogger(__name__)

class CacheService:
    def __init__(self):
        self.redis = None
        self._connect()

    def _connect(self):
        """Initialize Redis connection"""
        try:
            redis_url = f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}"
            logger.info(f"Connecting to Redis at {redis_url} (db={settings.REDIS_DB})")
            
            self.redis = aioredis.from_url(
                redis_url,
                password=settings.REDIS_PASSWORD,
                db=settings.REDIS_DB,
                decode_responses=True,
                socket_connect_timeout=5.0,  # Add timeout for Docker connection
                retry_on_timeout=True  # Enable retries
            )
            logger.info("Successfully connected to Redis")
        except Exception as e:
            logger.error(f"Failed to connect to Redis at {settings.REDIS_HOST}:{settings.REDIS_PORT}: {str(e)}")
            logger.error("If using Docker, ensure the Redis container is running and the port is mapped correctly")
            self.redis = None

    async def _ensure_connection(self):
        """Ensure Redis connection is active"""
        if self.redis is None:
            self._connect()
        try:
            # Test the connection
            pong = await self.redis.ping()
            if pong:
                # Get Redis info for verification
                info = await self.redis.info()
                logger.debug(f"Redis connection verified - Version: {info.get('redis_version')}, "
                           f"Connected clients: {info.get('connected_clients')}")
            return True
        except Exception as e:
            logger.error(f"Redis connection test failed: {str(e)}")
            self._connect()  # Try to reconnect
            try:
                await self.redis.ping()  # Test again
                return True
            except Exception as e:
                logger.error(f"Redis reconnection failed: {str(e)}")
                logger.error("Please check your Redis connection settings and ensure the service is running")
                return False

    async def get_cached_result(self, email: str) -> Optional[Dict]:
        """Get cached full validation result for an email"""
        if not settings.ENABLE_RESULT_CACHE:
            return None

        if not await self._ensure_connection():
            return None

        try:
            key = f"{settings.CACHE_KEY_PREFIX}full:{email}"
            cached = await self.redis.get(key)
            return json.loads(cached) if cached else None
        except Exception as e:
            logger.error(f"Error getting cached result for {email}: {str(e)}")
            return None

    async def cache_result(self, email: str, result: Dict) -> None:
        """Cache full validation result for an email"""
        if not settings.ENABLE_RESULT_CACHE:
            return

        if not await self._ensure_connection():
            return

        try:
            key = f"{settings.CACHE_KEY_PREFIX}full:{email}"
            await self.redis.setex(
                key,
                settings.CACHE_TTL_FULL_RESULT,
                json.dumps(result)
            )
            logger.info(f"Successfully cached result for {email}")
        except Exception as e:
            logger.error(f"Error caching result for {email}: {str(e)}")

    async def get_cached_mx_records(self, domain: str) -> Optional[list]:
        """Get cached MX records for a domain"""
        if not settings.ENABLE_MX_CACHE:
            return None

        if not await self._ensure_connection():
            return None

        try:
            key = f"{settings.CACHE_KEY_PREFIX}mx:{domain}"
            cached = await self.redis.get(key)
            return json.loads(cached) if cached else None
        except Exception as e:
            logger.error(f"Error getting cached MX records for {domain}: {str(e)}")
            return None

    async def cache_mx_records(self, domain: str, mx_records: list) -> None:
        """Cache MX records for a domain"""
        if not settings.ENABLE_MX_CACHE:
            return

        if not await self._ensure_connection():
            return

        try:
            key = f"{settings.CACHE_KEY_PREFIX}mx:{domain}"
            await self.redis.setex(
                key,
                settings.CACHE_TTL_MX_RECORDS,
                json.dumps(mx_records)
            )
            logger.info(f"Successfully cached MX records for {domain}")
        except Exception as e:
            logger.error(f"Error caching MX records for {domain}: {str(e)}")

    async def get_cached_blacklist_result(self, domain: str) -> Optional[Dict]:
        """Get cached blacklist result for a domain"""
        if not settings.ENABLE_BLACKLIST_CACHE:
            return None

        if not await self._ensure_connection():
            return None

        try:
            key = f"{settings.CACHE_KEY_PREFIX}blacklist:{domain}"
            cached = await self.redis.get(key)
            return json.loads(cached) if cached else None
        except Exception as e:
            logger.error(f"Error getting cached blacklist result for {domain}: {str(e)}")
            return None

    async def cache_blacklist_result(self, domain: str, result: Dict) -> None:
        """Cache blacklist result for a domain"""
        if not settings.ENABLE_BLACKLIST_CACHE:
            return

        if not await self._ensure_connection():
            return

        try:
            key = f"{settings.CACHE_KEY_PREFIX}blacklist:{domain}"
            await self.redis.setex(
                key,
                settings.CACHE_TTL_BLACKLIST,
                json.dumps(result)
            )
            logger.info(f"Successfully cached blacklist result for {domain}")
        except Exception as e:
            logger.error(f"Error caching blacklist result for {domain}: {str(e)}")

    async def get_cached_catch_all_status(self, domain: str) -> Optional[bool]:
        """Get cached catch-all status for a domain"""
        if not settings.ENABLE_CATCH_ALL_CACHE:
            return None

        if not await self._ensure_connection():
            return None

        try:
            key = f"{settings.CACHE_KEY_PREFIX}catch_all:{domain}"
            return await self.redis.get(key) == "1"
        except Exception as e:
            logger.error(f"Error getting cached catch-all status for {domain}: {str(e)}")
            return None

    async def cache_catch_all_status(self, domain: str, is_catch_all: bool) -> None:
        """Cache catch-all status for a domain"""
        if not settings.ENABLE_CATCH_ALL_CACHE:
            return

        if not await self._ensure_connection():
            return

        try:
            key = f"{settings.CACHE_KEY_PREFIX}catch_all:{domain}"
            await self.redis.setex(
                key,
                settings.CACHE_TTL_CATCH_ALL,
                "1" if is_catch_all else "0"
            )
            logger.info(f"Successfully cached catch-all status for {domain}")
        except Exception as e:
            logger.error(f"Error caching catch-all status for {domain}: {str(e)}")

    async def get_cached_disposable_status(self, domain: str) -> Optional[bool]:
        """Get cached disposable status for a domain"""
        if not settings.ENABLE_DISPOSABLE_CACHE:
            return None

        if not await self._ensure_connection():
            return None

        try:
            key = f"{settings.CACHE_KEY_PREFIX}disposable:{domain}"
            return await self.redis.get(key) == "1"
        except Exception as e:
            logger.error(f"Error getting cached disposable status for {domain}: {str(e)}")
            return None

    async def cache_disposable_status(self, domain: str, is_disposable: bool) -> None:
        """Cache disposable status for a domain"""
        if not settings.ENABLE_DISPOSABLE_CACHE:
            return

        if not await self._ensure_connection():
            return

        try:
            key = f"{settings.CACHE_KEY_PREFIX}disposable:{domain}"
            await self.redis.setex(
                key,
                settings.CACHE_TTL_DISPOSABLE,
                "1" if is_disposable else "0"
            )
            logger.info(f"Successfully cached disposable status for {domain}")
        except Exception as e:
            logger.error(f"Error caching disposable status for {domain}: {str(e)}")

    async def close(self):
        """Close Redis connection"""
        if self.redis:
            try:
                await self.redis.close()
                logger.info("Redis connection closed")
            except Exception as e:
                logger.error(f"Error closing Redis connection: {str(e)}") 