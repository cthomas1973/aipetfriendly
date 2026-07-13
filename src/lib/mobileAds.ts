import { Capacitor } from '@capacitor/core';
import { AdMob, BannerAdPosition, BannerAdSize, type BannerAdOptions } from '@capacitor-community/admob';

// IDs de prueba oficiales de Google. Reemplazar por IDs reales de AdMob
// cuando la cuenta AdMob de AiPetFriendly este aprobada.
const TEST_ADMOB_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const TEST_BANNER_AD_ID = 'ca-app-pub-3940256099942544/6300978111';

let initialized = false;
let bannerVisible = false;

export function isNativeAndroidApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function initializeMobileAds(): Promise<void> {
  if (!isNativeAndroidApp() || initialized) return;

  await AdMob.initialize({
    initializeForTesting: true,
    // Desactivar anuncios sensibles para una app de mascotas/familia.
    tagForChildDirectedTreatment: false,
    tagForUnderAgeOfConsent: false,
  });

  initialized = true;
}

export async function showBannerForNonPremium(): Promise<void> {
  if (!isNativeAndroidApp()) return;
  await initializeMobileAds();
  if (bannerVisible) return;

  const options: BannerAdOptions = {
    adId: TEST_BANNER_AD_ID,
    adSize: BannerAdSize.BANNER,
    position: BannerAdPosition.TOP_CENTER,
    margin: 0,
    isTesting: true,
    npa: true,
  };

  await AdMob.showBanner(options);
  bannerVisible = true;
}

export async function hideBannerAd(): Promise<void> {
  if (!isNativeAndroidApp() || !bannerVisible) return;
  try {
    await AdMob.removeBanner();
  } finally {
    bannerVisible = false;
  }
}

export const AD_MOB_TEST_IDS = {
  appId: TEST_ADMOB_APP_ID,
  bannerId: TEST_BANNER_AD_ID,
};
