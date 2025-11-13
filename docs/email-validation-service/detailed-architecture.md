# FastAPI Email Validation Service – Detailed Architecture

This document drills into the runtime behavior of the FastAPI microservice. It is derived from the current implementation under `email-validation-service/` — no speculative behavior is described.

## Request-to-Result Flow

```mermaid
sequenceDiagram
    participant FE as Next.js Frontend
    participant NB as Node.js Backend API
    participant FA as FastAPI Service
    participant MQ as RabbitMQ (email_validation)
    participant WK as Worker (EmailValidationWorker)
    participant SMTP as Mail Servers/DNS
    participant RS as Redis

    FE->>NB: Upload CSV / request validation
    NB->>FA: POST /api/v1/validate-batch (emails[], flags, headers)
    FA->>FA: split_into_batches(emails)
    loop for each batchId
        FA->>MQ: Publish {batchId, emails, validation_flags}
    end
    alt multi-batch
        FA->>RS: setex multi_batch:{requestId}, batch_parent:{batchId}
    end
    FA-->>NB: 202 Accepted (BatchValidationResponse/MultiBatchResponse)
    NB-->>FE: Job reference (batchId or requestId)

    MQ-->>WK: Deliver message (ack on success)
    WK->>WK: process_emails(batchId, emails, validation_flags)
    loop per chunk (size=settings.WORKER_BATCH_SIZE)
        WK->>WK: validator.validate_email(email)
        alt SMTP enabled & circuit closed
            WK->>SMTP: DNS lookup + SMTP RCPT check
        else DNS fallback
            WK->>SMTP: DNS-only validation
        end
        WK->>RS: setex validation_results:{batchId}, publish email_validation_results
    end
    WK->>RS: Final result (isComplete=true), publish completion

    NB<<-RS: Subscribed to email_validation_results
    NB-->>FE: Server-Sent Events (progress/results)
    FE->>NB: Poll /api/v1/validation-status or multi-validation-status
    NB->>FA: Status request
    FA->>RS: Fetch cached progress JSON
    FA-->>NB: ValidationStatusResponse / MultiStatusResponse
    NB-->>FE: REST response
```

## Major Components

### HTTP Interface (`app/api/routes.py`)
- **Endpoints** under `/api/v1` (prefixed in `main.py`):
  - `POST /validate` — immediate validation of a single email (runs validator directly).
  - `POST /validate-batch` — primary entry point for uploads. Uses dynamic batching and queues jobs.
  - `GET /validation-status/{batchId}` — returns JSON snapshot stored at `validation_results:{batchId}`.
  - `GET /multi-validation-status/{requestId}` — aggregates child batches from `multi_batch:{requestId}`.
  - Cache utilities and circuit breaker status/reset endpoints.
- **Auth & rate limiting**: `RequireAuth` validates API key headers; `slowapi` enforces per-endpoint limits.
- **Redis dependencies**: `get_redis()` yields an async Redis client for tracking/status; synchronous client is used where a short-lived connection suffices.

### Batch Utilities (`app/utils/batch_utils.py`)
- `split_into_batches(emails)` → chooses batch sizes based on total volume (10–150 emails per batch).
- `queue_batch_for_processing(...)` → publishes persistent messages to the `email_validation` queue.
- `create_batch_tracking(...)` → writes tracking metadata to Redis:
  - `multi_batch:{requestId}` — JSON with list of batch IDs, totals, status.
  - `batch_parent:{batchId}` — reverse lookup for parent request.
- `get_multi_batch_status(...)` → merges per-batch results from Redis to compute overall progress.

### Worker Runtime (`app/worker.py` + `run_workers.py`)
- `run_workers.py` spawns `settings.WORKER_COUNT` processes using `ProcessPoolExecutor`; each process runs `start_worker()`.
- `EmailValidationWorker.connect()`:
  - Creates a shared async Redis client.
  - Establishes a robust RabbitMQ connection/channel.
  - Declares the durable queue plus DLQ (`email_validation_dlq`) and sets QoS (`prefetch_count` from settings).
- `process_message(...)` → deserializes the payload and hands it to `process_emails(...)` inside `message.process()`, guaranteeing ACK on success or DLQ on failure.
- `process_emails(...)`:
  - Breaks the batch into chunks of `settings.WORKER_BATCH_SIZE`.
  - Evaluates `self.validator.circuit_breaker.is_open` to decide SMTP vs DNS.
  - Runs chunk validations concurrently via `asyncio.gather`.
  - After each chunk: updates `validation_results:{batchId}` (TTL `settings.REDIS_RESULT_EXPIRY`) and publishes to `email_validation_results` channel.
  - On completion: pushes final payload (`isComplete=true`), publishes again, logs circuit breaker metrics, and resets the breaker.

### Validation Logic (`app/services/validator.py`, `dns_validator.py`, `circuit_breaker.py`)
- **EmailValidator** orchestrates validation steps: syntax, MX lookup, disposable/role detection, blacklist checks, SMTP handshake, catch-all probe, risk scoring.
- **CircuitBreaker** stores state in Redis keys (`smtp_consecutive_timeout_failures`, `smtp_circuit_status`, etc.). After `SMTP_CIRCUIT_BREAKER_THRESHOLD` consecutive timeouts, SMTP is skipped until keys expire or `reset()` is called.
- **DNSValidator** delivers DNS-only results when SMTP is disabled or circuit is open. Confidence score mixes MX, A, SPF, and additional heuristics (capped at 80% score).

### Redis Usage
- **Progress snapshots**: `validation_results:{batchId}` per batch (JSON + TTL).
- **Multi-batch metadata**: `multi_batch:{requestId}`, `batch_parent:{batchId}`.
- **Pub/Sub**: channel `email_validation_results` pushes incremental updates to the Node backend.
- **Circuit breaker**: keys for consecutive failures, status, last timeout, historical counters.
- **Cache inspection**: endpoints can list `email_validation:*` keys when admin needs visibility.

### RabbitMQ Usage
- Queue: `email_validation` (durable). DLQ: `email_validation_dlq`.
- Message body: JSON with `batchId`, `emails`, and per-request validation flags.
- Delivery: persistent messages; workers ack via `message.process()` context manager. Failures call `message.reject(requeue=False)` to push to DLQ.

## Environment & Configuration Touchpoints
- `app/config.py` maps environment variables for Redis, RabbitMQ, API security, timeouts, worker counts, and feature toggles (e.g., `DNS_ONLY_MODE_ENABLED`).
- Railway deployment files (`Procfile`, `Procfile.worker`, `railway.json`, `railway.worker.json`) start the API via Uvicorn and workers via `python run_workers.py` in separate services.
- `requirements.txt` pins FastAPI, aio-pika, redis[hiredis], slowapi, and related dependencies.

## Data Guarantees
- Progress snapshots and multi-batch metadata expire after `REDIS_RESULT_EXPIRY` seconds to avoid stale data.
- Circuit breaker state expires automatically (`SMTP_CIRCUIT_BREAKER_TIMEOUT`) ensuring eventual recovery even without manual reset.
- Persistent RabbitMQ messages ensure batches aren’t lost if workers restart; DLQ allows investigation of failures without poisoning the main queue.

---
This architecture description matches the current codebase (branch `docs/wiki-documentation`) as of the latest revision. Any code change should be mirrored here to keep the documentation truthful.
# FastAPI Email Validation Service – Detailed Architecture

This document drills into the runtime behavior of the FastAPI microservice. It is derived from the current implementation under `email-validation-service/` — no speculative behavior is described.

## Request-to-Result Flow

```mermaid
sequenceDiagram
    participant FE as Next.js Frontend
    participant NB as Node.js Backend API
    participant FA as FastAPI Service
    participant MQ as RabbitMQ (email_validation)
    participant WK as Worker (EmailValidationWorker)
    participant SMTP as Mail Servers/DNS
    participant RS as Redis

    FE->>NB: Upload CSV / request validation
    NB->>FA: POST /api/v1/validate-batch (emails[], flags, headers)
    FA->>FA: split_into_batches(emails)
    loop for each batchId
        FA->>MQ: Publish {batchId, emails, validation_flags}
    end
    alt multi-batch
        FA->>RS: setex multi_batch:{requestId}, batch_parent:{batchId}
    end
    FA-->>NB: 202 Accepted (BatchValidationResponse/MultiBatchResponse)
    NB-->>FE: Job reference (batchId or requestId)

    MQ-->>WK: Deliver message (ack on success)
    WK->>WK: process_emails(batchId, emails, validation_flags)
    loop per chunk (size=settings.WORKER_BATCH_SIZE)
        WK->>WK: validator.validate_email(email)
        alt SMTP enabled & circuit closed
            WK->>SMTP: DNS lookup + SMTP RCPT check
        else DNS fallback
            WK->>SMTP: DNS-only validation
        end
        WK->>RS: setex validation_results:{batchId}, publish email_validation_results
    end
    WK->>RS: Final result (isComplete=true), publish completion

    NB<<-RS: Subscribed to email_validation_results
    NB-->>FE: Server-Sent Events (progress/results)
    FE->>NB: Poll /api/v1/validation-status or multi-validation-status
    NB->>FA: Status request
    FA->>RS: Fetch cached progress JSON
    FA-->>NB: ValidationStatusResponse / MultiStatusResponse
    NB-->>FE: REST response
```

## Major Components

### HTTP Interface (`app/api/routes.py`)
- **Endpoints** under `/api/v1` (prefixed in `main.py`):
  - `POST /validate` — immediate validation of a single email (runs validator directly).
  - `POST /validate-batch` — primary entry point for uploads. Uses dynamic batching and queues jobs.
  - `GET /validation-status/{batchId}` — returns JSON snapshot stored at `validation_results:{batchId}`.
  - `GET /multi-validation-status/{requestId}` — aggregates child batches from `multi_batch:{requestId}`.
  - Cache utilities and circuit breaker status/reset endpoints.
- **Auth & rate limiting**: `RequireAuth` validates API key headers; `slowapi` enforces per-endpoint limits.
- **Redis dependencies**: `get_redis()` yields an async Redis client for tracking/status; synchronous client is used where a short-lived connection suffices.

### Batch Utilities (`app/utils/batch_utils.py`)
- `split_into_batches(emails)` → chooses batch sizes based on total volume (10–150 emails per batch).
- `queue_batch_for_processing(...)` → publishes persistent messages to the `email_validation` queue.
- `create_batch_tracking(...)` → writes tracking metadata to Redis:
  - `multi_batch:{requestId}` — JSON with list of batch IDs, totals, status.
  - `batch_parent:{batchId}` — reverse lookup for parent request.
- `get_multi_batch_status(...)` → merges per-batch results from Redis to compute overall progress.

### Worker Runtime (`app/worker.py` + `run_workers.py`)
- `run_workers.py` spawns `settings.WORKER_COUNT` processes using `ProcessPoolExecutor`; each process runs `start_worker()`.
- `EmailValidationWorker.connect()`:
  - Creates a shared async Redis client.
  - Establishes a robust RabbitMQ connection/channel.
  - Declares the durable queue plus DLQ (`email_validation_dlq`) and sets QoS (`prefetch_count` from settings).
- `process_message(...)` → deserializes the payload and hands it to `process_emails(...)` inside `message.process()`, guaranteeing ACK on success or DLQ on failure.
- `process_emails(...)`:
  - Breaks the batch into chunks of `settings.WORKER_BATCH_SIZE`.
  - Evaluates `self.validator.circuit_breaker.is_open` to decide SMTP vs DNS.
  - Runs chunk validations concurrently via `asyncio.gather`.
  - After each chunk: updates `validation_results:{batchId}` (TTL `settings.REDIS_RESULT_EXPIRY`) and publishes to `email_validation_results` channel.
  - On completion: pushes final payload (`isComplete=true`), publishes again, logs circuit breaker metrics, and resets the breaker.

### Validation Logic (`app/services/validator.py`, `dns_validator.py`, `circuit_breaker.py`)
- **EmailValidator** orchestrates validation steps: syntax, MX lookup, disposable/role detection, blacklist checks, SMTP handshake, catch-all probe, risk scoring.
- **CircuitBreaker** stores state in Redis keys (`smtp_consecutive_timeout_failures`, `smtp_circuit_status`, etc.). After `SMTP_CIRCUIT_BREAKER_THRESHOLD` consecutive timeouts, SMTP is skipped until keys expire or `reset()` is called.
- **DNSValidator** delivers DNS-only results when SMTP is disabled or circuit is open. Confidence score mixes MX, A, SPF, and additional heuristics (capped at 80% score).

### Redis Usage
- **Progress snapshots**: `validation_results:{batchId}` per batch (JSON + TTL).
- **Multi-batch metadata**: `multi_batch:{requestId}`, `batch_parent:{batchId}`.
- **Pub/Sub**: channel `email_validation_results` pushes incremental updates to the Node backend.
- **Circuit breaker**: keys for consecutive failures, status, last timeout, historical counters.
- **Cache inspection**: endpoints can list `email_validation:*` keys when admin needs visibility.

### RabbitMQ Usage
- Queue: `email_validation` (durable). DLQ: `email_validation_dlq`.
- Message body: JSON with `batchId`, `emails`, and per-request validation flags.
- Delivery: persistent messages; workers ack via `message.process()` context manager. Failures call `message.reject(requeue=False)` to push to DLQ.

## Environment & Configuration Touchpoints
- `app/config.py` maps environment variables for Redis, RabbitMQ, API security, timeouts, worker counts, and feature toggles (e.g., `DNS_ONLY_MODE_ENABLED`).
- Railway deployment files (`Procfile`, `Procfile.worker`, `railway.json`, `railway.worker.json`) start the API via Uvicorn and workers via `python run_workers.py` in separate services.
- `requirements.txt` pins FastAPI, aio-pika, redis[hiredis], slowapi, and related dependencies.

## Data Guarantees
- Progress snapshots and multi-batch metadata expire after `REDIS_RESULT_EXPIRY` seconds to avoid stale data.
- Circuit breaker state expires automatically (`SMTP_CIRCUIT_BREAKER_TIMEOUT`) ensuring eventual recovery even without manual reset.
- Persistent RabbitMQ messages ensure batches aren’t lost if workers restart; DLQ allows investigation of failures without poisoning the main queue.

---
This architecture description matches the current codebase (branch `docs/wiki-documentation`) as of the latest revision. Any code change should be mirrored here to keep the documentation truthful.

