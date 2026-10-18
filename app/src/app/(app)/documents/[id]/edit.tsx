import { useLocalSearchParams } from 'expo-router';
import { EditDocumentScreen } from '@/screens/edit-document';

export default function EditDocumentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditDocumentScreen id={id} />;
}
