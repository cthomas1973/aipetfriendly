import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useAppState } from '../context/AppStateContext';

// AdMob nativo (Android) ya se gestiona de forma global en App.tsx / lib/mobileAds.ts
// (banner inferior + interstitial). Este componente cubre unicamente la version
// web (Vercel), donde AdMob no funciona (depende de codigo nativo). Por eso en
// plataforma nativa no renderiza nada: evita un segundo banner que compita con
// el que ya administra App.tsx.

const ADSENSE_CLIENT_ID = (import.meta.env.VITE_ADSENSE_CLIENT_ID as string | undefined)?.trim() || '';
export { ADSENSE_CLIENT_ID };
const ADSENSE_SCRIPT_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

let adSenseScriptPromise: Promise<void> | null = null;

// Exportado para poder cargar el script de AdSense tambien en paginas publicas
// sin anuncios (ej. LandingSection), asi el bot de revision de Google puede
// detectarlo aunque el resto de la app este detras de login.
export function loadAdSenseScript(clientId: string = ADSENSE_CLIENT_ID): Promise<void> {
  if (!clientId) {
    return Promise.resolve();
  }

  if (adSenseScriptPromise) {
    return adSenseScriptPromise;
  }

  adSenseScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src^="${ADSENSE_SCRIPT_SRC}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `${ADSENSE_SCRIPT_SRC}?client=${encodeURIComponent(clientId)}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar el script de AdSense.'));
    document.head.appendChild(script);
  });

  return adSenseScriptPromise;
}

interface AdBannerProps {
  adSenseSlotId: string;
  // Permite mostrar el anuncio a cualquier visitante (incluso sin login), para
  // paginas de contenido publico (ej. guias) donde si queremos monetizar
  // trafico organico. En pantallas normales de la app, los anuncios siguen
  // restringidos a usuarios logueados no premium.
  forcePublic?: boolean;
}

export function AdBanner({ adSenseSlotId, forcePublic = false }: AdBannerProps) {
  const { user, subscription } = useAppState();
  const insRef = useRef<HTMLModElement>(null);
  // Google marca el <ins> con data-ad-status="unfilled" cuando no hay anuncio
  // para servir (comun mientras la cuenta esta en revision/sin aprobar). Sin
  // esto, el bloque se queda reservando el minHeight vacio para siempre.
  const [adUnfilled, setAdUnfilled] = useState(false);

  const isNative = Capacitor.isNativePlatform();
  const shouldShowAds = !subscription.isPremiumUser
    && (forcePublic || Boolean(user && !user.isGuest));

  useEffect(() => {
    if (isNative || !shouldShowAds || !ADSENSE_CLIENT_ID) {
      return;
    }

    let cancelled = false;

    loadAdSenseScript(ADSENSE_CLIENT_ID)
      .then(() => {
        if (cancelled) return;
        try {
          // @ts-expect-error adsbygoogle es inyectado por el script externo de Google.
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (error) {
          console.warn('No se pudo inicializar el bloque de AdSense:', error);
        }
      })
      .catch((error) => {
        console.warn(error);
      });

    const el = insRef.current;
    const observer = el
      ? new MutationObserver(() => {
          if (el.getAttribute('data-ad-status') === 'unfilled') {
            setAdUnfilled(true);
          }
        })
      : null;
    observer?.observe(el as HTMLModElement, { attributes: true, attributeFilter: ['data-ad-status'] });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [isNative, shouldShowAds]);

  if (isNative || !shouldShowAds || !ADSENSE_CLIENT_ID || adUnfilled) {
    return null;
  }

  return (
    <div className="my-4 flex w-full justify-center overflow-hidden">
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', maxWidth: '728px', minHeight: '90px' }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={adSenseSlotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
