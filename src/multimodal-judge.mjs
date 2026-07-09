const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export function multimodalJudgeConfig(env = process.env) {
  return {
    apiKey: env.JUDGE_API_KEY || env.OPENAI_API_KEY || "",
    baseUrl: env.JUDGE_BASE_URL || env.OPENAI_BASE_URL || DEFAULT_BASE_URL,
    model: env.JUDGE_MODEL || env.OPENAI_MODEL || "",
  };
}

export function buildMultimodalJudgeRequest(item = {}, options = {}) {
  const model = options.model || "vision-model";
  return {
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "你是 AI 试穿 badcase 多模态裁判。",
          "你必须同时查看 user_image、outfit_image、original_content、new_content 四张图，并读取人工问题类型、归因备注、prompt、VLM 描述。",
          "输出严格 JSON，不要 Markdown。",
          "JSON 字段：case_id、improved、remaining_issue、root_cause、category、prompt_fixability、evidence、suggestion、prompt_edit、engineering_action、confidence。",
          "improved 取值：原始case命中/原始case未命中/明显改善/部分改善/未改善/更差/无法判断。",
          "root_cause 取值：prompt问题/VLM描述问题/模型生成能力问题/输入图问题/工程链路问题/其他。",
          "prompt_fixability 取值：high/medium/low。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          { type: "text", text: evidencePrompt(item) },
          imagePart("user_image", item.userImage),
          imagePart("outfit_image", item.outfitImage),
          imagePart("original_content", item.originalContent),
          imagePart("new_content", item.newContent),
        ].filter(Boolean),
      },
    ],
  };
}

export async function judgeMultimodalBatch(items = [], options = {}) {
  const config = { ...multimodalJudgeConfig(), ...options };
  if (!config.apiKey) {
    return { ok: false, error: "未配置 JUDGE_API_KEY 或 OPENAI_API_KEY，无法调用多模态裁判模型。", total: items.length, results: [], themes: [], nextActions: [] };
  }
  if (!config.model) {
    return { ok: false, error: "未配置 JUDGE_MODEL 或 OPENAI_MODEL，无法调用多模态裁判模型。", total: items.length, results: [], themes: [], nextActions: [] };
  }

  const fetcher = config.fetcher || fetch;
  const results = [];
  for (const item of items) {
    results.push(await judgeOneMultimodal(item, config, fetcher));
  }
  return {
    ok: true,
    total: results.length,
    results,
    themes: aggregateThemes(results),
    nextActions: nextActions(results),
  };
}

async function judgeOneMultimodal(item, config, fetcher) {
  const request = buildMultimodalJudgeRequest(item, { model: config.model });
  try {
    const response = await fetcher(`${trimSlash(config.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(request),
    });
    const data = await response.json();
    if (!response.ok) {
      return errorResult(item, `模型接口失败：${response.status || ""} ${JSON.stringify(data).slice(0, 500)}`);
    }
    const content = data.choices?.[0]?.message?.content || "";
    return normalizeModelResult(item, parseJudgeModelOutput(content), content);
  } catch (error) {
    return errorResult(item, error.message || String(error));
  }
}

export function parseJudgeModelOutput(text = "") {
  const clean = text.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  const jsonText = start >= 0 && end > start ? clean.slice(start, end + 1) : clean;
  try {
    return JSON.parse(jsonText);
  } catch {
    return {};
  }
}

function normalizeModelResult(item, parsed, raw) {
  return {
    caseId: String(parsed.case_id || item.caseId || ""),
    source: "multimodal_model",
    improved: parsed.improved || "无法判断",
    remainingIssue: parsed.remaining_issue || "",
    rootCause: parsed.root_cause || "其他",
    category: parsed.category || "",
    promptFixability: parsed.prompt_fixability || "",
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
    recommendation: parsed.suggestion || "",
    promptEdit: parsed.prompt_edit || "",
    engineeringAction: parsed.engineering_action || "",
    confidence: Number(parsed.confidence ?? 0),
    raw,
  };
}

function errorResult(item, error) {
  return {
    caseId: String(item.caseId || ""),
    source: "multimodal_model",
    improved: "无法判断",
    rootCause: "工程链路问题",
    promptFixability: "low",
    evidence: [error],
    recommendation: "多模态裁判调用失败，请检查模型配置、图片 URL 可访问性和网络。",
    confidence: 0,
    error,
  };
}

function evidencePrompt(item) {
  return [
    `case_id: ${item.caseId || ""}`,
    `judge_mode: ${item.judgeMode || ""}`,
    `人工问题类型: ${item.problemType || ""}`,
    `人工归因备注: ${item.attributionNote || ""}`,
    "",
    "【原始 prompt】",
    item.originalPrompt || "",
    "",
    "【本次 run prompt】",
    item.runPrompt || "",
    "",
    "【user_vlm】",
    item.userVlm || "",
    "",
    "【outfit_vlm】",
    item.outfitVlm || "",
    "",
    "请先判断原始问题是否存在，再判断 new_content 相对 original_content 是否改善，并给出下一步 prompt 或工程链路建议。",
  ].join("\n");
}

function imagePart(label, url) {
  if (!url || !/^https?:\/\//.test(url)) return null;
  return {
    type: "image_url",
    image_url: { url, detail: "high" },
    label,
  };
}

function aggregateThemes(results) {
  const map = new Map();
  for (const result of results) {
    const key = result.category || result.rootCause || "其他";
    const theme = map.get(key) || { category: key, count: 0, rootCauses: {}, caseIds: [] };
    theme.count += 1;
    theme.caseIds.push(result.caseId);
    theme.rootCauses[result.rootCause] = (theme.rootCauses[result.rootCause] || 0) + 1;
    map.set(key, theme);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function nextActions(results) {
  const actions = results
    .map((result) => result.recommendation || result.engineeringAction || result.promptEdit || result.rootCause)
    .filter(Boolean);
  return [...new Set(actions)].slice(0, 8);
}

function trimSlash(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}
