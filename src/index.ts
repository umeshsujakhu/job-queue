import { Queue } from "./queue/Queue";
import { Worker } from "./worker/Worker";
import { Job } from "./types/job";
import { redis } from "./config/redis";

// Example job processor that sometimes fails
async function processEmailJob(job: Job): Promise<void> {
  console.log(`Processing email job ${job.id}:`);
  console.log("  To:", job.data.to);
  console.log("  Subject:", job.data.subject);
  console.log("  Body:", job.data.body);
  console.log("  Priority:", job.priority || 0);
  if (job.cron) {
    console.log("  Cron:", job.cron);
    console.log("  Next Run:", new Date(job.nextRunAt || 0).toLocaleString());
  }

  // Simulate random failures (30% chance of failure)
  if (Math.random() < 0.3) {
    throw new Error("Random failure occurred while sending email");
  }

  // Simulate some work with random duration
  const processingTime = Math.floor(Math.random() * 2000) + 1000; // 1-3 seconds
  await new Promise((resolve) => setTimeout(resolve, processingTime));
  console.log(`✓ Completed email job ${job.id} (took ${processingTime}ms)`);
}

async function cleanup() {
  // Clear all keys in Redis
  const keys = await redis.keys("*");
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

async function main() {
  // Clean up Redis before starting
  await cleanup();
  console.log("Redis cleaned up");

  // Create a queue instance
  const emailQueue = new Queue("email");

  // Create a worker instance with concurrency
  const worker = new Worker(emailQueue, processEmailJob, {
    pollInterval: 1000,
    defaultRetryDelay: 3000,
    defaultBackoffFactor: 2,
    concurrency: 3, // Process 3 jobs concurrently
  });

  console.log("Adding jobs to queue...");

  // Add a high priority job
  const highPriorityJob = await emailQueue.addJob(
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
  const mediumPriorityJob = await emailQueue.addJob(
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
  const lowPriorityJob = await emailQueue.addJob(
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
  const recurringJob = await emailQueue.addJob(
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
    await worker.stop();
    // Close Redis connection
    setTimeout(() => {
      redis.quit();
      process.exit(0);
    }, 1000);
  }, 120000); // 2 minutes
}

// Handle errors
process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
  redis.quit();
  process.exit(1);
});

main().catch((error) => {
  console.error("Error in main:", error);
  redis.quit();
  process.exit(1);
});
