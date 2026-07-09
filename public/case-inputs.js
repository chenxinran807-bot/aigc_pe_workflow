export function applyImageUrlOverrides(rows, indexes, overrides = {}) {
  const userImage = String(overrides.user_image || "").trim();
  const outfitImage = String(overrides.outfit_image || "").trim();
  const changed = [];

  for (const index of indexes || []) {
    const row = rows[index];
    if (!row) continue;
    if (userImage) row.user_image = userImage;
    if (outfitImage) row.outfit_image = outfitImage;
    if (userImage || outfitImage) changed.push(index);
  }

  return changed;
}

export function buildAdHocRunCase({ user_image, outfit_image, promptsUsed = {} } = {}) {
  const userImage = String(user_image || "").trim();
  const outfitImage = String(outfit_image || "").trim();

  if (!userImage || !outfitImage) {
    throw new Error("请填写新的 user_image 和 outfit_image URL");
  }

  return {
    clientIndex: 0,
    user_image: userImage,
    outfit_image: outfitImage,
    promptsUsed,
    log: {
      caseId: "临时图片复跑",
      rowIndex: 0,
      user_image: userImage,
      outfit_image: outfitImage,
      promptsUsed,
      notes: {},
    },
  };
}

export function buildAdHocRunGroup({ user_image, outfit_image, count = 1, status = "done", results = [], error = "" } = {}) {
  const runCount = Math.max(1, Math.min(20, Math.floor(Number(count) || 1)));
  const fallbackResults = Array.from({ length: runCount }, (_, index) => ({
    runIndex: index + 1,
    timestamp: new Date().toISOString(),
    content: "",
    prompt: "",
    rawOutput: "",
    error: status === "failed" ? String(error || "临时复跑失败") : "",
    pending: status === "running",
  }));

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_image: String(user_image || "").trim(),
    outfit_image: String(outfit_image || "").trim(),
    createdAt: new Date().toISOString(),
    status,
    error: String(error || ""),
    results: results.length ? results : fallbackResults,
  };
}

export function shouldReplaceAdHocImageValue({ currentValue, previousAutoValue, force = false } = {}) {
  const current = String(currentValue || "").trim();
  const previous = String(previousAutoValue || "").trim();
  return Boolean(force || !current || (previous && current === previous));
}
