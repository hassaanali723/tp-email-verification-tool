# Email Validation Service

A robust, scalable email validation service built with FastAPI that provides comprehensive email validation capabilities with support for batch processing.

## Features

### Smart Email Validation
- Format validation
- DNS MX record verification
- SMTP server validation
- Disposable email detection
- Catch-all domain detection
- Role-based email detection
- Free email provider detection

### Advanced Batch Processing
- Automatic batch size optimization:
  - Small batches (≤5): Immediate processing
  - Medium batches (≤100): Single batch
  - Large batches (>100): Multi-batch parallel processing
- Progress tracking for each batch
- Aggregated status for multi-batch requests

### Robust Architecture
- Circuit breaker pattern for SMTP operations
- Multi-level caching system:
  - Full validation results
  - MX records
  - Blacklist status
  - Disposable domains
  - Catch-all domains
- Fallback SMTP ports (25, 587, 465)
- Configurable timeouts and retries

### Performance Features
- Parallel processing with multiple workers
- Redis-based caching
- RabbitMQ for reliable message queuing
- Configurable worker count and batch sizes

## Quick Start

1. Clone the repository:
```bash
git clone https://github.com/hassaanali723/tp-email-verification-tool.git
cd tp-email-verification-tool
```

2. Set up environment:
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your settings
```

4. Start services:
```bash
# Start Redis and RabbitMQ
# Start workers:
python run_workers.py  # or run_workers.bat on Windows
# Start API:
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Documentation

- [Getting Started Guide](Getting-Started): Detailed setup instructions
- [API Reference](API-Reference): Complete API documentation
- [Configuration Guide](Configuration-Guide): All configuration options
- [Deployment Guide](Deployment-Guide): Production deployment instructions

## System Requirements

### Minimum Requirements
- Python 3.8+
- Redis 6.0+
- RabbitMQ 3.8+
- 2GB RAM
- 2 CPU cores

### Recommended Requirements
- Python 3.9+
- Redis 6.2+
- RabbitMQ 3.9+
- 4GB RAM
- 4 CPU cores

## Architecture Overview

### Components
1. **API Layer** (FastAPI)
   - Request handling
   - Input validation
   - Response formatting
   - Status tracking

2. **Worker Layer**
   - Email validation processing
   - SMTP connections
   - DNS lookups
   - Result caching

3. **Message Queue** (RabbitMQ)
   - Task distribution
   - Load balancing
   - Retry handling
   - Dead letter queue

4. **Cache Layer** (Redis)
   - Result caching
   - Status tracking
   - Circuit breaker state
   - Batch processing state

### Data Flow
1. Client submits validation request
2. API processes and queues batch(es)
3. Workers pick up tasks and process
4. Results stored in Redis
5. Client retrieves results via status endpoint

## Configuration Highlights

### Validation Settings
- DNS timeout: 10 seconds
- SMTP timeout: 5 seconds
- Max concurrent validations: 5
- Multiple SMTP ports: 25, 587, 465

### Circuit Breaker
- Threshold: 10 failures
- Recovery timeout: 300 seconds
- Error threshold: 30%
- DNS-only mode available

### Caching TTLs
- Full results: 24 hours
- MX records: 48 hours
- Blacklist: 6 hours
- Disposable: 7 days
- Catch-all: 24 hours

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

- GitHub Issues: Report bugs and feature requests
- Documentation: Comprehensive guides and references
- Examples: Sample code and use cases

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.