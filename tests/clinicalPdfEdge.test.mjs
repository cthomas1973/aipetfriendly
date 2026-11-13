import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), getUser: vi.fn(), upload: vi.fn(), sign: vi.fn(), fetch: vi.fn(), bucket: vi.fn(),
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), pet: vi.fn(),
}));
vi.mock('https://deno.land/std@0.208.0/http/server.ts', () => ({ serve: vi.fn() }));
vi.mock('https://deno.land/std@0.208.0/encoding/base64.ts', () => ({
  encodeBase64: bytes => Buffer.from(bytes).toString('base64'),
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2.39.0', () => ({
  createClient: () => ({
    auth: { getUser: mocks.getUser }, rpc: mocks.rpc,
    from: mocks.from,
    storage: { getBucket: mocks.bucket, from: () => ({ upload: mocks.upload, createSignedUrl: mocks.sign }) },
  }),
}));

import { handleClinicalPdf } from '../supabase/functions/send-clinical-pdf/index.ts';

const USER = '00000000-0000-4000-8000-000000000001';
const REQUEST = '11111111-2222-4333-8444-555555555555';
const PET = '00000000-0000-4000-8000-000000000002';
const quota = { plan: 'free', limit: 2, used: 1, remaining: 1, window: 'month', resetAt: '2026-12-01T03:00:00Z', timezone: 'America/Argentina/Buenos_Aires' };
const payload = () => ({
  pet_id: PET,
  requestId: REQUEST, email: 'vet@example.test', fileName: 'informe.pdf', petName: 'Luna',
  pdfBytes: [...Buffer.from('%PDF-'), ...new Array(2048).fill(32)],
  user_id: 'victima', plan: 'premium',
});
const request = (body = payload()) => new Request('https://local.test', {
  method: 'POST', headers: { Authorization: 'Bearer jwt-verificado' }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('Deno', { env: { get: key => ({
    SUPABASE_URL: 'https://supabase.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only',
    RESEND_API_KEY: 'test-only',
  })[key] } });
  vi.stubGlobal('fetch', mocks.fetch);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.getUser.mockResolvedValue({ data: { user: { id: USER, email: 'owner@example.test' } }, error: null });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.pet });
  mocks.pet.mockResolvedValue({ data: { id: PET, user_id: USER }, error: null });
  mocks.rpc.mockImplementation(async name => ({ data: name === 'reserve_clinical_pdf_send'
    ? { result: 'reserved', quota } : quota, error: null }));
  mocks.upload.mockResolvedValue({ data: { path: 'private' }, error: null });
  mocks.bucket.mockResolvedValue({ data: { public: false }, error: null });
  mocks.sign.mockResolvedValue({ data: { signedUrl: 'https://private.invalid/signed' }, error: null });
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ id: 'provider-id' }), { status: 200 }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Edge PDF con reserva transaccional', () => {
  it('usa solo identidad JWT, hash normalizado, reserva antes de Storage y proveedor idempotente', async () => {
    const response = await handleClinicalPdf(request());
    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('pets');
    expect(mocks.eq).toHaveBeenCalledWith('id', PET);
    expect(mocks.pet.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0]);
    expect((await response.json()).quota).toEqual(quota);
    expect(mocks.rpc.mock.calls[0]).toEqual(['reserve_clinical_pdf_send', {
      p_user: USER, p_request: REQUEST, p_payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }]);
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.upload.mock.invocationCallOrder[0]);
    expect(mocks.fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe(`clinical-pdf/${USER}/${REQUEST}`);
    expect(mocks.rpc.mock.calls.map(call => call[1].p_status).filter(Boolean)).toEqual(['sending', 'sent']);
  });

  it.each([
    ['quota_exceeded', 429], ['rate_limited', 429], ['pending', 409],
    ['conflict', 409], ['failed', 409], ['sent', 200],
  ])('resultado %s no vuelve a subir ni enviar', async (result, status) => {
    mocks.rpc.mockResolvedValue({ data: { result, quota }, error: null });
    expect((await handleClinicalPdf(request())).status).toBe(status);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('sesion invalida, auth anonima y UUID ausente no reservan', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'invalid' } });
    expect((await handleClinicalPdf(request())).status).toBe(401);
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: USER, email: 'x@test.test', is_anonymous: true } }, error: null });
    expect((await handleClinicalPdf(request())).status).toBe(401);
    expect((await handleClinicalPdf(request({ ...payload(), requestId: null }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['ajena', { id: PET, user_id: 'otra-cuenta' }, 403],
    ['inexistente', null, 404],
  ])('mascota %s rechaza antes de reservar, subir o enviar', async (_label, data, status) => {
    mocks.pet.mockResolvedValue({ data, error: null });
    expect((await handleClinicalPdf(request())).status).toBe(status);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.bucket).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '', 'no-es-uuid'])('pet_id invalido %s falla cerrado', async pet_id => {
    expect((await handleClinicalPdf(request({ ...payload(), pet_id }))).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('error consultando propiedad no se convierte en autorizacion', async () => {
    mocks.pet.mockResolvedValue({ data: null, error: { code: 'offline' } });
    expect((await handleClinicalPdf(request())).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('falla cerrado si RPC/069 no esta disponible', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    expect((await handleClinicalPdf(request())).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('fallo de Storage libera la reserva sin llamar al proveedor', async () => {
    mocks.upload.mockResolvedValue({ error: { message: 'storage-down' } });
    expect((await handleClinicalPdf(request())).status).toBe(503);
    expect(mocks.rpc.mock.lastCall[1].p_status).toBe('failed');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('bucket publico bloquea el envio y libera reserva sin subir datos clinicos', async () => {
    mocks.bucket.mockResolvedValue({ data: { public: true }, error: null });
    expect((await handleClinicalPdf(request())).status).toBe(503);
    expect(mocks.rpc.mock.lastCall[1].p_status).toBe('failed');
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([[422, 'failed'], [429, 'failed'], [500, 'uncertain'], [408, 'uncertain'], [409, 'uncertain']])(
    'proveedor HTTP %s finaliza como %s', async (status, state) => {
      mocks.fetch.mockResolvedValue(new Response('{}', { status }));
      expect((await handleClinicalPdf(request())).status).toBe(502);
      expect(mocks.rpc.mock.lastCall[1].p_status).toBe(state);
    },
  );

  it('timeout/red conserva cupo como incierto', async () => {
    mocks.fetch.mockRejectedValue(new Error('timeout'));
    const response = await handleClinicalPdf(request());
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('delivery_uncertain');
    expect(mocks.rpc.mock.lastCall[1].p_status).toBe('uncertain');
  });

  it('fallo al confirmar tras aceptacion no devuelve exito ni libera cupo', async () => {
    mocks.rpc.mockImplementation(async (name, args) => {
      if (args.p_status === 'sent') return { data: null, error: { code: 'offline' } };
      return { data: name === 'reserve_clinical_pdf_send' ? { result: 'reserved', quota } : quota, error: null };
    });
    expect((await handleClinicalPdf(request())).status).toBe(503);
    expect(mocks.rpc.mock.lastCall[1].p_status).toBe('uncertain');
    expect(mocks.rpc.mock.lastCall[1].p_provider_id).toBe('provider-id');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('si tambien falla uncertain, registra operacion y proveedor para conciliar', async () => {
    mocks.rpc.mockImplementation(async (name, args) => {
      if (['sent', 'uncertain'].includes(args.p_status)) return { data: null, error: { code: 'offline' } };
      return { data: name === 'reserve_clinical_pdf_send' ? { result: 'reserved', quota } : quota, error: null };
    });
    expect((await handleClinicalPdf(request())).status).toBe(503);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('requiere conciliacion'), {
      userId: USER, requestId: REQUEST, providerId: 'provider-id',
    });
    expect(mocks.rpc.mock.lastCall[1].p_provider_id).toBe('provider-id');
  });
});
