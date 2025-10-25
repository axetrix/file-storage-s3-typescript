import path from "path";
import { rm } from "fs/promises";

import { respondWithJSON } from "./json";

import { type ApiConfig } from "../config";
import { type BunRequest } from "bun";
import { randomBytes } from "crypto";

import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { getBearerToken, validateJWT } from "../auth";

import { getVideo, updateVideo } from "../db/videos";

import { uploadFileToS3, getFilePathForS3, getDistributionVideoUrl } from "./s3";
import {
  getExtensionFromVideoMimeType,
  processVideoForFastStart,
} from "../api/assets";

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const MAX_UPLOAD_SIZE = 1 << 30;

  const { videoId } = req.params as { videoId?: string };

  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading video file for", videoId, "by user", userID);

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }

  if (video.userID !== userID) {
    throw new UserForbiddenError("User is not the owner of the video");
  }

  const formData = await req.formData();
  const file = formData.get("video");

  if (!(file instanceof File)) {
    throw new BadRequestError("Invalid thumbnail");
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("Thumbnail exceeds maximum size of 1GB");
  }

  const mediaType = file.type;

  if (!mediaType.startsWith("video/")) {
    throw new BadRequestError("Invalid thumbnail type");
  }

  const fileExtension = getExtensionFromVideoMimeType(mediaType);

  if (!fileExtension || fileExtension !== "mp4") {
    throw new BadRequestError("Invalid thumbnail type");
  }

  const temVideoFileName = `${randomBytes(32).toString("base64url")}.${fileExtension}`;
  const temFileSavePath = path.join(cfg.tempAssetsRoot, temVideoFileName);

  const buffer = await file.arrayBuffer();
  await Bun.write(temFileSavePath, buffer);

  const processFilePath = await processVideoForFastStart(temFileSavePath);
  const s3FilePath = await getFilePathForS3(processFilePath);

  await uploadFileToS3(cfg, processFilePath, s3FilePath);

  video.videoURL = getDistributionVideoUrl(cfg, s3FilePath);

  updateVideo(cfg.db, video);

  await Promise.all([
    rm(temFileSavePath, { force: true }),
    rm(processFilePath, { force: true }),
  ]);

  return respondWithJSON(200, video);
}
