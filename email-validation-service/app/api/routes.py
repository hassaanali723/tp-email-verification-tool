from fastapi import APIRouter, HTTPException, BackgroundTasks
from ..models.validation import EmailValidationResult, EmailValidationRequest, ValidationStatus, ValidationDetails
from ..services.validator import EmailValidator
from typing import List, Optional
import asyncio
import logging
from datetime import datetime
from ..config import settings
import uuid
import json
import aio_pika
from ..models.validation import BatchValidationResponse, ValidationStatusResponse
from redis import asyncio as aioredis

logger = logging.getLogger(__name__)
router = APIRouter()
validator = EmailValidator()

SMALL_BATCH_THRESHOLD = 5  # Process directly if batch size is smaller than this

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

@router.post("/validate-batch", response_model=BatchValidationResponse)
async def validate_batch(request: EmailValidationRequest):
    """
    Validate a batch of email addresses.
    For small batches (<5 emails), process directly.
    For larger batches, queue for async processing.
    """
    if not request.emails:
        raise HTTPException(status_code=400, detail="No emails provided")

    batch_id = str(uuid.uuid4())
    total_emails = len(request.emails)

    # For small batches, process directly
    if total_emails <= SMALL_BATCH_THRESHOLD:
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

    # For larger batches, queue for async processing
    try:
        # Connect to RabbitMQ
        connection = await aio_pika.connect_robust(
            host=settings.RABBITMQ_HOST,
            port=settings.RABBITMQ_PORT,
            login=settings.RABBITMQ_USER,
            password=settings.RABBITMQ_PASS,
            virtualhost=settings.RABBITMQ_VHOST
        )

        channel = await connection.channel()
        
        # Include validation flags in the message
        message_data = {
            "batchId": batch_id,
            "emails": request.emails,
            "validation_flags": {
                "check_mx": request.check_mx,
                "check_smtp": request.check_smtp,
                "check_disposable": request.check_disposable,
                "check_catch_all": request.check_catch_all,
                "check_blacklist": request.check_blacklist
            }
        }
        
        # Publish message to queue
        await channel.default_exchange.publish(
            aio_pika.Message(
                body=json.dumps(message_data).encode(),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT
            ),
            routing_key=settings.RABBITMQ_QUEUE
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

@router.get("/validation-status/{batch_id}", response_model=ValidationStatusResponse)
async def get_validation_status(batch_id: str):
    """Get the status of a batch validation request"""
    try:
        # Connect to Redis
        redis = aioredis.from_url(
            f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}",
            password=settings.REDIS_PASSWORD,
            db=settings.REDIS_DB,
            decode_responses=True
        )

        # Get results from Redis
        results = await redis.get(f"validation_results:{batch_id}")
        await redis.close()

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
        redis = aioredis.from_url(
            f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}",
            password=settings.REDIS_PASSWORD,
            db=settings.REDIS_DB,
            decode_responses=True
        )

        # Get all keys for the specified cache type
        pattern = f"{settings.CACHE_KEY_PREFIX}{cache_type}:*"
        keys = await redis.keys(pattern)
        
        # Get values for all keys
        results = {}
        for key in keys:
            value = await redis.get(key)
            try:
                # Try to parse JSON values
                results[key] = json.loads(value)
            except:
                # If not JSON, store as is
                results[key] = value

        await redis.close()
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
        redis = aioredis.from_url(
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
        keys = await redis.keys(pattern)
        
        # Delete all matching keys
        if keys:
            await redis.delete(*keys)

        await redis.close()
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