import { describe, expect, it } from 'vitest';
import { appTabHref, isPermanentHome } from './siteRoutes';

const base = {
  isHomeRoute: true,
  requestedTab: null,
  isResetPasswordRoute: false,
  showAuthGate: false,
  hasPublicVetClaimRoute: false,
  hasPublicPlaceClaimRoute: false,
};

describe('Home permanente', () => {
  it('se muestra en / sin importar la sesion (la funcion ni siquiera la recibe)', () => {
    expect(isPermanentHome(base)).toBe(true);
    expect(isPermanentHome.length).toBe(1);
  });

  it('no se muestra fuera de la raiz', () => {
    expect(isPermanentHome({ ...base, isHomeRoute: false })).toBe(false);
  });

  it.each([
    ['deep link ?tab=', { requestedTab: 'pets' as const }],
    ['recuperacion de contraseña', { isResetPasswordRoute: true }],
    ['registro abierto desde la Home', { showAuthGate: true }],
    ['reclamo de veterinaria', { hasPublicVetClaimRoute: true }],
    ['reclamo de lugar Pet Friendly', { hasPublicPlaceClaimRoute: true }],
  ])('respeta el destino explicito: %s', (_name, override) => {
    expect(isPermanentHome({ ...base, ...override })).toBe(false);
  });

  it('arma los deep links de cada seccion y deja el blog en su ruta publica', () => {
    expect(appTabHref('pets')).toBe('/?tab=pets');
    expect(appTabHref('offers')).toBe('/?tab=offers');
    expect(appTabHref('blog')).toBe('/blog');
  });
});
