export function extractRunResult(scrape) {
  const text = scrape?.text || "";
  const rawOutput = extractRawOutput(text);
  const content = extractQuotedField(rawOutput, "content") || lastImage(scrape?.images);
  const prompt = extractPrompt(rawOutput);
  const error = extractQuotedField(rawOutput, "error_msg");

  return {
    timestamp: scrape?.timestamp || new Date().toISOString(),
    content,
    prompt,
    userVlm: "",
    outfitVlm: "",
    vlmResult: extractVlmResult(rawOutput),
    error,
    rawOutput,
  };
}

function extractRawOutput(text) {
  const start = text.indexOf("运行结果");
  let raw = start >= 0 ? text.slice(start) : text;
  const endMarkers = ["\n试运行\n大模型", "\n大模型\n", "\n插件\n"];
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

function extractPrompt(text) {
  const quoted = extractQuotedField(text, "prompt");
  if (quoted) return quoted;
  const marker = "prompt :";
  const start = text.indexOf(marker);
  if (start < 0) return "";
  const after = text.slice(start + marker.length);
  const end = after.indexOf("\n预览");
  return (end >= 0 ? after.slice(0, end) : after).trim();
}

function extractVlmResult(text) {
  const marker = "vlm_result";
  const start = text.indexOf(marker);
  if (start < 0) return "";
  return text.slice(start).trim();
}

function lastImage(images = []) {
  return images.length ? images[images.length - 1] : "";
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
