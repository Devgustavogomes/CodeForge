export const flushAsync = (ms = 5): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

