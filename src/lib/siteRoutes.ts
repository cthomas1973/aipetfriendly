import type { AppTab } from '../types';

export interface HomeRouteInput {
  /** pathname normalizado === '/' */
  isHomeRoute: boolean;
  /** tab pedido explicitamente por ?tab= (deep link) */
  requestedTab: AppTab | null;
  isResetPasswordRoute: boolean;
  /** el usuario abrio el formulario de registro desde la Home */
  showAuthGate: boolean;
  hasPublicVetClaimRoute: boolean;
  hasPublicPlaceClaimRoute: boolean;
}

/**
 * La Home es la entrada permanente del sitio: se muestra en `/` para cualquier
 * visitante, invitado o usuario autenticado. La sesion NO interviene; solo
 * cambian las rutas con un destino explicito (?tab=, reclamos publicos,
 * recuperacion de contrasena o el formulario de registro abierto).
 */
export function isPermanentHome({
  isHomeRoute,
  requestedTab,
  isResetPasswordRoute,
  showAuthGate,
  hasPublicVetClaimRoute,
  hasPublicPlaceClaimRoute,
}: HomeRouteInput): boolean {
  return isHomeRoute
    && !requestedTab
    && !isResetPasswordRoute
    && !showAuthGate
    && !hasPublicVetClaimRoute
    && !hasPublicPlaceClaimRoute;
}

/** Ruta interna (deep link) para abrir una seccion de la app desde cualquier pagina. */
export function appTabHref(tab: AppTab): string {
  return tab === 'blog' ? '/blog' : `/?tab=${tab}`;
}
