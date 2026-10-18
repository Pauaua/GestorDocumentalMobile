/**
 * Web: el refresh token vive solo en una cookie httpOnly + SameSite=Strict que el
 * JavaScript de la página no puede leer (protege ante XSS). El access token queda
 * únicamente en memoria (Zustand) y se renueva con /auth/refresh al recargar.
 */
export const usesRefreshCookie = true;

export async function getRefreshToken(): Promise<string | null> {
  return null;
}

export async function setRefreshToken(_token: string): Promise<void> {
  // La cookie la escribe el servidor.
}

export async function clearRefreshToken(): Promise<void> {
  // La cookie la borra el servidor en /auth/logout.
}
