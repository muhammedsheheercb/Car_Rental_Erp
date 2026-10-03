self.addEventListener("install", () => {
  // Updates wait for an explicit user decision; a new installation activates normally.
});
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Never cache navigations, RSC payloads, API responses or requests carrying a session.
  // They can contain personal data, permissions or an expiring authenticated state.
  if (
    request.method !== "GET" ||
    request.headers.get("cookie") ||
    url.origin !== self.location.origin ||
    request.mode === "navigate" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("_rsc")
  )
    return;
  const staticAsset =
    ["style", "script", "image", "font"].includes(request.destination) ||
    url.pathname.startsWith("/_next/static/");
  if (!staticAsset) return;
  event.respondWith(
    caches.open("muscat-cars-static-v1").then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request).then((response) => {
        if (response.ok && response.type === "basic") cache.put(request, response.clone());
        return response;
      });
      return cached ?? network;
    }),
  );
});
