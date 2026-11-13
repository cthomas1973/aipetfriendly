export {
  CLINICAL_SEND_TIMEZONE, CLINICAL_SEND_LIMITS, clinicalSendWindowKey,
  clinicalSendWindowResetIso, resolveClinicalSendPlan, validateRequestId,
  clinicalDownloadAccessError,
} from '../../../src/lib/clinicalPdfPolicy.mjs';

export const CLINICAL_PDF_LIMITS: {
  minBytes: number;
  maxBytes: number;
  maxFileNameLength: number;
  maxLabelLength: number;
  maxEmailLength: number;
  maxSendsPerWindow: number;
  windowMs: number;
};

export function escapeHtml(value: unknown): string;
export function validateRecipientEmail(email: unknown): string | null;
export function sanitizePdfFileName(fileName: unknown): string | null;
export function looksLikePdf(bytes: unknown): boolean;

export type ClinicalPdfRequestValidation =
  | {
      ok: true;
      value: {
        email: string;
        fileName: string;
        byteLength: number;
        petNameHtml: string;
        reportTitleHtml: string;
        subject: string;
      };
    }
  | { ok: false; status: number; error: string };

export function validateClinicalPdfRequest(payload: {
  email?: unknown;
  fileName?: unknown;
  pdfBytes?: unknown;
  petName?: unknown;
  reportTitle?: unknown;
}): ClinicalPdfRequestValidation;

export function buildClinicalPdfStoragePath(
  userId: unknown,
  uniqueId: unknown,
  safeFileName: unknown,
): string | null;

export function countRecentSends(
  objects: Array<{ created_at?: unknown }> | null | undefined,
  nowMs: number,
  windowMs?: number,
): number;
