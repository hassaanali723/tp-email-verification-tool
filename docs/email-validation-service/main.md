# `main.py`

Entry point for the FastAPI microservice. Its responsibilities are purely infrastructural—no business logic lives here.

## Responsibilities
- Instantiates `FastAPI` with metadata from `app.config.settings` (`PROJECT_NAME`, description, version).
- Registers the shared slowapi rate limiter: `app.state.limiter = limiter` and adds the `_rate_limit_exceeded_handler`.
- Configures CORS with permissive defaults (`allow_origins=["*"]`, etc.) so the frontend and backend can hit the service during development; comments note to tighten this in production.
- Includes the router from `app/api/routes.py` under the prefix `settings.API_V1_STR` with the tag `"email-validation"`.
- Exposes two health endpoints used by deployment platforms:
  - `GET /health` → `{"status": "healthy"}`
  - `GET /` → friendly JSON with links to `/docs` and the versioned OpenAPI URL.

That’s all: the module wires middleware, routing, and health checks so `uvicorn main:app` can serve the validator.

