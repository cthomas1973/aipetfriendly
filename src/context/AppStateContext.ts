import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import type {
  AdminUserRow,
  AppTab,
  AppUser,
  ChatMessage,
  ClinicalTimelineEntry,
  Pet,
  PreventiveTask,
  SubscriptionState,
} from '../types';

export interface GlobalAppState {
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

export const AppStateContext = createContext<GlobalAppState | null>(null);

export function useSessionGuard(userId: string | undefined) {
  const session = useRef({ userId, active: true, revision: 0 });
  if (session.current.userId !== userId) {
    session.current.userId = userId;
    session.current.revision += 1;
  }
  const revision = session.current.revision;
  useEffect(() => {
    session.current.active = true;
    return () => { session.current.active = false; };
  }, []);
  return useCallback(() => {
    if (!session.current.active || session.current.revision !== revision) {
      throw new Error('La sesion cambio durante la operacion. Recupera tus datos al volver a ingresar.');
    }
  }, [revision]);
}

export function useAppState(): GlobalAppState {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState debe utilizarse dentro de AppStateContext.Provider');
  }
  return context;
}
