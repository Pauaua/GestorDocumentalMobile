/**
 * Web sin subdominio (desarrollo): el colegio elegido se recuerda en localStorage.
 * Puede no estar disponible (modo privado, almacenamiento bloqueado): en ese caso no se recuerda.
 */
const KEY = 'rtlco_school';

export async function getStoredSchool(): Promise<string | null> {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function setStoredSchool(slug: string): Promise<void> {
  try {
    window.localStorage.setItem(KEY, slug);
  } catch {
    // Sin almacenamiento: el colegio dura solo esta visita.
  }
}

export async function clearStoredSchool(): Promise<void> {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nada que borrar.
  }
}
