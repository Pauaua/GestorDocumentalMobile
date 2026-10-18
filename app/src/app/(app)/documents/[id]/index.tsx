import { useLocalSearchParams } from 'expo-router';
import { DocumentDetailScreen } from '@/screens/document-detail';

export default function DocumentDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DocumentDetailScreen id={id} />;
}
