# `app/models` Directory

This directory houses Pydantic schemas used throughout the email validation service. These models define the shape of API payloads, validation results, and batch-tracking responses returned to the Node.js backend and frontend clients.

## `validation.py`
**What it does:** Defines every schema involved in describing validation requests, individual email results, and batch/multi-batch status responses.

### Highlights
- Enumerations (`ValidationStatus`, `UndeliverableReason`, `RiskyReason`, `UnknownReason`) standardize the statuses emitted by validators and workers.
- Structured detail objects:
  - `EmailAttributes`, `MailServerInfo`, `BlacklistInfo`, `ValidationDetails` capture granular attributes returned for each email (free provider, catch-all, SMTP provider, blacklist hits, etc.).
- `EmailValidationResult`: canonical shape returned by `validator.validate_email(...)` and the worker—includes `status`, `risk_level`, `deliverability_score`, and nested `details`.
- `EmailValidationRequest`: request body accepted by `POST /validate` and `POST /validate-batch`. Contains the `emails` list and boolean flags for MX/SMTP/disposable/catch-all/blacklist checks.
- Batch response models:
  - `BatchValidationResponse` (single batch) and `MultiBatchResponse` (multi-batch) convey `batchId`/`requestId`, counts, status, and optional `results`.
  - `ValidationStatusResponse` and `MultiStatusResponse` are used by status endpoints when reading cached data from Redis.

These schemas ensure every component—the HTTP layer, worker, and frontend—share a consistent contract for representing validation progress and outcomes.

