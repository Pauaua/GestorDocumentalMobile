import {
  CalendarCheck,
  FileSignature,
  FileText,
  Handshake,
  Mail,
  NotebookPen,
  type LucideIcon,
} from 'lucide-react-native';
import { colors } from './colors';

interface DocumentTypeStyle {
  background: string;
  foreground: string;
  icon: LucideIcon;
}

/** Una etiqueta pastel distinta por tipo de documento (texto oscuro para AA). */
export const documentTypeStyles: Record<string, DocumentTypeStyle> = {
  MEMO: { background: colors.primarySoft, foreground: colors.primaryStrong, icon: NotebookPen },
  OFICIO: { background: colors.secondarySoft, foreground: colors.secondaryStrong, icon: Mail },
  CITACION: { background: colors.warning, foreground: colors.warningStrong, icon: CalendarCheck },
  ACUERDO: { background: colors.success, foreground: colors.successStrong, icon: Handshake },
  ACTA: { background: colors.accentSoft, foreground: colors.secondaryStrong, icon: FileText },
  PERMISO_ADMINISTRATIVO: { background: colors.dangerSoft, foreground: colors.dangerStrong, icon: FileSignature },
};

export function documentTypeStyle(code: string | undefined): DocumentTypeStyle {
  return (code && documentTypeStyles[code]) || {
    background: colors.border,
    foreground: colors.text,
    icon: FileText,
  };
}
