import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const {
  R2_ACCOUNT_ID: accountId,
  R2_ACCESS_KEY_ID: accessKeyId,
  R2_SECRET_ACCESS_KEY: secretAccessKey,
  R2_BUCKET: bucket,
} = process.env;
if (!accountId || !accessKeyId || !secretAccessKey || !bucket)
  throw new Error("Private R2 storage is not configured.");
const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});
const key = `user-signatures/storage-check/${randomUUID()}.png`;
const bytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/ZkAAAAASUVORK5CYII=",
  "base64",
);
let created = false;
try {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: "image/png",
      CacheControl: "private, no-store",
    }),
  );
  created = true;
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  assert.equal(object.ContentType, "image/png");
  assert.equal(object.CacheControl, "private, no-store");
  assert.deepEqual(Buffer.from(await object.Body.transformToByteArray()), bytes);
  const unsigned = await fetch(
    `https://${accountId}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}/${key}`,
  );
  assert.notEqual(unsigned.status, 200);
  console.log(
    "Private R2 signature storage: authenticated write/read and denial of unsigned S3 access passed.",
  );
} finally {
  if (created) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    console.log("Temporary storage-check object deleted. User signature records were not changed.");
  }
  client.destroy();
}
