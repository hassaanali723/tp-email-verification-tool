# Getting Started

This guide will help you set up and run the Email Validation Service on your local machine.

## Prerequisites

Before you begin, ensure you have the following installed:

- Python 3.8 or higher
- Redis server
- RabbitMQ server
- Git

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/hassaanali723/tp-email-verification-tool.git
cd tp-email-verification-tool
```

### 2. Set Up Python Environment

```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory with the following required settings:

```env
# API Settings
API_V1_STR=/api/v1
PROJECT_NAME=Email Validation Service

# DNS and SMTP Settings
DNS_TIMEOUT=10
SMTP_TIMEOUT=5
MAX_CONCURRENT_VALIDATIONS=5

# SMTP Settings
SMTP_PORT=25
SMTP_USE_TLS=False
SMTP_FALLBACK_PORTS=587,465

# Circuit Breaker Settings
SMTP_CIRCUIT_BREAKER_THRESHOLD=10
SMTP_CIRCUIT_BREAKER_TIMEOUT=300
SMTP_ERROR_THRESHOLD_PERCENTAGE=30
DNS_ONLY_MODE_ENABLED=False

# Required: RabbitMQ Settings
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=guest
RABBITMQ_PASS=guest
RABBITMQ_VHOST=/
RABBITMQ_QUEUE=email_validation

# Required: Redis Settings
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=
REDIS_RESULT_EXPIRY=3600

# Worker Settings
WORKER_COUNT=3
WORKER_BATCH_SIZE=5
WORKER_PREFETCH_COUNT=1
MAX_RETRIES=3
```

### 4. Start Required Services

#### Redis Server

**Windows**
```bash
redis-server
```

**Linux/Mac**
```bash
sudo service redis start
```

#### RabbitMQ Server

**Windows**
```bash
rabbitmq-server
```

**Linux/Mac**
```bash
sudo service rabbitmq-server start
```

### 5. Start Worker Processes

The service includes two options for running workers:

#### Option 1: Using the Batch Script (Windows)

```bash
# From the project root
run_workers.bat
```

This will start 4 worker instances in separate windows.

#### Option 2: Using the Python Script (Linux/Mac/Windows)

```bash
# From the project root
python run_workers.py
```

This will start the configured number of worker processes (default: 3) with proper process management.

### 6. Start the API Server

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Verifying Installation

### 1. Check API Documentation

Open `http://localhost:8000/docs` in your browser to view the Swagger UI documentation.

### 2. Test Single Email Validation

```bash
curl -X POST "http://localhost:8000/api/v1/validate" \
     -H "Content-Type: application/json" \
     -d '{
           "emails": ["test@example.com"],
           "check_mx": true,
           "check_smtp": true,
           "check_disposable": true,
           "check_catch_all": true,
           "check_blacklist": true
         }'
```

### 3. Test Batch Email Validation

```bash
curl -X POST "http://localhost:8000/api/v1/validate-batch" \
     -H "Content-Type: application/json" \
     -d '{
           "emails": [
             "test1@example.com",
             "test2@example.com"
           ],
           "check_mx": true,
           "check_smtp": true,
           "check_disposable": true,
           "check_catch_all": true,
           "check_blacklist": true
         }'
```

## Understanding Batch Processing

The service automatically handles different batch sizes:

1. Small batches (≤5 emails):
   - Processed immediately
   - Results returned directly

2. Medium batches (≤100 emails):
   - Processed as a single batch
   - Returns batch ID for status checking

3. Large batches (>100 emails):
   - Split into multiple batches
   - Processed in parallel
   - Returns request ID for multi-batch status checking

## Common Issues and Solutions

### Redis Connection Failed
- Ensure Redis is running
- Check Redis port (default: 6379)
- Verify Redis password in .env

### RabbitMQ Connection Failed
- Ensure RabbitMQ is running
- Check RabbitMQ credentials
- Verify RabbitMQ port (default: 5672)

### Workers Not Processing
- Check worker processes are running
- Verify RabbitMQ queue exists
- Check worker logs for errors

### SMTP Timeouts
- Adjust SMTP_TIMEOUT in .env
- Check if target SMTP servers are accessible
- Consider enabling DNS_ONLY_MODE if persistent issues

## Next Steps

1. Read the [API Reference](API-Reference) for detailed endpoint documentation
2. Check the [Configuration Guide](Configuration-Guide) for advanced settings
3. See the [Deployment Guide](Deployment-Guide) for production setup

## Development Tips

1. Enable debug logging:
```env
LOG_LEVEL=DEBUG
```

2. Monitor worker processes:
```bash
# Windows
tasklist | findstr python

# Linux/Mac
ps aux | grep run_workers.py
```

3. Check RabbitMQ queue status:
```bash
# Access RabbitMQ management interface
http://localhost:15672
```

4. Monitor Redis cache:
```bash
redis-cli monitor
```