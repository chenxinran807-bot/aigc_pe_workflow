import { mkdir } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const SHEET_SIZE = 1200;
const COLUMN_WIDTH = 600;
const CROP_HEIGHT = 400;

export function cropLayout(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new TypeError("source dimensions must be positive numbers");
  }
  const regions = [
    { start: 0, end: 0.42 },
    { start: 0.18, end: 0.78 },
    { start: 0.48, end: 1 },
  ];
  return regions.map(({ start, end }) => {
    const top = Math.min(height - 1, Math.max(0, Math.floor(height * start)));
    const bottom = Math.min(height, Math.max(top + 1, Math.ceil(height * end)));
    return { left: 0, top, width, height: bottom - top };
  });
}

export async function buildAuditContactSheet({ inputPath, outputPath }) {
  if (!inputPath || !outputPath) throw new TypeError("inputPath and outputPath are required");
  await mkdir(path.dirname(outputPath), { recursive: true });

  const oriented = await sharp(inputPath).rotate().toBuffer();
  const metadata = await sharp(oriented).metadata();
  const width = metadata.width;
  const height = metadata.height;
  const regions = cropLayout(width, height);

  const original = await sharp(oriented)
    .resize(COLUMN_WIDTH, SHEET_SIZE, {
      fit: "contain",
      background: { r: 245, g: 245, b: 245 },
    })
    .jpeg({ quality: 92 })
    .toBuffer();
  const crops = await Promise.all(regions.map((region) => sharp(oriented)
    .extract(region)
    .resize(COLUMN_WIDTH, CROP_HEIGHT, { fit: "cover", position: "centre" })
    .jpeg({ quality: 92 })
    .toBuffer()));

  await sharp({
    create: {
      width: SHEET_SIZE,
      height: SHEET_SIZE,
      channels: 3,
      background: { r: 245, g: 245, b: 245 },
    },
  })
    .composite([
      { input: original, left: 0, top: 0 },
      ...crops.map((input, index) => ({ input, left: COLUMN_WIDTH, top: index * CROP_HEIGHT })),
    ])
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(outputPath);

  return { outputPath, width: SHEET_SIZE, height: SHEET_SIZE, regions };
}
