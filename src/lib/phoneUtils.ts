export interface CountryDialOption {
  code: string;
  label: string;
}

export const COUNTRY_DIAL_OPTIONS: CountryDialOption[] = [
  { code: '+54', label: 'AR (+54)' },
  { code: '+598', label: 'UY (+598)' },
  { code: '+56', label: 'CL (+56)' },
  { code: '+595', label: 'PY (+595)' },
  { code: '+591', label: 'BO (+591)' },
  { code: '+51', label: 'PE (+51)' },
  { code: '+52', label: 'MX (+52)' },
  { code: '+55', label: 'BR (+55)' },
  { code: '+34', label: 'ES (+34)' },
  { code: '+1', label: 'US/CA (+1)' },
];

const LOCALE_COUNTRY_TO_DIAL: Record<string, string> = {
  AR: '+54',
  UY: '+598',
  CL: '+56',
  PY: '+595',
  BO: '+591',
  PE: '+51',
  MX: '+52',
  BR: '+55',
  ES: '+34',
  US: '+1',
  CA: '+1',
};

const TIMEZONE_TO_DIAL: Array<{ match: string; code: string }> = [
  { match: 'Argentina', code: '+54' },
  { match: 'Montevideo', code: '+598' },
  { match: 'Santiago', code: '+56' },
  { match: 'Asuncion', code: '+595' },
  { match: 'La_Paz', code: '+591' },
  { match: 'Lima', code: '+51' },
  { match: 'Mexico', code: '+52' },
  { match: 'Sao_Paulo', code: '+55' },
  { match: 'Madrid', code: '+34' },
  { match: 'New_York', code: '+1' },
  { match: 'Chicago', code: '+1' },
  { match: 'Los_Angeles', code: '+1' },
  { match: 'Toronto', code: '+1' },
  { match: 'Vancouver', code: '+1' },
];

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function sanitizePhoneLocalInput(value: string): string {
  return onlyDigits(value);
}

export function isValidE164Phone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

export function buildE164Phone(countryCode: string, localNumber: string): string {
  const prefix = (countryCode || '+54').trim();
  const local = sanitizePhoneLocalInput(localNumber).replace(/^0+/, '');
  if (!local) {
    return '';
  }

  const normalizedPrefix = prefix.startsWith('+') ? prefix : `+${onlyDigits(prefix)}`;
  return `${normalizedPrefix}${local}`;
}

export function splitPhoneByCountryCode(phone: string | undefined | null): {
  countryCode: string;
  localNumber: string;
} {
  const fallback = { countryCode: '+54', localNumber: '' };
  if (!phone || typeof phone !== 'string') {
    return fallback;
  }

  const trimmed = phone.trim();
  if (!trimmed.startsWith('+')) {
    return {
      countryCode: fallback.countryCode,
      localNumber: sanitizePhoneLocalInput(trimmed),
    };
  }

  const orderedCodes = COUNTRY_DIAL_OPTIONS
    .map((item) => item.code)
    .sort((a, b) => b.length - a.length);

  const matchedCode = orderedCodes.find((code) => trimmed.startsWith(code));
  if (!matchedCode) {
    return {
      countryCode: fallback.countryCode,
      localNumber: sanitizePhoneLocalInput(trimmed.replace(/^\+/, '')),
    };
  }

  return {
    countryCode: matchedCode,
    localNumber: sanitizePhoneLocalInput(trimmed.slice(matchedCode.length)),
  };
}

export function detectDefaultCountryDialCode(): string {
  const fallback = '+54';

  if (typeof window === 'undefined') {
    return fallback;
  }

  const locale = String(window.navigator.language || '').toUpperCase();
  const localeCountry = locale.includes('-') ? locale.split('-')[1] : '';
  if (localeCountry && LOCALE_COUNTRY_TO_DIAL[localeCountry]) {
    return LOCALE_COUNTRY_TO_DIAL[localeCountry];
  }

  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const matched = TIMEZONE_TO_DIAL.find((item) => timezone.includes(item.match));
    if (matched) {
      return matched.code;
    }
  } catch {
    // noop
  }

  return fallback;
}

export function getPhoneLocalPlaceholder(countryCode: string): string {
  switch (countryCode) {
    case '+54':
      return 'Ej: 91122334455';
    case '+598':
      return 'Ej: 91234567';
    case '+56':
      return 'Ej: 912345678';
    case '+52':
      return 'Ej: 5512345678';
    case '+34':
      return 'Ej: 612345678';
    case '+1':
      return 'Ej: 4155550123';
    default:
      return 'Numero sin 0 ni +';
  }
}

export function getPhoneInputHint(countryCode: string): string {
  switch (countryCode) {
    case '+54':
      return 'Argentina: ingresa el celular sin 0 ni 15. Ej final: +549...';
    case '+598':
      return 'Uruguay: ingresa el movil sin 0 inicial.';
    case '+56':
      return 'Chile: ingresa el movil sin 0 inicial.';
    case '+52':
      return 'Mexico: ingresa 10 digitos de celular, sin + ni espacios.';
    case '+34':
      return 'Espana: ingresa el movil nacional sin prefijo internacional.';
    case '+1':
      return 'EEUU/Canada: ingresa area code + numero, solo digitos.';
    default:
      return 'Ingresa solo digitos, sin + ni 0 inicial.';
  }
}
