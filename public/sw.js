// Homebase service worker: shows push alerts and opens the dashboard when one is tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Homebase", body: e.data && e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(d.title || "Homebase", {
      body: d.body || "",
      icon: "/brand/icon-192.png",
      badge: "/brand/icon-192.png",
      tag: d.tag || undefined,
      renotify: !!d.tag,
      data: { url: d.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.location.origin));
      if (open) return open.focus().then((c) => (c.navigate ? c.navigate(url) : c));
      return self.clients.openWindow(url);
    }),
  );
});
