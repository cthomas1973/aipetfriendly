import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { GlobalAppState } from '../context/AppStateContext';
import type { AppUser, Pet } from '../types';

const runtime = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0,
  effects: [] as Array<() => void>,
  cleanups: [] as Array<() => void>,
  state: {} as GlobalAppState,
  listener: (_event: string, _session: unknown) => {},
}));
const services = vi.hoisted(() => ({
  getUser: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), upsert: vi.fn(), updateConsent: vi.fn(),
  fetchUserProfile: vi.fn(), fetchPets: vi.fn(), fetchClinicalEntries: vi.fn(),
  fetchPreventiveTasks: vi.fn(), fetchChatMessages: vi.fn(),
  createPet: vi.fn(), createClinicalEntry: vi.fn(), createPreventiveTask: vi.fn(), createChatMessage: vi.fn(),
  askPetAssistant: vi.fn(), fetchAiUsageSettings: vi.fn(), fetchUserPetAiUsage: vi.fn(),
}));

vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useRef: (value: unknown) => {
    const index = runtime.cursor++;
    runtime.slots[index] ??= { current: value };
    return runtime.slots[index];
  },
  useState: (value: unknown) => {
    const index = runtime.cursor++;
    const slots = runtime.slots;
    if (!(index in slots)) slots[index] = typeof value === 'function' ? value() : value;
    return [slots[index], (next: unknown) => {
      slots[index] = typeof next === 'function' ? next(slots[index]) : next;
    }];
  },
  useMemo: (factory: () => unknown) => factory(),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const index = runtime.cursor++;
    const previous = runtime.slots[index] as unknown[] | undefined;
    if (previous && deps.every((dep, offset) => Object.is(dep, previous[offset]))) return;
    runtime.slots[index] = deps;
    runtime.effects.push(() => {
      const cleanup = effect();
      if (cleanup) runtime.cleanups.push(cleanup);
    });
  },
}));
vi.mock('../context/AppStateContext', async importOriginal => ({
  ...await importOriginal<typeof import('../context/AppStateContext')>(),
  AppStateContext: { Provider: 'test-provider' },
  useAppState: () => runtime.state,
}));
vi.mock('../components/AdminUsersSection', () => ({ AdminUsersSection: () => null }));
vi.mock('../components/AgendaSection', () => ({ AgendaSection: () => null }));
vi.mock('../components/AuthScreens', () => ({ AuthScreens: () => null }));
vi.mock('../components/BlogSection', () => ({ BlogSection: () => null }));
vi.mock('../components/ChatSection', () => ({ ChatSection: () => null }));
vi.mock('../components/ClinicalHistoryLandingSection', () => ({ ClinicalHistoryLandingSection: () => null }));
vi.mock('../components/HowItWorksSection', () => ({ HowItWorksSection: () => null }));
vi.mock('../components/InstallPwaPrompt', () => ({ InstallPwaPrompt: () => null }));
vi.mock('../components/LandingSection', () => ({ LandingSection: () => null }));
vi.mock('../components/NearbyVetsMapSection', () => ({ NearbyVetsMapSection: () => null }));
vi.mock('../components/PetFriendlyPlacesSection', () => ({ PetFriendlyPlacesSection: () => null }));
vi.mock('../components/PetsSection', () => ({ PetsSection: () => null }));
vi.mock('../components/PetPublicProfileSection', () => ({ PetPublicProfileSection: () => null }));
vi.mock('../components/PublicLegalPages', () => ({ PublicLegalPage: () => null, isPublicLegalRoute: () => false }));
vi.mock('../components/RemindersLandingSection', () => ({ RemindersLandingSection: () => null }));
vi.mock('../components/FoodWeightLandingSection', () => ({ FoodWeightLandingSection: () => null }));
vi.mock('../components/AIAssistantLandingSection', () => ({ AIAssistantLandingSection: () => null }));
vi.mock('../components/IdentificationLostPetLandingSection', () => ({ IdentificationLostPetLandingSection: () => null }));
vi.mock('../components/VeterinaryLandingSection', () => ({ VeterinaryLandingSection: () => null }));
vi.mock('../components/PetFriendlyLandingSection', () => ({ PetFriendlyLandingSection: () => null }));
vi.mock('../components/SubscriptionComponents', () => ({ OffersSection: () => null, PaywallCard: () => null, SubscriptionBanner: () => null }));
vi.mock('../components/PetGuidesSection', () => ({ PetGuidesSection: () => null }));
vi.mock('../components/SocialLandingSection', () => ({ SocialLandingSection: () => null }));
vi.mock('../lib/supabase', () => ({
  ...services,
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getUser: services.getUser, signUp: services.signUp, signOut: services.signOut,
      onAuthStateChange: (listener: typeof runtime.listener) => {
        runtime.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    from: () => ({ upsert: services.upsert, update: () => ({ eq: services.updateConsent }) }),
  },
}));

import { signUpWithEmail, useSupabaseSync } from './useSupabaseSync';
import { useChat } from './useChat';
import { usePets } from './usePets';
import { useClinical } from './useClinical';
import { usePreventive } from './usePreventive';
import App from '../App';

const account = (id: string): AppUser => ({
  id, email: `${id}@example.invalid`, isGuest: false,
  subscription: { plan: 'premium', isActive: true, expiresAt: null },
});
const pet = (id: string): Pet => ({
  id, userId: 'guest', name: id, breed: 'Mestizo', species: 'dog', sex: 'unknown',
  ageYears: 2, ageMonths: 0, weightKg: 10, createdAt: '2026-01-01', updatedAt: '2026-01-01',
});
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
function render<Result>(hook: () => Result): Result {
  runtime.cursor = 0;
  const result = hook();
  runtime.effects.splice(0).forEach(effect => effect());
  return result;
}
async function settle() { await vi.runAllTimersAsync(); }
const snapshot = () => ({
  pets: [pet('old')], clinicalEntries: [],
  preventiveTasks: [{ id: 'task', petId: 'old', title: 'Aviso', category: 'other' as const,
    dueDate: '2026-01-01', completed: false, createdAt: '2026-01-01',
    notificationChannels: ['Push'], appointmentTime: '10:00' }],
  chatMessages: [
    { id: 'question', role: 'user' as const, petId: 'old', content: 'Pregunta', createdAt: '2026-01-01' },
    { id: 'failure', role: 'assistant' as const, petId: 'old', content: 'Fallo', createdAt: '2026-01-01', isError: true },
  ],
});

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers();
  runtime.slots = []; runtime.cursor = 0; runtime.effects = []; runtime.cleanups = [];
  const browser = new EventTarget();
  Object.assign(browser, { localStorage: storage(), location: { pathname: '/', hash: '', search: '' }, confirm: vi.fn(() => false) });
  vi.stubGlobal('window', browser);
  vi.stubGlobal('sessionStorage', storage());
  runtime.state = {
    user: null, loading: false, pets: [], selectedPetId: null, activeTab: 'pets', aiDailyUsage: 0,
    clinicalEntries: [], preventiveTasks: [], chatMessages: [], adminUsers: [],
    subscription: { isPremiumUser: false, isSubscribed: false, canAddPet: true, canUseAI: true, freePetLimit: 1, freeAiDailyLimit: 5 },
    setUser: vi.fn(value => { runtime.state.user = value; }),
    setPets: vi.fn(value => { runtime.state.pets = value; }),
    setClinicalEntries: vi.fn(value => { runtime.state.clinicalEntries = value; }),
    setPreventiveTasks: vi.fn(value => { runtime.state.preventiveTasks = value; }),
    setChatMessages: vi.fn(value => { runtime.state.chatMessages = value; }),
    setAdminUsers: vi.fn(), setSelectedPetId: vi.fn(), setActiveTab: vi.fn(), setAiDailyUsage: vi.fn(),
  };
  services.getUser.mockResolvedValue({ data: { user: null }, error: null });
  services.upsert.mockResolvedValue({ error: null });
  services.updateConsent.mockResolvedValue({ error: null });
  services.fetchUserProfile.mockImplementation(async (id: string) => account(id));
  services.fetchPets.mockImplementation(async (id: string) => [pet(id)]);
  services.fetchClinicalEntries.mockResolvedValue([]);
  services.fetchPreventiveTasks.mockResolvedValue([]);
  services.fetchChatMessages.mockResolvedValue([]);
  services.createPet.mockResolvedValue(pet('new'));
  services.createPreventiveTask.mockResolvedValue({ id: 'saved-task' });
  services.createChatMessage.mockResolvedValue({ id: 'saved-chat' });
  services.signUp.mockResolvedValue({ data: { user: account('owner'), session: {} }, error: null });
  services.fetchAiUsageSettings.mockResolvedValue({ guestLimitPerPet: 3, freeLimitPerPet: 10, premiumLimitPerPet: 100 });
  services.fetchUserPetAiUsage.mockResolvedValue([]);
});
afterEach(() => {
  runtime.cleanups.splice(0).forEach(cleanup => cleanup());
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('Recuperacion y aislamiento de sesion con Supabase simulado', () => {
  it('la ausencia normal de sesion no produce un aviso de error', async () => {
    services.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthSessionMissingError' } });
    render(useSupabaseSync); await settle();
    expect(render(useSupabaseSync).syncError).toBeNull();
  });
  it('ingresar despues del modo invitado no mezcla sus datos temporales', async () => {
    runtime.state.user = { ...account('guest'), isGuest: true };
    runtime.state.pets = [pet('temporary')];
    runtime.state.chatMessages = snapshot().chatMessages;
    render(useSupabaseSync);
    runtime.listener('SIGNED_IN', { user: account('owner') }); await settle();
    expect(runtime.state.pets.map(value => value.id)).toEqual(['owner']);
    expect(runtime.state.chatMessages).toEqual([]);
    expect(services.createPet).not.toHaveBeenCalled();
  });
  it('recupera la cuenta persistida sin sobrescribir Premium ni el perfil', async () => {
    services.getUser.mockResolvedValue({ data: { user: account('owner') }, error: null });
    render(useSupabaseSync); await settle();
    expect(runtime.state.user?.subscription?.plan).toBe('premium');
    expect(runtime.state.pets[0].id).toBe('owner');
    for (const [, options] of services.upsert.mock.calls) expect(options.ignoreDuplicates).toBe(true);
  });
  it('limpia la sesion autenticada al salir y recupera los datos al volver', async () => {
    runtime.state.user = account('owner'); runtime.state.pets = [pet('owner')];
    render(useSupabaseSync);
    runtime.listener('SIGNED_OUT', null); await settle();
    expect(runtime.state.user).toBeNull(); expect(runtime.state.pets).toEqual([]);
    expect(runtime.state.setSelectedPetId).toHaveBeenCalledWith(null);
    runtime.listener('SIGNED_IN', { user: account('owner') }); await settle();
    expect(runtime.state.pets[0].id).toBe('owner');
  });
  it('no aplica la respuesta demorada de A sobre B', async () => {
    let resolveFirst!: (value: Pet[]) => void;
    services.fetchPets.mockImplementationOnce(() => new Promise<Pet[]>(resolve => { resolveFirst = resolve; }));
    render(useSupabaseSync);
    runtime.listener('SIGNED_IN', { user: account('first') }); await settle();
    runtime.listener('SIGNED_IN', { user: account('second') }); await settle();
    resolveFirst([pet('first')]); await settle();
    expect(runtime.state.user?.id).toBe('second'); expect(runtime.state.pets[0].id).toBe('second');
  });
  it('descarta una carga que termina despues del logout', async () => {
    let resolvePets!: (value: Pet[]) => void;
    services.fetchPets.mockImplementationOnce(() => new Promise<Pet[]>(resolve => { resolvePets = resolve; }));
    render(useSupabaseSync);
    runtime.listener('SIGNED_IN', { user: account('owner') }); await settle();
    runtime.listener('SIGNED_OUT', null);
    resolvePets([pet('owner')]); await settle();
    expect(runtime.state.user).toBeNull(); expect(runtime.state.pets).toEqual([]);
  });
  it('expone errores sin reemplazar los datos de la misma cuenta por vacios', async () => {
    runtime.state.user = account('owner'); runtime.state.pets = [pet('kept')];
    services.fetchPets.mockRejectedValue(new Error('Fallo simulado de lectura'));
    render(useSupabaseSync);
    runtime.listener('SIGNED_IN', { user: account('owner') }); await settle();
    expect(render(useSupabaseSync).syncError).toBe('Fallo simulado de lectura');
    expect(runtime.state.pets[0].id).toBe('kept');
  });
});

describe('Migracion del visitante con escrituras simuladas', () => {
  it('conserva el consentimiento explicito hasta confirmar la cuenta', async () => {
    services.signUp.mockResolvedValue({ data: { user: account('owner'), session: null }, error: null });
    await signUpWithEmail('owner@example.invalid', 'simulada', snapshot(), true);
    expect(services.updateConsent).not.toHaveBeenCalled();
    render(useSupabaseSync);
    runtime.listener('SIGNED_IN', { user: account('owner') }); await settle();
    expect(services.updateConsent).toHaveBeenCalledExactlyOnceWith('id', 'owner');
    expect(sessionStorage.getItem('aipetfriendly.guest-migration')).toBeNull();
  });
  it('remapea mascotas del chat, conserva metadata de agenda y excluye errores', async () => {
    await signUpWithEmail('owner@example.invalid', 'simulada', snapshot());
    expect(services.createChatMessage).toHaveBeenCalledExactlyOnceWith('owner', 'new', 'user', 'Pregunta');
    expect(services.createPreventiveTask).toHaveBeenCalledWith('new', expect.objectContaining({ appointmentTime: '10:00', notificationChannels: ['Push'] }));
    expect(sessionStorage.getItem('aipetfriendly.guest-migration')).toBeNull();
  });
  it('espera la confirmacion de email y no escribe sin una sesion', async () => {
    services.signUp.mockResolvedValue({ data: { user: account('owner'), session: null }, error: null });
    await signUpWithEmail('owner@example.invalid', 'simulada', snapshot());
    expect(services.createPet).not.toHaveBeenCalled(); expect(services.upsert).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('aipetfriendly.guest-migration')).not.toBeNull();
  });
  it('no importa el pendiente del visitante en otra cuenta', async () => {
    services.signUp.mockResolvedValue({ data: { user: account('owner'), session: null }, error: null });
    await signUpWithEmail('owner@example.invalid', 'simulada', snapshot());
    render(useSupabaseSync);
    runtime.listener('SIGNED_IN', { user: account('other') }); await settle();
    expect(services.createPet).not.toHaveBeenCalled(); expect(runtime.state.user?.id).toBe('other');
    expect(render(useSupabaseSync).syncError).toContain('otra identidad');
    expect(sessionStorage.getItem('aipetfriendly.guest-migration')).not.toBeNull();
  });
  it.each(['clinical', 'task', 'chat', 'shared'] as const)('conserva y bloquea registros huerfanos de %s antes de escribir', async kind => {
    const pendingSnapshot = snapshot();
    if (kind === 'clinical') {
      Object.assign(pendingSnapshot, { clinicalEntries: [{ id: 'orphan', petId: 'missing', category: 'clinical_note', title: 'Nota simulada', description: 'Temporal', eventDate: '2026-01-01', createdAt: '2026-01-01' }] });
    } else if (kind === 'task') pendingSnapshot.preventiveTasks[0].petId = 'missing';
    else if (kind === 'chat') pendingSnapshot.chatMessages[0].petId = 'missing';
    else Object.assign(pendingSnapshot.preventiveTasks[0], { foodSharedPetIds: ['missing'] });
    await expect(signUpWithEmail('owner@example.invalid', 'simulada', pendingSnapshot)).rejects.toThrow('sin una mascota identificable');
    expect(services.createPet).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem('aipetfriendly.guest-migration')!).snapshot).toEqual(pendingSnapshot);
  });
  it('conserva y bloquea un pendiente antiguo sin identidad verificable', async () => {
    const legacy = JSON.stringify(snapshot());
    sessionStorage.setItem('aipetfriendly.guest-migration', legacy);
    await expect(signUpWithEmail('owner@example.invalid', 'simulada', snapshot())).rejects.toThrow('revision');
    expect(sessionStorage.getItem('aipetfriendly.guest-migration')).toBe(legacy);
    expect(services.signUp).not.toHaveBeenCalled();
  });
  it('conserva el avance y bloquea reintentos ambiguos sin duplicar mascotas', async () => {
    services.createPreventiveTask.mockResolvedValue(null);
    await expect(signUpWithEmail('owner@example.invalid', 'simulada', snapshot())).rejects.toThrow('confirmar');
    await expect(signUpWithEmail('owner@example.invalid', 'simulada', snapshot())).rejects.toThrow('duplicados');
    expect(services.createPet).toHaveBeenCalledTimes(1);
    expect(services.signUp).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem('aipetfriendly.guest-migration')!).petIds.old).toBe('new');
  });
  it('libera el bloqueo luego de un fallo de registro', async () => {
    services.signUp.mockRejectedValueOnce(new Error('Red simulada'));
    await expect(signUpWithEmail('owner@example.invalid', 'simulada', snapshot())).rejects.toThrow('Red simulada');
    await signUpWithEmail('owner@example.invalid', 'simulada', snapshot());
    expect(services.createPet).toHaveBeenCalledTimes(1);
  });
});

describe('Conversaciones simuladas', () => {
  beforeEach(() => {
    runtime.state.user = account('owner'); runtime.state.pets = [pet('one'), pet('two')];
    runtime.state.selectedPetId = 'one';
  });
  it('avisa si la respuesta valida no pudo persistirse sin tratarla como fallo clinico', async () => {
    services.askPetAssistant.mockResolvedValue({ answer: 'Respuesta simulada' });
    services.createChatMessage.mockResolvedValue(null);
    const chat = render(useChat); await settle();
    await chat.sendMessage('Pregunta', 'one');
    const next = render(useChat);
    expect(next.persistenceError).toContain('podria perderse');
    expect(next.historyMessages.find(message => message.role === 'assistant')?.isError).toBeUndefined();
  });
  it('mantiene los errores fuera del historial valido y del siguiente contexto', async () => {
    services.askPetAssistant.mockRejectedValueOnce(new Error('IA simulada sin conexion'));
    let chat = render(useChat); await settle();
    await chat.sendMessage('Primera', 'one');
    chat = render(useChat);
    expect(chat.messages.some(message => message.isError)).toBe(true);
    expect(chat.historyMessages.some(message => message.isError)).toBe(false);
    services.askPetAssistant.mockResolvedValue({ answer: 'Respuesta simulada' });
    await chat.sendMessage('Segunda', 'one');
    expect(services.askPetAssistant.mock.lastCall?.[0].recentMessages).not.toEqual(expect.arrayContaining([expect.objectContaining({ role: 'assistant', content: expect.stringContaining('No pudimos') })]));
    expect(services.createChatMessage).not.toHaveBeenCalledWith('owner', 'one', 'assistant', expect.stringContaining('No pudimos'));
  });
  it('no mezcla mascotas al completar dos solicitudes en distinto orden', async () => {
    let resolveFirst!: (value: { answer: string }) => void;
    services.askPetAssistant.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
    const chat = render(useChat); await settle();
    const first = chat.sendMessage('Primera', 'one');
    runtime.state.selectedPetId = 'two';
    const secondChat = render(useChat);
    services.askPetAssistant.mockResolvedValueOnce({ answer: 'Respuesta dos' });
    await secondChat.sendMessage('Segunda', 'two');
    resolveFirst({ answer: 'Respuesta uno' }); await first;
    expect(render(useChat).historyMessages.every(message => message.petId === 'two')).toBe(true);
    expect(runtime.state.chatMessages).toHaveLength(4);
  });
  it('descarta una respuesta que llega despues de desmontar el consultorio', async () => {
    let finish!: (value: { answer: string }) => void;
    services.askPetAssistant.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const chat = render(useChat); await settle();
    const pending = chat.sendMessage('Pregunta', 'one');
    runtime.cleanups.splice(0).forEach(cleanup => cleanup());
    runtime.state.chatMessages = [];
    finish({ answer: 'Tardia' }); await pending;
    expect(runtime.state.chatMessages).toEqual([]); expect(services.createChatMessage).not.toHaveBeenCalled();
  });
  it('descarta una respuesta de A si se cambia a B y se vuelve a A sin desmontar', async () => {
    let finish!: (value: { answer: string }) => void;
    services.askPetAssistant.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const chat = render(useChat); await settle();
    const pending = chat.sendMessage('Pregunta anterior', 'one');
    runtime.state.user = account('second'); runtime.state.chatMessages = [];
    render(useChat);
    runtime.state.user = account('owner');
    render(useChat);
    finish({ answer: 'Respuesta anterior' }); await pending;
    expect(runtime.state.chatMessages).toEqual([]);
    expect(services.createChatMessage).not.toHaveBeenCalled();
  });
});

describe('Mutaciones demoradas de una identidad anterior', () => {
  it('no reinserta una mascota tras cambiar de cuenta', async () => {
    runtime.state.user = account('first');
    let finish!: (value: Pet) => void;
    services.createPet.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pets = render(usePets);
    const pending = pets.addPet({ ...pet('old'), birthDate: '2024-01-01' });
    runtime.state.user = account('second');
    render(usePets);
    finish(pet('old'));
    await expect(pending).rejects.toThrow('sesion cambio');
    expect(runtime.state.setPets).not.toHaveBeenCalled();
  });
  it('no reinserta una nota clinica despues de salir', async () => {
    runtime.state.user = account('first');
    let finish!: (value: { id: string }) => void;
    services.createClinicalEntry.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const clinical = render(useClinical);
    const pending = clinical.addClinicalNote({ petId: 'old', title: 'Nota', content: 'Simulada', category: 'clinical_note', eventDate: '2026-01-01' });
    runtime.state.user = null;
    render(useClinical);
    finish({ id: 'note' });
    await expect(pending).rejects.toThrow('sesion cambio');
    expect(runtime.state.setClinicalEntries).not.toHaveBeenCalled();
  });
  it('no reinserta agenda ni crea otra entrada clinica despues del cambio', async () => {
    runtime.state.user = account('first');
    let finish!: (value: { id: string }) => void;
    services.createPreventiveTask.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const preventive = render(usePreventive);
    const pending = preventive.addPreventiveTask({ petId: 'old', title: 'Aviso', category: 'other', dueDate: '2026-01-01', completed: false });
    runtime.state.user = account('second');
    render(usePreventive);
    finish({ id: 'task' });
    await expect(pending).rejects.toThrow('sesion cambio');
    expect(runtime.state.setPreventiveTasks).not.toHaveBeenCalled();
    expect(services.createClinicalEntry).not.toHaveBeenCalled();
  });
});

describe('Proveedor real de estado con hooks simulados', () => {
  const provider = () => (render(App).props as { value: GlobalAppState }).value;
  it('sale sin datos y un nuevo invitado no recibe datos de la identidad anterior', () => {
    let state = provider();
    state.setUser({ ...account('guest-one'), isGuest: true });
    state = provider();
    state.setUser(null);
    expect(provider().user).toBeNull();
    state.setUser({ ...account('guest-one'), isGuest: true });
    state = provider();
    state.setPets([pet('temporary')]);
    state.setSelectedPetId('temporary');
    state.setClinicalEntries([{ id: 'note', petId: 'temporary', category: 'clinical_note', title: 'Nota', description: 'Temporal', eventDate: '2026-01-01', createdAt: '2026-01-01' }]);
    state.setPreventiveTasks(snapshot().preventiveTasks);
    state.setChatMessages(snapshot().chatMessages);
    state.setUser(null);
    state = provider();
    expect([state.pets, state.clinicalEntries, state.preventiveTasks, state.chatMessages]).toEqual([[], [], [], []]);
    expect(state.selectedPetId).toBeNull();
    state.setUser({ ...account('guest-two'), isGuest: true });
    expect(provider().pets).toEqual([]);
  });
  it('un nuevo montaje pierde los datos temporales sin convertirlos en persistentes', () => {
    let state = provider();
    state.setUser({ ...account('guest'), isGuest: true });
    state = provider(); state.setPets([pet('temporary')]);
    expect(provider().pets).toHaveLength(1);
    runtime.slots = [];
    state = provider();
    expect(state.user).toBeNull(); expect(state.pets).toEqual([]);
  });
  it('actualizar el perfil de la misma cuenta no borra sus datos', () => {
    let state = provider(); state.setUser(account('owner'));
    state = provider(); state.setPets([pet('kept')]);
    state.setUser({ ...account('owner'), fullName: 'Nombre simulado' });
    expect(provider().pets[0].id).toBe('kept');
  });
  it('cancelar conserva el invitado y aceptar limpia sus datos en el handler existente', () => {
    let state = provider(); state.setUser({ ...account('guest'), isGuest: true });
    state = provider(); state.setPets([pet('temporary')]);
    const root = render(App);
    const rootSlots = runtime.slots;
    runtime.state = (root.props as { value: GlobalAppState }).value;
    const content = (root.props as { children: Array<{ type: () => unknown }> }).children[1].type;
    runtime.slots = [];
    const tree = render(content);
    const buttons: Array<{ children?: unknown; onClick: () => void }> = [];
    const visit = (node: unknown) => {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (!node || typeof node !== 'object' || !('props' in node)) return;
      const element = node as { type: unknown; props: { children?: unknown; onClick: () => void } };
      if (element.type === 'button') buttons.push(element.props);
      visit(element.props.children);
    };
    visit(tree);
    const leave = buttons.find(button => button.children === 'Salir')!;
    leave.onClick();
    expect(window.confirm).toHaveBeenCalledTimes(1);
    runtime.slots = rootSlots;
    expect(provider().pets).toHaveLength(1);
    expect(provider().user?.isGuest).toBe(true);
    vi.mocked(window.confirm).mockReturnValue(true);
    leave.onClick();
    expect(provider().user).toBeNull(); expect(provider().pets).toEqual([]);
  });
});