# @umeshsujakhu/job-queue

A robust, Redis-based job queue implementation with support for concurrency, retries, delayed jobs, and job prioritization.

[![npm version](https://badge.fury.io/js/%40umeshsujakhu%2Fjob-queue.svg)](https://badge.fury.io/js/%40umeshsujakhu%2Fjob-queue)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Concurrent Job Processing**: Process multiple jobs simultaneously with configurable concurrency
- **Job Retries**: Automatic retry mechanism with exponential backoff
- **Delayed Jobs**: Schedule jobs to be processed at a future time
- **Job Prioritization**: Assign priorities to jobs to control processing order
- **Job Status Tracking**: Monitor job status (pending, processing, completed, failed)
- **Redis Backend**: Leverages Redis for reliable job storage and queue management
- **TypeScript Support**: Full type safety and better developer experience
- **Cron Jobs**: Support for recurring jobs using cron expressions

## Installation

```bash
npm install @umeshsujakhu/job-queue
```

## Quick Start

```typescript
import { Queue, Worker } from "@umeshsujakhu/job-queue";

// Create a queue
const queue = new Queue("my-queue");

// Add a job
const job = await queue.addJob(
  "send-email",
  {
    to: "user@example.com",
    subject: "Hello",
    body: "Welcome!",
  },
  {
    priority: 1,
    maxAttempts: 3,
  }
);

// Create a worker
const worker = new Worker(queue, async (job) => {
  // Process the job
  await sendEmail(job.data);
});

// Start processing
worker.start();
```

## Documentation

### Creating a Queue

```typescript
import { Queue } from "@umeshsujakhu/job-queue";

const queue = new Queue("my-queue");
```

### Adding Jobs

```typescript
// Basic job
await queue.addJob("job-type", { data: "value" });

// Job with options
await queue.addJob(
  "job-type",
  { data: "value" },
  {
    priority: 1,
    maxAttempts: 3,
    retryDelay: 5000,
    backoffFactor: 2,
    delay: 1000,
  }
);

// Delayed job
await queue.addJob(
  "job-type",
  { data: "value" },
  {
    delay: 60 * 60 * 1000, // Run after 1 hour
  }
);

// Cron job
await queue.addJob(
  "job-type",
  { data: "value" },
  {
    cron: "0 0 * * *", // Run daily at midnight
  }
);
```

### Creating a Worker

```typescript
import { Worker } from "@umeshsujakhu/job-queue";

const worker = new Worker(
  queue,
  async (job) => {
    switch (job.type) {
      case "send-email":
        await sendEmail(job.data);
        break;
      case "process-data":
        await processData(job.data);
        break;
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  },
  {
    concurrency: 5,
    pollInterval: 1000,
  }
);

// Start the worker
worker.start();

// Stop the worker gracefully
await worker.stop();
```

### Job Options

```typescript
interface JobOptions {
  priority?: number; // Higher priority jobs are processed first
  maxAttempts?: number; // Maximum number of retry attempts
  retryDelay?: number; // Base delay between retries (ms)
  backoffFactor?: number; // Exponential backoff factor
  delay?: number; // Delay before processing (ms)
  cron?: string; // Cron expression for recurring jobs
}
```

### Worker Options

```typescript
interface WorkerOptions {
  concurrency?: number; // Number of jobs to process simultaneously
  pollInterval?: number; // How often to check for new jobs (ms)
  defaultRetryDelay?: number; // Default delay between retries
  defaultBackoffFactor?: number; // Default exponential backoff factor
}
```

## Redis Configuration

The package uses [ioredis](https://github.com/luin/ioredis) for Redis connectivity. You can configure the Redis connection using environment variables:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
```

Or pass the configuration directly:

```typescript
import { Queue } from "@umeshsujakhu/job-queue";
import Redis from "ioredis";

const redis = new Redis({
  host: "localhost",
  port: 6379,
  password: "your_password",
});

const queue = new Queue("my-queue", { redis });
```

## Error Handling

```typescript
const worker = new Worker(queue, async (job) => {
  try {
    await processJob(job);
  } catch (error) {
    console.error(`Job ${job.id} failed:`, error);
    throw error; // Let the worker handle retry logic
  }
});
```

## Best Practices

1. **Job Design**

   - Keep jobs atomic and idempotent
   - Include all necessary data in the job
   - Set appropriate timeouts and retry limits

2. **Error Handling**

   - Implement proper error logging
   - Set up monitoring for failed jobs
   - Configure appropriate retry strategies

3. **Performance**
   - Tune concurrency based on system resources
   - Monitor Redis memory usage
   - Implement job batching when appropriate

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
