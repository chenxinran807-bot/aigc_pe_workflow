export const evaluationDimensions = [
  {
    id: "face",
    label: "面部/妆造/发型",
    score: "面部特征与妆造发型还原",
    problem: "问题类型",
    attribution: "归因",
    note: "归因备注",
  },
  {
    id: "pose",
    label: "姿势/肢体",
    score: "姿势微调与肢体自然度",
    problem: "问题类型__dup2",
    attribution: "归因__dup2",
    note: "归因备注__dup2",
  },
  {
    id: "clothing",
    label: "服装特征",
    score: "服装特征保留度",
    problem: "问题类型__dup3",
    attribution: "归因__dup3",
    note: "归因备注__dup3",
  },
  {
    id: "scene",
    label: "场景/背景",
    score: "场景氛围与背景幻觉",
    problem: "问题类型__dup4",
    attribution: "归因__dup4",
    note: "归因备注__dup4",
  },
];

export function buildEvaluationSummary(rows) {
  const total = rows.length;
  const scoredRows = rows.filter((row) => evaluationDimensions.every((dim) => isScore(row[dim.score])));
  const qualified = scoredRows.filter((row) => evaluationDimensions.every((dim) => score(row[dim.score]) >= 1)).length;
  const perfect = scoredRows.filter((row) => evaluationDimensions.every((dim) => score(row[dim.score]) >= 2)).length;
  const dimensions = evaluationDimensions.map((dim) => dimensionSummary(rows, dim));
  return {
    total,
    scored: scoredRows.length,
    qualified,
    perfect,
    qualifiedRate: rate(qualified, scoredRows.length),
    perfectRate: rate(perfect, scoredRows.length),
    dimensions,
  };
}

export function buildEvaluationClusters(rows, mode = "fail") {
  const threshold = mode === "imperfect" ? 2 : 1;
  const map = new Map();
  rows.forEach((row, index) => {
    for (const dim of evaluationDimensions) {
      if (!isScore(row[dim.score]) || score(row[dim.score]) >= threshold) continue;
      const phrase = clusterPhrase(row, dim);
      const key = `eval:${mode}:${dim.id}:${phrase}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          mode,
          title: `${dim.label} · ${phrase}`,
          dimension: dim.label,
          sampleNote: row[dim.note] || row[dim.problem] || row[dim.attribution] || "",
          caseIndexes: [],
        });
      }
      map.get(key).caseIndexes.push(index);
    }
  });
  return [...map.values()].sort((a, b) => b.caseIndexes.length - a.caseIndexes.length || a.title.localeCompare(b.title, "zh-Hans-CN"));
}

function dimensionSummary(rows, dim) {
  const scoredRows = rows.filter((row) => isScore(row[dim.score]));
  const pass = scoredRows.filter((row) => score(row[dim.score]) >= 1).length;
  const perfect = scoredRows.filter((row) => score(row[dim.score]) >= 2).length;
  return {
    ...dim,
    total: scoredRows.length,
    pass,
    perfect,
    passRate: rate(pass, scoredRows.length),
    perfectRate: rate(perfect, scoredRows.length),
  };
}

function clusterPhrase(row, dim) {
  return normalizePhrase(row[dim.attribution] || row[dim.note] || row[dim.problem] || "未分类");
}

function normalizePhrase(value) {
  const text = String(value || "")
    .replace(/[，,。；;、/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || "未分类";
}

function isScore(value) {
  return Number.isFinite(score(value));
}

function score(value) {
  if (value === "" || value === null || value === undefined) return NaN;
  return Number(value);
}

function rate(count, total) {
  return total ? count / total : 0;
}
