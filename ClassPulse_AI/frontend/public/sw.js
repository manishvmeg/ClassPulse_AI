// ClassPulse AI — Service Worker
// Handles background Web Push notifications

const CACHE_NAME = "classpulse-v1";

// ── Push event: show notification ────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ClassPulse AI", body: event.data ? event.data.text() : "Class update" };
  }

  const title   = data.title   || "ClassPulse AI";
  const options = {
    body:             data.body   || "You have a class update.",
    icon:             "/favicon.ico",
    badge:            "/favicon.ico",
    data:             { url: data.url || "/" },
    tag:              "classpulse-class",
    renotify:         true,
    requireInteraction: false,
    vibrate:          [200, 100, 200, 100, 200],
    actions: data.url
      ? [{ action: "open", title: "Open Room" }, { action: "dismiss", title: "Dismiss" }]
      : [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click: focus or open the relevant page ───────────────────────
self.addEventListener("notificationclick", (event) => {
  const action = event.action;
  event.notification.close();

  if (action === "dismiss") return;

  const targetUrl = event.notification.data?.url || "/";
  const origin    = self.location.origin;
  const fullUrl   = origin + targetUrl;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab if one is already open at this URL
      for (const client of clientList) {
        if (client.url === fullUrl && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) {
        return clients.openWindow(fullUrl);
      }
    })
  );
});

// ── Install & activate: skip waiting for immediate activation ─────────────────
self.addEventListener("install",  () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(clients.claim()));
