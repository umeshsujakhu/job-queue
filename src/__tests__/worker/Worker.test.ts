import { Worker } from "../../worker/Worker";
import { Queue } from "../../queue/Queue";
import { redis } from "../../config/redis";
import { Job } from "../../types/job";

// Mock Redis
jest.mock("../../config/redis", () => ({
  redis: {
    zrangebyscore: jest.fn(),
    zrem: jest.fn(),
    zadd: jest.fn(),
  },
}));

// Mock Queue
jest.mock("../../queue/Queue");

describe("Worker", () => {
  let worker: Worker;
  let queue: jest.Mocked<Queue>;
  let mockJob: Job;
  const mockProcessor = jest.fn();

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create a mock queue instance
    queue = new Queue("test-queue") as jest.Mocked<Queue>;
    
    // Mock the getQueueName method to return the test queue name
    queue.getQueueName = jest.fn().mockReturnValue("test-queue");

    // Create a standard mock job for all tests
    mockJob = {
      id: "test-job-1",
      type: "test",
      data: { test: "data" },
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      attempts: 0,
      maxAttempts: 3,
    };

    // Create worker instance
    worker = new Worker(queue, mockProcessor, {
      pollInterval: 100,
      defaultRetryDelay: 1000,
      defaultBackoffFactor: 2,
      concurrency: 2,
    });
  });

  describe("start and stop", () => {
    it("should start and stop the worker", async () => {
      // Mock getNextJob to return null (no jobs)
      (queue.getNextJob as jest.Mock).mockResolvedValue(null);

      // Start worker
      const startPromise = worker.start();

      // Wait a bit to let the worker start
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Stop worker
      await worker.stop();

      // Wait for worker to stop
      await startPromise;

      // Verify worker polled for jobs
      expect(queue.getNextJob).toHaveBeenCalled();
    });
  });

  describe("job processing", () => {
    it("should process a job successfully", async () => {
      // Mock getNextJob to return a job
      (queue.getNextJob as jest.Mock).mockResolvedValueOnce(mockJob);

      // Mock processor to resolve successfully
      mockProcessor.mockResolvedValueOnce(undefined);

      // Start worker
      const startPromise = worker.start();

      // Wait for job to be processed
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Stop worker
      await worker.stop();
      await startPromise;

      expect(mockProcessor).toHaveBeenCalledWith(mockJob);
      expect(queue.updateJobStatus).toHaveBeenCalledWith(
        mockJob.id,
        "completed"
      );
    });

    it("should handle job failure and retry", async () => {
      // Mock getNextJob to return a job
      (queue.getNextJob as jest.Mock).mockResolvedValueOnce(mockJob);

      // Mock processor to throw an error
      const error = new Error("Test error");
      mockProcessor.mockRejectedValueOnce(error);

      // Start worker
      const startPromise = worker.start();

      // Wait for job to be processed
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Stop worker
      await worker.stop();
      await startPromise;

      expect(mockProcessor).toHaveBeenCalledWith(mockJob);
      expect(queue.updateJobStatus).toHaveBeenCalledWith(
        mockJob.id,
        "failed",
        error.message,
        expect.any(Number)
      );
      expect(redis.zadd).toHaveBeenCalledWith(
        "test-queue:delayed",
        expect.any(Number),
        mockJob.id
      );
    });
  });

  describe("delayed jobs", () => {
    it("should process delayed jobs", async () => {
      // Mock delayed jobs
      (redis.zrangebyscore as jest.Mock).mockResolvedValueOnce([mockJob.id]);
      (queue.getJob as jest.Mock).mockResolvedValueOnce(mockJob);

      // Start worker
      const startPromise = worker.start();

      // Wait for delayed jobs to be processed
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Stop worker
      await worker.stop();
      await startPromise;

      expect(redis.zrem).toHaveBeenCalledWith("test-queue:delayed", mockJob.id);
      
      // More flexible checking for zadd call that handles 0/-0 equivalence
      expect(redis.zadd).toHaveBeenCalled();
      const zaddCalls = (redis.zadd as jest.Mock).mock.calls;
      expect(zaddCalls.length).toBeGreaterThan(0);
      
      const lastCall = zaddCalls[zaddCalls.length - 1];
      expect(lastCall[0]).toBe("test-queue:pending");
      // Object.is(0, -0) is false, but 0 === -0 is true
      // Use the equality operator which treats 0 and -0 as equal
      expect(lastCall[1] === 0).toBe(true);
      expect(lastCall[2]).toBe(mockJob.id);
    });
  });
});
