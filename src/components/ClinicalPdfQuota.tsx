import { useCallback, useEffect, useState } from 'react';
import { useAppState } from '../context/AppStateContext';
import { fetchClinicalPdfQuota, fetchPendingClinicalPdfSends, supabase } from '../lib/supabase';
import type { ClinicalPdfQuota as Quota, ClinicalPdfSendStatus } from '../types';

export function ClinicalPdfQuota() {
  const { user, subscription } = useAppState();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ userId: string; quota?: Quota; pending?: ClinicalPdfSendStatus[]; error?: string } | null>(null);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(debounce);
      debounce = setTimeout(refresh, 200);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key?.startsWith('aipetfriendly.pdf-operation:')) schedule();
    };
    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange(() => {
      setResult(null);
      schedule();
    });
    window.addEventListener('clinical-pdf-quota-changed', schedule);
    window.addEventListener('focus', schedule);
    window.addEventListener('storage', onStorage);
    return () => {
      clearTimeout(debounce);
      authListener.unsubscribe();
      window.removeEventListener('clinical-pdf-quota-changed', schedule);
      window.removeEventListener('focus', schedule);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh]);

  useEffect(() => {
    if (!user || user.isGuest) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setResult(null);
    Promise.all([fetchClinicalPdfQuota(), fetchPendingClinicalPdfSends()]).then(([quota, pending]) => {
      if (!active) return;
      setResult({ userId: user.id, quota, pending });
      const deadlines = [quota.resetAt, user.subscription?.expiresAt, user.subscription?.graceUntil]
        .map(value => value ? Date.parse(value) : NaN)
        .filter(value => Number.isFinite(value) && value > Date.now());
      const next = Math.min(...deadlines);
      if (Number.isFinite(next)) {
        timer = setTimeout(refresh, Math.min(2147483647, Math.max(1000, next - Date.now() + 100)));
      }
    }).catch(error => {
      if (active) setResult({ userId: user.id, error: error instanceof Error ? error.message : 'No se pudo consultar el cupo PDF.' });
    });
    return () => { active = false; clearTimeout(timer); };
  }, [user, subscription.accessState, revision, refresh]);

  const current = result?.userId === user?.id ? result : null;
  return (
    <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600" aria-live="polite">
      <p>Descarga PDF gratuita para todas las cuentas. No consume envios.</p>
      {!user || user.isGuest ? <p>Crea una cuenta para descargar y enviar informes.</p>
        : current?.error ? <p role="alert">{current.error} <button type="button" onClick={refresh} className="underline">Reintentar</button></p>
        : current?.quota ? <>
          <p>Envios disponibles: {current.quota.remaining} de {current.quota.limit} por {current.quota.window === 'day' ? 'dia' : 'mes'} calendario ({current.quota.plan === 'premium' ? 'Premium' : 'Free'}).</p>
          <p>Usados o reservados: {current.quota.used}. Se renueva: {new Date(current.quota.resetAt).toLocaleString('es-AR', { timeZone: current.quota.timezone })} (Buenos Aires).</p>
          <p className="text-xs">Cupo compartido entre todos los informes. Los envios sin confirmar conservan su reserva.</p>
          {current.pending?.map(operation => (
            <p key={operation.requestId} className="break-all text-xs">
              Operacion {operation.requestId}: {operation.status}. Requiere confirmacion o conciliacion con soporte; no se reenvia automaticamente.
            </p>
          ))}
          <button type="button" onClick={refresh} className="underline">Consultar estado y cupo</button>
        </> : <p>Consultando cupo real de envios...</p>}
    </div>
  );
}
