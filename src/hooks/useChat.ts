import { useCallback, useMemo } from 'react';
import { useAppState } from '../context/AppStateContext';
import type { ChatMessage } from '../types';
import { askPetAssistant, createChatMessage } from '../lib/supabase';

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
    chatMessages,
    subscription,
    aiDailyUsage,
    setChatMessages,
    setAiDailyUsage,
  } = useAppState();

  const canUseAI = subscription.canUseAI;

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
        throw new Error('Limite diario de IA alcanzado para plan gratuito.');
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

        const response = await askPetAssistant({
          petId,
          question: content,
          recentMessages,
        });

        if (response.answer) {
          assistantText = response.answer;
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

      if (!subscription.isPremiumUser) {
        setAiDailyUsage(aiDailyUsage + 1);
      }

      return assistantMessage;
    },
    [
      aiDailyUsage,
      canUseAI,
      messagesWithSystem,
      setAiDailyUsage,
      setChatMessages,
      subscription.isPremiumUser,
      user,
    ],
  );

  return {
    messages: messagesWithSystem,
    canUseAI,
    sendMessage,
  };
}
