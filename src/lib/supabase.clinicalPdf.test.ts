// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalPdfEmailRequest } from '../types';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), invoke: vi.fn(), getSession: vi.fn(), getUser: vi.fn(),
  authChange: vi.fn(), unsubscribe: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: mocks.rpc, functions: { invoke: mocks.invoke },
    auth: { getSession: mocks.getSession, getUser: mocks.getUser, onAuthStateChange: mocks.authChange },
  }),
}));

import { ClinicalPdfSendError, fetchClinicalPdfQuota, fetchClinicalPdfSendStatus, sendClinicalPdfEmail } from './supabase';

const quota = { plan: 'free', limit: 2, used: 1, remaining: 1, window: 'month',
  resetAt: '2026-12-01T03:00:00Z', timezone: 'America/Argentina/Buenos_Aires' };
const body: ClinicalPdfEmailRequest = {
  pet_id: '00000000-0000-4000-8000-000000000002',
  requestId: '00000000-0000-4000-8000-000000000001', email: 'vet@example.test',
  fileName: 'informe.pdf', pdfBytes: [37, 80, 68, 70, 45], petName: 'Luna', reportTitle: 'Historial',
};

const session = { access_token: 'jwt-cuenta-original', user: { id: 'cuenta-original' } };
const send = () => sendClinicalPdfEmail(body, 'cuenta-original', () => {});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session }, error: null });
  mocks.getUser.mockResolvedValue({ data: { user: session.user }, error: null });
  mocks.authChange.mockReturnValue({ data: { subscription: { unsubscribe: mocks.unsubscribe } } });
});
afterEach(() => vi.restoreAllMocks());

describe('cliente central PDF', () => {
  it('consulta solo RPC propio sin userId ni plan del cliente', async () => {
    mocks.rpc.mockResolvedValue({ data: quota, error: null });
    expect(await fetchClinicalPdfQuota()).toEqual(quota);
    expect(mocks.rpc).toHaveBeenCalledWith('get_clinical_pdf_quota');
  });

  it('RPC ausente no se convierte en cupo vacio o disponible', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    await expect(fetchClinicalPdfQuota()).rejects.toThrow('069');
  });

  it.each([null, {}, { ...quota, remaining: 10 }, { ...quota, timezone: 'invalida' }])(
    'rechaza contrato de cupo malformado %s', async data => {
      mocks.rpc.mockResolvedValue({ data, error: null });
      await expect(fetchClinicalPdfQuota()).rejects.toThrow('cupo PDF valido');
    },
  );

  it('fija el JWT verificado antes del transporte y notifica cambio de cupo', async () => {
    const changed = vi.fn();
    window.addEventListener('clinical-pdf-quota-changed', changed);
    try {
      mocks.invoke.mockResolvedValue({ data: { success: true, quota }, error: null });
      expect(await send()).toEqual(quota);
      expect(mocks.getUser).toHaveBeenCalledWith(session.access_token);
      expect(mocks.invoke).toHaveBeenCalledWith('send-clinical-pdf', {
        body, headers: { Authorization: `Bearer ${session.access_token}` }, signal: expect.any(AbortSignal),
      });
      expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
      expect(changed).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('clinical-pdf-quota-changed', changed);
    }
  });

  it('propaga mensaje y codigo HTTP sin fabricar exito', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: {
      context: new Response(JSON.stringify({ error: 'Cupo agotado', code: 'quota_exceeded' }), { status: 429 }),
    } });
    const result = send();
    await expect(result).rejects.toBeInstanceOf(ClinicalPdfSendError);
    await expect(result).rejects.toMatchObject({ message: 'Cupo agotado', code: 'quota_exceeded' });
  });

  it('respuesta success sin cupo valido se informa como no confirmada', async () => {
    mocks.invoke.mockResolvedValue({ data: { success: true }, error: null });
    await expect(send()).rejects.toThrow('cupo PDF valido');
  });

  it('rechaza identidad diferente antes de obtener transporte', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { ...session, user: { id: 'otra' } } }, error: null });
    await expect(send()).rejects.toThrow('sesion cambio');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('cambio de cuenta mientras se valida el token cancela antes de enviar', async () => {
    mocks.getUser.mockImplementation(async () => {
      mocks.getSession.mockResolvedValue({ data: { session: { ...session, user: { id: 'otra' } } }, error: null });
      return { data: { user: session.user }, error: null };
    });
    await expect(send()).rejects.toThrow('antes del transporte');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('el guard del componente se ejecuta despues de validar sesion y antes de invoke', async () => {
    await expect(sendClinicalPdfEmail(body, 'cuenta-original', () => {
      throw new Error('Sesion del componente invalidada');
    })).rejects.toThrow('invalidada');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('cambio de cuenta durante preparacion del SDK aborta el transporte con JWT original', async () => {
    mocks.invoke.mockImplementation(async (_name, options) => {
      const callback = mocks.authChange.mock.calls[0][0];
      callback('SIGNED_IN', { user: { id: 'otra' } });
      expect(options.headers.Authorization).toBe(`Bearer ${session.access_token}`);
      expect(options.signal.aborted).toBe(true);
      return { data: null, error: new Error('Transporte abortado') };
    });
    await expect(send()).rejects.toThrow();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('consulta recuperacion solo para UUID propio con JWT fijo y sin reenviar', async () => {
    const setHeader = vi.fn().mockResolvedValue({
      data: { requestId: body.requestId, status: 'uncertain' }, error: null,
    });
    mocks.rpc.mockReturnValue({ setHeader });
    expect(await fetchClinicalPdfSendStatus(body.requestId, 'cuenta-original')).toEqual({
      requestId: body.requestId, status: 'uncertain',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('get_clinical_pdf_send_status', { p_request: body.requestId });
    expect(setHeader).toHaveBeenCalledWith('Authorization', `Bearer ${session.access_token}`);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
