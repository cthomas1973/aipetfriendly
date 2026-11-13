// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminShopRadarSection } from './AdminShopRadarSection';
import type { ShopRadarCandidate, ShopResearchRecord } from '../types';
const m=vi.hoisted(()=>({load:vi.fn(),review:vi.fn(),guard:vi.fn(),user:{id:'admin',isAdmin:true}}));
vi.mock('../context/AppStateContext',()=>({useAppState:()=>({user:m.user}),useSessionGuard:()=>m.guard}));
vi.mock('../lib/supabase',()=>({fetchAdminShopRadar:m.load,reviewAdminShopRadar:m.review}));
const source={source:'https://api.mercadolibre.com/items/MLA123456789',researchedAt:'2026-11-06T12:00:00Z'};
const record:ShopResearchRecord={title:'Producto investigado',permalink:'https://articulo.mercadolibre.com.ar/MLA-123456789',description:null,brand:null,images:[],category:'alimentos',petTypes:['perro'],lifeStages:[],sizes:[],attributes:[],limitations:['Etapa desconocida'],provenance:{title:source,permalink:source,category:source,petTypes:source}};
const candidate:ShopRadarCandidate={id:'candidate',mla_id:'MLA123456789',catalog_product_id:null,category_name:'Categoria oficial',category_id:'MLA12345',detected_at:source.researchedAt,detection_source:'https://api.mercadolibre.com/highlights/MLA/category/MLA12345',ranking_position:2,duplicate_product_id:null,research_status:'ready',research_record:record,research_error:null,researched_at:source.researchedAt,review_status:'pending',decision_reason:null,postponed_until:null,listing_active:true,events:[{id:1,action:'detected',event_at:source.researchedAt,reason:null,snapshot:{source:'Oficial'}}]};
beforeEach(()=>{vi.clearAllMocks();m.user={id:'admin',isAdmin:true};m.load.mockResolvedValue({candidates:[candidate],runs:[]});m.review.mockResolvedValue(undefined);});
afterEach(cleanup);
describe('Radar administrativo integrado',()=>{
  it('muestra investigacion, fuentes, posiciones y exige motivo antes de aprobar',async()=>{
    render(<AdminShopRadarSection />);fireEvent.click(await screen.findByRole('button',{name:'Revisar MLA123456789'}));
    expect(screen.getByText(/Fuente de deteccion:/).textContent).toContain('highlights/MLA/category');
    expect(screen.getByText('Etapa desconocida')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Motivo de la decision'),{target:{value:'Fuentes comprobadas'}});
    fireEvent.click(screen.getByRole('button',{name:'Aprobar investigacion'}));
    await waitFor(()=>expect(m.review).toHaveBeenCalledWith('candidate','approve','Fuentes comprobadas',undefined,undefined));
    await screen.findByText('Decision registrada con trazabilidad.');
  });
  it('ofrece una publicación independiente solo después de aprobar',async()=>{
    m.load.mockResolvedValue({candidates:[{...candidate,review_status:'approved'}],runs:[]});
    render(<AdminShopRadarSection />);fireEvent.click(await screen.findByRole('button',{name:'Revisar MLA123456789'}));
    expect(screen.queryByRole('button',{name:'Aprobar investigacion'})).toBeNull();
    fireEvent.change(screen.getByLabelText('Motivo de la decision'),{target:{value:'Publicación revisada'}});
    fireEvent.click(screen.getByRole('button',{name:'Publicar expresamente'}));
    await waitFor(()=>expect(m.review).toHaveBeenCalledWith('candidate','publish','Publicación revisada',undefined,undefined));
  });
  it('rechaza ficha sin fuentes al revisar y no invoca RPC',async()=>{
    render(<AdminShopRadarSection />);fireEvent.click(await screen.findByRole('button',{name:'Revisar MLA123456789'}));
    fireEvent.change(screen.getByLabelText('Ficha investigada (JSON con fuentes)'),{target:{value:'{\"title\":\"Sin fuentes\"}'}});
    fireEvent.click(screen.getByRole('button',{name:'Guardar revision de atributos'}));
    expect((await screen.findByRole('alert')).textContent).toContain('Ficha invalida');
    expect(m.review).not.toHaveBeenCalled();
  });
  it.each(['reject','postpone'])('guarda decision %s sin publicar ni investigar',async action=>{
    render(<AdminShopRadarSection />);fireEvent.click(await screen.findByRole('button',{name:'Revisar MLA123456789'}));
    fireEvent.change(screen.getByLabelText('Motivo de la decision'),{target:{value:'Revision administrativa'}});
    if(action==='postpone')fireEvent.change(screen.getByLabelText('Posponer hasta'),{target:{value:'2099-01-01T12:00'}});
    fireEvent.click(screen.getByRole('button',{name:action==='reject'?'Rechazar':'Posponer'}));
    await waitFor(()=>expect(m.review.mock.calls[0][1]).toBe(action));
  });
  it('candidato resuelto no ofrece nuevas decisiones',async()=>{
    m.load.mockResolvedValue({candidates:[{...candidate,review_status:'rejected',decision_reason:'Duplicado'}],runs:[]});
    render(<AdminShopRadarSection />);fireEvent.click(screen.getByLabelText('Mostrar resueltos'));
    fireEvent.click(await screen.findByRole('button',{name:'Revisar MLA123456789'}));
    expect(screen.queryByRole('button',{name:'Aprobar investigacion'})).toBeNull();
    expect(screen.getByText('Trazabilidad de decisiones e investigacion')).toBeTruthy();
  });
  it('cuenta no administrativa no consulta datos del Radar',()=>{
    m.user.isAdmin=false;render(<AdminShopRadarSection />);
    expect(m.load).not.toHaveBeenCalled();expect(screen.getByRole('alert')).toBeTruthy();
  });
  it('pagina candidatos antiguos sin volver a investigarlos ni aprobarlos',async()=>{
    m.load.mockResolvedValue({candidates:[candidate],total:101,runs:[]});
    render(<AdminShopRadarSection />);await screen.findByRole('button',{name:'Revisar MLA123456789'});
    fireEvent.click(screen.getByRole('button',{name:'Pagina siguiente'}));
    await waitFor(()=>expect(m.load).toHaveBeenLastCalledWith(100));
    expect(m.review).not.toHaveBeenCalled();
  });
});
