export function safeAiResponse(options: {
  mode?: 'chat' | 'shopping' | 'weight_insight';
  question: string;
  modelAnswer?: string;
  products?: Array<{ title: string }>;
  hasImage?: boolean;
  searched?: boolean;
}): string;
