import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateEditorialContent, evaluateEditorialTopic, validateEditorialTopic } from '../api/cron/_editorial-policy.js';
import { VETERINARY_REVIEW_REQUIRED_BLOG_SLUGS } from '../shared/seoMeta.mjs';

describe('politica editorial ordinaria', () => {
  it('permite planificacion y cuidado cotidiano', () => {
    expect(evaluateEditorialTopic('Cómo preparar vacaciones y organizar el cuidado cotidiano de un gato').status).toBe('allowed');
    expect(evaluateEditorialTopic('Cómo organizar los horarios de alimentación habitual de tu gato').status).toBe('allowed');
    expect(evaluateEditorialTopic('Qué preparar antes de adoptar un gatito').status).toBe('allowed');
  });

  it.each([
    'Diagnóstico de enfermedades en gatos',
    'Cómo identificar síntomas de una enfermedad',
    'Tratamientos y medicamentos para mascotas',
    'Qué hacer si una mascota se atraganta',
    'Primeros auxilios para perros',
    'Cómo interpretar análisis veterinarios',
    'Convulsiones en perros: causas y qué hacer',
    'Qué significa la fiebre en un gato',
    'Dietas terapéuticas para gatos',
    'Cómo curar una infección en casa',
    'Procedimientos invasivos para mascotas',
  ])('excluye el tema clínico: %s', (title) => {
    expect(evaluateEditorialTopic(title).status).toBe('excluded');
  });

  it('no permite que un descargo convierta un tema excluido en permitido', () => {
    const result = evaluateEditorialContent({ title: 'Qué hacer si una mascota se atraganta', content: 'Esta información no reemplaza la consulta veterinaria.' });
    expect(result).toMatchObject({ status: 'excluded', code: 'urgent_care' });
  });

  it('revalida como cotidiano el tema que requiere reformulación', () => {
    const result = validateEditorialTopic('Ansiedad en gatos: señales y soluciones');
    expect(result).toMatchObject({ status: 'reformulate', validated: true, reformulated: { status: 'allowed' } });
  });

  it('detecta instrucciones clínicas agregadas a un tema permitido', () => {
    expect(evaluateEditorialContent({ title: 'Rutinas cotidianas', content: 'Administrá una dosis de medicamento antes del viaje.' }).status).toBe('excluded');
    expect(evaluateEditorialContent({ title: 'Rutinas cotidianas', content: 'Si el gato presenta vómitos, esperá a ver si se le pasa.' }).status).toBe('excluded');
  });

  it('permite solo documentar instrucciones vigentes de medicación ya prescrita', () => {
    expect(evaluateEditorialContent({ title: 'Organizar las vacaciones', content: 'Si toma una medicación prescrita por su veterinaria, dejá las instrucciones vigentes que te dio el profesional.' }).status).toBe('allowed');
    expect(evaluateEditorialContent({ title: 'Organizar las vacaciones', content: 'Si toma una medicación prescrita por su veterinaria, cambiá la dosis antes del viaje.' }).status).toBe('excluded');
    expect(evaluateEditorialContent({ title: 'Organizar las vacaciones', content: 'Si toma una medicación prescrita por su veterinaria, dejá las instrucciones vigentes que te dio el profesional.\n\nCambiá la dosis del medicamento antes del viaje.' }).status).toBe('excluded');
  });

  it('mantiene sincronizadas las retenciones del sitio y las RPC públicas de Supabase', () => {
    const migration = readFileSync(new URL('../supabase/migrations/065_blog_public_editorial_retention.sql', import.meta.url), 'utf8');
    for (const slug of VETERINARY_REVIEW_REQUIRED_BLOG_SLUGS) {
      expect(migration.split(slug)).toHaveLength(3);
    }
    expect(migration).toContain('public.list_blog_posts');
    expect(migration).toContain('public.get_blog_post_by_slug');
    expect(migration).not.toContain('admin_list_blog_posts');
    expect(migration.toLowerCase()).not.toContain('delete from');
  });
});
