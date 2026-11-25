import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useAppState } from '../context/AppStateContext';
import { useChat } from '../hooks/useChat';
import { CHAPITA_QR_PRODUCT, isOwnProductDuplicate } from '../data/ownProducts';
import { fetchShopCatalog, fetchShopPriceHistory, markShopProductViewed } from '../lib/supabase';
import { assessShopProduct, assessShopProductForPets, filterShopProducts, SHOP_CATEGORIES, shopComparisonConclusion, shopMoney, shopPetProfile } from '../lib/shop';
import type { ShopFilters, ShopView } from '../lib/shop';
import type { PetLifeStage, PetSizeCategory, PetType, ShopPriceHistory, ShopProduct } from '../types';

const box = 'rounded-3xl bg-white p-4 shadow-sm';
const input = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm';
const action = 'rounded-xl bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50';
const labels = { recommended: 'Recomendado', compatible: 'Compatible', not_recommended: 'No recomendado', unknown: 'Informacion insuficiente' };
const date = (value: string | null) => value ? new Date(value).toLocaleString('es-AR') : 'No informado';
const stale = (value: string | null) => !value || Date.now() - Date.parse(value) > 24 * 3600000;

function ProductPrice({ product }: { product: ShopProduct }) {
  return <div className="space-y-1 text-sm">
    <p className="font-bold">{shopMoney(product.price, product.currency)}</p>
    {product.price !== null && product.originalPrice !== null && product.originalPrice > product.price && <p>Precio promocional informado por la fuente.</p>}
    {product.originalPrice !== null && <p>Precio regular: {shopMoney(product.originalPrice, product.currency)}</p>}
    <p className="text-xs text-slate-500">Ultima consulta exitosa: {date(product.checkedAt)}</p>
    {(product.priceStatus !== 'ok' || stale(product.checkedAt)) && <p className="text-xs text-amber-800">Precio no actualizado o sin verificar. Puede haber cambiado; confirmar en Mercado Libre.</p>}
  </div>;
}

function PurchaseLink({ product }: { product: ShopProduct }) {
  return product.link ? <a href={product.link} target="_blank" rel="sponsored nofollow noopener noreferrer"
    aria-label={`Ver ${product.title} en Mercado Libre`} className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700">
    {product.source === 'static' ? 'Buscar en Mercado Libre' : 'Ver producto'} <ExternalLink size={14} />
  </a> : <p className="text-xs text-slate-500">Enlace de compra temporalmente no disponible</p>;
}

function PriceHistory({ product }: { product: ShopProduct }) {
  const [history, setHistory] = useState<ShopPriceHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setHistory(null); setError(null);
    if (product.source === 'static') {
      setError('Esta ficha es una busqueda general, no una publicacion. No tiene historial de precios.');
      return;
    }
    void (async () => {
      try {
        const rows = await fetchShopPriceHistory([product.id]);
        if (!active) return;
        if (!rows.length) throw new Error('El producto no tiene un historial disponible o ya no esta activo.');
        setHistory(rows[0]);
        await markShopProductViewed(product.id);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'No se pudo consultar el historial.');
      }
    })();
    return () => { active = false; };
  }, [product.id, product.source]);
  return <section className="mt-3 space-y-2 border-t pt-3" aria-label={`Historial de ${product.title}`}>
    <h3 className="font-bold">Historial propio de precios</h3>
    {error && <p role="alert" className="text-sm text-amber-800">{error}</p>}
    {!error && !history && <p>Cargando historial...</p>}
    {history && <>
      <p>Ultimo precio conocido: {shopMoney(history.price, history.currency)}</p>
      <p>Consulta exitosa: {date(history.lastSuccessAt)}</p>
      <p>Consulta mas reciente: {date(history.lastAttemptAt)} · {history.status === 'ok' ? 'Exitosa' : history.status === 'error' ? 'Fallida' : 'Sin consultas'}</p>
      {(history.status !== 'ok' || stale(history.lastSuccessAt)) && <p className="text-amber-800">{history.error || 'El precio podria haber cambiado; consulta la publicacion.'}</p>}
      <p>Minimo registrado: {shopMoney(history.minimum, history.currency)} · Maximo: {shopMoney(history.maximum, history.currency)}</p>
      <p className="text-xs">Solo historial disponible en la moneda actual, no el historial completo del mercado.</p>
      {!history.changes.length ? <p>{history.lastSuccessAt ? 'Sin variaciones registradas en el historial disponible.' : 'Sin consultas exitosas registradas.'}</p> : <>
        <p>El precio {history.changes[0].direction === 'up' ? 'subio' : 'bajo'} un {Math.abs(history.changes[0].percent)}% desde la ultima variacion.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-xs">
          <caption>Ultimas cuatro variaciones reales</caption>
          <thead><tr><th>Fecha</th><th>Anterior</th><th>Nuevo</th><th>Diferencia</th><th>Variacion</th></tr></thead>
          <tbody>{history.changes.map((change,i) => <tr key={`${change.detectedAt}-${i}`}>
            <td>{date(change.detectedAt)}</td><td>{shopMoney(change.previousPrice,history.currency)}</td>
            <td>{shopMoney(change.price,history.currency)}</td><td>{shopMoney(change.difference,history.currency)}</td>
            <td>{change.direction === 'up' ? 'Subio' : 'Bajo'} {Math.abs(change.percent)}%</td>
          </tr>)}</tbody>
        </table></div>
      </>}
    </>}
  </section>;
}

export function ShopSection() {
  const { pets, selectedPetId, setSelectedPetId, user, subscription } = useAppState();
  const chat = useChat();
  const [catalog, setCatalog] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compared, setCompared] = useState<string[]>([]);
  const [comparisonHistory, setComparisonHistory] = useState<ShopPriceHistory[]>([]);
  const [detail, setDetail] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [answerProducts, setAnswerProducts] = useState<ShopProduct[]>([]);
  const [openPanel, setOpenPanel] = useState<'advisor' | 'filters' | null>(null);
  const [view, setView] = useState<ShopView>('reference');
  const referenceId = selectedPetId || subscription?.activePetId || null;
  const identity = useRef(user?.id);
  identity.current = user?.id;
  const scope = `${user?.id || ''}:${referenceId || ''}:${view}`;
  const scopeRef = useRef(scope);
  const scopeRevision = useRef(0);
  if (scopeRef.current !== scope) scopeRevision.current += 1;
  scopeRef.current = scope;
  const [filters, setFilters] = useState<ShopFilters>({
    category: 'all', species: '', stage: '', size: '', need: '', query: '',
    freeShipping: false, fastDelivery: false, sort: 'relevance',
  });
  const pet = pets.find(p => p.id === referenceId) || null;
  const profile = useMemo(() => shopPetProfile(pet), [pet]);
  const profiles = useMemo(() => pets.map(p => shopPetProfile(p)), [pets]);
  const assessment = (product: ShopProduct) => view === 'any' ? assessShopProductForPets(product, profiles) : assessShopProduct(product, profile);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setCatalog([]); setCompared([]); setAnswer(null); setDetail(null);
    setQuestion(''); setWarning(null);
    setAnswerProducts([]); setOpenPanel(null);
    setView('reference');
    setFilters({ category: 'all', species: '', stage: '', size: '', need: '', query: '', freeShipping: false, fastDelivery: false, sort: 'relevance' });
    void fetchShopCatalog(controller.signal).then(result => {
      if (!controller.signal.aborted) { setCatalog(result.products.filter(p => !isOwnProductDuplicate(p))); setWarning(result.warning); }
    }).catch(e => {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudo cargar la tienda.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user?.id]);
  useEffect(() => { setAnswer(null); setAnswerProducts([]); setCompared([]); setDetail(null); setAsking(false); }, [scope]);
  const products = useMemo(() => filterShopProducts(catalog, profile, filters, view, profiles), [catalog, profile, filters, view, profiles]);
  const comparison = compared.flatMap(id => { const p = catalog.find(p => p.id === id); return p ? [p] : []; });
  const comparisonKey = comparison.filter(p => p.source !== 'static').map(p => p.id).join(',');
  useEffect(() => {
    let active = true;
    setComparisonHistory([]);
    if (!comparisonKey) return;
    void fetchShopPriceHistory(comparisonKey.split(',')).then(rows => {
      if (active) setComparisonHistory(rows);
    }).catch(e => {
      if (active) setError(e instanceof Error ? e.message : 'No se pudieron consultar los precios anteriores.');
    });
    return () => { active = false; };
  }, [comparisonKey, scope]);
  const comparisonRows = [
    { label: 'Marca', values: comparison.map(p => p.brand || 'No informado') },
    { label: 'Precio', values: comparison.map(p => <ProductPrice key={p.id} product={p} />) },
    { label: 'Precio anterior registrado', values: comparison.map(p => {
      const history = comparisonHistory.find(h => h.productId === p.id);
      return shopMoney(history?.changes[0]?.previousPrice ?? null, history?.currency ?? null);
    }) },
    { label: 'Precio regular', values: comparison.map(p => shopMoney(p.originalPrice, p.currency)) },
    { label: 'Presentacion y tamaño', values: comparison.map(p => p.presentation || 'No informado') },
    { label: 'Vendedor', values: comparison.map(p => p.seller || 'No informado') },
    { label: 'Especificaciones', values: comparison.map(p => p.attributes.map(a => `${a.name}: ${a.value}`).join('; ') || 'No informado') },
    { label: 'Compatibilidad', values: comparison.map(p => assessShopProduct(p, profile).reason) },
    { label: 'Ventajas informadas', values: comparison.map(p => p.freeShipping ? 'Envio gratis informado por la fuente' : 'No informado') },
    { label: 'Limitaciones', values: comparison.map(p => p.priceStatus !== 'ok' || stale(p.checkedAt) ? 'Precio sin verificar o antiguo' : 'No se informaron desventajas especificas del producto') },
  ];
  const recommendations = products.filter(p => assessment(p).status === 'recommended').slice(0,4);
  const ask = useCallback(async () => {
    if (!pet || !question.trim()) { setError('Selecciona una mascota y escribe una pregunta.'); return; }
    const owner = user?.id;
    const requestScope = scope;
    const requestRevision = scopeRevision.current;
    setAsking(true); setError(null); setAnswer(null); setAnswerProducts([]);
    try {
      const ids = (comparison.length ? comparison : products.slice(0,8)).filter(p => p.source !== 'static').map(p => p.id);
      const result = await chat.sendMessage(question.trim(), pet.id, null, ids);
      if (identity.current === owner && scopeRef.current === requestScope && scopeRevision.current === requestRevision) {
        if (!result || result.isError) throw new Error(result?.content || 'No se pudo consultar el asesor.');
        setAnswer(result.content);
        // Tarjetas solo de productos que el servidor verifico como compatibles.
        setAnswerProducts((result.shoppingProducts || []).flatMap(verified => {
          const product = catalog.find(item => item.id === verified.id);
          return product ? [product] : [];
        }));
      }
    } catch (e) {
      if (identity.current === owner && scopeRef.current === requestScope && scopeRevision.current === requestRevision) setError(e instanceof Error ? e.message : 'No se pudo consultar el asesor.');
    } finally { if (identity.current === owner && scopeRef.current === requestScope && scopeRevision.current === requestRevision) setAsking(false); }
  }, [catalog, chat, comparison, pet, products, question, scope, user?.id]);
  const setFilter = <K extends keyof ShopFilters>(key: K, value: ShopFilters[K]) => setFilters(current => ({ ...current, [key]: value }));
  return <div className="space-y-4 pb-24">
    <header className="rounded-3xl bg-emerald-600 p-5 text-white">
      <h2 className="text-2xl font-bold">Tienda para tu mascota</h2>
      <p>Productos y comparaciones con datos disponibles, sin inventar precios ni beneficios clinicos.</p>
      <p className="mt-2 text-xs">Enlaces comerciales de afiliacion: AiPetFriendly puede recibir una comision. No son consejo independiente.</p>
    </header>
    <section className={`${box} space-y-2`}>
      <label className="block font-bold" htmlFor="shop-pet">Mascota de referencia</label>
      <select id="shop-pet" className={`${input} w-full`} value={referenceId || ''} onChange={e => { setSelectedPetId(e.target.value || null); setView('reference'); }}>
        <option value="">Recomendaciones generales</option>{pets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <div className="flex flex-wrap gap-2" aria-label="Vista del catalogo">
        <button className={action} aria-pressed={view==='reference'} onClick={() => setView('reference')}>Mascota seleccionada</button>
        {subscription?.activePetId && <button className={action} onClick={() => { setSelectedPetId(subscription.activePetId); setView('reference'); }}>Mascota activa</button>}
        <button className={action} aria-pressed={view==='all'} onClick={() => setView('all')}>Catalogo completo</button>
        {pets.length>1 && <button className={action} aria-pressed={view==='any'} onClick={() => setView('any')}>Compatible con alguna de mis mascotas</button>}
      </div>
      <p className="text-xs text-slate-500">No modifica tu mascota activa del plan ni sus datos. Cambia solo la referencia de la tienda.</p>
      {pet && view === 'reference' && <p className="text-xs text-slate-500">Con una mascota seleccionada, esta vista muestra solo productos con compatibilidad comprobada. Usa el catalogo completo o una busqueda explicita para explorar otros productos.</p>}
      <p>{pet ? `${pet.name} · ${pet.breed || 'Raza no informada'} · ${profile.species} · ${profile.stage || 'Etapa no informada'} · ${profile.size || 'Tamaño no informado'}` : 'Explora el catalogo general.'}</p>
      {profile.sizeBasis && <p className="text-xs">{profile.sizeBasis}</p>}
      {profile.limitations.map(text => <p key={text} className="text-xs text-slate-500">{text}</p>)}
    </section>
    {warning && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{warning}</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <section className={box} aria-label="Asesor de compras contextual">
      <button type="button" className="flex w-full items-center justify-between text-left font-bold"
        aria-expanded={openPanel === 'advisor'}
        onClick={() => setOpenPanel(current => current === 'advisor' ? null : 'advisor')}>
        Asesor de compras contextual<span aria-hidden="true">{openPanel === 'advisor' ? '▴' : '▾'}</span>
      </button>
      {openPanel === 'advisor' && <div className="mt-3 space-y-3">
        <p className="text-xs text-slate-600">Usa el asistente existente y sus limites de acceso. Solo consulta datos del catalogo incorporado; no diagnostica, no inventa precios y no reemplaza al veterinario. Las fichas generales sin publicacion no permiten comparar precios con IA.</p>
        <label className="block">Pregunta al asesor<textarea className={`${input} mt-1 w-full`} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Que diferencias hay entre los productos comparados?" maxLength={2000} /></label>
        <button className={action} disabled={asking || !pet || !question.trim()} onClick={() => void ask()}>{asking ? 'Consultando...' : 'Consultar asesor'}</button>
        {answer && <div role="status" className="space-y-3">
          <p className="whitespace-pre-wrap text-sm">{answer}</p>
          {!!answerProducts.length && <div className="grid gap-3 sm:grid-cols-2">{answerProducts.map(p => {
            const a = assessment(p);
            return <article key={p.id} className="rounded-2xl border border-slate-200 p-3">
              {p.thumbnail && <img src={p.thumbnail} alt={p.title} className="mb-2 h-20 w-20 rounded-xl object-cover" loading="lazy" />}
              <h4 className="text-sm font-bold">{p.title}</h4>
              <p className="text-xs">{SHOP_CATEGORIES.find(c => c.id===p.category)?.label} · Vendedor: {p.seller || 'No informado'}</p>
              <p className={`my-1 text-xs ${a.status==='not_recommended' ? 'text-rose-700' : 'text-slate-600'}`}><strong>{labels[a.status]}</strong>: {a.reason}</p>
              <ProductPrice product={p} />
              <div className="mt-2"><PurchaseLink product={p} /></div>
            </article>;
          })}</div>}
        </div>}
      </div>}
    </section>
    <section className={box} aria-label="Filtros de tienda">
      <button type="button" className="flex w-full items-center justify-between text-left font-bold"
        aria-expanded={openPanel === 'filters'}
        onClick={() => setOpenPanel(current => current === 'filters' ? null : 'filters')}>
        Filtros y busqueda<span aria-hidden="true">{openPanel === 'filters' ? '▴' : '▾'}</span>
      </button>
      {openPanel === 'filters' && <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2"><button className={action} onClick={() => setFilter('category','all')} aria-pressed={filters.category==='all'}>Todas</button>
        {SHOP_CATEGORIES.map(c => <button key={c.id} className={action} aria-pressed={filters.category===c.id} onClick={() => setFilter('category',c.id)}>{c.label}</button>)}
      </div>
      <label className="block">Buscar productos<input className={`${input} mt-1 w-full`} value={filters.query} onChange={e => setFilter('query',e.target.value)} placeholder="Nombre, marca o caracteristica" /></label>
      {filters.query && <p className="text-xs text-amber-800">Busqueda explicita: se muestran tambien coincidencias incompatibles con la mascota, identificadas como no recomendadas. Los filtros de especie, edad y tamaño no ocultan estas coincidencias.</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label>Especie<select className={`${input} w-full`} value={filters.species} onChange={e => setFilter('species',e.target.value as PetType | '')}><option value="">Segun mascota</option><option value="perro">Perro</option><option value="gato">Gato</option><option value="otro">Otra</option></select></label>
        <label>Etapa<select className={`${input} w-full`} value={filters.stage} onChange={e => setFilter('stage',e.target.value as PetLifeStage | '')}><option value="">Segun mascota</option><option value="cachorro">Cachorro</option><option value="adulto">Adulto</option><option value="senior">Senior</option></select></label>
        <label>Tamaño<select className={`${input} w-full`} value={filters.size} onChange={e => setFilter('size',e.target.value as PetSizeCategory | '')}><option value="">Segun mascota</option><option value="pequeño">Pequeño</option><option value="mediano">Mediano</option><option value="grande">Grande</option></select></label>
        <label>Necesidad<select className={`${input} w-full`} value={filters.need} onChange={e => setFilter('need',e.target.value)}><option value="">Todas</option>{SHOP_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label>Orden<select className={`${input} w-full`} value={filters.sort} onChange={e => setFilter('sort',e.target.value as ShopFilters['sort'])}><option value="relevance">Relevancia</option><option value="price_asc">Menor precio</option><option value="price_desc">Mayor precio</option></select></label>
      </div>
      <div className="flex flex-wrap gap-3 text-sm"><label><input type="checkbox" checked={filters.freeShipping} onChange={e => setFilter('freeShipping',e.target.checked)} /> Envio gratis informado</label><label><input type="checkbox" checked={filters.fastDelivery} onChange={e => setFilter('fastDelivery',e.target.checked)} /> Envio rapido informado</label></div>
      </div>}
    </section>
    {!!recommendations.length && <section className={box}><h3 className="font-bold">Recomendaciones principales</h3>
      {recommendations.map(p => <p key={p.id} className="mt-2 text-sm">{p.title}: {assessment(p).reason}</p>)}
    </section>}
    {CHAPITA_QR_PRODUCT.active && <article className={`${box} border border-purple-100`} aria-label="Producto propio de AiPetFriendly">
      <img src={CHAPITA_QR_PRODUCT.imageUrl} alt={CHAPITA_QR_PRODUCT.title} className="mb-2 h-24 w-24 rounded-xl object-cover" loading="lazy" />
      <p className="text-[11px] font-bold uppercase tracking-wide text-purple-700">Producto propio de AiPetFriendly{CHAPITA_QR_PRODUCT.featured ? ' · Destacado' : ''}</p>
      <h3 className="font-bold">{CHAPITA_QR_PRODUCT.title}</h3>
      <p className="text-xs">{CHAPITA_QR_PRODUCT.category} · {CHAPITA_QR_PRODUCT.material}</p>
      <p className="my-2 text-sm text-slate-600">{CHAPITA_QR_PRODUCT.description}</p>
      <div className="mt-3"><a href={CHAPITA_QR_PRODUCT.purchaseUrl} target="_blank" rel="noopener noreferrer"
        aria-label={`Comprar ${CHAPITA_QR_PRODUCT.title} en Mercado Libre`} className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700">
        Comprar chapita QR <ExternalLink size={14} />
      </a></div>
    </article>}
    {loading ? <p role="status">Cargando tienda...</p> : !products.length ? <p className={box}>No hay productos para este filtro por ahora. Prueba otra categoria o busqueda.</p> :
      <div className="grid gap-3 sm:grid-cols-2">{products.map(p => {
        const a = assessment(p);
        return <article key={p.id} className={box}>
          {p.thumbnail && <img src={p.thumbnail} alt={p.title} className="mb-2 h-24 w-24 rounded-xl object-cover" loading="lazy" />}
          <h3 className="font-bold">{p.title}</h3>
          <p className="text-xs">{SHOP_CATEGORIES.find(c => c.id===p.category)?.label} · Vendedor: {p.seller || 'No informado'}</p>
          <details className="my-2 text-xs">
            <summary>Ficha global y fuentes</summary>
            <p>Aprobacion: {p.approvalStatus || 'Heredada, sin investigacion comprobada'} · Investigacion: {date(p.researchedAt || null)}</p>
            <p>{p.research?.description || 'Descripcion no informada'}</p>
            {p.research?.images.map(src => <img key={src} src={src} alt={p.title} loading="lazy" className="h-20 w-20 object-cover" />)}
            {Object.entries(p.research?.provenance || {}).map(([field, source]) => <p key={field}>{field}: {source.source} · {date(source.researchedAt)}</p>)}
            {p.research?.attributes.map((attr,i) => <p key={i}>{attr.name}: {attr.value} · {attr.source} · {date(attr.researchedAt)}</p>)}
            {p.research?.limitations.map(text => <p key={text}>{text}</p>)}
          </details>
          <p className={`my-2 text-sm ${a.status==='not_recommended' ? 'text-rose-700' : 'text-slate-600'}`}><strong>{labels[a.status]}</strong>: {a.reason}</p>
          <ProductPrice product={p} />
          <div className="mt-3"><PurchaseLink product={p} /></div>
          <div className="mt-3 flex flex-wrap gap-2"><button className={action} aria-pressed={compared.includes(p.id)} onClick={() => {
            if (!compared.includes(p.id) && compared.length >= 6) { setError('Puedes comparar hasta seis productos.'); return; }
            setCompared(ids => ids.includes(p.id) ? ids.filter(id=>id!==p.id) : [...ids,p.id]);
          }}>{compared.includes(p.id) ? 'Quitar de comparacion' : 'Comparar'}</button>
            <button className={action} onClick={() => setDetail(detail===p.id ? null : p.id)} aria-expanded={detail===p.id}>Historial de precios</button></div>
          {detail===p.id && <PriceHistory product={p} />}
        </article>;
      })}</div>}
    {!!comparison.length && <section className={`${box} space-y-2`} aria-label="Comparador">
      <h3 className="font-bold">Comparador ({comparison.length})</h3><button className={action} onClick={() => setCompared([])}>Vaciar comparador</button>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption>Datos publicados; lo ausente se indica como No informado</caption><thead><tr><th>Caracteristica</th>{comparison.map(p=><th key={p.id}>{p.title}{p.thumbnail&&<img src={p.thumbnail} alt="" className="h-12 w-12 object-cover" />}</th>)}</tr></thead><tbody>
        {comparisonRows.map(row => <tr key={row.label}>
          <th>{row.label}</th>
          {row.values.map((value,index) => <td key={comparison[index].id} className="min-w-48 p-2">{value}</td>)}
        </tr>)}
        <tr><th>Compra (afiliado)</th>{comparison.map(p=><td key={p.id}><PurchaseLink product={p} /></td>)}</tr>
      </tbody></table></div>
      <p className="whitespace-pre-wrap text-sm">{shopComparisonConclusion(comparison,profile)}</p>
    </section>}
  </div>;
}
