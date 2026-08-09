// player.js
// Page de lecture : récupère serie/saison/episode dans l'URL,
// affiche nom de série + titre d'épisode + synopsis, et génère l'iframe embed Vromov

async function chargerLecteur() {
  const params = new URLSearchParams(window.location.search);
  const serieId = params.get("serie");
  const saisonId = params.get("saison");
  const episodeId = params.get("episode");
  const type = params.get("type");

  const container = document.getElementById("player-container");
  const episodeTitreEl = document.getElementById("episode-titre");
  const synopsisEl = document.getElementById("serie-synopsis-player");
  const retourEl = document.getElementById("retour-serie");

  if (!serieId) {
    episodeTitreEl.textContent = "Contenu introuvable";
    return;
  }

  const donnees = await chargerDonnees();
  const serie = trouverSerie(donnees, serieId);
  if (!serie) {
    episodeTitreEl.textContent = "Contenu introuvable";
    return;
  }

  const estFilm = type === "film" || (serie.type || "").toLowerCase() === "film";
  let episode = null;
  let saison = null;

  if (!estFilm) {
    if (!saisonId || !episodeId) {
      episodeTitreEl.textContent = "Épisode introuvable";
      return;
    }

    saison = trouverSaison(serie, saisonId);
    if (!saison) {
      episodeTitreEl.textContent = "Saison introuvable";
      return;
    }

    episode = trouverEpisode(saison, episodeId);
    if (!episode) {
      episodeTitreEl.textContent = "Épisode introuvable";
      return;
    }
  }

  // Titre affiché : Nom de la série/film + numéro d'épisode si nécessaire
  if (estFilm) {
    episodeTitreEl.textContent = `${serie.titre}`;
    synopsisEl.textContent = serie.synopsis;
    retourEl.href = "app.html";
    retourEl.textContent = "← Retour au catalogue";
    const videoUrl = (serie.videoUrl || "").trim();
    if (!videoUrl) {
      container.innerHTML = "<p>Aucune URL vidéo disponible pour ce film.</p>";
      return;
    }
    afficherLecteurVideo(videoUrl);
    initCommentaires(serie.id);
    return;
  }

  episodeTitreEl.textContent = `${serie.titre} — S${saison.numero}E${episode.numero} — ${episode.titre}`;
  synopsisEl.textContent = serie.synopsis;
  retourEl.href = `serie.html?id=${encodeURIComponent(serie.id)}`;

  // Zone de commentaires de cet épisode (voir commentaires.js).
  // Pas de await : le lecteur ne doit pas attendre le chargement des commentaires.
  initCommentaires(episode.id);

  const videoUrl = (episode.videoUrl || "").trim();

  // Fallbacks pour anciens formats
  const embedCode = (episode.embedCode || "").trim();
  const vromovId = (episode.vromovId || "").trim();

  function bloquerOuverturePage(event) {
    const cible = event.target;
    if (!cible) return;

    const elementClic = cible.closest("a, button, [onclick]");
    if (!elementClic) return;

    event.preventDefault();
    event.stopPropagation();
  }

  function afficherLecteurVideo(videoUrl) {
    if (!videoUrl) {
      container.innerHTML = "<p>Aucune URL vidéo disponible.</p>";
      return;
    }

    const isDirectVideo = /\.(mp4|webm|ogg|m3u8)(\?.*)?$/i.test(videoUrl);
    if (isDirectVideo) {
      container.innerHTML = `
        <video controls autoplay playsinline preload="metadata" class="video-player">
          <source src="${videoUrl}">
          Votre navigateur ne supporte pas la lecture vidéo.
        </video>
      `;
      const lecteur = container.querySelector(".video-player");
      if (lecteur) {
        lecteur.addEventListener("click", bloquerOuverturePage);
        lecteur.addEventListener("mousedown", bloquerOuverturePage);
      }
      return;
    }

    container.innerHTML = `
      <iframe src="${videoUrl}" allowfullscreen class="embed-iframe"></iframe>
    `;
  }

  if (videoUrl) {
    afficherLecteurVideo(videoUrl);
    return;
  }

  if (embedCode) {
    container.innerHTML = embedCode;
    container.querySelectorAll("a, button").forEach((element) => {
      element.addEventListener("click", bloquerOuverturePage);
    });
    return;
  }

  if (vromovId) {
    const embedUrl = `https://vromov.com/embed/${encodeURIComponent(vromovId)}`;
    container.innerHTML = `
      <iframe
        src="${embedUrl}"
        allow="autoplay; fullscreen"
        allowfullscreen
        class="embed-iframe"
      ></iframe>
    `;
    const iframe = container.querySelector(".embed-iframe");
    if (iframe) {
      iframe.addEventListener("load", () => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            iframeDoc.querySelectorAll("a, button").forEach((element) => {
              element.addEventListener("click", bloquerOuverturePage);
            });
          }
        } catch (error) {
          console.warn("Impossible d'intercepter les clics dans l'iframe", error);
        }
      });
    }
    return;
  }

  container.innerHTML = "<p>Aucune URL vidéo disponible pour cet épisode.</p>";
}

document.addEventListener("DOMContentLoaded", chargerLecteur);
