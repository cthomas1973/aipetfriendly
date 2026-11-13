import { describe, expect, it } from 'vitest';
import { assessShopProduct, filterShopProducts, shopComparisonConclusion, shopMoney, shopPetProfile } from './shop';
import type { Pet, ShopProduct } from '../types';
import type { ShopFilters } from './shop';

const pet: Pet = { id:'pet',userId:'owner',name:'Golden',breed:'Golden Retriever',species:'dog',sex:'unknown',ageYears:0,ageMonths:8,weightKg:15,createdAt:'',updatedAt:'' };
const food: ShopProduct = {
  id:'food',externalId:null,title:'Alimento cachorro grande',category:'alimentos',thumbnail:null,price:100,
  originalPrice:null,currency:'ARS',checkedAt:'2026-11-01T12:00:00Z',priceStatus:'ok',source:'supabase',
  brand:null,seller:null,presentation:null,attributes:[],petTypes:['perro'],lifeStages:['cachorro'],
  sizes:['grande'],needs:['alimentos'],freeShipping:false,fastDelivery:false,link:null,
  compatibilityEvidence:{species:true,stage:true,size:true},
};
const filters: ShopFilters = {category:'all',species:'',stage:'',size:'',need:'',query:'',freeShipping:false,fastDelivery:false,sort:'relevance'};

describe('Tienda personalizada', () => {
  it('Golden de ocho meses: cachorro grande, no tamaño mediano por peso actual', () => {
    const profile=shopPetProfile(pet);
    expect(profile).toMatchObject({species:'perro',stage:'cachorro',size:'grande'});
    expect(assessShopProduct(food,profile).status).toBe('recommended');
  });
  it('gato adulto y tamaño no inventado', () => {
    expect(shopPetProfile({...pet,species:'cat',breed:'mestizo',ageYears:3})).toMatchObject({species:'gato',stage:'adulto',size:null});
  });
  it('datos incompletos y cachorro mestizo no permiten inferir tamaño adulto', () => {
    const profile=shopPetProfile({...pet,breed:'mestizo',ageMonths:0,weightKg:0});
    expect(profile.stage).toBeNull();expect(profile.size).toBeNull();
    expect(assessShopProduct({...food,lifeStages:[],sizes:[]},profile).status).toBe('unknown');
  });
  it('edad por fecha de nacimiento y peso adulto conocido', () => {
    expect(shopPetProfile({...pet,breed:'mestizo',birthDate:'2020-01-01',weightKg:28},Date.parse('2026-01-01'))).toMatchObject({stage:'adulto',size:'grande'});
  });
  it('oculta incompatibles en recomendaciones, no en busqueda explicita', () => {
    const cat={...food,id:'cat',title:'Rascador gato adulto',petTypes:['gato'] as const,lifeStages:['adulto'] as const};
    const catProduct: ShopProduct={...cat,petTypes:[...cat.petTypes],lifeStages:[...cat.lifeStages]};
    expect(filterShopProducts([food,catProduct],shopPetProfile(pet),filters).map(p=>p.id)).toEqual(['food']);
    const results=filterShopProducts([food,catProduct],shopPetProfile(pet),{...filters,query:'rascador'});
    expect(results).toHaveLength(1);expect(assessShopProduct(results[0],shopPetProfile(pet)).status).toBe('not_recommended');
  });
  it('oculta compatibilidad no verificada en la vista de mascota, pero la conserva en el catalogo completo', () => {
    const unknown={...food,id:'unknown',compatibilityEvidence:undefined};
    const speciesOnly={...food,id:'species-only',compatibilityEvidence:{species:true,stage:false,size:false}};
    expect(filterShopProducts([food,unknown],shopPetProfile(pet),filters).map(p=>p.id)).toEqual(['food']);
    expect(filterShopProducts([food,speciesOnly],shopPetProfile(pet),{...filters,species:'perro'}).map(p=>p.id)).toEqual(['food']);
    expect(filterShopProducts([food,unknown],shopPetProfile(pet),filters,'all')).toHaveLength(2);
    expect(filterShopProducts([food,unknown],shopPetProfile(null),filters).map(p=>p.id)).toContain('unknown');
  });
  it('filtros por especie, edad y tamaño', () => {
    const products=[food,{...food,id:'senior',lifeStages:['senior'] as ShopProduct['lifeStages']}];
    expect(filterShopProducts(products,shopPetProfile(null),{...filters,species:'perro',stage:'cachorro',size:'grande'}).map(p=>p.id)).toEqual(['food']);
    expect(filterShopProducts(products,shopPetProfile(null),{...filters,species:'gato'})).toEqual([]);
  });
  it('clasifica salud como informacion insuficiente, no garantia clinica', () => {
    expect(assessShopProduct({...food,category:'salud'},shopPetProfile(pet)).status).toBe('unknown');
  });
  it('orden de precio pone desconocidos al final y no compara monedas', () => {
    const p=filterShopProducts([{...food,id:'missing',price:null},{...food,id:'low',price:10},food],shopPetProfile(pet),{...filters,sort:'price_asc'});
    expect(p.map(x=>x.id)).toEqual(['low','food','missing']);
    expect(shopMoney(100,null)).toBe('No informado');
    expect(shopMoney(null,'ARS')).toBe('No informado');
  });
  it('comparacion incompleta no inventa marca, presentacion ni precio barato', () => {
    expect(shopComparisonConclusion([food,{...food,id:'other',price:null}],shopPetProfile(pet))).toContain('no se concluye');
    expect(shopComparisonConclusion([food,{...food,id:'other'}],shopPetProfile(pet))).toContain('Presentacion no informada');
  });
  it('etiquetas sin investigacion comprobada no certifican compatibilidad ni se filtran como verificadas',()=>{
    const unknown={...food,compatibilityEvidence:undefined};
    expect(assessShopProduct(unknown,shopPetProfile(pet)).status).toBe('unknown');
    expect(filterShopProducts([unknown],shopPetProfile(pet),{...filters,species:'perro'})).toEqual([]);
  });
  it('catalogo completo no oculta incompatibles y vista varias mascotas usa OR sin incluir desconocidos',()=>{
    const cat={...food,id:'cat',petTypes:['gato'] as ShopProduct['petTypes'],lifeStages:['adulto'] as ShopProduct['lifeStages'],sizes:['todos'] as ShopProduct['sizes']};
    const unknown={...food,id:'unknown',compatibilityEvidence:undefined};
    const dogProfile=shopPetProfile(pet),catProfile=shopPetProfile({...pet,species:'cat',ageYears:4});
    expect(filterShopProducts([food,cat,unknown],dogProfile,filters,'all')).toHaveLength(3);
    expect(filterShopProducts([food,cat,unknown],dogProfile,filters,'any',[dogProfile,catProfile]).map(p=>p.id)).toEqual(['food','cat']);
    expect(food.petTypes).toEqual(['perro']); // Filtrar nunca modifica el producto compartido.
  });
});
