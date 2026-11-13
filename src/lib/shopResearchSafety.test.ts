import { describe, expect, it } from 'vitest';
import { publicShopResearch } from '../../supabase/functions/_shared/shopResearchRecord.mjs';

const source = { source: 'https://example.org/ficha', researchedAt: '2026-11-12T12:00:00Z' };
const record = {
  title: 'Alimento para perros',
  permalink: 'https://articulo.mercadolibre.com.ar/MLA-123456789',
  description: null,
  brand: null,
  images: [],
  category: 'alimentos',
  petTypes: ['perro'],
  lifeStages: ['adulto'],
  sizes: ['pequeño'],
  attributes: [],
  limitations: [],
  provenance: { title: source, permalink: source, category: source, petTypes: source, lifeStages: source, sizes: source },
};

describe('Cuarentena de compatibilidad sin verificacion por SKU', () => {
  it.each(['unknown', 'partial', 'conflict', 'confirmed'])(
    'no habilita la ficha heredada con estado %s',
    status => {
      const result = publicShopResearch({
        research_record: { ...record, verification: { status, enabled: true } },
        researched_at: '2026-11-12T12:00:00Z',
        approval_status: 'approved',
      });
      expect(result.research).not.toBeNull();
      expect(result.compatibilityEvidence).toEqual({ species: false, stage: false, size: false });
    },
  );

  it('no habilita datos al editar una ficha', () => {
    const result = publicShopResearch({
      research_record: { ...record, petTypes: ['gato'] },
      researched_at: '2026-11-12T12:00:00Z',
      approval_status: 'approved',
    });
    expect(result.compatibilityEvidence).toEqual({ species: false, stage: false, size: false });
  });

  it('solo acepta las tres dimensiones validadas por el servidor', () => {
    const row = { research_record: record, researched_at: '2026-11-12T12:00:00Z', approval_status: 'approved' };
    const dimensions = { species: ['perro'], stage: ['adulto'], size: ['pequeño'] };
    expect(publicShopResearch({ ...row, compatibility_dimensions: { ...dimensions, size: [] } }).compatibilityEvidence.species).toBe(false);
    expect(publicShopResearch({ ...row, compatibility_dimensions: dimensions }).compatibilityEvidence).toEqual({ species: true, stage: true, size: true });
  });
});
