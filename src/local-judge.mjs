const CATEGORY_RULES = [
  {
    category: "identity_hair_makeup",
    label: "面部/妆容/发型",
    pattern: /肤色|妆容|发型|短发|长发|五官|脸|身份|ID|美颜|发色/,
    promptAction: "强化 user 图身份、发型、妆容保留；对 outfit 图头发和脸部信息做显式打压。",
  },
  {
    category: "pose_limb",
    label: "姿势/肢体/手脚",
    pattern: /姿势|肢体|手|脚|多指|融合|畸形|重心|身体|腿|胳膊/,
    promptAction: "补充手脚数量、自然接触、重心稳定、遮挡关系约束；批量复跑确认是否属于模型能力波动。",
  },
  {
    category: "clothing",
    label: "服装特征",
    pattern: /服装|衣服|裙|裤|领|袖|颜色|图案|材质|腰带|包|鞋|款式|版型/,
    promptAction: "把服装款式、颜色、材质、长度、图案拆成短句硬约束，并删除互相冲突的服装描述。",
  },
  {
    category: "scene_background",
    label: "场景/背景",
    pattern: /背景|场景|幻觉|道具|柱子|树|室内|室外|光影|地面|空间/,
    promptAction: "加强背景复刻边界，明确不新增物件，并压低无关装饰生成。",
  },
];

export function judgeCase(input = {}) {
  const text = evidenceText(input);
  const categoryRule = CATEGORY_RULES.find((rule) => rule.pattern.test(text)) || {
    category: "other",
    label: "其他",
    promptAction: "先补充人工备注和对比证据，再决定 prompt 或工程链路修复方向。",
  };

  if (!input.newContent) {
    return baseResult(input, categoryRule, {
      status: "needs_rerun",
      improved: "无法判断",
      rootCause: "工程链路问题",
      promptFixability: "low",
      confidence: 0.85,
      recommendation: "缺少复跑 content，先检查 Coze 复跑是否成功，并补齐输出后再裁判。",
      evidence: ["new_content 为空，无法进行原图与复跑图对比。"],
    });
  }

  const rootCause = inferRootCause(input, categoryRule, text);
  const promptFixability = inferPromptFixability(input, rootCause, text);
  const status = input.judgeMode?.includes("原始") ? "calibration" : "judged";
  const improved = status === "calibration" ? "原始case命中" : inferImprovement(input, rootCause, text);

  return baseResult(input, categoryRule, {
    status,
    improved,
    rootCause,
    promptFixability,
    confidence: confidenceFor(input, rootCause),
    recommendation: recommendationFor(input, categoryRule, rootCause, promptFixability),
    evidence: evidenceFor(input, categoryRule, rootCause),
  });
}

export function judgeBatch(items = []) {
  const results = items.map((item, index) => judgeCase({ ...item, caseId: item.caseId ?? `case-${index + 1}` }));
  const themeMap = new Map();
  for (const result of results) {
    const theme = themeMap.get(result.category) || {
      category: result.category,
      label: result.categoryLabel,
      count: 0,
      rootCauses: {},
      recommendations: new Set(),
      caseIds: [],
    };
    theme.count += 1;
    theme.caseIds.push(result.caseId);
    theme.rootCauses[result.rootCause] = (theme.rootCauses[result.rootCause] || 0) + 1;
    theme.recommendations.add(result.recommendation);
    themeMap.set(result.category, theme);
  }

  const themes = [...themeMap.values()]
    .map((theme) => ({
      ...theme,
      recommendations: [...theme.recommendations],
    }))
    .sort((a, b) => b.count - a.count);

  return {
    total: results.length,
    results,
    themes,
    nextActions: nextActions(themes),
  };
}

function baseResult(input, rule, fields) {
  return {
    caseId: input.caseId || "",
    status: fields.status,
    category: rule.category,
    categoryLabel: rule.label,
    improved: fields.improved,
    rootCause: fields.rootCause,
    promptFixability: fields.promptFixability,
    confidence: fields.confidence,
    recommendation: fields.recommendation,
    evidence: fields.evidence,
  };
}

function evidenceText(input) {
  return [
    input.problemType,
    input.attributionNote,
    input.originalPrompt,
    input.runPrompt,
    input.userVlm,
    input.outfitVlm,
  ].filter(Boolean).join("\n");
}

function inferRootCause(input, rule, text) {
  if (/VLM|描述错误|识别错|没识别/.test(text)) return "VLM 描述问题";
  if (/输入图|原图|遮挡|裁切|低清|糊/.test(text)) return "输入图问题";
  if (/模型原因|模型能力|多手|多指|畸形|融合/.test(text)) return "模型生成能力问题";
  if (rule.category === "clothing" || rule.category === "scene_background") return "prompt 问题";
  if (rule.category === "identity_hair_makeup" && promptMentionsConflict(input)) return "模型生成能力问题";
  return "prompt 问题";
}

function promptMentionsConflict(input) {
  const prompt = [input.originalPrompt, input.runPrompt].filter(Boolean).join("\n");
  const vlm = [input.userVlm, input.outfitVlm].filter(Boolean).join("\n");
  return /保留|禁止|打压|严格/.test(prompt) && /短发|长发|妆容|发型/.test(vlm);
}

function inferPromptFixability(input, rootCause, text) {
  if (rootCause === "工程链路问题" || rootCause === "输入图问题") return "low";
  if (rootCause === "模型生成能力问题") return /prompt|保留|禁止|打压|严格|约束/.test(text) ? "medium" : "low";
  return "high";
}

function inferImprovement(input, rootCause, text) {
  if (input.newContent === input.originalContent) return "未改善";
  if (/明显改善|已改善|修复/.test(text)) return "明显改善";
  if (rootCause === "模型生成能力问题") return "需人工确认";
  return "待人工确认";
}

function confidenceFor(input, rootCause) {
  let score = 0.45;
  if (input.problemType) score += 0.15;
  if (input.attributionNote) score += 0.15;
  if (input.originalPrompt || input.runPrompt) score += 0.1;
  if (input.userVlm || input.outfitVlm) score += 0.1;
  if (rootCause === "模型生成能力问题") score -= 0.05;
  return Math.max(0.1, Math.min(0.9, Number(score.toFixed(2))));
}

function recommendationFor(input, rule, rootCause, fixability) {
  if (rootCause === "工程链路问题") return "先修复复跑链路，确保每个 case 都有 new_content、prompt 和 raw_output。";
  if (rootCause === "VLM 描述问题") return "优先修 VLM 提示词，让 user/outfit 描述稳定区分身份、服装、背景和应打压元素。";
  if (rootCause === "输入图问题") return "先筛掉低清、严重遮挡、裁切异常输入图，再进入 prompt 优化。";
  if (rootCause === "模型生成能力问题" && fixability === "medium") return `${rule.promptAction} 同时做 3-4 次复跑看波动。`;
  if (rootCause === "模型生成能力问题") return "记录为模型能力风险，减少 prompt 反复微调，优先通过多次采样或模型链路升级解决。";
  return rule.promptAction;
}

function evidenceFor(input, rule, rootCause) {
  const evidence = [
    input.problemType ? `人工问题类型：${input.problemType}` : "",
    input.attributionNote ? `人工归因备注：${input.attributionNote}` : "",
    `分类命中：${rule.label}`,
    `根因判断：${rootCause}`,
  ].filter(Boolean);
  if (input.userVlm) evidence.push(`user_vlm 已提供，长度 ${input.userVlm.length}`);
  if (input.outfitVlm) evidence.push(`outfit_vlm 已提供，长度 ${input.outfitVlm.length}`);
  return evidence;
}

function nextActions(themes) {
  return themes.slice(0, 5).map((theme) => {
    const dominantCause = Object.entries(theme.rootCauses).sort((a, b) => b[1] - a[1])[0]?.[0] || "待确认";
    const firstRecommendation = theme.recommendations[0] || "";
    return `${theme.label}：${theme.count} 个 case，主要归因 ${dominantCause}。${firstRecommendation}`;
  });
}
