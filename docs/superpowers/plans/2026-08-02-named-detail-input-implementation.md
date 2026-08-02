# Named Detail Input Experiment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Test three original images plus five independently named detail images on four fixed training cases without exposing human labels or touching frozen validation/test data.

**Architecture:** Extend the existing deterministic Sharp preprocessing with role-specific crops, then make the audit request builder accept an explicit image-role map rather than hard-coding three fields. Temporarily add the five matching Image inputs to the single Coze test copy, run two hand cases followed by hair and Logo cases, evaluate against the same local labels, and restore the three-input workflow after recording the decision.

**Tech Stack:** Node.js ESM, Sharp 0.35.3, Node test runner, existing CDP Coze runner, controlled browser for Coze canvas configuration.

---

### Task 1: Role-specific detail image builder

**Files:**
- Create: `src/audit-detail-images.mjs`
- Create: `tests/audit-detail-images.test.mjs`

- [ ] **Step 1: Write the failing crop-layout tests**

Create tests that use synthetic 800×1200 and 1200×800 images and assert stable role names, valid source bounds, and an 800×800 JPEG for every output:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { detailLayout } from "../src/audit-detail-images.mjs";

test("defines bounded deterministic detail regions", () => {
  const layout = detailLayout(800, 1200);
  assert.deepEqual(Object.keys(layout), ["face", "clothing", "handCandidate"]);
  for (const region of Object.values(layout)) {
    assert.ok(region.left >= 0 && region.top >= 0);
    assert.ok(region.left + region.width <= 800);
    assert.ok(region.top + region.height <= 1200);
  }
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tests/audit-detail-images.test.mjs`

Expected: FAIL because `src/audit-detail-images.mjs` does not exist.

- [ ] **Step 3: Implement deterministic regions and image generation**

Export these interfaces:

```js
export function detailLayout(width, height) {
  return {
    face: boundedRegion(width, height, 0, 0, 1, 0.46),
    clothing: boundedRegion(width, height, 0, 0.18, 1, 0.78),
    handCandidate: boundedRegion(width, height, 0, 0.30, 1, 0.92),
  };
}

export async function buildAuditDetailImages({ userPath, outfitPath, generatedPath, outputDir }) {
  return {
    user_face_detail: await writeDetail(userPath, "face", outputDir, "user_face_detail.jpg"),
    generated_face_detail: await writeDetail(generatedPath, "face", outputDir, "generated_face_detail.jpg"),
    outfit_clothing_detail: await writeDetail(outfitPath, "clothing", outputDir, "outfit_clothing_detail.jpg"),
    generated_clothing_detail: await writeDetail(generatedPath, "clothing", outputDir, "generated_clothing_detail.jpg"),
    generated_hand_detail: await writeDetail(generatedPath, "handCandidate", outputDir, "generated_hand_detail.jpg"),
  };
}
```

`writeDetail` must rotate according to EXIF, extract the bounded source region, resize with `fit: "contain"` to 800×800 on a neutral background, and save JPEG quality 92. It must not perform semantic hand detection.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/audit-detail-images.test.mjs`

Expected: all detail image tests PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/audit-detail-images.mjs tests/audit-detail-images.test.mjs
git commit -m "Add named audit detail image builder"
```

### Task 2: Generic named-image request mapping

**Files:**
- Modify: `src/audit-workflow-runner.mjs`
- Modify: `tests/audit-workflow-runner.test.mjs`

- [ ] **Step 1: Write a failing eight-role request test**

Add a test that passes the five detail paths through `options.detailFiles` and verifies the request contains exactly three original URL fields plus five local file fields, while human labels and scores are absent:

```js
const request = buildAuditWorkflowRequest(item, {
  detailFiles: {
    user_face_detail: "/tmp/user-face.jpg",
    generated_face_detail: "/tmp/generated-face.jpg",
    outfit_clothing_detail: "/tmp/outfit-clothing.jpg",
    generated_clothing_detail: "/tmp/generated-clothing.jpg",
    generated_hand_detail: "/tmp/generated-hand.jpg",
  },
});
assert.deepEqual(Object.keys(request.files).sort(), [
  "generated_clothing_detail", "generated_face_detail", "generated_hand_detail",
  "outfit_clothing_detail", "user_face_detail",
]);
assert.equal(JSON.stringify(request).includes("human"), false);
```

- [ ] **Step 2: Run the focused request tests and verify failure**

Run: `node --test tests/audit-workflow-runner.test.mjs tests/coze-local-file-input.test.mjs`

Expected: FAIL because `detailFiles` is not mapped.

- [ ] **Step 3: Extend the request builder without changing baseline behavior**

Add one constant and merge validated detail fields into the existing file map:

```js
const DETAIL_FIELDS = [
  "user_face_detail",
  "generated_face_detail",
  "outfit_clothing_detail",
  "generated_clothing_detail",
  "generated_hand_detail",
];

const detailFiles = Object.fromEntries(DETAIL_FIELDS
  .filter((field) => options.detailFiles?.[field])
  .map((field) => [field, options.detailFiles[field]]));
const files = { ...originalFileOverrides, ...detailFiles };
```

Keep the existing three-role URL request unchanged when `detailFiles` is absent. Set `inputVariant` only in the prediction record, not in model inputs.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/audit-workflow-runner.test.mjs tests/coze-local-file-input.test.mjs && npm test`

Expected: focused tests and the full suite PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/audit-workflow-runner.mjs tests/audit-workflow-runner.test.mjs
git commit -m "Support named detail images in audit requests"
```

### Task 3: Training-only manifest and experiment runner

**Files:**
- Create: `src/audit-detail-manifest.mjs`
- Create: `scripts/build-audit-detail-images.mjs`
- Create: `scripts/run-audit-detail-experiment.mjs`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Write a failing pure manifest test**

Create `tests/audit-detail-manifest.test.mjs`, import `buildDetailManifest` from `src/audit-detail-manifest.mjs`, and assert that manifest entries contain only the fixed Case ID, original local file roles, five detail file roles, and `inputVariant: "named-detail-v1"`. Assert that serialized output does not contain `human`, `label`, `score`, `http://`, or `https://`.

- [ ] **Step 2: Run the manifest test and verify failure**

Run: `node --test tests/audit-detail-manifest.test.mjs`

Expected: FAIL because the manifest builder is absent.

- [ ] **Step 3: Implement the build script and manifest helper**

The build script must read only `work/model-comparison-set.json` and the existing ignored original files under `work/crop-experiment`. Implement `buildDetailManifest` in the source module with this output shape:

```js
{
  inputVariant: "named-detail-v1",
  cases: selectedCases.map(({ caseId, originalFiles, detailFiles }) => ({
    caseId,
    files: originalFiles,
    detailFiles,
  })),
}
```

Write generated files under `work/named-detail-experiment/<caseId>/` and the manifest to `work/named-detail-experiment/manifest.json`. Do not log URLs.

- [ ] **Step 4: Implement the four-case runner**

Hard-code the approved order so accidental execution cannot touch validation/test data:

```js
const TARGET_CASE_IDS = [
  "67ee74b4fc46c51704334675",
  "6f589d384988d3af0592bfe4",
  "c1fab6bd35e92a74e952d821",
  "c7d090b5b7cec66a40756bbc",
];
```

For every case call `runAuditCase(item, { files: item.files, detailFiles: item.detailFiles, inputVariant: "named-detail-v1", modelId: "doubao-1.6-vision-250815", promptVersion: "baseline-plus-role-contract-v1" })`. Save after every run. Stop after the first two if either run fails, reports missing images, or contains evidence placeholders matching `/\[[^\]]+\]|可能|或许|或者/`.

- [ ] **Step 5: Add package scripts and ignore runtime artifacts**

```json
"audit:build-details": "node scripts/build-audit-detail-images.mjs",
"audit:run-details": "node scripts/run-audit-detail-experiment.mjs"
```

Add `work/named-detail-experiment/` to `.gitignore`.

- [ ] **Step 6: Run tests and build the four-case manifest**

Run: `npm test && npm run audit:build-details`

Expected: full suite PASS; manifest contains exactly four target Case IDs and 20 detail JPG files; no internal URL is printed.

- [ ] **Step 7: Commit Task 3**

```bash
git add .gitignore package.json src/audit-detail-manifest.mjs scripts/build-audit-detail-images.mjs scripts/run-audit-detail-experiment.mjs tests/audit-detail-manifest.test.mjs
git commit -m "Add named detail input experiment runner"
```

### Task 4: Configure the Coze test copy and run the smoke experiment

**Files:**
- Create: `docs/named-detail-input-experiment-2026-08-02.md`
- Modify: `AUDIT_EVALUATION.md`
- Modify: `HANDOFF.md`

- [ ] **Step 1: Capture the baseline workflow state**

Open only workflow `7668610423507419182`. Record in the ignored experiment directory that the canvas is `Start → 大模型 → End`, the model is豆包 1.6 视觉理解-250815, the three Start variables are `user_image`, `outfit_image`, `generated_image`, and the workflow is unpublished. Do not record cookies, URLs containing internal image data, or tokens.

- [ ] **Step 2: Add and bind five Image inputs**

Add exactly the five approved field names from the spec as Image variables on Start. Bind all eight image variables to the existing model node. Append only the role contract from the spec to the baseline Prompt; do not add labels, Case IDs, target issue names, or examples from the four cases. Confirm autosave and keep the workflow unpublished.

- [ ] **Step 3: Upload one dry-run Case and verify bindings**

Upload all eight local files for the first hand Case. Before running, verify each visible field shows the expected basename. Run once and stop if any image is missing or the output treats a detail crop as a different person/outfit.

- [ ] **Step 4: Run the two hand cases**

Run: `npm run audit:run-details -- work/named-detail-experiment/manifest.json work/named-detail-experiment/predictions.json 2`

Expected: two parseable results, both hand labels recalled, no input failure, and no forbidden placeholder evidence. Otherwise stop and restore baseline.

- [ ] **Step 5: Run hair and Logo cases only if Step 4 passes**

Run: `npm run audit:run-details -- work/named-detail-experiment/manifest.json work/named-detail-experiment/predictions.json 4`

Expected: exactly four target results; no validation/test Case IDs.

- [ ] **Step 6: Compare against both baselines**

Record, for each Case, target-label hit, extra-finding count, evidence-source correctness, placeholder/hedging violations, and input success. Summarize against original (`2/4`, 12 extras) and contact sheet (`4/4`, 17 extras). Promote only if all four design gates pass.

- [ ] **Step 7: Restore the three-input Coze baseline**

Remove the five temporary Start variables and their model bindings, remove the role-contract Prompt appendix, and confirm the original three variables,豆包 1.6 model, baseline Prompt, autosave, and unpublished state. This restoration is required whether the experiment passes or fails.

- [ ] **Step 8: Record decision and verify repository**

Write `docs/named-detail-input-experiment-2026-08-02.md`, update `AUDIT_EVALUATION.md` and both project handoff records, then run:

```bash
npm test
npm audit --audit-level=high
git diff --check
```

Expected: all tests PASS, 0 high vulnerabilities, clean diff check.

- [ ] **Step 9: Commit Task 4**

```bash
git add docs/named-detail-input-experiment-2026-08-02.md AUDIT_EVALUATION.md HANDOFF.md
git commit -m "Record named detail input experiment"
```
