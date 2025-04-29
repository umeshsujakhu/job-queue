import { JobQueue } from "../src/index";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Example job processor
async function processEmailJob(job: any): Promise<void> {
  console.log(`Processing email job ${job.id}:`);
  console.log("  To:", job.data.to);
  console.log("  Subject:", job.data.subject);
  console.log("  Body:", job.data.body);
  console.log("  Priority:", job.priority || 0);

  if (job.cron) {
    console.log("  Cron:", job.cron);
    console.log("  Next Run:", new Date(job.nextRunAt || 0).toLocaleString());
  }

  // Simulate some work with random duration
  const processingTime = Math.floor(Math.random() * 2000) + 1000; // 1-3 seconds
  await new Promise((resolve) => setTimeout(resolve, processingTime));

  // Simulate random failures (30% chance of failure)
  if (Math.random() < 0.3) {
    throw new Error("Random failure occurred while sending email");
  }

  console.log(`✓ Completed email job ${job.id} (took ${processingTime}ms)`);
}

async function main() {
  // Initialize the job queue with Redis URL from environment or default
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const jobQueue = new JobQueue(redisUrl);

  console.log("Job Queue initialized with Redis URL:", redisUrl);

  // Create a worker for the email queue
  const worker = jobQueue.createWorker("email-queue", processEmailJob, {
    pollInterval: 1000, // Check for jobs every second
    defaultRetryDelay: 3000, // Default delay between retries
    defaultBackoffFactor: 2, // Exponential backoff factor
    concurrency: 3, // Process 3 jobs concurrently
  });

  console.log("Worker created for email-queue");

  // Add jobs to the queue
  console.log("Adding jobs to queue...");

  // Add a high priority job
  const highPriorityJob = await jobQueue.addJob(
    "email-queue",
    "send-email",
    {
      to: "important@example.com",
      subject: "Urgent: High Priority Email",
      body: "This is a high priority email",
    },
    {
      priority: 10,
      maxAttempts: 3,
      retryDelay: 3000,
      backoffFactor: 2,
    }
  );
  console.log(`Added high priority job: ${highPriorityJob.id}`);

  // Add a medium priority job
  const mediumPriorityJob = await jobQueue.addJob(
    "email-queue",
    "send-email",
    {
      to: "normal@example.com",
      subject: "Medium Priority Email",
      body: "This is a medium priority email",
    },
    {
      priority: 5,
      maxAttempts: 3,
      retryDelay: 3000,
      backoffFactor: 2,
    }
  );
  console.log(`Added medium priority job: ${mediumPriorityJob.id}`);

  // Add a low priority job
  const lowPriorityJob = await jobQueue.addJob(
    "email-queue",
    "send-email",
    {
      to: "low@example.com",
      subject: "Low Priority Email",
      body: "This is a low priority email",
    },
    {
      priority: 1,
      maxAttempts: 3,
      retryDelay: 3000,
      backoffFactor: 2,
    }
  );
  console.log(`Added low priority job: ${lowPriorityJob.id}`);

  // Add a recurring job (every minute)
  const recurringJob = await jobQueue.addJob(
    "email-queue",
    "send-email",
    {
      to: "recurring@example.com",
      subject: "Recurring Email",
      body: "This is a recurring email",
    },
    {
      cron: "* * * * *", // Every minute
      maxAttempts: 3,
      retryDelay: 3000,
      backoffFactor: 2,
    }
  );
  console.log(`Added recurring job: ${recurringJob.id}`);

  // Start the worker
  console.log("\nStarting worker...");
  worker.start();

  // Stop the worker after 2 minutes to see recurring jobs in action
  setTimeout(async () => {
    console.log("\nStopping worker...");
    await jobQueue.stopWorkers();
    // Close Redis connection
    await jobQueue.close();
    console.log("Redis connection closed");
    process.exit(0);
  }, 120000); // 2 minutes
}

// Handle errors
process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
  process.exit(1);
});

main().catch((error) => {
  console.error("Error in main:", error);
  process.exit(1);
});
