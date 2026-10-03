import "server-only";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

const configuration = () => {
  const {
    R2_ACCOUNT_ID: accountId,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
    R2_BUCKET: bucket,
  } = env;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket)
    throw new Error(
      "Document storage is not configured. Set the Cloudflare R2 environment variables.",
    );
  return { accountId, accessKeyId, secretAccessKey, bucket };
};
const client = () => {
  const config = configuration();
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
};
export async function putPrivateCustomerDocument(key: string, file: File) {
  const { bucket } = configuration();
  await client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(await file.arrayBuffer()),
      ContentType: file.type,
      CacheControl: "private, no-store",
    }),
  );
}
export async function getPrivateCustomerDocument(key: string) {
  const { bucket } = configuration();
  return client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
}
