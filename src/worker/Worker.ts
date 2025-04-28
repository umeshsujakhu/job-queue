import { redis } from "../config/redis";
import { Queue } from "../queue/Queue";
import { Job, JobOptions } from "../types/job";

type JobProcessor = (job: Job) => Promise<void>;

export class Worker {
  private queue: Queue;
  private processor: JobProcessor;
  private isProcessing: boolean = false;
  private pollInterval: number;
  private defaultRetryDelay: number;
  private defaultBackoffFactor: number;
  private concurrency: number;
  private activeJobs: Map<
    string,
    {
      promise: Promise<void>;
      done: boolean;
    }
  > = new Map();

  constructor(
    queue: Queue,
    processor: JobProcessor,
    options: {
      pollInterval?: number;
      defaultRetryDelay?: number;
      defaultBackoffFactor?: number;
      concurrency?: number;
    } = {}
  ) {
    this.queue = queue;
    this.processor = processor;
    this.pollInterval = options.pollInterval || 1000;
    this.defaultRetryDelay = options.defaultRetryDelay || 5000;
    this.defaultBackoffFactor = options.defaultBackoffFactor || 2;
    this.concurrency = options.concurrency || 1;
  }

  async start(): Promise<void> {
    this.isProcessing = true;
    console.log(`Starting worker with concurrency: ${this.concurrency}`);

    while (this.isProcessing) {
      try {
        // Clean up completed jobs
        for (const [jobId, jobInfo] of this.activeJobs.entries()) {
          if (jobInfo.done) {
            this.activeJobs.delete(jobId);
          }
        }
        
        // Process any delayed jobs that are ready
        await this.processDelayedJobs();

        // Start new jobs if we have capacity
        if (this.activeJobs.size < this.concurrency) {
          const jobsToStart = this.concurrency - this.activeJobs.size;
          const promises = Array(jobsToStart)
            .fill(null)
            .map(() => this.processNextJob());
          await Promise.race(promises);
        }

        // Wait for the poll interval
        await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
      } catch (error) {
        console.error("Error in worker loop:", error);
        // Wait a bit before retrying
        await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
      }
    }

    // Wait for all active jobs to complete on shutdown
    if (this.activeJobs.size > 0) {
      console.log(
        `Waiting for ${this.activeJobs.size} active jobs to complete...`
      );
      await Promise.all(
        [...this.activeJobs.values()].map((info) => info.promise)
      );
    }
  }

  async stop(): Promise<void> {
    console.log("Stopping worker...");
    this.isProcessing = false;
  }

  private calculateNextRetryDelay(
    attempts: number,
    retryDelay?: number,
    backoffFactor?: number
  ): number {
    const baseDelay = retryDelay || this.defaultRetryDelay;
    const factor = backoffFactor || this.defaultBackoffFactor;
    return baseDelay * Math.pow(factor, attempts - 1);
  }

  private async processNextJob(): Promise<void> {
    try {
      // Get next job from the queue
      const job = await this.queue.getNextJob();
      if (!job) return;

      // Create a promise for this job's processing
      const processPromise = (async () => {
        try {
          // Process the job
          await this.processor(job);

          // Update job status to completed
          await this.queue.updateJobStatus(job.id, "completed");
          console.log(`✓ Completed job ${job.id}`);
        } catch (error) {
          // Handle job failure
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";

          if (job.attempts < job.maxAttempts) {
            // Calculate next retry delay with exponential backoff
            const nextRetryDelay = this.calculateNextRetryDelay(
              job.attempts + 1
            );
            const nextRetryAt = Date.now() + nextRetryDelay;

            // Update job status and schedule retry
            await this.queue.updateJobStatus(
              job.id,
              "failed",
              errorMessage,
              nextRetryAt
            );

            // Add to delayed queue for retry
            const queueName = this.queue.getQueueName();
            await redis.zadd(
              `${queueName}:delayed`,
              nextRetryAt,
              job.id
            );

            console.log(
              `Job ${job.id} failed. Retrying in ${
                nextRetryDelay / 1000
              } seconds. Attempt ${job.attempts + 1}/${job.maxAttempts}`
            );
          } else {
            // Max attempts reached, mark as permanently failed
            await this.queue.updateJobStatus(job.id, "failed", errorMessage);
            console.log(
              `Job ${job.id} failed permanently after ${job.maxAttempts} attempts.`
            );
          }
        }
      })();

      // Store the promise in activeJobs
      const jobInfo = {
        promise: processPromise.finally(() => {
          jobInfo.done = true;
        }),
        done: false,
      };

      this.activeJobs.set(job.id, jobInfo);
      console.log(`Active jobs: ${this.activeJobs.size}/${this.concurrency}`);
    } catch (error) {
      console.error("Error processing job:", error);
    }
  }

  private async processDelayedJobs(): Promise<void> {
    try {
      const now = Date.now();
      const queueName = this.queue.getQueueName();
      const delayedJobs = await redis.zrangebyscore(
        `${queueName}:delayed`,
        0,
        now
      );

      // Ensure delayedJobs is an array
      if (!delayedJobs || !Array.isArray(delayedJobs) || delayedJobs.length === 0) {
        return;
      }

      for (const jobId of delayedJobs) {
        // Remove from delayed queue
        await redis.zrem(`${queueName}:delayed`, jobId);
        // Add to pending queue with priority
        const job = await this.queue.getJob(jobId);
        if (job) {
          // Explicitly handle priority 0 to avoid -0 vs 0 comparison issues in tests
          const priority = job.priority === 0 ? 0 : -(job.priority || 0);
          await redis.zadd(
            `${queueName}:pending`,
            priority,
            jobId
          );
        }
      }
    } catch (error) {
      console.error("Error processing delayed jobs:", error);
    }
  }
}
