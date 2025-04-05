import json
import asyncio
import aio_pika
from redis import asyncio as aioredis
from typing import List, Dict
import logging
from datetime import datetime

from .services.validator import EmailValidator
from .config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class EmailValidationWorker:
    def __init__(self):
        self.validator = EmailValidator()
        self.redis = None
        self.connection = None
        self.channel = None
        self.queue = None

    async def connect(self):
        """Initialize RabbitMQ and Redis connections"""
        # Connect to Redis
        self.redis = aioredis.from_url(
            f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}",
            password=settings.REDIS_PASSWORD,
            db=settings.REDIS_DB,
            decode_responses=True
        )

        # Connect to RabbitMQ
        self.connection = await aio_pika.connect_robust(
            host=settings.RABBITMQ_HOST,
            port=settings.RABBITMQ_PORT,
            login=settings.RABBITMQ_USER,
            password=settings.RABBITMQ_PASS,
            virtualhost=settings.RABBITMQ_VHOST
        )

        # Create channel
        self.channel = await self.connection.channel()
        await self.channel.set_qos(prefetch_count=settings.WORKER_PREFETCH_COUNT)

        # Declare queues
        self.queue = await self.channel.declare_queue(
            settings.RABBITMQ_QUEUE,
            durable=True,
            arguments={
                'x-dead-letter-exchange': '',
                'x-dead-letter-routing-key': settings.RABBITMQ_DLQ
            }
        )

        # Declare DLQ
        await self.channel.declare_queue(
            settings.RABBITMQ_DLQ,
            durable=True
        )

    async def process_emails(self, batch_id: str, emails: List[str], validation_flags: Dict) -> None:
        """Process a batch of emails and store results in Redis"""
        total_emails = len(emails)
        logger.info(f"Processing batch {batch_id} with {total_emails} emails")
        
        # Split emails into smaller chunks
        chunks = [emails[i:i + settings.WORKER_BATCH_SIZE] 
                 for i in range(0, total_emails, settings.WORKER_BATCH_SIZE)]
        
        all_results = []
        for i, chunk in enumerate(chunks):
            try:
                # Check circuit breaker status before processing chunk
                circuit_open = self.validator.circuit_breaker.is_open
                if circuit_open:
                    logger.warning(f"Circuit breaker is open for chunk {i+1}/{len(chunks)} - using DNS validation")
                
                # Process chunk concurrently with validation flags
                # If circuit is open, disable SMTP checks for the entire chunk
                use_smtp = validation_flags.get('check_smtp', True) and not circuit_open
                
                chunk_results = await asyncio.gather(
                    *[self.validator.validate_email(
                        email,
                        check_mx=validation_flags.get('check_mx', True),
                        check_smtp=use_smtp,
                        check_disposable=validation_flags.get('check_disposable', True),
                        check_catch_all=validation_flags.get('check_catch_all', True),
                        check_blacklist=validation_flags.get('check_blacklist', True)
                    ) for email in chunk],
                    return_exceptions=True
                )
                
                # Handle any exceptions in results
                processed_results = []
                for result in chunk_results:
                    if isinstance(result, Exception):
                        logger.error(f"Error processing email: {str(result)}")
                        continue
                    processed_results.append(result)
                
                all_results.extend(processed_results)
                
                # Update progress in Redis
                progress = {
                    "batchId": batch_id,
                    "isComplete": False,
                    "validatedEmails": [result.dict() for result in all_results],
                    "totalEmails": total_emails,
                    "processedCount": len(all_results),
                    "lastUpdated": datetime.utcnow().isoformat()
                }
                
                # Store in Redis for status checks
                await self.redis.setex(
                    f"validation_results:{batch_id}",
                    settings.REDIS_RESULT_EXPIRY,
                    json.dumps(progress)
                )

                # Publish progress update
                try:
                    await self.redis.publish('email_validation_results', json.dumps(progress))
                except Exception as e:
                    logger.error(f"Error publishing progress update: {str(e)}")
                
                logger.info(f"Processed chunk {i+1}/{len(chunks)} for batch {batch_id}")
                
            except Exception as e:
                logger.error(f"Error processing chunk: {str(e)}")
                continue

        # Mark batch as complete
        final_results = {
            "batchId": batch_id,
            "isComplete": True,
            "validatedEmails": [result.dict() for result in all_results],
            "totalEmails": total_emails,
            "processedCount": len(all_results),
            "lastUpdated": datetime.utcnow().isoformat()
        }
        
        # Store final results in Redis
        await self.redis.setex(
            f"validation_results:{batch_id}",
            settings.REDIS_RESULT_EXPIRY,
            json.dumps(final_results)
        )

        # Publish final results
        try:
            await self.redis.publish('email_validation_results', json.dumps(final_results))
        except Exception as e:
            logger.error(f"Error publishing final results: {str(e)}")
        
        # Get circuit breaker metrics for logging
        metrics = self.validator.circuit_breaker.get_metrics()
        logger.info(f"Batch {batch_id} completed. Circuit breaker status: {metrics['status']}, Consecutive timeouts: {metrics['consecutive_smtp_timeouts']}")
        
        # Reset circuit breaker at the end of the batch
        self.validator.circuit_breaker.reset()
        
        logger.info(f"Completed batch {batch_id}")

    async def process_message(self, message: aio_pika.IncomingMessage):
        """Process a single message from RabbitMQ"""
        async with message.process():
            try:
                body = json.loads(message.body.decode())
                batch_id = body.get('batchId')
                emails = body.get('emails', [])
                validation_flags = body.get('validation_flags', {})
                
                if not batch_id or not emails:
                    logger.error("Invalid message format")
                    return
                
                await self.process_emails(batch_id, emails, validation_flags)
                
            except Exception as e:
                logger.error(f"Error processing message: {str(e)}")
                # Reject message and send to DLQ
                await message.reject(requeue=False)

    async def run(self):
        """Main worker loop"""
        try:
            await self.connect()
            logger.info("Worker started, waiting for messages...")
            
            async with self.queue.iterator() as queue_iter:
                async for message in queue_iter:
                    await self.process_message(message)
                    
        except Exception as e:
            logger.error(f"Worker error: {str(e)}")
        finally:
            if self.connection:
                await self.connection.close()
            if self.redis:
                await self.redis.close()

async def start_worker():
    """Start the worker"""
    worker = EmailValidationWorker()
    await worker.run()

if __name__ == "__main__":
    asyncio.run(start_worker()) 