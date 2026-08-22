
let donneesAdmin = null;
let serieEnEditionId = null;
let saisonEnEditionId = null;
let episodeEnEditionId = null;
let episodeEnEditionSerieId = null;
let episodeEnEditionSaisonId = null;

const CLÉ_AUTH_ADMIN = "fistunia-admin-token";
const GENRES_PREDEFINIS = [
  "Action",
  "Aventure",
  "Comédie",
  "Drame",
  "Fantastique",
  "Horreur",
  "Policier",
  "Science-Fiction",
  "Thriller",
];

function creerCheckboxGenres() {
  const groupe = document.getElementById("serie-genres-group");
  if (!groupe) return;

  groupe.innerHTML = GENRES_PREDEFINIS
    .map(
      (genre) => `
        <label class="checkbox-label">
          <input type="checkbox" name="serie-genres" value="${genre}">
          ${genre}
        </label>
      `
    )
    .join("");
}

function lireGenresFormSerie() {
  return Array.from(document.querySelectorAll("#serie-genres-group input[name='serie-genres']:checked"))
    .map((input) => input.value);
}

function appliquerGenresFormSerie(genres = []) {
  document.querySelectorAll("#serie-genres-group input[name='serie-genres']").forEach((input) => {
    input.checked = genres.includes(input.value);
  });
}

function actualiserChampVideoUrl(type) {
  const champ = document.getElementById("serie-video-url-field");
  const input = document.getElementById("serie-video-url-input");
  if (!champ || !input) return;
  const estFilm = type === "film";
  champ.hidden = !estFilm;
  input.required = estFilm;
}

function appliquerTypeFormSerie(type = "serie") {
  document.querySelectorAll('input[name="serie-type"]').forEach((radio) => {
    radio.checked = radio.value === type;
  });
  actualiserChampVideoUrl(type);
}

function afficherInterfaceAdmin(estAuthentifie) {
  const blocAuth = document.getElementById("admin-auth");
  const blocMain = document.getElementById("admin-main");
  const boutonLogout = document.getElementById("admin-logout");

  if (estAuthentifie) {
    blocAuth.hidden = true;
    blocAuth.style.display = "none";
    blocMain.classList.remove("blurred");
    boutonLogout.hidden = false;
  } else {
    blocAuth.hidden = false;
    blocAuth.style.display = "grid";
    blocMain.classList.add("blurred");
    boutonLogout.hidden = true;
  }
}

function initialiserAuthentification() {
  const formulaire = document.getElementById("admin-login-form");
  const erreur = document.getElementById("admin-auth-error");
  const motDePasseInput = document.getElementById("admin-password-input");
  const boutonLogout = document.getElementById("admin-logout");

  const estAuthentifie = Boolean(sessionStorage.getItem(CLÉ_AUTH_ADMIN));
  afficherInterfaceAdmin(estAuthentifie);

  formulaire.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const reponse = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motDePasse: motDePasseInput.value }),
      });

      if (!reponse.ok) {
        let messageErreur = "Mot de passe incorrect.";
        try {
          const corps = await reponse.json();
          if (corps?.erreur) messageErreur = corps.erreur;
        } catch (_) {
        }
        erreur.textContent = messageErreur;
        motDePasseInput.focus();
        return;
      }

      const { token } = await reponse.json();
      sessionStorage.setItem(CLÉ_AUTH_ADMIN, token);
      erreur.textContent = "";
      afficherInterfaceAdmin(true);
      formulaire.reset();
      creerCheckboxGenres();
      donneesAdmin = await chargerDonnees();
      remplirSelectsSeries();
    } catch (e) {
      erreur.textContent = "Erreur de connexion au serveur.";
    }
  });

  boutonLogout.addEventListener("click", () => {
    sessionStorage.removeItem(CLÉ_AUTH_ADMIN);
    afficherInterfaceAdmin(false);
    motDePasseInput.focus();
  });

  return estAuthentifie;
}

function definirEtatEditionSerie(serieId = null) {
  serieEnEditionId = serieId;
  const boutonSubmit = document.getElementById("form-serie-submit");
  const boutonAnnuler = document.getElementById("form-serie-annuler");

  if (serieId) {
    boutonSubmit.textContent = "Enregistrer les modifications";
    boutonAnnuler.hidden = false;
  } else {
    boutonSubmit.textContent = "Ajouter la série";
    boutonAnnuler.hidden = true;
  }
}

function definirEtatEditionSaison(saisonId = null) {
  saisonEnEditionId = saisonId;
  const boutonSubmit = document.getElementById("form-saison-submit");
  const boutonAnnuler = document.getElementById("form-saison-annuler");

  if (saisonId) {
    boutonSubmit.textContent = "Enregistrer la saison";
    boutonAnnuler.hidden = false;
  } else {
    boutonSubmit.textContent = "Ajouter la saison";
    boutonAnnuler.hidden = true;
  }
}

function definirEtatEditionEpisode(episodeId = null) {
  episodeEnEditionId = episodeId;
  const boutonSubmit = document.getElementById("form-episode-submit");
  const boutonAnnuler = document.getElementById("form-episode-annuler");

  if (episodeId) {
    boutonSubmit.textContent = "Enregistrer l'épisode";
    boutonAnnuler.hidden = false;
  } else {
    boutonSubmit.textContent = "Ajouter l'épisode";
    boutonAnnuler.hidden = true;
  }
}

function remplirFormSerie(serie) {
  document.getElementById("serie-titre-input").value = serie.titre || "";
  document.getElementById("serie-synopsis-input").value = serie.synopsis || "";
  document.getElementById("serie-miniature-input").value = serie.miniature || "";
  appliquerGenresFormSerie(serie.genres || []);
  document.getElementById("serie-affiche-checkbox").checked = Boolean(serie.affiche);
  document.getElementById("serie-carrousel-checkbox").checked = Boolean(serie.carrousel);
  appliquerTypeFormSerie((serie.type || "serie").toLowerCase());
  document.getElementById("serie-video-url-input").value = serie.videoUrl || "";
}

function remplirFormSaison(saison, serieId) {
  document.getElementById("saison-serie-select").value = serieId;
  document.getElementById("saison-serie-select").disabled = true;
  document.getElementById("saison-numero-input").value = saison.numero || "";
}

function remplirFormEpisode(episode, serieId, saisonId) {
  document.getElementById("episode-serie-select").value = serieId;
  remplirSelectSaisons();
  document.getElementById("episode-saison-select").value = saisonId;
  document.getElementById("episode-serie-select").disabled = true;
  document.getElementById("episode-saison-select").disabled = true;
  document.getElementById("episode-numero-input").value = episode.numero || "";
  document.getElementById("episode-titre-input").value = episode.titre || "";
  document.getElementById("episode-video-url-input").value = episode.videoUrl || "";
}

function resetFormSerie() {
  document.getElementById("form-serie").reset();
  appliquerGenresFormSerie([]);
  appliquerTypeFormSerie("serie");
  document.getElementById("serie-video-url-input").value = "";
  document.getElementById("serie-affiche-checkbox").checked = false;
  document.getElementById("serie-carrousel-checkbox").checked = false;
  definirEtatEditionSerie(null);
}

function resetFormSaison() {
  document.getElementById("form-saison").reset();
  document.getElementById("saison-serie-select").disabled = false;
  definirEtatEditionSaison(null);
}

function resetFormEpisode() {
  document.getElementById("form-episode").reset();
  document.getElementById("episode-serie-select").disabled = false;
  document.getElementById("episode-saison-select").disabled = false;
  definirEtatEditionEpisode(null);
}



async function rechercherTMDB() {
  const input = document.getElementById("tmdb-search-input");
  const type = document.getElementById("tmdb-search-type").value;
  const results = document.getElementById("tmdb-results");
  const status = document.getElementById("tmdb-search-status");
  const query = input.value.trim();

  if (query.length < 2) {
    status.textContent = "Saisis au moins 2 caractères.";
    return;
  }

  status.textContent = "Recherche TMDB...";
  results.innerHTML = "";

  try {
    const response = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`, {
      headers: entetesAdmin(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.erreur || "Recherche TMDB impossible");

    if (!data.results?.length) {
      status.textContent = "Aucun résultat.";
      return;
    }

    status.textContent = `${data.results.length} résultat(s).`;
    results.innerHTML = data.results.map((item) => `
      <article class="tmdb-result">
        <img src="${item.poster || "/assets/placeholder.jpg"}" alt="">
        <div class="tmdb-result-info">
          <div class="tmdb-result-title">${echapperHtml(item.titre)}</div>
          <div class="tmdb-result-meta">${item.type === "film" ? "Film" : "Série"}${item.date ? ` • ${echapperHtml(item.date.slice(0,4))}` : ""}${item.note !== null ? ` • ⭐ ${item.note.toFixed(1)}` : ""}</div>
          <div class="tmdb-result-overview">${echapperHtml(item.synopsis || "Aucun synopsis disponible.")}</div>
        </div>
        <button type="button" class="tmdb-import-btn" data-tmdb-id="${item.id}" data-tmdb-type="${item.type}">Importer</button>
      </article>
    `).join("");

    results.querySelectorAll(".tmdb-import-btn").forEach((button) => {
      button.addEventListener("click", () => importerTMDB(Number(button.dataset.tmdbId), button.dataset.tmdbType, button));
    });
  } catch (error) {
    console.error(error);
    status.textContent = error.message || "Erreur de recherche TMDB.";
  }
}

async function importerTMDB(tmdbId, type, button) {
  const status = document.getElementById("tmdb-search-status");
  button.disabled = true;
  button.textContent = "Import...";

  try {
    const response = await fetch("/api/tmdb/import", {
      method: "POST",
      headers: entetesAdmin(),
      body: JSON.stringify({ tmdbId, type }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.erreur || "Import TMDB impossible");

    if (donneesAdmin) donneesAdmin.series.push(data);
    remplirSelectsSeries();
    remplirSelectCommentaireSeries();
    status.textContent = `"${data.titre}" a été importé.`;
    button.textContent = "Importé";
  } catch (error) {
    console.error(error);
    status.textContent = error.message || "Erreur pendant l'import.";
    button.disabled = false;
    button.textContent = "Importer";
  }
}

async function rafraichirPostersTMDB() {
  const button = document.getElementById("refresh-tmdb-posters-btn");
  const status = document.getElementById("refresh-tmdb-posters-status");
  if (!button || !status) return;

  button.disabled = true;
  status.textContent = "Mise à jour en cours...";

  try {
    const response = await fetch("/api/tmdb/update-posters", {
      method: "POST",
      headers: entetesAdmin(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.erreur || "Mise à jour des posters impossible");

    if (donneesAdmin) {
      donneesAdmin = await chargerDonnees();
      remplirSelectsSeries();
      remplirSelectCommentaireSeries();
      afficherArbreContenu();
    }

    status.textContent = `${data.updated || 0} poster(s) mis à jour.`;
    if (Array.isArray(data.errors) && data.errors.length) {
      console.warn("Quelques posters n’ont pas été mis à jour:", data.errors);
    }
  } catch (error) {
    console.error(error);
    status.textContent = error.message || "Erreur lors de la mise à jour des posters.";
  } finally {
    button.disabled = false;
  }
}

async function attribuerPlateformesTMDB() {
  const button = document.getElementById("assign-platforms-btn");
  const status = document.getElementById("assign-platforms-status");
  if (!button || !status) return;
  if (!confirm("Attribuer les plateformes à tout le catalogue depuis TMDB ?")) return;

  button.disabled = true;
  status.textContent = "Synchronisation en cours...";
  try {
    const response = await fetch("/api/admin/assign-platforms", {
      method: "POST",
      headers: entetesAdmin(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.erreur || "Attribution impossible");

    donneesAdmin = await chargerDonnees();
    remplirSelectsSeries();
    remplirSelectCommentaireSeries();
    afficherArbreContenu();
    status.textContent = `${data.updated || 0} contenu(s) mis à jour, ${data.skipped || 0} ignoré(s).`;
    if (Array.isArray(data.errors) && data.errors.length) console.warn("Plateformes non récupérées:", data.errors);
  } catch (error) {
    console.error(error);
    status.textContent = error.message || "Erreur lors de l'attribution.";
  } finally {
    button.disabled = false;
  }
}

function echapperHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.addEventListener("DOMContentLoaded", async () => {
  initialiserAuthentification();

  creerCheckboxGenres();
  appliquerTypeFormSerie("serie");
  document.querySelectorAll('input[name="serie-type"]').forEach((radio) => {
    radio.addEventListener("change", (event) => {
      actualiserChampVideoUrl(event.target.value);
    });
  });
  document.getElementById("form-serie").addEventListener("submit", onAjouterOuModifierSerie);
  document.getElementById("form-serie-annuler").addEventListener("click", resetFormSerie);
  document.getElementById("serie-charger-btn").addEventListener("click", chargerSeriePourModifier);
  initialiserFiltreRechercheSelect("serie-modifier-select", "serie-recherche-input");
  initialiserFiltreRechercheSelect("contenu-serie-select", "contenu-recherche-input");
  document.getElementById("form-saison").addEventListener("submit", onAjouterOuModifierSaison);
  document.getElementById("form-saison-annuler").addEventListener("click", resetFormSaison);
  document.getElementById("form-episode").addEventListener("submit", onAjouterOuModifierEpisode);
  document.getElementById("form-episode-annuler").addEventListener("click", resetFormEpisode);

  document.getElementById("episode-serie-select").addEventListener("change", remplirSelectSaisons);
  document.getElementById("contenu-serie-select").addEventListener("change", () => {
    remplirSelectSaisonsPourSelectSerie("contenu-serie-select", "contenu-saison-select");
    remplirSelectEpisodesPourContenu();
  });
  document.getElementById("contenu-saison-select").addEventListener("change", remplirSelectEpisodesPourContenu);
  document.getElementById("contenu-charger-btn").addEventListener("click", chargerSelectionPourModifier);
  document.getElementById("contenu-reset-btn").addEventListener("click", () => {
    document.getElementById("contenu-selection-info").textContent = "Choisis une série, puis une saison, puis un épisode à modifier.";
    document.getElementById("contenu-serie-select").selectedIndex = 0;
    remplirSelectSaisonsPourSelectSerie("contenu-serie-select", "contenu-saison-select");
    remplirSelectEpisodesPourContenu();
  });
  document.getElementById("contenu-supprimer-serie-btn").addEventListener("click", supprimerSerieSelectionnee);
  document.getElementById("contenu-supprimer-saison-btn").addEventListener("click", supprimerSaisonSelectionnee);
  document.getElementById("contenu-supprimer-episode-btn").addEventListener("click", supprimerEpisodeSelectionne);

  document.getElementById("commentaire-serie-select").addEventListener("change", remplirSelectCommentaireEpisodes);
  document.getElementById("commentaire-charger-btn").addEventListener("click", chargerCommentairesAdmin);
  document.getElementById("tmdb-search-btn").addEventListener("click", rechercherTMDB);
  document.getElementById("refresh-tmdb-posters-btn").addEventListener("click", rafraichirPostersTMDB);
  document.getElementById("assign-platforms-btn").addEventListener("click", attribuerPlateformesTMDB);
  document.getElementById("tmdb-search-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      rechercherTMDB();
    }
  });

  if (sessionStorage.getItem(CLÉ_AUTH_ADMIN)) {
    donneesAdmin = await chargerDonnees();
    remplirSelectsSeries();
    remplirSelectCommentaireSeries();
  }

  const regenBtn = document.getElementById('regen-vidzy-btn');
    if (regenBtn) {
    regenBtn.addEventListener('click', async () => {
      if (!confirm('Regénérer tous les liens Vidzy pour tous les contenus ?')) return;
      const force = confirm('Forcer l\'écrasement des liens marqués manuels ? (OK = oui, Annuler = non)');
      const statusEl = document.getElementById('regen-vidzy-status');
      try {
        regenBtn.disabled = true;
        statusEl.textContent = 'En cours...';
        const resp = await fetch('/api/admin/regenerate-vidzy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...entetesAdmin() },
          body: JSON.stringify({ force }),
        });
        const body = await resp.json();
        if (!resp.ok) throw new Error(body.erreur || 'Erreur lors de la génération');
        statusEl.textContent = `Liens mis à jour: ${body.updated || 0}`;
        donneesAdmin = await chargerDonnees();
        remplirSelectsSeries();
        remplirSelectCommentaireSeries();
        afficherArbreContenu();
      } catch (e) {
        console.error(e);
        statusEl.textContent = e.message || 'Erreur';
      } finally {
        regenBtn.disabled = false;
      }
    });
  
    const cleanupBtn = document.getElementById('cleanup-content-btn');
    const cleanupStatus = document.getElementById('cleanup-content-status');
    if (cleanupBtn) {
      cleanupBtn.addEventListener('click', async () => {
        if (!confirm('Supprimer les doublons et les contenus sans lien ? Cette opération est irréversible.')) return;
        cleanupBtn.disabled = true;
        cleanupStatus.textContent = 'En cours...';
        try {
          const resp = await fetch('/api/admin/cleanup-content', {
            method: 'POST',
            headers: entetesAdmin(),
          });
          const body = await resp.json();
          if (!resp.ok) throw new Error(body.erreur || 'Erreur lors du nettoyage');
          cleanupStatus.textContent = `Doublons supprimés: ${body.removedDuplicates || 0} — Films sans lien: ${body.removedFilmsNoLink || 0} — Episodes supprimés: ${body.removedEpisodesNoLink || 0} — Séries supprimées: ${body.removedSeriesNoLink || 0}`;
          donneesAdmin = await chargerDonnees();
          remplirSelectsSeries();
          remplirSelectCommentaireSeries();
        } catch (e) {
          console.error(e);
          cleanupStatus.textContent = e.message || 'Erreur';
        } finally {
          cleanupBtn.disabled = false;
        }
      });
    }

    const clearCatalogBtn = document.getElementById('clear-catalog-btn');
    const clearCatalogStatus = document.getElementById('clear-catalog-status');
    if (clearCatalogBtn) {
      clearCatalogBtn.addEventListener('click', async () => {
        if (!confirm('Vider tout le catalogue ? Cette action efface toutes les séries et les commentaires.')) return;
        clearCatalogBtn.disabled = true;
        clearCatalogStatus.textContent = 'En cours...';
        try {
          const resp = await fetch('/api/admin/clear-catalog', {
            method: 'POST',
            headers: entetesAdmin(),
          });
          const body = await resp.json();
          if (!resp.ok) throw new Error(body.erreur || 'Erreur lors du vidage du catalogue');
          clearCatalogStatus.textContent = body.message || 'Catalogue vidé';
          donneesAdmin = await chargerDonnees();
          remplirSelectsSeries();
          remplirSelectCommentaireSeries();
          afficherArbreContenu();
        } catch (e) {
          console.error(e);
          clearCatalogStatus.textContent = e.message || 'Erreur';
        } finally {
          clearCatalogBtn.disabled = false;
        }
      });
    }
  }

  const csvBtn = document.getElementById('csv-import-btn');
  const csvInput = document.getElementById('csv-file-input');
  const csvStatus = document.getElementById('csv-import-status');
  if (csvBtn && csvInput) {
    csvBtn.addEventListener('click', async () => {
      const file = csvInput.files && csvInput.files[0];
      if (!file) return alert('Choisis un fichier CSV.');
      csvBtn.disabled = true;
      csvStatus.textContent = 'Lecture du fichier...';
      try {
        const text = await file.text();
        let lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) throw new Error('Fichier vide');
        if (/^title$/i.test(lines[0].replace(/\uFEFF/, '').trim())) lines.shift();
        const titles = lines.map(l => l.trim()).filter(Boolean);
        if (titles.length === 0) throw new Error('Aucun titre trouvé dans le fichier');

        const total = titles.length;
        const chunkSize = 20;
        let processed = 0;
        let added = 0;
        let skipped = 0;
        const errors = [];

        if (!confirm(`Importer ${total} titres en ${Math.ceil(total / chunkSize)} requêtes ?`)) {
          csvBtn.disabled = false;
          csvStatus.textContent = 'Import annulé.';
          return;
        }

        csvStatus.textContent = `Envoi de ${total} titres...`;

        for (let i = 0; i < titles.length; i += chunkSize) {
          const chunk = titles.slice(i, i + chunkSize);
          csvStatus.textContent = `Envoi ${Math.min(i+chunkSize, total)}/${total}...`;
          try {
            const resp = await fetch('/api/admin/import-titles', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...entetesAdmin() },
              body: JSON.stringify({ titles: chunk }),
            });
            const body = await resp.json();
            if (!resp.ok) {
              errors.push({ chunkStart: i, error: body.erreur || 'Import failed' });
            } else {
              added += (body.added || 0);
              skipped += (body.skipped || 0);
              if (Array.isArray(body.errors) && body.errors.length) errors.push(...body.errors);
            }
          } catch (e) {
            console.error('Chunk import error', e);
            errors.push({ chunkStart: i, message: e.message || String(e) });
          }
          processed = Math.min(i + chunkSize, total);
          csvStatus.textContent = `Traités ${processed}/${total} — Ajoutés: ${added} — Ignorés: ${skipped} — Erreurs: ${errors.length}`;
          await new Promise(r => setTimeout(r, 200));
        }

        csvStatus.textContent = `Terminé — Ajoutés: ${added} — Ignorés: ${skipped} — Erreurs: ${errors.length}`;
        donneesAdmin = await chargerDonnees();
        remplirSelectsSeries();
        remplirSelectCommentaireSeries();
      } catch (e) {
        console.error(e);
        csvStatus.textContent = e.message || 'Erreur';
      } finally {
        csvBtn.disabled = false;
      }
    });
  }
});


function initialiserFiltreRechercheSelect(selectId, inputId) {
  const select = document.getElementById(selectId);
  const input = document.getElementById(inputId);
  if (!select || !input) return;

  input.addEventListener("input", () => {
    const terme = input.value.trim().toLowerCase();
    const options = Array.from(select.options);
    let auMoinsUneOptionVisible = false;

    options.forEach((option) => {
      const estPlaceholder = option.value === "";
      if (estPlaceholder) {
        option.hidden = false;
        return;
      }

      const correspond = !terme || (option.textContent || "").toLowerCase().includes(terme);
      option.hidden = !correspond;
      if (correspond) auMoinsUneOptionVisible = true;
    });

    if (!terme) {
      if (options.length > 0 && options[0].value === "") {
        select.selectedIndex = 0;
      }
      return;
    }

    if (!auMoinsUneOptionVisible) {
      select.selectedIndex = 0;
      return;
    }

    const premiereOptionVisible = options.find((option) => !option.hidden && option.value !== "");
    if (premiereOptionVisible) {
      select.value = premiereOptionVisible.value;
    }
  });
}

function remplirSelectsSeries() {
  const selectSaison = document.getElementById("saison-serie-select");
  const selectEpisode = document.getElementById("episode-serie-select");
  const selectContenuSerie = document.getElementById("contenu-serie-select");
  const selectSerieModifier = document.getElementById("serie-modifier-select");
  const series = Array.isArray(donneesAdmin?.series) ? donneesAdmin.series : [];

  if (series.length === 0) {
    const placeholder = "<option value=\"\" disabled selected>Aucune série</option>";
    selectSaison.innerHTML = placeholder;
    selectEpisode.innerHTML = placeholder;
    selectContenuSerie.innerHTML = placeholder;
    selectSerieModifier.innerHTML = placeholder;
    return;
  }

  const optionsHtml = series
    .map((s) => `<option value="${s.id}">${s.titre}</option>`)
    .join("");
  const placeholder = "<option value=\"\" disabled selected>Choisis une série</option>";

  selectSaison.innerHTML = placeholder + optionsHtml;
  selectEpisode.innerHTML = placeholder + optionsHtml;
  selectContenuSerie.innerHTML = placeholder + optionsHtml;
  selectSerieModifier.innerHTML = placeholder + optionsHtml;
  remplirSelectCommentaireSeries();

  remplirSelectSaisons();
  remplirSelectSaisonsPourSelectSerie("contenu-serie-select", "contenu-saison-select");
  remplirSelectEpisodesPourContenu();
}

function remplirSelectCommentaireSeries() {
  const selectCommentaireSerie = document.getElementById("commentaire-serie-select");
  if (!selectCommentaireSerie) return;

  const series = Array.isArray(donneesAdmin?.series) ? donneesAdmin.series : [];
  if (series.length === 0) {
    selectCommentaireSerie.innerHTML = "<option value=\"\" disabled selected>Aucune série</option>";
    return;
  }

  const optionsHtml = series.map((s) => `<option value="${s.id}">${s.titre}</option>`).join("");
  selectCommentaireSerie.innerHTML = "<option value=\"\" disabled selected>Choisis une série</option>" + optionsHtml;
  remplirSelectCommentaireEpisodes();
}

function remplirSelectCommentaireEpisodes() {
  const selectCommentaireEpisode = document.getElementById("commentaire-episode-select");
  const selectCommentaireSerie = document.getElementById("commentaire-serie-select");
  if (!selectCommentaireEpisode || !selectCommentaireSerie) return;

  const serieId = selectCommentaireSerie.value;
  const serie = trouverSerie(donneesAdmin, serieId);

  if (!serie || !Array.isArray(serie.saisons) || serie.saisons.length === 0 || serie.type === "film") {
    selectCommentaireEpisode.innerHTML = "<option value=\"\" disabled selected>Aucun épisode</option>";
    selectCommentaireEpisode.disabled = true;
    return;
  }

  const optionsHtml = serie.saisons
    .flatMap((s) => (s.episodes || []).map((episode) => `<option value="${episode.id}">S${s.numero}E${episode.numero} — ${episode.titre}</option>`))
    .join("");
  selectCommentaireEpisode.disabled = false;
  selectCommentaireEpisode.innerHTML = "<option value=\"\" disabled selected>Choisis un épisode</option>" + optionsHtml;
}

async function chargerCommentairesAdmin() {
  const selectCommentaireSerie = document.getElementById("commentaire-serie-select");
  const selectCommentaireEpisode = document.getElementById("commentaire-episode-select");
  const info = document.getElementById("commentaire-selection-info");
  const listeEl = document.getElementById("commentaires-admin-list");

  if (!selectCommentaireSerie || !listeEl || !info) return;

  const serie = trouverSerie(donneesAdmin, selectCommentaireSerie.value);
  if (!serie) {
    info.textContent = "Choisis une série valide pour charger les commentaires.";
    return;
  }

  let commentaireId = serie.id;
  if (serie.type !== "film" && selectCommentaireEpisode && selectCommentaireEpisode.value) {
    commentaireId = selectCommentaireEpisode.value;
  }

  const commentaires = Array.isArray(donneesAdmin.commentaires)
    ? donneesAdmin.commentaires.filter((c) => c.episodeId === commentaireId)
    : [];

  listeEl.innerHTML = "";
  if (commentaires.length === 0) {
    listeEl.innerHTML = '<p class="admin-help-text">Aucun commentaire trouvé pour ce contenu.</p>';
    return;
  }

  commentaires.forEach((commentaire) => {
    const bloc = document.createElement("div");
    bloc.className = "admin-commentaire-item";

    const meta = document.createElement("div");
    meta.className = "admin-commentaire-meta";
    meta.textContent = `${commentaire.pseudo} — ${new Date(commentaire.date).toLocaleString("fr-FR")}`;

    const texte = document.createElement("p");
    texte.className = "admin-commentaire-texte";
    texte.textContent = commentaire.texte;

    const supprimer = document.createElement("button");
    supprimer.type = "button";
    supprimer.className = "btn-supprimer btn-small";
    supprimer.textContent = "Supprimer";
    supprimer.addEventListener("click", async () => {
      if (!confirm("Supprimer ce commentaire ?")) return;
      try {
        await supprimerCommentaire(commentaire.id);
        donneesAdmin = await chargerDonnees();
        await chargerCommentairesAdmin();
      } catch (erreur) {
        console.error(erreur);
        alert("Impossible de supprimer le commentaire.");
      }
    });

    bloc.append(meta, texte, supprimer);
    listeEl.appendChild(bloc);
  });
}

function remplirSelectSaisons() {
  const serieId = document.getElementById("episode-serie-select").value;
  const selectSaison = document.getElementById("episode-saison-select");

  remplirSelectSaisonsPourSelectSerie("episode-serie-select", "episode-saison-select");
}

function remplirSelectSaisonsPourSelectSerie(serieSelectId, saisonSelectId) {
  const serieId = document.getElementById(serieSelectId).value;
  const selectSaison = document.getElementById(saisonSelectId);
  const serie = trouverSerie(donneesAdmin, serieId);

  if (!serie || !Array.isArray(serie.saisons) || serie.saisons.length === 0) {
    selectSaison.innerHTML = "<option value=\"\" disabled selected>Aucune saison</option>";
    return;
  }

  const optionsHtml = serie.saisons
    .map((s) => `<option value="${s.id}">Saison ${s.numero}</option>`)
    .join("");
  selectSaison.innerHTML = "<option value=\"\" disabled selected>Choisis une saison</option>" + optionsHtml;
}

function remplirSelectEpisodesPourContenu() {
  const serieId = document.getElementById("contenu-serie-select").value;
  const saisonId = document.getElementById("contenu-saison-select").value;
  const selectEpisode = document.getElementById("contenu-episode-select");
  const serie = trouverSerie(donneesAdmin, serieId);

  if (!serie) {
    selectEpisode.innerHTML = "<option value=\"\" disabled selected>Aucun épisode</option>";
    return;
  }

  const saison = serie.saisons.find((s) => s.id === saisonId) || serie.saisons[0];
  if (!saison || !Array.isArray(saison.episodes) || saison.episodes.length === 0) {
    selectEpisode.innerHTML = "<option value=\"\" disabled selected>Aucun épisode</option>";
    return;
  }

  const optionsHtml = saison.episodes
    .map((episode) => `<option value="${episode.id}">E${episode.numero} — ${episode.titre}</option>`)
    .join("");
  selectEpisode.innerHTML = "<option value=\"\" disabled selected>Choisis un épisode</option>" + optionsHtml;
}


async function onAjouterOuModifierSerie(e) {
  e.preventDefault();

  const titre = document.getElementById("serie-titre-input").value;
  const synopsis = document.getElementById("serie-synopsis-input").value;
  const miniature = document.getElementById("serie-miniature-input").value;
  const genres = lireGenresFormSerie();
  const affiche = document.getElementById("serie-affiche-checkbox").checked;
  const carrousel = document.getElementById("serie-carrousel-checkbox").checked;
  const type = (document.querySelector('input[name="serie-type"]:checked')?.value || "serie").toLowerCase();
  const videoUrl = document.getElementById("serie-video-url-input").value.trim();

  if (type === "film" && !videoUrl) {
    alert("Pour un film, ajoute une URL vidéo valide avant de sauvegarder.");
    document.getElementById("serie-video-url-input").focus();
    return;
  }

  try {
    if (serieEnEditionId) {
      await modifierSerie(donneesAdmin, serieEnEditionId, { titre, synopsis, miniature, genres, affiche, carrousel, type, videoUrl });
    } else {
      await ajouterSerie(donneesAdmin, { titre, synopsis, miniature, genres, affiche, carrousel, type, videoUrl });
    }

    resetFormSerie();
    remplirSelectsSeries();
    afficherArbreContenu();
  } catch (erreur) {
    console.error(erreur);
    alert(serieEnEditionId
      ? "Erreur lors de la modification de la série."
      : "Erreur lors de l'ajout de la série. Le serveur (node server.js) est-il lancé ?");
  }
}

async function onAjouterOuModifierSaison(e) {
  e.preventDefault();

  const serieId = document.getElementById("saison-serie-select").value;
  const numero = document.getElementById("saison-numero-input").value;

  if (!serieId) {
    alert("Crée d'abord une série.");
    return;
  }

  try {
    if (saisonEnEditionId) {
      await modifierSaison(donneesAdmin, serieId, saisonEnEditionId, { numero });
      resetFormSaison();
    } else {
      await ajouterSaison(donneesAdmin, serieId, { numero });
      e.target.reset();
    }

    remplirSelectsSeries();
    afficherArbreContenu();
  } catch (erreur) {
    console.error(erreur);
    alert(saisonEnEditionId ? "Erreur lors de la modification de la saison." : "Erreur lors de l'ajout de la saison.");
  }
}

async function onAjouterOuModifierEpisode(e) {
  e.preventDefault();

  const serieId = document.getElementById("episode-serie-select").value;
  const saisonId = document.getElementById("episode-saison-select").value;
  const numero = document.getElementById("episode-numero-input").value;
  const titre = document.getElementById("episode-titre-input").value;
  const videoUrl = document.getElementById("episode-video-url-input").value;

  if (!serieId || !saisonId) {
    alert("Choisis une série et une saison existantes.");
    return;
  }

  try {
    if (episodeEnEditionId) {
      await modifierEpisode(donneesAdmin, episodeEnEditionSerieId, episodeEnEditionSaisonId, episodeEnEditionId, { numero, titre, videoUrl });
      resetFormEpisode();
    } else {
      await ajouterEpisode(donneesAdmin, serieId, saisonId, { numero, titre, videoUrl });
      e.target.reset();
    }

    afficherArbreContenu();
  } catch (erreur) {
    console.error(erreur);
    alert(episodeEnEditionId ? "Erreur lors de la modification de l'épisode." : "Erreur lors de l'ajout de l'épisode.");
  }
}


function afficherArbreContenu() {
  remplirSelectsSeries();
  const container = document.getElementById('contenu-list');
  if (!container) return;
  container.innerHTML = '';
  const series = Array.isArray(donneesAdmin?.series) ? donneesAdmin.series : [];

  if (series.length === 0) {
    container.innerHTML = '<p class="admin-help-text">Aucun contenu.</p>';
    return;
  }

  const tree = document.createElement('div');
  tree.className = 'admin-tree';

  series.forEach((s) => {
    const item = document.createElement('div');
    item.className = 'admin-tree-item';

    const titleRow = document.createElement('div');
    titleRow.className = 'admin-tree-title';
    const title = document.createElement('span');
    title.textContent = s.titre || '(sans titre)';
    title.className = 'admin-tree-title-text';

    const badge = document.createElement('span');
    badge.className = 'admin-badge-small';
    badge.textContent = s.videoUrlManual ? 'Manuel' : 'Automatique';
    badge.dataset.serieId = s.id;

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'btn-small';
    toggleBtn.textContent = s.videoUrlManual ? 'Marquer automatique' : 'Marquer manuel';
    toggleBtn.addEventListener('click', async () => {
      toggleBtn.disabled = true;
      try {
        const targetManual = !s.videoUrlManual;
        const resp = await fetch(`/api/series/${encodeURIComponent(s.id)}/video-manual`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...entetesAdmin() },
          body: JSON.stringify({ manual: targetManual }),
        });
        const body = await resp.json();
        if (!resp.ok) throw new Error(body.erreur || 'Erreur');
        s.videoUrlManual = Boolean(body.videoUrlManual);
        afficherArbreContenu();
      } catch (e) {
        console.error(e);
        alert(e.message || 'Erreur');
      } finally {
        toggleBtn.disabled = false;
      }
    });

    titleRow.append(title, badge, toggleBtn);
    item.appendChild(titleRow);

    if (Array.isArray(s.saisons) && s.saisons.length) {
      const seasonsEl = document.createElement('div');
      seasonsEl.className = 'admin-tree-seasons';
      s.saisons.slice().sort((a,b)=>a.numero-b.numero).forEach((season) => {
        const seasonEl = document.createElement('div');
        seasonEl.className = 'admin-tree-season';
        const seasonTitle = document.createElement('div');
        seasonTitle.textContent = `Saison ${season.numero}`;
        seasonTitle.className = 'admin-tree-season-title';
        seasonEl.appendChild(seasonTitle);

        const epsEl = document.createElement('div');
        epsEl.className = 'admin-tree-episodes';
        (season.episodes || []).slice().sort((a,b)=>a.numero-b.numero).forEach((ep) => {
          const epEl = document.createElement('div');
          epEl.className = 'admin-tree-episode';
          const epTitle = document.createElement('span');
          epTitle.textContent = `E${ep.numero} — ${ep.titre || '(sans titre)'}`;
          const epBadge = document.createElement('span');
          epBadge.className = 'admin-badge-small';
          epBadge.textContent = ep.videoUrlManual ? 'Manuel' : 'Automatique';
          const epToggle = document.createElement('button');
          epToggle.type = 'button';
          epToggle.className = 'btn-small';
          epToggle.textContent = ep.videoUrlManual ? 'Marquer automatique' : 'Marquer manuel';
          epToggle.addEventListener('click', async () => {
            epToggle.disabled = true;
            try {
              const targetManual = !ep.videoUrlManual;
              const resp = await fetch(`/api/series/${encodeURIComponent(s.id)}/saisons/${encodeURIComponent(season.id)}/episodes/${encodeURIComponent(ep.id)}/video-manual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...entetesAdmin() },
                body: JSON.stringify({ manual: targetManual }),
              });
              const body = await resp.json();
              if (!resp.ok) throw new Error(body.erreur || 'Erreur');
              ep.videoUrlManual = Boolean(body.videoUrlManual);
              afficherArbreContenu();
            } catch (e) {
              console.error(e);
              alert(e.message || 'Erreur');
            } finally {
              epToggle.disabled = false;
            }
          });
          epEl.append(epTitle, epBadge, epToggle);
          epsEl.appendChild(epEl);
        });
        seasonEl.appendChild(epsEl);
        seasonsEl.appendChild(seasonEl);
      });
      item.appendChild(seasonsEl);
    }

    tree.appendChild(item);
  });

  container.appendChild(tree);
}

function chargerSeriePourModifier() {
  const serieId = document.getElementById("serie-modifier-select").value;
  const info = document.getElementById("serie-selection-info");

  if (!serieId) {
    info.textContent = "Choisis une série à modifier.";
    return;
  }

  const serie = trouverSerie(donneesAdmin, serieId);
  if (!serie) {
    info.textContent = "Cette série est introuvable.";
    return;
  }

  remplirFormSerie(serie);
  definirEtatEditionSerie(serie.id);
  info.textContent = `Série chargée : ${serie.titre}`;
  document.getElementById("serie-titre-input").focus();
}

function chargerSelectionPourModifier() {
  const serieId = document.getElementById("contenu-serie-select").value;
  const saisonId = document.getElementById("contenu-saison-select").value;
  const episodeId = document.getElementById("contenu-episode-select").value;
  const info = document.getElementById("contenu-selection-info");

  if (!serieId || !saisonId || !episodeId) {
    info.textContent = "Choisis bien une série, une saison et un épisode.";
    return;
  }

  const serie = trouverSerie(donneesAdmin, serieId);
  const saison = serie?.saisons.find((s) => s.id === saisonId);
  const episode = saison?.episodes.find((e) => e.id === episodeId);

  if (!serie || !saison || !episode) {
    info.textContent = "Cet épisode est introuvable.";
    return;
  }

  episodeEnEditionSerieId = serie.id;
  episodeEnEditionSaisonId = saison.id;
  remplirFormEpisode(episode, serie.id, saison.id);
  definirEtatEditionEpisode(episode.id);
  info.textContent = `Épisode chargé : ${serie.titre} • Saison ${saison.numero} • E${episode.numero} — ${episode.titre}`;
  document.getElementById("episode-titre-input").focus();
}

async function supprimerSerieSelectionnee() {
  const serieId = document.getElementById("contenu-serie-select").value;
  const serie = trouverSerie(donneesAdmin, serieId);
  const info = document.getElementById("contenu-selection-info");

  if (!serieId || !serie) {
    info.textContent = "Choisis une série valide à supprimer.";
    return;
  }

  if (!confirm(`Supprimer la série "${serie.titre}" et tout son contenu ?`)) return;

  try {
    await supprimerSerie(donneesAdmin, serieId);
    remplirSelectsSeries();
    info.textContent = `Série supprimée : ${serie.titre}`;
  } catch (erreur) {
    console.error(erreur);
    info.textContent = "Erreur lors de la suppression de la série.";
  }
}

async function supprimerSaisonSelectionnee() {
  const serieId = document.getElementById("contenu-serie-select").value;
  const saisonId = document.getElementById("contenu-saison-select").value;
  const serie = trouverSerie(donneesAdmin, serieId);
  const saison = serie?.saisons.find((s) => s.id === saisonId);
  const info = document.getElementById("contenu-selection-info");

  if (!serieId || !saisonId || !serie || !saison) {
    info.textContent = "Choisis une saison valide à supprimer.";
    return;
  }

  if (!confirm(`Supprimer la saison ${saison.numero} de "${serie.titre}" ?`)) return;

  try {
    await supprimerSaison(donneesAdmin, serieId, saisonId);
    remplirSelectsSeries();
    info.textContent = `Saison ${saison.numero} supprimée.`;
  } catch (erreur) {
    console.error(erreur);
    info.textContent = "Erreur lors de la suppression de la saison.";
  }
}

async function supprimerEpisodeSelectionne() {
  const serieId = document.getElementById("contenu-serie-select").value;
  const saisonId = document.getElementById("contenu-saison-select").value;
  const episodeId = document.getElementById("contenu-episode-select").value;
  const serie = trouverSerie(donneesAdmin, serieId);
  const saison = serie?.saisons.find((s) => s.id === saisonId);
  const episode = saison?.episodes.find((e) => e.id === episodeId);
  const info = document.getElementById("contenu-selection-info");

  if (!serieId || !saisonId || !episodeId || !serie || !saison || !episode) {
    info.textContent = "Choisis un épisode valide à supprimer.";
    return;
  }

  if (!confirm(`Supprimer l'épisode "${episode.titre}" ?`)) return;

  try {
    await supprimerEpisode(donneesAdmin, serieId, saisonId, episodeId);
    remplirSelectsSeries();
    info.textContent = `Épisode supprimé : ${episode.titre}`;
  } catch (erreur) {
    console.error(erreur);
    info.textContent = "Erreur lors de la suppression de l'épisode.";
  }
}

function onModifierSerie(e) {
  const bouton = e.target;
  const serieId = bouton.dataset.serie;
  const serie = trouverSerie(donneesAdmin, serieId);

  if (!serie) return;

  remplirFormSerie(serie);
  definirEtatEditionSerie(serie.id);
  document.getElementById("serie-titre-input").focus();
}

function onModifierItem(e) {
  const bouton = e.target;
  const type = bouton.dataset.type;
  const serieId = bouton.dataset.serie;
  const saisonId = bouton.dataset.saison;
  const episodeId = bouton.dataset.episode;
  const serie = trouverSerie(donneesAdmin, serieId);

  if (!serie) return;

  if (type === "saison-edit") {
    const saison = trouverSaison(serie, saisonId);
    if (!saison) return;
    remplirFormSaison(saison, serieId);
    definirEtatEditionSaison(saison.id);
    document.getElementById("saison-numero-input").focus();
  } else if (type === "episode-edit") {
    const saison = trouverSaison(serie, saisonId);
    if (!saison) return;
    const episode = trouverEpisode(saison, episodeId);
    if (!episode) return;
    episodeEnEditionSerieId = serieId;
    episodeEnEditionSaisonId = saisonId;
    remplirFormEpisode(episode, serieId, saisonId);
    definirEtatEditionEpisode(episode.id);
    document.getElementById("episode-titre-input").focus();
  }
}

async function onSupprimer(e) {
  const bouton = e.target;
  const type = bouton.dataset.type;
  const serieId = bouton.dataset.serie;

  try {
    if (type === "serie") {
      if (!confirm("Supprimer cette série et tout son contenu ?")) return;
      await supprimerSerie(donneesAdmin, serieId);
    } else if (type === "saison") {
      if (!confirm("Supprimer cette saison et ses épisodes ?")) return;
      await supprimerSaison(donneesAdmin, serieId, bouton.dataset.saison);
    } else if (type === "episode") {
      if (!confirm("Supprimer cet épisode ?")) return;
      await supprimerEpisode(donneesAdmin, serieId, bouton.dataset.saison, bouton.dataset.episode);
    }

    remplirSelectsSeries();
    afficherArbreContenu();
  } catch (erreur) {
    console.error(erreur);
    alert("Erreur lors de la suppression.");
  }
}
