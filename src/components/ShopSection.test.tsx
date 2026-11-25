// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopSection } from './ShopSection';
import { CHAPITA_QR_PRODUCT } from '../data/ownProducts';
import type { Pet, ShopProduct } from '../types';

const mocks=vi.hoisted(()=>({catalog:vi.fn(),history:vi.fn(),viewed:vi.fn(),ask:vi.fn(),state:{pets:[] as Pet[],selectedPetId:null as string|null,user:null as {id:string}|null,setSelectedPetId:vi.fn()}}));
vi.mock('../context/AppStateContext',()=>({useAppState:()=>mocks.state}));
vi.mock('../lib/supabase',()=>({fetchShopCatalog:mocks.catalog,fetchShopPriceHistory:mocks.history,markShopProductViewed:mocks.viewed}));
vi.mock('../hooks/useChat',()=>({useChat:()=>({sendMessage:mocks.ask})}));
const dog:Pet={id:'dog',userId:'owner',name:'Golden',breed:'Golden Retriever',species:'dog',sex:'unknown',ageYears:0,ageMonths:8,weightKg:15,createdAt:'',updatedAt:''};
const cat:Pet={...dog,id:'cat',name:'Gato',breed:'mestizo',species:'cat',ageYears:4};
const food:ShopProduct={id:'71000000-0000-4000-8000-000000000001',externalId:'MLA1234567890',title:'Alimento cachorro grande',category:'alimentos',thumbnail:null,price:100,originalPrice:null,currency:'ARS',checkedAt:'2026-01-01T12:00:00Z',priceStatus:'ok',source:'supabase',seller:null,brand:null,presentation:null,attributes:[],petTypes:['perro'],lifeStages:['cachorro'],sizes:['grande'],needs:['alimentos'],freeShipping:false,fastDelivery:false,link:null,compatibilityEvidence:{species:true,stage:true,size:true}};
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.state.pets=[dog,cat];mocks.state.selectedPetId='dog';mocks.state.user={id:'owner'};
  mocks.catalog.mockResolvedValue({products:[food,{...food,id:'catfood',title:'Alimento gato adulto',petTypes:['gato'],lifeStages:['adulto'],sizes:['todos']}],warning:null});
  mocks.history.mockResolvedValue([{productId:food.id,price:100,regularPrice:null,promotionalPrice:null,currency:'ARS',lastSuccessAt:'2026-01-01T12:00:00Z',lastAttemptAt:'2026-01-02T12:00:00Z',status:'error',error:'No pudimos actualizar el precio',minimum:80,maximum:120,changes:[{detectedAt:'2026-01-01T12:00:00Z',previousPrice:120,price:100,difference:-20,percent:-16.67,direction:'down'}]}]);
  mocks.viewed.mockResolvedValue(undefined);mocks.ask.mockResolvedValue({content:'Orientacion con datos reales',isError:false});
});
afterEach(()=>cleanup());
describe('Tienda integrada',()=>{
  it('prioriza Golden cachorro y cambia a gato sin mezclar referencias',async()=>{
    const view=render(<ShopSection />);
    await screen.findByRole('heading',{name:food.title});
    expect(screen.queryByRole('heading',{name:'Alimento gato adulto'})).toBeNull();
    fireEvent.change(screen.getByLabelText('Mascota de referencia'),{target:{value:'cat'}});
    expect(mocks.state.setSelectedPetId).toHaveBeenCalledWith('cat');
    mocks.state.selectedPetId='cat';view.rerender(<ShopSection />);
    await screen.findByRole('heading',{name:'Alimento gato adulto'});
    expect(screen.queryByRole('heading',{name:food.title})).toBeNull();
  });
  it('busqueda explicita muestra producto incompatible con advertencia',async()=>{
    render(<ShopSection />);await screen.findByRole('heading',{name:food.title});
    fireEvent.click(screen.getByRole('button',{name:/Filtros y busqueda/}));
    fireEvent.change(screen.getByLabelText('Buscar productos'),{target:{value:'gato'}});
    await screen.findByRole('heading',{name:'Alimento gato adulto'});
    expect(screen.getByText('No recomendado')).toBeTruthy();
  });
  it('comparador muestra No informado y precios antiguos, sin inventar vendedor',async()=>{
    render(<ShopSection />);await screen.findByRole('heading',{name:food.title});
    fireEvent.click(screen.getByRole('button',{name:/^Comparar$/}));
    const comparison=screen.getByRole('region',{name:'Comparador'});
    expect(within(comparison).getAllByText('No informado').length).toBeGreaterThan(0);
    expect(within(comparison).getByText(/Precio no actualizado/)).toBeTruthy();
  });
  it('historial usa registros reales y conserva fecha ante error',async()=>{
    render(<ShopSection />);await screen.findByRole('heading',{name:food.title});
    fireEvent.click(screen.getByRole('button',{name:'Historial de precios'}));
    await screen.findByText('No pudimos actualizar el precio');
    expect(mocks.history).toHaveBeenCalledWith([food.id]);
    expect(screen.getAllByText(/16.67%/)).toHaveLength(2);
    expect(screen.getByRole('table')).toBeTruthy();
  });
  it('asesor usa IDs del catalogo, sin especificaciones ni precios del cliente',async()=>{
    mocks.ask.mockResolvedValue({content:'Orientacion con datos reales',isError:false,shoppingProducts:[{id:food.id,title:food.title}]});
    render(<ShopSection />);await screen.findByRole('heading',{name:food.title});
    fireEvent.click(screen.getByRole('button',{name:/Asesor de compras contextual/}));
    fireEvent.change(screen.getByLabelText('Pregunta al asesor'),{target:{value:'Que alimento conviene?'}});
    fireEvent.click(screen.getByRole('button',{name:'Consultar asesor'}));
    await screen.findByText('Orientacion con datos reales');
    expect(mocks.ask).toHaveBeenCalledWith('Que alimento conviene?','dog',null,[food.id]);
    const advisorAnswer=screen.getByText('Orientacion con datos reales').parentElement as HTMLElement;
    expect(within(advisorAnswer).getByRole('heading',{name:food.title})).toBeTruthy();
    expect(within(advisorAnswer).getByText('Enlace de compra temporalmente no disponible')).toBeTruthy();
  });
  it('error IA no se presenta como respuesta exitosa',async()=>{
    mocks.ask.mockResolvedValue({content:'Servicio IA no disponible',isError:true});
    render(<ShopSection />);await screen.findByRole('heading',{name:food.title});
    fireEvent.click(screen.getByRole('button',{name:/Asesor de compras contextual/}));
    fireEvent.change(screen.getByLabelText('Pregunta al asesor'),{target:{value:'Ayuda'}});
    fireEvent.click(screen.getByRole('button',{name:'Consultar asesor'}));
    expect((await screen.findByRole('alert')).textContent).toContain('Servicio IA no disponible');
  });
  it('cambio de cuenta elimina comparacion y respuesta de la anterior',async()=>{
    const view=render(<ShopSection />);await screen.findByRole('heading',{name:food.title});
    fireEvent.click(screen.getByRole('button',{name:/^Comparar$/}));
    expect(screen.getByRole('region',{name:'Comparador'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:/Asesor de compras contextual/}));
    fireEvent.change(screen.getByLabelText('Pregunta al asesor'),{target:{value:'Pregunta privada de la primera cuenta'}});
    fireEvent.click(screen.getByRole('button',{name:/Filtros y busqueda/}));
    fireEvent.change(screen.getByLabelText('Buscar productos'),{target:{value:'busqueda anterior'}});
    mocks.state.user={id:'other'};mocks.state.pets=[];mocks.state.selectedPetId=null;
    view.rerender(<ShopSection />);
    expect(screen.queryByRole('region',{name:'Comparador'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:/Asesor de compras contextual/}));
    expect(screen.getByRole('button',{name:'Consultar asesor'}).hasAttribute('disabled')).toBe(true);
    expect((screen.getByLabelText('Pregunta al asesor') as HTMLTextAreaElement).value).toBe('');
    fireEvent.click(screen.getByRole('button',{name:/Filtros y busqueda/}));
    expect((screen.getByLabelText('Buscar productos') as HTMLInputElement).value).toBe('');
  });
  it('historial vacio termina la carga con mensaje explicito',async()=>{
    mocks.history.mockResolvedValue([]);
    render(<ShopSection />);await screen.findByRole('heading',{name:food.title});
    fireEvent.click(screen.getByRole('button',{name:'Historial de precios'}));
    expect((await screen.findByRole('alert')).textContent).toContain('no tiene un historial');
    expect(screen.queryByText('Cargando historial...')).toBeNull();
    expect(mocks.viewed).not.toHaveBeenCalled();
  });
  it('una respuesta antigua no aparece al volver a la mascota de origen',async()=>{
    let resolve!: (value: {content:string,isError:boolean})=>void;
    mocks.ask.mockImplementation(()=>new Promise(r=>{resolve=r;}));
    const view=render(<ShopSection />);await screen.findByRole('heading',{name:food.title});
    fireEvent.click(screen.getByRole('button',{name:/Asesor de compras contextual/}));
    fireEvent.change(screen.getByLabelText('Pregunta al asesor'),{target:{value:'Comparar'}});
    fireEvent.click(screen.getByRole('button',{name:'Consultar asesor'}));
    mocks.state.selectedPetId='cat';view.rerender(<ShopSection />);
    mocks.state.selectedPetId='dog';view.rerender(<ShopSection />);
    await act(async()=>{resolve({content:'Respuesta antigua',isError:false});});
    expect(screen.queryByText('Respuesta antigua')).toBeNull();
  });
  it('sin afiliacion la comparacion y el historial siguen habilitados',async()=>{
    mocks.state.selectedPetId=null;
    render(<ShopSection />);await screen.findByRole('heading',{name:food.title});
    const buttons=screen.getAllByRole('button',{name:/^Comparar$/});
    for(const button of buttons) expect(button.closest('[aria-disabled="true"]')).toBeNull();
    fireEvent.click(buttons[0]);fireEvent.click(buttons[1]);
    const comparison=screen.getByRole('region',{name:'Comparador'});
    expect(await within(comparison).findByText('$ 120,00')).toBeTruthy();
    expect(screen.getAllByRole('button',{name:'Historial de precios'}).every(button=>!button.hasAttribute('disabled'))).toBe(true);
  });
  it('muestra la chapita QR propia aunque no este en el catalogo y sin duplicarla si se importa',async()=>{
    const imported={...food,id:'imported-chapita',externalId:'MLA4239242408',title:'Chapa de identificacion QR AiPetFriendly',link:'https://articulo.mercadolibre.com.ar/MLA-4239242408-chapa?matt_tool=x',category:'tecnologia' as const};
    mocks.catalog.mockResolvedValue({products:[food,imported],warning:null});
    render(<ShopSection />);await screen.findByRole('heading',{name:food.title});
    const own=screen.getByRole('article',{name:'Producto propio de AiPetFriendly'});
    expect(within(own).getByRole('heading',{name:CHAPITA_QR_PRODUCT.title})).toBeTruthy();
    const buy=within(own).getByRole('link',{name:/Comprar Chapita identificatoria QR AiPetFriendly/});
    expect(buy.getAttribute('href')).toBe(CHAPITA_QR_PRODUCT.purchaseUrl);
    expect(buy.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.queryByRole('heading',{name:imported.title})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Catalogo completo'}));
    expect(screen.queryByRole('heading',{name:imported.title})).toBeNull();
    expect(screen.getAllByRole('heading',{name:CHAPITA_QR_PRODUCT.title})).toHaveLength(1);
  });
  it('la chapita sigue visible si el catalogo falla y los demas productos no se alteran',async()=>{
    mocks.catalog.mockRejectedValue(new Error('Catalogo caido'));
    render(<ShopSection />);
    await screen.findByRole('alert');
    expect(screen.getByRole('article',{name:'Producto propio de AiPetFriendly'})).toBeTruthy();
  });
  it('catalogo completo y vista cualquiera de las mascotas reutilizan una sola carga global',async()=>{
    render(<ShopSection />);await screen.findByRole('heading',{name:food.title});
    fireEvent.click(screen.getByRole('button',{name:'Catalogo completo'}));
    await screen.findByRole('heading',{name:'Alimento gato adulto'});
    expect(screen.getByText('No recomendado')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Compatible con alguna de mis mascotas'}));
    await screen.findByRole('heading',{name:'Alimento gato adulto'});
    expect(screen.getAllByText(/Compatible con al menos una mascota/).length).toBeGreaterThan(0);
    expect(mocks.catalog).toHaveBeenCalledTimes(1);
    expect(mocks.state.setSelectedPetId).not.toHaveBeenCalled();
  });
});
