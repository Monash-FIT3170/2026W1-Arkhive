
/**a waiting function that sets timeout before running
 * 
 * @param time 
 * @returns 
 * 
 * @author Harsha Sharma (33879303)
 */
const wait = (time: number) => {
  return new Promise((resolve) => setTimeout(() => resolve("waiting"), time));
}

/**an async function that handles retries
 * 
 * @param fn 
 * 
 * @param maxRetries 
 * @param delayMs 
 * @returns 
 * 
 * @author Harsha Sharma (33879303)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
  onRetry?: (attempt: number, maxRetries: number) => void
): Promise<T> {
  let attempts = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      if (error && error.message && error.message.includes("NoTextDetectedError")) {
        throw error;
      }
      if (attempts >= maxRetries) {
        throw error;
      }
      attempts++;
      console.log(`Retrying... attempt ${attempts} of ${maxRetries}`);
      if (onRetry) {
        onRetry(attempts, maxRetries);
      }
      await wait(delayMs);
    }
  }
}