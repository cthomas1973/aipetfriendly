// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiPetFriendlyHome, type HomeAuthState } from './AiPetFriendlyHome';
import { SiteHeader } from './SiteHeader';

vi.mock('./PublicLegalPages', () => ({ PublicFooter: () => null }));

afterEach(() => cleanup());

function renderHome(authState: HomeAuthState) {
  const handlers = {
    onRegister: vi.fn(), onLogin: vi.fn(), onGuest: vi.fn(), onNavigate: vi.fn(),
    onOpenAccount: vi.fn(), onLogout: vi.fn(), onLeaveGuest: vi.fn(),
  };
  render(<AiPetFriendlyHome authState={authState} {...handlers} />);
  return handlers;
}

describe('Home permanente: area de acceso segun la sesion', () => {
  it('sin sesion ofrece Ingresar y Crear cuenta, sin cierre de sesion', () => {
    renderHome('anonymous');
    expect(screen.getAllByRole('button', { name: 'Ingresar' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Cerrar sesión/ })).toBeNull();
  });

  it('con cuenta muestra Mi cuenta y Cerrar sesión, sin invitar a registrarse', () => {
    const handlers = renderHome('user');
    expect(screen.queryByRole('button', { name: 'Ingresar' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Crear cuenta gratis/ })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: /Cerrar sesión/ })[0]);
    expect(handlers.onLogout).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole('button', { name: /Mi cuenta/ })[0]);
    expect(handlers.onOpenAccount).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Ir a mis mascotas/ }));
    expect(handlers.onNavigate).toHaveBeenCalledWith('pets');
  });

  it('el visitante sale del modo visitante sin confundirlo con cerrar sesión', () => {
    const handlers = renderHome('guest');
    expect(screen.queryByRole('button', { name: /Cerrar sesión/ })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: /Salir del modo visitante/ })[0]);
    expect(handlers.onLeaveGuest).toHaveBeenCalledTimes(1);
    expect(handlers.onLogout).not.toHaveBeenCalled();
  });

  it('mientras se comprueba la sesion no muestra Ingresar ni Cerrar sesión (sin parpadeos)', () => {
    renderHome('checking');
    expect(screen.queryByRole('button', { name: 'Ingresar' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Cerrar sesión/ })).toBeNull();
  });

  it('el menu lleva a cada seccion con su destino estable', () => {
    const handlers = renderHome('user');
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    const expected: Array<[string, string]> = [
      ['Mascotas', 'pets'], ['Agenda', 'agenda'], ['Consultorio IA', 'assistant'],
      ['Mapa Vet', 'veterinaries'], ['Pet Friendly', 'pet-friendly'], ['Tienda', 'store'],
      ['Blog', 'blog'], ['Guías', 'guides'],
    ];
    for (const [label, destination] of expected) {
      fireEvent.click(Array.from(nav.querySelectorAll('button')).find(b => b.textContent?.trim() === label)!);
      expect(handlers.onNavigate).toHaveBeenLastCalledWith(destination);
    }
  });
});

describe('SiteHeader', () => {
  it('la marca vuelve a la Home sin recargar cuando se le pasa onHome', () => {
    const onHome = vi.fn();
    render(<SiteHeader items={[]} onHome={onHome} />);
    fireEvent.click(screen.getByRole('link', { name: /AiPetFriendly, inicio/ }));
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it('sin onHome la marca es un enlace normal a /', () => {
    render(<SiteHeader items={[]} />);
    expect(screen.getByRole('link', { name: /AiPetFriendly, inicio/ }).getAttribute('href')).toBe('/');
  });
});
