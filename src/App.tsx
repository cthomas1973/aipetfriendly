import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CreditCard,
  Gift,
  MessageCircle,
  PawPrint,
} from 'lucide-react';
import { AgendaSection } from './components/AgendaSection';
import { AuthScreens } from './components/AuthScreens';
import { ChatSection } from './components/ChatSection';
import { PetsSection } from './components/PetsSection';
import {
  OffersSection,
  PaywallCard,
  SubscriptionBanner,
} from './components/SubscriptionComponents';
import { AppStateContext, useAppState } from './context/AppStateContext';
import { useSupabaseSync } from './hooks/useSupabaseSync';
import type {
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
  subscription: SubscriptionState;
  setUser: (user: AppUser | null) => void;
  setPets: (pets: Pet[]) => void;
  setSelectedPetId: (petId: string | null) => void;
  setActiveTab: (tab: AppTab) => void;
  setAiDailyUsage: (usage: number) => void;
  setClinicalEntries: (entries: ClinicalTimelineEntry[]) => void;
  setPreventiveTasks: (tasks: PreventiveTask[]) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
}

function BottomNav({
  activeTab,
  onChange,
}: {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
}) {
  const tabs: Array<{ id: AppTab; label: string; icon: typeof PawPrint }> = [
    { id: 'pets', label: 'Mascotas', icon: PawPrint },
    { id: 'clinical', label: 'Consultorio', icon: MessageCircle },
    { id: 'agenda', label: 'Agenda', icon: CalendarDays },
    { id: 'offers', label: 'Beneficios', icon: Gift },
    { id: 'subscription', label: 'Mi Cuenta', icon: CreditCard },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-emerald-100 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.55rem)] pt-2 backdrop-blur md:hidden">
      <ul className="grid grid-cols-5 gap-1">
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
}: {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
}) {
  const tabs: Array<{ id: AppTab; label: string; icon: typeof PawPrint }> = [
    { id: 'pets', label: 'Mascotas', icon: PawPrint },
    { id: 'clinical', label: 'Consultorio', icon: MessageCircle },
    { id: 'agenda', label: 'Agenda', icon: CalendarDays },
    { id: 'offers', label: 'Beneficios', icon: Gift },
    { id: 'subscription', label: 'Mi Cuenta', icon: CreditCard },
  ];

  return (
    <nav className="mb-5 hidden rounded-2xl bg-white/85 p-2 shadow-sm ring-1 ring-emerald-100 md:block">
      <ul className="grid grid-cols-5 gap-2">
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
    setActiveTab,
    setUser,
    subscription: subscriptionState,
  } = useAppState();
  const [showLogo, setShowLogo] = useState(true);

  // Sincronizar con Supabase
  useSupabaseSync();

  const onSignOutGuest = () => {
    setUser(null);
  };

  const renderTabContent = () => {
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

    if (activeTab === 'offers') {
      if (!subscriptionState.isPremiumUser) {
        return (
          <div className="space-y-4">
            <PaywallCard />
            <OffersSection />
          </div>
        );
      }
      return <OffersSection />;
    }

    return <PaywallCard />;
  };

  return (
    <div className="min-h-screen bg-[#EAF7F1] pb-24 md:pb-10">
      <main className="mx-auto w-full max-w-md px-4 pt-5 md:max-w-5xl md:px-6 md:pt-8">
        <div className="mb-3 text-center md:mb-5">
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
        </div>

        <DesktopTabNav activeTab={activeTab} onChange={setActiveTab} />

        {user && !user.isGuest && <SubscriptionBanner />}

        {user?.isGuest && (
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

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
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
      subscription: subscriptionState,
      setUser,
      setPets,
      setSelectedPetId,
      setActiveTab,
      setAiDailyUsage,
      setClinicalEntries,
      setPreventiveTasks,
      setChatMessages,
    };

  return (
    <AppStateContext.Provider value={contextValue}>
      <AppContent />
    </AppStateContext.Provider>
  );
}
