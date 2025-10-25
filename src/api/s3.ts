import { randomBytes } from "crypto";
import { s3 } from "bun";

import type { ApiConfig } from "../config";
import {
  getExtensionFromVideoMimeType,
  getVideoAspectRatio,
  getTypeOfAspectRatio,
} from "./assets";
import type { Video } from "../db/videos";

export async function getFilePathForS3(
  localFilePath: string,
) {
  const file = Bun.file(localFilePath);

  if (file.size === 0) {
    throw new Error("File is empty");
  }

  const fileExtension = getExtensionFromVideoMimeType(file.type);
  const aspectRatio = await getVideoAspectRatio(localFilePath);
  const typeOfRatio = getTypeOfAspectRatio(aspectRatio);

  const videoFileName = `${typeOfRatio}/${randomBytes(32).toString("base64url")}.${fileExtension}`;

  return videoFileName;
}

export async function uploadFileToS3(
  cfg: ApiConfig,
  localFilePath: string,
  s3FilePath: string,
): Promise<string> {
  const file = Bun.file(localFilePath);

  if (file.size === 0) {
    throw new Error("File is empty");
  }

  await cfg.s3Client.write(s3FilePath, file, {
    type: file.type,
  });

  return getS3VideoUrl(cfg, s3FilePath);
}

export function getS3VideoUrl(cfg: ApiConfig, fileName: string): string {
  return `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${fileName}`;
}

export function getDistributionVideoUrl(cfg: ApiConfig, s3FilePath: string): string {
  return `https://${cfg.s3CfDistribution}/${s3FilePath}`;
}

export function generatePresignedURL(cfg: ApiConfig, key: string, expireTime: number) {
  const s3file = cfg.s3Client.file(key, {
    bucket: cfg.s3Bucket
  });

  const url = s3file.presign({
    expiresIn: expireTime,
    acl: 'public-read',
    method: 'GET'
  });

  return url;
}

export function dbVideoToSignedVideo(cfg: ApiConfig, video: Video, expireTime: number): Video {
  if (video.videoURL) {
      video.videoURL = generatePresignedURL(cfg, video.videoURL, expireTime);
  }

  return video;
}
