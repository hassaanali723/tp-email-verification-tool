## Email Verification Tool – Monorepo

A production-ready email verification platform with real-time results, subscription and billing via Stripe, and multi-service architecture. The repo is a monorepo containing a Next.js frontend, a Node.js backend API, and a Python FastAPI validation service with background workers.

### Repository Structure

```
email-verification-tool/
  backend/                    # Node.js/Express API (MongoDB, Redis, Stripe, Nodemailer, SSE)
  email-validation-service/   # FastAPI microservice + workers (DNS/SMTP validation, Redis, RabbitMQ)
  frontend/                   # Next.js app (Clerk auth, dashboard, Subscription & Support tabs)
  docs/                       # Project docs (optional; add more here)
```

## High-Level Architecture

```mermaid
flowchart LR
  subgraph Frontend [Next.js Frontend]
    UI[Dashboard\nUpload CSV\nResults\nSubscription\nSupport]
    SSEClient[EventSource SSE]
  end

  subgraph Backend [Node.js Backend API]
    API[Express API\nAuth Clerk\nFile Uploads]
    Payments[Stripe Integration\nCheckout · Webhooks · Billing Portal]
    Credits[Credits Service\nReservation · Consume · Refund]
    SSE[Server-Sent Events]
    Mongo[(MongoDB)]
    Redis[(Redis)]
    Mail[Nodemailer]
  end

  subgraph Validator [FastAPI Email Validation Service]
    FastAPI[FastAPI API /api/v1]
    Workers[Background Workers]
    RQ[(RabbitMQ)]
    RCache[(Redis)]
  end

  Stripe[Stripe]

  UI -->|HTTP (JWT/Clerk)| API
  SSEClient <-->|SSE stream| SSE

  API -->|create job| FastAPI
  API <--> Redis
  API <--> Mongo
  API --> Payments
  Payments <--> Stripe
  API --> Mail

  FastAPI <--> RCache
  FastAPI -->|enqueue batches| RQ
  Workers -->|publish results| RCache

  RCache -->|pub/sub progress| API
  API -->|SSE push events| SSEClient
```

### Key Responsibilities

- Frontend (Next.js):
  - Auth (Clerk), dashboard UI, file upload, live results via SSE, subscription and invoices, support ticket submission.
- Backend (Node.js/Express):
  - Auth validation, file ingestion, credit accounting (real-time incremental consumption), Stripe checkout/webhooks/subscription mgmt, SSE broadcasting, support tickets + email notifications.
- Validation Service (FastAPI):
  - Email validation via DNS and SMTP with circuit breaker, multi-batch parallelization, caching, and worker orchestration (RabbitMQ + workers).
- Infra:
  - Redis for caching, pub/sub, and cross-service coordination.
  - RabbitMQ for background work queues (batch processing).
  - MongoDB for persistence (files, results, users/credits, support tickets).
  - Stripe for payments, subscriptions, invoices, and receipts.

## Data Flow Overview

### Upload and Validation (Real-time)
1. User uploads file on the frontend → `backend` stores metadata in Mongo and schedules validation.
2. `backend` calls FastAPI `/api/v1/validate-batch` (or multi-batch) to start validation.
3. FastAPI enqueues work to RabbitMQ, workers process batches and cache results/progress in Redis.
4. `backend` subscribes to Redis updates and streams progress/results via SSE to the frontend.
5. Credits are deducted incrementally as validated results arrive (real-time consumption), with a final reconciliation on completion to avoid over/under-charging.

### Credits and Billing
- One-time purchases (Pay-as-you-go): Stripe Checkout; webhook credits the user.
- Subscriptions (Monthly): Stripe subscription; `invoice.payment_succeeded` webhook grants monthly credits; users can cancel (end of period) or cancel now; resume supported.
- Credit history groups consumption by file and includes purchases, trials, refunds (30-day window by default).

### Support Tickets
- Frontend submits a ticket (name, email, problem, optional image).
- `backend` persists the ticket in Mongo and emails `hassaanali.dev@gmail.com` via Nodemailer.

## Server-Sent Events (SSE)
- `backend/routes/events.js` streams JSON-encoded progress and results per file.
- Writer is hardened against JSON serialization errors to avoid broken streams.
- Frontend listens with `EventSource` and updates UI and download availability in real time.

## Services and Key Files

- Backend (Node.js/Express)
  - Entry: `backend/app.js` (includes `/health`, mounts routes)
  - Routes: `routes/emailValidation.js`, `routes/credits.js`, `routes/payments.js`, `routes/events.js`, `routes/support.js`
  - Services: `services/redisService.js`, `fileProcessingService.js`, `emailValidationService.js`, `creditService.js`
  - Models: `models/EmailBatches.js`, `EmailResults.js`, `File.js`, `UserCredits.js`, `SupportTicket.js`
  - Utils: `utils/logger.js`

- FastAPI (Python)
  - App: `email-validation-service/main.py`
  - API: `app/api/routes.py` (mounted under `/api/v1`)
  - Services: `app/services/validator.py`, `dns_validator.py`, `cache_service.py`, `circuit_breaker.py`
  - Workers: `run_workers.py`, `worker.py`
  - Config: `app/config.py` (Railway env auto-mapping for Redis/RabbitMQ)

- Frontend (Next.js)
  - App dir: `frontend/src/app` (dashboard, subscription, support)
  - Lib: `frontend/src/lib/*.ts` (API clients, SSE)
  - Stores: `frontend/src/store/*`
  - Components: `frontend/src/components/*`

## Environment Variables

### Backend (Node.js)
- Mongo: `MONGODB_URI`
- Redis: `REDIS_URL` (preferred) or `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Auth: Clerk vars used on frontend; backend validates tokens (check your setup)
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SUPPORT_INBOX`

### FastAPI
- Redis: `REDIS_URL` or `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`
- RabbitMQ: `RABBITMQ_PRIVATE_URL` (Railway) or `RABBITMQ_HOST`, `RABBITMQ_PORT`, `RABBITMQ_USER`, `RABBITMQ_PASS`, `RABBITMQ_VHOST`
- Other: optional service tuning vars documented in `app/config.py`

### Frontend (Next.js)
- API base: `NEXT_PUBLIC_API_BASE_URL` (e.g., `https://your-backend.railway.app` without port)
- Clerk: Standard Clerk publishable keys

## Local Development

### Prerequisites
- Node.js 18+
- Python 3.10+
- MongoDB, Redis, RabbitMQ (local or Docker), Stripe keys

### Quickstart
1. Backend
   - `cd backend && npm install`
   - Configure `.env` with Mongo, Redis, Stripe, SMTP
   - `npm run dev`
2. FastAPI
   - `cd email-validation-service && pip install -r requirements.txt`
   - Configure `.env` (Redis, RabbitMQ); local values are fine
   - Run API: `uvicorn main:app --reload`
   - Run workers: `python run_workers.py`
3. Frontend
   - `cd frontend && npm install`
   - Set `NEXT_PUBLIC_API_BASE_URL`
   - `npm run dev`

## Deployment (Railway)

- FastAPI service
  - Builder: Nixpacks (default). Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
  - Healthcheck: `/` or `/docs` or `/api/v1/health` if added
  - Workers: separate service using `python run_workers.py` (no HTTP healthcheck)

- Backend (Node.js)
  - Start: `npm run start`
  - Env: Mongo, Redis (prefer public `REDIS_URL`), Stripe webhook secret
  - Exposes `/health` for Railway health checks

- Frontend (Next.js)
  - Start: default Railway Next.js builder
  - Ensure `NEXT_PUBLIC_API_BASE_URL` has no port on https domains
  - For CI convenience: `eslint.ignoreDuringBuilds=true`, `typescript.ignoreBuildErrors=true` in `next.config.ts`

- Stripe Webhooks
  - Local: use Stripe CLI to forward events to `backend` webhook endpoint
  - Cloud: set webhook endpoint to `https://<backend-domain>/api/stripe/webhook`

## Core API Surfaces (Pointers)

- Backend
  - Credits: `GET /api/credits/balance`, `GET /api/credits/history?group=by_file`
  - Payments: `GET /api/payments/subscription`, `POST /api/payments/cancel-subscription`, `POST /api/payments/cancel-subscription-now`, `POST /api/payments/resume-subscription`, `GET /api/payments/invoices`
  - Validation: `POST /api/email-validation/upload`, `GET /api/email-validation/user-stats`
  - Events (SSE): `GET /api/events/stream?fileId=...`
  - Support: `POST /api/support/submit`, `GET /api/support/my`

- FastAPI
  - `POST /api/v1/validate`, `POST /api/v1/validate-batch`
  - Status endpoints and circuit breaker endpoints (see service README)

## Troubleshooting

- Redis connection errors
  - Prefer `REDIS_URL`. If using host/port, ensure password is set when required.
- RabbitMQ ACCESS_REFUSED
  - Verify username/password/vhost; when on Railway, parse from `RABBITMQ_PRIVATE_URL`.
- 404 from FastAPI endpoints
  - Ensure calls include `/api/v1` prefix; verify service URL.
- Frontend timeouts
  - Remove ports from `NEXT_PUBLIC_API_BASE_URL` when using HTTPS Railway domains.
- Stripe events not applying
  - Confirm webhook endpoint URL and signing secret; check `invoice.payment_succeeded` handling on backend.
- SSE stream issues
  - Ensure JSON-serializable payloads; backend has guardrails, but malformed data can still break clients.

---

Maintainers: see per-service READMEs for deeper implementation details. Contributions welcome.