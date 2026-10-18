import { create } from 'zustand';
import type { User } from '../types';

type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

interface SessionState {
  status: SessionStatus;
  user: User | null;
  accessToken: string | null;
  setSession: (user: User, accessToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  setUser: (user: User) => void;
  clear: () => void;
}

/** Sesión en memoria. El refresh token nunca pasa por aquí (ver token-storage). */
export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  user: null,
  accessToken: null,
  setSession: (user, accessToken) => set({ status: 'authenticated', user, accessToken }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setUser: (user) => set({ user }),
  clear: () => set({ status: 'anonymous', user: null, accessToken: null }),
}));
