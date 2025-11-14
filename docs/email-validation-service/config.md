# `app/config.py`

Central configuration module powered by **pydantic-settings**. It defines every environment variable used by the FastAPI service, including API metadata, auth headers, validation toggles, SMTP/DNS timeouts, cache TTLs, RabbitMQ/Redis credentials, worker settings, and feature flags such as `DNS_ONLY_MODE_ENABLED`.

Key behaviors:
- Validates that `API_KEY` meets the minimum length requirement.
- Supports both explicit `REDIS_*` / `RABBITMQ_*` variables and Railway-provided URLs (`REDIS_URL`, `RABBITMQ_PRIVATE_URL`), parsing whichever is present.
- Exposes a singleton `settings = Settings()` used across the codebase (routes, services, worker, etc.).

