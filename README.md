# Job Queue

A robust, Redis-based job queue implementation with support for concurrency, retries, delayed jobs, and job prioritization.

## Features

- **Concurrent Job Processing**: Process multiple jobs simultaneously with configurable concurrency
- **Job Retries**: Automatic retry mechanism with exponential backoff
- **Delayed Jobs**: Schedule jobs to be processed at a future time
- **Job Prioritization**: Assign priorities to jobs to control processing order
- **Job Status Tracking**: Monitor job status (pending, processing, completed, failed)
- **Redis Backend**: Leverages Redis for reliable job storage and queue management

## Architecture

The job queue system consists of several key components:

- **Queue**: Manages job storage and retrieval using Redis
- **Worker**: Processes jobs from the queue with configurable concurrency
- **Job**: Represents a unit of work with properties like priority, retry settings, and status

## Installation

```bash
# Clone the repository
git clone https://github.com/umeshsujakhu/job-queue.git
cd job-queue

# Install dependencies
npm install

# Run the development
npm run dev

# Run the tests
npm run test
```

## Usage

### Creating a Queue

```typescript
import { Queue } from "./queue/Queue";

// Create a new queue
const queue = new Queue("my-queue");
```

### Adding Jobs to the Queue

```typescript
import { Job, JobOptions } from "./types/job";

// Define job options
const jobOptions: JobOptions = {
  priority: 1, // Higher priority jobs are processed first
  maxAttempts: 3, // Maximum number of retry attempts
  retryDelay: 5000, // Base delay between retries (in milliseconds)
  backoffFactor: 2, // Exponential backoff factor
  delay: 0, // Delay before processing (in milliseconds)
};

// Add a job to the queue
const jobId = await queue.addJob(
  { type: "email", data: { to: "user@example.com", subject: "Hello" } },
  jobOptions
);
```

### Creating a Worker

```typescript
import { Worker } from "./worker/Worker";
import { Queue } from "./queue/Queue";
import { Job } from "./types/job";

// Create a queue
const queue = new Queue("my-queue");

// Define a job processor function
const processor = async (job: Job) => {
  console.log(`Processing job ${job.id} with data:`, job.data);

  // Process the job based on its type
  if (job.data.type === "email") {
    // Send email logic here
    await sendEmail(job.data.data);
  }

  // Other job types...
};

// Create a worker with options
const worker = new Worker(queue, processor, {
  pollInterval: 1000, // How often to check for new jobs (in milliseconds)
  defaultRetryDelay: 5000, // Default delay between retries
  defaultBackoffFactor: 2, // Default exponential backoff factor
  concurrency: 5, // Number of jobs to process simultaneously
});

// Start the worker
worker.start();
```

### Stopping a Worker

```typescript
// Stop the worker gracefully
await worker.stop();
```

## Configuration

### Queue Options

- `name`: The name of the queue

### Job Options

- `priority`: Job priority (higher values = higher priority)
- `maxAttempts`: Maximum number of retry attempts
- `retryDelay`: Base delay between retries (in milliseconds)
- `backoffFactor`: Exponential backoff factor
- `delay`: Delay before processing (in milliseconds)

### Worker Options

- `pollInterval`: How often to check for new jobs (in milliseconds)
- `defaultRetryDelay`: Default delay between retries
- `defaultBackoffFactor`: Default exponential backoff factor
- `concurrency`: Number of jobs to process simultaneously

## Redis Requirements

This job queue system requires Redis to function. Make sure you have Redis installed and running on your system.

## License

MIT
