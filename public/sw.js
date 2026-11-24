const CACHE_NAME = "muscat-cars-static-v2";

self.addEventListener("install", () => {
  // Updates wait for an explicit user decision; a new installation activates normally.
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("muscat-cars-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Never cache local dev traffic, navigations, RSC payloads, API responses or session requests.
  if (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
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
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") cache.put(request, response.clone());
        return response;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw new Error("Offline and asset not cached");
      }
    }),
  );
});
