import { useMemo, useState } from 'react';
import { Gift, Shield, UserCog } from 'lucide-react';
import { useAppState } from '../context/AppStateContext';
import { AdminBeneficiosSection } from './AdminBeneficiosSection';
import {
  fetchAdminAiDashboardMetrics,
  fetchAdminAiQueryAudit,
  fetchAdminBillingPricingSettings,
  fetchAdminAiUsageSettings,
  fetchAdminUsers,
  updateAdminBillingPricingSettings,
  updateAdminAiUsageSettings,
  updateAdminUserAccess,
} from '../lib/supabase';
import type {
  AdminAiAuditEntry,
  AdminAiDashboardMetrics,
  AiUsageSettings,
  BillingPricingSettings,
  UserAccessLevel,
} from '../types';

const ACCESS_LABELS: Record<UserAccessLevel, string> = {
  guest: 'Visitante',
  free: 'Free',
  premium: 'Premium',
};

const ACCESS_OPTIONS: UserAccessLevel[] = ['guest', 'free', 'premium'];

export function AdminUsersSection() {
  const { adminUsers, setAdminUsers, user } = useAppState();
  const [adminTab, setAdminTab] = useState<'usuarios' | 'beneficios'>('usuarios');
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [savingLimits, setSavingLimits] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [metrics, setMetrics] = useState<AdminAiDashboardMetrics>({
    consultasHoy: 0,
    consultas7d: 0,
    tokens7d: 0,
    percentLimitesAgotados: 0,
    topMascotas: [],
  });
  const [auditRows, setAuditRows] = useState<AdminAiAuditEntry[]>([]);
  const [limits, setLimits] = useState<AiUsageSettings>({
    guestLimitPerPet: 3,
    freeLimitPerPet: 10,
    premiumLimitPerPet: 100,
  });
  const [pricing, setPricing] = useState<BillingPricingSettings>({
    premiumMonthlyAutoArs: 9900,
    premiumMonthlyAutoUsd: 9.9,
    premiumAnnualAutoArs: 99900,
    premiumAnnualAutoUsd: 99.9,
    premiumMonthlyManualArs: 9900,
    premiumMonthlyManualUsd: 9.9,
  });

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
      const [rows, limitsData, pricingData, metricsData, auditData] = await Promise.all([
        fetchAdminUsers(),
        fetchAdminAiUsageSettings(),
        fetchAdminBillingPricingSettings(),
        fetchAdminAiDashboardMetrics(),
        fetchAdminAiQueryAudit(20),
      ]);
      setAdminUsers(rows);
      setLimits(limitsData);
      setPricing(pricingData);
      setMetrics(metricsData);
      setAuditRows(auditData);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo cargar el listado de usuarios.');
    } finally {
      setLoading(false);
    }
  };

  const saveLimits = async () => {
    try {
      setSavingLimits(true);
      setError(null);
      setMsg(null);

      if (limits.guestLimitPerPet < 0 || limits.freeLimitPerPet < 0 || limits.premiumLimitPerPet < 0) {
        throw new Error('Los limites no pueden ser negativos.');
      }

      await updateAdminAiUsageSettings(limits);
      setMsg('Limites de consultas IA actualizados correctamente.');
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudieron guardar los limites IA.');
    } finally {
      setSavingLimits(false);
    }
  };

  const savePricing = async () => {
    try {
      setSavingPricing(true);
      setError(null);
      setMsg(null);

      const values = [
        pricing.premiumMonthlyAutoArs,
        pricing.premiumMonthlyAutoUsd,
        pricing.premiumAnnualAutoArs,
        pricing.premiumAnnualAutoUsd,
        pricing.premiumMonthlyManualArs,
        pricing.premiumMonthlyManualUsd,
      ];

      if (values.some((value) => Number.isNaN(value) || value < 0)) {
        throw new Error('Los precios deben ser numeros validos y no negativos.');
      }

      await updateAdminBillingPricingSettings(pricing);
      setMsg('Precios de planes actualizados correctamente.');
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudieron guardar los precios de planes.');
    } finally {
      setSavingPricing(false);
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

      {/* Tabs admin */}
      <div className="flex gap-2 rounded-2xl bg-slate-100 p-1">
        <button type="button" onClick={() => setAdminTab('usuarios')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition ${
            adminTab === 'usuarios' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
          }`}>
          <UserCog size={15} /> Usuarios
        </button>
        <button type="button" onClick={() => setAdminTab('beneficios')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition ${
            adminTab === 'beneficios' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
          }`}>
          <Gift size={15} /> Beneficios ML
        </button>
      </div>

      {adminTab === 'beneficios' ? (
        <div className="rounded-3xl bg-white p-4 shadow-sm">
          <AdminBeneficiosSection />
        </div>
      ) : (<>
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

      <div className="rounded-3xl bg-white p-4 shadow-sm space-y-3">
        <div>
          <p className="font-bold text-slate-900">Limites IA por mascota</p>
          <p className="text-sm text-slate-500">Estos valores se aplican sin tocar codigo.</p>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <label className="text-sm text-slate-700">
            Visitante
            <input
              type="number"
              min={0}
              value={limits.guestLimitPerPet}
              onChange={(e) => setLimits((current) => ({
                ...current,
                guestLimitPerPet: Number(e.target.value || 0),
              }))}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </label>

          <label className="text-sm text-slate-700">
            Free
            <input
              type="number"
              min={0}
              value={limits.freeLimitPerPet}
              onChange={(e) => setLimits((current) => ({
                ...current,
                freeLimitPerPet: Number(e.target.value || 0),
              }))}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </label>

          <label className="text-sm text-slate-700">
            Premium
            <input
              type="number"
              min={0}
              value={limits.premiumLimitPerPet}
              onChange={(e) => setLimits((current) => ({
                ...current,
                premiumLimitPerPet: Number(e.target.value || 0),
              }))}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={saveLimits}
          disabled={savingLimits}
          className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-70"
        >
          {savingLimits ? 'Guardando limites...' : 'Guardar limites IA'}
        </button>
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-sm space-y-3">
        <div>
          <p className="font-bold text-slate-900">Precios de suscripcion Premium</p>
          <p className="text-sm text-slate-500">Define valores en ARS y U$S para Mi Plan y checkout.</p>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">Premium mensual debito automatico</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <label className="text-sm text-slate-700">
                ARS
                <input
                  type="number"
                  min={0}
                  value={pricing.premiumMonthlyAutoArs}
                  onChange={(e) => setPricing((current) => ({
                    ...current,
                    premiumMonthlyAutoArs: Number(e.target.value || 0),
                  }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </label>
              <label className="text-sm text-slate-700">
                U$S
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={pricing.premiumMonthlyAutoUsd}
                  onChange={(e) => setPricing((current) => ({
                    ...current,
                    premiumMonthlyAutoUsd: Number(e.target.value || 0),
                  }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">Premium anual debito automatico</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <label className="text-sm text-slate-700">
                ARS
                <input
                  type="number"
                  min={0}
                  value={pricing.premiumAnnualAutoArs}
                  onChange={(e) => setPricing((current) => ({
                    ...current,
                    premiumAnnualAutoArs: Number(e.target.value || 0),
                  }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </label>
              <label className="text-sm text-slate-700">
                U$S
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={pricing.premiumAnnualAutoUsd}
                  onChange={(e) => setPricing((current) => ({
                    ...current,
                    premiumAnnualAutoUsd: Number(e.target.value || 0),
                  }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">Premium pago mensual manual (debito, credito, transferencia)</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <label className="text-sm text-slate-700">
                ARS
                <input
                  type="number"
                  min={0}
                  value={pricing.premiumMonthlyManualArs}
                  onChange={(e) => setPricing((current) => ({
                    ...current,
                    premiumMonthlyManualArs: Number(e.target.value || 0),
                  }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </label>
              <label className="text-sm text-slate-700">
                U$S
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={pricing.premiumMonthlyManualUsd}
                  onChange={(e) => setPricing((current) => ({
                    ...current,
                    premiumMonthlyManualUsd: Number(e.target.value || 0),
                  }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </label>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={savePricing}
          disabled={savingPricing}
          className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-70"
        >
          {savingPricing ? 'Guardando precios...' : 'Guardar precios de planes'}
        </button>
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-sm space-y-3">
        <div>
          <p className="font-bold text-slate-900">Metrica rapida IA</p>
          <p className="text-sm text-slate-500">Resumen para control operativo diario.</p>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Consultas hoy</p>
            <p className="mt-1 text-xl font-extrabold text-slate-900">{metrics.consultasHoy}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Consultas 7 dias</p>
            <p className="mt-1 text-xl font-extrabold text-slate-900">{metrics.consultas7d}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Tokens 7 dias</p>
            <p className="mt-1 text-xl font-extrabold text-slate-900">{metrics.tokens7d}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Limites agotados</p>
            <p className="mt-1 text-xl font-extrabold text-slate-900">{metrics.percentLimitesAgotados}%</p>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-700">Top mascotas consultadas (30 dias)</p>
          <div className="mt-2 space-y-2">
            {metrics.topMascotas.length === 0 && (
              <p className="text-sm text-slate-500">Aun no hay consultas registradas.</p>
            )}
            {metrics.topMascotas.map((item) => (
              <div key={`${item.petName}-${item.count}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-sm font-semibold text-slate-800">{item.petName}</p>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  {item.count} consultas
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-sm space-y-3">
        <div>
          <p className="font-bold text-slate-900">Auditoria IA reciente</p>
          <p className="text-sm text-slate-500">Fecha, usuario, mascota, tier y tokens estimados.</p>
        </div>

        <div className="space-y-2">
          {auditRows.length === 0 && (
            <p className="text-sm text-slate-500">Aun no hay registros de auditoria.</p>
          )}
          {auditRows.map((row, index) => (
            <div key={`${row.createdAt}-${row.userEmail}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{row.petName} · {row.userEmail}</p>
                <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {row.tier.toUpperCase()}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {new Date(row.createdAt).toLocaleString('es-AR')} · Tokens: {row.estimatedTotalTokens} · Modelo: {row.model || 'N/D'}
              </p>
              <p className="mt-1 text-xs text-slate-500">Chars pregunta/respuesta: {row.questionChars}/{row.answerChars}</p>
            </div>
          ))}
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
      </>)}
    </section>
  );
}
