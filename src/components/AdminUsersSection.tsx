import { useMemo, useState } from 'react';
import { Shield, UserCog } from 'lucide-react';
import { useAppState } from '../context/AppStateContext';
import { fetchAdminUsers, updateAdminUserAccess } from '../lib/supabase';
import type { UserAccessLevel } from '../types';

const ACCESS_LABELS: Record<UserAccessLevel, string> = {
  guest: 'Visitante',
  free: 'Free',
  premium: 'Premium',
};

const ACCESS_OPTIONS: UserAccessLevel[] = ['guest', 'free', 'premium'];

export function AdminUsersSection() {
  const { adminUsers, setAdminUsers, user } = useAppState();
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return adminUsers;
    return adminUsers.filter((item) =>
      item.email.toLowerCase().includes(q) ||
      (item.fullName || '').toLowerCase().includes(q),
    );
  }, [adminUsers, query]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const rows = await fetchAdminUsers();
      setAdminUsers(rows);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo cargar el listado de usuarios.');
    } finally {
      setLoading(false);
    }
  };

  const onChangeAccess = async (targetUserId: string, access: UserAccessLevel) => {
    try {
      setSavingUserId(targetUserId);
      setError(null);
      setMsg(null);
      await updateAdminUserAccess(targetUserId, access);
      const rows = await fetchAdminUsers();
      setAdminUsers(rows);
      setMsg('Acceso actualizado correctamente.');
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo actualizar el acceso.');
    } finally {
      setSavingUserId(null);
    }
  };

  if (!user?.isAdmin) {
    return (
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">No tienes permisos para esta sección.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 pb-2">
      <div className="pt-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Admin de Usuarios</h2>
        <p className="mt-1 text-slate-500">Gestiona acceso visitante/free/premium para pruebas.</p>
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadUsers}
            disabled={loading}
            className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-70"
          >
            {loading ? 'Cargando...' : 'Cargar usuarios'}
          </button>
          <div className="flex-1 min-w-[220px]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por email o nombre"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
        </div>
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
      {msg && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}

      <div className="space-y-3">
        {filtered.map((item) => (
          <div key={item.id} className="rounded-3xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-slate-900">{item.fullName || item.email}</p>
                <p className="text-xs text-slate-500">{item.email}</p>
                <p className="mt-1 text-xs text-slate-400">Alta: {new Date(item.createdAt).toLocaleDateString('es-AR')}</p>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                <Shield size={12} />
                {ACCESS_LABELS[item.access]}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <UserCog size={16} className="text-emerald-600" />
              <label className="text-sm font-medium text-slate-700">Nivel de acceso</label>
            </div>
            <div className="mt-2">
              <select
                value={item.access}
                onChange={(e) => onChangeAccess(item.id, e.target.value as UserAccessLevel)}
                disabled={savingUserId === item.id}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                {ACCESS_OPTIONS.map((access) => (
                  <option key={access} value={access}>
                    {ACCESS_LABELS[access]}
                  </option>
                ))}
              </select>
              {savingUserId === item.id && (
                <p className="mt-1 text-xs text-slate-500">Guardando cambios...</p>
              )}
            </div>
          </div>
        ))}

        {!loading && filtered.length === 0 && (
          <div className="rounded-3xl bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-slate-500">No hay usuarios para mostrar.</p>
          </div>
        )}
      </div>
    </section>
  );
}
