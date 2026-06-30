import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppState } from '../context/AppStateContext';
import type { ChatMessage } from '../types';
import { askPetAssistant, createChatMessage, fetchAiUsageSettings, fetchUserPetAiUsage } from '../lib/supabase';

const GUEST_USAGE_KEY = 'aipetfriendly.guest-ai-usage';

const DEFAULT_LIMITS = {
  guestLimitPerPet: 3,
  freeLimitPerPet: 10,
  premiumLimitPerPet: 100,
};

const SYSTEM_PROMPT =
  'Eres un asistente veterinario preventivo. Brinda orientacion clara y responsable. Siempre aclara que no reemplazas consulta veterinaria presencial.';

function createAssistantFallback(userInput: string): string {
  return [
    'Gracias por tu consulta. Como guia preventiva, te sugiero observar sintomas por 24 horas y registrar cambios.',
    `Consulta recibida: "${userInput}".`,
    'Importante: esta asistencia no reemplaza al veterinario presencial.',
  ].join(' ');
}

export function useChat() {
  const {
    user,
    pets,
    selectedPetId,
    clinicalEntries,
    preventiveTasks,
    chatMessages,
    subscription,
    setChatMessages,
  } = useAppState();

  const [limits, setLimits] = useState(DEFAULT_LIMITS);
  const [usageByPet, setUsageByPet] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;

    const loadLimits = async () => {
      try {
        const settings = await fetchAiUsageSettings();
        if (!cancelled) {
          setLimits(settings);
        }
      } catch (error) {
        console.error('No se pudieron cargar los limites IA, se usan defaults:', error);
      }
    };

    void loadLimits();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadUsage = async () => {
      if (!user) {
        setUsageByPet({});
        return;
      }

      if (user.isGuest) {
        const raw = window.localStorage.getItem(GUEST_USAGE_KEY);
        if (!raw) {
          setUsageByPet({});
          return;
        }

        try {
          const parsed = JSON.parse(raw) as Record<string, number>;
          setUsageByPet(parsed || {});
        } catch {
          setUsageByPet({});
        }
        return;
      }

      try {
        const rows = await fetchUserPetAiUsage();
        if (!cancelled) {
          const next: Record<string, number> = {};
          rows.forEach((row) => {
            next[row.petId] = row.usageCount;
          });
          setUsageByPet(next);
        }
      } catch (error) {
        console.error('No se pudo cargar el consumo IA por mascota:', error);
      }
    };

    void loadUsage();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const tier: 'guest' | 'free' | 'premium' = user?.isGuest
    ? 'guest'
    : subscription.isPremiumUser
      ? 'premium'
      : 'free';

  const currentLimit = tier === 'guest'
    ? limits.guestLimitPerPet
    : tier === 'premium'
      ? limits.premiumLimitPerPet
      : limits.freeLimitPerPet;

  const hasValidSelectedPet = Boolean(selectedPetId && pets.some((pet) => pet.id === selectedPetId));
  const usedForSelectedPet = hasValidSelectedPet && selectedPetId ? (usageByPet[selectedPetId] || 0) : 0;
  const remainingForSelectedPet = Math.max(0, currentLimit - usedForSelectedPet);
  const canUseAI = hasValidSelectedPet && remainingForSelectedPet > 0;

  const messagesWithSystem = useMemo(() => {
    const hasSystem = chatMessages.some((message) => message.role === 'system');
    if (hasSystem) {
      return chatMessages;
    }

    const system: ChatMessage = {
      id: 'system-seed',
      role: 'system',
      content: SYSTEM_PROMPT,
      createdAt: new Date().toISOString(),
    };

    return [system, ...chatMessages];
  }, [chatMessages]);

  const sendMessage = useCallback(
    async (content: string, petId: string | null) => {
      if (!canUseAI) {
        throw new Error('Limite de consultas IA alcanzado para esta mascota.');
      }

      if (!petId) {
        throw new Error('Selecciona una mascota para recibir una respuesta personalizada.');
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      };

      const nextMessages = [...messagesWithSystem, userMessage];
      setChatMessages(nextMessages);

      if (user && !user.isGuest) {
        void createChatMessage(user.id, 'user', content);
      }

      let assistantText = createAssistantFallback(content);
      try {
        const recentMessages = nextMessages
          .filter((message) => message.role !== 'system')
          .slice(-12)
          .map((message) => ({
            role: message.role as 'user' | 'assistant',
            content: message.content,
          }));

        const selectedPet = pets.find((pet) => pet.id === petId) ?? null;

        const guestContext = user?.isGuest && selectedPet
          ? {
              pet: {
                id: selectedPet.id,
                name: selectedPet.name,
                species: selectedPet.species,
                breed: selectedPet.breed,
                sex: selectedPet.sex,
                ageYears: selectedPet.ageYears,
                ageMonths: selectedPet.ageMonths,
                weightKg: selectedPet.weightKg,
                notes: selectedPet.notes || null,
              },
              clinicalEntries: clinicalEntries
                .filter((entry) => entry.petId === petId)
                .slice(0, 30)
                .map((entry) => ({
                  eventDate: entry.eventDate,
                  category: entry.category,
                  title: entry.title,
                  description: entry.description,
                })),
              preventiveTasks: preventiveTasks
                .filter((task) => task.petId === petId)
                .slice(0, 30)
                .map((task) => ({
                  dueDate: task.dueDate,
                  category: task.category,
                  title: task.title,
                  completed: Boolean(task.completed),
                  notes: task.notes || null,
                })),
            }
          : undefined;

        const response = await askPetAssistant({
          petId,
          question: content,
          recentMessages,
          guestContext,
        });

        if (response.answer) {
          assistantText = response.answer;
        }

        if (response.usage && petId) {
          setUsageByPet((current) => ({
            ...current,
            [petId]: response.usage?.used || 0,
          }));
        } else if (user?.isGuest && petId) {
          setUsageByPet((current) => {
            const next = {
              ...current,
              [petId]: (current[petId] || 0) + 1,
            };
            window.localStorage.setItem(GUEST_USAGE_KEY, JSON.stringify(next));
            return next;
          });
        }
      } catch (error) {
        console.error('No se pudo obtener respuesta de IA contextual:', error);
      }

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: assistantText,
        createdAt: new Date().toISOString(),
      };

      setChatMessages([...nextMessages, assistantMessage]);

      if (user && !user.isGuest) {
        void createChatMessage(user.id, 'assistant', assistantText);
      }

      return assistantMessage;
    },
    [
      canUseAI,
      clinicalEntries,
      messagesWithSystem,
      setChatMessages,
      pets,
      preventiveTasks,
      user,
    ],
  );

  return {
    messages: messagesWithSystem,
    canUseAI,
    hasValidSelectedPet,
    quota: {
      tier,
      limit: currentLimit,
      used: usedForSelectedPet,
      remaining: remainingForSelectedPet,
    },
    sendMessage,
  };
}
