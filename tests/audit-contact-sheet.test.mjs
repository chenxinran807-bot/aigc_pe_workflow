import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { buildAuditContactSheet, cropLayout } from "../src/audit-contact-sheet.mjs";

test("keeps deterministic crop regions inside portrait and landscape sources", () => {
  for (const [width, height] of [[800, 1200], [1400, 800]]) {
    const regions = cropLayout(width, height);
    assert.equal(regions.length, 3);
    for (const region of regions) {
      assert.ok(region.left >= 0);
      assert.ok(region.top >= 0);
      assert.ok(region.width > 0 && region.height > 0);
      assert.ok(region.left + region.width <= width);
      assert.ok(region.top + region.height <= height);
    }
  }
});

test("builds a 1200 square JPEG contact sheet", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "audit-contact-sheet-"));
  const inputPath = path.join(directory, "input.png");
  const outputPath = path.join(directory, "output.jpg");
  try {
    await sharp({
      create: { width: 800, height: 1200, channels: 3, background: "#9a6b52" },
    }).png().toFile(inputPath);
    await buildAuditContactSheet({ inputPath, outputPath });
    const metadata = await sharp(outputPath).metadata();
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 1200);
    assert.equal(metadata.format, "jpeg");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
