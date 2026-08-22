
(function () {
  const dejaPrefetch = new Set();

  function prefetchLien(url) {
    if (!url || dejaPrefetch.has(url)) return;
    dejaPrefetch.add(url);
    const lien = document.createElement("link");
    lien.rel = "prefetch";
    lien.href = url;
    document.head.appendChild(lien);
  }

  function estLienInterne(a) {
    if (!a || !a.href) return false;
    try {
      const url = new URL(a.href, window.location.href);
      return url.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  function gererSurvol(e) {
    const a = e.target.closest && e.target.closest("a[href]");
    if (a && estLienInterne(a)) prefetchLien(a.href);
  }

  document.addEventListener("mouseover", gererSurvol, { passive: true });
  document.addEventListener("touchstart", gererSurvol, { passive: true });
})();
