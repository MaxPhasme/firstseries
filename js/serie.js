
let saisonActiveId = null;
let serieActuelle = null;

function parserRouteSerie() {
  const pathname = window.location.pathname.replace(/\/+$/, "");
  if (!pathname.startsWith("/series/")) {
    return {};
  }

  const segments = pathname.slice("/series/".length).split("/").filter(Boolean);
  return {
    serieSlug: segments[0] || null,
  };
}

function formaterDateSerie(serie, estFilm = false) {
  const dateVal = serie?.date || serie?.release_date || serie?.first_air_date || "";
  if (!dateVal) return "";

  const dateText = String(dateVal).trim();
  if (!dateText) return "";

  const anneeMatch = dateText.match(/^\d{4}$/);
  if (anneeMatch) {
    return `${estFilm ? "Sortie" : "Diffusion"} ${anneeMatch[0]}`;
  }

  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) {
    return `${estFilm ? "Sortie" : "Diffusion"} ${dateText}`;
  }

  return `${estFilm ? "Sortie" : "Diffusion"} ${date.getFullYear()}`;
}

async function garantirDateTmdb(serie) {
  if (!serie || serie.date || serie.release_date || serie.first_air_date) return serie;
  const tmdbId = Number(serie.tmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return serie;

  try {
    const type = (serie.tmdbType || serie.type || 'serie').toLowerCase();
    const requestType = type === 'film' || type === 'movie' ? 'movie' : 'tv';
    const reponse = await fetch(`/api/tmdb/metadata?ids=${tmdbId}&types=${requestType}`);
    if (!reponse.ok) return serie;
    const body = await reponse.json();
    const meta = body.results?.[tmdbId];
    const dateValue = meta && (meta.date || meta.release_date || meta.first_air_date);
    if (dateValue) {
      serie.date = dateValue;
      if (serie.type === 'film') serie.release_date = dateValue;
      else serie.first_air_date = dateValue;
    }
  } catch (error) {
    console.warn('Impossible de récupérer la date TMDB pour la fiche:', error);
  }

  return serie;
}

async function chargerFicheSerie() {
  const params = new URLSearchParams(window.location.search);
  const serieId = params.get("id");
  const routeInfo = parserRouteSerie();

  const titreEl = document.getElementById("serie-titre");
  const synopsisEl = document.getElementById("serie-synopsis");
  const afficheEl = document.getElementById("serie-affiche");
  const typeBadgeEl = document.getElementById("serie-type-badge");
  const metaBadgeEl = document.getElementById("serie-meta-badge");
  const genresEl = document.getElementById("serie-genres");
  const statsEl = document.getElementById("serie-stats");
  const dateEl = document.getElementById("serie-date");
  const countEl = document.getElementById("detail-count");

  if (!serieId && !routeInfo.serieSlug) {
    titreEl.textContent = "Série introuvable";
    typeBadgeEl.textContent = "Contenu";
    metaBadgeEl.textContent = "Indisponible";
    return;
  }

  const donnees = await chargerDonnees();
  let serie = null;
  if (routeInfo.serieSlug) {
    serie = trouverSerieParSlug(donnees, routeInfo.serieSlug);
  }
  if (!serie && serieId) {
    serie = trouverSerie(donnees, serieId);
  }

  if (!serie) {
    titreEl.textContent = "Série introuvable";
    typeBadgeEl.textContent = "Contenu";
    metaBadgeEl.textContent = "Indisponible";
    return;
  }

  await garantirDateTmdb(serie);
  serieActuelle = serie;
  const estFilm = (serie.type || "").toLowerCase() === "film"
    || ((!serie.saisons || serie.saisons.length === 0) && (serie.videoUrl || "").trim() !== "");

  const imageUrl = serie.miniature && serie.miniature.trim() !== ""
    ? serie.miniature
    : "assets/placeholder.jpg";
  const totalSaisons = Array.isArray(serie.saisons) ? serie.saisons.length : 0;
  const totalEpisodes = Array.isArray(serie.saisons)
    ? serie.saisons.reduce((total, saison) => total + (Array.isArray(saison.episodes) ? saison.episodes.length : 0), 0)
    : 0;

  titreEl.textContent = serie.titre;
  typeBadgeEl.textContent = estFilm ? "Film" : "Série";
  metaBadgeEl.textContent = estFilm ? "Disponible maintenant" : `${totalSaisons} saison${totalSaisons > 1 ? "s" : ""}`;
  genresEl.textContent = (serie.genres || []).join(" • ");
  statsEl.textContent = estFilm ? "Film • 1 vidéo" : `${totalEpisodes} épisode${totalEpisodes > 1 ? "s" : ""}`;
  const dateAffichee = formaterDateSerie(serie, estFilm);
  if (dateEl) {
    dateEl.textContent = dateAffichee || (estFilm ? "Sortie inconnue" : "Diffusion inconnue");
  }
  countEl.textContent = estFilm ? "Film disponible" : `${totalSaisons} saison${totalSaisons > 1 ? "s" : ""} • ${totalEpisodes} épisode${totalEpisodes > 1 ? "s" : ""}`;
  synopsisEl.textContent = serie.synopsis || "Aucun synopsis disponible pour le moment.";
  afficheEl.src = imageUrl;
  afficheEl.alt = serie.titre;
  afficherOngletsSaisons(serie, estFilm);
  mettreAJourBoutonsSerie(serie, estFilm);
}

function mettreAJourBoutonsSerie(serie, estFilm = false) {
  const btnPlay = document.getElementById("btn-play-premier-episode");
  const btnShare = document.getElementById("btn-share-serie");

  if (!btnPlay || !btnShare) return;

  btnPlay.textContent = estFilm ? "Lire le film" : "Lire le premier épisode";
  if (estFilm) {
    if (!serie.videoUrl || serie.videoUrl.trim() === "") {
      btnPlay.disabled = true;
    } else {
      btnPlay.disabled = false;
      btnPlay.addEventListener("click", () => {
        window.location.href = urlSerie(serie);
      });
    }
  } else {
    const premier = obtenirPremierEpisode(serie);
    btnPlay.disabled = !premier;
    if (premier) {
      btnPlay.addEventListener("click", () => {
        window.location.href = urlEpisode(serie, premier.saison, premier.episode);
      });
    }
  }

  btnShare.disabled = false;
  btnShare.addEventListener("click", async () => {
    const url = `${window.location.origin}${urlSerie(serie)}`;
    const title = `Regarde ${serie.titre} sur FirstSeries Streaming`;
    const text = `Découvre ${(serie.type || "").toLowerCase() === "film" ? "le film" : "la série"} ${serie.titre} sur FirstSeries Streaming.`;

    if (navigator.share) {
      navigator.share({ title, text, url }).catch(() => {});
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        alert("Lien copié dans le presse-papiers.");
        return;
      } catch (error) {
      }
    }

    prompt("Copie ce lien pour partager le contenu :", url);
  });
}

function obtenirPremierEpisode(serie) {
  if (!serie || !Array.isArray(serie.saisons) || serie.saisons.length === 0) {
    return null;
  }

  const premiereSaison = [...serie.saisons].sort((a, b) => a.numero - b.numero)[0];
  if (!premiereSaison || !Array.isArray(premiereSaison.episodes) || premiereSaison.episodes.length === 0) {
    return null;
  }

  const premierEpisode = [...premiereSaison.episodes].sort((a, b) => a.numero - b.numero)[0];
  return { saison: premiereSaison, episode: premierEpisode };
}

function buildVideoUrl(serieId, saisonId, episodeId, type) {
  return "/app.html";
}

function afficherOngletsSaisons(serie, estFilm = false) {
  const tabsEl = document.getElementById("saisons-tabs");
  tabsEl.innerHTML = "";

  if (estFilm) {
    document.getElementById("episodes-list").innerHTML = "<p>Film disponible.</p>";
    return;
  }

  if (!serie.saisons || serie.saisons.length === 0) {
    document.getElementById("episodes-list").innerHTML = "<p>Aucun épisode pour le moment.</p>";
    return;
  }

  serie.saisons.forEach((saison, index) => {
    const onglet = document.createElement("button");
    onglet.className = "saison-tab";
    onglet.textContent = `Saison ${saison.numero}`;
    onglet.dataset.saisonId = saison.id;

    onglet.addEventListener("click", () => {
      saisonActiveId = saison.id;
      mettreAJourOngletsActifs();
      afficherEpisodes(saison);
    });

    tabsEl.appendChild(onglet);

    if (index === 0) {
      saisonActiveId = saison.id;
    }
  });

  mettreAJourOngletsActifs();
  const premiereSaison = serie.saisons.find((s) => s.id === saisonActiveId);
  afficherEpisodes(premiereSaison);
}

function mettreAJourOngletsActifs() {
  document.querySelectorAll(".saison-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.saisonId === saisonActiveId);
  });
}

function afficherEpisodes(saison) {
  const listeEl = document.getElementById("episodes-list");
  listeEl.innerHTML = "";

  if (!saison || saison.episodes.length === 0) {
    listeEl.innerHTML = "<p>Aucun épisode dans cette saison.</p>";
    return;
  }

  saison.episodes.forEach((episode) => {
    const ligne = document.createElement("div");
    ligne.className = "episode-row";
    ligne.addEventListener("click", () => {
      window.location.href = urlEpisode(serieActuelle, saison, episode);
    });

    ligne.innerHTML = `
      <span class="episode-numero">E${episode.numero}</span>
      <span class="episode-titre">${episode.titre}</span>
    `;

    listeEl.appendChild(ligne);
  });
}

document.addEventListener("DOMContentLoaded", chargerFicheSerie);
