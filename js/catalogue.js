
let genresDisponibles = [];
let filtreGenreActif = null;
let filtreTypeActif = null;
let filtreAfficheActif = false;
let termeRecherche = "";
let cartesCatalogueCache = null; // cache des .video-card, évite de requêter le DOM à chaque filtre

function obtenirTypePageCatalogue() {
  const type = new URLSearchParams(window.location.search).get("type");
  if (type === "serie" || type === "series") return "serie";
  if (type === "film" || type === "films") return "film";
  if (type === "all" || type === "tous") return "all";
  return null;
}

function afficherPageCatalogueType(donnees, typePage) {
  document.body.classList.add("type-catalogue-page");
  ["#hero-slider", ".search-bar-section", ".platforms-section", "#watching-section"].forEach((selector) => {
    const element = document.querySelector(selector);
    if (element) element.hidden = true;
  });

  const container = document.getElementById("rows-container");
  if (!container) return;

  const items = (donnees.series || []).filter((item) => typePage === "all" || (typePage === "film" ? isFilm(item) : !isFilm(item)));
  const section = document.createElement("section");
  section.className = "catalogue-page-list";

  const title = document.createElement("h1");
  title.className = "section-title";
  title.textContent = typePage === "film" ? "Tous les films" : typePage === "serie" ? "Toutes les séries" : "Tout le catalogue";

  const grid = document.createElement("div");
  grid.className = "video-grid catalogue-full-grid";
  items.forEach((item) => grid.appendChild(creerCarteSerie(item)));

  section.append(title, grid);
  container.replaceChildren(section);
}

async function chargerCatalogue() {
  const container = document.getElementById("rows-container");
  const loadingMsg = document.getElementById("loading-msg");
  const typePage = obtenirTypePageCatalogue();

  try {
    const donnees = await chargerDonnees();

    if (loadingMsg) loadingMsg.remove();

    if (!donnees.series || donnees.series.length === 0) {
      container.innerHTML = "<p>Aucun contenu pour le moment.</p>";
      return;
    }

    genresDisponibles = extraireGenres(donnees.series);
    construireFiltresGenres();
    construireFiltresType();

    container.replaceChildren();
    cartesCatalogueCache = null; // le DOM va être reconstruit, on invalide le cache des cartes

    const loadingMsg2 = document.createElement('div');
    loadingMsg2.id = 'catalog-loading';
    loadingMsg2.className = 'skeleton-row';
    for (let i = 0; i < 10; i++) {
      const skeletonCard = document.createElement('div');
      skeletonCard.className = 'skeleton-card';
      loadingMsg2.appendChild(skeletonCard);
    }
    container.appendChild(loadingMsg2);

    if (typePage) {
      loadingMsg2.remove();
      afficherPageCatalogueType(donnees, typePage);
      return;
    }

    const itemsPourMeta = (donnees.series || [])
      .filter((item) => isFilm(item) && !item.date && !item.release_date && Number.isInteger(Number(item.tmdbId)) && Number(item.tmdbId) > 0)
      .slice(0, 20);
    const metaMap = {};
    if (itemsPourMeta.length) {
      try {
        const chunks = [];
        for (let i = 0; i < itemsPourMeta.length; i += 50) chunks.push(itemsPourMeta.slice(i, i + 50));

        const promesses = chunks.map((chunk) => {
          const ids = chunk.map((item) => Number(item.tmdbId));
          const types = chunk.map((item) => ((item.tmdbType || item.type || 'serie').toLowerCase() === 'film' || (item.tmdbType || item.type || 'serie').toLowerCase() === 'movie') ? 'movie' : 'tv');
          return fetch('/api/tmdb/metadata?ids=' + ids.join(',') + '&types=' + types.join(',')).then(r => r.ok ? r.json() : null);
        });
        
        const resultats = await Promise.all(promesses);
        resultats.forEach(body => {
          if (body && body.results) Object.assign(metaMap, body.results);
        });

        (donnees.series || []).forEach((item) => {
          const id = Number(item.tmdbId);
          const meta = metaMap[id];
          const dateValue = item.date || item.release_date || item.first_air_date || (meta && (meta.date || meta.release_date || meta.first_air_date));
          if (dateValue) {
            item.date = dateValue;
            item._date = dateValue;
            if (item.type === 'film') item.release_date = dateValue;
            else item.first_air_date = dateValue;
          }
        });
      } catch (e) {
        console.warn('Erreur metadata TMDB:', e);
      }
    }

    const loadingEl = document.getElementById('catalog-loading');
    if (loadingEl) loadingEl.remove();

    const rangees = [];
    const filmsDisponibles = (donnees.series || []).filter((item) => isFilm(item));
    const filmsParTmdbId = new Map(
      filmsDisponibles
        .filter((item) => Number.isInteger(Number(item.tmdbId)) && Number(item.tmdbId) > 0)
        .map((item) => [Number(item.tmdbId), item])
    );

    try {
      const rankingsResponse = await fetch('/api/tmdb/rankings?types=popular,top-rated,upcoming', { cache: 'no-store' });
      if (!rankingsResponse.ok) throw new Error('Classements TMDB indisponibles');
      const rankings = (await rankingsResponse.json()).rankings || {};
      const rankingRows = [
        ['Top films populaires', 'popular', 'row-films-populaires'],
        ['Top films les mieux notés', 'top-rated', 'row-films-notes'],
        ['Films bientôt disponibles', 'upcoming', 'row-films-a-venir'],
      ];

      rankingRows.forEach(([titre, key, id]) => {
        const items = (rankings[key] || [])
          .map((item) => filmsParTmdbId.get(Number(item.tmdbId)))
          .filter(Boolean);
        if (items.length) rangees.push({ titre, items, id });
      });
    } catch (rankingError) {
    }
    
    const featured = (donnees.series || []).filter(s => s.affiche).slice(0, 20);
    if (featured.length) rangees.push({ titre: 'À la une', items: featured, id: 'row-featured' });

    let films = filmsDisponibles.slice(0, 200);
    films.forEach((film) => {
      const id = Number(film.tmdbId);
      const meta = metaMap[id];
      film._release_date = film._release_date || film.date || film.release_date || (meta && (meta.release_date || meta.date)) || null;
    });
    films.sort((a, b) => {
      const da = a._release_date ? new Date(a._release_date).getTime() : 0;
      const db = b._release_date ? new Date(b._release_date).getTime() : 0;
      if (da === db) return (a.titre || '').localeCompare(b.titre || '');
      return da - db;
    });
    films = films.slice(0, 20);
    if (films.length && !rangees.some((rangee) => rangee.id === 'row-films-populaires')) {
      rangees.push({ titre: 'Films du catalogue', items: films, id: 'row-films' });
    }

    genresDisponibles.slice(0, 6).forEach((genre) => {
      const items = (donnees.series || []).filter(s => (s.genres || []).includes(genre)).slice(0, 20);
      if (items.length) rangees.push({ titre: genre, items, id: `row-genre-${genre.replace(/\s+/g,'-')}` });
    });

    let index = 0;
    const renderNext = () => {
      if (index < rangees.length) {
        const { titre, items, id } = rangees[index];
        container.appendChild(creerRowSection(titre, items, id));
        index++;
        requestAnimationFrame(renderNext);
      } else {
        appliquerFiltresCatalogue();
        chargerEnCoursLecture(donnees);
      }
    };
    renderNext();
  } catch (erreur) {
    console.error(erreur);
    grid.innerHTML = "<p>Erreur lors du chargement du catalogue.</p>";
  }
}

const EMOJI_PAR_TITRE_RANGEE = {
  "À la une": "🔥",
  "Films populaires": "🎬",
  "Top films populaires": "🔥",
  "Top films les mieux notés": "🏆",
  "Films bientôt disponibles": "📅",
  "Films du catalogue": "🎬",
};
const EMOJI_PAR_GENRE = {
  "Action": "💥",
  "Aventure": "🗺️",
  "Animation": "🎨",
  "Comédie": "😂",
  "Crime": "🕵️",
  "Documentaire": "🎥",
  "Drame": "🎭",
  "Familial": "👨‍👩‍👧",
  "Fantastique": "🧙",
  "Histoire": "📜",
  "Horreur": "👻",
  "Musique": "🎵",
  "Mystère": "🔍",
  "Romance": "❤️",
  "Science-Fiction": "🚀",
  "Thriller": "🔪",
  "Guerre": "⚔️",
  "Western": "🤠",
};
function emojiPourRangee(titre) {
  return EMOJI_PAR_TITRE_RANGEE[titre] || EMOJI_PAR_GENRE[titre] || "🎞️";
}

function creerRowSection(titre, items, id) {
  const section = document.createElement('section');
  section.className = 'row-section';
  section.id = id;

  const header = document.createElement('div');
  header.className = 'row-header';
  const h3 = document.createElement('h3');
  const emoji = emojiPourRangee(titre);
  const badgeGauche = document.createElement('span');
  badgeGauche.className = 'row-emoji-badge';
  badgeGauche.textContent = emoji;
  badgeGauche.setAttribute('aria-hidden', 'true');
  const texte = document.createElement('span');
  texte.className = 'row-title-text';
  texte.textContent = `- ${titre} -`;
  const badgeDroit = badgeGauche.cloneNode(true);
  h3.append(badgeGauche, texte, badgeDroit);
  header.appendChild(h3);

  const nav = document.createElement('div');
  nav.className = 'row-nav';
  const left = document.createElement('button');
  left.type = 'button';
  left.className = 'row-nav-left';
  left.setAttribute('aria-label', `Précédent ${titre}`);
  left.textContent = '❮';
  const right = document.createElement('button');
  right.type = 'button';
  right.className = 'row-nav-right';
  right.setAttribute('aria-label', `Suivant ${titre}`);
  right.textContent = '❯';
  nav.append(left, right);
  header.appendChild(nav);

  const trackWrap = document.createElement('div');
  trackWrap.className = 'row-track-wrap';
  const track = document.createElement('div');
  track.className = 'row-track';

  items.forEach((item) => {
    const card = creerCarteSerie(item);
    card.classList.add('row-item');
    track.appendChild(card);
  });

  trackWrap.appendChild(track);
  section.append(header, trackWrap);

  left.addEventListener('click', () => { scrollRow(track, -1); });
  right.addEventListener('click', () => { scrollRow(track, 1); });

  return section;
}

function scrollRow(track, direction) {
  const card = track.querySelector('.row-item');
  if (!card) return;
  const cardStyle = window.getComputedStyle(card);
  const gap = parseInt(cardStyle.marginRight || '12', 10) || 12;
  const cardWidth = card.getBoundingClientRect().width + gap;
  track.scrollBy({ left: direction * cardWidth * 4, behavior: 'smooth' });
}

async function chargerEnCoursLecture(donnees) {
  const section = document.getElementById("watching-section");
  const grille = document.getElementById("watching-grid");
  const vide = document.getElementById("watching-empty");

  window.__firstseriesDonnees = donnees;

  if (!section || !grille || !vide) return;

  const lectures = lireLecturesEnCours();
  grille.replaceChildren();

  if (lectures.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  vide.style.display = "none";

  lectures.forEach((lecture) => {
    const serie = (donnees.series || []).find((serieItem) => serieItem.id === lecture.serieId);
    if (!serie) return;
    const carte = creerCarteLectureEnCours(lecture, serie);
    grille.appendChild(carte);
  });
}

function creerCarteLectureEnCours(lecture, serie) {
  const isFilm = lecture.type === "film";
  const imageUrl = lecture.imageUrl || serie.miniature || "assets/placeholder.jpg";
  const label = isFilm
    ? "Film en cours"
    : `S${lecture.saisonNumero || "?"} E${lecture.episodeNumero || "?"}`;
  const subtitle = isFilm ? "Film en cours" : lecture.titre || serie.titre;
  const saison = lecture.saisonId ? trouverSaison(serie, lecture.saisonId) : null;
  const episode = saison && lecture.episodeId ? trouverEpisode(saison, lecture.episodeId) : null;
  const destination = isFilm
    ? urlSerie(serie)
    : episode
      ? urlEpisode(serie, saison, episode)
      : urlSerie(serie);

  const carte = document.createElement("div");
  carte.className = "watching-card";

  const lien = document.createElement("a");
  lien.className = "watching-card-link";
  lien.href = destination;
  lien.title = lecture.serieTitle || serie.titre;

  const image = document.createElement("img");
  image.src = imageUrl;
  image.alt = serie.titre || "Affiche du contenu";
  image.loading = "lazy";
  image.addEventListener("error", () => {
    image.src = "assets/placeholder.jpg";
  }, { once: true });

  const body = document.createElement("div");
  body.className = "watching-card-body";

  const titre = document.createElement("h3");
  titre.textContent = serie.titre || "Sans titre";

  const meta = document.createElement("div");
  meta.className = "watching-card-meta";
  meta.textContent = label;

  const sousTitre = document.createElement("p");
  sousTitre.className = "watching-card-subtitle";
  sousTitre.textContent = subtitle;

  body.append(titre, meta, sousTitre);
  lien.append(image, body);
  carte.appendChild(lien);

  const boutonSupprimer = document.createElement("button");
  boutonSupprimer.type = "button";
  boutonSupprimer.className = "watching-remove";
  boutonSupprimer.setAttribute("aria-label", "Retirer de la liste des lectures en cours");
  boutonSupprimer.textContent = "×";
  boutonSupprimer.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    supprimerLectureEnCours(lecture.serieId, lecture.saisonId, lecture.episodeId, lecture.type);
    carte.remove();
    const grilleItems = document.querySelectorAll(".watching-card");
    if (grilleItems.length === 0) {
      const section = document.getElementById("watching-section");
      if (section) section.style.display = "none";
    }
  });

  carte.appendChild(boutonSupprimer);
  return carte;
}

window.rafraichirEnCoursLecture = () => {
  if (window.__firstseriesDonnees) chargerEnCoursLecture(window.__firstseriesDonnees);
};

function extraireGenres(series) {
  return Array.from(
    new Set(
      series.flatMap((serie) => (serie.genres || []).map((genre) => genre.trim()).filter(Boolean))
    )
  ).sort();
}

const GENRE_ICONS = {
  Action: "⚔️",
  Aventure: "🧭",
  Comédie: "😂",
  Drame: "🎭",
  Fantastique: "🪄",
  Horreur: "👻",
  Policier: "🕵️",
  "Science-Fiction": "🚀",
  Thriller: "🔪",
};

function construireFiltresGenres() {
  const filtreList = document.getElementById("genre-filter-list");
  const clearFilters = document.getElementById("clear-genre-filters");

  if (!filtreList || !clearFilters) return;

  filtreList.replaceChildren();
  genresDisponibles.forEach((genre) => {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "filter-chip";
    bouton.dataset.genre = genre;

    const icone = document.createElement("span");
    icone.className = "filter-chip-icon";
    icone.setAttribute("aria-hidden", "true");
    icone.textContent = GENRE_ICONS[genre] || "🎬";

    const libelle = document.createElement("span");
    libelle.textContent = genre;
    bouton.append(icone, libelle);
    filtreList.appendChild(bouton);
  });

  filtreList.querySelectorAll("button[data-genre]").forEach((bouton) => {
    bouton.addEventListener("click", () => {
      filtreGenreActif = bouton.dataset.genre;
      filtreAfficheActif = false;
      mettreAJourChips();
      appliquerFiltresCatalogue();
    });
  });

  clearFilters.addEventListener("click", () => {
    filtreGenreActif = null;
    filtreTypeActif = null;
    filtreAfficheActif = false;
    termeRecherche = "";
    const searchInput = document.getElementById("site-search-input");
    if (searchInput) searchInput.value = "";
    const searchClearBtn = document.getElementById("site-search-clear");
    if (searchClearBtn) searchClearBtn.classList.remove("visible");
    mettreAJourChips();
    appliquerFiltresCatalogue();
  });
}

function construireFiltresType() {
  const boutonTous = document.getElementById("filter-all");
  const boutonSeries = document.getElementById("filter-series");
  const boutonFilms = document.getElementById("filter-films");

  if (!boutonTous || !boutonSeries || !boutonFilms) return;

  const typePage = obtenirTypePageCatalogue();
  boutonTous.classList.toggle("active", typePage === null || typePage === "all");
  boutonSeries.classList.toggle("active", typePage === "serie");
  boutonFilms.classList.toggle("active", typePage === "film");

  boutonTous.addEventListener("click", () => {
    window.location.href = "app.html?type=all";
  });

  boutonSeries.addEventListener("click", () => {
    window.location.href = "app.html?type=serie";
  });

  boutonFilms.addEventListener("click", () => {
    window.location.href = "app.html?type=film";
  });
}

function mettreAJourChips() {
  document.querySelectorAll("#genre-filter-list button[data-genre]").forEach((bouton) => {
    bouton.classList.toggle("active", bouton.dataset.genre === filtreGenreActif);
  });

  const filtreFeatured = document.getElementById("featured-filter");
  if (filtreFeatured) {
    filtreFeatured.classList.toggle("active", filtreAfficheActif);
  }

  const filtreTous = document.getElementById("filter-all");
  const filtreSeries = document.getElementById("filter-series");
  const filtreFilms = document.getElementById("filter-films");
  if (filtreTous && filtreSeries && filtreFilms) {
    filtreTous.classList.toggle("active", filtreTypeActif === null);
    filtreSeries.classList.toggle("active", filtreTypeActif === "serie");
    filtreFilms.classList.toggle("active", filtreTypeActif === "film");
  }
}

function appliquerFiltresCatalogue() {
  if (!cartesCatalogueCache) {
    cartesCatalogueCache = Array.from(document.querySelectorAll(".video-card"));
  }
  cartesCatalogueCache.forEach((carte) => {
    const titre = carte.dataset.titre || "";
    const genres = (carte.dataset.genres || "").split("|").filter(Boolean);
    const affiche = carte.dataset.affiche === "true";
    const type = carte.dataset.type || "serie";

    const termesOk = termeRecherche === "" || titre.includes(termeRecherche.toLowerCase());
    const genreOk = !filtreGenreActif || genres.includes(filtreGenreActif);
    const typeOk = !filtreTypeActif || type === filtreTypeActif;
    const afficheOk = !filtreAfficheActif || affiche;

    carte.style.display = termesOk && genreOk && typeOk && afficheOk ? "" : "none";
  });
}

function appliquerRechercheCatalogue(terme) {
  termeRecherche = terme.trim().toLowerCase();
  appliquerFiltresCatalogue();
}

window.appliquerRechercheCatalogue = appliquerRechercheCatalogue;

function formaterDateCarte(dateValeur) {
  if (!dateValeur) return "";

  const valeur = String(dateValeur).trim();
  if (!valeur) return "";

  const anneeMatch = valeur.match(/^\d{4}$/);
  if (anneeMatch) return anneeMatch[0];

  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return valeur;

  return String(date.getFullYear());
}

function getCurrentPlatformSlug() {
  const match = window.location.pathname.match(/^\/platforms\/([^/]+)$/i);
  return match ? match[1].toLowerCase() : null;
}

async function chargerPlateforme(slug = getCurrentPlatformSlug()) {
  if (!slug) return false;

  const container = document.getElementById("rows-container");
  const loadingMsg = document.getElementById("loading-msg");
  if (loadingMsg) loadingMsg.remove();

  const hero = document.getElementById("hero-slider");
  const searchSection = document.querySelector(".search-bar-section");
  const watchingSection = document.getElementById("watching-section");
  if (hero) hero.style.display = "none";
  if (searchSection) searchSection.style.display = "none";
  if (watchingSection) watchingSection.style.display = "none";

  if (!container) return false;

  container.replaceChildren();

  const loading = document.createElement("div");
  loading.id = "catalog-loading";
  loading.className = "skeleton-row";
  for (let i = 0; i < 6; i++) {
    const card = document.createElement("div");
    card.className = "skeleton-card";
    loading.appendChild(card);
  }
  container.appendChild(loading);

  try {
    const response = await fetch(`/api/platforms/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Plateforme introuvable");
    const payload = await response.json();
    const items = Array.isArray(payload.items) ? payload.items : [];

    const loadingEl = document.getElementById("catalog-loading");
    if (loadingEl) loadingEl.remove();

    const wrapper = document.createElement("section");
    wrapper.className = "row-section platform-catalog-section";

    const header = document.createElement("div");
    header.className = "row-header";
    const title = document.createElement("h3");
    title.innerHTML = '<span class="row-emoji-badge" aria-hidden="true">🎬</span><span class="row-title-text">' + (payload.label || slug.replace(/-/g, " ")) + '</span>';
    header.appendChild(title);
    wrapper.appendChild(header);

    const trackWrap = document.createElement("div");
    trackWrap.className = "row-track-wrap";
    const track = document.createElement("div");
    track.className = "row-track platform-catalog-grid";

    if (!items.length) {
      const empty = document.createElement("p");
      empty.style.color = "var(--text-muted)";
      empty.textContent = "Aucun contenu trouvé pour cette plateforme.";
      track.appendChild(empty);
    } else {
      items.forEach((item) => {
        const card = creerCarteSerie(item);
        card.classList.add("row-item");
        track.appendChild(card);
      });
    }

    trackWrap.appendChild(track);
    wrapper.appendChild(trackWrap);
    container.appendChild(wrapper);
    return true;
  } catch (error) {
    console.error("Erreur chargement plateforme:", error);
    const loadingEl = document.getElementById("catalog-loading");
    if (loadingEl) loadingEl.remove();
    container.innerHTML = "<p>Impossible de charger cette plateforme.</p>";
    return false;
  }
}

function obtenirDateCarte(serie) {
  return formaterDateCarte(serie?.date || serie?.release_date || serie?.first_air_date || serie?._date || serie?._release_date || "");
}

function creerCarteSerie(serie) {
  const isFilm = serie.type === "film" || (!serie.saisons?.length && (serie.videoUrl || "").trim() !== "");

  const carte = document.createElement("a");
  carte.className = "video-card";
  carte.href = urlSerie(serie);

  const miniature = serie.miniature && serie.miniature.trim() !== ""
    ? serie.miniature
    : "assets/placeholder.jpg";
  const metaText = isFilm
    ? "Film"
    : `${serie.saisons?.length || 0} saison${serie.saisons?.length > 1 ? "s" : ""}`;
  const dateAffichage = obtenirDateCarte(serie);

  const image = document.createElement("img");
  image.src = miniature;
  image.alt = serie.titre || "Affiche du contenu";
  image.loading = "lazy";
  image.addEventListener("error", () => {
    image.src = "assets/placeholder.jpg";
  }, { once: true });

  const infos = document.createElement("div");
  infos.className = "video-info";
  const titre = document.createElement("h3");
  titre.textContent = serie.titre || "Sans titre";
  const tags = document.createElement("div");
  tags.className = "genre-tags";
  (serie.genres || []).forEach((genre) => {
    const tag = document.createElement("span");
    tag.textContent = genre;
    tags.appendChild(tag);
  });
  const meta = document.createElement("span");
  meta.className = "meta-saisons";
  meta.textContent = metaText;
  infos.append(titre, tags, meta);

  if (dateAffichage) {
    const date = document.createElement("div");
    date.className = "video-card-date";
    date.textContent = dateAffichage;
    carte.append(image, date, infos);
  } else {
    carte.append(image, infos);
  }

  carte.dataset.titre = serie.titre.toLowerCase();
  carte.dataset.genres = (serie.genres || []).join("|");
  carte.dataset.affiche = String(Boolean(serie.affiche));
  carte.dataset.type = serie.type || "serie";

  return carte;
}

let heroItems = [];
let currentSlide = 0;
let autoSlideInterval = null;

async function initialiserHeroSlider() {
  const heroTrack = document.getElementById("hero-track");
  const heroDots = document.getElementById("hero-dots");

  if (!heroTrack) return;

  try {
    const donnees = await chargerDonnees();

    if (!donnees.series || donnees.series.length === 0) return;

    const enCarrousel = donnees.series.filter((s) => s.carrousel);
    heroItems = (enCarrousel.length ? enCarrousel : donnees.series).slice(0, 8);

    heroItems.forEach((serie, index) => {
      const miniature = serie.miniature && serie.miniature.trim() !== ""
        ? serie.miniature
        : "assets/placeholder.jpg";

      const item = document.createElement("button");
      item.type = "button";
      item.className = "hero-item";
      item.dataset.index = String(index);
      item.setAttribute("aria-label", `Voir ${serie.titre || "ce contenu"}`);

      const image = document.createElement("img");
      image.src = miniature;
      image.alt = serie.titre || "Affiche du contenu";
      image.loading = "lazy";
      image.addEventListener("error", () => {
        image.src = "assets/placeholder.jpg";
      }, { once: true });

      item.appendChild(image);
      item.addEventListener("click", () => gererClicHero(index));
      heroTrack.appendChild(item);

      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "hero-dot";
      dot.setAttribute("aria-label", `Afficher l'élément ${index + 1}`);
      dot.addEventListener("click", () => goToSlide(index));
      heroDots.appendChild(dot);
    });

    const total = heroItems.length;
    document.querySelectorAll(".hero-item").forEach((item) => {
      const i = Number(item.dataset.index);
      const decalage = decalageDepuisCentre(i, total);
      if (decalage === 0) item.classList.add("pos-0");
      else if (decalage === 1) item.classList.add("pos-1");
      else if (decalage === -1) item.classList.add("pos--1");
      else if (decalage === 2) item.classList.add("pos-2");
      else if (decalage === -2) item.classList.add("pos--2");
      else if (decalage === 3 || decalage === -3) item.classList.add("pos-3");
      else if (decalage === 4 || decalage === -4) item.classList.add("pos-4");
      else item.classList.add("pos-hidden");
    });

    afficherSlide(0);
    initAutoSlide();
  } catch (erreur) {
    console.error(erreur);
  }
}

function isFilm(serie) {
  return (serie.type || "").toLowerCase() === "film";
}

function decalageDepuisCentre(index, total) {
  let diff = ((index - currentSlide) % total + total) % total;
  if (diff > total / 2) diff -= total;
  return diff;
}

function gererClicHero(index) {
  if (index === currentSlide) {
    const serie = heroItems[currentSlide];
    if (!serie) return;
    window.location.href = urlSerie(serie);
  } else {
    goToSlide(index);
  }
}

function afficherSlide(index) {
  const total = heroItems.length;
  if (total === 0) return;

  currentSlide = (index + total) % total;

  document.querySelectorAll(".hero-item").forEach((item) => {
    const i = Number(item.dataset.index);
    const decalage = decalageDepuisCentre(i, total);
    item.classList.remove("pos-0", "pos-1", "pos--1", "pos-2", "pos--2", "pos-3", "pos--3", "pos-4", "pos--4", "pos-hidden");
    if (decalage === 0) item.classList.add("pos-0");
    else if (decalage === 1) item.classList.add("pos-1");
    else if (decalage === -1) item.classList.add("pos--1");
    else if (decalage === 2) item.classList.add("pos-2");
    else if (decalage === -2) item.classList.add("pos--2");
    else if (decalage === 3) item.classList.add("pos-3");
    else if (decalage === -3) item.classList.add("pos--3");
    else if (decalage === 4) item.classList.add("pos-4");
    else if (decalage === -4) item.classList.add("pos--4");
    else item.classList.add("pos-hidden");
  });

  document.querySelectorAll(".hero-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === currentSlide);
  });

  mettreAJourInfoHero();
}

function mettreAJourInfoHero() {
  const heroInfo = document.getElementById("hero-info");
  const serie = heroItems[currentSlide];
  if (!heroInfo || !serie) return;

  const saisons = Array.isArray(serie.saisons) ? serie.saisons : [];
  const nbSaisons = saisons.length;
  const nbEpisodes = saisons.reduce((acc, s) => acc + (s.episodes?.length || 0), 0);
  const metaText = isFilm(serie)
    ? "Film"
    : `${nbSaisons} saison${nbSaisons > 1 ? "s" : ""} • ${nbEpisodes} épisode${nbEpisodes > 1 ? "s" : ""}`;
  const cible = urlSerie(serie);

  heroInfo.replaceChildren();

  const titre = document.createElement("h2");
  titre.textContent = serie.titre || "Sans titre";

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = metaText;

  const synopsis = document.createElement("p");
  synopsis.className = "synopsis";
  synopsis.textContent = serie.synopsis || "";

  const regarder = document.createElement("a");
  regarder.className = "hero-info-btn";
  regarder.href = cible;
  regarder.textContent = "Regarder";

  heroInfo.append(titre, meta, synopsis, regarder);
}

function goToSlide(index) {
  clearInterval(autoSlideInterval);
  afficherSlide(index);
  initAutoSlide();
}

function nextSlide() {
  goToSlide(currentSlide + 1);
}

function prevSlide() {
  goToSlide(currentSlide - 1);
}

function initAutoSlide() {
  autoSlideInterval = setInterval(() => {
    afficherSlide(currentSlide + 1);
  }, 5000);
}

document.addEventListener("DOMContentLoaded", async () => {
  const platformSlug = getCurrentPlatformSlug();
  if (platformSlug) {
    await chargerPlateforme(platformSlug);
  } else {
    initialiserHeroSlider();
    chargerCatalogue();
  }

  const prevBtn = document.getElementById("hero-prev");
  const nextBtn = document.getElementById("hero-next");

  if (prevBtn) prevBtn.addEventListener("click", prevSlide);
  if (nextBtn) nextBtn.addEventListener("click", nextSlide);

  document.querySelectorAll(".platform-card").forEach((card) => {
    card.addEventListener("click", () => {
      const slug = card.dataset.platform;
      if (slug) {
        window.location.href = `/platforms/${slug}`;
      }
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const slug = card.dataset.platform;
        if (slug) {
          window.location.href = `/platforms/${slug}`;
        }
      }
    });
  });

  const platformsTrack = document.querySelector(".platforms-track");
  if (platformsTrack) {
    const resetPlatformsPosition = () => {
      platformsTrack.scrollLeft = 0;
    };

    resetPlatformsPosition();
    requestAnimationFrame(resetPlatformsPosition);
    window.addEventListener("pageshow", resetPlatformsPosition, { once: true });

    let touchStartX = 0;
    let touchStartScroll = 0;
    let touchMoved = false;
    let suppressPlatformClick = false;

    platformsTrack.addEventListener("touchstart", (event) => {
      const touch = event.touches[0];
      touchStartX = touch.clientX;
      touchStartScroll = platformsTrack.scrollLeft;
      touchMoved = false;
    }, { passive: true });

    platformsTrack.addEventListener("touchmove", (event) => {
      const touch = event.touches[0];
      const deltaX = touch.clientX - touchStartX;
      if (Math.abs(deltaX) < 4) return;
      touchMoved = true;
      event.preventDefault();
      platformsTrack.scrollLeft = touchStartScroll - deltaX;
    }, { passive: false });

    platformsTrack.addEventListener("touchend", () => {
      if (!touchMoved) return;
      suppressPlatformClick = true;
      window.setTimeout(() => { suppressPlatformClick = false; }, 0);
    }, { passive: true });

    platformsTrack.addEventListener("click", (event) => {
      if (suppressPlatformClick) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
  }

  const heroCarousel = document.querySelector(".hero-carousel");
  if (heroCarousel) {
    let touchStartX = 0;
    let touchStartY = 0;

    heroCarousel.addEventListener("touchstart", (event) => {
      const touch = event.changedTouches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    }, { passive: true });

    heroCarousel.addEventListener("touchend", (event) => {
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;

      if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY)) return;

      if (deltaX < 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }, { passive: true });
  }
});
