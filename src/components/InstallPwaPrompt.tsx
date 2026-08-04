import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { isNativeAndroidApp } from '../lib/mobileAds';

const DISMISS_STORAGE_KEY = 'apf_pwa_install_dismissed_at';
const DISMISS_DAYS = 7;

function wasDismissedRecently(): boolean {
  const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (!Number.isFinite(dismissedAt)) return false;
  const elapsedDays = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
  return elapsedDays < DISMISS_DAYS;
}

export function InstallPwaPrompt({ liftedForNav = false }: { liftedForNav?: boolean }) {
  const { isInstalled, isIOS, canPromptInstall, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(true);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setDismissed(wasDismissedRecently());
  }, []);

  if (isInstalled || dismissed || isNativeAndroidApp()) {
    return null;
  }

  const showIosHint = isIOS && !canPromptInstall;

  if (!canPromptInstall && !showIosHint) {
    return null;
  }

  const handleDismiss = () => {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    setDismissed(true);
  };

  const handleInstallClick = async () => {
    if (!canPromptInstall) return;
    setInstalling(true);
    try {
      const accepted = await promptInstall();
      if (accepted) {
        handleDismiss();
      }
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3 ${
        liftedForNav ? 'bottom-[calc(env(safe-area-inset-bottom)+4.75rem)]' : 'bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]'
      }`}
    >
      <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-3 shadow-lg">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <Download size={20} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-900">Instalá AiPetFriendly</p>
          {canPromptInstall ? (
            <p className="mt-0.5 text-xs text-slate-600">
              Agregala a tu pantalla de inicio para acceder más rápido, incluso sin conexión.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-600">
              Tocá <span className="font-semibold">Compartir</span> y luego{' '}
              <span className="font-semibold">Agregar a pantalla de inicio</span>.
            </p>
          )}
          <div className="mt-2 flex gap-2">
            {canPromptInstall && (
              <button
                type="button"
                onClick={() => {
                  void handleInstallClick();
                }}
                disabled={installing}
                className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {installing ? 'Instalando...' : 'Instalar'}
              </button>
            )}
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
            >
              Ahora no
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
