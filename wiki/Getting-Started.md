# Getting Started

This guide will help you set up and run the Email Validation Service on your local machine.

## Prerequisites

Before you begin, ensure you have the following installed:

- Python 3.8 or higher
- Redis server
- RabbitMQ server
- Node.js and npm (for frontend)
- Git

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/hassaanali723/tp-email-verification-tool.git
cd tp-email-verification-tool
```

### 2. Set Up Python Environment

```bash
# Create and activate virtual environment (optional but recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure Environment Variables

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` with your settings:
```env
# API Settings
API_V1_STR=/api/v1
PROJECT_NAME=Email Validation Service

# Worker Settings
WORKER_COUNT=4
WORKER_BATCH_SIZE=5
WORKER_PREFETCH_COUNT=1
MAX_RETRIES=3

# Redis Settings
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=your_password
REDIS_RESULT_EXPIRY=3600

# RabbitMQ Settings
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=your_user
RABBITMQ_PASS=your_password
RABBITMQ_VHOST=/
```

### 4. Start Required Services

1. **Redis Server**
```bash
# Windows
redis-server

# Linux/Mac
sudo service redis start
```

2. **RabbitMQ Server**
```bash
# Windows
rabbitmq-server

# Linux/Mac
sudo service rabbitmq-server start
```

### 5. Start Worker Processes

```bash
# Windows
run_workers.bat

# Linux/Mac
python run_workers.py
```

### 6. Start the API Server

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Verifying Installation

1. Check API documentation:
   - Open `http://localhost:8000/docs` in your browser
   - You should see the Swagger UI documentation

2. Test the health endpoint:
```bash
curl http://localhost:8000/health
```

3. Test email validation:
```bash
curl -X POST "http://localhost:8000/api/v1/validate-email" \
     -H "Content-Type: application/json" \
     -d '{"email": "test@example.com"}'
```

## Common Issues

### Redis Connection Failed
- Ensure Redis is running
- Check Redis port (default: 6379)
- Verify Redis password in .env

### RabbitMQ Connection Failed
- Ensure RabbitMQ is running
- Check RabbitMQ credentials
- Verify RabbitMQ port (default: 5672)

### Workers Not Starting
- Check WORKER_COUNT in .env
- Ensure Python environment is activated
- Verify all dependencies are installed

## Next Steps

- Read the [API Reference](API-Reference) for endpoint details
- Check the [Configuration Guide](Configuration-Guide) for advanced settings
- See [Deployment Guide](Deployment-Guide) for production deployment