import { runStringWorkflow } from "./coze-string-workflow.mjs";
import { extractJudgeResult } from "./judge-result.mjs";

export const JUDGE_WORKFLOW_URL = "https://cloud.bytedance.net/coze/organization/space/detail/work_flow?workflow_id=7635974953875898394&space_id=7616637259453857843&x-resource-account=public&x-bc-region-id=bytedance&cozeAccountId=2109274892&cozeOrgId=7616637684514619402&cozeSpaceId=7616637259453857843";

export async function runJudge(payload, options = {}) {
  const inputs = buildJudgeWorkflowInputs(payload);
  const runner = options.runner || runStringWorkflow;
  const result = await runner({
    url: options.url || JUDGE_WORKFLOW_URL,
    inputs,
    timeoutMs: options.timeoutMs || 120000,
    reuseOpenPage: options.reuseOpenPage ?? true,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "judge workflow failed",
      raw: JSON.stringify(result.scrape || {}),
      parsed: {},
    };
  }
  const extracted = extractJudgeResult(result.scrape);
  const parsed = extracted.parsed || {};
  if (isInvalidJudgeResponse(parsed)) {
    return {
      ok: true,
      inputDebug: fieldLengths(inputs),
      ...extracted,
      parsed: fallbackJudgeResult(payload, inputs, parsed),
      cozeJudgeFailed: true,
      cozeFailureReason: "Coze 裁判返回空模板/低置信无证据结论，不能作为有效评测依据。",
      cozeParsed: parsed,
    };
  }
  return {
    ok: true,
    inputDebug: fieldLengths(inputs),
    ...extracted,
  };
}

export function buildJudgeWorkflowInputs(payload = {}) {
  const generatedType = payload.generated_type || payload.judge_target || payload.judge_mode || "generated";
  const generatedImage = payload.generated_image || payload.new_content || payload.original_content || "";
  const prompt = payload.prompt || payload.run_prompt || payload.original_prompt || "";
  return {
    user_image: payload.user_image || "",
    outfit_image: payload.outfit_image || "",
    generated_image: generatedImage,
    generated_type: generatedType,
    prompt,
    user_vlm: payload.user_vlm || "",
    outfit_vlm: payload.outfit_vlm || "",
  };
}

function fieldLengths(inputs) {
  return Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, String(value || "").length]));
}

function isInvalidJudgeResponse(parsed = {}) {
  const text = [
    parsed.improved,
    parsed.remaining_issue,
    parsed.root_cause,
    parsed.suggestion,
    ...(Array.isArray(parsed.evidence) ? parsed.evidence : []),
  ].filter(Boolean).join("\n");
  if (/未提供|缺少|请提供完整|无法评估|缺乏/.test(text)) return true;

  const dimensions = Object.values(parsed.dimensions || {});
  const allZero = dimensions.length > 0 && dimensions.every((dim) => Number(dim.score) === 0);
  const hasDimensionEvidence = dimensions.some((dim) => (
    String(dim.evidence || "").trim() ||
    (Array.isArray(dim.issues) && dim.issues.length > 0)
  ));
  const emptyVlmIssues = [parsed.user_vlm_check, parsed.outfit_vlm_check]
    .filter(Boolean)
    .every((item) => !Array.isArray(item.issues) || item.issues.length === 0);
  return parsed.confidence === 0 && allZero && !hasDimensionEvidence && emptyVlmIssues;
}

function fallbackJudgeResult(payload, inputs, cozeParsed) {
  const mode = payload.judge_mode || "";
  const issue = payload.problem_type || "";
  const note = payload.attribution_note || "";
  const hasRun = payload.new_content && payload.new_content !== payload.original_content;
  if (mode.includes("原始 case")) {
    return {
      improved: "原始case命中",
      remaining_issue: issue || "按人工标注存在 badcase 问题",
      root_cause: note || "以人工归因为准",
      evidence: [
        "人工评测已将该原始 case 标注为 badcase",
        `Coze 裁判输入已填写：${formatDebugForEvidence(inputs)}`,
        "Coze 裁判节点未可靠读取变量，本结论为人工标注校准兜底",
      ],
      suggestion: "当前应先修复/替换 Coze 裁判节点；原始 case 校准可直接以人工标注作为标准样本。",
      prompt_edit: "无",
      confidence: 0.6,
      coze_invalid_result: cozeParsed,
    };
  }
  return {
    improved: hasRun ? "待人工确认" : "无法判断",
    remaining_issue: issue || "需对比图片确认",
    root_cause: note || "需结合人工备注判断",
    evidence: [
      `Coze 裁判输入已填写：${formatDebugForEvidence(inputs)}`,
      "Coze 裁判节点返回缺少信息，说明本次 AI 裁判无效",
    ],
    suggestion: "不要采纳本次 Coze 裁判建议；请先用页面图片对比人工确认，或改用可直接读取图片和文本的裁判链路。",
    prompt_edit: "",
    confidence: 0.2,
    coze_invalid_result: cozeParsed,
  };
}

function formatDebugForEvidence(inputs) {
  return Object.entries(fieldLengths(inputs))
    .map(([key, length]) => `${key}=${length}`)
    .join(", ");
}
