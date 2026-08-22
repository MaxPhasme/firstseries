(function () {
  const PROXY_API = (window.PROXIES_EMBED_API && window.PROXIES_EMBED_API) || 'http://localhost:25569';

  async function tryExtension(type, url) {
    try {
      if (window.movixExtractM3u8 && typeof window.movixExtractM3u8 === 'function') {
        const res = await window.movixExtractM3u8(type, url);
        return res && (res.m3u8Url || res.videoLink) ? res.m3u8Url || res.videoLink : null;
      }
    } catch (e) {
      console.warn('movixExtractM3u8 failed', e);
    }
    return null;
  }

  async function callProxyGeneric(targetUrl) {
    try {
      const url = `${PROXY_API}/api/extract-generic?url=${encodeURIComponent(targetUrl)}`;
      const resp = await fetch(url, { method: 'GET' });
      if (!resp.ok) return null;
      const j = await resp.json();
      if (j && j.success && j.m3u8Url) return j.m3u8Url;
      return null;
    } catch (e) {
      console.warn('proxy extract failed', e);
      return null;
    }
  }

  async function extractFromPageUrl(pageUrl) {
    if (!pageUrl) return null;
    const ext = await tryExtension(null, pageUrl);
    if (ext) return ext;
    const proxy = await callProxyGeneric(pageUrl);
    if (proxy) return proxy;
    return null;
  }

  async function searchAndExtract(query) {
    if (!query) return null;
    try {
      const resp = await fetch('/api/get-video-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!resp.ok) return null;
      const j = await resp.json();
      if (j && j.success && j.videoLink) return j.videoLink;
      return null;
    } catch (e) {
      console.warn('searchAndExtract failed', e);
      return null;
    }
  }

  window.extractFromPageUrl = extractFromPageUrl;
  window.searchAndExtract = searchAndExtract;
})();
