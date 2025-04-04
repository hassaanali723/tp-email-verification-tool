#!/usr/bin/env python3
"""
Script to run multiple worker instances in parallel for the email validation service.
This improves throughput by processing multiple batches simultaneously.
"""

import asyncio
import os
import sys
import signal
import logging
import time
from concurrent.futures import ProcessPoolExecutor
from app.worker import start_worker
from app.config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger("worker_manager")

# Number of worker processes to run (read from config file)
NUM_WORKERS = settings.WORKER_COUNT

def run_worker(worker_id):
    """Run a worker in a separate process"""
    logger.info(f"Starting worker {worker_id}")
    try:
        # Use asyncio.run to start the worker
        asyncio.run(start_worker())
    except KeyboardInterrupt:
        logger.info(f"Worker {worker_id} received shutdown signal")
    except Exception as e:
        logger.error(f"Worker {worker_id} failed with error: {str(e)}")
    finally:
        logger.info(f"Worker {worker_id} stopped")

async def shutdown(executor):
    """Gracefully shut down the worker pool"""
    logger.info("Shutting down worker pool...")
    executor.shutdown(wait=True)
    logger.info("All workers have been stopped")

async def main():
    """Start multiple worker processes"""
    logger.info(f"Starting {NUM_WORKERS} worker processes")
    
    # Create a process pool
    with ProcessPoolExecutor(max_workers=NUM_WORKERS) as executor:
        # Start workers
        futures = [executor.submit(run_worker, i) for i in range(NUM_WORKERS)]
        
        # Set up signal handlers for graceful shutdown
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(
                sig, 
                lambda: asyncio.create_task(shutdown(executor))
            )
        
        logger.info(f"All {NUM_WORKERS} workers started. Press Ctrl+C to stop.")
        
        # Wait for all workers to complete (they should run indefinitely)
        try:
            # Keep the main process running
            while True:
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            logger.info("Main process received cancellation")
        finally:
            await shutdown(executor)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt. Shutting down...")
    except Exception as e:
        logger.error(f"Error in main process: {str(e)}")
        sys.exit(1) 