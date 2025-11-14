# `run_workers.bat`

Windows batch script that mirrors `run_workers.py` for local development on Windows machines.

## Responsibilities
- Activates the local Python environment (if needed) and runs `python run_workers.py`.
- Provides a simple 1-line command so Windows developers can double-click or run the batch file to start the worker pool without typing the full Python command.

All functional logic lives inside `run_workers.py`; this file is purely a convenience wrapper for Windows environments. 

