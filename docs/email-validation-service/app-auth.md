# `app/auth` Directory

This folder contains all authentication plumbing for the FastAPI service: API-key validation, reusable auth context models, custom exceptions, and rate limiting. Below is an exact summary of each file as it exists in `origin/main`.

## `dependencies.py`
- Exposes `verify_api_key_and_user`, the dependency injected into routes as `RequireAuth`.
- Reads API key and user headers (names pulled from `settings.API_KEY_HEADER`, `USER_ID_HEADER`, `CLIENT_ID_HEADER`).
- Behavior:
  - If `settings.ENABLE_AUTH` is `False`, returns a development `AuthContext` (user ID defaults to provided header or `"dev-user"`).
  - Raises `HTTPException 401` when the API key header is missing or does not match `settings.API_KEY`.
  - Raises `HTTPException 400` if `X-User-ID` is absent.
  - Logs authentication attempts and returns a populated `AuthContext` (user ID plus optional client identifier).
- Exported alias `RequireAuth = Depends(verify_api_key_and_user)` keeps route signatures concise.

## `models.py`
- Defines the data structures shared by auth-related code.
  - `AuthContext`: includes `user_id`, `request_timestamp` (UTC default), optional `client_identifier`, and `additional_context` dict. A validator trims/ensures `user_id` is non-empty, and `json_encoders` serialize datetimes via ISO8601.
  - `AuthenticatedRequest`: base class for payloads that must embed an `auth_context` object.
  - `APIKeyValidationResult`: describes the outcome of API-key checks (`is_valid`, `user_id`, `validation_timestamp`, optional `error_message`).
- Each model ships with `schema_extra` examples so Swagger/OpenAPI clearly document expected shapes.

## `exceptions.py`
- Provides typed exception classes for future middleware or service-level error handling:
  - `AuthenticationError` (base) and `AuthorizationError` (insufficient permissions).
  - `InvalidAPIKeyError` and `MissingUserContextError` extend `AuthenticationError` with specific default messages/error codes.
- Currently the HTTP layer throws FastAPI `HTTPException`s directly, but these classes are ready if centralized handlers are added later.

## `rate_limiter.py`
- Wraps **slowapi** for request throttling.
- `get_user_id(request)` chooses the rate-limit key: `"user:{user_id}"` when the header is present, otherwise falls back to the remote IP address provided by `slowapi.util.get_remote_address`.
- Initializes a Redis client (using the same host/port/password/db as the rest of the service) and creates `limiter = Limiter(...)` with that storage backend.
- Exposes a single dictionary `RATE_LIMITS` used by route decorators: `batch_validation` and `single_validation` at `40/minute`, `status_check` and `admin` at `50/minute`.

Together these files ensure every request is authenticated, rate-limited, and has consistent context information available throughout the service. 

