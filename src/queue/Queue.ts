import { redis } from "../config/redis";
import { Job, JobOptions } from "../types/job";
import { v4 as uuidv4 } from "uuid";
import cronParser from "cron-parser";

export class Queue {
  private queueName: string;

  constructor(queueName: string) {
    this.queueName = queueName;
  }

  public getQueueName(): string {
    return this.queueName;
  }

  private calculateNextRunTime(cronExpression: string): number {
    try {
      const interval = cronParser.parse(cronExpression);
      return interval.next().getTime();
    } catch (error) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }
  }

  async addJob(
    type: string,
    data: any,
    options: JobOptions = {}
  ): Promise<Job> {
    const job: Job = {
      id: uuidv4(),
      type,
      data,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      priority: options.priority || 0,
      cron: options.cron,
    };

    if (options.cron) {
      job.nextRunAt = this.calculateNextRunTime(options.cron);
    }

    // Store job data in Redis hash with proper serialization
    await redis.hset(`job:${job.id}`, {
      id: job.id,
      type: job.type,
      data: JSON.stringify(job.data),
      status: job.status,
      createdAt: job.createdAt.toString(),
      updatedAt: job.updatedAt.toString(),
      attempts: job.attempts.toString(),
      maxAttempts: job.maxAttempts.toString(),
      priority: (job.priority || 0).toString(),
      ...(job.cron && { cron: job.cron }),
      ...(job.nextRunAt && { nextRunAt: job.nextRunAt.toString() }),
    });

    // Add job to appropriate queue based on priority and timing
    if (options.delay || job.nextRunAt) {
      const executeAt = options.delay
        ? Date.now() + options.delay
        : job.nextRunAt || Date.now();
      await redis.zadd(`${this.queueName}:delayed`, executeAt, job.id);
    } else {
      // Add to priority queue (negative priority for correct sorting - higher priority = lower score)
      await redis.zadd(
        `${this.queueName}:pending`,
        -(job.priority || 0),
        job.id
      );
    }

    return job;
  }

  async getNextJob(): Promise<Job | null> {
    // Use Lua script to automically get and remove the next job
    const script = `
      local jobId = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', '+inf', 'LIMIT', 0, 1)
      if #jobId == 0 then return nil end
      redis.call('ZREM', KEYS[1], jobId[1])
      return jobId[1]
    `;

    const result = await redis.eval(script, 1, `${this.queueName}:pending`);
    if (!result || typeof result !== "string") return null;

    const job = await this.getJob(result);
    if (job) {
      // Immediately mark the job as processing
      await this.updateJobStatus(result, "processing");
    }
    return job;
  }

  async getJob(jobId: string): Promise<Job | null> {
    const jobData = await redis.hgetall(`job:${jobId}`);
    if (!jobData || Object.keys(jobData).length === 0) {
      return null;
    }

    // Deserialize the job data
    return {
      id: jobData.id,
      type: jobData.type,
      data: JSON.parse(jobData.data),
      status: jobData.status as Job["status"],
      createdAt: parseInt(jobData.createdAt),
      updatedAt: parseInt(jobData.updatedAt),
      attempts: parseInt(jobData.attempts),
      maxAttempts: parseInt(jobData.maxAttempts),
      error: jobData.error,
      nextRetryAt: jobData.nextRetryAt
        ? parseInt(jobData.nextRetryAt)
        : undefined,
      priority: jobData.priority ? parseInt(jobData.priority) : undefined,
      cron: jobData.cron,
      nextRunAt: jobData.nextRunAt ? parseInt(jobData.nextRunAt) : undefined,
      lastRunAt: jobData.lastRunAt ? parseInt(jobData.lastRunAt) : undefined,
    };
  }

  async updateJobStatus(
    jobId: string,
    status: Job["status"],
    error?: string,
    nextRetryAt?: number
  ): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) return;

    job.status = status;
    job.updatedAt = Date.now();
    job.attempts += 1;
    if (error) job.error = error;
    if (nextRetryAt) job.nextRetryAt = nextRetryAt;

    // If it's a recurring job, calculate next run time
    if (job.cron && status === "completed") {
      job.lastRunAt = Date.now();
      job.nextRunAt = this.calculateNextRunTime(job.cron);
    }

    // Update job in Redis with proper serialization
    await redis.hset(`job:${jobId}`, {
      id: job.id,
      type: job.type,
      data: JSON.stringify(job.data),
      status: job.status,
      createdAt: job.createdAt.toString(),
      updatedAt: job.updatedAt.toString(),
      attempts: job.attempts.toString(),
      maxAttempts: job.maxAttempts.toString(),
      priority: (job.priority || 0).toString(),
      ...(error && { error }),
      ...(nextRetryAt && { nextRetryAt: nextRetryAt.toString() }),
      ...(job.cron && { cron: job.cron }),
      ...(job.nextRunAt && { nextRunAt: job.nextRunAt.toString() }),
      ...(job.lastRunAt && { lastRunAt: job.lastRunAt.toString() }),
    });

    // If it's a recurring job and completed, add to delayed queue for next run
    if (job.cron && status === "completed" && job.nextRunAt) {
      await redis.zadd(`${this.queueName}:delayed`, job.nextRunAt, job.id);
    }
  }

  async removeJob(jobId: string): Promise<void> {
    await redis.del(`job:${jobId}`);
    await redis.zrem(`${this.queueName}:pending`, jobId);
    await redis.zrem(`${this.queueName}:delayed`, jobId);
  }

  async getPendingJobs(): Promise<Job[]> {
    // Get jobs ordered by priority (highest first)
    const jobIds = await redis.zrange(`${this.queueName}:pending`, 0, -1);
    const jobs: Job[] = [];

    for (const jobId of jobIds) {
      const job = await this.getJob(jobId);
      if (job) jobs.push(job);
    }

    return jobs;
  }

  async getDelayedJobs(): Promise<Job[]> {
    const now = Date.now();
    const jobIds = await redis.zrangebyscore(
      `${this.queueName}:delayed`,
      0,
      now
    );
    const jobs: Job[] = [];

    for (const jobId of jobIds) {
      const job = await this.getJob(jobId);
      if (job) jobs.push(job);
    }

    return jobs;
  }

  async getFailedJobs(): Promise<Job[]> {
    const keys = await redis.keys("job:*");
    const failedJobs: Job[] = [];

    for (const key of keys) {
      const jobId = key.split(":")[1];
      const job = await this.getJob(jobId);
      if (job && job.status === "failed") {
        failedJobs.push(job);
      }
    }

    return failedJobs;
  }
}
