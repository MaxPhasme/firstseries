
function parserUrlLecture() {
  const pathname = window.location.pathname.replace(/\/+$/, "");
  if (pathname.startsWith("/movies/")) {
    return {
      isMovieRoute: true,
      serieSlug: pathname.slice("/movies/".length).split("/")[0],
    };
  }

  if (pathname.startsWith("/series/")) {
    const segments = pathname.slice("/series/".length).split("/").filter(Boolean);
    if (segments.length >= 3 && /^s\d+$/i.test(segments[1]) && /^ep\d+$/i.test(segments[2])) {
      return {
        serieSlug: segments[0],
        saisonNumero: segments[1].slice(1),
        episodeNumero: segments[2].slice(2),
      };
    }
    return {
      serieSlug: segments[0] || null,
    };
  }

  return {};
}

async function chargerLecteur() {
  const params = new URLSearchParams(window.location.search);
  const serieId = params.get("serie");
  const saisonId = params.get("saison");
  const episodeId = params.get("episode");
  const type = params.get("type");
  const routeInfo = parserUrlLecture();

  const container = document.getElementById("player-container");
  const episodeTitreEl = document.getElementById("episode-titre");
  const synopsisEl = document.getElementById("serie-synopsis-player");
  const retourEl = document.getElementById("retour-serie");
  const prevButton = document.getElementById("btn-prev-episode");
  const nextButton = document.getElementById("btn-next-episode");
  const langSwitchEl = document.getElementById("lang-switch");

  if (!serieId && !routeInfo.serieSlug) {
    episodeTitreEl.textContent = "Contenu introuvable";
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
    episodeTitreEl.textContent = "Contenu introuvable";
    return;
  }

  const estFilm = routeInfo.isMovieRoute || type === "film" || (serie.type || "").toLowerCase() === "film";
  let episode = null;
  let saison = null;
  let saisonEpisodes = [];
  let currentIndex = -1;

  if (!estFilm) {
    if ((!saisonId || !episodeId) && !(routeInfo.saisonNumero && routeInfo.episodeNumero)) {
      episodeTitreEl.textContent = "Épisode introuvable";
      return;
    }

    saison = routeInfo.saisonNumero ? trouverSaisonParNumero(serie, routeInfo.saisonNumero) : null;
    if (!saison) {
      saison = saisonId ? trouverSaison(serie, saisonId) : null;
    }
    if (!saison) {
      episodeTitreEl.textContent = "Saison introuvable";
      return;
    }

    episode = routeInfo.episodeNumero ? trouverEpisodeParNumero(saison, routeInfo.episodeNumero) : null;
    if (!episode) {
      episode = episodeId ? trouverEpisode(saison, episodeId) : null;
    }
    if (!episode) {
      episodeTitreEl.textContent = "Épisode introuvable";
      return;
    }

    saisonEpisodes = serie.saisons
      .slice()
      .sort((a, b) => a.numero - b.numero)
      .flatMap((s) => {
        return (s.episodes || [])
          .slice()
          .sort((a, b) => a.numero - b.numero)
          .map((ep) => ({
            serieId: serie.id,
            saisonId: s.id,
            episodeId: ep.id,
            saisonNumero: s.numero,
            episodeNumero: ep.numero,
            titre: ep.titre,
            estFilm: false,
          }));
      });

    currentIndex = saisonEpisodes.findIndex((item) => item.saisonId === saison.id && item.episodeId === episode.id);
  }

  if (estFilm) {
    episodeTitreEl.textContent = `${serie.titre}`;
    synopsisEl.textContent = serie.synopsis;
    retourEl.href = "/app.html";
    retourEl.textContent = "← Retour au catalogue";
    if (prevButton) prevButton.style.display = "none";
    if (nextButton) nextButton.style.display = "none";
    const videoUrl = (serie.videoUrl || "").trim();
    if (!videoUrl) {
      container.innerHTML = "<p>Aucune URL vidéo disponible pour ce film.</p>";
      return;
    }
    enregistrerLectureEnCours({
      serieId: serie.id,
      type: "film",
      serieTitle: serie.titre,
      titre: serie.titre,
      imageUrl: serie.miniature || serie.affiche || "assets/placeholder.jpg",
    });
    afficherLecteurVideo(videoUrl);
    initCommentaires(serie.id);
    return;
  }

  episodeTitreEl.textContent = `${serie.titre} — S${saison.numero}E${episode.numero} — ${episode.titre}`;
  synopsisEl.textContent = serie.synopsis;
  retourEl.href = urlSerie(serie);

  if (prevButton) {
    const previous = currentIndex > 0 ? saisonEpisodes[currentIndex - 1] : null;
    prevButton.disabled = !previous;
    prevButton.addEventListener("click", () => {
      if (!previous) return;
      supprimerLectureEnCours(serie.id, saison.id, episode.id, "serie");
      window.location.href = buildEpisodeUrl(previous);
    });
  }

  if (nextButton) {
    const next = currentIndex >= 0 && currentIndex < saisonEpisodes.length - 1 ? saisonEpisodes[currentIndex + 1] : null;
    nextButton.disabled = !next;
    nextButton.addEventListener("click", () => {
      if (!next) return;
      supprimerLectureEnCours(serie.id, saison.id, episode.id, "serie");
      window.location.href = buildEpisodeUrl(next);
    });
  }

  enregistrerLectureEnCours({
    serieId: serie.id,
    saisonId: saison.id,
    episodeId: episode.id,
    type: "serie",
    serieTitle: serie.titre,
    titre: episode.titre,
    saisonNumero: saison.numero,
    episodeNumero: episode.numero,
    imageUrl: serie.miniature || serie.affiche || "assets/placeholder.jpg",
  });

  initCommentaires(episode.id);

  const videoUrl = (episode.videoUrl || "").trim();

  const embedCode = (episode.embedCode || "").trim();
  const vromovId = (episode.vromovId || "").trim();

  function buildEpisodeUrl(item) {
    if (!item) return "#";
    const serieItem = trouverSerie(donnees, item.serieId);
    if (!serieItem) return "#";
    if (item.type === "film" || item.estFilm) {
      return urlSerie(serieItem);
    }
    const saisonItem = trouverSaison(serieItem, item.saisonId);
    const episodeItem = saisonItem ? trouverEpisode(saisonItem, item.episodeId) : null;
    return episodeItem ? urlEpisode(serieItem, saisonItem, episodeItem) : urlSerie(serieItem);
  }

  function enregistrerLectureEnCours(watched) {
    if (!window.localStorage) return;
    const lecture = {
      ...watched,
      timestamp: Date.now(),
    };
    const lectures = lireLecturesEnCours();
    const dejaPresentIndex = lectures.findIndex((item) =>
      item.serieId === lecture.serieId &&
      item.saisonId === lecture.saisonId &&
      item.episodeId === lecture.episodeId &&
      item.type === lecture.type
    );
    if (dejaPresentIndex !== -1) {
      lectures.splice(dejaPresentIndex, 1);
    }
    lectures.unshift(lecture);
    sauvegarderLecturesEnCours(lectures.slice(0, 12));
  }

  function bloquerOuverturePage(event) {
    const cible = event.target;
    if (!cible) return;

    const elementClic = cible.closest("a, button, [onclick]");
    if (!elementClic) return;

    event.preventDefault();
    event.stopPropagation();
  }

  function detecterUrlsLangue(url) {
    const match = (url || "").match(/^(https:\/\/vidzy\.org\/(?:movie|serie)\/.+)\/(vf|vostfr)$/i);
    if (!match) return null;
    const base = match[1];
    return {
      vf: `${base}/vf`,
      vostfr: `${base}/vostfr`,
    };
  }

  function afficherSwitchLangue(urls, langueActuelle) {
    if (!langSwitchEl) return;
    langSwitchEl.hidden = false;
    langSwitchEl.querySelectorAll(".lang-btn").forEach((btn) => {
      const langue = btn.dataset.lang;
      btn.classList.toggle("active", langue === langueActuelle);
      btn.onclick = () => {
        if (langue === langueActuelle) return;
        afficherLecteurVideo(urls[langue]);
      };
    });
  }

  function masquerSwitchLangue() {
    if (langSwitchEl) langSwitchEl.hidden = true;
  }

  function afficherLecteurVideo(videoUrl) {
    if (!videoUrl) {
      container.innerHTML = "<p>Aucune URL vidéo disponible.</p>";
      masquerSwitchLangue();
      return;
    }

    const isDirectVideo = /\.(mp4|webm|ogg|m3u8)(\?.*)?$/i.test(videoUrl);
    if (isDirectVideo) {
      masquerSwitchLangue();
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

    const urlsLangue = detecterUrlsLangue(videoUrl);
    if (urlsLangue) {
      const langueActuelle = /\/vostfr$/i.test(videoUrl) ? "vostfr" : "vf";
      afficherSwitchLangue(urlsLangue, langueActuelle);
    } else {
      masquerSwitchLangue();
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

  try {
    const vidzyImdbRaw = (episode && episode.imdbId) || (serie && serie.imdbId) || null;
    if (vidzyImdbRaw) {
      const vidzyImdb = (vidzyImdbRaw || '').replace(/^tt/, '');
      if (vidzyImdb) {
        const vidzyUrl = `https://vidzy.org/movie/${encodeURIComponent(vidzyImdb)}/vf`;
        afficherLecteurVideo(vidzyUrl);
        return;
      }
    }
  } catch (e) {
    console.warn('Erreur lors de la tentative de lecture via Vidzy', e);
  }

  try {
    const searchQuery = `${serie.titre} S${saison.numero}E${episode.numero} ${episode.titre || ''}`.trim();
    if (window.searchAndExtract) {
      const found = await window.searchAndExtract(searchQuery);
      if (found) {
        afficherLecteurVideo(found);
        return;
      }
    }

    if (window.extractFromPageUrl && episode.watchUrl) {
      const found2 = await window.extractFromPageUrl(episode.watchUrl);
      if (found2) {
        afficherLecteurVideo(found2);
        return;
      }
    }
  } catch (e) {
    console.warn('automatic extraction failed', e);
  }

  container.innerHTML = "<p>Aucune URL vidéo disponible pour cet épisode.</p>";
}

document.addEventListener("DOMContentLoaded", chargerLecteur);
