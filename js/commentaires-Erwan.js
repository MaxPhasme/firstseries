// commentaires.js
// Zone de commentaires sous le lecteur : liste les avis sur l'épisode
// en cours et permet d'en poster un nouveau.
// Appelé par player.js une fois l'épisode identifié : initCommentaires(episode.id)

const CLE_PSEUDO = "firstseries_pseudo";

let episodeCommenteId = null;

async function initCommentaires(episodeId) {
  episodeCommenteId = episodeId;

  const section = document.getElementById("commentaires");
  const form = document.getElementById("form-commentaire");
  const pseudoEl = document.getElementById("commentaire-pseudo");

  if (!section || !form) return;

  section.hidden = false;

  // Le pseudo est mémorisé pour ne pas le retaper à chaque épisode
  const pseudoMemorise = localStorage.getItem(CLE_PSEUDO);
  if (pseudoMemorise) pseudoEl.value = pseudoMemorise;

  form.addEventListener("submit", envoyerCommentaire);

  await rafraichirCommentaires();
}

async function rafraichirCommentaires() {
  const listeEl = document.getElementById("commentaires-liste");
  const compteurEl = document.getElementById("commentaires-compteur");

  try {
    const commentaires = await chargerCommentaires(episodeCommenteId);

    compteurEl.textContent = commentaires.length > 0 ? `(${commentaires.length})` : "";
    listeEl.innerHTML = "";

    if (commentaires.length === 0) {
      const vide = document.createElement("p");
      vide.className = "commentaires-vide";
      vide.textContent = "Aucun commentaire pour le moment. Sois le premier !";
      listeEl.appendChild(vide);
      return;
    }

    commentaires.forEach((commentaire) => {
      listeEl.appendChild(construireCommentaire(commentaire));
    });
  } catch (erreur) {
    listeEl.innerHTML = "";
    const message = document.createElement("p");
    message.className = "commentaires-vide";
    message.textContent = "Impossible de charger les commentaires.";
    listeEl.appendChild(message);
  }
}

// Construit un bloc commentaire.
// On utilise textContent (et jamais innerHTML) : le texte vient des visiteurs,
// il ne doit surtout pas être interprété comme du HTML.
function construireCommentaire(commentaire) {
  const bloc = document.createElement("div");
  bloc.className = "commentaire";

  const meta = document.createElement("div");
  meta.className = "commentaire-meta";

  const pseudo = document.createElement("span");
  pseudo.className = "commentaire-pseudo";
  pseudo.textContent = commentaire.pseudo;

  const date = document.createElement("span");
  date.className = "commentaire-date";
  date.textContent = formaterDate(commentaire.date);

  meta.append(pseudo, date);

  const texte = document.createElement("p");
  texte.className = "commentaire-texte";
  texte.textContent = commentaire.texte;

  bloc.append(meta, texte);
  return bloc;
}

function formaterDate(dateIso) {
  const date = new Date(dateIso);
  if (isNaN(date)) return "";
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function envoyerCommentaire(evenement) {
  evenement.preventDefault();

  const pseudoEl = document.getElementById("commentaire-pseudo");
  const texteEl = document.getElementById("commentaire-texte");
  const boutonEl = document.getElementById("commentaire-envoyer");
  const erreurEl = document.getElementById("commentaire-erreur");

  const texte = texteEl.value.trim();
  erreurEl.textContent = "";

  if (texte === "") {
    erreurEl.textContent = "Écris quelque chose avant de publier.";
    return;
  }

  const pseudo = pseudoEl.value.trim();
  boutonEl.disabled = true;
  boutonEl.textContent = "Envoi...";

  try {
    await ajouterCommentaire(episodeCommenteId, { pseudo, texte });

    if (pseudo !== "") localStorage.setItem(CLE_PSEUDO, pseudo);
    texteEl.value = "";
    await rafraichirCommentaires();
  } catch (erreur) {
    erreurEl.textContent = "Envoi impossible, réessaie dans un instant.";
  } finally {
    boutonEl.disabled = false;
    boutonEl.textContent = "Publier";
  }
}
