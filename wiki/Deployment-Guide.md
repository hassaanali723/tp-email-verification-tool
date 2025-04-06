# Deployment Guide

This guide provides detailed instructions for deploying the Email Validation Service in various environments.

## Table of Contents
- [Docker Deployment](#docker-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Manual Deployment](#manual-deployment)
- [Cloud Platform Deployments](#cloud-platform-deployments)
- [Monitoring and Maintenance](#monitoring-and-maintenance)

## Docker Deployment

### Prerequisites
- Docker 20.10.x or higher
- Docker Compose 2.x or higher
- Git

### Steps

1. Clone the repository:
```bash
git clone https://github.com/hassaanali723/tp-email-verification-tool.git
cd tp-email-verification-tool
```

2. Create environment files:
```bash
cp .env.example .env
```

3. Build and start services:
```bash
docker-compose up -d --build
```

### Docker Compose Configuration

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "8000:8000"
    env_file: .env
    depends_on:
      - redis
      - rabbitmq

  worker:
    build: .
    command: python run_workers.py
    env_file: .env
    depends_on:
      - redis
      - rabbitmq

  redis:
    image: redis:6.2-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  rabbitmq:
    image: rabbitmq:3.9-management
    ports:
      - "5672:5672"
      - "15672:15672"
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq

volumes:
  redis_data:
  rabbitmq_data:
```

## Kubernetes Deployment

### Prerequisites
- Kubernetes cluster
- kubectl configured
- Helm 3.x

### Deployment Steps

1. Add Helm repositories:
```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
```

2. Install Redis:
```bash
helm install redis bitnami/redis \
  --namespace email-validation \
  --create-namespace \
  --set auth.password=your-password
```

3. Install RabbitMQ:
```bash
helm install rabbitmq bitnami/rabbitmq \
  --namespace email-validation \
  --set auth.username=user \
  --set auth.password=your-password
```

4. Deploy the application:
```bash
kubectl apply -f k8s/
```

### Kubernetes Manifests

#### API Deployment (api-deployment.yaml)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: email-validation-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: email-validation-api
  template:
    metadata:
      labels:
        app: email-validation-api
    spec:
      containers:
      - name: api
        image: your-registry/email-validation-api:latest
        ports:
        - containerPort: 8000
        env:
        - name: REDIS_HOST
          value: redis-master
        - name: RABBITMQ_HOST
          value: rabbitmq
```

#### Worker Deployment (worker-deployment.yaml)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: email-validation-worker
spec:
  replicas: 4
  selector:
    matchLabels:
      app: email-validation-worker
  template:
    metadata:
      labels:
        app: email-validation-worker
    spec:
      containers:
      - name: worker
        image: your-registry/email-validation-worker:latest
        command: ["python", "run_workers.py"]
```

## Manual Deployment

### Prerequisites
- Python 3.8+
- Redis Server
- RabbitMQ Server
- Supervisor or systemd
- Nginx (optional)

### Steps

1. Set up Python environment:
```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

2. Configure Supervisor:

```ini
[program:email-validation-api]
command=/path/to/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
directory=/path/to/email-validation-service
user=www-data
autostart=true
autorestart=true
stderr_logfile=/var/log/email-validation-api.err.log
stdout_logfile=/var/log/email-validation-api.out.log

[program:email-validation-worker]
command=/path/to/venv/bin/python run_workers.py
directory=/path/to/email-validation-service
user=www-data
numprocs=4
process_name=%(program_name)s_%(process_num)02d
autostart=true
autorestart=true
stderr_logfile=/var/log/email-validation-worker.err.log
stdout_logfile=/var/log/email-validation-worker.out.log
```

3. Nginx Configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Cloud Platform Deployments

### AWS Deployment

1. Set up infrastructure with Terraform:
```hcl
provider "aws" {
  region = "us-west-2"
}

module "email_validation" {
  source = "./terraform"
  
  environment = "production"
  instance_type = "t3.medium"
  worker_count = 4
}
```

2. Configure AWS ECS:
- Use ECS for containerized deployment
- Set up Application Load Balancer
- Configure Auto Scaling

### Google Cloud Platform

1. Deploy to Cloud Run:
```bash
gcloud run deploy email-validation-api \
  --image gcr.io/your-project/email-validation-api \
  --platform managed \
  --region us-central1
```

2. Set up Cloud Pub/Sub for workers

### Azure Deployment

1. Deploy to Azure Container Apps:
```bash
az containerapp up \
  --name email-validation-api \
  --resource-group your-group \
  --source .
```

## Monitoring and Maintenance

### Prometheus Metrics

1. Enable metrics in configuration:
```env
ENABLE_METRICS=True
METRICS_PORT=9090
```

2. Configure Prometheus scraping:
```yaml
scrape_configs:
  - job_name: 'email-validation'
    static_configs:
      - targets: ['localhost:9090']
```

### Grafana Dashboard

Import the provided Grafana dashboard for monitoring:
- API endpoints performance
- Worker queue statistics
- Resource utilization
- Error rates

### Backup Strategy

1. Redis Backup:
```bash
redis-cli save
```

2. RabbitMQ Backup:
```bash
rabbitmqctl export_definitions backup.json
```

### Scaling Guidelines

1. Horizontal Scaling:
- Add API replicas for increased traffic
- Increase worker count for faster processing

2. Vertical Scaling:
- Upgrade instance types
- Increase resource limits

### Security Considerations

1. Enable SSL/TLS
2. Set up WAF rules
3. Implement rate limiting
4. Regular security updates
5. Access control and authentication

## Troubleshooting

### Common Issues

1. Worker Connection Issues:
```bash
# Check RabbitMQ connection
rabbitmqctl list_connections

# Check Redis connection
redis-cli ping
```

2. Performance Issues:
```bash
# Monitor worker processes
ps aux | grep run_workers.py

# Check system resources
top
```

### Logging

Configure centralized logging:
- ELK Stack
- CloudWatch
- Stackdriver

### Health Checks

Implement regular health checks:
```bash
curl http://your-domain.com/health
```

## Maintenance Tasks

1. Regular Updates:
```bash
git pull
pip install -r requirements.txt
supervisorctl restart all
```

2. Log Rotation:
```bash
logrotate /etc/logrotate.d/email-validation
```

3. Database Cleanup:
```bash
# Redis cleanup
redis-cli FLUSHDB

# RabbitMQ cleanup
rabbitmqctl purge_queue email_validation
```