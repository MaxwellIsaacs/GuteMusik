/**
 * Centralized rate limiting for all external API sources
 * Ensures we respect rate limits and don't get blocked
 */

import { RATE_LIMITS, type RateLimitConfig } from './sources/types';

interface QueuedRequest<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

interface SourceQueue {
  queue: QueuedRequest<unknown>[];
  isProcessing: boolean;
  lastRequestTime: number;
  config: RateLimitConfig;
}

// Per-source rate limiting queues
const sourceQueues = new Map<string, SourceQueue>();

function getOrCreateQueue(sourceName: string): SourceQueue {
  const existing = sourceQueues.get(sourceName);
  if (existing) return existing;

  const config = RATE_LIMITS[sourceName] || { requestsPerMinute: 60, minIntervalMs: 1000 };
  const queue: SourceQueue = {
    queue: [],
    isProcessing: false,
    lastRequestTime: 0,
    config,
  };
  sourceQueues.set(sourceName, queue);
  return queue;
}

async function processQueue(sourceName: string): Promise<void> {
  const sourceQueue = sourceQueues.get(sourceName);
  if (!sourceQueue || sourceQueue.isProcessing) return;

  sourceQueue.isProcessing = true;

  while (sourceQueue.queue.length > 0) {
    const request = sourceQueue.queue.shift();
    if (!request) continue;

    const now = Date.now();
    const timeSinceLastRequest = now - sourceQueue.lastRequestTime;

    // Wait if we need to respect rate limit
    if (timeSinceLastRequest < sourceQueue.config.minIntervalMs) {
      const waitTime = sourceQueue.config.minIntervalMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    sourceQueue.lastRequestTime = Date.now();

    try {
      const result = await request.fn();
      request.resolve(result);
    } catch (error) {
      request.reject(error as Error);
    }
  }

  sourceQueue.isProcessing = false;
}

/**
 * Enqueue a rate-limited request for a specific source
 */
export function rateLimitedFetch<T>(
  sourceName: string,
  fn: () => Promise<T>
): Promise<T> {
  const sourceQueue = getOrCreateQueue(sourceName);

  return new Promise<T>((resolve, reject) => {
    sourceQueue.queue.push({
      fn,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    processQueue(sourceName);
  });
}

/**
 * Simple delay helper for one-off delays
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout and abort signal support
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = 10000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Combine signals if one was provided
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Clear rate limit queue for a source (useful for testing)
 */
export function clearQueue(sourceName: string): void {
  const queue = sourceQueues.get(sourceName);
  if (queue) {
    queue.queue = [];
    queue.isProcessing = false;
  }
}
