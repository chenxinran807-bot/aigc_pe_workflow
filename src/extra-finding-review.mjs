import { createHash } from "node:crypto";

const DIMENSIONS = ["face", "pose", "clothing", "scene"];
const VERDICTS = new Set(["confirmed_issue", "false_positive", "uncertain"]);

export function findingIdFor(finding) {
  const normalized = [finding.caseId, finding.dimension, finding.label, finding.evidence]
    .map((value) => String(value ?? "").toLowerCase().replace(/\s+/g, ""))
    .join("\n");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}

export function buildExtraFindingReviewInput({ trainCases, extras, model, promptVersion }) {
  const extrasByCase = new Map();
  const trainIds = new Set(trainCases.map((item) => item.caseId));
  for (const finding of extras) {
    if (!trainIds.has(finding.caseId)) continue;
    const normalized = { ...finding, findingId: findingIdFor(finding) };
    const list = extrasByCase.get(finding.caseId) || [];
    list.push(normalized);
    extrasByCase.set(finding.caseId, list);
  }
  return {
    model,
    promptVersion,
    generatedAt: new Date().toISOString(),
    cases: trainCases.filter((item) => extrasByCase.has(item.caseId)).map((item) => ({
      caseId: item.caseId,
      images: item.images,
      humanIssues: Object.fromEntries(DIMENSIONS.map((key) => [key, item.dimensions?.[key]?.issues || []])),
      extraFindings: extrasByCase.get(item.caseId),
    })),
  };
}

export function validateReviewRecord(record) {
  if (!record?.caseId || !record?.findingId) throw new Error("caseId and findingId are required");
  if (!VERDICTS.has(record.verdict)) throw new Error("invalid verdict");
  return {
    caseId: String(record.caseId),
    findingId: String(record.findingId),
    verdict: record.verdict,
    note: String(record.note || "").trim(),
    reviewedAt: record.reviewedAt || new Date().toISOString(),
  };
}

export function summarizeReview({ totalFindings, records }) {
  const counts = { confirmed_issue: 0, false_positive: 0, uncertain: 0 };
  const byDimension = {};
  const byLabel = {};
  for (const record of records) {
    counts[record.verdict] += 1;
    const dimension = record.dimension || "unknown";
    const label = record.label || "unknown";
    byDimension[dimension] ||= { confirmed_issue: 0, false_positive: 0, uncertain: 0 };
    byLabel[label] ||= { confirmed_issue: 0, false_positive: 0, uncertain: 0 };
    byDimension[dimension][record.verdict] += 1;
    byLabel[label][record.verdict] += 1;
  }
  const reviewed = records.length;
  const decided = counts.confirmed_issue + counts.false_positive;
  return {
    totalFindings,
    reviewed,
    pending: Math.max(0, totalFindings - reviewed),
    ...counts,
    confirmedRate: decided ? counts.confirmed_issue / decided : null,
    falsePositiveRate: decided ? counts.false_positive / decided : null,
    uncertainRate: reviewed ? counts.uncertain / reviewed : null,
    byDimension,
    byLabel,
  };
}
