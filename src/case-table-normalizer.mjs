const ALIASES = {
  user_image: ["user_image", "user_image_url", "user image url", "用户图", "用户图url", "用户图片", "user"],
  outfit_image: ["outfit_image", "outfit_image_url", "outfit image url", "搭配图", "穿搭图", "商品图", "outfit"],
  ai_content: ["ai_content", "ai_content_url", "ai content url", "res_url", "res url", "生成图", "原始生成图", "content"],
  output_json: ["输出列json", "输出列JSON", "输出", "output", "result", "ai输出"],
};

export function normalizeCaseTable(table) {
  const sourceHeaders = table.headers || [];
  const rows = (table.rows || []).map((row) => normalizeCaseRow(row, sourceHeaders));
  const headers = ["user_image", "outfit_image", "ai_content", "输出", "prompt", "user_vlm", "outfit_vlm"];
  for (const header of sourceHeaders) {
    if (!headers.includes(header)) headers.push(header);
  }
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!headers.includes(key)) headers.push(key);
    }
  }
  return { headers, rows };
}

function normalizeCaseRow(row, headers) {
  const outputText = firstValue(row, headers, ALIASES.output_json);
  const outputJson = parseJsonObject(outputText);
  const userVlm = outputJson?.user_vlm || outputJson?.vlm_result?.user_vlm || "";
  const outfitVlm = outputJson?.outfit_vlm || outputJson?.vlm_result?.outfit_vlm || "";
  return {
    ...row,
    user_image: firstValue(row, headers, ALIASES.user_image),
    outfit_image: firstValue(row, headers, ALIASES.outfit_image),
    ai_content: firstValue(row, headers, ALIASES.ai_content) || outputJson?.content || "",
    输出: outputText || row["输出"] || "",
    prompt: row.prompt || outputJson?.prompt || "",
    user_vlm: stringifyEvidence(row.user_vlm || userVlm),
    outfit_vlm: stringifyEvidence(row.outfit_vlm || outfitVlm),
  };
}

function firstValue(row, headers, aliases) {
  for (const header of headers) {
    if (!aliases.some((alias) => sameHeader(alias, header))) continue;
    const value = row[header];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function sameHeader(left, right) {
  return normalizeHeader(left) === normalizeHeader(right);
}

function normalizeHeader(value) {
  return String(value || "").replace(/[\s_\-()（）:：]/g, "").toLowerCase();
}

function parseJsonObject(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  const start = value.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(value.slice(start));
  } catch {
    return null;
  }
}

function stringifyEvidence(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}
