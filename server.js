// server.js
// Backend simple pour Fistunia.IO
// - Sert les fichiers statiques (html/css/js)
// - Expose une API REST qui lit/écrit dans Firestore (collection "content", doc "app")

require("dotenv").config();

const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  next();
});
app.use(express.json({ limit: "100kb" }));

// Configuration publique du SDK Firebase Web. Ces valeurs (à l’exception
// du service account) sont destinées au navigateur et ne sont pas des secrets.
app.get("/api/firebase-config", (req, res) => {
  try {
    let projectId = process.env.FIREBASE_PROJECT_ID || "";
    if (!projectId) {
      const serviceAccount = chargerServiceAccount();
      projectId = serviceAccount.project_id || "";
    }

    const apiKey = process.env.FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY || "";
    if (!apiKey || !projectId) {
      return res.status(503).json({
        erreur: "Configuration Firebase Web manquante. Définissez FIREBASE_WEB_API_KEY et FIREBASE_PROJECT_ID."
      });
    }

    res.json({
      apiKey,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
      projectId,
    });
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible de charger la configuration Firebase Web" });
  }
});

// Ne jamais publier toute la racine : elle peut contenir la clé privée Firebase.
app.use("/css", express.static(path.join(__dirname, "css"), { dotfiles: "deny" }));
app.use("/js", express.static(path.join(__dirname, "js"), { dotfiles: "deny" }));
app.use("/assets", express.static(path.join(__dirname, "assets"), { dotfiles: "deny" }));
app.get("/movies/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "video.html"));
});
app.get("/series/:slug/s:saison/ep:episode", (req, res) => {
  res.sendFile(path.join(__dirname, "video.html"));
});
app.get("/series/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "serie.html"));
});
const PAGES_PUBLIQUES = new Set(["index.html", "app.html", "serie.html", "video.html", "admin.html"]);
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/:page", (req, res, next) => {
  if (!PAGES_PUBLIQUES.has(req.params.page)) return next();
  res.sendFile(path.join(__dirname, req.params.page));
});

let db;

function chargerServiceAccount() {
  const rawServiceAccount =
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ||
    process.env.FIREBASE_SERVICE_ACCOUNT;

  if (rawServiceAccount) {
    try {
      const json =
        process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
          ? Buffer.from(rawServiceAccount, "base64").toString("utf8")
          : rawServiceAccount;
      return JSON.parse(json);
    } catch (erreur) {
      throw new Error(
        `Impossible de parser le service account Firebase depuis les variables d'environnement: ${erreur.message}`
      );
    }
  }

  const serviceAccountPath = path.join(__dirname, "firebase-service-account.json");
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      "Fichier de service account Firebase introuvable. Définissez FIREBASE_SERVICE_ACCOUNT ou FIREBASE_SERVICE_ACCOUNT_BASE64, ou ajoutez firebase-service-account.json."
    );
  }

  return JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
}

function initialiserFirebase() {
  const serviceAccount = chargerServiceAccount();

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
    });
  }

  db = getFirestore();
}

/* ---------- Authentification admin (mot de passe hashé, stocké dans Firestore) ---------- */

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;

// Vérifie un mot de passe en clair contre un hash+sel stockés (scrypt).
function motDePasseValide(motDePasse, hashHex, selHex) {
  const sel = Buffer.from(selHex, "hex");
  const hashAttendu = Buffer.from(hashHex, "hex");
  const hashCalcule = crypto.scryptSync(motDePasse, sel, 64);
  return hashCalcule.length === hashAttendu.length && crypto.timingSafeEqual(hashCalcule, hashAttendu);
}

// Connexion admin : compare le mot de passe au hash stocké dans Firestore (collection "admin", doc "config").
app.post("/api/admin/login", async (req, res) => {
  if (!ADMIN_JWT_SECRET) {
    console.error("ADMIN_JWT_SECRET manquant dans les variables d'environnement.");
    return res.status(500).json({ erreur: "Authentification admin non configurée sur le serveur" });
  }

  try {
    initialiserFirebase();
    const snapshot = await db.collection("admin").doc("config").get();
    if (!snapshot.exists) {
      return res.status(500).json({ erreur: "Aucun mot de passe admin défini sur le serveur. Lance set-admin-password.js." });
    }

    const { hash, sel } = snapshot.data();
    const { motDePasse } = req.body;

    if (!motDePasse || !motDePasseValide(motDePasse, hash, sel)) {
      return res.status(401).json({ erreur: "Mot de passe incorrect" });
    }

    const token = jwt.sign({ role: "admin" }, ADMIN_JWT_SECRET, { expiresIn: "12h" });
    res.json({ token });
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Erreur lors de la vérification du mot de passe" });
  }
});

// Middleware : protège les routes d'écriture (ajout/modif/suppression).
function verifierAdmin(req, res, next) {
  const entete = req.headers.authorization || "";
  const token = entete.startsWith("Bearer ") ? entete.slice(7) : null;

  if (!token || !ADMIN_JWT_SECRET) {
    return res.status(401).json({ erreur: "Authentification requise" });
  }

  try {
    jwt.verify(token, ADMIN_JWT_SECRET);
    next();
  } catch (erreur) {
    return res.status(401).json({ erreur: "Session admin invalide ou expirée" });
  }
}

function normaliserSerie(serie) {
  return {
    id: serie.id,
    tmdbId: serie.tmdbId || null,
    tmdbType: serie.tmdbType || null,
    titre: serie.titre || "",
    synopsis: serie.synopsis || "",
    miniature: serie.miniature || "",
    genres: Array.isArray(serie.genres) ? serie.genres : [],
    affiche: Boolean(serie.affiche),
    type: serie.type === "film" ? "film" : "serie",
    videoUrl: serie.videoUrl || "",
    saisons: Array.isArray(serie.saisons) ? serie.saisons : [],
  };
}

const DONNEES_FALLBACK = {
  series: [],
  commentaires: [],
};

async function lireDonnees() {
  try {
    initialiserFirebase();
    const snapshot = await db.collection("content").doc("app").get();
    if (!snapshot.exists) {
      return { series: [], commentaires: [] };
    }

    const donnees = snapshot.data() || {};
    const series = Array.isArray(donnees.series) ? donnees.series : [];
    return {
      series: series.map(normaliserSerie),
      commentaires: Array.isArray(donnees.commentaires) ? donnees.commentaires : [],
    };
  } catch (erreur) {
    console.error("/api/data fallback error:", erreur.message || erreur);
    return DONNEES_FALLBACK;
  }
}

async function ecrireDonnees(donnees) {
  initialiserFirebase();
  await db.collection("content").doc("app").set(donnees, { merge: true });
}

function genererId(prefixe) {
  return `${prefixe}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function parseGenres(genres) {
  if (!Array.isArray(genres)) return [];
  return genres
    .map((genre) => (genre || "").toString().trim())
    .filter(Boolean);
}

function trouverSerie(donnees, serieId) {
  return donnees.series.find((s) => s.id === serieId);
}

function trouverSaison(serie, saisonId) {
  return serie.saisons.find((s) => s.id === saisonId);
}

function trouverEpisode(saison, episodeId) {
  return saison.episodes.find((e) => e.id === episodeId);
}


/* ---------- TMDB ---------- */

function getTmdbToken() {
  return (process.env.TMDB_API_TOKEN || process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_API_KEY || "").trim();
}

async function tmdbFetch(path, params = {}) {
  const token = getTmdbToken();
  if (!token) {
    const error = new Error("TMDB non configuré. Ajoute TMDB_API_TOKEN dans les variables d'environnement.");
    error.statusCode = 503;
    throw error;
  }

  const url = new URL(`https://api.themoviedb.org/3${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });

  const headers = {
    accept: "application/json",
    Authorization: `Bearer ${token}`,
  };

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(`TMDB a répondu ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
    error.statusCode = response.status === 401 ? 502 : response.status;
    throw error;
  }
  return response.json();
}

function tmdbImage(path, size = "original") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : "";
}

function genresDepuisTmdb(items = []) {
  return items
    .map((genre) => genre?.name)
    .filter(Boolean);
}

function normaliserTmdbResult(item) {
  const isMovie = item.media_type === "movie" || item.title !== undefined;
  return {
    id: item.id,
    type: isMovie ? "film" : "serie",
    titre: isMovie ? (item.title || item.original_title || "") : (item.name || item.original_name || ""),
    date: isMovie ? (item.release_date || "") : (item.first_air_date || ""),
    synopsis: item.overview || "",
    poster: tmdbImage(item.poster_path, "w500"),
    backdrop: tmdbImage(item.backdrop_path, "w1280"),
    note: Number.isFinite(Number(item.vote_average)) ? Number(item.vote_average) : null,
  };
}

/* Recherche TMDB (admin uniquement pour ne pas exposer le token) */
app.get("/api/tmdb/search", verifierAdmin, async (req, res) => {
  try {
    const query = (req.query.q || "").toString().trim();
    const type = (req.query.type || "multi").toString().toLowerCase();

    if (query.length < 2) {
      return res.status(400).json({ erreur: "Saisis au moins 2 caractères." });
    }

    const endpoint = type === "film"
      ? "/search/movie"
      : type === "serie"
        ? "/search/tv"
        : "/search/multi";

    const data = await tmdbFetch(endpoint, {
      query,
      language: "fr-FR",
      include_adult: "false",
      page: 1,
    });

    const results = (data.results || [])
      .filter((item) => type === "multi" ? ["movie", "tv"].includes(item.media_type) : true)
      .slice(0, 10)
      .map((item) => normaliserTmdbResult({ ...item, media_type: item.media_type || (type === "film" ? "movie" : "tv") }));

    res.json({ results });
  } catch (erreur) {
    console.error("/api/tmdb/search:", erreur);
    res.status(erreur.statusCode || 500).json({ erreur: erreur.message || "Recherche TMDB impossible" });
  }
});

/* Import des métadonnées TMDB + saisons/épisodes. Aucune source vidéo tierce n'est récupérée ici. */
app.post("/api/tmdb/import", verifierAdmin, async (req, res) => {
  const tmdbId = Number(req.body.tmdbId);
  const type = (req.body.type || "").toString().toLowerCase();

  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !["film", "serie"].includes(type)) {
    return res.status(400).json({ erreur: "tmdbId et type valides requis." });
  }

  try {
    const details = type === "film"
      ? await tmdbFetch(`/movie/${tmdbId}`, { language: "fr-FR" })
      : await tmdbFetch(`/tv/${tmdbId}`, { language: "fr-FR" });

    const nouvelleSerie = {
      id: genererId("serie"),
      tmdbId,
      tmdbType: type === "film" ? "movie" : "tv",
      titre: type === "film"
        ? (details.title || details.original_title || "")
        : (details.name || details.original_name || ""),
      synopsis: details.overview || "",
      miniature: tmdbImage(details.backdrop_path, "w1280"),
      genres: genresDepuisTmdb(details.genres),
      affiche: false,
      type,
      videoUrl: "",
      saisons: [],
    };

    if (type === "serie") {
      const seasonNumbers = (details.seasons || [])
        .map((season) => Number(season.season_number))
        .filter((number) => Number.isInteger(number) && number > 0);

      for (const seasonNumber of seasonNumbers) {
        try {
          const seasonDetails = await tmdbFetch(`/tv/${tmdbId}/season/${seasonNumber}`, { language: "fr-FR" });
          nouvelleSerie.saisons.push({
            id: genererId("saison"),
            numero: seasonNumber,
            tmdbSeasonNumber: seasonNumber,
            poster: tmdbImage(seasonDetails.poster_path, "w500"),
            episodes: (seasonDetails.episodes || []).map((episode) => ({
              id: genererId("episode"),
              tmdbId: episode.id,
              numero: Number(episode.episode_number),
              titre: episode.name || `Épisode ${episode.episode_number}`,
              synopsis: episode.overview || "",
              miniature: tmdbImage(episode.still_path, "w500"),
              videoUrl: "",
              sources: [],
            })),
          });
        } catch (seasonError) {
          console.warn(`TMDB saison ${seasonNumber} ignorée:`, seasonError.message);
        }
      }

      nouvelleSerie.saisons.sort((a, b) => a.numero - b.numero);
    }

    const donnees = await lireDonnees();
    donnees.series.push(nouvelleSerie);
    await ecrireDonnees(donnees);

    res.status(201).json(nouvelleSerie);
  } catch (erreur) {
    console.error("/api/tmdb/import:", erreur);
    res.status(erreur.statusCode || 500).json({ erreur: erreur.message || "Import TMDB impossible" });
  }
});

/* ---------- Routes ---------- */

// Récupérer toutes les données
app.get("/api/data", async (req, res) => {
  try {
    res.json(await lireDonnees());
  } catch (erreur) {
    console.error("/api/data error:", erreur);
    res.status(500).json({ erreur: "Impossible de charger les données" });
  }
});

// Ajouter une série ou un film
app.post("/api/series", verifierAdmin, async (req, res) => {
  const { titre, synopsis, miniature, genres, affiche, type, videoUrl } = req.body;
  if (!titre || !synopsis) {
    return res.status(400).json({ erreur: "Titre et synopsis requis" });
  }

  try {
    const contenuType = (type || "").toString().toLowerCase() === "film" ? "film" : "serie";
    const donnees = await lireDonnees();
    const nouvelleSerie = {
      id: genererId("serie"),
      titre: titre.trim(),
      synopsis: synopsis.trim(),
      miniature: (miniature || "").trim(),
      genres: parseGenres(genres),
      affiche: Boolean(affiche),
      type: contenuType,
      videoUrl: (videoUrl || "").trim(),
      saisons: [],
    };

    donnees.series.push(nouvelleSerie);
    await ecrireDonnees(donnees);
    res.status(201).json(nouvelleSerie);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible d'ajouter la série" });
  }
});

// Modifier une série ou un film
app.put("/api/series/:serieId", verifierAdmin, async (req, res) => {
  const { titre, synopsis, miniature, genres, affiche, type, videoUrl } = req.body;
  if (!titre || !synopsis) {
    return res.status(400).json({ erreur: "Titre et synopsis requis" });
  }

  try {
    const donnees = await lireDonnees();
    const serie = trouverSerie(donnees, req.params.serieId);
    if (!serie) return res.status(404).json({ erreur: "Série introuvable" });

    serie.titre = titre.trim();
    serie.synopsis = synopsis.trim();
    serie.miniature = (miniature || "").trim();
    serie.genres = parseGenres(genres);
    serie.affiche = Boolean(affiche);
    serie.type = (type || "").toString().toLowerCase() === "film" ? "film" : "serie";
    serie.videoUrl = (videoUrl || "").trim();

    await ecrireDonnees(donnees);
    res.json(serie);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible de modifier la série" });
  }
});

// Modifier une saison
app.put("/api/series/:serieId/saisons/:saisonId", verifierAdmin, async (req, res) => {
  const { numero } = req.body;
  if (numero === undefined) {
    return res.status(400).json({ erreur: "Numéro de saison requis" });
  }

  try {
    const donnees = await lireDonnees();
    const serie = trouverSerie(donnees, req.params.serieId);
    if (!serie) return res.status(404).json({ erreur: "Série introuvable" });

    const saison = trouverSaison(serie, req.params.saisonId);
    if (!saison) return res.status(404).json({ erreur: "Saison introuvable" });

    saison.numero = Number(numero);
    serie.saisons.sort((a, b) => a.numero - b.numero);
    await ecrireDonnees(donnees);
    res.json(saison);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible de modifier la saison" });
  }
});

// Supprimer une série
app.delete("/api/series/:serieId", verifierAdmin, async (req, res) => {
  try {
    const donnees = await lireDonnees();
    donnees.series = donnees.series.filter((s) => s.id !== req.params.serieId);
    await ecrireDonnees(donnees);
    res.status(204).end();
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible de supprimer la série" });
  }
});

// Ajouter une saison
app.post("/api/series/:serieId/saisons", verifierAdmin, async (req, res) => {
  try {
    const donnees = await lireDonnees();
    const serie = trouverSerie(donnees, req.params.serieId);
    if (!serie) return res.status(404).json({ erreur: "Série introuvable" });

    const { numero } = req.body;
    const nouvelleSaison = {
      id: genererId("saison"),
      numero: Number(numero),
      episodes: [],
    };

    serie.saisons.push(nouvelleSaison);
    serie.saisons.sort((a, b) => a.numero - b.numero);
    await ecrireDonnees(donnees);
    res.status(201).json(nouvelleSaison);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible d'ajouter la saison" });
  }
});

// Supprimer une saison
app.delete("/api/series/:serieId/saisons/:saisonId", verifierAdmin, async (req, res) => {
  try {
    const donnees = await lireDonnees();
    const serie = trouverSerie(donnees, req.params.serieId);
    if (!serie) return res.status(404).json({ erreur: "Série introuvable" });

    serie.saisons = serie.saisons.filter((s) => s.id !== req.params.saisonId);
    await ecrireDonnees(donnees);
    res.status(204).end();
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible de supprimer la saison" });
  }
});

// Ajouter un épisode
app.post("/api/series/:serieId/saisons/:saisonId/episodes", verifierAdmin, async (req, res) => {
  try {
    const donnees = await lireDonnees();
    const serie = trouverSerie(donnees, req.params.serieId);
    if (!serie) return res.status(404).json({ erreur: "Série introuvable" });

    const saison = trouverSaison(serie, req.params.saisonId);
    if (!saison) return res.status(404).json({ erreur: "Saison introuvable" });

    const { numero, titre, videoUrl, embedCode, vromovId } = req.body;
    const urlVideo = (videoUrl ?? "").toString().trim();
    const embedHtml = (embedCode ?? "").toString().trim();
    const vromov = (vromovId ?? "").toString().trim();
    const nouvelEpisode = {
      id: genererId("episode"),
      numero: Number(numero),
      titre: (titre || "").trim(),
      videoUrl: urlVideo,
      embedCode: embedHtml,
      vromovId: vromov,
    };

    saison.episodes.push(nouvelEpisode);
    saison.episodes.sort((a, b) => a.numero - b.numero);
    await ecrireDonnees(donnees);
    res.status(201).json(nouvelEpisode);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible d'ajouter l'épisode" });
  }
});

// Modifier un épisode
app.put("/api/series/:serieId/saisons/:saisonId/episodes/:episodeId", verifierAdmin, async (req, res) => {
  const { numero, titre, videoUrl, embedCode, vromovId } = req.body;
  if (!titre || (videoUrl === undefined && embedCode === undefined && vromovId === undefined)) {
    return res.status(400).json({ erreur: "Titre et URL vidéo requis" });
  }

  try {
    const donnees = await lireDonnees();
    const serie = trouverSerie(donnees, req.params.serieId);
    if (!serie) return res.status(404).json({ erreur: "Série introuvable" });

    const saison = trouverSaison(serie, req.params.saisonId);
    if (!saison) return res.status(404).json({ erreur: "Saison introuvable" });

    const episode = trouverEpisode(saison, req.params.episodeId);
    if (!episode) return res.status(404).json({ erreur: "Épisode introuvable" });

    episode.numero = Number(numero);
    episode.titre = (titre || "").trim();
    episode.videoUrl = (videoUrl || "").toString().trim();
    episode.embedCode = (embedCode || "").toString().trim();
    episode.vromovId = (vromovId || "").toString().trim();
    saison.episodes.sort((a, b) => a.numero - b.numero);
    await ecrireDonnees(donnees);
    res.json(episode);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible de modifier l'épisode" });
  }
});

// Supprimer un épisode
app.delete("/api/series/:serieId/saisons/:saisonId/episodes/:episodeId", verifierAdmin, async (req, res) => {
  try {
    const donnees = await lireDonnees();
    const serie = trouverSerie(donnees, req.params.serieId);
    if (!serie) return res.status(404).json({ erreur: "Série introuvable" });

    const saison = trouverSaison(serie, req.params.saisonId);
    if (!saison) return res.status(404).json({ erreur: "Saison introuvable" });

    saison.episodes = saison.episodes.filter((e) => e.id !== req.params.episodeId);
    await ecrireDonnees(donnees);
    res.status(204).end();
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible de supprimer l'épisode" });
  }
});

/* ---------- Commentaires d'épisode ---------- */

const PSEUDO_MAX = 30;
const TEXTE_MAX = 1000;

// Lister les commentaires d'un épisode (du plus récent au plus ancien)
app.get("/api/episodes/:episodeId/commentaires", async (req, res) => {
  try {
    const donnees = await lireDonnees();
    const liste = (donnees.commentaires || [])
      .filter((c) => c.episodeId === req.params.episodeId)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(liste);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible de charger les commentaires" });
  }
});

// Poster un commentaire sur un épisode
app.post("/api/episodes/:episodeId/commentaires", async (req, res) => {
  const { pseudo, texte } = req.body;
  if (!texte || !texte.trim()) {
    return res.status(400).json({ erreur: "Le commentaire ne peut pas être vide" });
  }

  try {
    const donnees = await lireDonnees();
    const nouveauCommentaire = {
      id: genererId("com"),
      episodeId: req.params.episodeId,
      pseudo: (pseudo || "").trim().slice(0, PSEUDO_MAX) || "Anonyme",
      texte: texte.trim().slice(0, TEXTE_MAX),
      date: new Date().toISOString(),
    };

    donnees.commentaires.push(nouveauCommentaire);
    await ecrireDonnees(donnees);
    res.status(201).json(nouveauCommentaire);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible d'ajouter le commentaire" });
  }
});

// Supprimer un commentaire (modération)
app.delete("/api/commentaires/:commentaireId", verifierAdmin, async (req, res) => {
  try {
    const donnees = await lireDonnees();
    donnees.commentaires = donnees.commentaires.filter((c) => c.id !== req.params.commentaireId);
    await ecrireDonnees(donnees);
    res.status(204).end();
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible de supprimer le commentaire" });
  }
});

function demarrerServeur(port) {
  const serveur = app.listen(port, () => {
    console.log(`Fistunia.IO lancé sur http://localhost:${port}`);
  });

  serveur.on("error", (erreur) => {
    if (erreur.code === "EADDRINUSE") {
      console.warn(`Le port ${port} est déjà utilisé, tentative sur ${port + 1}...`);
      demarrerServeur(port + 1);
      serveur.close();
      return;
    }

    console.error(erreur);
    process.exit(1);
  });
}

demarrerServeur(PORT);
