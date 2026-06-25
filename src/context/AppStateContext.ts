import { createContext, useContext } from 'react';
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

export function useAppState(): GlobalAppState {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState debe utilizarse dentro de AppStateContext.Provider');
  }
  return context;
}
