export function runIndexes(row) {
  return Object.keys(row || {})
    .map((key) => key.match(/^coze_run_(\d+)_(?:content|error)$/)?.[1])
    .filter(Boolean)
    .map(Number)
    .filter((index, position, indexes) => indexes.indexOf(index) === position)
    .sort((a, b) => b - a);
}

export function nextRunIndex(row) {
  const indexes = runIndexes(row);
  return indexes.length ? Math.max(...indexes) + 1 : 1;
}

export function applyBatchRunResults(rows, caseResults = []) {
  const touched = [];
  for (const caseResult of caseResults) {
    const row = rows[caseResult.clientIndex];
    if (!row) continue;
    for (const result of caseResult.results || []) {
      const nextRun = nextRunIndex(row);
      row[`coze_run_${nextRun}_time`] = result.timestamp || new Date().toISOString();
      row[`coze_run_${nextRun}_content`] = result.error ? "" : (result.content || "");
      row[`coze_run_${nextRun}_prompt`] = result.prompt || "";
      row[`coze_run_${nextRun}_raw_output`] = result.rawOutput || result.raw || "";
      row[`coze_run_${nextRun}_error`] = result.error || "";
      touched.push({ row, runIndex: nextRun, error: result.error || "" });
    }
  }
  return touched;
}

export function clearRunRecords(row) {
  let removed = 0;
  for (const key of Object.keys(row || {})) {
    if (/^coze_run_\d+_/.test(key)) {
      delete row[key];
      removed += 1;
    }
  }
  return removed;
}

export function clearRunRecordsForRows(rows, indexes = []) {
  let cases = 0;
  let fields = 0;
  for (const index of indexes) {
    const row = rows[index];
    if (!row) continue;
    const removed = clearRunRecords(row);
    if (removed > 0) cases += 1;
    fields += removed;
  }
  return { cases, fields };
}
