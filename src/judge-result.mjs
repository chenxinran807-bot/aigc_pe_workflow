export function extractJudgeResult(scrape) {
  const text = scrape?.text || "";
  const rawOutput = extractRawOutput(text);
  const raw = extractQuotedField(rawOutput, "judge_json")
    || extractQuotedField(rawOutput, "judge_result")
    || extractQuotedField(rawOutput, "result")
    || extractFirstJson(rawOutput)
    || rawOutput;
  return {
    timestamp: scrape?.timestamp || new Date().toISOString(),
    raw,
    parsed: parseMaybeJson(raw),
    rawOutput,
  };
}

function extractRawOutput(text) {
  const start = text.indexOf("运行结果");
  let raw = start >= 0 ? text.slice(start) : text;
  const endMarkers = ["\n预览", "\n试运行\n大模型", "\n大模型\n", "\n插件\n"];
  const end = endMarkers
    .map((marker) => raw.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (end !== undefined) raw = raw.slice(0, end);
  return raw.trim();
}

function extractQuotedField(text, field) {
  const pattern = new RegExp(`${escapeRegExp(field)}\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "s");
  const match = text.match(pattern);
  return match ? decodeJsonString(match[1]) : "";
}

function extractFirstJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1).trim() : "";
}

function parseMaybeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function decodeJsonString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value.replaceAll("\\n", "\n").replaceAll('\\"', '"');
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
