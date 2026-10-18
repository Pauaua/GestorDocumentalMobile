import { useEffect } from 'react';
import { AppNavigation } from '@/components/app-navigation';
import { listenToPushTaps } from '@/lib/notifications/push';

export default function AppLayout() {
  // Tocar un aviso push abre el documento (solo con sesión iniciada).
  useEffect(() => listenToPushTaps(), []);
  return <AppNavigation />;
}
