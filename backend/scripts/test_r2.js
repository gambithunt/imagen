// Quick R2 credential tester
// Loads backend/.env via dotenv and attempts to list objects in the configured bucket

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");

async function test() {
  try {
    const endpoint = process.env.R2_ENDPOINT || process.env.R2_BASE_URL;
    const bucket = process.env.R2_BUCKET;
    const accessKeyId =
      process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY;
    const secretAccessKey =
      process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY;

    console.log("Using endpoint:", endpoint);
    console.log("Using bucket:", bucket);
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      console.error(
        "Missing one or more required env vars: R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
      );
      process.exit(2);
    }

    const client = new S3Client({
      region: process.env.R2_REGION || "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: false,
    });
    const cmd = new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 10 });
    const resp = await client.send(cmd);
    console.log("ListObjects response:");
    console.log(JSON.stringify(resp, null, 2));
  } catch (err) {
    console.error("R2 test failed:");
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

if (require.main === module) test();
