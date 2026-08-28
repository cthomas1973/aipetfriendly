import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CreditCard,
  Gift,
  MapPinned,
  MessageCircle,
  PawPrint,
  Shield,
} from 'lucide-react';
import { AdminUsersSection } from './components/AdminUsersSection';
import { AgendaSection } from './components/AgendaSection';
import { AuthScreens } from './components/AuthScreens';
import { ChatSection } from './components/ChatSection';
import { InstallPwaPrompt } from './components/InstallPwaPrompt';
import { LandingSection } from './components/LandingSection';
import { NearbyVetsMapSection } from './components/NearbyVetsMapSection';
import { PetsSection } from './components/PetsSection';
import { PetPublicProfileSection } from './components/PetPublicProfileSection';
import { PublicLegalPage, isPublicLegalRoute } from './components/PublicLegalPages';
import {
  OffersSection,
  PaywallCard,
  SubscriptionBanner,
} from './components/SubscriptionComponents';
import { PetGuidesSection } from './components/PetGuidesSection';
import { SocialLandingSection } from './components/SocialLandingSection';
import { AppStateContext, useAppState } from './context/AppStateContext';
import { usePreventive } from './hooks/usePreventive';
import { signOut, useSupabaseSync } from './hooks/useSupabaseSync';
import { hideBannerAd, isNativeAndroidApp, showBannerForNonPremium } from './lib/mobileAds';
import { createGuestUser } from './lib/guestUser';
import type {
  AdminUserRow,
  AppTab,
  AppUser,
  ChatMessage,
  ClinicalTimelineEntry,
  Pet,
  PreventiveTask,
  SubscriptionState,
} from './types';

const FREE_PET_LIMIT = 1;
const FREE_AI_DAILY_LIMIT = 5;
// Clave en localStorage para recordar a que pestaña ir apenas el usuario tenga
// sesion iniciada, cuando viene de un CTA especifico (ej. "Quiero Premium" en /social).
// Se guarda en localStorage (y no en estado de React) porque el registro puede
// requerir confirmacion por email, lo que implica un reload/redireccion completa.
const POST_SIGNUP_TAB_KEY = 'apf_post_signup_tab';
// Codigo publico de la mascota (public_code) pendiente de abrir en "Mensajes
// recibidos", que llega por query param ?pet_messages=<codigo> desde el link
// del email "¡Alguien encontro a tu mascota!". Se guarda mientras el usuario
// inicia sesion y/o se terminan de cargar sus mascotas desde Supabase.
const PENDING_PET_MESSAGES_CODE_KEY = 'apf_pending_pet_messages_code';
// Id de la mascota que PetsSection debe abrir automaticamente en la vista de
// Identificacion (mensajes recibidos) apenas se renderice con esa mascota
// seleccionada. Ver tambien src/components/PetsSection.tsx.
const OPEN_PET_IDENTIFICATION_KEY = 'apf_open_pet_identificacion';

// Extrae el codigo publico de una ruta /mascota/{codigo} (pagina de identificacion
// de la mascota, accesible sin login desde el QR del cartel o de la chapita).
// /m/{codigo} es un alias corto de la misma ruta, pensado para que el QR de la
// chapita 3D tenga menos caracteres (y por lo tanto menos modulos/detalle).
function getPetPublicCodeFromPath(normalizedPath: string): string | null {
  const match = normalizedPath.match(/^\/(?:mascota|m)\/([A-Za-z0-9]{4,16})$/);
  return match ? match[1].toUpperCase() : null;
}

// Determina si, en la primera carga, el visitante sin sesion debe entrar
// directamente como invitado (en vez de ver la landing o el login primero).
// Esto permite que cualquier persona (o el rastreador de Google para AdSense)
// pueda recorrer toda la app sin loguearse. Se excluyen las rutas publicas que
// ya tienen su propio contenido/flujo (guias, legales, /social, /login, reset
// de password, reclamo de veterinaria).
function shouldAutoStartAsGuest(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const path = window.location.pathname;
  const normalizedPath = path.length > 1 ? path.replace(/\/+$/, '') : path;
  const isGuidesRoute = normalizedPath === '/guias' || normalizedPath.startsWith('/guias/');
  const isSocialLandingRoute = normalizedPath === '/social';
  const isLoginRoute = normalizedPath === '/login';
  const isLegalRoute = isPublicLegalRoute(normalizedPath);
  const isPetPublicRoute = Boolean(getPetPublicCodeFromPath(normalizedPath));
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const isRecoveryLink = hashParams.get('type') === 'recovery';
  const isResetPasswordRoute = path === '/reset-password' || isRecoveryLink;
  const urlParams = new URLSearchParams(window.location.search);
  const hasPublicVetClaimRoute = Boolean(urlParams.get('vet_claim'));

  return (
    !isGuidesRoute
    && !isSocialLandingRoute
    && !isLoginRoute
    && !isLegalRoute
    && !isPetPublicRoute
    && !isResetPasswordRoute
    && !hasPublicVetClaimRoute
  );
}

interface GlobalAppState {
  user: AppUser | null;
  loading: boolean;
  pets: Pet[];
  selectedPetId: string | null;
  activeTab: AppTab;
  aiDailyUsage: number;
  clinicalEntries: ClinicalTimelineEntry[];
  preventiveTasks: PreventiveTask[];
  chatMessages: ChatMessage[];
  adminUsers: AdminUserRow[];
  subscription: SubscriptionState;
  setUser: (user: AppUser | null) => void;
  setPets: (pets: Pet[]) => void;
  setSelectedPetId: (petId: string | null) => void;
  setActiveTab: (tab: AppTab) => void;
  setAiDailyUsage: (usage: number) => void;
  setClinicalEntries: (entries: ClinicalTimelineEntry[]) => void;
  setPreventiveTasks: (tasks: PreventiveTask[]) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  setAdminUsers: (users: AdminUserRow[]) => void;
}

interface ReminderPopupItem {
  id: string;
  title: string;
  dueDate: string;
  petName: string;
  doseTime?: string;
}

// Devuelve el horario especifico (HH:MM) de una tarea preventiva, priorizando el
// horario de turno y luego el primer horario de dosis configurado. Se usa para que
// los recordatorios (push, email, whatsapp) avisen de la PROXIMA dosis puntual y no
// de todas las dosis del dia juntas.
function getTaskTimeString(task: PreventiveTask): string | null {
  if (typeof task.appointmentTime === 'string' && /^\d{2}:\d{2}$/.test(task.appointmentTime)) {
    return task.appointmentTime;
  }
  if (
    Array.isArray(task.scheduleTimes)
    && task.scheduleTimes.length > 0
    && /^\d{2}:\d{2}$/.test(task.scheduleTimes[0])
  ) {
    return task.scheduleTimes[0];
  }
  return null;
}

function BottomNav({
  activeTab,
  onChange,
  isAdmin,
  hasMobileBanner,
}: {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
  isAdmin: boolean;
  hasMobileBanner: boolean;
}) {
  const tabs: Array<{ id: AppTab; label: string; icon: typeof PawPrint }> = [
    { id: 'pets', label: 'Mascotas', icon: PawPrint },
    { id: 'clinical', label: 'Consultorio', icon: MessageCircle },
    { id: 'agenda', label: 'Agenda', icon: CalendarDays },
    { id: 'map', label: 'Mapa Vet', icon: MapPinned },
    { id: 'offers', label: 'Tienda', icon: Gift },
    { id: 'subscription', label: 'Mi Cuenta', icon: CreditCard },
  ];

  if (isAdmin) {
    tabs.push({ id: 'admin', label: 'Admin', icon: Shield });
  }

  return (
    <nav
      className="fixed left-0 right-0 z-30 border-t border-emerald-100 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.55rem)] pt-2 backdrop-blur md:hidden"
      style={{ bottom: hasMobileBanner ? '52px' : '0px' }}
    >
      <ul className={`grid ${isAdmin ? 'grid-cols-7' : 'grid-cols-6'} gap-1`}>
        {tabs.map((tab) => (
          <li key={tab.id} className="text-center">
            <button
              type="button"
              onClick={() => onChange(tab.id)}
              className={`w-full rounded-2xl px-1 py-1.5 text-[11px] font-medium transition ${
                activeTab === tab.id
                  ? 'text-emerald-700'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <span
                className={`mx-auto mb-1 inline-flex h-9 w-9 items-center justify-center rounded-full transition ${
                  activeTab === tab.id ? 'bg-emerald-100 text-emerald-600' : 'text-slate-400'
                }`}
              >
                <tab.icon size={18} />
              </span>
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function DesktopTabNav({
  activeTab,
  onChange,
  isAdmin,
}: {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
  isAdmin: boolean;
}) {
  const tabs: Array<{ id: AppTab; label: string; icon: typeof PawPrint }> = [
    { id: 'pets', label: 'Mascotas', icon: PawPrint },
    { id: 'clinical', label: 'Consultorio', icon: MessageCircle },
    { id: 'agenda', label: 'Agenda', icon: CalendarDays },
    { id: 'map', label: 'Mapa Vet', icon: MapPinned },
    { id: 'offers', label: 'Tienda', icon: Gift },
    { id: 'subscription', label: 'Mi Cuenta', icon: CreditCard },
  ];

  if (isAdmin) {
    tabs.push({ id: 'admin', label: 'Admin', icon: Shield });
  }

  return (
    <nav className="mb-5 hidden rounded-2xl bg-white/85 p-2 shadow-sm ring-1 ring-emerald-100 md:block">
      <ul className={`grid ${isAdmin ? 'grid-cols-7' : 'grid-cols-6'} gap-2`}>
        {tabs.map((tab) => (
          <li key={tab.id}>
            <button
              type="button"
              onClick={() => onChange(tab.id)}
              className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'text-slate-600 hover:bg-emerald-50'
              }`}
            >
              <tab.icon size={16} /> {tab.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function AppContent() {
  const {
    user,
    loading,
    activeTab,
    pets,
    preventiveTasks,
    subscription,
    setActiveTab,
    setSelectedPetId,
    setUser,
  } = useAppState();
  const [showLogo, setShowLogo] = useState(true);
  const [switchingUser, setSwitchingUser] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register'>('login');
  const [popupQueue, setPopupQueue] = useState<ReminderPopupItem[]>([]);
  const [popupPostponeId, setPopupPostponeId] = useState<string | null>(null);
  const { toggleTask, postponeTask, discardTaskReminder } = usePreventive();
  const currentPath = window.location.pathname;
  const normalizedPath = currentPath.length > 1 ? currentPath.replace(/\/+$/, '') : currentPath;
  const urlParams = new URLSearchParams(window.location.search);
  const hasPublicVetClaimRoute = Boolean(urlParams.get('vet_claim'));
  const isGuidesRoute = normalizedPath === '/guias' || normalizedPath.startsWith('/guias/');
  const guideSlug = isGuidesRoute ? normalizedPath.replace(/^\/guias\/?/, '') || undefined : undefined;
  const isSocialLandingRoute = normalizedPath === '/social';
  const isLegalRoute = isPublicLegalRoute(normalizedPath);
  const isLoginRoute = normalizedPath === '/login';
  const petPublicCode = getPetPublicCodeFromPath(normalizedPath);
  const isPetPublicRoute = Boolean(petPublicCode);

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const isRecoveryLink = hashParams.get('type') === 'recovery';
  const isResetPasswordRoute = currentPath === '/reset-password' || isRecoveryLink;
  const isLandingRoute = !user && !isResetPasswordRoute && !showAuthGate && !hasPublicVetClaimRoute && !isGuidesRoute && !isLoginRoute && !isPetPublicRoute;
  const hasMobileBanner = Boolean(user && !user.isGuest && !subscription.isPremiumUser && isNativeAndroidApp());
  // La barra de tabs de la app solo tiene sentido si hay un usuario navegando
  // dentro de la app; en /guias sin login se muestra como pagina publica de contenido.
  const showAppNav = !isResetPasswordRoute && !isLandingRoute && !(isLoginRoute && !user) && !isPetPublicRoute && (!isGuidesRoute || Boolean(user));

  // Sincronizar con Supabase
  useSupabaseSync();

  // Si el usuario llego desde un CTA especifico (ej. "Quiero Premium" en /social)
  // y recien ahora tiene sesion iniciada (pudo requerir confirmacion por email,
  // con reload de por medio), lo llevamos directo a la pestaña pedida una sola vez.
  useEffect(() => {
    if (!user) {
      return;
    }

    const pendingTab = window.localStorage.getItem(POST_SIGNUP_TAB_KEY);
    if (pendingTab) {
      window.localStorage.removeItem(POST_SIGNUP_TAB_KEY);
      setActiveTab(pendingTab as AppTab);
    }
  }, [user, setActiveTab]);

  // Si el link trae ?pet_messages=<codigo> (boton "Ver mensajes en AiPetFriendly"
  // del email de mascota encontrada), guardamos el codigo mientras se carga la
  // sesion/las mascotas y limpiamos el query param para no repetir el flujo.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const petMessagesCode = params.get('pet_messages');
    if (!petMessagesCode) {
      return;
    }

    window.localStorage.setItem(PENDING_PET_MESSAGES_CODE_KEY, petMessagesCode.trim().toUpperCase());
    params.delete('pet_messages');
    const remainingSearch = params.toString();
    const cleanedUrl = `${window.location.pathname}${remainingSearch ? `?${remainingSearch}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', cleanedUrl);
  }, []);

  // Apenas haya sesion (no invitado) y las mascotas esten cargadas, resolvemos
  // el codigo pendiente a una mascota propia y le pedimos a PetsSection que
  // abra directamente la vista de "Mensajes recibidos" de esa mascota.
  useEffect(() => {
    if (!user || user.isGuest) {
      return;
    }

    const pendingCode = window.localStorage.getItem(PENDING_PET_MESSAGES_CODE_KEY);
    if (!pendingCode) {
      return;
    }

    if (pets.length === 0) {
      // Todavia no se cargaron las mascotas del usuario; esperamos al proximo render.
      return;
    }

    window.localStorage.removeItem(PENDING_PET_MESSAGES_CODE_KEY);
    const matchedPet = pets.find((p) => p.publicCode?.toUpperCase() === pendingCode);
    if (matchedPet) {
      setSelectedPetId(matchedPet.id);
      setActiveTab('pets');
      window.localStorage.setItem(OPEN_PET_IDENTIFICATION_KEY, matchedPet.id);
    }
  }, [user, pets, setSelectedPetId, setActiveTab]);

  const onSignOutGuest = () => {
    setUser(null);
  };

  const onLogoGoToLogin = async () => {
    if (switchingUser) {
      return;
    }

    setSwitchingUser(true);
    try {
      if (user?.isGuest) {
        setUser(null);
      } else if (user) {
        await signOut();
      }
      setActiveTab('pets');
    } catch (err) {
      console.error('No se pudo cambiar de usuario:', err);
    } finally {
      setSwitchingUser(false);
    }
  };

  useEffect(() => {
    if (!user || user.isGuest || preventiveTasks.length === 0) {
      return;
    }

    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const notifiedRaw = window.localStorage.getItem(`apf_popup_notified_${todayKey}`);
    const notifiedSet = new Set<string>(notifiedRaw ? JSON.parse(notifiedRaw) as string[] : []);

    const dueItems: ReminderPopupItem[] = preventiveTasks
      .filter((task) => {
        if (task.completed) return false;
        const normalizedChannels = Array.isArray(task.notificationChannels)
          ? task.notificationChannels.map((channel) => String(channel).trim().toLowerCase())
          : [];
        const hasPushChannel = normalizedChannels.length === 0
          ? true
          : normalizedChannels.includes('push');
        if (!hasPushChannel) return false;
        if (task.remindersEnabled === false) return false;

        // Si la tarea tiene un horario puntual (turno o dosis de medicacion),
        // solo se considera "vencida" a partir de ese horario del dia (para poder
        // avisar de la proxima dosis puntual y no de todas las del dia a la vez).
        // Si no tiene horario especifico, se mantiene el comportamiento anterior
        // (vence al final del dia indicado).
        const taskTime = getTaskTimeString(task);
        const dueDate = new Date(`${task.dueDate}T${taskTime ?? '23:59'}:00`);
        return dueDate.getTime() <= today.getTime();
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .filter((task) => !notifiedSet.has(task.id))
      .slice(0, 3)
      .map((task) => ({
        id: task.id,
        title: task.title,
        dueDate: task.dueDate,
        petName: pets.find((pet) => pet.id === task.petId)?.name ?? 'Mascota',
        doseTime: getTaskTimeString(task) ?? undefined,
      }));

    if (dueItems.length > 0) {
      setPopupQueue(dueItems);
      const nextNotified = new Set([...notifiedSet, ...dueItems.map((item) => item.id)]);
      window.localStorage.setItem(`apf_popup_notified_${todayKey}`, JSON.stringify(Array.from(nextNotified)));
    }
  }, [pets, preventiveTasks, user]);

  const closeReminderPopup = (id: string) => {
    setPopupQueue((current) => current.filter((item) => item.id !== id));
    setPopupPostponeId((current) => (current === id ? null : current));
  };

  const handlePopupDone = async (id: string) => {
    try {
      await toggleTask(id);
    } catch (error) {
      console.error('No se pudo marcar recordatorio como realizado:', error);
    } finally {
      closeReminderPopup(id);
    }
  };

  const handlePopupDiscard = async (id: string) => {
    const confirmed = window.confirm('Estas seguro? Esta accion eliminara la tarea y su notificacion.');
    if (!confirmed) {
      return;
    }

    try {
      await discardTaskReminder(id);
      closeReminderPopup(id);
    } catch (error) {
      console.error('No se pudo descartar recordatorio:', error);
    }
  };

  const handlePopupPostpone = async (id: string, minutes: number) => {
    try {
      await postponeTask(id, minutes);
    } catch (error) {
      console.error('No se pudo posponer recordatorio:', error);
    } finally {
      closeReminderPopup(id);
    }
  };

  const renderTabContent = () => {
    if (isResetPasswordRoute) {
      return <AuthScreens initialMode="reset-password" />;
    }

    if (isPetPublicRoute && petPublicCode) {
      return <PetPublicProfileSection code={petPublicCode} />;
    }

    if (isGuidesRoute) {
      return <PetGuidesSection slug={guideSlug} />;
    }

    if (isLegalRoute) {
      return <PublicLegalPage route={normalizedPath} />;
    }

    if (isSocialLandingRoute && !user && !showAuthGate) {
      return (
        <SocialLandingSection
          onSelectFree={() => {
            setAuthInitialMode('register');
            setShowAuthGate(true);
          }}
          onSelectPremium={() => {
            setAuthInitialMode('register');
            window.localStorage.setItem(POST_SIGNUP_TAB_KEY, 'subscription');
            setShowAuthGate(true);
          }}
        />
      );
    }

    if (isLoginRoute && !user) {
      return <AuthScreens initialMode="login" />;
    }

    if (isLandingRoute) {
      return (
        <LandingSection
          onRegister={() => {
            setAuthInitialMode('register');
            setShowAuthGate(true);
          }}
          onLogin={() => {
            window.location.href = '/login';
          }}
          onGuest={() => setUser(createGuestUser())}
        />
      );
    }

    if (!user && hasPublicVetClaimRoute) {
      return <NearbyVetsMapSection />;
    }

    if (!user) {
      return <AuthScreens initialMode={authInitialMode} />;
    }

    if (activeTab === 'pets') {
      return <PetsSection />;
    }

    if (activeTab === 'clinical') {
      return <ChatSection />;
    }

    if (activeTab === 'agenda') {
      return <AgendaSection />;
    }

    if (activeTab === 'map') {
      return <NearbyVetsMapSection />;
    }

    if (activeTab === 'offers') {
      return <OffersSection />;
    }

    if (activeTab === 'admin') {
      if (!user.isAdmin) {
        return (
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">No tienes acceso a la vista de administración.</p>
          </div>
        );
      }
      return <AdminUsersSection />;
    }

    return <PaywallCard />;
  };

  return (
    <div className={`min-h-screen bg-[#EAF7F1] ${hasMobileBanner ? 'pb-40' : 'pb-24'} md:pb-10`}>
      <main className="mx-auto w-full max-w-md px-4 pt-5 md:max-w-5xl md:px-6 md:pt-8">
        <div className="mb-3 text-center md:mb-5">
          <button
            type="button"
            onClick={onLogoGoToLogin}
            disabled={switchingUser}
            title={user ? 'Cambiar usuario' : 'Ir al login'}
            className="inline-flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-70"
          >
            {showLogo ? (
              <img
                src="/logo-aipetfriendly.png"
                alt="AiPetFriendly"
                className="mx-auto h-16 w-auto md:h-20"
                onError={() => setShowLogo(false)}
              />
            ) : (
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
                <PawPrint size={26} />
              </div>
            )}
          </button>
        </div>

        {!isResetPasswordRoute && showAppNav && (
          <DesktopTabNav activeTab={activeTab} onChange={setActiveTab} isAdmin={Boolean(user?.isAdmin)} />
        )}

        {user && !user.isGuest && !isResetPasswordRoute && <SubscriptionBanner />}

        {user?.isGuest && !isResetPasswordRoute && (
          <div className="mb-5 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 p-4 shadow-md text-white">
            <p className="mb-3 text-sm font-semibold">
              Modo visitante · Lo que cargues no se guardará a menos que te registres (gratis, solo con tu email).
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('subscription')}
                className="w-full rounded-full bg-white font-bold text-blue-600 py-2 hover:bg-gray-100 transition"
              >
                ✨ Crear cuenta gratis
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = '/login';
                  }}
                  className="flex-1 rounded-full border-2 border-white font-semibold py-2 hover:bg-white/20 transition"
                >
                  Ya estoy registrado
                </button>
                <button
                  type="button"
                  onClick={onSignOutGuest}
                  className="flex-1 rounded-full border-2 border-white/60 text-white/90 font-semibold py-2 hover:bg-white/20 transition"
                >
                  Salir
                </button>
              </div>
            </div>
          </div>
        )}

        <section className="mt-4 md:mt-5">
          {loading ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Cargando estado de usuario...</p>
            </div>
          ) : (
            renderTabContent()
          )}
        </section>
      </main>

      {!isResetPasswordRoute && showAppNav && (
        <BottomNav
          activeTab={activeTab}
          onChange={setActiveTab}
          isAdmin={Boolean(user?.isAdmin)}
          hasMobileBanner={hasMobileBanner}
        />
      )}

      {!isResetPasswordRoute && (
        <InstallPwaPrompt liftedForNav={showAppNav} />
      )}

      {popupQueue.length > 0 && !isResetPasswordRoute && (
        <div className="pointer-events-none fixed right-3 top-3 z-50 flex w-[min(24rem,calc(100%-1.5rem))] flex-col gap-2 md:right-6 md:top-6">
          {popupQueue.map((item) => (
            <div key={item.id} className="pointer-events-auto rounded-2xl border border-emerald-200 bg-white p-3 shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Recordatorio</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{item.title}</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {item.petName} · vence {new Date(item.dueDate).toLocaleDateString()}
                    {item.doseTime ? ` a las ${item.doseTime}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => closeReminderPopup(item.id)}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                >
                  Cerrar
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('agenda');
                  closeReminderPopup(item.id);
                }}
                className="mt-2 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Ver agenda
              </button>
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => {
                    void handlePopupDone(item.id);
                  }}
                  className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
                >
                  Realizado
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handlePopupDiscard(item.id);
                  }}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={() => setPopupPostponeId((current) => (current === item.id ? null : item.id))}
                  className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
                >
                  Posponer
                </button>
              </div>
              {popupPostponeId === item.id && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {[5, 10, 15, 30].map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => {
                        void handlePopupPostpone(item.id, minutes);
                      }}
                      className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700"
                    >
                      {minutes} min
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileAdsGate() {
  const { subscription, user } = useAppState();

  useEffect(() => {
    if (!isNativeAndroidApp()) return;

    const shouldShowAds = Boolean(user && !user.isGuest && !subscription.isPremiumUser);

    if (shouldShowAds) {
      void showBannerForNonPremium();
    } else {
      void hideBannerAd();
    }

    return () => {
      void hideBannerAd();
    };
  }, [subscription.isPremiumUser, user]);

  return null;
}

export default function App() {
  const [user, setUser] = useState<AppUser | null>(() => (shouldAutoStartAsGuest() ? createGuestUser() : null));
  const [loading] = useState<boolean>(false);
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('pets');
  const [aiDailyUsage, setAiDailyUsage] = useState<number>(0);
  const [clinicalEntries, setClinicalEntries] = useState<ClinicalTimelineEntry[]>([]);
  const [preventiveTasks, setPreventiveTasks] = useState<PreventiveTask[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);

  const subscriptionState: SubscriptionState = useMemo(() => {
    const isSubscribed = Boolean(user?.subscription?.isActive);
    const isPremiumUser =
      user?.subscription?.plan === 'premium' && isSubscribed;

    return {
      isPremiumUser,
      isSubscribed,
      canAddPet: isPremiumUser || pets.length < FREE_PET_LIMIT,
      canUseAI: isPremiumUser || aiDailyUsage < FREE_AI_DAILY_LIMIT,
      freePetLimit: FREE_PET_LIMIT,
      freeAiDailyLimit: FREE_AI_DAILY_LIMIT,
    };
  }, [aiDailyUsage, pets.length, user?.subscription?.isActive, user?.subscription?.plan]);

  const contextValue: GlobalAppState = {
      user,
      loading,
      pets,
      selectedPetId,
      activeTab,
      aiDailyUsage,
      clinicalEntries,
      preventiveTasks,
      chatMessages,
      adminUsers,
      subscription: subscriptionState,
      setUser,
      setPets,
      setSelectedPetId,
      setActiveTab,
      setAiDailyUsage,
      setClinicalEntries,
      setPreventiveTasks,
      setChatMessages,
      setAdminUsers,
    };

  return (
    <AppStateContext.Provider value={contextValue}>
      <MobileAdsGate />
      <AppContent />
    </AppStateContext.Provider>
  );
}
