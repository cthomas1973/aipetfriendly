const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const source = value => value && typeof value.source === 'string' && value.source.length > 0 && date(value.researchedAt);
const categories = ['alimentos','juguetes','paseo','higiene','salud','entrenamiento','descanso','tecnologia'];
export function isShopResearchRecord(record) {
  if (!record || typeof record !== 'object' || typeof record.title !== 'string' || !record.title.trim()
    || typeof record.permalink !== 'string' || !/^https:\/\/(articulo\.mercadolibre\.com\.ar|www\.mercadolibre\.com\.ar)\//.test(record.permalink)
    || !categories.includes(record.category) || !record.provenance || typeof record.provenance !== 'object') return false;
  for (const [field, allowed] of [
    ['petTypes',['perro','gato','otro']], ['lifeStages',['cachorro','adulto','senior','todas']],
    ['sizes',['pequeño','mediano','grande','todos']],
  ]) {
    if (!Array.isArray(record[field]) || !record[field].every(v => allowed.includes(v))) return false;
  }
  if (!Array.isArray(record.images) || !record.images.every(v => typeof v === 'string' && /^https:\/\//.test(v))
    || !Array.isArray(record.limitations) || !record.limitations.every(v => typeof v === 'string')
    || !Array.isArray(record.attributes) || !record.attributes.every(a => a && typeof a.name === 'string'
      && typeof a.value === 'string' && source(a))) return false;
  for (const field of ['description','brand']) if (record[field] !== null && typeof record[field] !== 'string') return false;
  for (const field of ['title','permalink','description','brand','images','category','petTypes','lifeStages','sizes']) {
    if (record[field] !== null && (!Array.isArray(record[field]) || record[field].length) && !source(record.provenance[field])) return false;
  }
  return true;
}
export function publicShopResearch(row) {
  const research = isShopResearchRecord(row.research_record) ? row.research_record : null;
  const d = row.compatibility_dimensions;
  const valid = d && [
    ['species',['perro','gato','otro']], ['stage',['cachorro','adulto','senior','todas']],
    ['size',['pequeño','mediano','grande','todos']],
  ].every(([key, allowed]) => Array.isArray(d[key]) && d[key].length > 0 && d[key].every(value => allowed.includes(value)));
  const verifiedDimensions = valid ? { species: d.species, stage: d.stage, size: d.size } : null;
  return {
    catalogProductId: row.catalog_product_id || null, research,
    researchedAt: date(row.researched_at) ? row.researched_at : null,
    approvalStatus: row.approval_status || 'approved',
    verifiedDimensions,
    compatibilityEvidence: {
      species: Boolean(valid), stage: Boolean(valid), size: Boolean(valid),
    },
  };
}
