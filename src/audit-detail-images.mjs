import { mkdir } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const DETAIL_SIZE = 800;

export function detailLayout(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new TypeError("source dimensions must be positive numbers");
  }
  return {
    face: boundedRegion(width, height, 0, 0, 1, 0.46),
    clothing: boundedRegion(width, height, 0, 0.18, 1, 0.78),
    handCandidate: boundedRegion(width, height, 0, 0.30, 1, 0.92),
  };
}

export async function buildAuditDetailImages({ userPath, outfitPath, generatedPath, outputDir }) {
  if (!userPath || !outfitPath || !generatedPath || !outputDir) {
    throw new TypeError("userPath, outfitPath, generatedPath, and outputDir are required");
  }
  await mkdir(outputDir, { recursive: true });
  return {
    user_face_detail: await writeDetail(userPath, "face", outputDir, "user_face_detail.jpg"),
    generated_face_detail: await writeDetail(generatedPath, "face", outputDir, "generated_face_detail.jpg"),
    outfit_clothing_detail: await writeDetail(outfitPath, "clothing", outputDir, "outfit_clothing_detail.jpg"),
    generated_clothing_detail: await writeDetail(generatedPath, "clothing", outputDir, "generated_clothing_detail.jpg"),
    generated_hand_detail: await writeDetail(generatedPath, "handCandidate", outputDir, "generated_hand_detail.jpg"),
  };
}

function boundedRegion(width, height, leftRatio, topRatio, rightRatio, bottomRatio) {
  const left = Math.min(width - 1, Math.max(0, Math.floor(width * leftRatio)));
  const top = Math.min(height - 1, Math.max(0, Math.floor(height * topRatio)));
  const right = Math.min(width, Math.max(left + 1, Math.ceil(width * rightRatio)));
  const bottom = Math.min(height, Math.max(top + 1, Math.ceil(height * bottomRatio)));
  return { left, top, width: right - left, height: bottom - top };
}

async function writeDetail(inputPath, regionName, outputDir, fileName) {
  const oriented = await sharp(inputPath).rotate().toBuffer();
  const metadata = await sharp(oriented).metadata();
  const region = detailLayout(metadata.width, metadata.height)[regionName];
  const outputPath = path.join(outputDir, fileName);
  await sharp(oriented)
    .extract(region)
    .resize(DETAIL_SIZE, DETAIL_SIZE, {
      fit: "contain",
      background: { r: 245, g: 245, b: 245 },
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(outputPath);
  return outputPath;
}
