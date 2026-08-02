import { AUDIT_WORKFLOW } from "./audit-source-catalog.mjs";
import { runStringWorkflow } from "./coze-string-workflow.mjs";

const DETAIL_FIELDS = [
  "user_face_detail",
  "generated_face_detail",
  "outfit_clothing_detail",
  "generated_clothing_detail",
  "generated_hand_detail",
];

export async function runAuditCase(item, options = {}) {
  const runner = options.runner || runStringWorkflow;
  const workflow = options.workflow || AUDIT_WORKFLOW;
  const startedAtMs = Date.now();
  const request = buildAuditWorkflowRequest(item, options, workflow);
  const firstResult = await runner(request);
  const firstExtracted = extractAuditResult(firstResult?.scrape);
  const shouldRetry = options.retryMissingImages !== false
    && firstResult?.ok
    && hasMissingImageResult(firstExtracted.parsed);
  const result = shouldRetry ? await runner(request) : firstResult;
  const extracted = shouldRetry ? extractAuditResult(result?.scrape) : firstExtracted;
  return {
    caseId: item.caseId,
    modelId: options.modelId || "doubao-1.8-deep-thinking",
    workflowId: workflow.workflowId,
    promptVersion: options.promptVersion || "baseline-2026-07-31",
    startedAt: new Date(startedAtMs).toISOString(),
    latencyMs: Date.now() - startedAtMs,
    ok: Boolean(result?.ok && extracted.parsed),
    parsed: extracted.parsed,
    raw: extracted.raw,
    error: result?.ok ? "" : result?.error || "workflow failed",
    inputWarmRetry: shouldRetry,
    inputVariant: options.inputVariant || "original-url",
  };
}

export function buildAuditWorkflowRequest(item, options = {}, workflow = AUDIT_WORKFLOW) {
  const roleMap = {
    generated_image: "generated",
    outfit_image: "outfit",
    user_image: "user",
  };
  const originalFileOverrides = Object.fromEntries(Object.entries(roleMap)
    .filter(([, role]) => options.files?.[role])
    .map(([field, role]) => [field, options.files[role]]));
  const detailFiles = Object.fromEntries(DETAIL_FIELDS
    .filter((field) => options.detailFiles?.[field])
    .map((field) => [field, options.detailFiles[field]]));
  const files = { ...originalFileOverrides, ...detailFiles };
  return {
    url: workflow.url,
    inputs: Object.fromEntries(Object.entries(roleMap)
      .map(([field, role]) => [field, item.images?.[role] || ""])),
    ...(Object.keys(files).length ? { files } : {}),
    timeoutMs: options.timeoutMs || 180000,
    reuseOpenPage: options.reuseOpenPage ?? true,
    inputSettleMs: options.inputSettleMs ?? (Object.keys(files).length ? 1000 : 3500),
  };
}

export function hasMissingImageResult(parsed) {
  if (!parsed || typeof parsed !== "object") return false;
  const dimensions = ["face", "pose", "clothing", "scene"];
  const markers = ["输入缺失", "未提供", "缺少", "无法获取", "未获取", "证据不足", "缺失图片"];
  return dimensions.some((key) => (parsed[key]?.issues || [])
    .some((issue) => markers.some((marker) => String(issue).includes(marker))));
}

export function extractAuditResult(scrape = {}) {
  const text = scrape.text || "";
  const marker = "audit_result";
  const markerIndex = text.lastIndexOf(marker);
  const candidate = markerIndex >= 0 ? text.slice(markerIndex) : text;
  const quoted = extractQuotedValue(candidate);
  const raw = quoted || extractJson(candidate);
  return { raw, parsed: parseNestedJson(raw) };
}

function extractQuotedValue(text) {
  const match = text.match(/audit_result\s*:\s*"((?:\\.|[^"\\])*)"/s);
  if (!match) return "";
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1].replaceAll('\\"', '"').replaceAll("\\n", "\n");
  }
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : "";
}

function parseNestedJson(value) {
  let current = value;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (current && typeof current === "object") return current;
    try {
      current = JSON.parse(String(current || ""));
    } catch {
      return null;
    }
  }
  return current && typeof current === "object" ? current : null;
}
