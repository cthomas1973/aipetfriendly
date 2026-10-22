// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Pet } from '../types';

const model = vi.hoisted(() => ({
  pets: [] as Pet[],
  canUseAI: true,
  hasValidSelectedPet: true,
  sendMessage: vi.fn(),
  addPreventiveTask: vi.fn(),
  user: { id: 'guest-a11y', email: 'a11y@example.invalid', isGuest: true },
}));
vi.mock('../context/AppStateContext', () => ({ useAppState: () => ({
  pets: model.pets, selectedPetId: model.pets[0]?.id ?? null, user: model.user,
  subscription: { isPremiumUser: false }, setActiveTab: vi.fn(), setSelectedPetId: vi.fn(),
}) }));
vi.mock('../hooks/useChat', () => ({ useChat: () => ({
  messages: [], historyMessages: [], persistenceError: null,
  canUseAI: model.canUseAI, hasValidSelectedPet: model.hasValidSelectedPet,
  quota: { tier: 'guest', limit: 3, remaining: 3, premiumLimit: 100, resetLabel: '1 de noviembre' },
  sendMessage: model.sendMessage, retryMessage: vi.fn(),
  suggestedProductByMessageId: {}, vetVisitRecommendedByMessageId: {},
}) }));
vi.mock('../hooks/usePets', () => ({ usePets: () => ({
  pets: model.pets, selectedPetId: model.pets[0]?.id ?? null, canAddPet: true, freePetLimit: 1,
  addPet: vi.fn(), selectPet: vi.fn(), removePet: vi.fn(), updatePet: vi.fn(),
}) }));
vi.mock('../hooks/useClinical', () => ({ useClinical: () => ({
  timeline: [], addClinicalNote: vi.fn(), generateClinicalPdf: vi.fn(), sendClinicalPdfByEmail: vi.fn(),
}) }));
vi.mock('../hooks/usePreventive', () => ({ usePreventive: () => ({
  preventiveTasks: [], addPreventiveTask: model.addPreventiveTask, toggleTask: vi.fn(),
  rescheduleTaskTo: vi.fn(), postponeTask: vi.fn(), discardTaskReminder: vi.fn(),
}) }));
vi.mock('../hooks/usePetReports', () => ({ usePetReports: () => ({
  healthBookletEntries: [], lastVaccineSummary: {}, lastDewormingSummary: {},
}) }));
vi.mock('../hooks/usePetIdentification', () => ({ usePetIdentification: () => ({}) }));
vi.mock('../lib/mobileAds', () => ({ isNativeAndroidApp: () => false }));
vi.mock('./PetFoodSection', () => ({ PetFoodSection: () => null }));
vi.mock('./BlogTeaser', () => ({ BlogTeaser: () => null }));

import { ChatSection } from './ChatSection';
import { PetsSection } from './PetsSection';
import { AgendaSection } from './AgendaSection';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  model.canUseAI = true;
  model.hasValidSelectedPet = true;
  model.sendMessage.mockResolvedValue(undefined);
  model.pets = [{
    id: 'pet-a11y', userId: model.user.id, name: 'Luna', breed: 'Mestiza', species: 'dog',
    sex: 'female', birthDate: '2022-01-10', ageYears: 4, ageMonths: 9, weightKg: 12,
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }];
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Red no permitida en pruebas de accesibilidad'))));
});
afterEach(() => {
  cleanup();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function expectUniqueIdsAndBoundLabels(container: HTMLElement) {
  const ids = Array.from(container.querySelectorAll('[id]')).map(element => element.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const label of container.querySelectorAll('label')) {
    if (label.htmlFor) expect(document.getElementById(label.htmlFor)).not.toBeNull();
    else expect(label.querySelector('input,select,textarea')).not.toBeNull();
  }
}
function openPetForm(edit: boolean) {
  const result = render(<PetsSection />);
  if (edit) {
    fireEvent.click(screen.getByRole('button', { name: /Luna/ }));
    fireEvent.click(screen.getByRole('button', { name: /Editar mascota/ }));
  } else fireEvent.click(screen.getByRole('button', { name: 'Agregar nueva mascota' }));
  return result;
}
function openPetDetailsStep() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Nombre *' }), { target: { value: 'Luna sintetica' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Raza *' }), { target: { value: 'Mestiza' } });
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
}

describe('Nombre accesible del envio del Consultorio', () => {
  it('conserva el icono y el envio deshabilitado sin texto', () => {
    render(<ChatSection />);
    const send = screen.getByRole('button', { name: 'Enviar consulta' });
    expect(send.querySelector('svg')).not.toBeNull();
    expect(send).toHaveProperty('disabled', true);
  });
  it('conserva el handler y bloquea el envio durante una respuesta pendiente', async () => {
    let finish!: () => void;
    model.sendMessage.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<ChatSection />);
    fireEvent.change(screen.getByPlaceholderText('Escribe tu consulta...'), { target: { value: 'Pregunta sintetica' } });
    const send = screen.getByRole('button', { name: 'Enviar consulta' });
    expect(send).toHaveProperty('disabled', false);
    fireEvent.click(send);
    expect(model.sendMessage).toHaveBeenCalledExactlyOnceWith('Pregunta sintetica', 'pet-a11y', null);
    expect(send).toHaveProperty('disabled', true);
    expect(screen.getByPlaceholderText('Escribe tu consulta...')).toHaveProperty('disabled', true);
    finish();
    await waitFor(() => expect(screen.getByPlaceholderText('Escribe tu consulta...')).toHaveProperty('disabled', false));
    fireEvent.change(screen.getByPlaceholderText('Escribe tu consulta...'), { target: { value: 'Otra pregunta sintetica' } });
    expect(send).toHaveProperty('disabled', false);
  });
  it.each(['quota', 'selection'] as const)('mantiene el bloqueo por %s', reason => {
    model.canUseAI = reason !== 'quota';
    model.hasValidSelectedPet = reason !== 'selection';
    render(<ChatSection />);
    expect(screen.getByRole('button', { name: 'Enviar consulta' })).toHaveProperty('disabled', true);
  });
});

describe.each([false, true])('Etiquetas de mascotas (edicion=%s)', edit => {
  it('nombra los datos basicos y activa el selector de foto existente', () => {
    const { container } = openPetForm(edit);
    expect(screen.getByRole('textbox', { name: 'Nombre *' })).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByRole('textbox', { name: 'Raza *' })).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByRole('combobox', { name: 'Especie *' })).toBeInstanceOf(HTMLSelectElement);
    const input = screen.getByLabelText('Foto de la mascota') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: edit ? 'Cambiar foto de la mascota' : 'Agregar foto de la mascota' }));
    expect(click).toHaveBeenCalledTimes(1);
    expectUniqueIdsAndBoundLabels(container);
  });
  it('asocia fecha, peso, sexo y observaciones sin identificadores repetidos', () => {
    const { container } = openPetForm(edit);
    if (!edit) openPetDetailsStep();
    expect(screen.getByLabelText('Fecha de nacimiento *')).toHaveProperty('type', 'date');
    expect(screen.getByRole('spinbutton', { name: 'Peso (kg) *' })).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByRole('combobox', { name: 'Sexo' })).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByRole('textbox', { name: /particulares/ })).toBeInstanceOf(HTMLTextAreaElement);
    expectUniqueIdsAndBoundLabels(container);
  });
  it('nombra por separado anios y meses en la variante de edad aproximada', () => {
    const { container } = openPetForm(edit);
    if (!edit) openPetDetailsStep();
    fireEvent.click(screen.getByRole('checkbox', { name: 'No conozco la fecha exacta de nacimiento' }));
    expect(screen.getByRole('group', { name: 'Edad aproximada *' })).not.toBeNull();
    expect(screen.getByRole('spinbutton', { name: /Edad aproximada.*A\u00f1os/ })).not.toBeNull();
    expect(screen.getByRole('spinbutton', { name: /Edad aproximada.*Meses/ })).not.toBeNull();
    expectUniqueIdsAndBoundLabels(container);
  });
});

describe('Etiquetas de Agenda', () => {
  it('asocia filtro, mascota, tipo, nombre y fecha del cuidado', () => {
    const { container } = render(<AgendaSection />);
    expect(screen.getByRole('combobox', { name: 'Filtrar por mascota' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar tarea' }));
    expect(screen.getByRole('combobox', { name: 'Mascota' })).not.toBeNull();
    expect(screen.getByRole('combobox', { name: 'Tipo' })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Nombre *' })).not.toBeNull();
    expect(screen.getByLabelText('Fecha *')).toHaveProperty('type', 'date');
    expectUniqueIdsAndBoundLabels(container);
    expect(model.addPreventiveTask).not.toHaveBeenCalled();
  });
  it('nombra los controles condicionales de email y WhatsApp sin enviar avisos', () => {
    const { container } = render(<AgendaSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar tarea' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Email' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'WhatsApp' }));
    expect(screen.getByRole('textbox', { name: 'Email para notificacion' })).not.toBeNull();
    expect(screen.getByRole('combobox', { name: 'Codigo de pais para WhatsApp' })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Celular WhatsApp (con codigo pais)' })).not.toBeNull();
    expectUniqueIdsAndBoundLabels(container);
    expect(model.addPreventiveTask).not.toHaveBeenCalled();
  });
  it('asocia los campos de compra de alimento y sus grupos existentes', () => {
    const { container } = render(<AgendaSection />);
    fireEvent.click(screen.getByRole('button', { name: /Comida/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar comida' }));
    fireEvent.click(screen.getByRole('button', { name: 'Otro' }));
    expect(screen.getByRole('group', { name: 'Marca' })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Otra marca' })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Variedad (opcional)' })).not.toBeNull();
    expect(screen.getByRole('spinbutton', { name: 'Peso bolsa (kg) *' })).not.toBeNull();
    expect(screen.getByLabelText('Fecha de compra *')).toHaveProperty('type', 'date');
    expect(screen.getByRole('group', { name: 'Aplicar a mascotas' })).not.toBeNull();
    expectUniqueIdsAndBoundLabels(container);
  });
  it('no repite IDs al montar dos formularios de mascotas y dos agendas', () => {
    const { container } = render(<><PetsSection /><PetsSection /><AgendaSection /><AgendaSection /></>);
    for (const button of screen.getAllByRole('button', { name: 'Agregar nueva mascota' })) fireEvent.click(button);
    for (const button of screen.getAllByRole('button', { name: 'Agregar tarea' })) fireEvent.click(button);
    expectUniqueIdsAndBoundLabels(container);
  });
});