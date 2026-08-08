// catalogue.js
// Affiche la liste des contenus (séries et films) sur index.html

let genresDisponibles = [];
let filtreGenreActif = null;
let filtreTypeActif = null;
let filtreAfficheActif = false;
let termeRecherche = "";

async function chargerCatalogue() {
  const grid = document.getElementById("serie-grid");
  const loadingMsg = document.getElementById("loading-msg");

  try {
    const donnees = await chargerDonnees();

    if (loadingMsg) loadingMsg.remove();

    if (!donnees.series || donnees.series.length === 0) {
      grid.innerHTML = "<p>Aucun contenu pour le moment.</p>";
      return;
    }

    genresDisponibles = extraireGenres(donnees.series);
    construireFiltresGenres();
    construireFiltresType();

    donnees.series.forEach((serie) => {
      grid.appendChild(creerCarteSerie(serie));
    });

    appliquerFiltresCatalogue();
  } catch (erreur) {
    console.error(erreur);
    grid.innerHTML = "<p>Erreur lors du chargement du catalogue.</p>";
  }
}

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

  filtreList.innerHTML = genresDisponibles
    .map((genre) => {
      const icon = GENRE_ICONS[genre] || "🎬";
      return `
        <button type="button" class="filter-chip" data-genre="${genre}">
          <span class="filter-chip-icon">${icon}</span>
          <span>${genre}</span>
        </button>
      `;
    })
    .join("");

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
    const searchBar = document.getElementById("search-bar");
    if (searchBar) searchBar.value = "";
    mettreAJourChips();
    appliquerFiltresCatalogue();
  });
}

function construireFiltresType() {
  const boutonTous = document.getElementById("filter-all");
  const boutonSeries = document.getElementById("filter-series");
  const boutonFilms = document.getElementById("filter-films");

  if (!boutonTous || !boutonSeries || !boutonFilms) return;

  boutonTous.addEventListener("click", () => {
    filtreTypeActif = null;
    mettreAJourChips();
    appliquerFiltresCatalogue();
  });

  boutonSeries.addEventListener("click", () => {
    filtreTypeActif = "serie";
    mettreAJourChips();
    appliquerFiltresCatalogue();
  });

  boutonFilms.addEventListener("click", () => {
    filtreTypeActif = "film";
    mettreAJourChips();
    appliquerFiltresCatalogue();
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
  document.querySelectorAll(".video-card").forEach((carte) => {
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

function creerCarteSerie(serie) {
  const isFilm = serie.type === "film" || (!serie.saisons?.length && (serie.videoUrl || "").trim() !== "");

  const carte = document.createElement("div");
  carte.className = "video-card";
  carte.addEventListener("click", () => {
    const targetUrl = isFilm
      ? `video.html?serie=${encodeURIComponent(serie.id)}&type=film`
      : `serie.html?id=${encodeURIComponent(serie.id)}`;
    window.location.href = targetUrl;
  });

  const miniature = serie.miniature && serie.miniature.trim() !== ""
    ? serie.miniature
    : "assets/placeholder.jpg";
  const metaText = isFilm
    ? "Film"
    : `${serie.saisons?.length || 0} saison${serie.saisons?.length > 1 ? "s" : ""}`;

  carte.innerHTML = `
    <img src="${miniature}" alt="${serie.titre}">
    <div class="video-info">
      <h3>${serie.titre}</h3>
      <div class="genre-tags">${(serie.genres || []).map((genre) => `<span>${genre}</span>`).join("")}</div>
      <span class="meta-saisons">${metaText}</span>
    </div>
  `;
  carte.dataset.titre = serie.titre.toLowerCase();
  carte.dataset.genres = (serie.genres || []).join("|");
  carte.dataset.affiche = String(Boolean(serie.affiche));
  carte.dataset.type = serie.type || "serie";

  return carte;
}

async function initialiserHeroSlider() {
  const heroSlides = document.getElementById("hero-slides");
  const heroDots = document.getElementById("hero-dots");

  if (!heroSlides) return;

  try {
    const donnees = await chargerDonnees();

    if (!donnees.series || donnees.series.length === 0) return;

    const series = donnees.series.slice(0, 6);

    series.forEach((serie, index) => {
      const miniature = serie.miniature && serie.miniature.trim() !== ""
        ? serie.miniature
        : "assets/placeholder.jpg";

      const slide = document.createElement("div");
      slide.className = `hero-slide ${index === 0 ? "active" : ""}`;
      slide.style.backgroundImage = `url('${miniature}')`;
      slide.addEventListener("click", () => {
        const targetUrl = (serie.type || "").toLowerCase() === "film"
          ? `video.html?serie=${encodeURIComponent(serie.id)}&type=film`
          : `serie.html?id=${encodeURIComponent(serie.id)}`;
        window.location.href = targetUrl;
      });

      const nbSaisons = serie.saisons.length;
      const nbEpisodes = serie.saisons.reduce((acc, s) => acc + (s.episodes?.length || 0), 0);

      slide.innerHTML = `
        <div class="hero-slide-content">
          <h2>${serie.titre}</h2>
          <p class="meta">${nbSaisons} saison${nbSaisons > 1 ? "s" : ""} • ${nbEpisodes} épisode${nbEpisodes > 1 ? "s" : ""}</p>
          <p>${serie.synopsis}</p>
          <button class="hero-slide-btn">Regarder</button>
        </div>
      `;

      heroSlides.appendChild(slide);

      const dot = document.createElement("button");
      dot.className = `hero-dot ${index === 0 ? "active" : ""}`;
      dot.addEventListener("click", () => goToSlide(index));
      heroDots.appendChild(dot);
    });

    initAutoSlide();
  } catch (erreur) {
    console.error(erreur);
  }
}

let currentSlide = 0;
let autoSlideInterval = null;

function showSlide(index) {
  const slides = document.querySelectorAll(".hero-slide");
  const dots = document.querySelectorAll(".hero-dot");

  if (slides.length === 0) return;

  currentSlide = (index + slides.length) % slides.length;

  slides.forEach((slide) => slide.classList.remove("active"));
  dots.forEach((dot) => dot.classList.remove("active"));

  slides[currentSlide].classList.add("active");
  dots[currentSlide].classList.add("active");
}

function goToSlide(index) {
  clearInterval(autoSlideInterval);
  showSlide(index);
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
    showSlide(currentSlide + 1);
  }, 5000);
}

document.addEventListener("DOMContentLoaded", () => {
  initialiserHeroSlider();
  chargerCatalogue();

  const prevBtn = document.getElementById("hero-prev");
  const nextBtn = document.getElementById("hero-next");

  if (prevBtn) prevBtn.addEventListener("click", prevSlide);
  if (nextBtn) nextBtn.addEventListener("click", nextSlide);
});
