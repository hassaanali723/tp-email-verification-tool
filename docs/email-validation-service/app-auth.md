# `app/auth` Directory

This directory secures every request that reaches the FastAPI service. It validates the shared API key between the Node.js backend and the email validator, records the authenticated user context, defines structured auth errors, and throttles abusive clients via Redis-backed rate limiting.

## `dependencies.py`
**What it does:** Implements the `RequireAuth` dependency used by all routes. Every incoming call must carry the correct API key and a user identifier header. The dependency enforces those requirements, logs the attempt, and hands the downstream handler an `AuthContext`.

**Key behaviors**
- Reads header names from configuration so they stay consistent across services.
- Supports a development mode (`settings.ENABLE_AUTH = False`) that injects a synthetic context without rejecting requests.
- Raises precise FastAPI `HTTPException`s: `401` for missing/invalid API key, `400` for missing user ID.
- Exports `RequireAuth = Depends(verify_api_key_and_user)` so route signatures stay tidy.

## `models.py`
**What it does:** Provides the Pydantic models that represent authentication state everywhere else in the service.

- `AuthContext` describes the currently authenticated user (ID, timestamp, optional client identifier, and any free-form metadata). A validator keeps `user_id` non-empty, and `json_encoders` ensure timestamps serialize cleanly.
- `AuthenticatedRequest` is a convenience base class for any payload that must bundle business data with an `auth_context`.
- `APIKeyValidationResult` captures the outcome of key checks (useful for additional tooling or admin endpoints).

These models guarantee that any component touching auth data uses the same structure and validation rules.

## `exceptions.py`
**What it does:** Defines a hierarchy of custom authentication/authorization errors (`AuthenticationError`, `AuthorizationError`, plus specific subclasses for invalid API keys or missing context). While FastAPI currently emits `HTTPException`s directly, these classes provide a standardized way to bubble up auth failures if middleware or reusable error handlers are added later.

## `rate_limiter.py`
**What it does:** Configures a **slowapi** `Limiter` that uses Redis to count requests per user/IP. This keeps any single tenant from overwhelming the validation pipeline.

**Highlights**
- `get_user_id(request)` prefers the authenticated user ID; when absent it falls back to the remote IP address (`slowapi.util.get_remote_address`), so anonymous callers still get throttled.
- Uses the same Redis host/port/password/db as the rest of the service for consistency.
- Publishes a single `RATE_LIMITS` map consumed by route decorators (`batch_validation`/`single_validation` = 40 per minute, `status_check`/`admin` = 50 per minute).

Together these modules ensure every FastAPI endpoint receives authenticated, rate-limited traffic with consistent context information that the rest of the service can trust.

