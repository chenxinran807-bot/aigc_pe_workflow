import { DIMENSIONS, normalizeIssueLabel } from "./audit-dataset.mjs";

export function evaluateAuditResults(cases, predictions) {
  const predictionByCase = new Map(predictions.map((item) => [item.caseId, item]));
  const perLabel = new Map();
  const badcases = [];
  const unverifiedExtraFindings = [];
  let parseFailures = 0;
  let inputFailures = 0;
  let pendingCases = 0;
  let evaluatedCases = 0;

  for (const item of cases) {
    const prediction = predictionByCase.get(item.caseId);
    if (!prediction) {
      pendingCases += 1;
      continue;
    }
    if (!prediction.parsed) {
      parseFailures += 1;
      badcases.push({ caseId: item.caseId, type: "parse_failure" });
      continue;
    }
    if (isMissingImagePrediction(prediction.parsed)) {
      inputFailures += 1;
      badcases.push({ caseId: item.caseId, type: "input_failure" });
      continue;
    }
    evaluatedCases += 1;
    for (const dimension of DIMENSIONS) {
      const key = dimension.key;
      const expected = new Set((item.dimensions[key]?.issues || [])
        .map((label) => canonicalIssueLabel(key, label)).filter(Boolean));
      const predicted = new Set((prediction.parsed[key]?.issues || [])
        .map((label) => canonicalIssueLabel(key, label)).filter(Boolean));
      for (const label of expected) {
        const stats = ensureLabel(perLabel, `${key}:${label}`, key, label);
        if (predicted.has(label)) stats.tp += 1;
        else {
          stats.fn += 1;
          badcases.push({ caseId: item.caseId, dimension: key, type: "missed_issue", label });
        }
      }
      for (const label of predicted) {
        if (expected.has(label)) continue;
        const finding = {
          caseId: item.caseId,
          dimension: key,
          label,
          evidence: prediction.parsed[key]?.evidence || "",
          type: "unverified_extra_finding",
        };
        unverifiedExtraFindings.push(finding);
      }
    }
  }

  const labels = [...perLabel.values()].map(finalizeLabel);
  const macroRecall = average(labels.map((item) => item.recall));
  const strictLabels = addStrictFalsePositives(labels, unverifiedExtraFindings);
  const macroF1Strict = average(strictLabels.map((item) => item.f1));
  const expectedIssueCount = labels.reduce((sum, item) => sum + item.tp + item.fn, 0);
  const foundIssueCount = labels.reduce((sum, item) => sum + item.tp, 0);

  return {
    summary: {
      totalCases: cases.length,
      evaluatedCases,
      pendingCases,
      parseFailures,
      inputFailures,
      expectedIssueCount,
      foundIssueCount,
      issueRecall: ratio(foundIssueCount, expectedIssueCount),
      macroRecall,
      macroF1Strict,
      unverifiedExtraFindingCount: unverifiedExtraFindings.length,
      precisionPolicy: "模型额外发现不作为正式误报；strict 指标仅作保守参考。",
    },
    labels,
    strictLabels,
    badcases,
    unverifiedExtraFindings,
  };
}

export function canonicalIssueLabel(dimension, value) {
  const label = normalizeIssueLabel(value);
  if (!label) return "";
  if (dimension === "pose") {
    if (/(手指|关节|多指|少指|手部|指融合|手指融合)/.test(label)) return "hand_finger_defect";
    if (/(身材|体型).*(不一致|偏差|变化)|与原模特不一致/.test(label)) return "body_mismatch";
  }
  if (dimension === "face" && /(发型|头发|发丝)/.test(label)) return "hairstyle_change";
  if (dimension === "clothing") {
    if (/(图案|logo|文字).*(模糊|变形|错误|不符|缺失)|^(图案|logo|文字)/.test(label)) {
      return "pattern_logo_distortion";
    }
    if (/(穿模|衣服边缘|服装边缘)/.test(label)) return "garment_edge_artifact";
  }
  if (dimension === "scene" && /背景/.test(label) && /(变化|偏差|颜色|环境|错误|不符)/.test(label)) {
    return "background_change";
  }
  return label;
}

export function isMissingImagePrediction(parsed) {
  const markers = ["输入缺失", "未提供", "缺少", "无法获取", "未获取", "证据不足", "缺失图片"];
  return ["face", "pose", "clothing", "scene"].some((key) =>
    (parsed?.[key]?.issues || []).some((issue) => markers.some((marker) => String(issue).includes(marker))));
}

function ensureLabel(map, id, dimension, label) {
  if (!map.has(id)) map.set(id, { id, dimension, label, tp: 0, fn: 0, fp: 0 });
  return map.get(id);
}

function finalizeLabel(item) {
  const precision = ratio(item.tp, item.tp + item.fp);
  const recall = ratio(item.tp, item.tp + item.fn);
  return { ...item, precision, recall, f1: f1(precision, recall) };
}

function addStrictFalsePositives(labels, extras) {
  const map = new Map(labels.map((item) => [item.id, { ...item }]));
  for (const extra of extras) {
    const id = `${extra.dimension}:${extra.label}`;
    const item = map.get(id) || {
      id,
      dimension: extra.dimension,
      label: extra.label,
      tp: 0,
      fn: 0,
      fp: 0,
    };
    item.fp += 1;
    map.set(id, item);
  }
  return [...map.values()].map(finalizeLabel);
}

function f1(precision, recall) {
  if (precision === null || recall === null || precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}
