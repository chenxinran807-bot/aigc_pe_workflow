import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { buildAuditDetailImages, detailLayout } from "../src/audit-detail-images.mjs";

test("defines bounded deterministic detail regions", () => {
  for (const [width, height] of [[800, 1200], [1200, 800]]) {
    const layout = detailLayout(width, height);
    assert.deepEqual(Object.keys(layout), ["face", "clothing", "handCandidate"]);
    for (const region of Object.values(layout)) {
      assert.ok(region.left >= 0 && region.top >= 0);
      assert.ok(region.width > 0 && region.height > 0);
      assert.ok(region.left + region.width <= width);
      assert.ok(region.top + region.height <= height);
    }
  }
});

test("writes five stable named 800 square detail images", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "audit-details-"));
  const originals = {};
  for (const role of ["user", "outfit", "generated"]) {
    const filePath = path.join(tempDir, `${role}.jpg`);
    await sharp({
      create: { width: 800, height: 1200, channels: 3, background: "#808080" },
    }).jpeg().toFile(filePath);
    originals[role] = filePath;
  }

  const files = await buildAuditDetailImages({
    userPath: originals.user,
    outfitPath: originals.outfit,
    generatedPath: originals.generated,
    outputDir: path.join(tempDir, "details"),
  });
  assert.deepEqual(Object.keys(files), [
    "user_face_detail",
    "generated_face_detail",
    "outfit_clothing_detail",
    "generated_clothing_detail",
    "generated_hand_detail",
  ]);
  for (const filePath of Object.values(files)) {
    assert.ok((await stat(filePath)).size > 0);
    const metadata = await sharp(filePath).metadata();
    assert.equal(metadata.width, 800);
    assert.equal(metadata.height, 800);
    assert.equal(metadata.format, "jpeg");
  }
});
