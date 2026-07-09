export function latestImprovementStatus(row) {
  const latest = latestRunIndex(row);
  if (!latest) return "";
  return String(row[`coze_run_${latest}_improvement`] || "待确认").trim() || "待确认";
}

export function matchesImprovementFilter(row, filter) {
  const value = String(filter || "all");
  if (value === "all") return true;
  const status = latestImprovementStatus(row);
  if (value === "needs-review") return status === "未改善" || status === "待确认";
  return status === value;
}

function latestRunIndex(row) {
  return Object.keys(row || {})
    .map((key) => key.match(/^coze_run_(\d+)_(content|error)$/)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => b - a)[0] || 0;
}
