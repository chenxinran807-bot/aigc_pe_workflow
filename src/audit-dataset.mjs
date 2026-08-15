import { createHash } from "node:crypto";

export const DIMENSIONS = [
  { key: "face", scoreHeader: "面部特征与妆造发型还原" },
  { key: "pose", scoreHeader: "姿势微调与肢体自然度" },
  { key: "clothing", scoreHeader: "服装特征保留度" },
  { key: "scene", scoreHeader: "场景氛围与背景幻觉" },
];

const IMAGE_ALIASES = {
  userImage: ["user_image"],
  outfitImage: ["outfit_image"],
  generatedImage: ["tryon_gen_image", "tryon_gen_image (content)", "res_url", "ai_gen_content", "content"],
};

const ISSUE_ALIASES = new Map([
  ["logo变形", "图案/logo变形模糊"],
  ["logo模糊", "图案/logo变形模糊"],
  ["图案模糊", "图案/logo变形模糊"],
  ["图案变形", "图案/logo变形模糊"],
  ["衣服材质发生改变", "材质/光影变化"],
  ["衣服光影发生改变", "材质/光影变化"],
  ["衣服材质/光影发生改变", "材质/光影变化"],
  ["材质发生改变", "材质/光影变化"],
  ["光影发生改变", "材质/光影变化"],
]);

export function normalizeWorkbookPayload(payload, source) {
  const sheets = payload?.data?.sheets || payload?.sheets || [];
  const cases = [];
  const skippedSheets = [];
  for (const sheet of sheets) {
    const result = normalizeAuditSheet(sheet, source);
    if (!result.eligible) {
      skippedSheets.push({ name: sheet.name || "", reason: result.reason });
      continue;
    }
    cases.push(...result.cases);
  }
  return { cases: dedupeCases(cases), skippedSheets };
}

export function normalizeAuditSheet(sheet, source = {}) {
  const columns = sheet.columns || [];
  const data = sheet.data || [];
  const imageIndices = Object.fromEntries(
    Object.entries(IMAGE_ALIASES).map(([key, aliases]) => [key, findHeader(columns, aliases)]),
  );
  const dimensionIndices = {};
  for (const dimension of DIMENSIONS) {
    const score = findHeader(columns, [dimension.scoreHeader]);
    if (score < 0) {
      return { eligible: false, reason: `missing dimension ${dimension.scoreHeader}`, cases: [] };
    }
    dimensionIndices[dimension.key] = {
      score,
      issues: findNextIssueHeader(columns, score),
    };
  }
  if (Object.values(imageIndices).some((index) => index < 0)) {
    return { eligible: false, reason: "missing one or more image columns", cases: [] };
  }

  const cases = data.map((row, rowIndex) => {
    const images = {
      user: cleanText(row[imageIndices.userImage]),
      outfit: cleanText(row[imageIndices.outfitImage]),
      generated: cleanText(row[imageIndices.generatedImage]),
    };
    if (!images.user || !images.outfit || !images.generated) return null;
    const dimensions = {};
    for (const dimension of DIMENSIONS) {
      const indices = dimensionIndices[dimension.key];
      dimensions[dimension.key] = {
        score: normalizeScore(row[indices.score]),
        issues: splitIssues(row[indices.issues]),
      };
    }
    const groupId = stableHash(`${images.user}\n${images.outfit}`);
    const caseId = stableHash(`${groupId}\n${images.generated}`);
    return {
      caseId,
      groupId,
      images,
      dimensions,
      source: {
        sourceId: source.sourceId || "",
        url: source.url || "",
        sheet: sheet.name || "",
        sheetRange: sheet.range || "",
        dataRow: rowIndex + 2,
      },
    };
  }).filter(Boolean);
  return { eligible: true, cases };
}

export function splitIssues(value) {
  const text = cleanText(value);
  if (!text) return [];
  return [...new Set(text
    .split(/[,，;；、\n]+/)
    .map(normalizeIssueLabel)
    .filter(Boolean))];
}

export function normalizeIssueLabel(value) {
  const normalized = cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[：:。.!！]+$/g, "");
  if (!normalized) return "";
  return ISSUE_ALIASES.get(normalized) || normalized;
}

export function dedupeCases(cases) {
  const byId = new Map();
  for (const item of cases) {
    const existing = byId.get(item.caseId);
    if (!existing) {
      byId.set(item.caseId, { ...item, sources: [item.source] });
      continue;
    }
    existing.sources.push(item.source);
    for (const dimension of DIMENSIONS) {
      const key = dimension.key;
      existing.dimensions[key].issues = [...new Set([
        ...existing.dimensions[key].issues,
        ...item.dimensions[key].issues,
      ])];
      if (existing.dimensions[key].score === null) {
        existing.dimensions[key].score = item.dimensions[key].score;
      }
    }
  }
  return [...byId.values()];
}

function findHeader(columns, aliases) {
  const normalizedAliases = aliases.map(normalizeHeader);
  return columns.findIndex((column) => normalizedAliases.includes(normalizeHeader(column)));
}

function findNextIssueHeader(columns, scoreIndex) {
  for (let index = scoreIndex + 1; index < columns.length; index += 1) {
    if (DIMENSIONS.some((dimension) => normalizeHeader(columns[index]) === normalizeHeader(dimension.scoreHeader))) break;
    if (normalizeHeader(columns[index]).startsWith("问题类型")) return index;
  }
  return -1;
}

function normalizeHeader(value) {
  return cleanText(value).toLowerCase().replace(/[\s_\-()（）]/g, "");
}

function normalizeScore(value) {
  if (value === "" || value === undefined || value === null) return null;
  const score = Number(value);
  return [0, 1, 2].includes(score) ? score : null;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}
