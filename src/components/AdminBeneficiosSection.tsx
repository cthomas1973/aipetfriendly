import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, Pencil, Plus, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react';
import {
  fetchAllBeneficiosProductos,
  insertBeneficioProducto,
  updateBeneficioProducto,
  deleteBeneficioProducto,
} from '../lib/supabase';
import type { BeneficioProducto, OfferGrupo, PetType, PetLifeStage, PetSizeCategory } from '../types';

const GRUPOS: { id: OfferGrupo; label: string }[] = [
  { id: 'alimentos',  label: '🍗 Alimentos' },
  { id: 'accesorios', label: '🦮 Accesorios y Paseo' },
  { id: 'higiene',    label: '🧴 Estetica e Higiene' },
  { id: 'descanso',   label: '🧸 Descanso y Juguetes' },
];

const LIFE_STAGES: { id: PetLifeStage; label: string }[] = [
  { id: 'cachorro', label: 'Cachorro' },
  { id: 'adulto',   label: 'Adulto' },
  { id: 'senior',   label: 'Senior' },
];

const SIZE_CATEGORIES: { id: PetSizeCategory; label: string }[] = [
  { id: 'pequeño',  label: 'Pequeño' },
  { id: 'mediano',  label: 'Mediano' },
  { id: 'grande',   label: 'Grande' },
];

// Auto-sugerencia: detecta etapa de vida y tamaño desde palabras clave del titulo.
// El admin puede ajustar manualmente despues; esto solo pre-completa para agilizar la carga.
function suggestLifeStages(title: string): PetLifeStage[] {
  const t = title.toLowerCase();
  const stages: PetLifeStage[] = [];
  if (/cachorro|puppy|kitten|junior/.test(t)) stages.push('cachorro');
  if (/senior|mayores|older|7\+|maduro/.test(t)) stages.push('senior');
  if (/adulto|adult/.test(t)) stages.push('adulto');
  return stages.length > 0 ? stages : ['todas'];
}

function suggestSizeCategories(title: string): PetSizeCategory[] {
  const t = title.toLowerCase();
  const sizes: PetSizeCategory[] = [];
  if (/mini|toy|pequeñ|small|raza pequena/.test(t)) sizes.push('pequeño');
  if (/mediana?\b|medium/.test(t)) sizes.push('mediano');
  if (/grande|maxi|large|gigante|raza grande/.test(t)) sizes.push('grande');
  return sizes.length > 0 ? sizes : ['todos'];
}

function extractMlaInfo(url: string): { mlaId: string; permalink: string } | null {
  const match = url.match(/MLA-?(\d{7,})/i);
  if (!match) return null;
  const mlaId = `MLA-${match[1]}`;

  // IMPORTANTE: usamos la URL REAL pegada por el usuario, no una reconstruida.
  // Las URLs de tipo /p/MLAxxxx son fichas de producto (catalogo, varios vendedores)
  // y NO tienen equivalente en articulo.mercadolibre.com.ar/MLA-xxx — reconstruirla
  // rompe el link ("pagina no existe"). Solo limpiamos el hash de tracking (#polycard_client=...)
  // y cualquier matt_tool viejo para no duplicarlo.
  let permalink = url.trim();
  try {
    const parsed = new URL(permalink);
    parsed.hash = '';
    parsed.searchParams.delete('matt_tool');
    parsed.searchParams.delete('matt_word');
    permalink = parsed.toString();
  } catch {
    // URL invalida: se deja tal cual, el input type=url ya valida el formato basico
  }

  return { mlaId, permalink };
}

const EMPTY_FORM = {
  url_ml: '',
  title: '',
  thumbnail: '',
  price: '',
  grupo: 'alimentos' as OfferGrupo,
  pet_types: ['perro', 'gato'] as PetType[],
  life_stages: ['todas'] as PetLifeStage[],
  size_categories: ['todos'] as PetSizeCategory[],
  free_shipping: false,
  fast_delivery: false,
};

export function AdminBeneficiosSection() {
  const [productos, setProductos] = useState<BeneficioProducto[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProductos(await fetchAllBeneficiosProductos());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando productos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleUrlChange = (url: string) => {
    setForm(f => ({ ...f, url_ml: url }));
    const info = extractMlaInfo(url);
    if (url && !info) {
      setUrlError('URL no reconocida. Debe contener un ID del tipo MLA-XXXXXXXXX');
    } else {
      setUrlError(null);
    }
  };

  const handleTitleChange = (title: string) => {
    setForm(f => ({
      ...f,
      title,
      // Auto-sugerencia desde el titulo; el admin puede ajustar los checkboxes despues.
      life_stages: suggestLifeStages(title),
      size_categories: suggestSizeCategories(title),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMsg(null);

    const info = extractMlaInfo(form.url_ml);
    if (!info) { setUrlError('URL inválida. Copiá la URL directamente desde Mercado Libre.'); return; }
    if (!form.title.trim()) { setError('El título es obligatorio.'); return; }
    if (form.pet_types.length === 0) { setError('Seleccioná al menos un tipo de mascota.'); return; }

    setSaving(true);
    try {
      const payload = {
        url_ml: form.url_ml.trim(),
        mla_id: info.mlaId,
        permalink: info.permalink,
        title: form.title.trim(),
        thumbnail: form.thumbnail.trim() || null,
        price: form.price ? Number(form.price) : null,
        grupo: form.grupo,
        pet_types: form.pet_types,
        life_stages: form.life_stages,
        size_categories: form.size_categories,
        free_shipping: form.free_shipping,
        fast_delivery: form.fast_delivery,
      };

      if (editingId) {
        await updateBeneficioProducto(editingId, payload);
        setMsg('Producto actualizado correctamente.');
      } else {
        await insertBeneficioProducto({ ...payload, active: true });
        setMsg('Producto agregado correctamente.');
      }

      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error guardando producto');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: BeneficioProducto) => {
    try {
      await updateBeneficioProducto(p.id, { active: !p.active });
      setProductos(prev => prev.map(x => x.id === p.id ? { ...x, active: !p.active } : x));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error actualizando');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este producto del catálogo?')) return;
    try {
      await deleteBeneficioProducto(id);
      setProductos(prev => prev.filter(x => x.id !== id));
      setMsg('Producto eliminado.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error eliminando');
    }
  };

  const handleEdit = (p: BeneficioProducto) => {
    setForm({
      url_ml: p.url_ml,
      title: p.title,
      thumbnail: p.thumbnail || '',
      price: p.price != null ? String(p.price) : '',
      grupo: p.grupo,
      pet_types: p.pet_types,
      life_stages: p.life_stages,
      size_categories: p.size_categories,
      free_shipping: p.free_shipping,
      fast_delivery: p.fast_delivery,
    });
    setEditingId(p.id);
    setUrlError(null);
    setError(null);
    setMsg(null);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setUrlError(null);
  };

  const togglePetType = (type: PetType) => {
    setForm(f => ({
      ...f,
      pet_types: f.pet_types.includes(type)
        ? f.pet_types.filter(t => t !== type)
        : [...f.pet_types, type],
    }));
  };

  const toggleLifeStage = (stage: PetLifeStage) => {
    setForm(f => {
      if (stage === 'todas') return { ...f, life_stages: ['todas'] };
      const withoutTodas = f.life_stages.filter(s => s !== 'todas');
      const next = withoutTodas.includes(stage)
        ? withoutTodas.filter(s => s !== stage)
        : [...withoutTodas, stage];
      return { ...f, life_stages: next.length > 0 ? next : ['todas'] };
    });
  };

  const toggleSizeCategory = (size: PetSizeCategory) => {
    setForm(f => {
      if (size === 'todos') return { ...f, size_categories: ['todos'] };
      const withoutTodos = f.size_categories.filter(s => s !== 'todos');
      const next = withoutTodos.includes(size)
        ? withoutTodos.filter(s => s !== size)
        : [...withoutTodos, size];
      return { ...f, size_categories: next.length > 0 ? next : ['todos'] };
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-900">Productos de Beneficios</h3>
          <p className="text-xs text-slate-500">Pegá URLs de Mercado Libre para agregar productos con tracking de afiliado.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (showForm) {
              cancelForm();
            } else {
              setError(null);
              setMsg(null);
              setShowForm(true);
            }
          }}
          className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-2 text-sm font-semibold text-white"
        >
          {showForm ? <X size={15} /> : <Plus size={15} />}
          {showForm ? 'Cerrar' : 'Agregar producto'}
        </button>
      </div>

      {msg && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {/* Formulario */}
      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-semibold text-emerald-800">{editingId ? 'Editar producto' : 'Nuevo producto'}</p>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">URL del producto en Mercado Libre *</label>
            <input
              type="url"
              value={form.url_ml}
              onChange={e => handleUrlChange(e.target.value)}
              placeholder="https://articulo.mercadolibre.com.ar/MLA-1234567890-..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
            {urlError && <p className="mt-1 text-xs text-rose-600">{urlError}</p>}
            {form.url_ml && !urlError && (
              <p className="mt-1 text-xs text-emerald-600">✓ MLA ID detectado: {extractMlaInfo(form.url_ml)?.mlaId}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Título del producto *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="Ej: Alimento Excellent Adulto Perro 15kg"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
            <p className="mt-1 text-xs text-slate-400">La etapa de vida y el tamaño se sugieren automáticamente según el título (podés ajustarlos abajo).</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">URL de imagen (opcional)</label>
              <input
                type="url"
                value={form.thumbnail}
                onChange={e => setForm(f => ({ ...f, thumbnail: e.target.value }))}
                placeholder="https://..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Precio ARS (opcional)</label>
              <input
                type="number"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                placeholder="Ej: 45000"
                min="0"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Categoría *</label>
            <select
              value={form.grupo}
              onChange={e => setForm(f => ({ ...f, grupo: e.target.value as OfferGrupo }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            >
              {GRUPOS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Apto para *</label>
            <div className="flex gap-2">
              {(['perro', 'gato', 'otro'] as PetType[]).map(t => (
                <label key={t} className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.pet_types.includes(t)}
                    onChange={() => togglePetType(t)}
                    className="h-4 w-4"
                  />
                  {t === 'perro' ? '🐶 Perro' : t === 'gato' ? '🐱 Gato' : '🐾 Otro'}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Etapa de vida (para alimentos)</label>
            <div className="flex flex-wrap gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <input type="checkbox" checked={form.life_stages.includes('todas')} onChange={() => toggleLifeStage('todas')} className="h-4 w-4" />
                Todas las edades
              </label>
              {LIFE_STAGES.map(s => (
                <label key={s.id} className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <input type="checkbox" checked={form.life_stages.includes(s.id)} onChange={() => toggleLifeStage(s.id)} className="h-4 w-4" />
                  {s.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Tamaño de mascota (para alimentos)</label>
            <div className="flex flex-wrap gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <input type="checkbox" checked={form.size_categories.includes('todos')} onChange={() => toggleSizeCategory('todos')} className="h-4 w-4" />
                Todos los tamaños
              </label>
              {SIZE_CATEGORIES.map(s => (
                <label key={s.id} className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <input type="checkbox" checked={form.size_categories.includes(s.id)} onChange={() => toggleSizeCategory(s.id)} className="h-4 w-4" />
                  {s.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={form.free_shipping} onChange={e => setForm(f => ({ ...f, free_shipping: e.target.checked }))} className="h-4 w-4" />
              Envio gratis
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={form.fast_delivery} onChange={e => setForm(f => ({ ...f, fast_delivery: e.target.checked }))} className="h-4 w-4" />
              Envio rapido
            </label>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? <Loader2 size={15} className="animate-spin" /> : (editingId ? <Pencil size={15} /> : <Plus size={15} />)}
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Guardar producto'}
            </button>
            <button type="button" onClick={cancelForm} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Lista de productos */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-emerald-500" /></div>
      ) : productos.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No hay productos cargados. Usá el botón "Agregar producto" para cargar URLs de Mercado Libre.
        </p>
      ) : (
        <div className="space-y-2">
          {productos.map(p => (
            <div key={p.id} className={`flex items-start gap-3 rounded-2xl border p-3 ${p.active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
              {p.thumbnail && (
                <img src={p.thumbnail} alt={p.title} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{p.title}</p>
                <p className="text-xs text-slate-400">{GRUPOS.find(g => g.id === p.grupo)?.label} · {p.pet_types.join(', ')}</p>
                <p className="mt-0.5 truncate text-xs text-slate-400">{p.mla_id} · {p.price != null ? `$${p.price.toLocaleString('es-AR')}` : 'Sin precio'}</p>
                <div className="mt-1 flex gap-2">
                  {p.free_shipping && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">Envio gratis</span>}
                  {p.fast_delivery && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Rapido</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="rounded-full p-1.5 text-slate-400 hover:text-emerald-600">
                  <ExternalLink size={15} />
                </a>
                <button type="button" onClick={() => handleEdit(p)} className="rounded-full p-1.5 text-slate-400 hover:text-emerald-600">
                  <Pencil size={15} />
                </button>
                <button type="button" onClick={() => void toggleActive(p)} className="rounded-full p-1.5 text-slate-400 hover:text-emerald-600">
                  {p.active ? <ToggleRight size={18} className="text-emerald-500" /> : <ToggleLeft size={18} />}
                </button>
                <button type="button" onClick={() => void handleDelete(p.id)} className="rounded-full p-1.5 text-slate-400 hover:text-rose-600">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400">
        El link de afiliado (matt_tool) se agrega automáticamente al mostrar los productos en la pestaña Beneficios.
        Los usuarios verán los productos que correspondan a las mascotas que tienen registradas.
      </p>
    </div>
  );
}
