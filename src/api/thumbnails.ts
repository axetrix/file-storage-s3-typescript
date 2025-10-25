import path from 'path';

import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { getExtensionFromImageMimeType, getThumbnailUrl } from "../api/assets";
import { randomBytes } from 'crypto';

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }

  if (video.userID !== userID) {
    throw new UserForbiddenError("User is not the owner of the video");
  }

  const formData = await req.formData();
  const file = formData.get("thumbnail");

  if (!(file instanceof File)) {
    throw new BadRequestError("Invalid thumbnail");
  }

  const MAX_UPLOAD_SIZE = 10 << 20;

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("Thumbnail exceeds maximum size of 10MB");
  }

  const mediaType = file.type;

  if (!mediaType.startsWith("image/")) {
    throw new BadRequestError("Invalid thumbnail type");
  }

  const fileExtension = getExtensionFromImageMimeType(mediaType);

  const buffer = await file.arrayBuffer();
  const fileName = `${randomBytes(32).toString('base64url')}.${fileExtension}`;
  const fileSavePath = path.join(cfg.assetsRoot, fileName);

  await Bun.write(fileSavePath, buffer);

  video.thumbnailURL = getThumbnailUrl(cfg, fileName);

  updateVideo(cfg.db, video);

  return respondWithJSON(200, video);
}
