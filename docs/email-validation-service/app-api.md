# `app/api` Directory Documentation

This note tracks the current contents of `email-validation-service/app/api/` (reference: branch `docs/wiki-documentation`, synced with `origin/main`). The directory presently contains a single module, `routes.py`. Everything below is pulled directly from that file—no behavior is assumed beyond what exists in code.

## `routes.py`
| Aspect | Details |
| --- | --- |
| Primary role | Defines all HTTP routes served by the FastAPI service (under prefix `settings.API_V1_STR`). |
| Imports | `EmailValidationResult`, `EmailValidationRequest`, other validation models; service classes (`EmailValidator`, `DNSValidator`, `CircuitBreaker`); utilities (`split_into_batches`, `create_batch_tracking`, `queue_batch_for_processing`, `get_multi_batch_status`); authentication (`RequireAuth`, `AuthContext`); rate limiter (`limiter`, `RATE_LIMITS`); Redis clients (`redis.asyncio` and synchronous `redis`). |
| Router setup | `router = APIRouter()`; attaches global instances of `EmailValidator`/`DNSValidator`. Provides `get_redis()` and `get_circuit_breaker()` dependencies for status endpoints. |
| Rate limiting | Each route uses `@limiter.limit(RATE_LIMITS["…"])` with keys defined in `app/auth/rate_limiter.py`. |
| Authentication | All user-facing routes require `auth: AuthContext = RequireAuth`. The dependency validates the API key + user headers before hitting business logic. |

### Endpoint Inventory
| Route | Description |
| --- | --- |
| `POST /validate` | Validates the first email in `EmailValidationRequest`. Returns an `EmailValidationResult`. |
| `POST /validate-batch` | Main ingest path. <br/>• If `len(emails) <= settings.SMALL_BATCH_THRESHOLD`, validates inline.<br/>• Otherwise splits via `split_into_batches` and publishes each batch with `queue_batch_for_processing(...)` (RabbitMQ).<br/>• Multi-batch submissions call `create_batch_tracking(redis_client, request_id, batch_ids, total)` to persist status metadata before returning a `MultiBatchResponse`. |
| `GET /validation-status/{batch_id}` | Reads Redis key `validation_results:{batch_id}`. If absent but `batch_parent:{batch_id}` exists, redirects the caller to `/multi-validation-status/{request_id}`. |
| `GET /multi-validation-status/{request_id}` | Calls `get_multi_batch_status(redis_client, request_id)` to aggregate child batches, compute `progress`, and return a `MultiStatusResponse`. |
| `GET /cache/view/{cache_type}` / `DELETE /cache/clear/{cache_type}` | Administrative endpoints for inspecting or clearing Redis caches (`full`, `mx`, `blacklist`, `disposable`, `catch_all`, or `all`). |
| `GET /circuit-breaker/status` | Uses injected `CircuitBreaker` to report state (`status`, `consecutive_smtp_timeouts`, `last_timeout`, etc.). |
| `POST /circuit-breaker/reset` | Calls `circuit_breaker.reset()` to close the breaker and zero failure counters. |
| `POST /test-dns-validation` | Invokes `dns_validator.validate(email)` to perform DNS-only checks, useful for troubleshooting. |
| `POST /validate-email` | Alternative single-email endpoint where validation options (`check_mx`, `check_smtp`, etc.) are passed via query parameters instead of a JSON body. |

### External Interactions
- **RabbitMQ**: `aio_pika.connect_robust` is used twice (single-batch and multi-batch paths) to publish `batchId` + `emails` + flag payloads to `settings.RABBITMQ_QUEUE`. Connections are closed immediately after publication.
- **Redis**: Async client handles job tracking and status reads. Keys set/read here must match the worker’s writes: `validation_results:{batchId}`, `multi_batch:{requestId}`, `batch_parent:{batchId}`.
- **Log messages**: Each route logs user ID and client identifier along with major operations for debugging.

No other files currently live inside `app/api/`. If new modules are added (e.g., sub-routers), expand this document with a new subsection per file. 

