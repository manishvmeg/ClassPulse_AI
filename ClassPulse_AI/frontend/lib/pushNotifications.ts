/**
 * ClassPulse AI — Push Notification Manager
 *
 * Handles service worker registration, VAPID subscription, and permission requests.
 */

import { API_URL } from "@/lib/config";


// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output  = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

// ──────────────────────────────────────────────────────────────────────────────
// Service Worker Registration
// ──────────────────────────────────────────────────────────────────────────────

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    console.log("[SW] Registered:", reg.scope);
    return reg;
  } catch (err) {
    console.warn("[SW] Registration failed:", err);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Request Notification Permission + Push Subscribe
// ──────────────────────────────────────────────────────────────────────────────

export async function requestAndSubscribePush(
  username: string,
  role: "teacher" | "student",
  roomId?: string
): Promise<{ subscribed: boolean; reason?: string }> {
  if (typeof window === "undefined") return { subscribed: false, reason: "server-side" };
  if (!("Notification" in window)) return { subscribed: false, reason: "Notifications not supported in this browser" };
  if (!("serviceWorker" in navigator)) return { subscribed: false, reason: "Service worker not supported" };
  if (!("PushManager" in window)) return { subscribed: false, reason: "Push API not supported in this browser" };

  // Request permission
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { subscribed: false, reason: permission === "denied" ? "Notifications blocked — enable them in browser settings" : "Permission not granted" };
  }

  // Fetch VAPID public key from backend
  let vapidPublicKey: string;
  try {
    const res  = await fetch(`${API_URL}/vapid-key`);
    const data = await res.json();
    vapidPublicKey = data.vapidPublicKey;
    if (!vapidPublicKey) throw new Error("No VAPID key returned");
  } catch (err) {
    console.warn("[Push] Could not fetch VAPID key:", err);
    return { subscribed: false, reason: "Backend VAPID key unavailable" };
  }

  // Get or wait for service worker
  let reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) reg = await registerServiceWorker() ?? undefined;
  if (!reg) return { subscribed: false, reason: "Service worker not available" };

  // Wait for active service worker
  if (!reg.active) {
    await new Promise<void>((resolve) => {
      const handler = () => { reg!.removeEventListener("updatefound", handler); resolve(); };
      reg!.addEventListener("updatefound", handler);
      setTimeout(resolve, 3000); // fallback timeout
    });
  }

  // Subscribe to push
  try {
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
    });


    const json   = subscription.toJSON();
    const keys   = json.keys as { auth: string; p256dh: string };

    // Send subscription to backend
    await fetch(`${API_URL}/push/subscribe`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        endpoint:    json.endpoint,
        keys_auth:   keys.auth,
        keys_p256dh: keys.p256dh,
        username,
        role,
        room_id: roomId ?? null,
      }),
    });

    console.log("[Push] Subscribed for user:", username);
    return { subscribed: true };
  } catch (err) {
    console.warn("[Push] Subscribe failed:", err);
    return { subscribed: false, reason: String(err) };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Unsubscribe
// ──────────────────────────────────────────────────────────────────────────────

export async function unsubscribePush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return;

  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  await fetch(`${API_URL}/push/unsubscribe`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ endpoint }),
  });

  console.log("[Push] Unsubscribed.");
}

// ──────────────────────────────────────────────────────────────────────────────
// Check current status
// ──────────────────────────────────────────────────────────────────────────────

export async function getPushStatus(): Promise<"granted" | "denied" | "default" | "unsupported"> {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window) || !("PushManager" in window)) return "unsupported";
  return Notification.permission as "granted" | "denied" | "default";
}

// ──────────────────────────────────────────────────────────────────────────────
// Show an in-tab Notification (when permission is granted and tab is focused)
// ──────────────────────────────────────────────────────────────────────────────

export function showLocalNotification(title: string, body: string, url?: string): void {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const n = new Notification(title, {
    body,
    icon: "/favicon.ico",
    tag:  "classpulse",
  });

  if (url) {
    n.onclick = () => { window.focus(); window.location.href = url; };
  }
}
