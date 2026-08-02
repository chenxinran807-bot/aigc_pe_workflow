import assert from "node:assert/strict";
import test from "node:test";

import { buildDetailManifest, TARGET_DETAIL_CASE_IDS } from "../src/audit-detail-manifest.mjs";

test("builds a four-case blind local-only detail manifest", () => {
  const cases = TARGET_DETAIL_CASE_IDS.map((caseId) => ({
    caseId,
    files: { user: `/tmp/${caseId}-u.jpg`, outfit: `/tmp/${caseId}-o.jpg`, generated: `/tmp/${caseId}-g.jpg` },
    dimensions: { pose: { issues: ["human-secret"] } },
    images: { user: "https://internal.example/user.jpg" },
  }));
  const detailsByCase = Object.fromEntries(TARGET_DETAIL_CASE_IDS.map((caseId) => [caseId, {
    user_face_detail: `/tmp/${caseId}-uf.jpg`,
    generated_face_detail: `/tmp/${caseId}-gf.jpg`,
    outfit_clothing_detail: `/tmp/${caseId}-oc.jpg`,
    generated_clothing_detail: `/tmp/${caseId}-gc.jpg`,
    generated_hand_detail: `/tmp/${caseId}-gh.jpg`,
  }]));
  const manifest = buildDetailManifest(cases, detailsByCase);
  assert.equal(manifest.inputVariant, "named-detail-v1");
  assert.deepEqual(manifest.cases.map((item) => item.caseId), TARGET_DETAIL_CASE_IDS);
  assert.deepEqual(Object.keys(manifest.cases[0]), ["caseId", "files", "detailFiles"]);
  assert.equal(Object.keys(manifest.cases[0].detailFiles).length, 5);
  assert.doesNotMatch(JSON.stringify(manifest), /human-secret|https?:\/\/|dimensions|score|label/);
});

test("rejects a missing target case or detail role", () => {
  assert.throws(() => buildDetailManifest([], {}), /missing target case/);
  const cases = TARGET_DETAIL_CASE_IDS.map((caseId) => ({
    caseId,
    files: { user: "/tmp/u", outfit: "/tmp/o", generated: "/tmp/g" },
  }));
  assert.throws(() => buildDetailManifest(cases, {}), /missing detail files/);
});
