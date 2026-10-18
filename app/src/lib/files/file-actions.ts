import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';

export type ShareOutcome = 'shared' | 'copied' | 'unavailable';

async function downloadToCache(url: string, fileName: string): Promise<File> {
  const destination = new File(Paths.cache, fileName);
  if (destination.exists) destination.delete();
  return File.downloadFileAsync(url, destination);
}

/**
 * Móvil: descarga el archivo desde la presigned URL (5 min) y abre la hoja del sistema
 * para guardarlo en Archivos/Drive o abrirlo con otra app.
 */
export async function saveDownloadedFile(url: string, fileName: string, mimeType: string): Promise<void> {
  const file = await downloadToCache(url, fileName);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: `Guardar ${fileName}` });
  }
}

export async function shareDocumentFile(url: string, fileName: string, mimeType: string): Promise<ShareOutcome> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  const file = await downloadToCache(url, fileName);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: `Compartir ${fileName}` });
  return 'shared';
}

/** Vista previa de PDF en el navegador del sistema (las imágenes se ven dentro de la app). */
export async function openPreview(url: string): Promise<void> {
  await WebBrowser.openBrowserAsync(url);
}
