
function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name) || '';
}

document.addEventListener('DOMContentLoaded', async () => {
  const q = getQueryParam('q').trim().toLowerCase();
  const input = document.getElementById('search-bar');
  if (input) {
    input.value = q || '';
  }

  const resultsContainer = document.getElementById('search-results');
  const empty = document.getElementById('search-empty');

  if (!resultsContainer) return;
  try {
    const response = await fetch(`/api/search-public?q=${encodeURIComponent(q)}`);
    if (!response.ok) {
      throw new Error(`Erreur API: ${response.status}`);
    }
    const data = await response.json();
    const matches = data.results || [];
    
    resultsContainer.replaceChildren();
    if (!matches.length) {
      empty.style.display = '';
      return;
    } else {
      empty.style.display = 'none';
    }

    matches.forEach((m) => {
      const card = creerCarteSerie(m);
      resultsContainer.appendChild(card);
    });
  } catch (e) {
    console.error('Erreur recherche', e);
    try {
      const donnees = await chargerDonnees();
      const matches = (donnees.series || []).filter(s => (s.titre || '').toLowerCase().includes(q));
      resultsContainer.replaceChildren();
      if (!matches.length) {
        empty.style.display = '';
        return;
      } else {
        empty.style.display = 'none';
      }
      matches.forEach((m) => {
        const card = creerCarteSerie(m);
        resultsContainer.appendChild(card);
      });
    } catch (fallbackError) {
      resultsContainer.innerHTML = '<p>Erreur lors de la recherche.</p>';
    }
  }

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = input.value.trim();
        if (!val) return;
        const q2 = encodeURIComponent(val);
        window.location.href = `/search.html?q=${q2}`;
      }
    });
  }
});
