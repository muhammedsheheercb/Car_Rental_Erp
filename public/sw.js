const CACHE_NAME = "muscat-cars-static-v3";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  // Precache the static offline fallback; updates still wait for explicit user approval.
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(OFFLINE_URL))
      .catch(() => undefined),
  );
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
  if (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.searchParams.has("_rsc")
  )
    return;

  // Never cache authenticated navigations; serve the static offline fallback only if network fails.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const offline = await caches.match(OFFLINE_URL);
        if (offline) return offline;
        return new Response("Offline", { status: 503, statusText: "Offline" });
      }),
    );
    return;
  }

  if (request.headers.get("cookie")) return;

  const staticAsset =
    ["style", "script", "image", "font"].includes(request.destination) ||
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === OFFLINE_URL;
  if (!staticAsset) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          void cache.put(request, response.clone()).catch(() => undefined);
        }
        return response;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw new Error("Offline and asset not cached");
      }
    }),
  );
});
