/**
 * Runs async tasks with a maximum concurrency limit.
 * Returns results in the same order as the input array.
 */
export async function concurrencyPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (completed: number, total: number, result: R | undefined, index: number) => void,
  shouldCancel?: () => boolean
): Promise<{ results: (R | undefined)[]; errors: { index: number; error: unknown }[] }> {
  const results: (R | undefined)[] = new Array(items.length);
  const errors: { index: number; error: unknown }[] = [];
  let nextIndex = 0;
  let completedCount = 0;

  async function worker() {
    while (nextIndex < items.length) {
      if (shouldCancel?.()) break;
      const currentIndex = nextIndex++;
      try {
        const result = await fn(items[currentIndex], currentIndex);
        results[currentIndex] = result;
      } catch (error) {
        errors.push({ index: currentIndex, error });
      } finally {
        completedCount++;
        onProgress?.(completedCount, items.length, results[currentIndex], currentIndex);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);

  return { results, errors };
}
