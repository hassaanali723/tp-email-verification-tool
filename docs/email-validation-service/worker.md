# `worker.py`

Implements the asynchronous worker that consumes RabbitMQ batches, validates emails in chunks, and writes progress back to Redis.

## Responsibilities
- Reads configuration from `app.config.settings`, instantiates `EmailValidator`, and manages connections to Redis (`redis.asyncio`) and RabbitMQ (`aio_pika.connect_robust`).
- Declares the main queue (`settings.RABBITMQ_QUEUE`) with a dead-letter queue and enforces `prefetch_count` so each worker processes one message at a time.
- `process_emails(batch_id, emails, validation_flags)` splits the batch into `settings.WORKER_BATCH_SIZE` chunks, validates each chunk concurrently, publishes incremental progress to both Redis key `validation_results:{batchId}` and the `email_validation_results` pub/sub channel, and sends a final “complete” payload when done. The circuit breaker is reset per batch.
- `process_message(message)` wraps message handling in `async with message.process()` which ACKs on success or rejects to the DLQ on failure.
- `run()` connects to infrastructure and iterates `self.queue.iterator()` to keep consuming until shutdown. `start_worker()` is a convenience entrypoint used by `run_workers.py`.

