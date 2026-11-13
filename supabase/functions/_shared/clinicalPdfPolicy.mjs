// Politica de validacion para send-clinical-pdf (Etapa 5.3).
//
// Logica pura y sin dependencias para que la Edge Function (Deno) y la suite
// de vitest compartan exactamente las mismas reglas. La identidad del usuario
// NUNCA entra por payload: la funcion la obtiene del JWT verificado y esta
// politica solo recibe valores ya autenticados.
//
// Reglas:
// * Destinatario: un unico email valido (sin saltos de linea ni listas: corta
//   el header injection y el uso como relay masivo).
// * Archivo: solo PDF real (firma %PDF-), tamaño acotado, nombre saneado (sin
//   rutas, sin caracteres raros, extension .pdf forzada).
// * Contenido del correo: petName/reportTitle se recortan y escapan (HTML)
//   para impedir inyeccion de HTML/phishing en la plantilla.
// * Storage: los archivos viven bajo el prefijo del userId autenticado.
//   La migracion 069 aplica cupos y antiabuso de forma transaccional.

export {
  CLINICAL_SEND_TIMEZONE,
  CLINICAL_SEND_LIMITS,
  clinicalSendWindowKey,
  clinicalSendWindowResetIso,
  resolveClinicalSendPlan,
  validateRequestId,
  clinicalDownloadAccessError,
} from "../../../src/lib/clinicalPdfPolicy.mjs";

export const CLINICAL_PDF_LIMITS = {
  minBytes: 1024, // un PDF real de informe nunca baja de 1 KB
  maxBytes: 5 * 1024 * 1024, // 5 MB: holgado para el informe clinico generado en el cliente
  maxFileNameLength: 80,
  maxLabelLength: 80, // petName / reportTitle
  maxEmailLength: 254,
  // Paridad con 069: diez intentos (incluso fallidos) en 24 h, separado
  // del cupo comercial. Permite 5 + 5 Premium al cruzar medianoche.
  maxSendsPerWindow: 10,
  windowMs: 24 * 60 * 60 * 1000, // 24 horas
};

// ---------------------------------------------------------------------------
// Politica comercial de envios (Etapa 5.3.1)
//   Free:    2 envios por MES calendario.
//   Premium: 5 envios por DIA calendario (gracia y canceled_pending cuentan
//            como Premium mientras resolveAccessState otorgue acceso completo).
//   Guest:   sin envio por correo.
// Ventanas en America/Argentina/Buenos_Aires. La 069 calcula los limites
// con date_trunc; la fuente de verdad del cupo es SIEMPRE el servidor.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** @param {unknown} value */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Un unico destinatario valido o null. Rechaza listas, espacios y saltos de
 * linea (inyeccion de headers / multiples destinatarios).
 * @param {unknown} email
 * @returns {string | null}
 */
export function validateRecipientEmail(email) {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > CLINICAL_PDF_LIMITS.maxEmailLength) return null;
  if (/[\s,;<>]/.test(trimmed)) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

/**
 * Nombre de archivo saneado (sin rutas ni caracteres peligrosos, .pdf
 * garantizado) o null si no se puede derivar nada util.
 * @param {unknown} fileName
 * @returns {string | null}
 */
export function sanitizePdfFileName(fileName) {
  if (typeof fileName !== 'string') return null;
  // Solo el ultimo segmento: elimina cualquier intento de ruta (../, /, \).
  const lastSegment = fileName.split(/[\\/]/).pop() ?? '';
  const withoutExt = lastSegment.replace(/\.pdf$/i, '');
  const cleaned = withoutExt
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, CLINICAL_PDF_LIMITS.maxFileNameLength);
  if (!cleaned) return null;
  return `${cleaned}.pdf`;
}

/**
 * Firma real de PDF: los primeros bytes deben ser "%PDF-". No se confia en el
 * MIME type ni en la extension declarados por el cliente.
 * @param {unknown} bytes  Array de numeros (JSON) o Uint8Array.
 */
export function looksLikePdf(bytes) {
  const header = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  if (!bytes || typeof bytes.length !== 'number' || bytes.length < header.length) return false;
  for (let i = 0; i < header.length; i += 1) {
    const value = bytes[i];
    if (typeof value !== 'number' || (value & 0xff) !== header[i]) return false;
  }
  return true;
}

/** @param {unknown} value */
function sanitizeLabel(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  const bounded = text.slice(0, CLINICAL_PDF_LIMITS.maxLabelLength);
  return bounded || fallback;
}

/**
 * Valida y normaliza el payload completo. Falla cerrado.
 * @param {{ email?: unknown, fileName?: unknown, pdfBytes?: unknown, petName?: unknown, reportTitle?: unknown }} payload
 * @returns {{ ok: true, value: { email: string, fileName: string, byteLength: number, petNameHtml: string, reportTitleHtml: string, subject: string } }
 *   | { ok: false, status: number, error: string }}
 */
export function validateClinicalPdfRequest(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, status: 400, error: 'Cuerpo de la solicitud invalido.' };
  }

  const email = validateRecipientEmail(payload.email);
  if (!email) {
    return { ok: false, status: 400, error: 'Destinatario invalido: se requiere un unico email valido.' };
  }

  const fileName = sanitizePdfFileName(payload.fileName);
  if (!fileName) {
    return { ok: false, status: 400, error: 'Nombre de archivo invalido.' };
  }

  const bytes = payload.pdfBytes;
  const isByteSource = Array.isArray(bytes) || bytes instanceof Uint8Array;
  if (!isByteSource || typeof bytes.length !== 'number') {
    return { ok: false, status: 400, error: 'pdfBytes debe ser un arreglo de bytes.' };
  }
  if (bytes.length < CLINICAL_PDF_LIMITS.minBytes) {
    return { ok: false, status: 400, error: 'El archivo esta vacio o malformado.' };
  }
  if (bytes.length > CLINICAL_PDF_LIMITS.maxBytes) {
    return { ok: false, status: 413, error: 'El PDF supera el tamaño maximo permitido (5 MB).' };
  }
  if (!bytes.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) {
    return { ok: false, status: 400, error: 'El PDF contiene bytes invalidos.' };
  }
  if (!looksLikePdf(bytes)) {
    return { ok: false, status: 400, error: 'El archivo no es un PDF valido.' };
  }

  const petName = sanitizeLabel(payload.petName, 'tu mascota');
  const reportTitle = sanitizeLabel(payload.reportTitle, 'Historial Clinico');

  return {
    ok: true,
    value: {
      email,
      fileName,
      byteLength: bytes.length,
      petNameHtml: escapeHtml(petName),
      reportTitleHtml: escapeHtml(reportTitle),
      subject: `AiPetFriendly - ${reportTitle} de ${petName}`,
    },
  };
}

/**
 * Ruta de Storage del archivo: SIEMPRE bajo el prefijo del userId autenticado
 * (del JWT). Un cliente no puede influir en el prefijo: solo aporta el nombre
 * ya saneado. Devuelve null si los datos no son confiables.
 * @param {unknown} userId  id del JWT verificado
 * @param {unknown} uniqueId  uuid generado por el servidor
 * @param {unknown} safeFileName  salida de sanitizePdfFileName
 * @returns {string | null}
 */
export function buildClinicalPdfStoragePath(userId, uniqueId, safeFileName) {
  if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)) return null;
  if (typeof uniqueId !== 'string' || !/^[0-9a-f-]{36}$/i.test(uniqueId)) return null;
  if (typeof safeFileName !== 'string' || safeFileName !== sanitizePdfFileName(safeFileName)) return null;
  return `${userId}/${uniqueId}_${safeFileName}`;
}

/**
 * Cantidad de envios dentro de la ventana, a partir del listado de objetos del
 * prefijo del usuario en Storage (campo created_at de cada objeto). Entradas
 * invalidas cuentan como recientes (falla cerrado contra el abuso).
 * @param {Array<{ created_at?: unknown }> | null | undefined} objects
 * @param {number} nowMs
 * @param {number} [windowMs]
 */
export function countRecentSends(objects, nowMs, windowMs = CLINICAL_PDF_LIMITS.windowMs) {
  if (!Array.isArray(objects)) return 0;
  let count = 0;
  for (const object of objects) {
    const createdAt = typeof object?.created_at === 'string' ? Date.parse(object.created_at) : Number.NaN;
    if (!Number.isFinite(createdAt) || nowMs - createdAt < windowMs) {
      count += 1;
    }
  }
  return count;
}
