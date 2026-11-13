import type { Pet, PetLifeStage, PetSizeCategory, PetType, ShopCategory, ShopCompatibility, ShopProduct } from '../types';

export const SHOP_CATEGORIES: Array<{ id: ShopCategory; label: string; group: OfferGroup }> = [
  { id: 'alimentos', label: 'Alimentacion', group: 'alimentos' },
  { id: 'juguetes', label: 'Juguetes', group: 'descanso' },
  { id: 'paseo', label: 'Paseo y transporte', group: 'accesorios' },
  { id: 'higiene', label: 'Higiene y cuidado', group: 'higiene' },
  { id: 'salud', label: 'Salud y bienestar', group: 'salud' },
  { id: 'entrenamiento', label: 'Entrenamiento', group: 'accesorios' },
  { id: 'descanso', label: 'Descanso y accesorios', group: 'descanso' },
  { id: 'tecnologia', label: 'Tecnologia', group: 'tecnologia' },
];
type OfferGroup = 'alimentos' | 'accesorios' | 'higiene' | 'descanso' | 'salud' | 'tecnologia';

export interface ShopPetProfile {
  species: PetType | null;
  stage: Exclude<PetLifeStage, 'todas'> | null;
  size: Exclude<PetSizeCategory, 'todos'> | null;
  sizeBasis: string | null;
  limitations: string[];
}

export function normalizeShopText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function shopPetProfile(pet: Pet | null, now = Date.now()): ShopPetProfile {
  if (!pet) return { species: null, stage: null, size: null, sizeBasis: null, limitations: ['Sin mascota seleccionada: recomendaciones generales.'] };
  const species = ({ dog: 'perro', cat: 'gato', other: 'otro' } as const)[pet.species];
  let months: number | null = null;
  if (pet.birthDate) {
    const birth = Date.parse(pet.birthDate);
    if (Number.isFinite(birth) && birth <= now) months = (now - birth) / (86400000 * 30.4375);
  } else if (Number.isFinite(pet.ageYears) && pet.ageYears >= 0 && Number.isFinite(pet.ageMonths) && pet.ageMonths >= 0 && pet.ageMonths < 12) {
    const age = pet.ageYears * 12 + pet.ageMonths;
    if (age > 0) months = age;
  }
  const breed = normalizeShopText(pet.breed || '');
  const largeBreed = ['golden retriever', 'labrador', 'labrador retriever', 'pastor aleman', 'gran danes'].includes(breed);
  const smallBreed = ['chihuahua', 'yorkshire terrier', 'pomerania', 'caniche toy'].includes(breed);
  let size: ShopPetProfile['size'] = null;
  let sizeBasis: string | null = null;
  if (species === 'perro' && (largeBreed || smallBreed)) {
    size = largeBreed ? 'grande' : 'pequeño';
    sizeBasis = 'Tamaño adulto orientativo por raza; verificar medidas del accesorio.';
  } else if (species === 'perro' && months !== null && months >= 18 && Number.isFinite(pet.weightKg) && pet.weightKg > 0) {
    size = pet.weightKg <= 10 ? 'pequeño' : pet.weightKg <= 25 ? 'mediano' : 'grande';
    sizeBasis = 'Tamaño orientativo por peso actual; no sustituye medidas corporales.';
  }
  const stage = months === null || species === 'otro' ? null
    : months < (species === 'perro' && largeBreed ? 18 : 12) ? 'cachorro'
      : months >= (species === 'gato' ? 120 : 84) ? 'senior' : 'adulto';
  const limitations = [];
  if (!stage) limitations.push('Edad insuficiente para determinar etapa de vida.');
  if (species === 'perro' && !size) limitations.push('No se infiere tamaño adulto a partir del peso de un cachorro.');
  if (species === 'otro') limitations.push('Especie sin criterios especificos de compatibilidad.');
  limitations.push('No se infieren alergias, necesidades clinicas ni preferencias a partir de notas libres.');
  return { species, stage, size, sizeBasis, limitations };
}

export function assessShopProduct(product: ShopProduct, profile: ShopPetProfile): { status: ShopCompatibility; reason: string; score: number } {
  const pairs: Array<[string | null, string[], string, string, boolean]> = [
    [profile.species, product.petTypes, '', 'especie', product.compatibilityEvidence?.species === true],
    [profile.stage, product.lifeStages, 'todas', 'etapa de vida', product.compatibilityEvidence?.stage === true],
    [profile.size, product.sizes, 'todos', 'tamaño', product.compatibilityEvidence?.size === true],
  ];
  let targeted = 0;
  let missing = !profile.species;
  for (const [value, allowed, wildcard, label, verified] of pairs) {
    if (!verified) { missing = true; continue; }
    if (value && allowed.length && !allowed.includes(value) && !allowed.includes(wildcard)) {
      return { status: 'not_recommended', reason: `No recomendado: la ${label} indicada no coincide con la mascota.`, score: -100 };
    }
    if (!allowed.length || (!value && !allowed.includes(wildcard))) missing = true;
    if (value && allowed.includes(value) && !allowed.includes(wildcard)) targeted += 1;
  }
  if (product.category === 'salud') return { status: 'unknown', reason: 'Salud y bienestar: requiere criterio veterinario; no se certifica adecuacion clinica.', score: 0 };
  if (missing) return { status: 'unknown', reason: 'Informacion insuficiente: faltan datos del perfil o de la publicacion. Verificar en Mercado Libre.', score: targeted };
  return targeted >= 2
    ? { status: 'recommended', reason: `Recomendado por coincidencia de especie y ${profile.stage || 'datos del perfil'}${profile.size ? `, tamaño ${profile.size}` : ''}; verificar especificaciones.`, score: 10 + targeted }
    : { status: 'compatible', reason: 'Compatible con las etiquetas disponibles, sin garantia de seguridad o ajuste fisico.', score: targeted };
}

export interface ShopFilters {
  category: ShopCategory | 'all';
  species: PetType | '';
  stage: PetLifeStage | '';
  size: PetSizeCategory | '';
  need: string;
  query: string;
  freeShipping: boolean;
  fastDelivery: boolean;
  sort: 'relevance' | 'price_asc' | 'price_desc';
}
export type ShopView = 'reference' | 'all' | 'any';
export function assessShopProductForPets(product: ShopProduct, profiles: ShopPetProfile[]) {
  const assessments = profiles.map(profile => assessShopProduct(product, profile));
  const matching = assessments.filter(a => a.status === 'compatible' || a.status === 'recommended').sort((a,b) => b.score-a.score);
  if (matching.length) return { ...matching[0], reason: `Compatible con al menos una mascota. ${matching[0].reason}` };
  if (assessments.length && assessments.every(a => a.status === 'not_recommended')) return assessments[0];
  return { status: 'unknown' as const, reason: 'Informacion insuficiente para comprobar compatibilidad con alguna mascota.', score: 0 };
}

export function filterShopProducts(products: ShopProduct[], profile: ShopPetProfile, filters: ShopFilters, view: ShopView = 'reference', profiles: ShopPetProfile[] = []): ShopProduct[] {
  const query = normalizeShopText(filters.query);
  const filtered = products.filter(p => {
    if (filters.category !== 'all' && p.category !== filters.category) return false;
    if (filters.freeShipping && !p.freeShipping || filters.fastDelivery && !p.fastDelivery) return false;
    if (filters.need && !p.needs.includes(filters.need)) return false;
    if (query) return normalizeShopText(`${p.title} ${p.brand || ''} ${p.attributes.map(a => a.value).join(' ')}`).includes(query);
    if (filters.species && (!p.compatibilityEvidence?.species || !p.petTypes.includes(filters.species))) return false;
    if (filters.stage && (!p.compatibilityEvidence?.stage || !p.lifeStages.includes(filters.stage) && !p.lifeStages.includes('todas'))) return false;
    if (filters.size && (!p.compatibilityEvidence?.size || !p.sizes.includes(filters.size) && !p.sizes.includes('todos'))) return false;
    if (view === 'all') return true;
    if (view === 'any') return ['recommended','compatible'].includes(assessShopProductForPets(p, profiles).status);
    const status = assessShopProduct(p, profile).status;
    return profile.species
      ? status === 'recommended' || status === 'compatible'
      : status !== 'not_recommended';
  });
  return filtered.sort((a, b) => {
    if (filters.sort === 'relevance') return assessShopProduct(b, profile).score - assessShopProduct(a, profile).score;
    if (!a.currency || !b.currency || a.currency !== b.currency) return a.currency?.localeCompare(b.currency || '') || 0;
    if (a.price === null) return b.price === null ? 0 : 1;
    if (b.price === null) return -1;
    return filters.sort === 'price_asc' ? a.price - b.price : b.price - a.price;
  });
}

export function shopMoney(value: number | null, currency: string | null): string {
  if (value === null || !currency) return 'No informado';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency }).format(value);
}

export function shopComparisonConclusion(products: ShopProduct[], profile: ShopPetProfile): string {
  if (products.length < 2) return 'Selecciona al menos dos productos para comparar.';
  return products.map(p => {
    const assessment = assessShopProduct(p, profile);
    return `${p.title}: ${assessment.reason} ${p.price === null || !p.checkedAt ? 'Precio no verificado; no se concluye que sea la opcion mas barata.' : `Precio consultado ${p.checkedAt}.`} ${p.presentation ? `Presentacion: ${p.presentation}.` : 'Presentacion no informada.'}`;
  }).join('\n');
}
