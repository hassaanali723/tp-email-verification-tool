# `run_workers.py`

Launcher script that spawns multiple worker processes. It improves throughput on large uploads by running several instances of `EmailValidationWorker` in parallel.

## Responsibilities
- Reads `settings.WORKER_COUNT` to determine how many processes to start.
- Configures logging and uses `ProcessPoolExecutor` to spawn the requested number of child processes.
- Each child process executes `asyncio.run(start_worker())`, which is defined in `app/worker.py`.
- Installs signal handlers (`SIGINT`, `SIGTERM`) so Ctrl+C or platform shutdown gracefully stops every worker.
- Keeps the parent process alive with an infinite `asyncio.sleep(1)` loop until cancellation, ensuring workers keep running in the background service (e.g., Railway worker deployment).

Use this script when you need to run multiple workers locally or in a production worker container.

