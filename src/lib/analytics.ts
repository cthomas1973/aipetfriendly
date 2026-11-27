import type { AppTab } from '../types';

// Medicion via Google Tag Manager (GTM-NKKZ8ZF5, snippet en index.html). La app
// solo publica eventos en dataLayer; la etiqueta GA4 (G-WNZLHW2NJB) vive en el
// contenedor. Ver docs/ANALYTICS_SETUP.md.
export const PAGE_VIEW_EVENT = 'virtual_page_view';

export interface AnalyticsPage {
  path: string;
  location: string;
  title: string;
}

interface AnalyticsWindow extends Window {
  dataLayer?: Array<Record<string, unknown>>;
}

const REDACTED_PATH = /^\/(mascota|m|chapita|t)\/[A-Za-z0-9]{4,16}$/;
const REDACTED_TITLE = 'Perfil publico de mascota | AiPetFriendly';

export function normalizeAnalyticsPath(pathname: string): string {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return trimmed || '/';
}

// Devuelve la "pagina" a medir sin datos personales: se descartan query y hash
// (tokens de recuperacion, reclamos, emails, etc.) y se enmascaran los codigos
// publicos de mascota/chapita. Solo se conserva ?tab= (seccion de la app).
export function buildAnalyticsPage({
  pathname,
  tab,
  origin,
  title,
}: {
  pathname: string;
  tab?: AppTab | null;
  origin: string;
  title: string;
}): AnalyticsPage {
  const normalized = normalizeAnalyticsPath(pathname);
  const redacted = REDACTED_PATH.test(normalized);
  const path = redacted
    ? normalized.replace(REDACTED_PATH, (_match, prefix: string) => `/${prefix}/:codigo`)
    : normalized;
  const withTab = !redacted && tab && path === '/' ? `/?tab=${tab}` : path;

  return {
    path: withTab,
    location: `${origin}${withTab}`,
    title: redacted ? REDACTED_TITLE : title,
  };
}

export function trackPageView(page: AnalyticsPage): void {
  if (typeof window === 'undefined') {
    return;
  }
  const w = window as AnalyticsWindow;
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({
    event: PAGE_VIEW_EVENT,
    page_path: page.path,
    page_location: page.location,
    page_title: page.title,
  });
}
