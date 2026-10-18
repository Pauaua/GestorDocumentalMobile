import type { PickedFile, ProgressCallback } from './types';

/** Web: XMLHttpRequest permite medir el progreso de subida (fetch no lo expone). */
export async function uploadToPresignedUrl(
  url: string,
  file: PickedFile,
  headers: Record<string, string>,
  onProgress: ProgressCallback,
): Promise<void> {
  const body = file.file ?? (await fetch(file.uri).then((r) => r.blob()));
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error(`El almacenamiento rechazó el archivo (código ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('No se pudo subir el archivo. Revisa tu conexión.'));
    xhr.send(body);
  });
}
