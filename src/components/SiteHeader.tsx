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
 * - La marca siempre vuelve al inicio (/).
 */
export function SiteHeader({
  items,
  auth,
  mobileMenu = true,
}: {
  items: SiteHeaderItem[];
  auth?: ReactNode;
  mobileMenu?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="apf-header apf-header--dense">
      <a className="apf-brand" href="/" aria-label="AiPetFriendly, inicio">
        <img src="/logo-aipetfriendly.png" alt="" />
        <span>AiPetFriendly</span>
      </a>
      {mobileMenu && (
        <button
          className="apf-menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
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
      </nav>
      {auth ? <div className="apf-auth">{auth}</div> : null}
    </header>
  );
}
