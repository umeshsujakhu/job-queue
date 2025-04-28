export interface Job {
  id: string;
  type: string;
  data: any;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
  attempts: number;
  maxAttempts: number;
  error?: string;
  nextRetryAt?: number;
  priority?: number;
  cron?: string;
  lastRunAt?: number;
  nextRunAt?: number;
}

export interface JobOptions {
  maxAttempts?: number;
  delay?: number; // Delay in milliseconds
  priority?: number; // Higher number means higher priority (1-10)
  retryDelay?: number; // Base delay between retries in milliseconds
  backoffFactor?: number; // Exponential backoff factor
  cron?: string; // Cron expression for recurring jobs
}
