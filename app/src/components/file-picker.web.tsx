import { useRef } from 'react';
import { ALLOWED_MIME_TYPES } from '@/lib/config';
import { FileDropButton } from './file-drop-button';
import type { FilePickerProps } from './file-picker';

/**
 * Web: <input type="file"> propio en lugar de expo-document-picker, para que las
 * pruebas de Selenium puedan adjuntar archivos con send_keys (data-testid="upload-file-input").
 */
const DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.jpg', '.jpeg', '.png'];

export function FilePicker({
  file,
  onPick,
  error,
  disabled,
  types = ALLOWED_MIME_TYPES,
  extensions = DOCUMENT_EXTENSIONS,
  inputTestID = 'upload-file-input',
  inputLabel = 'Archivo del documento',
}: FilePickerProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        data-testid={inputTestID}
        aria-label={inputLabel}
        accept={[...types, ...extensions].join(',')}
        disabled={disabled}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (!selected) return;
          onPick({
            uri: URL.createObjectURL(selected),
            name: selected.name,
            size: selected.size,
            mimeType: selected.type || 'application/octet-stream',
            file: selected,
          });
          e.target.value = '';
        }}
      />
      <FileDropButton file={file} onPress={() => input.current?.click()} error={error} disabled={disabled} />
    </>
  );
}
