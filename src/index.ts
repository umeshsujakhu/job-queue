import { Queue } from "./queue/Queue";
import { Worker } from "./worker/Worker";
import { Job, JobOptions, WorkerOptions } from "./types/job";
import { redis } from "./config/redis";

export class JobQueue {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();

  constructor(private redisUrl?: string) {
    if (redisUrl) {
      // Allow custom Redis URL configuration
      redis.options.host = redisUrl;
    }
  }

  /**
   * Create or get a queue by name
   */
  public getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      this.queues.set(name, new Queue(name));
    }
    return this.queues.get(name)!;
  }

  /**
   * Add a job to a queue
   */
  public async addJob(
    queueName: string,
    type: string,
    data: any,
    options?: JobOptions
  ): Promise<Job> {
    const queue = this.getQueue(queueName);
    return queue.addJob(type, data, options);
  }

  /**
   * Create a worker for a queue
   */
  public createWorker(
    queueName: string,
    processor: (job: Job) => Promise<void>,
    options?: WorkerOptions
  ): Worker {
    const queue = this.getQueue(queueName);
    const worker = new Worker(queue, processor, options);
    this.workers.set(queueName, worker);
    return worker;
  }

  /**
   * Start all workers
   */
  public startWorkers(): void {
    for (const worker of this.workers.values()) {
      worker.start();
    }
  }

  /**
   * Stop all workers
   */
  public async stopWorkers(): Promise<void> {
    for (const worker of this.workers.values()) {
      await worker.stop();
    }
  }

  /**
   * Close the Redis connection
   */
  public async close(): Promise<void> {
    await redis.quit();
  }
}

// Export types
export { Job, JobOptions, WorkerOptions } from "./types/job";
export { Queue } from "./queue/Queue";
export { Worker } from "./worker/Worker";
