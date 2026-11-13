import { useCallback, useRef, useState } from 'react';
import { useAppState, useSessionGuard } from '../context/AppStateContext';
import { ClinicalPdfSendError, fetchClinicalPdfSendStatus, sendClinicalPdfEmail } from '../lib/supabase';
import { validateRequestId } from '../lib/clinicalPdfPolicy.mjs';

export function useClinicalPdfEmail() {
  const { user } = useAppState();
  const assertCurrentSession = useSessionGuard(user?.id);
  const busy = useRef(false);
  const [isSendingPdf, setIsSendingPdf] = useState(false);

  const sendReport = useCallback(async (
    email: string,
    reportKey: string,
    petName: string,
    reportTitle: string,
    generate: () => Promise<{ fileName: string; blob: Blob }>,
    petId: string,
  ) => {
    assertCurrentSession();
    if (!user || user.isGuest) throw new Error('Crea una cuenta para enviar informes por email.');
    if (busy.current) throw new Error('Ya hay un envio de PDF en curso.');
    if (!navigator.locks) throw new Error('Este navegador no permite recuperar envios PDF de forma segura. Usa un navegador actualizado con HTTPS.');
    const ownerId = user.id;
    const key = `aipetfriendly.pdf-operation:${encodeURIComponent(ownerId)}:${encodeURIComponent(reportKey)}`;
    busy.current = true;
    setIsSendingPdf(true);
    try {
      // Serializa creacion/recuperacion entre componentes y pestañas. No se
      // encola: otra pulsacion nunca se transforma sola en un nuevo envio.
      await navigator.locks.request(key, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Esta operacion PDF esta en curso en otra ventana.');
        assertCurrentSession();
        let requestId = window.localStorage.getItem(key);
        if (requestId) {
          if (!validateRequestId(requestId)) throw new Error('La referencia PDF guardada es invalida. Contacta soporte; no se genero otro envio.');
          const previous = await fetchClinicalPdfSendStatus(requestId, ownerId);
          assertCurrentSession();
          if (previous.status === 'sent') {
            window.localStorage.removeItem(key);
            return;
          }
          if (previous.status === 'failed') {
            window.localStorage.removeItem(key);
            throw new Error('El intento anterior fue resuelto sin envio. Podes iniciar uno nuevo.');
          }
          if (previous.status !== 'not_found') {
            throw new Error(`Operacion ${requestId}: ${previous.status}. No se reenviara. Consulta su estado en los cupos y comunica este identificador a soporte para conciliar.`);
          }
        } else {
          requestId = crypto.randomUUID();
          // Solo UUID, separado por cuenta/informe. Nunca PDF, JWT, email
          // ni contenido clinico. Sin almacenamiento no se permite enviar.
          window.localStorage.setItem(key, requestId);
        }
        const pdf = await generate();
        const pdfBytes = Array.from(new Uint8Array(await pdf.blob.arrayBuffer()));
        assertCurrentSession();
        try {
          await sendClinicalPdfEmail({
            requestId, pet_id: petId, email, fileName: pdf.fileName, pdfBytes, petName, reportTitle,
          }, ownerId, assertCurrentSession);
          window.localStorage.removeItem(key);
          assertCurrentSession();
        } catch (error) {
          if (error instanceof ClinicalPdfSendError
            && ['delivery_failed', 'failed', 'quota_exceeded', 'rate_limited'].includes(error.code ?? '')) {
            window.localStorage.removeItem(key);
          }
          throw error;
        }
      });
    } finally {
      busy.current = false;
      setIsSendingPdf(false);
      window.dispatchEvent(new Event('clinical-pdf-quota-changed'));
    }
  }, [user, assertCurrentSession]);

  return { sendReport, isSendingPdf };
}
