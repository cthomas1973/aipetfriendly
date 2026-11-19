import crypto from 'node:crypto';
import { load } from 'cheerio';
import { SEARCH_LIMITS, classifyCandidateUrl, getSourceById, getSourceForHost, normalizeCandidateUrl } from './_blog-sources.js';

export const canonicalText = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
export const contentFingerprint = (content) => crypto.createHash('sha256').update(canonicalText(content)).digest('hex');

export class SourceVerificationError extends Error {
  constructor(code, message, { httpStatus = null, host = null } = {}) {
    super(message);
    this.name = 'SourceVerificationError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.host = host;
  }
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_HOPS = 3;
const MAX_HTML = 2_000_000;
const USER_AGENT = 'AiPetFriendlyEditorial/1.0 (+https://www.aipetfriendly.ar)';

export function httpErrorCode(status) {
  if (status === 404 || status === 410) return 'http_404';
  if (status === 403 || status === 401) return 'http_403';
  if (status === 429) return 'http_429';
  if (status >= 500) return 'http_5xx';
  return 'http_error';
}

export function networkErrorCode(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'timeout';
  const code = error?.cause?.code || error?.code;
  return ['ENOTFOUND', 'EAI_AGAIN'].includes(code) ? 'dns' : 'connection';
}

// Descarga una pagina de una fuente autorizada. Cada redireccion se valida antes de seguirla y nunca se envian credenciales.
export async function fetchSourceHtml(value, source, fetcher = fetch, { timeoutMs = SEARCH_LIMITS.fetchTimeoutMs, validatePath = true } = {}) {
  let current = new URL(value);
  // Un unico plazo para toda la verificacion (redirecciones y lectura del cuerpo incluidas).
  const signal = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
    if (current.protocol !== 'https:' || !source.hosts.includes(current.hostname)) {
      throw new SourceVerificationError(hop === 0 ? 'domain_not_allowed' : 'redirect_unauthorized',
        hop === 0 ? 'Fuente fuera del catalogo autorizado' : 'La fuente redirige a un dominio no autorizado', { host: current.hostname });
    }
    if (validatePath && !classifyCandidateUrl(source, normalizeCandidateUrl(current.href)).ok) {
      throw new SourceVerificationError(hop === 0 ? 'path_not_allowed' : 'redirect_path_not_allowed', 'La ruta no esta permitida para esta fuente', { host: current.hostname });
    }
    let response;
    try {
      response = await fetcher(current.href, { signal, redirect: 'manual',
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' } });
    } catch (error) {
      const code = networkErrorCode(error);
      throw new SourceVerificationError(code, `No se pudo conectar con la fuente (${code})`, { host: current.hostname });
    }
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers?.get?.('location');
      if (!location) throw new SourceVerificationError('http_error', 'Redireccion sin destino', { httpStatus: response.status, host: current.hostname });
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) {
      throw new SourceVerificationError(httpErrorCode(response.status), `La fuente respondio HTTP ${response.status}`, { httpStatus: response.status, host: current.hostname });
    }
    const contentType = response.headers?.get?.('content-type');
    if (contentType && /(?:json|pdf|image|video|audio|octet-stream|zip)/i.test(contentType)) throw new SourceVerificationError('unsupported_content', 'La fuente no es una pagina HTML', { httpStatus: response.status, host: current.hostname });
    const html = await response.text().catch((error) => { throw new SourceVerificationError(networkErrorCode(error), 'No se pudo leer la fuente', { httpStatus: response.status, host: current.hostname }); });
    if (html.length > MAX_HTML) throw new SourceVerificationError('too_large', 'Fuente demasiado grande', { httpStatus: response.status, host: current.hostname });
    return { html, finalUrl: current.href, httpStatus: response.status };
  }
  throw new SourceVerificationError('redirect_unauthorized', 'Demasiadas redirecciones', { host: current.hostname });
}

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

export function extractSourcePage(html, source) {
  const document = load(html);
  const title = cleanText(document('h1').first().text()) || cleanText(document('title').text());
  document('script,style,nav,footer,header,aside,form,noscript,svg').remove();
  const container = (selector) => document(selector).first();
  const minChars = source.minChars || 800;
  const options = (source.selectors || ['main', 'article']).map((selector) => ({ selector, text: cleanText(container(selector).text()) }));
  const best = options.find((item) => item.text.length >= minChars) || options.reduce((top, item) => (item.text.length > top.text.length ? item : top), { selector: null, text: '' });
  const scope = best.selector ? container(best.selector) : document('body');
  const headings = scope.find('h1,h2,h3').map((_, element) => cleanText(document(element).text())).get()
    .filter((heading) => heading.length >= 3 && heading.length <= 120).slice(0, 30);
  return { title, text: best.text, headings, minChars };
}

// Verifica una pagina candidata del registro y devuelve la fuente con su texto, sin consultar a ningun modelo.
export async function verifySourceCandidate(candidate, { fetcher = fetch, timeoutMs } = {}) {
  const source = getSourceById(candidate.source_id) || getSourceForHost(new URL(candidate.url).hostname);
  if (!source) throw new SourceVerificationError('domain_not_allowed', 'Fuente fuera del catalogo autorizado');
  const { html, finalUrl, httpStatus } = await fetchSourceHtml(candidate.url, source, fetcher, { timeoutMs });
  const page = extractSourcePage(html, source);
  if (!page.title || page.text.length < page.minChars) throw new SourceVerificationError('insufficient_content', 'Fuente sin contenido principal verificable', { httpStatus, host: new URL(finalUrl).hostname });
  return { id: source.id, title: page.title, url: finalUrl, organization: source.organization, author: null, consulted_at: new Date().toISOString(),
    text: page.text.slice(0, 22000), text_sha256: contentFingerprint(page.text), headings: page.headings, http_status: httpStatus, host: new URL(finalUrl).hostname };
}

// Compatibilidad: verificacion de una URL concreta del registro sin validar rutas (catalogo antiguo y revisiones manuales).
export async function verifySource(topic, fetcher = fetch) {
  let url;
  try { url = new URL(topic.url); } catch { throw new SourceVerificationError('domain_not_allowed', 'Fuente fuera del catalogo autorizado'); }
  const source = getSourceForHost(url.hostname);
  if (url.protocol !== 'https:' || !source) throw new SourceVerificationError('domain_not_allowed', 'Fuente fuera del catalogo autorizado');
  const { html, finalUrl, httpStatus } = await fetchSourceHtml(url.href, source, fetcher, { timeoutMs: 15000, validatePath: false });
  const page = extractSourcePage(html, source);
  if (!page.title || page.text.length < page.minChars) throw new SourceVerificationError('insufficient_content', 'Fuente sin contenido principal verificable', { httpStatus });
  return { id: topic.sourceId || source.id, title: page.title, url: finalUrl, organization: source.organization, author: null, consulted_at: new Date().toISOString(),
    text: page.text.slice(0, 22000), text_sha256: contentFingerprint(page.text), headings: page.headings, http_status: httpStatus };
}

// Una pagina solo respalda el tema si comparte sus terminos significativos con el titulo, los apartados y el texto.
export function assessTopicSupport(candidateTitle, source) {
  const tokens = [...new Set(canonicalText(candidateTitle).split(' ').filter((word) => word.length >= 4))];
  if (tokens.length < 2) return { supported: true, ratio: 1, skipped: true };
  const heading = canonicalText([source.title, ...(source.headings || [])].join(' '));
  const body = canonicalText(source.text);
  const inBody = tokens.filter((token) => body.includes(token)).length;
  const inHeading = tokens.filter((token) => heading.includes(token)).length;
  const ratio = inBody / tokens.length;
  return { supported: ratio >= 0.5 && inHeading >= 1, ratio };
}
