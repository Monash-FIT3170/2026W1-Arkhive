import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

const accountId = process.env.R2_ACCOUNT_ID || '';
const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';

const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

export const s3Client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
  },
});

/**
 * Generates a presigned PUT URL allowing the client to upload an object directly to R2.
 */
export async function generateUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 300
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generates a presigned GET URL for securely downloading/viewing an object from R2.
 */
export async function generateDownloadUrl(key: string, expiresIn = 300): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Fetches an object directly from R2 and returns its data as a Node Buffer (e.g. for OCR processing).
 */
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error(`Empty body returned from R2 for key: ${key}`);
  }

  if (response.Body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
  }

  // Handle byte arrays / blobs / web streams if returned
  const byteArray = await response.Body.transformToByteArray();
  return Buffer.from(byteArray);
}

/**
 * Deletes a single object from R2.
 */
export async function deleteObject(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Deletes multiple objects from R2 in a batch.
 */
export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  const command = new DeleteObjectsCommand({
    Bucket: R2_BUCKET_NAME,
    Delete: {
      Objects: keys.map((Key) => ({ Key })),
      Quiet: true,
    },
  });

  await s3Client.send(command);
}

/**
 * Lists all object keys matching a specific prefix (e.g. all pages in a document directory).
 */
export async function listObjects(prefix: string): Promise<string[]> {
  const command = new ListObjectsV2Command({
    Bucket: R2_BUCKET_NAME,
    Prefix: prefix,
  });

  const response = await s3Client.send(command);
  return (response.Contents || []).map((item) => item.Key!).filter(Boolean);
}

/**
 * Deletes all objects matching a prefix (e.g. deleting all pages in a document directory).
 */
export async function deletePrefix(prefix: string): Promise<void> {
  const keys = await listObjects(prefix);
  if (keys.length > 0) {
    await deleteObjects(keys);
  }
}
