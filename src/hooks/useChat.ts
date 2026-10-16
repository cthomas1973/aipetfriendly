import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppState } from '../context/AppStateContext';
import type { ChatMessage } from '../types';
import { askPetAssistant, createChatMessage, fetchAiUsageSettings, fetchUserPetAiUsage } from '../lib/supabase';

const GUEST_USAGE_KEY = 'aipetfriendly.guest-ai-usage';

interface GuestUsageStorage {
  period: string;
  usage: Record<string, number>;
}

function currentUsagePeriodKey(): string {
  // Formato 'YYYY-MM', el consumo se reinicia al cambiar de mes.
  return new Date().toISOString().slice(0, 7);
}

const USAGE_RESET_DATE_FORMATTER = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

// Etiqueta legible del proximo reinicio mensual del cupo (coincide con el
// corte UTC que usa currentUsagePeriodKey, para no mostrar una fecha corrida).
function nextUsageResetLabel(): string {
  const now = new Date();
  const nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return USAGE_RESET_DATE_FORMATTER.format(nextReset);
}

function readGuestUsage(): Record<string, number> {
  const raw = window.localStorage.getItem(GUEST_USAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Partial<GuestUsageStorage>;
    if (parsed && parsed.period === currentUsagePeriodKey() && parsed.usage) {
      return parsed.usage;
    }
    return {};
  } catch {
    return {};
  }
}

function writeGuestUsage(usage: Record<string, number>): void {
  const payload: GuestUsageStorage = { period: currentUsagePeriodKey(), usage };
  window.localStorage.setItem(GUEST_USAGE_KEY, JSON.stringify(payload));
}

export interface SuggestedProduct {
  title: string;
  thumbnail: string | null;
  price: number | null;
  link: string;
}

const DEFAULT_LIMITS = {
  guestLimitPerPet: 3,
  freeLimitPerPet: 10,
  premiumLimitPerPet: 100,
};

const SYSTEM_PROMPT =
  'Eres un asistente veterinario preventivo. Brinda orientacion clara y responsable. Siempre aclara que no reemplazas consulta veterinaria presencial.';

// Mensaje mostrado cuando la IA no responde (timeout, error de red o del
// proveedor). Es un aviso de error, no debe confundirse con una respuesta
// real: se marca con `isError` en el ChatMessage y no se persiste como si
// fuera una respuesta valida.
const AI_ERROR_MESSAGE =
  'No pudimos obtener una respuesta en este momento. Puede ser un problema temporal de conexion o del servicio de IA. Toca "Reintentar" para volver a intentarlo.';

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
  const [sessionMessagesByPet, setSessionMessagesByPet] = useState<Record<string, ChatMessage[]>>({});
  const [suggestedProductByMessageId, setSuggestedProductByMessageId] = useState<Record<string, SuggestedProduct>>({});
  const [vetVisitRecommendedByMessageId, setVetVisitRecommendedByMessageId] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Cada inicio/cambio de sesion comienza con consultorio limpio.
    setSessionMessagesByPet({});
  }, [user?.id]);

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
        setUsageByPet(readGuestUsage());
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

  const historyMessages = useMemo(() => {
    if (!hasValidSelectedPet || !selectedPetId) {
      return [] as ChatMessage[];
    }

    return chatMessages.filter((message) => message.petId === selectedPetId && message.role !== 'system');
  }, [chatMessages, hasValidSelectedPet, selectedPetId]);

  const sessionMessages = useMemo(() => {
    if (!hasValidSelectedPet || !selectedPetId) {
      return [] as ChatMessage[];
    }

    return sessionMessagesByPet[selectedPetId] || [];
  }, [hasValidSelectedPet, selectedPetId, sessionMessagesByPet]);

  const messagesWithSystem = useMemo(() => {
    const system: ChatMessage = {
      id: 'system-seed',
      role: 'system',
      content: SYSTEM_PROMPT,
      createdAt: new Date().toISOString(),
    };

    return [system, ...sessionMessages];
  }, [sessionMessages]);

  // Llama al edge function de IA y devuelve el resultado normalizado. Si falla
  // (red, timeout, error del proveedor), NO lanza: devuelve `isError: true` y
  // un texto de aviso, para que quien llama decida como mostrarlo/persistirlo
  // sin tratarlo como una respuesta real.
  const requestAssistantAnswer = useCallback(
    async (
      content: string,
      petId: string,
      imageDataUrl: string | null | undefined,
      recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
    ) => {
      let text = '';
      let suggestedProduct: SuggestedProduct | null = null;
      let persistedImageUrl: string | null = null;
      let recommendVetVisit = false;
      let isError = false;

      try {
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
          imageBase64: imageDataUrl || null,
          guestContext,
        });

        if (response.answer) {
          text = response.answer;
        }

        if (response.suggestedProduct) {
          suggestedProduct = response.suggestedProduct;
        }

        if (response.imageUrl) {
          persistedImageUrl = response.imageUrl;
        }

        if (response.recommendVetVisit) {
          recommendVetVisit = true;
        }

        if (!text) {
          // Respuesta vacia del proveedor: se trata igual que un error para
          // no mostrar un mensaje de asistente en blanco.
          throw new Error('Respuesta vacia de la IA.');
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
            writeGuestUsage(next);
            return next;
          });
        }
      } catch (error) {
        console.error('No se pudo obtener respuesta de IA contextual:', error);
        isError = true;
        text = AI_ERROR_MESSAGE;
      }

      return { text, suggestedProduct, persistedImageUrl, recommendVetVisit, isError };
    },
    [clinicalEntries, pets, preventiveTasks, user],
  );

  const sendMessage = useCallback(
    async (content: string, petId: string | null, imageDataUrl?: string | null) => {
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
        petId,
        createdAt: new Date().toISOString(),
        imageUrl: imageDataUrl || null,
      };

      const nextMessages = [...messagesWithSystem, userMessage];
      const nextSessionMessages = nextMessages.filter((message) => message.role !== 'system');
      setSessionMessagesByPet((current) => ({
        ...current,
        [petId]: nextSessionMessages,
      }));
      setChatMessages([...chatMessages, userMessage]);

      const recentMessages = nextMessages
        .filter((message) => message.role !== 'system')
        .slice(-12)
        .map((message) => ({
          role: message.role as 'user' | 'assistant',
          content: message.content,
        }));

      const result = await requestAssistantAnswer(content, petId, imageDataUrl, recentMessages);

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.text,
        petId,
        createdAt: new Date().toISOString(),
        isError: result.isError || undefined,
      };

      if (result.suggestedProduct) {
        setSuggestedProductByMessageId((current) => ({
          ...current,
          [assistantMessage.id]: result.suggestedProduct as SuggestedProduct,
        }));
      }

      if (result.recommendVetVisit) {
        setVetVisitRecommendedByMessageId((current) => ({
          ...current,
          [assistantMessage.id]: true,
        }));
      }

      setSessionMessagesByPet((current) => ({
        ...current,
        [petId]: [...(current[petId] || []), assistantMessage],
      }));
      setChatMessages([...chatMessages, userMessage, assistantMessage]);

      if (user && !user.isGuest) {
        // Se persiste aca (despues de la respuesta) para poder guardar la URL
        // publica de Storage de la imagen, ya subida por el edge function.
        void createChatMessage(user.id, petId, 'user', content, result.persistedImageUrl);
        if (!result.isError) {
          // El aviso de error no es una respuesta real: no se guarda en el
          // historial persistido para no confundir futuras lecturas.
          void createChatMessage(user.id, petId, 'assistant', result.text);
        }
      }

      return assistantMessage;
    },
    [
      canUseAI,
      messagesWithSystem,
      chatMessages,
      setChatMessages,
      requestAssistantAnswer,
      user,
    ],
  );

  // Reintenta un mensaje de asistente marcado como error: reutiliza la
  // pregunta original del usuario (sin duplicarla ni volver a consumir cupo
  // en caso de otro fallo) y reemplaza el aviso de error por la respuesta
  // obtenida (o por un nuevo aviso de error si vuelve a fallar).
  const retryMessage = useCallback(
    async (assistantMessageId: string) => {
      const petId = selectedPetId;
      if (!petId) return;

      const list = sessionMessagesByPet[petId] || [];
      const idx = list.findIndex((message) => message.id === assistantMessageId);
      if (idx <= 0) return;

      const failedMessage = list[idx];
      const userMessage = list[idx - 1];
      if (!failedMessage.isError || userMessage.role !== 'user') return;

      const promptMessages = list
        .slice(0, idx)
        .filter((message) => message.role !== 'system')
        .slice(-12)
        .map((message) => ({
          role: message.role as 'user' | 'assistant',
          content: message.content,
        }));

      const result = await requestAssistantAnswer(userMessage.content, petId, userMessage.imageUrl, promptMessages);

      const updatedMessage: ChatMessage = {
        ...failedMessage,
        id: crypto.randomUUID(),
        content: result.text,
        createdAt: new Date().toISOString(),
        isError: result.isError || undefined,
      };

      if (result.suggestedProduct) {
        setSuggestedProductByMessageId((current) => ({
          ...current,
          [updatedMessage.id]: result.suggestedProduct as SuggestedProduct,
        }));
      }

      if (result.recommendVetVisit) {
        setVetVisitRecommendedByMessageId((current) => ({
          ...current,
          [updatedMessage.id]: true,
        }));
      }

      setSessionMessagesByPet((current) => {
        const currentList = current[petId] || [];
        return {
          ...current,
          [petId]: currentList.map((message) => (message.id === assistantMessageId ? updatedMessage : message)),
        };
      });
      setChatMessages(
        chatMessages.map((message) => (message.id === assistantMessageId ? updatedMessage : message)),
      );

      if (user && !user.isGuest && !result.isError) {
        // El mensaje del usuario ya se persistio en el intento original: solo
        // falta guardar la respuesta valida obtenida en el reintento.
        void createChatMessage(user.id, petId, 'assistant', result.text);
      }
    },
    [selectedPetId, sessionMessagesByPet, requestAssistantAnswer, chatMessages, setChatMessages, user],
  );

  return {
    messages: messagesWithSystem,
    historyMessages,
    canUseAI,
    hasValidSelectedPet,
    quota: {
      tier,
      limit: currentLimit,
      used: usedForSelectedPet,
      remaining: remainingForSelectedPet,
      premiumLimit: limits.premiumLimitPerPet,
      resetLabel: nextUsageResetLabel(),
    },
    sendMessage,
    retryMessage,
    suggestedProductByMessageId,
    vetVisitRecommendedByMessageId,
  };
}
