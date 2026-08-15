# Local Crop Input Experiment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine whether deterministic local crops improve Doubao 1.6 visual issue recall on the fixed 10-case training comparison set without increasing false findings.

**Architecture:** Download each case's three signed image URLs locally, build one role-preserving contact sheet per image, and upload those three local files through the existing Coze test-run form. Keep the workflow, model, baseline Prompt, output JSON, evaluator, validation set, and test set unchanged so the only experimental variable is the visual input.

**Tech Stack:** Node.js ESM, Sharp, Chrome DevTools Protocol, existing Coze runner and audit evaluator.

---

### Task 1: Deterministic contact-sheet builder

**Files:**
- Create: `src/audit-contact-sheet.mjs`
- Create: `tests/audit-contact-sheet.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] **Step 1: Write the failing tests**

Test that the crop layout is deterministic, stays within source bounds for portrait and landscape images, and writes a 1200×1200 JPEG containing the original plus top, middle, and lower crops.

- [x] **Step 2: Run the focused test and confirm it fails**

Run: `node --test tests/audit-contact-sheet.test.mjs`

Expected: FAIL because `src/audit-contact-sheet.mjs` does not exist.

- [x] **Step 3: Implement the minimal builder**

Export `buildAuditContactSheet({ inputPath, outputPath })` and `cropLayout(width, height)`. Use a 600×1200 contained original on the left and three 600×400 cover-resized crops on the right: top 0–42%, middle 18–78%, and lower 48–100% of source height.

- [x] **Step 4: Run the focused test**

Run: `node --test tests/audit-contact-sheet.test.mjs`

Expected: PASS.

### Task 2: Local-file Coze input support

**Files:**
- Modify: `src/coze-string-workflow.mjs`
- Modify: `src/audit-workflow-runner.mjs`
- Modify: `tests/audit-workflow-runner.test.mjs`
- Create: `tests/coze-local-file-input.test.mjs`

- [x] **Step 1: Write the failing tests**

Test that `runAuditCase` passes local file overrides separately from URL inputs, preserves all three image roles, and records the input variant. Test the pure file-input request builder without launching Chrome.

- [x] **Step 2: Run focused tests and confirm failure**

Run: `node --test tests/audit-workflow-runner.test.mjs tests/coze-local-file-input.test.mjs`

Expected: FAIL because local-file overrides are unsupported.

- [x] **Step 3: Implement file upload through CDP**

Add an optional `files` map to `runStringWorkflow`. For each configured image field, switch the visible Coze selector from URL mode to upload mode, resolve its file input to a CDP backend node, call `DOM.setFileInputFiles`, and verify the field shows an uploaded asset before running. URL behavior must remain unchanged.

- [x] **Step 4: Run focused and full tests**

Run: `npm test`

Expected: all tests pass.

### Task 3: Training-only crop experiment

**Files:**
- Create: `scripts/build-audit-contact-sheets.mjs`
- Create: `scripts/run-audit-crop-experiment.mjs`
- Modify: `package.json`
- Modify: `AUDIT_EVALUATION.md`
- Modify: `HANDOFF.md`

- [x] **Step 1: Build contact sheets for the fixed comparison set**

Read only `work/model-comparison-set.json`, download the three images per case without logging URLs, write ignored files under `work/crop-experiment/<caseId>/`, and emit an ignored manifest containing case IDs and local paths.

- [x] **Step 2: Smoke-test two training cases**

Run the two known hand/joint badcases first. Stop if Coze cannot consume all three uploads or returns missing-image output.

- [x] **Step 3: Run targeted hair and Logo cases, then stop on the predefined quality criterion**

Use the current baseline Prompt and Doubao 1.6 Vision. Save predictions under ignored `work/` files with `inputVariant: contact-sheet-v1`.

- [x] **Step 4: Evaluate the four targeted cases against the same human labels**

Compare label recall, per-label matches, extra findings, input failures, and high-confidence misses against `fair-doubao-1.6-vision-predictions.json`. Do not inspect or run validation/test partitions.

- [x] **Step 5: Record the decision**

Only recommend an internal HTTP crop service if the contact-sheet variant improves training recall without restoring the prior high false-finding rate. Otherwise keep the existing three-image input path and record that crop input did not earn further infrastructure work.
