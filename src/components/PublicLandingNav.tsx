import { ChevronDown } from 'lucide-react';

type NavLink = { href: string; label: string };

// Grupos de la navegacion publica (PASO 12.1): conecta las landings ya
// existentes sin crear paginas nuevas. "Cuidado" agrupa las herramientas de
// uso diario de la mascota; "Encontrar" agrupa las herramientas de busqueda
// (veterinarias, lugares pet friendly, identificacion).
const CARE_LINKS: NavLink[] = [
  { href: '/historial-clinico', label: 'Historial clínico' },
  { href: '/recordatorios', label: 'Recordatorios' },
  { href: '/alimentacion-y-peso', label: 'Alimentación y peso' },
  { href: '/consultorio-ia', label: 'Asistente IA' },
];

const FIND_LINKS: NavLink[] = [
  { href: '/veterinarias', label: 'Veterinarias' },
  { href: '/pet-friendly', label: 'Pet Friendly' },
  { href: '/identificacion-y-mascota-perdida', label: 'Identificación y mascota perdida' },
];

const DIRECT_LINKS: NavLink[] = [
  { href: '/como-funciona', label: 'Cómo funciona' },
  { href: '/guias', label: 'Guías' },
  { href: '/blog', label: 'Blog' },
];

function getCurrentPath(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname;
}

function NavDropdown({ label, links, currentPath }: { label: string; links: NavLink[]; currentPath: string }) {
  const hasActiveLink = links.some((link) => link.href === currentPath);

  return (
    <details className="group relative">
      <summary
        className={`flex cursor-pointer list-none items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold transition [&::-webkit-details-marker]:hidden ${
          hasActiveLink ? 'bg-emerald-100 text-emerald-700' : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
        }`}
      >
        {label}
        <ChevronDown size={14} className="transition group-open:rotate-180" />
      </summary>
      <ul className="absolute left-1/2 z-20 mt-1 w-56 max-w-[90vw] -translate-x-1/2 space-y-0.5 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-emerald-100">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                currentPath === link.href ? 'bg-emerald-100 text-emerald-700' : 'text-slate-700 hover:bg-emerald-50'
              }`}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

// Navegacion publica compartida por todas las landings (Home + /como-funciona +
// las 7 landings de funcionalidad): permite moverse entre ellas sin volver al
// inicio. No reemplaza la barra de tabs de la app (esa sigue gestionando el
// acceso a las secciones que requieren cuenta).
export function PublicLandingNav() {
  const currentPath = getCurrentPath();

  return (
    <nav className="mb-2 flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-white/85 p-2 shadow-sm ring-1 ring-emerald-100">
      <NavDropdown label="Cuidado" links={CARE_LINKS} currentPath={currentPath} />
      <NavDropdown label="Encontrar" links={FIND_LINKS} currentPath={currentPath} />
      {DIRECT_LINKS.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
            currentPath === link.href ? 'bg-emerald-100 text-emerald-700' : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
          }`}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}

// Enlaces contextuales entre landings relacionadas (ver PASO 12.1): solo se
// usa donde hay una relacion directa real entre funcionalidades.
export function RelatedLinksSection({ links }: { links: NavLink[] }) {
  if (links.length === 0) return null;

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
      <h2 className="font-bold text-slate-900">También te puede interesar</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
          >
            {link.label} →
          </a>
        ))}
      </div>
    </div>
  );
}
