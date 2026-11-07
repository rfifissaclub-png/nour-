"use strict";

const PUBLIC_SHELL_CACHE = "nour-public-shell-v1";

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(PUBLIC_SHELL_CACHE)
      .then(cache => cache.addAll(["/offline.html", "/offline.js"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isOfflineAdminView = event.request.mode === "navigate" &&
    (url.pathname === "/admin/students" || url.pathname === "/admin/payments");
  if (isOfflineAdminView) {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const fallback = await caches.match("/offline.html");
        return fallback ?? new Response("Impossible d’afficher cette page hors ligne.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      }),
    );
    return;
  }

  // Other authenticated pages, APIs and private PDFs are never cached.
  event.respondWith(fetch(event.request));
});
