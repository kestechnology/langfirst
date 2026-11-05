/**
 * Exponential backoff retry utility for network requests.
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    initialDelayMs = 500,
    maxDelayMs = 4000,
    backoffFactor = 2,
  } = options;

  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(input, init);

      // Only retry on transient 5xx server errors or 429 rate limit
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
        return response;
      }

      if (attempt === maxRetries) {
        return response;
      }
    } catch (err) {
      if (attempt === maxRetries) {
        throw err;
      }
    }

    attempt++;
    const jitter = Math.random() * 150;
    const delay = Math.min(
      maxDelayMs,
      initialDelayMs * Math.pow(backoffFactor, attempt - 1) + jitter
    );

    console.warn(`[Network Retry] Attempt ${attempt}/${maxRetries} failed. Retrying in ${Math.round(delay)}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw new Error('Maximum network retries exceeded.');
}

