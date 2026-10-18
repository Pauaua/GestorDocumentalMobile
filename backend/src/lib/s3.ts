import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getConfig } from '../config/env';

let internalClient: S3Client | undefined;
let publicClient: S3Client | undefined;

/**
 * En AWS no se pasan credenciales: el SDK usa el rol IAM de la instancia (IMDSv2).
 * En desarrollo se apunta a MinIO con S3_ENDPOINT.
 */
function clients(): { internal: S3Client; signer: S3Client } {
  const cfg = getConfig();
  internalClient ??= new S3Client({
    region: cfg.AWS_REGION,
    endpoint: cfg.S3_ENDPOINT,
    forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
  });
  // Las presigned URL deben usar el host que ve el cliente (navegador o teléfono).
  publicClient ??= cfg.S3_PUBLIC_ENDPOINT
    ? new S3Client({ region: cfg.AWS_REGION, endpoint: cfg.S3_PUBLIC_ENDPOINT, forcePathStyle: cfg.S3_FORCE_PATH_STYLE })
    : internalClient;
  return { internal: internalClient, signer: publicClient };
}

export function getS3Client(): S3Client {
  return clients().internal;
}

export const UPLOAD_URL_TTL_SECONDS = 300;
export const DOWNLOAD_URL_TTL_SECONDS = 300;

export async function createUploadUrl(key: string, contentType: string, contentLength: number): Promise<string> {
  const { signer } = clients();
  // ContentType y ContentLength quedan firmados: S3 rechaza un archivo distinto al declarado.
  return getSignedUrl(
    signer,
    new PutObjectCommand({
      Bucket: getConfig().S3_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS, signableHeaders: new Set(['content-type', 'content-length']) },
  );
}

export async function createDownloadUrl(
  key: string,
  fileName: string,
  disposition: 'attachment' | 'inline' = 'attachment',
): Promise<string> {
  const { signer } = clients();
  const safeName = encodeURIComponent(fileName);
  return getSignedUrl(
    signer,
    new GetObjectCommand({
      Bucket: getConfig().S3_BUCKET,
      Key: key,
      ResponseContentDisposition: `${disposition}; filename*=UTF-8''${safeName}`,
    }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
  );
}

export async function headObject(key: string): Promise<{ size: number; contentType?: string } | null> {
  try {
    const res = await clients().internal.send(new HeadObjectCommand({ Bucket: getConfig().S3_BUCKET, Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType };
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || (err as Error).name === 'NotFound') return null;
    throw err;
  }
}

/** Solo para tests: reinicia los clientes cacheados. */
export function resetS3Clients(): void {
  internalClient = undefined;
  publicClient = undefined;
}
