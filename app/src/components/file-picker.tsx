import * as DocumentPicker from 'expo-document-picker';
import { ALLOWED_MIME_TYPES } from '@/lib/config';
import type { PickedFile } from '@/lib/files/types';
import { FileDropButton } from './file-drop-button';

export interface FilePickerProps {
  file: PickedFile | null;
  onPick: (file: PickedFile) => void;
  error?: string;
  disabled?: boolean;
  /** Tipos aceptados (por defecto, los de los documentos). En web se aceptan también estas extensiones. */
  types?: readonly string[];
  extensions?: readonly string[];
  /** data-testid y etiqueta accesible del <input> en web. */
  inputTestID?: string;
  inputLabel?: string;
}

/** Móvil: selector de documentos del sistema (Archivos, Drive, Fotos). */
export function FilePicker({ file, onPick, error, disabled, types = ALLOWED_MIME_TYPES }: FilePickerProps) {
  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [...types],
      copyToCacheDirectory: true,
      multiple: false,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    onPick({
      uri: asset.uri,
      name: asset.name,
      size: asset.size ?? 0,
      mimeType: asset.mimeType ?? 'application/octet-stream',
    });
  };
  return <FileDropButton file={file} onPress={pick} error={error} disabled={disabled} />;
}
