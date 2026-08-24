import type { AppUser } from '../types';

// Crea un usuario "visitante" (sin cuenta, sin persistencia en Supabase).
// Se usa tanto para el boton manual "Continuar como visitante" (AuthScreens)
// como para el ingreso automatico como invitado en la primera visita (App.tsx),
// de forma que un visitante (o el rastreador de Google) pueda recorrer toda la
// app sin loguearse.
export function createGuestUser(): AppUser {
  return {
    id: `guest_${Date.now()}`,
    email: 'guest@aipetfriendly.local',
    fullName: 'Visitante',
    subscription: {
      plan: 'free',
      isActive: false,
      expiresAt: null,
    },
    isGuest: true,
  };
}
