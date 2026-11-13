// Pruebas de la politica de validacion de send-clinical-pdf
// (supabase/functions/_shared/clinicalPdfPolicy.mjs).
//
// NOTA: la autenticacion por JWT, el user_id ajeno en payload (que la funcion
// directamente ignora: la identidad sale solo de auth.getUser) y los errores
// de Resend se resuelven en index.ts (Deno) y quedan documentados alli; estas
// pruebas cubren la politica compartida que decide validez de payload, rutas
// de Storage y limite de envios. No sustituyen pruebas reales del despliegue.
import { describe, expect, it } from 'vitest';
import {
  CLINICAL_PDF_LIMITS,
  buildClinicalPdfStoragePath,
  countRecentSends,
  escapeHtml,
  looksLikePdf,
  sanitizePdfFileName,
  validateClinicalPdfRequest,
  validateRecipientEmail,
  clinicalDownloadAccessError,
  clinicalSendWindowKey,
  clinicalSendWindowResetIso,
  resolveClinicalSendPlan,
  validateRequestId,
} from '../supabase/functions/_shared/clinicalPdfPolicy.mjs';

const NOW = Date.UTC(2026, 4, 15, 12, 0, 0);
const USER_ID = '00000000-0000-4000-8000-000000000001';
const UUID = '11111111-2222-4333-8444-555555555555';

// Un "PDF" minimo valido para la politica: firma %PDF- + relleno > 1 KB.
const pdfBytes = (size = 2048) => {
  const bytes = new Array(size).fill(0x20);
  const header = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  header.forEach((b, i) => { bytes[i] = b; });
  return bytes;
};

const validPayload = (overrides = {}) => ({
  email: 'veterinaria@example.test',
  fileName: 'historial-luna.pdf',
  pdfBytes: pdfBytes(),
  petName: 'Luna',
  reportTitle: 'Historial Clinico',
  ...overrides,
});

describe('validateClinicalPdfRequest - payload valido', () => {
  it('acepta un PDF real con destinatario unico', () => {
    const result = validateClinicalPdfRequest(validPayload());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe('veterinaria@example.test');
      expect(result.value.fileName).toBe('historial-luna.pdf');
      expect(result.value.subject).toContain('Luna');
    }
  });

  it('normaliza el destinatario a minusculas', () => {
    const result = validateClinicalPdfRequest(validPayload({ email: 'Vete@Example.TEST' }));
    expect(result.ok && result.value.email).toBe('vete@example.test');
  });
});

describe('destinatario manipulado', () => {
  it('rechaza listas, inyeccion de headers y formatos invalidos', () => {
    for (const email of [
      'a@b.c,otro@b.c',
      'a@b.c;otro@b.c',
      "a@b.c\r\nBcc: spam@evil.test",
      'sin-arroba',
      '',
      null,
      123,
      `x@${'a'.repeat(260)}.com`,
      '<script>@evil.test',
    ]) {
      const result = validateClinicalPdfRequest(validPayload({ email }));
      expect(result.ok, `email aceptado indebidamente: ${String(email)}`).toBe(false);
      if (!result.ok) expect(result.status).toBe(400);
    }
  });

  it('validateRecipientEmail acepta solo un email simple', () => {
    expect(validateRecipientEmail('tutor@example.test')).toBe('tutor@example.test');
    expect(validateRecipientEmail('a b@c.d')).toBe(null);
  });
});

describe('validacion de archivo', () => {
  it('rechaza archivos demasiado grandes (413)', () => {
    const result = validateClinicalPdfRequest(validPayload({ pdfBytes: pdfBytes(CLINICAL_PDF_LIMITS.maxBytes + 1) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(413);
  });

  it('rechaza archivos vacios o demasiado chicos', () => {
    for (const bytes of [[], pdfBytes(10), null, 'no-bytes', 12345]) {
      const result = validateClinicalPdfRequest(validPayload({ pdfBytes: bytes }));
      expect(result.ok).toBe(false);
    }
  });

  it('no confia en MIME/extension: exige la firma %PDF- real', () => {
    // bytes suficientes pero sin firma de PDF (ej: un PNG renombrado a .pdf)
    const fake = new Array(4096).fill(0x89);
    const result = validateClinicalPdfRequest(validPayload({ pdfBytes: fake, fileName: 'malicioso.pdf' }));
    expect(result.ok).toBe(false);
  });

  it('looksLikePdf valida la firma en arrays y Uint8Array', () => {
    expect(looksLikePdf(pdfBytes())).toBe(true);
    expect(looksLikePdf(Uint8Array.from(pdfBytes()))).toBe(true);
    expect(looksLikePdf([0x25, 0x50])).toBe(false);
    expect(looksLikePdf(null)).toBe(false);
  });

  it('sanea nombres de archivo: sin rutas, sin caracteres raros, .pdf forzado', () => {
    expect(sanitizePdfFileName('historial luna.pdf')).toBe('historial_luna.pdf');
    expect(sanitizePdfFileName('../../etc/passwd')).toBe('passwd.pdf');
    expect(sanitizePdfFileName('..\\..\\secreto.pdf')).toBe('secreto.pdf');
    expect(sanitizePdfFileName('<img src=x>.pdf')).toBe('img_src_x.pdf');
    expect(sanitizePdfFileName('')).toBe(null);
    expect(sanitizePdfFileName('///')).toBe(null);
    expect((sanitizePdfFileName('x'.repeat(300)) ?? '').length).toBeLessThanOrEqual(CLINICAL_PDF_LIMITS.maxFileNameLength + 4);
  });

  it('escapa petName/reportTitle (inyeccion HTML en el correo)', () => {
    const result = validateClinicalPdfRequest(validPayload({ petName: '<img src=x onerror=alert(1)>' }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.petNameHtml).not.toContain('<img');
      expect(result.value.petNameHtml).toContain('&lt;img');
    }
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });
});

describe('rutas de Storage', () => {
  it('siempre bajo el prefijo del userId del JWT', () => {
    const path = buildClinicalPdfStoragePath(USER_ID, UUID, 'historial-luna.pdf');
    expect(path).toBe(`${USER_ID}/${UUID}_historial-luna.pdf`);
  });

  it('rechaza identificadores o nombres no confiables (ruta de otro usuario imposible)', () => {
    // el "userId" no viene del payload; pero si algo raro llegara, falla cerrado
    expect(buildClinicalPdfStoragePath('../otro-usuario', UUID, 'a.pdf')).toBe(null);
    expect(buildClinicalPdfStoragePath(USER_ID, 'no-un-uuid', 'a.pdf')).toBe(null);
    expect(buildClinicalPdfStoragePath(USER_ID, UUID, '../ajeno.pdf')).toBe(null);
    expect(buildClinicalPdfStoragePath(USER_ID, UUID, 'sub/dir.pdf')).toBe(null);
    expect(buildClinicalPdfStoragePath(null, UUID, 'a.pdf')).toBe(null);
  });
});

describe('limite de envios (anti repeticion/abuso)', () => {
  const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

  it('cuenta solo los envios dentro de la ventana de 24 h', () => {
    const objects = [
      { created_at: iso(1000) },
      { created_at: iso(60 * 60 * 1000) },
      { created_at: iso(25 * 60 * 60 * 1000) }, // fuera de ventana
    ];
    expect(countRecentSends(objects, NOW)).toBe(2);
  });

  it('el backstop tecnico permite 5 + 5 Premium al cruzar medianoche', () => {
    expect(CLINICAL_PDF_LIMITS.maxSendsPerWindow).toBe(10);
    const objects = Array.from({ length: 10 }, (_, i) => ({ created_at: iso((i + 1) * 1000) }));
    expect(countRecentSends(objects, NOW)).toBeGreaterThanOrEqual(CLINICAL_PDF_LIMITS.maxSendsPerWindow);
  });

  describe('politica comercial 5.3.1', () => {
    it('descarga local gratuita para Free y Premium; guest requiere cuenta', () => {
      expect(clinicalDownloadAccessError({ isGuest: false, plan: 'free' })).toBe(null);
      expect(clinicalDownloadAccessError({ isGuest: false, plan: 'premium' })).toBe(null);
      expect(clinicalDownloadAccessError({ isGuest: true })).toBeTruthy();
      expect(clinicalDownloadAccessError(null)).toBeTruthy();
    });

    it('ventanas calendario Buenos Aires: medianoche, fin de mes/anio y bisiesto', () => {
      for (const [instant, plan, key, reset] of [
        ['2026-06-01T02:59:59Z', 'free', '2026-05', '2026-06-01T03:00:00.000Z'],
        ['2026-06-01T03:00:00Z', 'free', '2026-06', '2026-07-01T03:00:00.000Z'],
        ['2027-01-01T02:59:59Z', 'premium', '2026-12-31', '2027-01-01T03:00:00.000Z'],
        ['2027-01-01T03:00:00Z', 'premium', '2027-01-01', '2027-01-02T03:00:00.000Z'],
        ['2028-02-29T15:00:00Z', 'premium', '2028-02-29', '2028-03-01T03:00:00.000Z'],
      ]) {
        expect(clinicalSendWindowKey(plan, Date.parse(instant))).toBe(key);
        expect(clinicalSendWindowResetIso(plan, Date.parse(instant))).toBe(reset);
      }
    });

    it('resuelve Free, Premium, grace y canceled_pending desde filas confiables', () => {
      const profile = { access_mode: 'premium' };
      const expired = new Date(NOW - 1000).toISOString();
      const future = new Date(NOW + 1000).toISOString();
      const subscription = { plan: 'premium', is_active: true, expires_at: future };
      expect(resolveClinicalSendPlan(profile, subscription, NOW)).toBe('premium');
      expect(resolveClinicalSendPlan(profile, { ...subscription, cancel_requested_at: expired }, NOW)).toBe('premium');
      expect(resolveClinicalSendPlan(profile, { ...subscription, is_active: false, expires_at: expired, grace_until: future }, NOW)).toBe('premium');
      expect(resolveClinicalSendPlan(profile, { ...subscription, expires_at: expired, grace_until: future, cancel_requested_at: expired }, NOW)).toBe('free');
      expect(resolveClinicalSendPlan(profile, { ...subscription, expires_at: expired, grace_until: expired }, NOW)).toBe('free');
      expect(resolveClinicalSendPlan({ access_mode: 'free' }, subscription, NOW)).toBe('free');
      expect(resolveClinicalSendPlan({ access_mode: 'guest' }, subscription, NOW)).toBe('guest');
      expect(resolveClinicalSendPlan(null, subscription, NOW)).toBe('guest');
      expect(resolveClinicalSendPlan(profile, null, NOW)).toBe('premium');
    });

    it('requiere UUID idempotente y rechaza bytes truncados o fuera de rango', () => {
      expect(validateRequestId(UUID.toUpperCase())).toBe(UUID);
      for (const value of [null, '', '../x', 123]) expect(validateRequestId(value)).toBe(null);
      for (const value of [-1, 256, 1.5, '32', null]) {
        const bytes = pdfBytes();
        bytes[100] = value;
        expect(validateClinicalPdfRequest(validPayload({ pdfBytes: bytes })).ok).toBe(false);
      }
    });
  });

  it('entradas invalidas cuentan como recientes (falla cerrado contra abuso)', () => {
    expect(countRecentSends([{ created_at: 'basura' }, {}], NOW)).toBe(2);
    expect(countRecentSends(null, NOW)).toBe(0);
  });
});
