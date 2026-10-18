/** Utilidades para el RUT chileno (formato 12345678-5). */

export function normalizeRut(value: string): string {
  const clean = value.replace(/[.\s]/g, '').replace(/-/g, '').toUpperCase();
  if (clean.length < 2) return clean;
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

export function computeRutDv(body: string): string {
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const rest = 11 - (sum % 11);
  if (rest === 11) return '0';
  if (rest === 10) return 'K';
  return String(rest);
}

export function isValidRut(value: string): boolean {
  const rut = normalizeRut(value);
  const match = /^(\d{7,8})-([\dK])$/.exec(rut);
  if (!match) return false;
  return computeRutDv(match[1]!) === match[2];
}
