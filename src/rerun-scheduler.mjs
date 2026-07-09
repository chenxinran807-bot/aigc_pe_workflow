export async function runWithConcurrency(tasks, concurrency) {
  const limit = Math.max(1, Math.min(tasks.length || 1, Number(concurrency) || 1));
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await tasks[index]();
      } catch (error) {
        results[index] = { error: error.message || String(error) };
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

export function cozeWorkflowConcurrency({ requested, casesCount, runCount, max = 4 }) {
  const totalRuns = Math.max(1, (Number(casesCount) || 0) * (Number(runCount) || 1));
  const desired = Number(requested) || totalRuns;
  return Math.max(1, Math.min(Number(max) || 4, totalRuns, desired));
}
