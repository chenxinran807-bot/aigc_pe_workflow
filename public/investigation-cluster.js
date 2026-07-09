export function investigationClusterParts(note) {
  if (!note || typeof note !== "object") return null;
  const location = text(note.pmIssueLocation) || "未定位";
  const resolutionType = text(note.pmResolutionType) || "未记录处理方式";
  const source = text(note.pmSpecificIssue || note.pmSourceField || note.optimizationDirection || note.manualNote);
  const phrase = text(note.techReasonCategory) || normalizeInvestigationPhrase(source || `${location}/${resolutionType}`);
  const sampleNote = source || phrase;
  if (!phrase || (location === "未定位" && resolutionType === "未记录处理方式" && !source)) return null;
  return { location, resolutionType, phrase, sampleNote };
}

export function normalizeInvestigationPhrase(value) {
  const textValue = text(value)
    .replace(/[，,。；;、/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return textValue || "未填写具体问题";
}

function text(value) {
  return String(value || "").trim();
}
