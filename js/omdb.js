async function chargerEtAfficherOmdb(serie, options = {}) {
  if (!serie || !serie.id) return;
  const containerId = options.containerId || 'omdb-block';
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('section');
    container.className = 'detail-section';
    container.id = containerId;
    container.innerHTML = `
      <div class="detail-section-header"><h2>Informations OMDb</h2></div>
      <div class="omdb-content"></div>
    `;
    const main = document.querySelector('main');
    const commentaireSection = main ? main.querySelector('.commentaires') : null;
    if (main) {
      if (commentaireSection) {
        main.insertBefore(container, commentaireSection);
      } else {
        main.appendChild(container);
      }
    }
  }

  const contentEl = container.querySelector('.omdb-content');
  if (!contentEl) return;
  contentEl.innerHTML = '<p>Chargement des informations externes…</p>';

  try {
    const resp = await fetch(`/api/omdb/serie/${encodeURIComponent(serie.id)}`);
    if (!resp.ok) {
      contentEl.innerHTML = '<p>Informations externes indisponibles.</p>';
      return;
    }

    const { imdbData } = await resp.json();
    if (!imdbData) {
      contentEl.innerHTML = '<p>Aucune donnée OMDb trouvée.</p>';
      return;
    }

    const fields = [];
    fields.push(`<div class="meta-row"><strong>${imdbData.Title || ''}</strong> <span class="muted">(${imdbData.Year || ''})</span></div>`);

    const ratings = [];
    if (imdbData.imdbRating) {
      ratings.push(`<span class="meta-pill">IMDb ${imdbData.imdbRating}${imdbData.imdbVotes ? ' • ' + imdbData.imdbVotes : ''}</span>`);
    }
    if (imdbData.Metascore) {
      ratings.push(`<span class="meta-pill">Metascore ${imdbData.Metascore}</span>`);
    }
    if (Array.isArray(imdbData.Ratings)) {
      imdbData.Ratings.forEach((r) => ratings.push(`<span class="meta-pill">${r.Source} ${r.Value}</span>`));
    }
    if (ratings.length) fields.push(`<div class="detail-meta">${ratings.join(' ')}</div>`);

    const basics = [];
    if (imdbData.Genre) basics.push(imdbData.Genre);
    if (imdbData.Runtime) basics.push(imdbData.Runtime);
    if (imdbData.Rated) basics.push(imdbData.Rated);
    if (basics.length) fields.push(`<div class="meta-pill">${basics.join(' • ')}</div>`);

    const people = [];
    if (imdbData.Director) people.push(`<div><strong>Réalisateur(s):</strong> ${imdbData.Director}</div>`);
    if (imdbData.Writer) people.push(`<div><strong>Scénariste(s):</strong> ${imdbData.Writer}</div>`);
    if (imdbData.Actors) people.push(`<div><strong>Acteurs:</strong> ${imdbData.Actors}</div>`);
    if (people.length) fields.push(`<div class="detail-people">${people.join('')}</div>`);

    if (imdbData.Plot) fields.push(`<div class="detail-plot"><strong>Synopsis:</strong><p>${imdbData.Plot}</p></div>`);

    const imgs = [];
    if (imdbData.Poster && imdbData.Poster !== 'N/A') {
      imgs.push(`<a href="${imdbData.Poster}" target="_blank" rel="noopener"><img class="omdb-poster" src="${imdbData.Poster}" alt="Affiche"></a>`);
    }
    if (imgs.length) fields.push(`<div class="omdb-images">${imgs.join('')}</div>`);

    const prod = [];
    if (imdbData.Production) prod.push(`<div><strong>Production:</strong> ${imdbData.Production}</div>`);
    if (imdbData.Awards) prod.push(`<div><strong>Récompenses:</strong> ${imdbData.Awards}</div>`);
    if (prod.length) fields.push(`<div class="detail-prod">${prod.join('')}</div>`);

    const links = [];
    if (imdbData.imdbID) {
      links.push(`<a href="https://www.imdb.com/title/${imdbData.imdbID}" target="_blank" rel="noopener" class="action-button small">IMDb</a>`);
    }
    if (imdbData.Website && imdbData.Website !== 'N/A') {
      links.push(`<a href="${imdbData.Website}" target="_blank" rel="noopener" class="action-button small">Site officiel</a>`);
    }
    if (links.length) fields.push(`<div class="detail-links">${links.join(' ')}</div>`);

    contentEl.innerHTML = fields.join('\n');
  } catch (err) {
    console.error('OMDb display error', err);
    contentEl.innerHTML = '<p>Impossible de charger les informations OMDb.</p>';
  }
}
