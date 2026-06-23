import { useCallback } from 'react';
import { useAppState } from '../context/AppStateContext';
import type { AppUser } from '../types';

export function useUser() {
  const { user, loading, setUser } = useAppState();

  const signOut = useCallback(() => {
    setUser(null);
  }, [setUser]);

  const setMockUser = useCallback(
    (email: string, fullName?: string, wantsNewsletter?: boolean) => {
      const mockUser: AppUser = {
        id: crypto.randomUUID(),
        email,
        fullName: fullName || 'Tutor Responsable',
        wantsNewsletter,
        subscription: {
          plan: 'free',
          isActive: false,
          expiresAt: null,
        },
      };
      setUser(mockUser);
    },
    [setUser],
  );

  return {
    user,
    loading,
    setUser,
    setMockUser,
    signOut,
  };
}
