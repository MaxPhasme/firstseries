// serie.js
// Affiche la fiche d'une série : synopsis, onglets saisons, liste d'épisodes

let saisonActiveId = null;
let serieActuelle = null;

async function chargerFicheSerie() {
  const params = new URLSearchParams(window.location.search);
  const serieId = params.get("id");

  const titreEl = document.getElementById("serie-titre");
  const synopsisEl = document.getElementById("serie-synopsis");
  const afficheEl = document.getElementById("serie-affiche");

  if (!serieId) {
    titreEl.textContent = "Série introuvable";
    return;
  }

  const donnees = await chargerDonnees();
  const serie = trouverSerie(donnees, serieId);

  if (!serie) {
    titreEl.textContent = "Série introuvable";
    return;
  }

  serieActuelle = serie;
  const estFilm = (serie.type || "").toLowerCase() === "film"
    || ((!serie.saisons || serie.saisons.length === 0) && (serie.videoUrl || "").trim() !== "");

  titreEl.textContent = serie.titre;
  document.getElementById("serie-genres").textContent = (serie.genres || []).join(" • ");
  synopsisEl.textContent = serie.synopsis;
  afficheEl.src = serie.miniature && serie.miniature.trim() !== ""
    ? serie.miniature
    : "assets/placeholder.jpg";
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
        window.location.href = buildVideoUrl(serie.id, null, null, "film");
      });
    }
  } else {
    const premier = obtenirPremierEpisode(serie);
    btnPlay.disabled = !premier;
    if (premier) {
      btnPlay.addEventListener("click", () => {
        window.location.href = buildVideoUrl(serie.id, premier.saison.id, premier.episode.id);
      });
    }
  }

  btnShare.disabled = false;
  btnShare.addEventListener("click", async () => {
    const url = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(serie.id)}`;
    const title = `Regarde ${serie.titre} sur FirstSeries.io`;
    const text = `Découvre ${(serie.type || "").toLowerCase() === "film" ? "le film" : "la série"} ${serie.titre} sur FirstSeries.io.`;

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
        // fallback vers prompt
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
  let url = `video.html?serie=${encodeURIComponent(serieId)}`;
  if (type === "film") return `${url}&type=film`;
  return `${url}&saison=${encodeURIComponent(saisonId)}&episode=${encodeURIComponent(episodeId)}`;
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
      window.location.href = `video.html?serie=${encodeURIComponent(serieActuelle.id)}&saison=${encodeURIComponent(saison.id)}&episode=${encodeURIComponent(episode.id)}`;
    });

    ligne.innerHTML = `
      <span class="episode-numero">E${episode.numero}</span>
      <span class="episode-titre">${episode.titre}</span>
    `;

    listeEl.appendChild(ligne);
  });
}

document.addEventListener("DOMContentLoaded", chargerFicheSerie);
