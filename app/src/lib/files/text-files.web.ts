import type { PickedFile } from './types';

/** Web: contenido de texto del File del navegador. */
export async function readPickedText(file: PickedFile): Promise<string> {
  if (file.file) return file.file.text();
  return (await fetch(file.uri)).text();
}

/** Web: descarga el texto como archivo. */
export async function saveTextFile(fileName: string, content: string, mimeType: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
