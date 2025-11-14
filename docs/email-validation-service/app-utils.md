# `app/utils` Directory

Utility helpers used by the FastAPI layer and the worker live here. They keep batch orchestration and validation heuristics in one place so the rest of the codebase can focus on business logic.

## `batch_utils.py`
**What it does:** Manages the lifecycle of a batch job—splitting uploads, enqueuing messages, and tracking multi-batch progress in Redis.

- `split_into_batches(emails)` inspects the total email count and returns evenly sized slices (10, 20, 30, 50, 100, or 150) so workers process predictable workloads without overwhelming Redis/SSE updates.
- `queue_batch_for_processing(connection, batch_id, emails, validation_flags)` publishes a JSON body (`{batchId, emails, validation_flags}`) to the RabbitMQ queue defined in `settings.RABBITMQ_QUEUE`, marking the message as persistent so it survives broker restarts.
- `create_batch_tracking(redis_client, request_id, batch_ids, total_emails)` seeds Redis with:  
  - `multi_batch:{requestId}` → master record containing the list of child `batchIds`, totals, and timestamps.  
  - `batch_parent:{batchId}` → reverse lookup pointing each batch to its parent `requestId`.
- `get_multi_batch_status(redis_client, request_id)` loads `multi_batch:{requestId}`, refreshes it with real-time counts pulled from `validation_results:{batchId}`, computes a progress label like `"345/1000 (34%)"`, and writes the updated JSON back with a fresh TTL (`settings.REDIS_RESULT_EXPIRY`).

These utilities bridge the HTTP layer and the worker so both sides agree on job IDs and progress reporting.

## `validation_constants.py`
**What it does:** Central list of classification data—free email providers, disposable domains, role prefixes (e.g., `admin@`, `support@`), known catch-all providers, and SMTP MX patterns. `validator.py` and `dns_validator.py` import these definitions to interpret email addresses consistently, ensuring every validation result uses the same taxonomy (e.g., identifying `gmail.com` as a free provider or flagging specific disposable domains). 

