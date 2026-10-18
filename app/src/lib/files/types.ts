/** Archivo elegido con expo-document-picker (en web incluye el objeto File del navegador). */
export interface PickedFile {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
  file?: Blob;
}

export type ProgressCallback = (fraction: number) => void;
