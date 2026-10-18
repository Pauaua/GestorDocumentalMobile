import os from 'node:os';

interface InstanceInfo {
  instanceId: string;
  availabilityZone?: string;
}

let cached: InstanceInfo | undefined;

const IMDS = 'http://169.254.169.254/latest';

/**
 * Obtiene el id de la instancia EC2 con IMDSv2 (token de sesión).
 * Fuera de AWS responde con el hostname para no bloquear /health.
 */
export async function getInstanceInfo(): Promise<InstanceInfo> {
  if (cached) return cached;
  try {
    const tokenRes = await fetch(`${IMDS}/api/token`, {
      method: 'PUT',
      headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' },
      signal: AbortSignal.timeout(500),
    });
    if (!tokenRes.ok) throw new Error('IMDS no disponible');
    const token = await tokenRes.text();
    const headers = { 'X-aws-ec2-metadata-token': token };
    const [id, az] = await Promise.all([
      fetch(`${IMDS}/meta-data/instance-id`, { headers, signal: AbortSignal.timeout(500) }).then((r) => r.text()),
      fetch(`${IMDS}/meta-data/placement/availability-zone`, { headers, signal: AbortSignal.timeout(500) }).then((r) =>
        r.text(),
      ),
    ]);
    cached = { instanceId: id, availabilityZone: az };
  } catch {
    cached = { instanceId: `local-${os.hostname()}` };
  }
  return cached;
}
