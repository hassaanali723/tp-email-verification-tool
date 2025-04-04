from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from ..models.validation import (
    EmailValidationResult, 
    EmailValidationRequest, 
    ValidationStatus, 
    ValidationDetails,
    BatchValidationResponse,
    ValidationStatusResponse,
    MultiBatchResponse,
    MultiStatusResponse
)
from ..services.validator import EmailValidator
from ..services.dns_validator import DNSValidator
from ..services.circuit_breaker import CircuitBreaker
from ..utils.batch_utils import split_into_batches, create_batch_tracking, queue_batch_for_processing, get_multi_batch_status
from typing import List, Optional, Dict, Any
import asyncio
import logging
from datetime import datetime
from ..config import settings
import uuid
import json
import aio_pika
from redis import asyncio as aioredis
import redis
from fastapi.responses import RedirectResponse

logger = logging.getLogger(__name__)
router = APIRouter()
validator = EmailValidator()


# Initialize services
dns_validator = DNSValidator()
email_validator = EmailValidator()

# Redis client dependency
async def get_redis():
    redis_client = aioredis.from_url(
        f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}",
        password=settings.REDIS_PASSWORD,
        db=settings.REDIS_DB,
        decode_responses=True
    )
    try:
        yield redis_client
    finally:
        await redis_client.close()

# Circuit breaker dependency
async def get_circuit_breaker():
    redis_client = redis.from_url(
        f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}",
        password=settings.REDIS_PASSWORD,
        db=settings.REDIS_DB,
        decode_responses=True
    )
    try:
        circuit_breaker = CircuitBreaker(redis_client)
        yield circuit_breaker
    finally:
        redis_client.close()

@router.post("/validate")
async def validate_email(request: EmailValidationRequest):
    """Validate a single email address"""
    if not request.emails:
        raise HTTPException(status_code=400, detail="No emails provided")
    
    result = await validator.validate_email(
        request.emails[0],
        check_mx=request.check_mx,
        check_smtp=request.check_smtp,
        check_disposable=request.check_disposable,
        check_catch_all=request.check_catch_all,
        check_blacklist=request.check_blacklist
    )
    return result

@router.post("/validate-batch", response_model=BatchValidationResponse | MultiBatchResponse)
async def validate_batch(
    request: EmailValidationRequest,
    redis_client: aioredis.Redis = Depends(get_redis)
):
    """
    Validate a batch of email addresses.
    For small batches (<5 emails), process directly.
    For larger batches, queue for async processing.
    For very large batches (>100 emails), split into multiple batches for parallel processing.
    """
    if not request.emails:
        raise HTTPException(status_code=400, detail="No emails provided")

    total_emails = len(request.emails)

    # For small batches, process directly
    if total_emails <= settings.SMALL_BATCH_THRESHOLD:
        batch_id = str(uuid.uuid4())
        results = []
        for email in request.emails:
            try:
                result = await validator.validate_email(
                    email,
                    check_mx=request.check_mx,
                    check_smtp=request.check_smtp,
                    check_disposable=request.check_disposable,
                    check_catch_all=request.check_catch_all,
                    check_blacklist=request.check_blacklist
                )
                results.append(result)
            except Exception as e:
                logger.error(f"Error validating email {email}: {str(e)}")
                continue
        
        return BatchValidationResponse(
            batchId=batch_id,
            status="completed",
            totalEmails=total_emails,
            processedEmails=len(results),
            results=results
        )

    # For larger batches, determine if we need multi-batch processing
    email_batches = split_into_batches(request.emails)
    
    # If only one batch is needed, use the standard approach
    if len(email_batches) == 1:
        batch_id = str(uuid.uuid4())
        
        try:
            # Connect to RabbitMQ
            connection = await aio_pika.connect_robust(
                host=settings.RABBITMQ_HOST,
                port=settings.RABBITMQ_PORT,
                login=settings.RABBITMQ_USER,
                password=settings.RABBITMQ_PASS,
                virtualhost=settings.RABBITMQ_VHOST
            )

            # Queue the batch for processing
            await queue_batch_for_processing(
                connection,
                batch_id,
                request.emails,
                {
                    "check_mx": request.check_mx,
                    "check_smtp": request.check_smtp,
                    "check_disposable": request.check_disposable,
                    "check_catch_all": request.check_catch_all,
                    "check_blacklist": request.check_blacklist
                }
            )

            await connection.close()

            # Return batch ID for status checking
            return BatchValidationResponse(
                batchId=batch_id,
                status="processing",
                totalEmails=total_emails,
                processedEmails=0,
                estimatedTime=f"{(total_emails // 10) + 1} minutes"
            )

        except Exception as e:
            logger.error(f"Error queueing batch: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Failed to queue validation request"
            )
    
    # For multi-batch processing
    else:
        request_id = str(uuid.uuid4())
        batch_ids = []
        
        try:
            # Connect to RabbitMQ
            connection = await aio_pika.connect_robust(
                host=settings.RABBITMQ_HOST,
                port=settings.RABBITMQ_PORT,
                login=settings.RABBITMQ_USER,
                password=settings.RABBITMQ_PASS,
                virtualhost=settings.RABBITMQ_VHOST
            )

            # Queue each batch for processing
            for email_batch in email_batches:
                batch_id = str(uuid.uuid4())
                batch_ids.append(batch_id)
                
                await queue_batch_for_processing(
                    connection,
                    batch_id,
                    email_batch,
                    {
                        "check_mx": request.check_mx,
                        "check_smtp": request.check_smtp,
                        "check_disposable": request.check_disposable,
                        "check_catch_all": request.check_catch_all,
                        "check_blacklist": request.check_blacklist
                    }
                )
            
            await connection.close()
            
            # Create tracking record for multi-batch request
            await create_batch_tracking(redis_client, request_id, batch_ids, total_emails)
            
            # Calculate estimated time based on total emails
            # Assume parallel processing will be faster
            parallel_factor = min(len(batch_ids), 4)  # Assume up to 4x speedup with parallelism
            estimated_minutes = max(1, (total_emails // (10 * parallel_factor)) + 1)
            
            # Return multi-batch response
            return MultiBatchResponse(
                requestId=request_id,
                batchIds=batch_ids,
                status="processing",
                totalEmails=total_emails,
                processedEmails=0,
                estimatedTime=f"{estimated_minutes} minutes"
            )

        except Exception as e:
            logger.error(f"Error queueing multi-batch request: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Failed to queue validation request"
            )

@router.get("/validation-status/{batch_id}", response_model=ValidationStatusResponse)
async def get_validation_status(batch_id: str):
    """Get the status of a batch validation request"""
    try:
        # Connect to Redis
        redis_client = redis.from_url(
            f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}",
            password=settings.REDIS_PASSWORD,
            db=settings.REDIS_DB,
            decode_responses=True
        )

        # Check if this is a child batch of a multi-batch request
        parent_request_id = redis_client.get(f"batch_parent:{batch_id}")
        
        # Get results from Redis for this specific batch
        results = redis_client.get(f"validation_results:{batch_id}")
        
        # If no results found and this is a request ID (not a batch ID)
        if not results and not parent_request_id:
            # Check if this is actually a request ID
            multi_batch_data = redis_client.get(f"multi_batch:{batch_id}")
            if multi_batch_data:
                redis_client.close()
                return RedirectResponse(url=f"/api/v1/multi-validation-status/{batch_id}")
        
        redis_client.close()

        if not results:
            return ValidationStatusResponse(
                batchId=batch_id,
                status="processing",
                message="Validation in progress"
            )

        results = json.loads(results)
        return ValidationStatusResponse(
            batchId=batch_id,
            status="completed" if results["isComplete"] else "processing",
            totalEmails=results["totalEmails"],
            processedEmails=results["processedCount"],
            results=results.get("validatedEmails", []),
            lastUpdated=results["lastUpdated"]
        )

    except Exception as e:
        logger.error(f"Error getting validation status: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to get validation status"
        )

@router.get("/cache/view/{cache_type}")
async def view_cache(cache_type: str):
    """View cached results by type
    Types: full, mx, blacklist, disposable, catch_all
    """
    try:
        redis_client = redis.from_url(
            f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}",
            password=settings.REDIS_PASSWORD,
            db=settings.REDIS_DB,
            decode_responses=True
        )

        # Get all keys for the specified cache type
        pattern = f"{settings.CACHE_KEY_PREFIX}{cache_type}:*"
        keys = redis_client.keys(pattern)
        
        # Get values for all keys
        results = {}
        for key in keys:
            value = redis_client.get(key)
            try:
                # Try to parse JSON values
                results[key] = json.loads(value)
            except:
                # If not JSON, store as is
                results[key] = value

        redis_client.close()
        return {
            "cache_type": cache_type,
            "total_entries": len(keys),
            "entries": results
        }

    except Exception as e:
        logger.error(f"Error viewing cache: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to view cache: {str(e)}"
        )

@router.delete("/cache/clear/{cache_type}")
async def clear_cache(cache_type: str):
    """Clear cache by type
    Types: full, mx, blacklist, disposable, catch_all, all
    """
    try:
        redis_client = redis.from_url(
            f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}",
            password=settings.REDIS_PASSWORD,
            db=settings.REDIS_DB,
            decode_responses=True
        )

        if cache_type == "all":
            pattern = f"{settings.CACHE_KEY_PREFIX}*"
        else:
            pattern = f"{settings.CACHE_KEY_PREFIX}{cache_type}:*"

        # Get all keys matching the pattern
        keys = redis_client.keys(pattern)
        
        # Delete all matching keys
        if keys:
            redis_client.delete(*keys)

        redis_client.close()
        return {
            "cache_type": cache_type,
            "cleared_entries": len(keys),
            "message": f"Successfully cleared {len(keys)} cache entries"
        }

    except Exception as e:
        logger.error(f"Error clearing cache: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear cache: {str(e)}"
        )

@router.get("/circuit-breaker/status")
async def get_circuit_breaker_status(circuit_breaker: CircuitBreaker = Depends(get_circuit_breaker)):
    """
    Get the current status of the circuit breaker
    Shows if the system is using SMTP validation or has fallen back to DNS-only validation
    """
    try:
        metrics = circuit_breaker.get_metrics()
        return {
            "status": metrics["status"],
            "consecutive_smtp_timeouts": metrics["consecutive_smtp_timeouts"],
            "timeout_threshold": metrics["timeout_threshold"],
            "is_open": metrics["status"] == "open",
            "last_timeout": metrics["last_timeout"],
            "total_timeouts": metrics["total_timeouts"],
            "total_dns_fallbacks": metrics["total_dns_fallbacks"],
            "dns_only_mode": settings.DNS_ONLY_MODE_ENABLED
        }
    except Exception as e:
        logger.error(f"Error getting circuit breaker status: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get circuit breaker status: {str(e)}"
        )

@router.post("/circuit-breaker/reset")
async def reset_circuit_breaker(circuit_breaker: CircuitBreaker = Depends(get_circuit_breaker)):
    """
    Reset circuit breaker to closed state
    """
    try:
        circuit_breaker.reset()
        return {"status": "success", "message": "Circuit breaker reset successfully"}
    except Exception as e:
        logger.error(f"Error resetting circuit breaker: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to reset circuit breaker: {str(e)}")

@router.post("/test-dns-validation")
async def test_dns_validation(email: str) -> EmailValidationResult:
    """
    Test endpoint for DNS validation only
    This endpoint bypasses SMTP and only uses DNS validation
    """
    try:
        result = await dns_validator.validate(email)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/validate-email")
async def validate_email(
    email: str,
    check_mx: bool = True,
    check_smtp: bool = True,
    check_disposable: bool = True,
    check_catch_all: bool = True,
    check_blacklist: bool = True
) -> EmailValidationResult:
    """
    Validate a single email address
    """
    try:
        result = await email_validator.validate_email(
            email=email,
            check_mx=check_mx,
            check_smtp=check_smtp,
            check_disposable=check_disposable,
            check_catch_all=check_catch_all,
            check_blacklist=check_blacklist
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/multi-validation-status/{request_id}", response_model=MultiStatusResponse)
async def get_multi_validation_status(
    request_id: str,
    redis_client: aioredis.Redis = Depends(get_redis)
):
    """
    Get the aggregated status of a multi-batch validation request
    
    This endpoint returns the combined status of all batches in a multi-batch request,
    including overall progress and individual batch statuses.
    """
    try:
        # Get multi-batch status
        status = await get_multi_batch_status(redis_client, request_id)
        
        if not status:
            raise HTTPException(
                status_code=404,
                detail="Multi-batch request not found"
            )
        
        return MultiStatusResponse(
            requestId=status["requestId"],
            batchIds=status["batchIds"],
            status=status["status"],
            totalEmails=status["totalEmails"],
            processedEmails=status["processedEmails"],
            progress=status.get("progress"),
            batches=status.get("batches"),
            lastUpdated=status["lastUpdated"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting multi-batch status: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to get multi-batch validation status"
        ) 