export function isTransientCozeRunError(error) {
  const text = String(error?.message || error || "");
  return /test run panel unavailable|试运行面板不可用|Coze 工作流内嵌页不可用|新开的 Coze 工作流标签页不可用|test run panel did not expose input fields|test run button not found/i.test(text);
}

export async function runWithTransientRetry(operation, options = {}) {
  const attempts = Math.max(1, Math.floor(Number(options.attempts) || 1));
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isTransientCozeRunError(error)) throw error;
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

