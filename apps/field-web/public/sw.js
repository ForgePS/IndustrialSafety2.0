/* Forge Safety - Field Version service worker — shell cache only.
 * Domain offline sync lives in the app offline engine (Phase 10); SW stays shell-only.
 *
 * IMPORTANT: Never cache HTML navigations. Stale document HTML after a deploy
 * points at deleted /_next/static hashes; CloudFront SPA-fallbacks those 404s
 * as text/html 200 and the app crashes with a client-side exception.
 */
const SHELL_CACHE = "forge-field-shell-v18";
const SHELL_URLS = ["/manifest.webmanifest", "/brand/forge-field-logo.png", "/icons/icon.svg"];

async function cacheShellUrls(cache) {
  await Promise.all(
    SHELL_URLS.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (response.ok) {
          await cache.put(url, response);
        }
      } catch {
        // Best-effort shell cache; never block install on iOS/Safari edge cases.
      }
    }),
  );
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || request.destination === "document";
}

function isHashedStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

function isApiOrHealthRequest(url) {
  return url.pathname === "/health" || url.pathname.startsWith("/api/");
}

function isCacheableShellResponse(request, response) {
  if (!response.ok) return false;
  const contentType = response.headers.get("content-type") || "";
  // Never store SPA HTML fallback under a script/style URL.
  if (request.destination === "script" && contentType.includes("text/html")) return false;
  if (request.destination === "style" && contentType.includes("text/html")) return false;
  if (isHashedStaticAsset(new URL(request.url)) && contentType.includes("text/html")) return false;
  if (contentType.includes("text/html")) return false;
  return request.destination !== "";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cacheShellUrls(cache)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  let title = "Forge Safety - Field Version";
  let body = "You have a new notification";
  let href = "/alerts/";
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data === "object") {
      if (data.title) title = String(data.title);
      if (data.body) body = String(data.body);
      if (data.href) href = String(data.href);
    }
  } catch {
    const text = event.data ? event.data.text() : "";
    if (text) body = text;
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { href },
      icon: "/icons/icon.svg",
      badge: "/icons/icon.svg",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href =
    event.notification && event.notification.data && event.notification.data.href
      ? String(event.notification.data.href)
      : "/alerts/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            return client.navigate(href);
          }
          return undefined;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(href);
      }
      return undefined;
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never touch auth/API — session cookies and bearer must hit CloudFront /api proxy directly.
  if (isApiOrHealthRequest(url)) {
    return;
  }

  // Hashed Next assets are immutable — network only (avoid caching HTML 404 fallbacks).
  if (isHashedStaticAsset(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // HTML must always hit the network; never serve a cached document after deploy.
  if (isNavigationRequest(request) || url.pathname === "/" || url.pathname.endsWith(".html")) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (isCacheableShellResponse(request, response)) {
            const copy = response.clone();
            void caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
