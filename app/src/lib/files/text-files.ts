import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { PickedFile } from './types';

/** Móvil: contenido de texto de un archivo elegido (CSV de importación). */
export async function readPickedText(file: PickedFile): Promise<string> {
  return new File(file.uri).text();
}

/** Móvil: guarda el texto en la caché y abre la hoja del sistema para guardarlo o compartirlo. */
export async function saveTextFile(fileName: string, content: string, mimeType: string): Promise<void> {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: `Guardar ${fileName}` });
  }
}
