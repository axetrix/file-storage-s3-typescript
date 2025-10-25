import { existsSync, mkdirSync } from "fs";
import path from "path";

import type { ApiConfig } from "../config";

export function ensureAssetsDir(cfg: ApiConfig) {
  if (!existsSync(cfg.assetsRoot)) {
    mkdirSync(cfg.assetsRoot, { recursive: true });
  }
}

export function getExtensionFromImageMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };

  if (!map[mimeType]) {
    throw new Error(`Unsupported image mime type: ${mimeType}`);
  }

  return map[mimeType];
}

export function getExtensionFromVideoMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/ogg": "ogv",
    "video/x-msvideo": "avi",
    "video/quicktime": "mov",
    "video/x-matroska": "mkv",
  };

  if (!map[mimeType]) {
    throw new Error(`Unsupported video mime type: ${mimeType}`);
  }

  return map[mimeType];
}

export function getThumbnailUrl(cfg: ApiConfig, fileName: string): string {
  return `http://localhost:${cfg.port}/assets/${fileName}`;
}

export async function processVideoForFastStart(
  filePath: string,
): Promise<string> {
  const processedPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath, path.extname(filePath))}.processed.${path.extname(filePath)}`,
  );
  const proc = Bun.spawn([
    "ffmpeg",
    "-i",
    filePath,
    "-movflags",
    "faststart",
    "-map_metadata",
    "0",
    "-codec",
    "copy",
    "-f",
    "mp4",
    processedPath,
  ]);

  const result = await proc.exited;

  if (result !== 0) {
    throw new Error(`Failed to process video for fast start`);
  }

  return processedPath;
}

export async function getVideoAspectRatio(
  filePath: string,
): Promise<[number, number]> {
  const proc = Bun.spawn([
    "ffprobe",
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "json",
    filePath,
  ]);

  const result = await proc.exited;

  if (result !== 0) {
    throw new Error(`Failed to get video aspect ratio`);
  }

  const output = await new Response(proc.stdout).text();

  try {
    const json = JSON.parse(output);
    const stream = json.streams?.[0];

    if (!stream) {
      throw new Error(`No video stream found`);
    }

    const { width, height } = stream;

    const gcd = (a: number, b: number) => {
      if (b === 0) {
        return a;
      }

      return gcd(b, a % b);
    };

    const cd = gcd(width, height);

    if (cd > 0) {
      return [width / cd, height / cd];
    } else {
      return [width, height];
    }
  } catch (error) {
    console.error(`Failed to parse video metadata:`, error);
    throw new Error(`Failed to parse video metadata`);
  }
}

type AspectRatio = "landscape" | "portrait" | "square";

export function getTypeOfAspectRatio(ratio: [number, number]): AspectRatio {
  const [width, height] = ratio;

  if (width > height) {
    return "landscape";
  } else if (width < height) {
    return "portrait";
  } else {
    return "square";
  }
}
