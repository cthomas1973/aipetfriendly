// @vitest-environment jsdom
import React from 'react';
import { Blob as NodeBlob } from 'node:buffer';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {}, send: vi.fn(), quota: vi.fn(), report: vi.fn(), entry: vi.fn(),
  status: vi.fn(), pending: vi.fn(), authChange: vi.fn(),
}));
vi.mock('../src/context/AppStateContext', async importOriginal => ({
  ...await importOriginal(), useAppState: () => mocks.state,
}));
vi.mock('../src/lib/supabase', () => ({
  sendClinicalPdfEmail: mocks.send, fetchClinicalPdfQuota: mocks.quota,
  fetchClinicalPdfSendStatus: mocks.status, fetchPendingClinicalPdfSends: mocks.pending,
  supabase: { auth: { onAuthStateChange: mocks.authChange } },
  createClinicalEntry: mocks.entry,
  ClinicalPdfSendError: class extends Error {
    constructor(message, code) { super(message); this.code = code; }
  },
}));
vi.mock('../src/lib/reportPdf', () => ({ buildTimelineReportPdf: mocks.report }));

import { useClinical } from '../src/hooks/useClinical';
import { usePetReports } from '../src/hooks/usePetReports';
import { useClinicalPdfEmail } from '../src/hooks/useClinicalPdfEmail';
import { ClinicalPdfQuota } from '../src/components/ClinicalPdfQuota';
import { ClinicalPdfSendError } from '../src/lib/supabase';

const quota = { plan: 'free', limit: 2, used: 1, remaining: 1, window: 'month',
  resetAt: '2027-01-01T03:00:00Z', timezone: 'America/Argentina/Buenos_Aires' };
const pdf = () => ({ fileName: 'informe.pdf', blob: new NodeBlob(['%PDF-', ' '.repeat(2048)], { type: 'application/pdf' }) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('Blob', NodeBlob);
  window.localStorage.clear();
  const held = new Set();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: async (key, _options, callback) => {
      if (held.has(key)) return callback(null);
      held.add(key);
      try { return await callback({ name: key }); } finally { held.delete(key); }
    },
  } });
  mocks.state = {
    user: { id: 'cuenta-free', email: 'free@example.test', isGuest: false },
    pets: [{ id: 'pet', name: 'Luna', breed: 'Mestiza', species: 'dog', sex: 'female', ageYears: 2, ageMonths: 0, weightKg: 8 }],
    selectedPetId: 'pet', clinicalEntries: [], setClinicalEntries: vi.fn(),
    subscription: { isPremiumUser: false },
  };
  mocks.report.mockImplementation(async () => pdf());
  mocks.send.mockResolvedValue(quota);
  mocks.quota.mockResolvedValue(quota);
  mocks.status.mockImplementation(async requestId => ({ requestId, status: 'not_found' }));
  mocks.pending.mockResolvedValue([]);
  mocks.authChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('PDF local y envio autenticado', () => {
  it('Free genera los tres PDF sin invocar correo ni consultar/consumir cupo', async () => {
    const clinical = renderHook(() => useClinical());
    const reports = renderHook(() => usePetReports());
    const history = await clinical.result.current.generateClinicalPdf();
    expect(history.blob.size).toBeGreaterThan(1024);
    await reports.result.current.generateHealthBookletPdf();
    await reports.result.current.generateMedicationLogPdf();
    expect(mocks.report).toHaveBeenCalledTimes(2);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.quota).not.toHaveBeenCalled();
  });

  it('guest no descarga ni envia; luego de autenticarse dispone de PDF Free', async () => {
    mocks.state.user.isGuest = true;
    const reports = renderHook(() => usePetReports());
    await expect(reports.result.current.generateHealthBookletPdf()).rejects.toThrow('Crea una cuenta');
    await expect(reports.result.current.sendHealthBookletPdfByEmail('vet@example.test')).rejects.toThrow('Crea una cuenta');
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.state.user = { ...mocks.state.user, isGuest: false };
    reports.rerender();
    await expect(reports.result.current.generateHealthBookletPdf()).resolves.toHaveProperty('fileName');
  });

  it('Free envia los tres informes con pet_id correcto por el mismo cliente autenticado', async () => {
    const reports = renderHook(() => usePetReports());
    const clinical = renderHook(() => useClinical());
    await act(async () => { await clinical.result.current.sendClinicalPdfByEmail('vet@example.test'); });
    await act(async () => { await reports.result.current.sendHealthBookletPdfByEmail('vet@example.test'); });
    await act(async () => { await reports.result.current.sendMedicationLogPdfByEmail('vet@example.test'); });
    expect(mocks.send.mock.calls.map(([body]) => body.reportTitle)).toEqual(['Historial Clinico', 'Libreta Sanitaria', 'Control de Medicacion']);
    for (const [body] of mocks.send.mock.calls) {
      expect(body.pet_id).toBe('pet');
      expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);
      expect(body).not.toHaveProperty('plan');
      expect(body).not.toHaveProperty('user_id');
    }
  });

  it('al cambiar de mascota los tres envios usan la identidad de la nueva seleccion', async () => {
    const reports = renderHook(() => usePetReports());
    const clinical = renderHook(() => useClinical());
    mocks.state.pets = [...mocks.state.pets, { ...mocks.state.pets[0], id: 'otra-mascota', name: 'Sol' }];
    mocks.state.selectedPetId = 'otra-mascota';
    reports.rerender();
    clinical.rerender();
    await act(async () => {
      await clinical.result.current.sendClinicalPdfByEmail('vet@example.test');
      await reports.result.current.sendHealthBookletPdfByEmail('vet@example.test');
      await reports.result.current.sendMedicationLogPdfByEmail('vet@example.test');
    });
    expect(mocks.send.mock.calls).toHaveLength(3);
    for (const [body] of mocks.send.mock.calls) expect(body.pet_id).toBe('otra-mascota');
  });

  it('tras red interrumpida y remount, recupera el UUID y consulta antes de reintentar', async () => {
    const generate = vi.fn(async () => pdf());
    let email = renderHook(() => useClinicalPdfEmail());
    mocks.send.mockRejectedValueOnce(new Error('red interrumpida'));
    await act(async () => {
      await expect(email.result.current.sendReport('vet@example.test', 'pet:clinical', 'Luna', 'Historial', generate)).rejects.toThrow('red');
    });
    email.unmount();
    email = renderHook(() => useClinicalPdfEmail());
    await act(async () => { await email.result.current.sendReport('vet@example.test', 'pet:clinical', 'Luna', 'Historial', generate); });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(mocks.status).toHaveBeenCalledWith(mocks.send.mock.calls[0][0].requestId, 'cuenta-free');
    expect(mocks.send.mock.calls[0][0].requestId).toBe(mocks.send.mock.calls[1][0].requestId);
  });

  it('fallo confirmado libera intento local; el nuevo envio usa otra clave', async () => {
    const email = renderHook(() => useClinicalPdfEmail());
    mocks.send.mockRejectedValueOnce(new ClinicalPdfSendError('Rechazado', 'delivery_failed'));
    await act(async () => {
      await expect(email.result.current.sendReport('vet@example.test', 'pet', 'Luna', 'Historial', async () => pdf())).rejects.toThrow('Rechazado');
    });
    await act(async () => { await email.result.current.sendReport('vet@example.test', 'pet', 'Luna', 'Historial', async () => pdf()); });
    expect(mocks.send.mock.calls[0][0].requestId).not.toBe(mocks.send.mock.calls[1][0].requestId);
  });

  it('cambio de sesion durante generacion impide enviar datos de la cuenta anterior', async () => {
    let resolve;
    const pending = new Promise(done => { resolve = done; });
    const email = renderHook(() => useClinicalPdfEmail());
    let send;
    await act(async () => {
      send = email.result.current.sendReport('vet@example.test', 'pet', 'Luna', 'Historial', () => pending);
    });
    mocks.state.user = { id: 'otra-cuenta', email: 'other@example.test', isGuest: false };
    email.rerender();
    await act(async () => {
      resolve(pdf());
      await expect(send).rejects.toThrow('La sesion cambio');
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each(['reserved', 'sending', 'uncertain'])('recuperar %s no regenera ni reenvia, aun cambiando destinatario', async status => {
    let email = renderHook(() => useClinicalPdfEmail());
    const generate = vi.fn(async () => pdf());
    mocks.send.mockRejectedValueOnce(new Error('respuesta perdida'));
    await act(async () => {
      await expect(email.result.current.sendReport('vet@example.test', 'pet:clinical', 'Luna', 'Historial', generate)).rejects.toThrow();
    });
    const id = mocks.send.mock.calls[0][0].requestId;
    expect(localStorage.getItem('aipetfriendly.pdf-operation:cuenta-free:pet%3Aclinical')).toBe(id);
    email.unmount();
    email = renderHook(() => useClinicalPdfEmail());
    mocks.status.mockResolvedValue({ requestId: id, status });
    await act(async () => {
      await expect(email.result.current.sendReport('otro@example.test', 'pet:clinical', 'Luna', 'Historial', generate)).rejects.toThrow(id);
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('alternar informes no reemplaza la referencia pendiente original', async () => {
    const email = renderHook(() => useClinicalPdfEmail());
    mocks.send.mockRejectedValueOnce(new Error('respuesta perdida'));
    await act(async () => {
      await expect(email.result.current.sendReport('vet@example.test', 'historial', 'Luna', 'Historial', async () => pdf())).rejects.toThrow();
      await email.result.current.sendReport('vet@example.test', 'libreta', 'Luna', 'Libreta', async () => pdf());
    });
    const id = mocks.send.mock.calls[0][0].requestId;
    mocks.status.mockResolvedValue({ requestId: id, status: 'uncertain' });
    await act(async () => {
      await expect(email.result.current.sendReport('vet@example.test', 'historial', 'Luna', 'Historial', async () => pdf())).rejects.toThrow(id);
    });
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it('un sent recuperado confirma sin enviar; el siguiente envio intencional tiene otro UUID', async () => {
    const email = renderHook(() => useClinicalPdfEmail());
    mocks.send.mockRejectedValueOnce(new Error('respuesta perdida'));
    const invoke = () => email.result.current.sendReport('vet@example.test', 'pet', 'Luna', 'Historial', async () => pdf());
    await act(async () => { await expect(invoke()).rejects.toThrow(); });
    const id = mocks.send.mock.calls[0][0].requestId;
    mocks.status.mockResolvedValue({ requestId: id, status: 'sent' });
    await act(async () => { await invoke(); });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    await act(async () => { await invoke(); });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1][0].requestId).not.toBe(id);
  });

  it('un failed recuperado exige nueva accion explicita y no reenvia automaticamente', async () => {
    const email = renderHook(() => useClinicalPdfEmail());
    mocks.send.mockRejectedValueOnce(new Error('respuesta perdida'));
    const invoke = () => email.result.current.sendReport('vet@example.test', 'pet', 'Luna', 'Historial', async () => pdf());
    await act(async () => { await expect(invoke()).rejects.toThrow(); });
    const id = mocks.send.mock.calls[0][0].requestId;
    mocks.status.mockResolvedValue({ requestId: id, status: 'failed' });
    await act(async () => { await expect(invoke()).rejects.toThrow('resuelto sin envio'); });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    await act(async () => { await invoke(); });
    expect(mocks.send.mock.calls[1][0].requestId).not.toBe(id);
  });

  it('no comparte referencias entre cuentas', async () => {
    const email = renderHook(() => useClinicalPdfEmail());
    mocks.send.mockRejectedValueOnce(new Error('respuesta perdida'));
    await act(async () => {
      await expect(email.result.current.sendReport('vet@example.test', 'pet', 'Luna', 'Historial', async () => pdf())).rejects.toThrow();
    });
    const id = mocks.send.mock.calls[0][0].requestId;
    mocks.state.user = { ...mocks.state.user, id: 'otra-cuenta' };
    email.rerender();
    await act(async () => { await email.result.current.sendReport('vet@example.test', 'pet', 'Luna', 'Historial', async () => pdf()); });
    expect(mocks.send.mock.calls[1][1]).toBe('otra-cuenta');
    expect(mocks.send.mock.calls[1][0].requestId).not.toBe(id);
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it('fallo de almacenamiento bloquea antes de generar o enviar', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('almacenamiento bloqueado'); });
    const email = renderHook(() => useClinicalPdfEmail());
    const generate = vi.fn(async () => pdf());
    await act(async () => {
      await expect(email.result.current.sendReport('vet@example.test', 'pet', 'Luna', 'Historial', generate)).rejects.toThrow('almacenamiento bloqueado');
    });
    expect(generate).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('un segundo componente no encola ni crea otro UUID para una operacion activa', async () => {
    const first = renderHook(() => useClinicalPdfEmail());
    const second = renderHook(() => useClinicalPdfEmail());
    let resolve;
    let send;
    await act(async () => {
      send = first.result.current.sendReport('vet@example.test', 'pet', 'Luna', 'Historial',
        () => new Promise(done => { resolve = done; }));
      await expect(second.result.current.sendReport('vet@example.test', 'pet', 'Luna', 'Historial', async () => pdf())).rejects.toThrow('otra ventana');
    });
    await act(async () => { resolve(pdf()); await send; });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});

describe('cupo real en pantalla', () => {
  it('muestra respuesta RPC y refresca tras un envio, sin estimar desde subscription', async () => {
    render(React.createElement(ClinicalPdfQuota));
    expect(await screen.findByText(/Envios disponibles: 1 de 2 por mes calendario/)).toBeTruthy();
    mocks.quota.mockResolvedValue({ ...quota, used: 2, remaining: 0 });
    act(() => { window.dispatchEvent(new Event('clinical-pdf-quota-changed')); });
    expect(await screen.findByText(/Envios disponibles: 0 de 2/)).toBeTruthy();
  });

  it('RPC ausente muestra error, no inventa cupo disponible', async () => {
    mocks.quota.mockRejectedValue(new Error('Migracion 069 no disponible'));
    render(React.createElement(ClinicalPdfQuota));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('069'));
    expect(screen.queryByText(/Envios disponibles/)).toBe(null);
  });

  it('guest no consulta cupos y no expone el cupo de la sesion anterior', async () => {
    const view = render(React.createElement(ClinicalPdfQuota));
    await screen.findByText(/Envios disponibles/);
    mocks.state.user = { id: 'guest', isGuest: true };
    view.rerender(React.createElement(ClinicalPdfQuota));
    await waitFor(() => expect(screen.queryByText(/Envios disponibles/)).toBe(null));
    expect(mocks.quota).toHaveBeenCalledTimes(1);
  });

  it('foco y eventos repetidos se agrupan, sin polling', async () => {
    vi.useFakeTimers();
    render(React.createElement(ClinicalPdfQuota));
    await act(async () => {});
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('clinical-pdf-quota-changed'));
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.quota).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(mocks.quota).toHaveBeenCalledTimes(2);
  });

  it.each(['expiresAt', 'graceUntil'])('refresca al vencer %s aunque no cambie accessState', async field => {
    vi.useFakeTimers();
    mocks.state.user.subscription = { [field]: new Date(Date.now() + 1500).toISOString() };
    render(React.createElement(ClinicalPdfQuota));
    await act(async () => {});
    expect(mocks.quota).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1700); });
    expect(mocks.quota).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(mocks.quota).toHaveBeenCalledTimes(2);
  });

  it('cambio de sesion invalida inmediatamente y consulta pendientes sin reenviarlos', async () => {
    mocks.pending.mockResolvedValue([{ requestId: 'operacion-incierta', status: 'uncertain' }]);
    render(React.createElement(ClinicalPdfQuota));
    await screen.findByText(/operacion-incierta/);
    act(() => { mocks.authChange.mock.calls[0][0]('TOKEN_REFRESHED', {}); });
    expect(screen.queryByText(/Envios disponibles/)).toBe(null);
    await screen.findByText(/operacion-incierta/);
    expect(mocks.quota).toHaveBeenCalledTimes(2);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
