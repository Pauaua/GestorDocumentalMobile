export type ShareOutcome = 'shared' | 'copied' | 'unavailable';

/** Web: S3 responde con Content-Disposition: attachment, así que el navegador descarga el archivo. */
export async function saveDownloadedFile(url: string, fileName: string, _mimeType: string): Promise<void> {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Usa la hoja de compartir del navegador si existe; si no, copia el enlace temporal. */
export async function shareDocumentFile(url: string, fileName: string, _mimeType: string): Promise<'shared' | 'copied' | 'unavailable'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: fileName, url });
      return 'shared';
    } catch {
      // El usuario canceló: se intenta copiar como alternativa.
    }
  }
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(url);
    return 'copied';
  }
  return 'unavailable';
}

export async function openPreview(url: string): Promise<void> {
  window.open(url, '_blank', 'noopener');
}
