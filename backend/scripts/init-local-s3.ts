/**
 * Prepara el bucket local (RustFS/MinIO) para desarrollo: lo crea si no existe
 * y le aplica CORS para que el navegador pueda usar las presigned URL.
 * Uso: npm run s3:init   (lee backend/.env)
 */
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { loadConfig } from '../src/config/env';

async function main(): Promise<void> {
  const cfg = await loadConfig();
  if (!cfg.S3_ENDPOINT) throw new Error('S3_ENDPOINT no está definido: este script es solo para el S3 local');
  const s3 = new S3Client({ region: cfg.AWS_REGION, endpoint: cfg.S3_ENDPOINT, forcePathStyle: true });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: cfg.S3_BUCKET }));
    console.log(`Bucket ${cfg.S3_BUCKET} ya existe`);
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: cfg.S3_BUCKET }));
    console.log(`Bucket ${cfg.S3_BUCKET} creado`);
  }
  try {
    await s3.send(
      new PutBucketCorsCommand({
        Bucket: cfg.S3_BUCKET,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: ['http://localhost:3000', 'http://localhost:8081', ...cfg.CORS_ORIGINS],
              AllowedMethods: ['GET', 'PUT', 'HEAD'],
              AllowedHeaders: ['*'],
              ExposeHeaders: ['ETag'],
              MaxAgeSeconds: 3000,
            },
          ],
        },
      }),
    );
    console.log('CORS aplicado');
  } catch (err) {
    console.warn(`No se pudo aplicar CORS (${(err as Error).message}); el servidor local puede permitir todos los orígenes.`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
