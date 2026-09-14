self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (
    request.method !== "GET" ||
    request.headers.get("cookie") ||
    new URL(request.url).pathname.startsWith("/api/")
  )
    return;
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
