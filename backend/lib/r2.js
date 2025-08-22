// Cloudflare R2 helper (CommonJS)
// Provides: uploadBuffer(buffer, key, contentType) -> publicUrl
//           listObjects(prefix) -> [{ Key, Size }, ...]
//           getObjectPublicUrl(key) -> string

const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const {
  getSignedUrl: awsGetSignedUrl,
} = require("@aws-sdk/s3-request-presigner");

const REGION = process.env.R2_REGION || "auto";

function getClient() {
  const endpoint = process.env.R2_ENDPOINT || process.env.R2_BASE_URL;
  if (!endpoint)
    throw new Error("R2_ENDPOINT or R2_BASE_URL not configured in env");
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY;
  const secretAccessKey =
    process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY;
  if (!accessKeyId || !secretAccessKey)
    throw new Error(
      "R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set in env"
    );
  return new S3Client({
    region: REGION,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
}

async function uploadBuffer(buffer, key, contentType = "image/png") {
  const bucket = process.env.R2_BUCKET || "imagen-storage";
  const client = getClient();
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });
  await client.send(cmd);
  return getObjectPublicUrl(key);
}

async function listObjects(prefix = "") {
  const bucket = process.env.R2_BUCKET || "imagen-storage";
  const client = getClient();
  const cmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix });
  const resp = await client.send(cmd);
  return (resp.Contents || []).map((c) => ({ Key: c.Key, Size: c.Size }));
}

function getObjectPublicUrl(key) {
  const base =
    process.env.R2_BASE_URL || process.env.R2_URL || process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET || "imagen-storage";
  if (!base) return `https://${bucket}.r2.cloudflarestorage.com/${key}`;
  const clean = base.replace(/\/$/, "");
  return `${clean.replace(/\/$/, "")}/${key}`;
}

/**
 * Generate a presigned GET URL for the given key.
 * expiresSeconds - number of seconds before the signed url expires (default 900)
 */
async function getSignedUrl(key, expiresSeconds = 900) {
  const bucket = process.env.R2_BUCKET || "imagen-storage";
  const client = getClient();
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  // awsGetSignedUrl returns a promise that resolves to the signed URL
  const url = await awsGetSignedUrl(client, cmd, { expiresIn: expiresSeconds });
  return url;
}

/**
 * Download an object to a buffer
 */
async function downloadToBuffer(key) {
  const bucket = process.env.R2_BUCKET || "imagen-storage";
  const client = getClient();
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await client.send(cmd);

  // Convert the stream to buffer
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Delete an object from R2
 */
async function deleteObject(key) {
  const bucket = process.env.R2_BUCKET || "imagen-storage";
  const client = getClient();
  const cmd = new DeleteObjectCommand({ Bucket: bucket, Key: key });
  await client.send(cmd);
}

module.exports = {
  uploadBuffer,
  listObjects,
  getObjectPublicUrl,
  getSignedUrl,
  downloadToBuffer,
  deleteObject,
};
