import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ functions: { invoke: vi.fn() } }),
}));

import { askPetAssistant, requestPetWeightInsight, supabase } from './supabase';

const validLink = 'https://articulo.mercadolibre.com.ar/MLA-1234567890?matt_tool=test-affiliate-value';
const product = { title: 'Producto sintetico', thumbnail: null, price: null };
const requests = [
  ['chat', () => askPetAssistant({ petId: 'pet-test', question: 'Consulta sintetica', recentMessages: [] })],
  ['peso', () => requestPetWeightInsight({ petId: 'pet-test', previousWeightKg: 10, currentWeightKg: 12, daysBetween: 30 })],
] as const;

afterEach(() => vi.restoreAllMocks());

describe.each(requests)('afiliacion en respuesta de %s', (_mode, request) => {
  it.each([
    ['URL ausente', undefined],
    ['URL null', null],
    ['URL externa', 'https://example.com/MLA-1234567890?matt_tool=test'],
    ['tracking ausente', 'https://articulo.mercadolibre.com.ar/MLA-1234567890'],
    ['tracking duplicado', `${validLink}&MATT_TOOL=other`],
  ])('neutraliza %s sin perder la respuesta de IA', async (_label, link) => {
    vi.spyOn(supabase.functions, 'invoke').mockResolvedValue({
      data: { answer: 'Respuesta sintetica', suggestedProduct: { ...product, link } }, error: null,
    });

    const response = await request();

    expect(response.answer).toBe('Respuesta sintetica');
    expect(response.suggestedProduct?.link).toBeNull();
  });

  it('conserva un enlace validado', async () => {
    vi.spyOn(supabase.functions, 'invoke').mockResolvedValue({
      data: { answer: 'Respuesta sintetica', suggestedProduct: { ...product, link: validLink } }, error: null,
    });

    expect((await request()).suggestedProduct?.link).toBe(validLink);
  });

  it('rechaza respuestas incompletas sin producto navegable', async () => {
    vi.spyOn(supabase.functions, 'invoke').mockResolvedValue({ data: {}, error: null });

    await expect(request()).rejects.toThrow(/Respuesta invalida/);
  });

  it('propaga errores de invocacion sin fabricar enlaces alternativos', async () => {
    vi.spyOn(supabase.functions, 'invoke').mockResolvedValue({
      data: null, error: new Error('Lectura simulada fallida'),
    });

    await expect(request()).rejects.toThrow('Lectura simulada fallida');
  });
});