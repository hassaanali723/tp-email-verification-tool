# Email Validation Service Documentation

Welcome to the Email Validation Service documentation. This service provides robust email validation capabilities with support for batch processing, parallel validation, and sophisticated error handling.

## 📚 Documentation Sections

### [Getting Started](Getting-Started)
- Quick setup guide
- Installation instructions
- Running the service locally

### [Architecture](Architecture)
- System components
- Data flow
- Worker system
- Circuit breaker pattern

### [API Reference](API-Reference)
- Endpoints documentation
- Request/Response formats
- Error handling
- Rate limiting

### [Configuration Guide](Configuration-Guide)
- Environment variables
- Worker settings
- Cache configuration
- Queue settings

### [Deployment Guide](Deployment-Guide)
- Prerequisites
- Installation steps
- Running in production
- Monitoring

### [Troubleshooting](Troubleshooting)
- Common issues
- Solutions
- Debugging tips

## 🚀 Quick Start

1. Clone the repository
```bash
git clone https://github.com/hassaanali723/tp-email-verification-tool.git
cd tp-email-verification-tool
```

2. Set up environment
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Install dependencies
```bash
pip install -r requirements.txt
```

4. Start workers
```bash
# Windows
run_workers.bat

# Linux/Mac
python run_workers.py
```

5. Start API server
```bash
uvicorn main:app --reload
```

## 🔧 System Requirements

- Python 3.8+
- Redis
- RabbitMQ
- Node.js (for frontend)

## 🌟 Key Features

- Batch email validation with parallel processing
- Circuit breaker for SMTP timeout handling
- Redis caching for validation results
- RabbitMQ for async processing
- Configurable worker processes
- Frontend interface for file uploads

## 🤝 Contributing

See our [Contributing Guide](Contributing) for details on how to:
- Set up development environment
- Submit pull requests
- Report issues
- Propose new features

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.