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
import { NearbyVetsMapSection } from './components/NearbyVetsMapSection';
import { PetsSection } from './components/PetsSection';
import {
  OffersSection,
  PaywallCard,
  SubscriptionBanner,
} from './components/SubscriptionComponents';
import { AppStateContext, useAppState } from './context/AppStateContext';
import { signOut, useSupabaseSync } from './hooks/useSupabaseSync';
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

const FREE_PET_LIMIT = 2;
const FREE_AI_DAILY_LIMIT = 5;

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
}

function BottomNav({
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
    { id: 'offers', label: 'Beneficios', icon: Gift },
    { id: 'subscription', label: 'Mi Cuenta', icon: CreditCard },
  ];

  if (isAdmin) {
    tabs.push({ id: 'admin', label: 'Admin', icon: Shield });
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-emerald-100 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.55rem)] pt-2 backdrop-blur md:hidden">
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
    { id: 'offers', label: 'Beneficios', icon: Gift },
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
    setActiveTab,
    setUser,
  } = useAppState();
  const [showLogo, setShowLogo] = useState(true);
  const [switchingUser, setSwitchingUser] = useState(false);
  const [popupQueue, setPopupQueue] = useState<ReminderPopupItem[]>([]);
  const currentPath = window.location.pathname;

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const isRecoveryLink = hashParams.get('type') === 'recovery';
  const isResetPasswordRoute = currentPath === '/reset-password' || isRecoveryLink;

  // Sincronizar con Supabase
  useSupabaseSync();

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

        const dueDate = new Date(`${task.dueDate}T23:59:59`);
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
      }));

    if (dueItems.length > 0) {
      setPopupQueue(dueItems);
      const nextNotified = new Set([...notifiedSet, ...dueItems.map((item) => item.id)]);
      window.localStorage.setItem(`apf_popup_notified_${todayKey}`, JSON.stringify(Array.from(nextNotified)));
    }
  }, [pets, preventiveTasks, user]);

  const closeReminderPopup = (id: string) => {
    setPopupQueue((current) => current.filter((item) => item.id !== id));
  };

  const renderTabContent = () => {
    if (isResetPasswordRoute) {
      return <AuthScreens initialMode="reset-password" />;
    }

    if (!user) {
      return <AuthScreens />;
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
    <div className="min-h-screen bg-[#EAF7F1] pb-24 md:pb-10">
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

        {!isResetPasswordRoute && (
          <DesktopTabNav activeTab={activeTab} onChange={setActiveTab} isAdmin={Boolean(user?.isAdmin)} />
        )}

        {user && !user.isGuest && !isResetPasswordRoute && <SubscriptionBanner />}

        {user?.isGuest && !isResetPasswordRoute && (
          <div className="mb-5 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 p-4 shadow-md text-white">
            <p className="mb-3 text-sm font-semibold">Modo visitante · Los datos no se guardarán</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('subscription')}
                className="flex-1 rounded-full bg-white font-bold text-blue-600 py-2 hover:bg-gray-100 transition"
              >
                ✨ Crear cuenta
              </button>
              <button
                type="button"
                onClick={onSignOutGuest}
                className="flex-1 rounded-full border-2 border-white font-semibold py-2 hover:bg-white/20 transition"
              >
                Salir
              </button>
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

      {!isResetPasswordRoute && (
        <BottomNav activeTab={activeTab} onChange={setActiveTab} isAdmin={Boolean(user?.isAdmin)} />
      )}

      {popupQueue.length > 0 && !isResetPasswordRoute && (
        <div className="pointer-events-none fixed right-3 top-3 z-50 flex w-[min(24rem,calc(100%-1.5rem))] flex-col gap-2 md:right-6 md:top-6">
          {popupQueue.map((item) => (
            <div key={item.id} className="pointer-events-auto rounded-2xl border border-emerald-200 bg-white p-3 shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Recordatorio</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{item.title}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{item.petName} · vence {new Date(item.dueDate).toLocaleDateString()}</p>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
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
      <AppContent />
    </AppStateContext.Provider>
  );
}
