/// <reference types="jest" />

import { Queue } from "../../queue/Queue";
import { redis } from "../../config/redis";
import { Job } from "../../types/job";

// Mock Redis
jest.mock("../../config/redis", () => ({
  redis: {
    hset: jest.fn(),
    hgetall: jest.fn(),
    zadd: jest.fn(),
    eval: jest.fn(),
    del: jest.fn(),
    zrem: jest.fn(),
    zrange: jest.fn(),
    zrangebyscore: jest.fn(),
    keys: jest.fn(),
  },
}));

describe("Queue", () => {
  let queue: Queue;
  const queueName = "test-queue";

  beforeEach(() => {
    queue = new Queue(queueName);
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe("addJob", () => {
    it("should add a job with default options", async () => {
      const jobData = { test: "data" };

      // Mock Redis responses
      (redis.hset as jest.Mock).mockResolvedValue(1);
      (redis.zadd as jest.Mock).mockResolvedValue(1);

      const job = await queue.addJob("test-type", jobData);

      expect(job).toMatchObject({
        type: "test-type",
        data: jobData,
        status: "pending",
        maxAttempts: 3,
        priority: 0,
      });

      expect(redis.hset).toHaveBeenCalled();
      expect(redis.zadd).toHaveBeenCalledWith(
        `${queueName}:pending`,
        0,
        expect.any(String)
      );
    });

    it("should add a job with custom priority", async () => {
      const jobData = { test: "data" };
      const options = { priority: 10 };

      (redis.hset as jest.Mock).mockResolvedValue(1);
      (redis.zadd as jest.Mock).mockResolvedValue(1);

      const job = await queue.addJob("test-type", jobData, options);

      expect(job.priority).toBe(10);
      expect(redis.zadd).toHaveBeenCalledWith(
        `${queueName}:pending`,
        -10,
        expect.any(String)
      );
    });

    it("should add a delayed job", async () => {
      const jobData = { test: "data" };
      const options = { delay: 5000 };

      (redis.hset as jest.Mock).mockResolvedValue(1);
      (redis.zadd as jest.Mock).mockResolvedValue(1);

      await queue.addJob("test-type", jobData, options);

      expect(redis.zadd).toHaveBeenCalledWith(
        `${queueName}:delayed`,
        expect.any(Number),
        expect.any(String)
      );
    });
  });

  describe("getNextJob", () => {
    it("should return null when no jobs are available", async () => {
      (redis.eval as jest.Mock).mockResolvedValue(null);

      const job = await queue.getNextJob();
      expect(job).toBeNull();
    });

    it("should return and process the next job", async () => {
      const mockJobId = "test-job-id";
      const mockJobData = {
        id: mockJobId,
        type: "test-type",
        data: JSON.stringify({ test: "data" }),
        status: "pending",
        createdAt: Date.now().toString(),
        updatedAt: Date.now().toString(),
        attempts: "0",
        maxAttempts: "3",
        priority: "0",
      };

      (redis.eval as jest.Mock).mockResolvedValue(mockJobId);
      (redis.hgetall as jest.Mock).mockResolvedValue(mockJobData);
      (redis.hset as jest.Mock).mockResolvedValue(1);

      const job = await queue.getNextJob();

      expect(job).toBeTruthy();
      expect(job?.id).toBe(mockJobId);
      expect(redis.hset).toHaveBeenCalledWith(
        `job:${mockJobId}`,
        expect.objectContaining({
          status: "processing",
        })
      );
    });
  });

  describe("updateJobStatus", () => {
    it("should update job status and handle recurring jobs", async () => {
      const mockJobId = "test-job-id";
      const mockJobData = {
        id: mockJobId,
        type: "test-type",
        data: JSON.stringify({ test: "data" }),
        status: "processing",
        createdAt: Date.now().toString(),
        updatedAt: Date.now().toString(),
        attempts: "0",
        maxAttempts: "3",
        priority: "0",
        cron: "* * * * *",
      };

      (redis.hgetall as jest.Mock).mockResolvedValue(mockJobData);
      (redis.hset as jest.Mock).mockResolvedValue(1);
      (redis.zadd as jest.Mock).mockResolvedValue(1);

      await queue.updateJobStatus(mockJobId, "completed");

      expect(redis.hset).toHaveBeenCalledWith(
        `job:${mockJobId}`,
        expect.objectContaining({
          status: "completed",
          attempts: "1",
        })
      );
      expect(redis.zadd).toHaveBeenCalledWith(
        `${queueName}:delayed`,
        expect.any(Number),
        mockJobId
      );
    });
  });

  describe("removeJob", () => {
    it("should remove a job from all queues", async () => {
      const jobId = "test-job-id";

      (redis.del as jest.Mock).mockResolvedValue(1);
      (redis.zrem as jest.Mock).mockResolvedValue(1);

      await queue.removeJob(jobId);

      expect(redis.del).toHaveBeenCalledWith(`job:${jobId}`);
      expect(redis.zrem).toHaveBeenCalledWith(`${queueName}:pending`, jobId);
      expect(redis.zrem).toHaveBeenCalledWith(`${queueName}:delayed`, jobId);
    });
  });
});
