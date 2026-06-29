import type { AppUser } from '../types';

export interface NotificationProfile {
  defaultEmail: string;
  defaultPhone: string;
  channels: string[];
}

const STORAGE_KEY = 'apf_notification_profile_v1';

function normalizeChannels(channels: string[] | undefined): string[] {
  const normalized = (channels ?? ['Push'])
    .map((channel) => String(channel).trim())
    .filter((channel) => channel.length > 0);

  return Array.from(new Set(normalized));
}

export function readNotificationProfile(user: AppUser | null): NotificationProfile {
  const fallback: NotificationProfile = {
    defaultEmail: user?.email ?? '',
    defaultPhone: '',
    channels: ['Push'],
  };

  if (typeof window === 'undefined') {
    return fallback;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<NotificationProfile>;
    return {
      defaultEmail: typeof parsed.defaultEmail === 'string' ? parsed.defaultEmail : fallback.defaultEmail,
      defaultPhone: typeof parsed.defaultPhone === 'string' ? parsed.defaultPhone : '',
      channels: normalizeChannels(Array.isArray(parsed.channels) ? parsed.channels : fallback.channels),
    };
  } catch {
    return fallback;
  }
}

export function writeNotificationProfile(profile: NotificationProfile) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      defaultEmail: profile.defaultEmail.trim(),
      defaultPhone: profile.defaultPhone.trim(),
      channels: normalizeChannels(profile.channels),
    }),
  );
}
