export const TARGET_DETAIL_CASE_IDS = [
  "67ee74b4fc46c51704334675",
  "6f589d384988d3af0592bfe4",
  "c1fab6bd35e92a74e952d821",
  "c7d090b5b7cec66a40756bbc",
];

const ORIGINAL_ROLES = ["user", "outfit", "generated"];
const DETAIL_ROLES = [
  "user_face_detail",
  "generated_face_detail",
  "outfit_clothing_detail",
  "generated_clothing_detail",
  "generated_hand_detail",
];

export function buildDetailManifest(cases, detailsByCase) {
  const byCase = new Map(cases.map((item) => [item.caseId, item]));
  return {
    inputVariant: "named-detail-v1",
    cases: TARGET_DETAIL_CASE_IDS.map((caseId) => {
      const item = byCase.get(caseId);
      if (!item) throw new Error(`missing target case: ${caseId}`);
      const files = pickRequired(item.files, ORIGINAL_ROLES, `original files for ${caseId}`);
      const detailFiles = pickRequired(detailsByCase[caseId], DETAIL_ROLES, `detail files for ${caseId}`);
      return { caseId, files, detailFiles };
    }),
  };
}

function pickRequired(source, fields, description) {
  if (!source) throw new Error(`missing ${description}`);
  return Object.fromEntries(fields.map((field) => {
    if (!source[field]) throw new Error(`missing ${description}: ${field}`);
    return [field, source[field]];
  }));
}
