import { useCallback, useMemo } from 'react';
import { useAppState } from '../context/AppStateContext';
import type { ChatMessage } from '../types';

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
    async (content: string) => {
      if (!canUseAI) {
        throw new Error('Limite diario de IA alcanzado para plan gratuito.');
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      };

      const nextMessages = [...messagesWithSystem, userMessage];
      setChatMessages(nextMessages);

      const assistantText = createAssistantFallback(content);
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: assistantText,
        createdAt: new Date().toISOString(),
      };

      setChatMessages([...nextMessages, assistantMessage]);
      if (!subscription.isPremiumUser) {
        setAiDailyUsage(aiDailyUsage + 1);
      }

      return assistantMessage;
    },
    [aiDailyUsage, canUseAI, messagesWithSystem, setAiDailyUsage, setChatMessages, subscription.isPremiumUser],
  );

  return {
    messages: messagesWithSystem,
    canUseAI,
    sendMessage,
  };
}
