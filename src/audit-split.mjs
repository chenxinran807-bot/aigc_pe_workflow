import { createHash } from "node:crypto";

export function splitDatasetByGroup(cases, options = {}) {
  const trainRatio = options.trainRatio ?? 0.6;
  const validationRatio = options.validationRatio ?? 0.2;
  if (trainRatio <= 0 || validationRatio < 0 || trainRatio + validationRatio >= 1) {
    throw new Error("split ratios must leave a non-empty test share");
  }
  const seed = options.seed || "tryon-audit-v1";
  const groups = new Map();
  for (const item of cases) {
    const groupId = item.groupId || item.caseId;
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(item);
  }

  const partitions = { train: [], validation: [], test: [] };
  for (const [groupId, items] of groups) {
    const bucket = hashFraction(`${seed}:${groupId}`);
    const name = bucket < trainRatio
      ? "train"
      : bucket < trainRatio + validationRatio ? "validation" : "test";
    partitions[name].push(...items);
  }
  return {
    seed,
    ratios: { train: trainRatio, validation: validationRatio, test: 1 - trainRatio - validationRatio },
    partitions,
    summary: Object.fromEntries(Object.entries(partitions).map(([name, items]) => [name, summarize(items)])),
  };
}

function summarize(items) {
  return {
    cases: items.length,
    groups: new Set(items.map((item) => item.groupId || item.caseId)).size,
    issueLabels: items.reduce((total, item) => total + Object.values(item.dimensions || {})
      .reduce((sum, dimension) => sum + (dimension.issues || []).length, 0), 0),
  };
}

function hashFraction(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 13);
  return Number.parseInt(hex, 16) / 0x10000000000000;
}
