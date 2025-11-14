# `app/services` Directory

This is where the core validation logic lives: SMTP/DNS checks, caching, and the circuit breaker that protects the system from repeated SMTP failures. Below is a description of each file based on the current implementation in `origin/main`.

## `validator.py`
**What it does:** Implements the full email validation workflow invoked by both the HTTP endpoints and the background worker.

- Steps through syntax validation, MX lookups (DNS), disposable/role detection, blacklist checks, SMTP handshake, and catch-all detection, in that order.
- Integrates the `CircuitBreaker`: before each chunk it checks `is_open`; timeouts and connection failures call `record_smtp_timeout`, successful SMTP conversations call `record_smtp_success`.
- Uses `DNSValidator` for fallback when SMTP is disabled or the circuit is open.
- Computes `deliverability_score` and `risk_level` by evaluating `EmailAttributes` (free email, role account, catch-all, etc.).
- Writes results into `EmailValidationResult` objects that downstream components store in Redis or return to clients.

## `dns_validator.py`
**What it does:** Provides DNS-only validation when SMTP is unavailable or intentionally skipped.

- Performs MX, A, SPF, and additional heuristic checks (valid MX syntax, backup MX records, known provider patterns).
- Calculates a confidence score (weighted by MX/A/SPF/additional checks) and caps the deliverability score at 80%, since DNS-only validation is less definitive.
- Detects likely catch-all domains based on provider heuristics (`common_catchall_providers` list).

## `circuit_breaker.py`
**What it does:** Guards SMTP validation by tracking consecutive timeouts/errors across all worker processes via Redis.

- Stores counters under keys like `smtp_consecutive_timeout_failures`, `smtp_circuit_status`, `smtp_last_timeout`.
- `record_smtp_timeout()` increments the consecutive failure counter and opens the circuit when `SMTP_CIRCUIT_BREAKER_THRESHOLD` is reached.
- `record_smtp_success()` resets the counter and keeps the circuit closed.
- When open, `is_open` returns `True`, prompting the validator to switch to DNS-only mode; the `reset()` method (exposed via API) clears the state.

## `cache_service.py`
**What it does:** Utilities for caching validation artifacts in Redis so repeated checks can reuse prior results (MX records, blacklist lookups, disposable domain lists, etc.). The worker and validators read/write these caches based on toggles defined in `app.config.settings`.

Together these service modules determine how each email is validated, when to fall back to DNS, and how Redis caches and circuit-breaker state are used to keep the pipeline fast and resilient. 

