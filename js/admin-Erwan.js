// admin.js
// Gère l'ajout, la modification et la suppression de séries / saisons / épisodes

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
          // Réponse sans corps JSON exploitable : on garde le message par défaut.
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

  if (sessionStorage.getItem(CLÉ_AUTH_ADMIN)) {
    donneesAdmin = await chargerDonnees();
    remplirSelectsSeries();
    remplirSelectCommentaireSeries();
  }
});

/* ---------- Remplissage des menus déroulants ---------- */

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

/* ---------- Ajouts ---------- */

async function onAjouterOuModifierSerie(e) {
  e.preventDefault();

  const titre = document.getElementById("serie-titre-input").value;
  const synopsis = document.getElementById("serie-synopsis-input").value;
  const miniature = document.getElementById("serie-miniature-input").value;
  const genres = lireGenresFormSerie();
  const affiche = document.getElementById("serie-affiche-checkbox").checked;
  const type = (document.querySelector('input[name="serie-type"]:checked')?.value || "serie").toLowerCase();
  const videoUrl = document.getElementById("serie-video-url-input").value.trim();

  if (type === "film" && !videoUrl) {
    alert("Pour un film, ajoute une URL vidéo valide avant de sauvegarder.");
    document.getElementById("serie-video-url-input").focus();
    return;
  }

  try {
    if (serieEnEditionId) {
      await modifierSerie(donneesAdmin, serieEnEditionId, { titre, synopsis, miniature, genres, affiche, type, videoUrl });
    } else {
      await ajouterSerie(donneesAdmin, { titre, synopsis, miniature, genres, affiche, type, videoUrl });
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

/* ---------- Vue d'ensemble / suppression ---------- */

function afficherArbreContenu() {
  remplirSelectsSeries();
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
