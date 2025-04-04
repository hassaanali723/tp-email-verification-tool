# Email Validation Service

A microservice for validating email addresses with robust error handling and circuit breaker pattern.

## Running Multiple Workers

For optimal performance with multi-batch processing, run multiple worker instances:

### On Windows
```
run_workers.bat
```

### On Linux/Mac
```
python run_workers.py
```

This will start 4 worker processes that will process batches in parallel, significantly improving throughput for large validation jobs.

## Multi-Batch Processing

The service now supports parallel processing of large email batches:

### Key Features

1. **Dynamic Batch Sizing**:
   - Small uploads (≤100 emails): Single batch
   - Medium uploads (101-500 emails): Multiple batches of 100 emails
   - Large uploads (501-2000 emails): Multiple batches of 200 emails
   - Very large uploads (>2000 emails): Multiple batches of 500 emails

2. **Parallel Processing**:
   - Each batch is processed independently
   - Multiple batches run in parallel
   - Significantly faster validation for large datasets

3. **Unified Status Tracking**:
   - Single request ID for all batches
   - Aggregated progress reporting
   - Detailed per-batch status

### Performance Improvements

- **2000 emails**: ~5-8 minutes (vs. 30+ minutes previously)
- **10,000 emails**: ~25-40 minutes (vs. potentially hours previously)

## Circuit Breaker Implementation

The service uses a circuit breaker pattern to handle SMTP timeouts and failures gracefully:

### Key Features

1. **Consecutive Timeout Tracking**:
   - Only counts consecutive SMTP timeouts, not total timeouts
   - Resets counter when a successful validation occurs
   - Opens circuit only after 10 consecutive timeouts

2. **Proper Fallback Behavior**:
   - Falls back to DNS validation only when circuit is open
   - Returns UNKNOWN status with TIMEOUT reason for individual timeouts
   - Preserves error information for debugging

3. **Monitoring and Control**:
   - `/circuit-breaker/status` endpoint to monitor state
   - `/circuit-breaker/reset` endpoint to manually reset if needed
   - Detailed logging for better visibility

### How It Works

1. **Normal Operation (Circuit Closed)**:
   - Each email is validated using SMTP
   - Successful validations reset the consecutive timeout counter
   - Individual timeouts increment the consecutive timeout counter
   - Timeouts return UNKNOWN status, not DNS results

2. **Circuit Open**:
   - After 10 consecutive timeouts, circuit opens
   - All validations use DNS-only method
   - Circuit remains open for 1 hour (configurable)
   - Circuit can be manually reset via API

## API Endpoints

### Email Validation
- `POST /api/v1/validate`: Validate a single email
- `POST /api/v1/validate-batch`: Validate a batch of emails (with automatic multi-batch for large uploads)

### Status Checking
- `GET /api/v1/validation-status/{batch_id}`: Check single batch status
- `GET /api/v1/multi-validation-status/{request_id}`: Check multi-batch status

### Circuit Breaker
- `GET /api/v1/circuit-breaker/status`: Check circuit breaker status
- `POST /api/v1/circuit-breaker/reset`: Reset circuit breaker

### Cache Management
- `GET /api/v1/cache/view/{cache_type}`: View cached results
- `DELETE /api/v1/cache/clear/{cache_type}`: Clear cache 