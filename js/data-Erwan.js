// data.js
// Couche d'accès aux données : séries > saisons > épisodes
// Parle à l'API du backend Express (server.js), qui stocke tout
// dans Firestore.

const API_URL = "/api";

/**
 * En-têtes à joindre aux requêtes qui modifient des données (admin uniquement).
 */
function entetesAdmin() {
  const token = sessionStorage.getItem("fistunia-admin-token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Charge toutes les données depuis le backend.
 */
async function chargerDonnees() {
  const reponse = await fetch(`${API_URL}/data`);
  if (!reponse.ok) throw new Error("Impossible de charger les données");
  return reponse.json();
}

/* ---------- Accès / recherche (fonctions pures, inchangées) ---------- */

function trouverSerie(donnees, serieId) {
  return donnees.series.find((s) => s.id === serieId) || null;
}

function trouverSaison(serie, saisonId) {
  return serie.saisons.find((s) => s.id === saisonId) || null;
}

function trouverEpisode(saison, episodeId) {
  return saison.episodes.find((e) => e.id === episodeId) || null;
}

/* ---------- Ajout (appellent l'API, mettent à jour l'objet local) ---------- */

async function ajouterSerie(donnees, { titre, synopsis, miniature, genres, affiche, type, videoUrl }) {
  const reponse = await fetch(`${API_URL}/series`, {
    method: "POST",
    headers: entetesAdmin(),
    body: JSON.stringify({ titre, synopsis, miniature, genres, affiche, type, videoUrl }),
  });
  if (!reponse.ok) throw new Error("Erreur lors de l'ajout de la série");

  const nouvelleSerie = await reponse.json();
  donnees.series.push(nouvelleSerie);
  return nouvelleSerie;
}

async function modifierSerie(donnees, serieId, { titre, synopsis, miniature, genres, affiche, type, videoUrl }) {
  const reponse = await fetch(`${API_URL}/series/${serieId}`, {
    method: "PUT",
    headers: entetesAdmin(),
    body: JSON.stringify({ titre, synopsis, miniature, genres, affiche, type, videoUrl }),
  });
  if (!reponse.ok) throw new Error("Erreur lors de la modification de la série");

  const serieModifiee = await reponse.json();
  const serie = trouverSerie(donnees, serieId);
  if (serie) {
    serie.titre = serieModifiee.titre;
    serie.synopsis = serieModifiee.synopsis;
    serie.miniature = serieModifiee.miniature;
    serie.genres = serieModifiee.genres || [];
    serie.affiche = Boolean(serieModifiee.affiche);
    serie.type = serieModifiee.type || "serie";
    serie.videoUrl = serieModifiee.videoUrl || "";
  }
  return serieModifiee;
}

async function modifierSaison(donnees, serieId, saisonId, { numero }) {
  const reponse = await fetch(`${API_URL}/series/${serieId}/saisons/${saisonId}`, {
    method: "PUT",
    headers: entetesAdmin(),
    body: JSON.stringify({ numero }),
  });
  if (!reponse.ok) throw new Error("Erreur lors de la modification de la saison");

  const saisonModifiee = await reponse.json();
  const serie = trouverSerie(donnees, serieId);
  const saison = serie ? trouverSaison(serie, saisonId) : null;
  if (saison) {
    saison.numero = saisonModifiee.numero;
    serie.saisons.sort((a, b) => a.numero - b.numero);
  }
  return saisonModifiee;
}

async function modifierEpisode(donnees, serieId, saisonId, episodeId, { numero, titre, videoUrl }) {
  const reponse = await fetch(`${API_URL}/series/${serieId}/saisons/${saisonId}/episodes/${episodeId}`, {
    method: "PUT",
    headers: entetesAdmin(),
    body: JSON.stringify({ numero, titre, videoUrl }),
  });
  if (!reponse.ok) throw new Error("Erreur lors de la modification de l'épisode");

  const episodeModifie = await reponse.json();
  const serie = trouverSerie(donnees, serieId);
  const saison = serie ? trouverSaison(serie, saisonId) : null;
  const episode = saison ? trouverEpisode(saison, episodeId) : null;
  if (episode) {
    episode.numero = episodeModifie.numero;
    episode.titre = episodeModifie.titre;
    episode.videoUrl = episodeModifie.videoUrl;
    saison.episodes.sort((a, b) => a.numero - b.numero);
  }
  return episodeModifie;
}

async function ajouterSaison(donnees, serieId, { numero }) {
  const reponse = await fetch(`${API_URL}/series/${serieId}/saisons`, {
    method: "POST",
    headers: entetesAdmin(),
    body: JSON.stringify({ numero }),
  });
  if (!reponse.ok) throw new Error("Erreur lors de l'ajout de la saison");

  const nouvelleSaison = await reponse.json();
  const serie = trouverSerie(donnees, serieId);
  serie.saisons.push(nouvelleSaison);
  serie.saisons.sort((a, b) => a.numero - b.numero);
  return nouvelleSaison;
}

async function ajouterEpisode(donnees, serieId, saisonId, { numero, titre, videoUrl, embedCode, vromovId }) {
  const reponse = await fetch(`${API_URL}/series/${serieId}/saisons/${saisonId}/episodes`, {
    method: "POST",
    headers: entetesAdmin(),
    body: JSON.stringify({ numero, titre, videoUrl: videoUrl ?? embedCode ?? vromovId }),
  });
  if (!reponse.ok) throw new Error("Erreur lors de l'ajout de l'épisode");

  const nouvelEpisode = await reponse.json();
  const serie = trouverSerie(donnees, serieId);
  const saison = trouverSaison(serie, saisonId);
  saison.episodes.push(nouvelEpisode);
  saison.episodes.sort((a, b) => a.numero - b.numero);
  return nouvelEpisode;
}

/* ---------- Commentaires d'épisode ---------- */

async function chargerCommentaires(episodeId) {
  const reponse = await fetch(`${API_URL}/episodes/${episodeId}/commentaires`);
  if (!reponse.ok) throw new Error("Impossible de charger les commentaires");
  return reponse.json();
}

async function ajouterCommentaire(episodeId, { pseudo, texte }) {
  const reponse = await fetch(`${API_URL}/episodes/${episodeId}/commentaires`, {
    method: "POST",
    headers: entetesAdmin(),
    body: JSON.stringify({ pseudo, texte }),
  });
  if (!reponse.ok) throw new Error("Erreur lors de l'envoi du commentaire");
  return reponse.json();
}

async function supprimerCommentaire(commentaireId) {
  const reponse = await fetch(`${API_URL}/commentaires/${commentaireId}`, { method: "DELETE", headers: entetesAdmin() });
  if (!reponse.ok) throw new Error("Erreur lors de la suppression du commentaire");
}

/* ---------- Suppression (appellent l'API, mettent à jour l'objet local) ---------- */

async function supprimerSerie(donnees, serieId) {
  const reponse = await fetch(`${API_URL}/series/${serieId}`, { method: "DELETE", headers: entetesAdmin() });
  if (!reponse.ok) throw new Error("Erreur lors de la suppression de la série");
  donnees.series = donnees.series.filter((s) => s.id !== serieId);
}

async function supprimerSaison(donnees, serieId, saisonId) {
  const reponse = await fetch(`${API_URL}/series/${serieId}/saisons/${saisonId}`, { method: "DELETE", headers: entetesAdmin() });
  if (!reponse.ok) throw new Error("Erreur lors de la suppression de la saison");
  const serie = trouverSerie(donnees, serieId);
  serie.saisons = serie.saisons.filter((s) => s.id !== saisonId);
}

async function supprimerEpisode(donnees, serieId, saisonId, episodeId) {
  const reponse = await fetch(`${API_URL}/series/${serieId}/saisons/${saisonId}/episodes/${episodeId}`, { method: "DELETE", headers: entetesAdmin() });
  if (!reponse.ok) throw new Error("Erreur lors de la suppression de l'épisode");
  const serie = trouverSerie(donnees, serieId);
  const saison = trouverSaison(serie, saisonId);
  saison.episodes = saison.episodes.filter((e) => e.id !== episodeId);
}
