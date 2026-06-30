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
