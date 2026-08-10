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
    chargerEnCoursLecture(donnees);
  } catch (erreur) {
    console.error(erreur);
    grid.innerHTML = "<p>Erreur lors du chargement du catalogue.</p>";
  }
}

async function chargerEnCoursLecture(donnees) {
  const section = document.getElementById("watching-section");
  const grille = document.getElementById("watching-grid");
  const vide = document.getElementById("watching-empty");

  if (!section || !grille || !vide) return;

  const lectures = lireLecturesEnCours();
  grille.replaceChildren();

  if (lectures.length === 0) {
    vide.style.display = "block";
    return;
  }

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
      const vide = document.getElementById("watching-empty");
      if (vide) vide.style.display = "block";
    }
  });

  carte.appendChild(boutonSupprimer);
  return carte;
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

  const carte = document.createElement("a");
  carte.className = "video-card";
  carte.href = urlSerie(serie);

  const miniature = serie.miniature && serie.miniature.trim() !== ""
    ? serie.miniature
    : "assets/placeholder.jpg";
  const metaText = isFilm
    ? "Film"
    : `${serie.saisons?.length || 0} saison${serie.saisons?.length > 1 ? "s" : ""}`;

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
  carte.append(image, infos);
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

    heroItems = donnees.series.slice(0, 8);

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

    afficherSlide(0);
    initAutoSlide();
  } catch (erreur) {
    console.error(erreur);
  }
}

function isFilm(serie) {
  return (serie.type || "").toLowerCase() === "film";
}

// Décalage circulaire (le plus court, signé) entre l'index d'un item et la position centrale actuelle.
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

document.addEventListener("DOMContentLoaded", () => {
  initialiserHeroSlider();
  chargerCatalogue();

  const prevBtn = document.getElementById("hero-prev");
  const nextBtn = document.getElementById("hero-next");

  if (prevBtn) prevBtn.addEventListener("click", prevSlide);
  if (nextBtn) nextBtn.addEventListener("click", nextSlide);

  // Navigation tactile sur mobile : glisser horizontalement sur le carousel.
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
