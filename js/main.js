
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("site-search-input");
  const searchClearBtn = document.getElementById("site-search-clear");
  const searchOverlay = document.getElementById('search-overlay');

  if (!searchInput) return;

  let suggBox = document.getElementById('search-suggestions');
  if (!suggBox) {
    suggBox = document.createElement('div');
    suggBox.id = 'search-suggestions';
    suggBox.className = 'search-suggestions';
    suggBox.style.display = 'none';
    searchInput.insertAdjacentElement('afterend', suggBox);
  }

  let currentSuggestions = [];
  let selectedIndex = -1;


  const openSearchOverlay = () => {
    document.body.classList.add('search-is-active');
    if (searchOverlay) searchOverlay.setAttribute('aria-hidden', 'false');
  };

  const closeSearchOverlay = () => {
    document.body.classList.remove('search-is-active');
    if (searchOverlay) searchOverlay.setAttribute('aria-hidden', 'true');
    suggBox.innerHTML = '';
    suggBox.style.display = 'none';
    currentSuggestions = [];
    selectedIndex = -1;
  };

  searchInput.addEventListener('focus', openSearchOverlay);
  searchInput.addEventListener('input', openSearchOverlay);

  if (searchOverlay) {
    searchOverlay.addEventListener('click', () => {
      searchInput.blur();
      closeSearchOverlay();
    });
  }

  const debounce = (fn, wait = 250) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  };

  const updateClearButton = () => {
    if (!searchClearBtn) return;
    searchClearBtn.classList.toggle('visible', searchInput.value.length > 0);
  };

  async function handleSuggestionClick(item) {
    try {
      if (item && item.tmdbId && !item.isLocal) {
        const response = await fetch('/api/search-public/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tmdbId: item.tmdbId, type: item.type || 'film' }),
        });

        if (response.ok) {
          const payload = await response.json();
          if (payload?.item) {
            window.location.href = urlSerie(payload.item);
            return;
          }
        }
      }
    } catch (error) {
      console.warn('Import du résultat sélectionné impossible:', error);
    }

    window.location.href = urlSerie(item);
  }

  async function suggest(term) {
    term = term.trim().toLowerCase();
    suggBox.innerHTML = '';
    currentSuggestions = [];
    selectedIndex = -1;
    if (term.length < 3) {
      suggBox.style.display = 'none';
      return;
    }
    try {
      const response = await fetch(`/api/search-public?q=${encodeURIComponent(term)}`);
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const data = await response.json();
      const matches = data.results || [];

      matches.slice(0, 8).forEach((m, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'suggest-item';
        const thumb = document.createElement('img');
        thumb.src = m.miniature || m.poster || 'assets/placeholder.jpg';
        thumb.alt = m.titre || '';
        thumb.className = 'suggest-thumb';
        const meta = document.createElement('div');
        meta.className = 'suggest-meta';
        const title = document.createElement('div');
        title.className = 'suggest-title';
        title.textContent = m.titre;
        const sub = document.createElement('div');
        sub.className = 'suggest-sub';
        sub.textContent = (m.genres || []).slice(0, 2).join(' • ') || (m.source === 'tmdb' ? 'Ajouté au clic' : 'Local');
        meta.append(title, sub);
        btn.append(thumb, meta);
        btn.addEventListener('click', () => handleSuggestionClick(m));
        btn.dataset.index = String(idx);
        suggBox.appendChild(btn);
        currentSuggestions.push(btn);
      });

      if (currentSuggestions.length) suggBox.style.display = 'block';
    } catch (e) {
      console.error('Suggestion error', e);
      try {
        const donnees = await chargerDonnees();
        const matches = (donnees.series || []).filter(s => (s.titre || '').toLowerCase().includes(term));
        matches.slice(0, 8).forEach((m, idx) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'suggest-item';
          const thumb = document.createElement('img');
          thumb.src = m.miniature || 'assets/placeholder.jpg';
          thumb.alt = m.titre || '';
          thumb.className = 'suggest-thumb';
          const meta = document.createElement('div');
          meta.className = 'suggest-meta';
          const title = document.createElement('div');
          title.className = 'suggest-title';
          title.textContent = m.titre;
          const sub = document.createElement('div');
          sub.className = 'suggest-sub';
          sub.textContent = (m.genres || []).slice(0, 2).join(' • ') || 'Local';
          meta.append(title, sub);
          btn.append(thumb, meta);
          btn.addEventListener('click', () => handleSuggestionClick(m));
          btn.dataset.index = String(idx);
          suggBox.appendChild(btn);
          currentSuggestions.push(btn);
        });
        if (currentSuggestions.length) suggBox.style.display = 'block';
      } catch (fallbackError) {
        console.error('Fallback suggestion error', fallbackError);
      }
    }
  }

  const debouncedSuggest = debounce(suggest, 200);

  searchInput.addEventListener("input", (e) => {
    const terme = e.target.value || '';
    updateClearButton();
    if (window.appliquerRechercheCatalogue) {
      window.appliquerRechercheCatalogue(terme.toLowerCase());
    }
    debouncedSuggest(terme);
  });

  if (searchClearBtn) {
    searchClearBtn.addEventListener("click", () => {
      searchInput.value = '';
      updateClearButton();
      if (window.appliquerRechercheCatalogue) {
        window.appliquerRechercheCatalogue('');
      }
      suggBox.innerHTML = '';
      suggBox.style.display = 'none';
      currentSuggestions = [];
      selectedIndex = -1;
      searchInput.focus();
    });
  }

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = encodeURIComponent(searchInput.value.trim());
      if (q.length === 0) return;
      if (selectedIndex >= 0 && currentSuggestions[selectedIndex]) return;
      e.preventDefault();
      window.location.href = `/search?q=${q}`;
    }
  });

  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('.search-bar-section')) {
      closeSearchOverlay();
    }
  });

  searchInput.addEventListener('keydown', (e) => {
    if (!currentSuggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, currentSuggestions.length - 1);
      updateSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateSelection();
    } else if (e.key === 'Escape') {
      closeSearchOverlay();
      suggBox.innerHTML = '';
      suggBox.style.display = 'none';
      currentSuggestions = [];
      selectedIndex = -1;
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && currentSuggestions[selectedIndex]) {
        e.preventDefault();
        currentSuggestions[selectedIndex].click();
        return;
      }
    }
  });

  function updateSelection() {
    currentSuggestions.forEach((btn, i) => {
      btn.classList.toggle('selected', i === selectedIndex);
      if (i === selectedIndex) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }
});


document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    const searchInput = document.getElementById("site-search-input");
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }
});
