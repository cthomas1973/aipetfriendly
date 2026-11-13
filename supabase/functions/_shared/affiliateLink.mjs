const MERCADOLIBRE_HOSTS = new Set([
  'articulo.mercadolibre.com.ar',
  'listado.mercadolibre.com.ar',
  'mercadolibre.com.ar',
  'www.mercadolibre.com.ar',
]);

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function validTrackingValue(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 256
    && value.trim() === value
    && !/\s/.test(value)
    && !CONTROL_CHARACTERS.test(value);
}

function parseMarketplaceUrl(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value !== value.trim()
    || /\s/.test(value)
    || CONTROL_CHARACTERS.test(value)
  ) return null;

  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:'
      || !MERCADOLIBRE_HOSTS.has(url.hostname.toLowerCase())
      || url.port !== ''
      || url.username
      || url.password
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function hasMlaItemId(url) {
  return url.pathname.split('/').some(segment => /(?:^|-)MLA-?\d{6,}(?:-|$)/i.test(segment));
}

function hasSafeSearchPath(url) {
  return url.hostname === 'listado.mercadolibre.com.ar'
    && url.pathname.split('/').filter(Boolean).length > 0
    && url.pathname.split('/').filter(Boolean).every(segment => /^[a-z0-9._~-]+$/i.test(segment));
}

function getTrackingValues(url) {
  return [...url.searchParams.entries()]
    .filter(([key]) => key.toLowerCase() === 'matt_tool')
    .map(([, value]) => value);
}

function hasOneValidTrackingValue(url) {
  const values = getTrackingValues(url);
  return values.length === 1 && validTrackingValue(values[0]);
}

function hasAffiliateDestination(url) {
  return hasMlaItemId(url) || hasSafeSearchPath(url);
}

export function isAllowedMercadoLibrePermalink(permalink) {
  const url = parseMarketplaceUrl(permalink);
  return Boolean(url && hasMlaItemId(url));
}

export function isAllowedMercadoLibreAffiliateUrl(value) {
  return validateAffiliateUrl(value) !== null;
}

export function validateAffiliateUrl(value) {
  const url = parseMarketplaceUrl(value);
  if (!url || !hasAffiliateDestination(url) || !hasOneValidTrackingValue(url)) return null;
  return url.toString();
}

export function resolveAffiliateTracking({ template, id } = {}) {
  if (typeof template === 'string' && template.trim()) {
    const templateUrl = parseMarketplaceUrl(template);
    if (!templateUrl) return { ok: false, reason: 'invalid_configuration' };

    const values = getTrackingValues(templateUrl);
    if (values.length > 1) return { ok: false, reason: 'invalid_configuration' };
    if (values.length === 1) {
      return validTrackingValue(values[0])
        ? { ok: true, value: values[0] }
        : { ok: false, reason: 'invalid_configuration' };
    }
  }

  if (!validTrackingValue(id)) return { ok: false, reason: 'unconfigured' };
  return { ok: true, value: id };
}

export function buildAffiliateUrl(permalink, trackingValue) {
  if (!validTrackingValue(trackingValue)) {
    return { ok: false, reason: 'invalid_tracking' };
  }

  const url = parseMarketplaceUrl(permalink);
  if (!url || !hasMlaItemId(url)) return { ok: false, reason: 'invalid_permalink' };

  for (const key of new Set([...url.searchParams.keys()].filter(key => key.toLowerCase() === 'matt_tool'))) {
    url.searchParams.delete(key);
  }
  url.searchParams.set('matt_tool', trackingValue);

  if (!hasOneValidTrackingValue(url)) {
    return { ok: false, reason: 'invalid_tracking' };
  }

  return { ok: true, url: url.toString() };
}

export function buildAffiliateSearchUrl(search, trackingValue) {
  const query = typeof search === 'string' ? search.trim() : '';
  if (!query) return { ok: false, reason: 'invalid_permalink' };
  if (!validTrackingValue(trackingValue)) return { ok: false, reason: 'invalid_tracking' };

  const slug = query.replace(/\s+/g, '-').toLowerCase();
  const url = new URL(`https://listado.mercadolibre.com.ar/${encodeURIComponent(slug)}`);
  url.searchParams.set('matt_tool', trackingValue);
  return { ok: true, url: url.toString() };
}