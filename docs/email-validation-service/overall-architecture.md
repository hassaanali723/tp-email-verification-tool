# FastAPI Email Validation Service – Architecture

This file combines the service-wide overview and the in-depth call flow for the FastAPI microservice found under `email-validation-service/`.

## 1. Top-Level Service View

```mermaid
flowchart TB
    subgraph FastAPI["FastAPI Service<br/>(email-validation-service/)"]
        direction TB
        Routes["API Routes<br/>app/api/routes.py"]
        BatchUtils["Batch Utilities<br/>utils/batch_utils.py"]
        Worker["Background Worker<br/>worker.py / run_workers.py"]
        Validator["EmailValidator<br/>services/validator.py"]
        Circuit["CircuitBreaker<br/>services/circuit_breaker.py"]
        DNSVal["DNSValidator<br/>services/dns_validator.py"]
    end

    Backend["Node.js Backend<br/>(consumer of this service)"]
    MQ["RabbitMQ<br/>email_validation queue"]
    Redis["Redis<br/>progress + pub/sub + circuit state"]
    SMTP["Mail Servers / DNS"]

    Backend -->|POST /api/v1/validate-batch| Routes
    Routes --> BatchUtils
    BatchUtils -->|queue_batch_for_processing| MQ
    MQ -->|deliver batch| Worker
    Worker -->|acknowledge / subscribe| MQ
    Worker --> Validator
    Validator -->|SMTP handshake<br/>+ fallback| SMTP
    Validator --> Circuit
    Validator --> DNSVal
    Worker -->|set progress & publish| Redis
    Circuit <-->|state| Redis
    Routes -->|status queries| Redis
```

## 2. Detailed Flow with Code Touchpoints

```mermaid
sequenceDiagram
    participant Backend as Node.js Backend
    participant Routes as routes.py
    participant BatchUtils as batch_utils.py
    participant Rabbit as RabbitMQ
    participant Worker as worker.py
    participant Validator as validator.py
    participant Circuit as circuit_breaker.py
    participant Redis as Redis

    Backend->>Routes: POST /api/v1/validate-batch\n(EmailValidationRequest)
    Routes->>Routes: split_into_batches(...)
    alt single batch
        Routes->>BatchUtils: queue_batch_for_processing(batchId, emails, flags)
    else multi batch
        Routes->>BatchUtils: queue_batch_for_processing(...) x N
        Routes->>Redis: create_batch_tracking(requestId, batchIds, total)
    end
    Routes-->>Backend: BatchValidationResponse | MultiBatchResponse

    Rabbit-->>Worker: batch message {batchId, emails, flags}
    Worker->>Rabbit: ack via message.process()
    Worker->>Circuit: is_open?
    loop per chunk (settings.WORKER_BATCH_SIZE)
        Worker->>Validator: validate_email(email, flags)
        alt circuit open or SMTP disabled
            Validator->>Validator: dns_validator.validate(...)
        else
            Validator->>Circuit: record_smtp_timeout/success
        end
    end
    Worker->>Redis: setex validation_results:{batchId}
    Worker->>Redis: publish email_validation_results
    Worker->>Circuit: reset() at batch end

    Backend->>Routes: GET /validation-status/{batchId}
    Routes->>Redis: get validation_results:{batchId}
    Redis-->>Routes: JSON progress/result
    Routes-->>Backend: ValidationStatusResponse
```

### Key Implementation Notes

- `routes.validate_batch` orchestrates batching, RabbitMQ publishing, and Redis tracking.
- `batch_utils.queue_batch_for_processing` serialises `{batchId, emails, validation_flags}` with `aio_pika.Message(..., delivery_mode=PERSISTENT)`.
- `EmailValidationWorker.process_emails` (in `worker.py`) runs chunks concurrently via `asyncio.gather`, writing progress to `validation_results:{batchId}` and publishing to the `email_validation_results` channel.
- `EmailValidator.validate_email` steps through syntax, MX, blacklist, SMTP, and catch-all checks; it consults `CircuitBreaker` (`redis` keys `smtp_consecutive_timeout_failures`, `smtp_circuit_status`, etc.).
- `DNSValidator.validate` provides DNS-only scoring when SMTP is skipped (circuit open or `check_smtp=False`).
- `routes.get_validation_status` and `routes.get_multi_validation_status` read the cached JSON directly from Redis, ensuring status calls are O(1).

This architecture depiction is current for branch `docs/wiki-documentation` after commit `0359c8f`.