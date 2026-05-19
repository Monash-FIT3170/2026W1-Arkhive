const wait = (time: number) => {
  return new Promise((resolve) => setTimeout(() => resolve("waiting"), time));
}


export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (maxRetries <= 0) {
      throw error; // No more retries left
    }
    console.log(`Retrying... attempts left: ${maxRetries}`);
    await wait(3000)
    return withRetry(fn, maxRetries - 1, delayMs); // Recursive call
  }
}