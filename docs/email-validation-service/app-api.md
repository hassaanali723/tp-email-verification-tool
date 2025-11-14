# `app/api` Directory

## `routes.py`
**Purpose:** Holds every FastAPI endpoint for the email validation microservice. Registers rate limiting, authentication, RabbitMQ publishing, and Redis-backed status lookups.

### Key implementation points
- `router = APIRouter()` plus module-level instances of `EmailValidator` and `DNSValidator`.
- Dependencies:  
  - `get_redis()` returns an async Redis client for tracking status and multi-batch metadata.  
  - `get_circuit_breaker()` wraps a synchronous Redis client with `CircuitBreaker`.
- Every route decorates with `@limiter.limit(RATE_LIMITS["..."])` and expects `auth: AuthContext = RequireAuth`.
- Handles both synchronous validations and queued batch workflows using `split_into_batches`, `queue_batch_for_processing`, and `create_batch_tracking`.

### Endpoints
- `POST /validate`: validates the first email in `EmailValidationRequest`.
- `POST /validate-batch`: orchestrates inline validation, single-batch queuing, or multi-batch queuing with Redis tracking.
- `GET /validation-status/{batch_id}`: returns cached batch progress or redirects to multi-status if the ID maps to a parent request.
- `GET /multi-validation-status/{request_id}`: aggregates status for all child batches via `get_multi_batch_status`.
- Cache utilities: `GET /cache/view/{cache_type}` and `DELETE /cache/clear/{cache_type}`.
- Circuit-breaker utilities: `GET /circuit-breaker/status`, `POST /circuit-breaker/reset`.
- Diagnostic helpers: `POST /test-dns-validation` (DNS-only check) and `POST /validate-email` (single-email with query flag overrides).

### External interactions
- **RabbitMQ**: `aio_pika.connect_robust` publishes `{batchId, emails, validation_flags}` messages to `settings.RABBITMQ_QUEUE`.
- **Redis**: Stores `validation_results:{batchId}`, `multi_batch:{requestId}`, and `batch_parent:{batchId}`; matches what `EmailValidationWorker` writes.
- **Logging**: emits user ID, client identifier, and error context for each significant operation.

> _Note:_ As of this commit the `app/api` directory contains only `routes.py`. If additional modules are added in the future, extend this document with a section per file describing its responsibilities.

