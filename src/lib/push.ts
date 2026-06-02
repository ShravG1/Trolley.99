import { supabase } from './supabase';

// Web Push client side (§2.10, §8.4).
//
// Ask permission CONTEXTUALLY (e.g. right after the first urgent mark), never on
// first load. iOS only supports web push for INSTALLED PWAs (16.4+), so we check
// installed state and fall back silently where push is unavailable.

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isInstalledPWA(): boolean {
  // iOS exposes navigator.standalone; everyone else uses display-mode.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone;
}

export function isIOS(): boolean {
  return /ip(hone|ad|od)/i.test(navigator.userAgent);
}

/**
 * Returns whether we can even attempt push. On iOS this is false until the user
 * installs the PWA — the caller should show the "Add to Home Screen" hint
 * instead of a permission prompt (§8.4).
 */
export function canPrompt(): boolean {
  if (!pushSupported()) return false;
  if (isIOS() && !isInstalledPWA()) return false;
  return true;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Request permission and register a subscription, persisting it to
 * push_subscriptions (own-row RLS, §5.1). Silent no-op where push isn't
 * available — never throws into the UI.
 */
export async function enablePush(): Promise<boolean> {
  if (!canPrompt() || !supabase) return false;
  const vapidPublic = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublic) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublic) as BufferSource,
    });

    const json = sub.toJSON();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return false;

    await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint: json.endpoint!,
      keys: json.keys,
    });
    return true;
  } catch {
    return false; // silent fallback (§2.10)
  }
}
