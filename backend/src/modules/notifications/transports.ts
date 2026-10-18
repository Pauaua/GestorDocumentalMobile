import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { getConfig } from '../../config/env';
import { getLogger } from '../../lib/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface PushMessage {
  tokens: string[];
  title: string;
  body: string;
  data: Record<string, string>;
}

/** Resultado de un envío push: tokens que Expo declaró inválidos (se eliminan). */
export interface PushResult {
  invalidTokens: string[];
}

/** Mensajes "enviados" con el transporte log (desarrollo y tests). */
export const sentEmails: EmailMessage[] = [];
export const sentPushes: PushMessage[] = [];

let ses: SESv2Client | undefined;

/** Amazon SES con el rol IAM de la instancia (sin credenciales en disco). */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const cfg = getConfig();
  if (cfg.MAIL_TRANSPORT === 'log') {
    sentEmails.push(message);
    getLogger().info({ to: message.to, subject: message.subject }, 'Correo (transporte log)');
    return;
  }
  ses ??= new SESv2Client({ region: cfg.AWS_REGION });
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: cfg.MAIL_FROM,
      Destination: { ToAddresses: [message.to] },
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: 'UTF-8' },
          Body: { Text: { Data: message.text, Charset: 'UTF-8' }, Html: { Data: message.html, Charset: 'UTF-8' } },
        },
      },
    }),
  );
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/** Expo Push (FCM/APNs a través de Expo). Hasta 100 mensajes por solicitud. */
export async function sendPush(message: PushMessage): Promise<PushResult> {
  if (getConfig().PUSH_TRANSPORT === 'log') {
    sentPushes.push(message);
    getLogger().info({ tokens: message.tokens.length, title: message.title }, 'Push (transporte log)');
    return { invalidTokens: [] };
  }
  const invalidTokens: string[] = [];
  for (let i = 0; i < message.tokens.length; i += 100) {
    const batch = message.tokens.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        batch.map((to) => ({ to, title: message.title, body: message.body, data: message.data, sound: 'default' })),
      ),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Expo Push respondió ${res.status}`);
    const { data } = (await res.json()) as { data: ExpoTicket[] };
    data.forEach((ticket, idx) => {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') invalidTokens.push(batch[idx]!);
    });
  }
  return { invalidTokens };
}

export function resetTransports(): void {
  sentEmails.length = 0;
  sentPushes.length = 0;
}
