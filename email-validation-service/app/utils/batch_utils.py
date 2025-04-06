import uuid
from typing import List, Dict, Any
import math
import logging
import json
import asyncio
import aio_pika
from datetime import datetime
import redis

from ..config import settings

logger = logging.getLogger(__name__)

def split_into_batches(emails: List[str]) -> List[List[str]]:
    """
    Split emails into appropriately sized batches based on total count
    
    Args:
        emails: List of email addresses to validate
        
    Returns:
        List of email batches
    """
    total_emails = len(emails)
    
    # Determine batch size based on total email count
    if total_emails <= 20:
        return [emails]  # Single batch for small uploads
    elif total_emails <= 100:
        batch_size = 30 
    elif total_emails <= 200:
        batch_size = 50 
    elif total_emails <= 500:
        batch_size = 100  # 20 emails per batch for medium uploads
    elif total_emails <= 1000:
        batch_size = 150  # 50 emails per batch for large uploads
    else:
        batch_size = 200  # 100 emails per batch for very large uploads
    
    # Split emails into batches
    return [emails[i:i+batch_size] for i in range(0, len(emails), batch_size)]

async def create_batch_tracking(redis_client: redis.Redis, request_id: str, batch_ids: List[str], total_emails: int) -> None:
    """
    Create tracking record for a multi-batch request
    
    Args:
        redis_client: Redis client
        request_id: ID of the original request
        batch_ids: List of batch IDs
        total_emails: Total number of emails across all batches
    """
    tracking_data = {
        "requestId": request_id,
        "batchIds": batch_ids,
        "totalEmails": total_emails,
        "processedEmails": 0,
        "status": "processing",
        "createdAt": datetime.utcnow().isoformat(),
        "lastUpdated": datetime.utcnow().isoformat()
    }
    
    # Store tracking data in Redis
    await redis_client.setex(
        f"multi_batch:{request_id}",
        settings.REDIS_RESULT_EXPIRY,
        json.dumps(tracking_data)
    )
    
    # Create index for each batch ID to find its parent request
    for batch_id in batch_ids:
        await redis_client.setex(
            f"batch_parent:{batch_id}",
            settings.REDIS_RESULT_EXPIRY,
            request_id
        )

async def queue_batch_for_processing(
    connection: aio_pika.Connection,
    batch_id: str, 
    emails: List[str], 
    validation_flags: Dict[str, bool]
) -> None:
    """
    Queue a batch of emails for processing
    
    Args:
        connection: RabbitMQ connection
        batch_id: Unique ID for this batch
        emails: List of emails in this batch
        validation_flags: Validation options
    """
    channel = await connection.channel()
    
    # Prepare message data
    message_data = {
        "batchId": batch_id,
        "emails": emails,
        "validation_flags": validation_flags
    }
    
    # Publish message to queue
    await channel.default_exchange.publish(
        aio_pika.Message(
            body=json.dumps(message_data).encode(),
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT
        ),
        routing_key=settings.RABBITMQ_QUEUE
    )
    
    logger.info(f"Queued batch {batch_id} with {len(emails)} emails for processing")

async def get_multi_batch_status(redis_client: redis.Redis, request_id: str) -> Dict[str, Any]:
    """
    Get aggregated status for a multi-batch request
    
    Args:
        redis_client: Redis client
        request_id: ID of the original request
        
    Returns:
        Aggregated status information
    """
    # Get tracking data
    tracking_data_json = await redis_client.get(f"multi_batch:{request_id}")
    if not tracking_data_json:
        return None
    
    tracking_data = json.loads(tracking_data_json)
    batch_ids = tracking_data["batchIds"]
    
    # Get status for each batch
    batch_statuses = []
    total_processed = 0
    all_complete = True
    
    for batch_id in batch_ids:
        batch_status_json = await redis_client.get(f"validation_results:{batch_id}")
        if not batch_status_json:
            batch_statuses.append({
                "batchId": batch_id,
                "status": "processing",
                "processedEmails": 0,
                "totalEmails": 0
            })
            all_complete = False
            continue
            
        batch_status = json.loads(batch_status_json)
        batch_statuses.append({
            "batchId": batch_id,
            "status": "completed" if batch_status["isComplete"] else "processing",
            "processedEmails": batch_status["processedCount"],
            "totalEmails": batch_status["totalEmails"]
        })
        
        total_processed += batch_status["processedCount"]
        if not batch_status["isComplete"]:
            all_complete = False
    
    # Update tracking data
    tracking_data["processedEmails"] = total_processed
    tracking_data["status"] = "completed" if all_complete else "processing"
    tracking_data["lastUpdated"] = datetime.utcnow().isoformat()
    tracking_data["batches"] = batch_statuses
    
    # Calculate progress percentage
    if tracking_data["totalEmails"] > 0:
        progress_pct = (total_processed / tracking_data["totalEmails"]) * 100
        tracking_data["progress"] = f"{total_processed}/{tracking_data['totalEmails']} ({int(progress_pct)}%)"
    
    # Update Redis with latest status
    await redis_client.setex(
        f"multi_batch:{request_id}",
        settings.REDIS_RESULT_EXPIRY,
        json.dumps(tracking_data)
    )

    # Publish the tracking data for real-time updates
    try:
        await redis_client.publish('email_validation_results', json.dumps(tracking_data))
    except Exception as e:
        logger.error(f"Error publishing tracking data: {str(e)}")
    
    return tracking_data 