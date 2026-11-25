// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Pet } from '../types';

const model = vi.hoisted(() => ({
  pets: [] as Pet[],
  linkedCode: null as string | null,
  getMessages: vi.fn(),
  getTagRequest: vi.fn(),
  getLinkedTagCode: vi.fn(),
  linkTagCode: vi.fn(),
  user: { id: 'owner-a', email: 'a@example.invalid', isGuest: false },
}));
vi.mock('../context/AppStateContext', () => ({ useAppState: () => ({
  pets: model.pets, selectedPetId: model.pets[0]?.id ?? null, user: model.user,
  subscription: {
    isPremiumUser: false, accessState: 'free', activePetSupport: false, activePetId: null,
    activePetChangedAt: null, needsActivePetSelection: false, activePetCooldownUntil: null,
    isPetEditable: () => true,
  },
  setActiveTab: vi.fn(), setSelectedPetId: vi.fn(),
}) }));
vi.mock('../hooks/usePets', () => ({ usePets: () => ({
  pets: model.pets, selectedPetId: model.pets[0]?.id ?? null, canAddPet: true, freePetLimit: 1,
  addPet: vi.fn(), selectPet: vi.fn(), removePet: vi.fn(), updatePet: vi.fn(),
}) }));
vi.mock('../hooks/useClinical', () => ({ useClinical: () => ({
  timeline: [], addClinicalNote: vi.fn(), generateClinicalPdf: vi.fn(), sendClinicalPdfByEmail: vi.fn(),
}) }));
vi.mock('../hooks/usePreventive', () => ({ usePreventive: () => ({
  preventiveTasks: [], addPreventiveTask: vi.fn(), toggleTask: vi.fn(),
  rescheduleTaskTo: vi.fn(), postponeTask: vi.fn(), discardTaskReminder: vi.fn(),
}) }));
vi.mock('../hooks/usePetReports', () => ({ usePetReports: () => ({
  healthBookletEntries: [], lastVaccineSummary: {}, lastDewormingSummary: {},
}) }));
vi.mock('../hooks/usePetIdentification', () => ({ usePetIdentification: () => ({
  getMessages: model.getMessages, markMessageRead: vi.fn(), getTagRequest: model.getTagRequest,
  generatePosterPdf: vi.fn(), generatePosterImage: vi.fn(),
  getLinkedTagCode: model.getLinkedTagCode, linkTagCode: model.linkTagCode, unlinkTagCode: vi.fn(),
}) }));
vi.mock('../lib/mobileAds', () => ({ isNativeAndroidApp: () => false }));
vi.mock('./PetFoodSection', () => ({ PetFoodSection: () => null }));
vi.mock('./BlogTeaser', () => ({ BlogTeaser: () => null }));
vi.mock('./ClinicalPdfQuota', () => ({ ClinicalPdfQuota: () => null }));

import { PetsSection } from './PetsSection';
import { CHAPITA_QR_PRODUCT } from '../data/ownProducts';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  model.linkedCode = null;
  model.getMessages.mockResolvedValue([]);
  model.getTagRequest.mockResolvedValue(null);
  model.getLinkedTagCode.mockImplementation(async () => model.linkedCode);
  model.pets = [{
    id: 'pet-1', userId: model.user.id, name: 'Luna', breed: 'Mestiza', species: 'dog',
    sex: 'female', birthDate: '2022-01-10', ageYears: 4, ageMonths: 9, weightKg: 12,
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }];
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function openIdentification() {
  render(<PetsSection />);
  fireEvent.click(screen.getByRole('button', { name: /Luna/ }));
  fireEvent.click(screen.getByRole('button', { name: /Identificacion/ }));
}

describe('Promocion de la chapita QR en Identificacion', () => {
  it('sin chapita vinculada muestra la tarjeta entre la chapita y los mensajes, y abre Mercado Libre', async () => {
    openIdentification();

    const buy = await screen.findByRole('link', { name: /Comprar chapita QR/ });
    expect(buy.getAttribute('href')).toBe(CHAPITA_QR_PRODUCT.purchaseUrl);
    expect(buy.getAttribute('target')).toBe('_blank');
    expect(buy.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText('¿Todavía no tenés la chapita QR?')).toBeTruthy();

    const collar = screen.getByRole('heading', { name: 'Chapita para el collar' });
    const messages = screen.getByRole('heading', { name: 'Mensajes recibidos' });
    expect(collar.compareDocumentPosition(buy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(buy.compareDocumentPosition(messages) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: /Escanear QR/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vincular' })).toBeTruthy();
  });

  it('con chapita vinculada oculta la promocion y conserva la desvinculacion', async () => {
    model.linkedCode = 'A1B2C3D4';
    openIdentification();

    await screen.findByText('A1B2C3D4');
    expect(screen.queryByRole('link', { name: /Comprar chapita QR/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Desvincular chapita' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Mensajes recibidos' })).toBeTruthy();
  });

  it('no muestra la promocion mientras se consulta si hay chapita vinculada', async () => {
    model.getLinkedTagCode.mockReturnValue(new Promise(() => {}));
    openIdentification();

    await waitFor(() => expect(model.getLinkedTagCode).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /Comprar chapita QR/ })).toBeNull();
  });
});
