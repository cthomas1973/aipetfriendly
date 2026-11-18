import { useState, type ReactNode } from 'react';
import { Menu, X, type LucideIcon } from 'lucide-react';
import './AiPetFriendlyHome.css';

export interface SiteHeaderItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  active?: boolean;
  onSelect: () => void;
}

/**
 * Barra de navegacion unica del sitio (mismo estilo que la home nueva).
 * - `mobileMenu`: muestra la hamburguesa en pantallas chicas (home, donde no
 *   hay BottomNav). En la app queda apagada porque la navegacion movil es la
 *   barra inferior.
 * - La marca siempre vuelve al inicio (/); con `onHome` se hace sin recargar
 *   la pagina (conserva el estado en memoria, p. ej. el modo visitante).
 * - `auth` (Ingresar / Mi cuenta / Cerrar sesion) se muestra a la derecha en
 *   escritorio y dentro del menu desplegable en mobile.
 */
export function SiteHeader({
  items,
  auth,
  mobileMenu = true,
  onHome,
}: {
  items: SiteHeaderItem[];
  auth?: ReactNode;
  mobileMenu?: boolean;
  onHome?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="apf-header apf-header--dense">
      <a
        className="apf-brand"
        href="/"
        aria-label="AiPetFriendly, inicio"
        onClick={onHome ? (event) => { event.preventDefault(); onHome(); } : undefined}
      >
        <img src="/logo-aipetfriendly.png" alt="" />
        <span>AiPetFriendly</span>
      </a>
      {mobileMenu && (
        <button
          className="apf-menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(v => !v)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
      )}
      <nav className={`apf-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Navegación principal">
        {items.map(({ key, label, icon: Icon, active, onSelect }) => (
          <button
            key={key}
            type="button"
            className={active ? 'is-active' : ''}
            onClick={() => {
              setMenuOpen(false);
              onSelect();
            }}
          >
            {Icon ? <Icon /> : null} {label}
          </button>
        ))}
        {auth ? <div className="apf-nav-auth" onClick={() => setMenuOpen(false)}>{auth}</div> : null}
      </nav>
      {auth ? <div className="apf-auth">{auth}</div> : null}
    </header>
  );
}
