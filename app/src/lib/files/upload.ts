import { File } from 'expo-file-system';
import type { PickedFile, ProgressCallback } from './types';

/** Móvil: PUT binario directo a S3 con la presigned URL, informando el progreso. */
export async function uploadToPresignedUrl(
  url: string,
  file: PickedFile,
  headers: Record<string, string>,
  onProgress: ProgressCallback,
): Promise<void> {
  const task = new File(file.uri).createUploadTask(url, {
    httpMethod: 'PUT',
    headers,
    onProgress: ({ bytesSent, totalBytes }) => {
      if (totalBytes > 0) onProgress(bytesSent / totalBytes);
    },
  });
  const result = await task.uploadAsync();
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`El almacenamiento rechazó el archivo (código ${result.status})`);
  }
  onProgress(1);
}
