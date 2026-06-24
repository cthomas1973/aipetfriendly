import { FormEvent, useState } from 'react';
import { PawPrint } from 'lucide-react';
import { signInWithEmail, signUpWithEmail, resetPassword } from '../hooks/useSupabaseSync';
import { useAppState } from '../context/AppStateContext';

const inputCls = 'mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200';
const labelCls = 'block text-sm font-medium text-slate-700';

type AuthMode = 'login' | 'register' | 'forgot-password';

export function AuthScreens() {
  const { setUser } = useAppState();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSubmitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) return;

    if (mode === 'register' && password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      if (mode === 'register') {
        await signUpWithEmail(email.trim().toLowerCase(), password);
        setSuccess('Cuenta creada. Si requiere confirmación, revisa tu email.');
      } else {
        await signInWithEmail(email.trim().toLowerCase(), password);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'No se pudo completar la autenticación.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const onForgotPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) return;

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      await resetPassword(email.trim().toLowerCase());
      setSuccess('Se envió un enlace de recuperación a tu email. Revisa tu bandeja.');
      setTimeout(() => setMode('login'), 3000);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'No se pudo enviar el email de recuperación.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const onGuestMode = () => {
    const guestUser = {
      id: `guest_${Date.now()}`,
      email: 'guest@aipetfriendly.local',
      fullName: 'Visitante',
      subscription: {
        plan: 'free' as const,
        isActive: false,
        expiresAt: null,
      },
      isGuest: true,
    };
    setUser(guestUser);
  };

  /* ─── FORGOT PASSWORD ─────────────────────────────── */
  if (mode === 'forgot-password') {
    return (
      <section className="pb-4">
        <div className="mb-6 text-center">
          <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
            <PawPrint size={26} />
          </span>
          <h2 className="mt-3 text-2xl font-extrabold text-slate-900">Recuperar contraseña</h2>
          <p className="mt-1 text-sm text-slate-500">Te enviaremos un enlace para crear una nueva.</p>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <form onSubmit={onForgotPassword} className="space-y-4">
            <label className={labelCls}>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className={inputCls}
                required
              />
            </label>

            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
            {success && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-emerald-500 py-3.5 font-bold text-white transition active:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setSuccess(null);
                setEmail('');
                setPassword('');
              }}
              className="w-full rounded-full border-2 border-slate-200 py-3 font-semibold text-slate-700"
            >
              Volver al login
            </button>
          </form>
        </div>
      </section>
    );
  }

  /* ─── LOGIN / REGISTER ─────────────────────────────── */
  return (
    <section className="pb-4">
      <div className="mb-6 text-center">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
          <PawPrint size={26} />
        </span>
        <h2 className="mt-3 text-2xl font-extrabold text-slate-900">Bienvenido a AiPetFriendly</h2>
        <p className="mt-1 text-sm text-slate-500">Inicia sesión o crea tu cuenta para sincronizar tus datos.</p>
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-sm">
        <form onSubmit={onSubmitEmail} className="space-y-4">
          <label className={labelCls}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className={inputCls}
              required
            />
          </label>

          <label className={labelCls}>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className={inputCls}
              minLength={6}
              required
            />
          </label>

          {mode === 'register' && (
            <label className={labelCls}>
              Confirmar contraseña
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la contraseña"
                className={inputCls}
                minLength={6}
                required
              />
            </label>
          )}

          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          {success && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-emerald-500 py-3.5 font-bold text-white transition active:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? 'Procesando...' : mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}
          </button>

          {mode === 'login' && (
            <button
              type="button"
              onClick={() => {
                setMode('forgot-password');
                setError(null);
                setSuccess(null);
                setPassword('');
                setConfirmPassword('');
              }}
              className="block w-full text-center text-sm font-semibold text-emerald-600 hover:text-emerald-700"
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'register' ? 'login' : 'register');
              setError(null);
              setSuccess(null);
              setPassword('');
              setConfirmPassword('');
            }}
            className="w-full rounded-full border-2 border-slate-200 py-3 font-semibold text-slate-700"
          >
            {mode === 'register' ? 'Ya tengo cuenta' : 'Quiero crear una cuenta'}
          </button>
        </form>
      </div>

      {/* Guest Mode */}
      <div className="mt-5 rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-5">
        <p className="mb-3 text-center text-sm font-semibold text-slate-600">
          ¿Quieres conocer la app primero?
        </p>
        <button
          type="button"
          onClick={onGuestMode}
          className="w-full rounded-full border-2 border-slate-300 bg-white py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          👁️ Continuar como visitante
        </button>
        <p className="mt-2 text-center text-xs text-slate-500">
          Navega libremente y suscríbete después cuando quieras.
        </p>
      </div>
    </section>
  );
}
