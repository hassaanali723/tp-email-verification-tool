# `app/utils` Directory

Utility helpers used by the FastAPI layer and background worker live here. They encapsulate batching logic, Redis tracking, and constants shared across validators.

## `batch_utils.py`
**Purpose:** Orchestrates batch splitting, queuing, and multi-batch status tracking.

- `split_into_batches(emails)` chooses a batch size based on total email count (10–150) to balance throughput and responsiveness.
- `queue_batch_for_processing(connection, batch_id, emails, validation_flags)` serializes a RabbitMQ message (`{batchId, emails, validation_flags}`) and publishes it with `DeliveryMode.PERSISTENT`.
- `create_batch_tracking(redis_client, request_id, batch_ids, total_emails)` writes `multi_batch:{requestId}` plus child `batch_parent:{batchId}` keys so the status endpoints know how to aggregate results.
- `get_multi_batch_status(redis_client, request_id)` reads per-batch progress from Redis, updates totals, computes a `progress` string, and refreshes the TTL.

## `validation_constants.py`
**Purpose:** Provides shared lists and mappings (free email providers, disposable domains, role prefixes, catch-all heuristics, SMTP provider patterns). Both `validator.py` and `dns_validator.py` import these constants to classify emails consistently.

