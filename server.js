require("dotenv").config();
const express = require("express");
const compression = require("compression");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;
app.disable("x-powered-by");
const tmdbSearchCache = new Map();
const TMDB_SEARCH_TTL_MS = 10 * 60 * 1000;

app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  next();
});
app.use(compression());
app.use(express.json({ limit: "100kb" }));
const STATIC_CACHE_OPTS = { dotfiles: "deny", maxAge: "7d", immutable: true };
app.use("/css", express.static(path.join(__dirname, "css"), STATIC_CACHE_OPTS));
app.use("/js", express.static(path.join(__dirname, "js"), STATIC_CACHE_OPTS));
app.use("/assets", express.static(path.join(__dirname, "assets"), STATIC_CACHE_OPTS));
app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(__dirname, "favicon.ico"));
});
app.get("/movies/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "video.html"));
});
app.get("/series/:slug/s:saison/ep:episode", (req, res) => {
  res.sendFile(path.join(__dirname, "video.html"));
});
app.get("/series/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "serie.html"));
});
app.get("/platforms/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "app.html"));
});
const PAGES_PUBLIQUES = new Set(["app.html", "serie.html", "video.html", "admin.html", "search.html"]);
app.get("/", (req, res) => res.redirect(302, "/app.html"));
app.get("/:page", (req, res, next) => {
  if (!PAGES_PUBLIQUES.has(req.params.page)) return next();
  res.sendFile(path.join(__dirname, req.params.page));
});
  app.get('/search', (req, res) => {
    res.sendFile(path.join(__dirname, 'search.html'));
  });
let db;
let pgPool = null;
function initialiserPostgres() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL manquant");
  }
  if (!pgPool) {
    const requiresSSL = process.env.DATABASE_URL.includes("render.com") || process.env.FORCE_DB_SSL === "1";
    
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: requiresSSL ? { rejectUnauthorized: false } : false,
    });
  }
  return pgPool;
}
async function garantirSchemaPostgres() {
  if (!process.env.DATABASE_URL) return;
  const pool = initialiserPostgres();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_data (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    )
  `);
}
const USER_JWT_SECRET = process.env.USER_JWT_SECRET;
function genererHashMotDePasse(motDePasse) {
  const sel = crypto.randomBytes(16);
  const hash = crypto.scryptSync(motDePasse, sel, 64);
  return { hash: hash.toString("hex"), sel: sel.toString("hex") };
}
function verifierMotDePasseUtilisateur(motDePasse, hashHex, selHex) {
  try {
    const attendu = Buffer.from(hashHex, "hex");
    const calcule = crypto.scryptSync(motDePasse, Buffer.from(selHex, "hex"), 64);
    return attendu.length === calcule.length && crypto.timingSafeEqual(attendu, calcule);
  } catch (_) { return false; }
}
async function garantirSchemaUtilisateurs() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL manquant");
  const pool = initialiserPostgres();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_progress (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      lectures JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
function verifierUtilisateur(req, res, next) {
  const entete = req.headers.authorization || "";
  const token = entete.startsWith("Bearer ") ? entete.slice(7) : null;
  if (!token || !USER_JWT_SECRET) return res.status(401).json({ erreur: "Connexion requise" });
  try {
    req.user = jwt.verify(token, USER_JWT_SECRET);
    if (!req.user?.userId) throw new Error("Token invalide");
    next();
  } catch (_) { return res.status(401).json({ erreur: "Session invalide ou expirée" }); }
}
app.post("/api/auth/register", async (req, res) => {
  try {
    if (!USER_JWT_SECRET) return res.status(500).json({ erreur: "USER_JWT_SECRET manquant sur Render" });
    await garantirSchemaUtilisateurs();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const motDePasse = String(req.body?.motDePasse || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erreur: "Adresse email invalide." });
    if (motDePasse.length < 6) return res.status(400).json({ erreur: "Le mot de passe doit contenir au moins 6 caractères." });
    const existe = await initialiserPostgres().query("SELECT id FROM users WHERE email = $1", [email]);
    if (existe.rows.length) return res.status(409).json({ erreur: "Un compte existe déjà avec cet email." });
    const { hash, sel } = genererHashMotDePasse(motDePasse);
    const result = await initialiserPostgres().query("INSERT INTO users (email,password_hash,password_salt) VALUES ($1,$2,$3) RETURNING id,email", [email,hash,sel]);
    const user = result.rows[0];
    await initialiserPostgres().query("INSERT INTO user_progress (user_id, lectures) VALUES ($1,'[]'::jsonb) ON CONFLICT (user_id) DO NOTHING", [user.id]);
    const token = jwt.sign({ userId: String(user.id), email: user.email }, USER_JWT_SECRET, { expiresIn: "180d" });
    res.json({ token, user: { id: String(user.id), email: user.email } });
  } catch (e) { console.error(e); res.status(500).json({ erreur: "Impossible de créer le compte." }); }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    if (!USER_JWT_SECRET) return res.status(500).json({ erreur: "USER_JWT_SECRET manquant sur Render" });
    await garantirSchemaUtilisateurs();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const motDePasse = String(req.body?.motDePasse || "");
    const result = await initialiserPostgres().query("SELECT id,email,password_hash,password_salt FROM users WHERE email = $1", [email]);
    const user = result.rows[0];
    if (!user || !verifierMotDePasseUtilisateur(motDePasse,user.password_hash,user.password_salt)) return res.status(401).json({ erreur: "Email ou mot de passe incorrect." });
    const token = jwt.sign({ userId: String(user.id), email: user.email }, USER_JWT_SECRET, { expiresIn: "180d" });
    res.json({ token, user: { id: String(user.id), email: user.email } });
  } catch (e) { console.error(e); res.status(500).json({ erreur: "Impossible de se connecter." }); }
});
app.get("/api/auth/me", verifierUtilisateur, async (req,res) => res.json({ user: { id: String(req.user.userId), email: req.user.email || "" } }));
app.get("/api/progress", verifierUtilisateur, async (req,res) => {
  try {
    await garantirSchemaUtilisateurs();
    const r = await initialiserPostgres().query("SELECT lectures FROM user_progress WHERE user_id = $1", [req.user.userId]);
    res.json({ lectures: Array.isArray(r.rows[0]?.lectures) ? r.rows[0].lectures : [] });
  } catch(e) { console.error(e); res.status(500).json({ erreur: "Impossible de récupérer la progression." }); }
});
app.put("/api/progress", verifierUtilisateur, async (req,res) => {
  try {
    await garantirSchemaUtilisateurs();
    const lectures = Array.isArray(req.body?.lectures) ? req.body.lectures.slice(0,12) : [];
    await initialiserPostgres().query(`INSERT INTO user_progress (user_id,lectures,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (user_id) DO UPDATE SET lectures=EXCLUDED.lectures, updated_at=NOW()`, [req.user.userId, JSON.stringify(lectures)]);
    res.json({ ok: true, lectures });
  } catch(e) { console.error(e); res.status(500).json({ erreur: "Impossible d'enregistrer la progression." }); }
});

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
function motDePasseValide(motDePasse, hashHex, selHex) {
  const sel = Buffer.from(selHex, "hex");
  const hashAttendu = Buffer.from(hashHex, "hex");
  const hashCalcule = crypto.scryptSync(motDePasse, sel, 64);
  return hashCalcule.length === hashAttendu.length && crypto.timingSafeEqual(hashCalcule, hashAttendu);
}
app.post("/api/admin/login", async (req, res) => {
  if (!ADMIN_JWT_SECRET) {
    console.error("ADMIN_JWT_SECRET manquant.");
    return res.status(500).json({ erreur: "Authentification admin non configurée" });
  }
  try {
    const { motDePasse } = req.body;
    if (!motDePasse) {
      return res.status(400).json({ erreur: "Mot de passe requis" });
    }
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ erreur: "Base de données non configurée" });
    }
    await garantirSchemaPostgres();
    const pool = initialiserPostgres();
    const result = await pool.query("SELECT hash, sel FROM app_admin WHERE id = $1", ["admin"]);
    if (!result.rows || !result.rows[0]) {
      return res.status(500).json({ erreur: "Aucun mot de passe admin défini. Exécutez set-admin-password.js." });
    }
    const { hash, sel } = result.rows[0];
    if (!motDePasseValide(motDePasse, hash, sel)) {
      return res.status(401).json({ erreur: "Mot de passe incorrect" });
    }
    const token = jwt.sign({ role: "admin" }, ADMIN_JWT_SECRET, { expiresIn: "12h" });
    res.json({ token });
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Erreur lors de la vérification du mot de passe" });
  }
});
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
    return res.status(401).json({ erreur: "Session admin invalide ou expir�e" });
  }
}
function normaliserSerie(serie) {
  return {
    id: serie.id,
    tmdbId: serie.tmdbId || null,
    tmdbType: serie.tmdbType || null,
    plateformes: Array.isArray(serie.plateformes) ? serie.plateformes : [],
    titre: serie.titre || "",
    synopsis: serie.synopsis || "",
    miniature: serie.miniature || "",
    genres: Array.isArray(serie.genres) ? serie.genres : [],
    affiche: Boolean(serie.affiche),
    carrousel: Boolean(serie.carrousel),
    type: serie.type === "film" ? "film" : "serie",
    date: serie.date || serie.release_date || serie.first_air_date || "",
    videoUrl: serie.videoUrl || "",
    saisons: Array.isArray(serie.saisons) ? serie.saisons : [],
  };
}
const DONNEES_FALLBACK = {
  series: [],
  commentaires: [],
};
const FALLBACK_DATA_PATH = path.join(__dirname, "data.json");
async function lireDonneesDepuisPostgres() {
  if (!process.env.DATABASE_URL) return null;
  try {
    await garantirSchemaPostgres();
    const pool = initialiserPostgres();
    const result = await pool.query("SELECT value FROM app_data WHERE key = $1", ["catalog"]);
    if (!result.rows || result.rows.length === 0) {
      return { series: [], commentaires: [] };
    }
    const payload = result.rows[0].value || { series: [], commentaires: [] };
    return {
      series: Array.isArray(payload.series) ? payload.series : [],
      commentaires: Array.isArray(payload.commentaires) ? payload.commentaires : [],
    };
  } catch (erreur) {
    console.warn("Lecture PostgreSQL impossible, fallback local activ�:", erreur.message || erreur);
    return null;
  }
}
async function ecrireDonneesVersPostgres(donnees) {
  if (!process.env.DATABASE_URL) return false;
  try {
    await garantirSchemaPostgres();
    const pool = initialiserPostgres();
    const payload = {
      series: Array.isArray(donnees?.series) ? donnees.series : [],
      commentaires: Array.isArray(donnees?.commentaires) ? donnees.commentaires : [],
    };
    await pool.query(
      `INSERT INTO app_data (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value`,
      ["catalog", payload]
    );
    return true;
  } catch (erreur) {
    console.warn("�criture PostgreSQL impossible, fallback local activ�:", erreur.message || erreur);
    return false;
  }
}
function lireDonneesFallback() {
  try {
    if (!fs.existsSync(FALLBACK_DATA_PATH)) {
      fs.writeFileSync(FALLBACK_DATA_PATH, JSON.stringify(DONNEES_FALLBACK, null, 2), "utf8");
      return { ...DONNEES_FALLBACK };
    }
    const raw = fs.readFileSync(FALLBACK_DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      series: Array.isArray(parsed?.series) ? parsed.series : [],
      commentaires: Array.isArray(parsed?.commentaires) ? parsed.commentaires : [],
    };
  } catch (erreur) {
    console.warn("Impossible de lire le fallback local :", erreur.message || erreur);
    return { ...DONNEES_FALLBACK };
  }
}
function ecrireDonneesFallback(donnees) {
  try {
    const serialisable = {
      series: Array.isArray(donnees?.series) ? donnees.series : [],
      commentaires: Array.isArray(donnees?.commentaires) ? donnees.commentaires : [],
    };
    fs.writeFileSync(FALLBACK_DATA_PATH, JSON.stringify(serialisable, null, 2), "utf8");
    return true;
  } catch (erreur) {
    console.warn("Impossible d'�crire le fallback local :", erreur.message || erreur);
    return false;
  }
}
async function lireDonnees() {
  if (process.env.DATABASE_URL) {
    const depuisPostgres = await lireDonneesDepuisPostgres();
    if (depuisPostgres) return depuisPostgres;
  }
  return lireDonneesFallback();
}
async function ecrireDonnees(donnees) {
  if (process.env.DATABASE_URL) {
    const ok = await ecrireDonneesVersPostgres(donnees);
    if (ok) return;
  }
  
  ecrireDonneesFallback(donnees);
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
function getTmdbToken() {
  return (process.env.TMDB_API_TOKEN || process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_API_KEY || "").trim();
}
async function tmdbFetch(path, params = {}) {
  const token = getTmdbToken();
  if (!token) {
    const error = new Error("TMDB non configur�. Ajoute TMDB_API_TOKEN dans les variables d'environnement.");
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
    const error = new Error(`TMDB a r�pondu ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
    error.statusCode = response.status === 401 ? 502 : response.status;
    throw error;
  }
  return response.json();
}
function tmdbImage(path, size = "original") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : "";
}
function tmdbPosterPreferred(details = {}, fallbackSize = "w1280") {
  if (!details || typeof details !== "object") return "";
  return tmdbImage(details.poster_path, "w780") || tmdbImage(details.backdrop_path, fallbackSize) || "";
}
async function omdbFetchByImdbId(imdbId) {
  const key = process.env.OMDB_API_KEY || process.env.OMDB_KEY;
  if (!key) {
    const error = new Error("OMDb API key not configured (OMDB_API_KEY)");
    error.statusCode = 503;
    throw error;
  }
  const url = `http://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(key)}&plot=full&r=json`;
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(`OMDb responded ${response.status}${body ? `: ${body.slice(0,300)}` : ""}`);
    error.statusCode = response.status;
    throw error;
  }
  const data = await response.json();
  if (data.Response === "False") {
    const error = new Error(data.Error || "OMDb returned false");
    error.statusCode = 404;
    throw error;
  }
  return data;
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

const PLATEFORMES_STREAMING = {
  netflix: { label: "Netflix", providerId: 8 },
  "prime-video": { label: "Prime Video", providerId: 119 },
  "paramount-plus": { label: "Paramount+", providerId: 531 },
  "disney-plus": { label: "Disney+", providerId: 337 },
  "apple-tv": { label: "Apple TV", providerId: 350 },
  marvel: { label: "Marvel", keyword: "Marvel" },
  "warner-bros": { label: "Warner Bros", keyword: "Warner Bros" },
  dc: { label: "DC", keyword: "DC" },
};

async function importerTmdbDansCatalogue(tmdbId, type) {
  const safeType = (type || "").toString().toLowerCase();
  if (!Number.isInteger(Number(tmdbId)) || Number(tmdbId) <= 0 || !["film", "serie"].includes(safeType)) {
    throw new Error("tmdbId et type valides requis.");
  }

  const donnees = await lireDonnees();
  const existant = (donnees.series || []).find((serie) => Number(serie.tmdbId) === Number(tmdbId) && (serie.type || "").toLowerCase() === safeType);
  if (existant) {
    return { inserted: false, item: { ...existant, isLocal: true, source: "local" } };
  }

  const details = safeType === "film"
    ? await tmdbFetch(`/movie/${tmdbId}`, { language: "fr-FR" })
    : await tmdbFetch(`/tv/${tmdbId}`, { language: "fr-FR" });

  const nouveau = {
    id: genererId("serie"),
    tmdbId: Number(tmdbId),
    tmdbType: safeType === "film" ? "movie" : "tv",
    titre: safeType === "film"
      ? (details.title || details.original_title || "")
      : (details.name || details.original_name || ""),
    synopsis: details.overview || "",
    miniature: tmdbPosterPreferred(details),
    affiche: tmdbImage(details.poster_path, "w500"),
    genres: genresDepuisTmdb(details.genres),
    type: safeType,
    date: details.release_date || details.first_air_date || "",
    videoUrl: safeType === "film" ? `https://vidzy.org/movie/${encodeURIComponent(tmdbId)}/vf` : "",
    saisons: [],
    isLocal: true,
    source: "local",
  };

  if (safeType === "serie") {
    const saisons = [];
    for (const saison of (details.seasons || []).filter((s) => Number(s.season_number) > 0)) {
      try {
        const seasonDetails = await tmdbFetch(`/tv/${tmdbId}/season/${saison.season_number}`, { language: "fr-FR" });
        saisons.push({
          id: genererId("saison"),
          numero: Number(saison.season_number),
          tmdbSeasonNumber: Number(saison.season_number),
          poster: tmdbImage(seasonDetails.poster_path, "w500"),
          episodes: (seasonDetails.episodes || []).map((episode) => ({
            id: genererId("episode"),
            tmdbId: episode.id,
            numero: Number(episode.episode_number),
            titre: episode.name || `Épisode ${episode.episode_number}`,
            synopsis: episode.overview || "",
            miniature: tmdbImage(episode.still_path, "w500"),
            videoUrl: `https://vidzy.org/serie/${encodeURIComponent(tmdbId)}/${encodeURIComponent(saison.season_number)}/${encodeURIComponent(episode.episode_number)}/vf`,
            sources: [],
          })),
        });
      } catch (seasonError) {
        console.warn(`TMDB saison ${saison.season_number} ignorée:`, seasonError.message);
      }
    }
    nouveau.saisons = saisons.sort((a, b) => a.numero - b.numero);
  }

  donnees.series.push(nouveau);
  await ecrireDonnees(donnees);
  return { inserted: true, item: nouveau };
}

async function rechercheTmdbCachee(query, type = "multi") {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const key = `${type}:${normalizedQuery}`;
  const now = Date.now();
  const cached = tmdbSearchCache.get(key);

  if (cached && now - cached.time < TMDB_SEARCH_TTL_MS) {
    return cached.value;
  }

  const endpoint = type === "film"
    ? "/search/movie"
    : type === "serie"
      ? "/search/tv"
      : "/search/multi";

  const data = await tmdbFetch(endpoint, {
    query: normalizedQuery,
    language: "fr-FR",
    include_adult: "false",
    page: 1,
  });

  tmdbSearchCache.set(key, { time: now, value: data });
  return data;
}
app.get("/api/tmdb/search", verifierAdmin, async (req, res) => {
  try {
    const query = (req.query.q || "").toString().trim();
    const type = (req.query.type || "multi").toString().toLowerCase();
    if (query.length < 2) {
      return res.status(400).json({ erreur: "Saisis au moins 2 caract�res." });
    }
    const data = await rechercheTmdbCachee(query, type);
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

app.get("/api/search-public", async (req, res) => {
  try {
    const query = (req.query.q || "").toString().trim().toLowerCase();
    if (query.length < 2) {
      return res.status(400).json({ erreur: "Saisis au moins 2 caractères." });
    }

    const donnees = await lireDonnees();
    const localResults = (donnees.series || [])
      .filter((serie) => (serie.titre || "").toLowerCase().includes(query))
      .map((serie) => ({ ...serie, isLocal: true, source: "local" }))
      .slice(0, 10);

    const results = [...localResults];
    const localTitles = new Set((donnees.series || []).map((serie) => (serie.titre || "").trim().toLowerCase()));

    if (getTmdbToken()) {
      try {
        const tmdbData = await rechercheTmdbCachee(query, "multi");

        const tmdbItems = (tmdbData.results || [])
          .filter((item) => ["movie", "tv"].includes(item.media_type))
          .slice(0, 6);

        for (const item of tmdbItems) {
          const title = (item.title || item.name || "").trim().toLowerCase();
          if (!title || localTitles.has(title)) continue;

          const normalized = normaliserTmdbResult({ ...item, media_type: item.media_type || "movie" });
          results.push({
            ...normalized,
            tmdbId: item.id,
            type: normalized.type,
            isLocal: false,
            source: "tmdb",
          });
        }
      } catch (tmdbError) {
        console.warn("Recherche TMDB échouée:", tmdbError.message);
      }
    }

    res.json({ results: results.slice(0, 12) });
  } catch (erreur) {
    console.error("/api/search-public:", erreur);
    res.status(erreur.statusCode || 500).json({ erreur: erreur.message || "Recherche impossible" });
  }
});

app.post("/api/search-public/import", async (req, res) => {
  try {
    const tmdbId = Number(req.body?.tmdbId);
    const type = (req.body?.type || "").toString().toLowerCase();

    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !["film", "serie"].includes(type)) {
      return res.status(400).json({ erreur: "tmdbId et type valides requis." });
    }

    const result = await importerTmdbDansCatalogue(tmdbId, type);
    return res.status(result.inserted ? 201 : 200).json(result);
  } catch (erreur) {
    console.error("/api/search-public/import:", erreur);
    res.status(erreur.statusCode || 500).json({ erreur: erreur.message || "Import du contenu impossible" });
  }
});

app.get("/api/platforms/:slug", async (req, res) => {
  try {
    const slug = (req.params.slug || "").toString().trim().toLowerCase();
    const config = PLATEFORMES_STREAMING[slug];
    if (!config) {
      return res.status(404).json({ erreur: "Plateforme inconnue" });
    }

    const donnees = await lireDonnees();
    const localSeries = Array.isArray(donnees.series) ? donnees.series : [];
    let items = localSeries
      .filter((serie) => Array.isArray(serie.plateformes) && serie.plateformes.some((platform) => platform.slug === slug))
      .map((serie) => ({ ...serie, isLocal: true, source: "local" }));
    let donneesModifiees = false;

    try {
      const results = [];
      if (config.providerId) {
        for (const mediaPath of ["/discover/movie", "/discover/tv"]) {
          for (const page of [1, 2]) {
            const data = await tmdbFetch(mediaPath, {
              language: "fr-FR",
              with_watch_providers: config.providerId,
              watch_region: "FR",
              sort_by: "popularity.desc",
              page,
            });
            results.push(...(data.results || []));
          }
        }
      } else if (config.keyword) {
        const searchData = await tmdbFetch("/search/multi", {
          query: config.keyword,
          language: "fr-FR",
          include_adult: "false",
          page: 1,
        });
        results.push(...(searchData.results || []));
      }

      const dedupe = new Map();
      for (const item of results) {
        if (!item || !item.id) continue;
        const type = (item.media_type || (item.title !== undefined ? "movie" : "tv")).toLowerCase();
        const key = `${type}:${item.id}`;
        if (!dedupe.has(key)) dedupe.set(key, item);
      }

      for (const item of Array.from(dedupe.values()).slice(0, 48)) {
        const mediaType = (item.media_type || (item.title !== undefined ? "movie" : "tv")).toLowerCase();
        const type = mediaType === "movie" ? "film" : "serie";
        const existing = localSeries.find((serie) => Number(serie.tmdbId) === Number(item.id) && (serie.type || "").toLowerCase() === type);
        if (existing) {
          const plateformes = Array.isArray(existing.plateformes) ? existing.plateformes : [];
          if (!plateformes.some((platform) => platform.slug === slug)) {
            existing.plateformes = [
              ...plateformes,
              { slug, label: config.label },
            ];
            donneesModifiees = true;
          }
          items.push({ ...existing, isLocal: true, source: "local" });
          continue;
        }

        const inserted = await importerTmdbDansCatalogue(item.id, type);
        inserted.item.plateformes = [{ slug, label: config.label }];
        const donneesApresImport = await lireDonnees();
        const serieImportee = donneesApresImport.series.find((serie) => serie.id === inserted.item.id);
        if (serieImportee) {
          serieImportee.plateformes = inserted.item.plateformes;
          await ecrireDonnees(donneesApresImport);
        }
        items.push({ ...inserted.item, isLocal: true, source: "local" });
      }
    } catch (tmdbError) {
      console.warn(`TMDB indisponible pour ${slug}:`, tmdbError.message || tmdbError);
    }

    if (donneesModifiees) {
      const donneesAjour = await lireDonnees();
      for (const serieLocale of localSeries) {
        const serieAjour = donneesAjour.series.find((serie) => serie.id === serieLocale.id);
        if (serieAjour) serieAjour.plateformes = serieLocale.plateformes;
      }
      await ecrireDonnees(donneesAjour);
    }

    const uniques = new Map();
    for (const item of items) {
      const key = `${item.type || "serie"}:${item.tmdbId || item.id}`;
      if (!uniques.has(key)) uniques.set(key, item);
    }
    items = Array.from(uniques.values());

    if (!items.length) {
      items = [];
    }

    res.json({
      slug,
      label: config.label,
      items: items.slice(0, 48),
      source: items.length ? "tmdb-or-local" : "local-fallback",
    });
  } catch (erreur) {
    console.error("/api/platforms/:slug:", erreur);
    res.status(erreur.statusCode || 500).json({ erreur: erreur.message || "Chargement de la plateforme impossible" });
  }
});
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
      miniature: tmdbPosterPreferred(details),
      genres: genresDepuisTmdb(details.genres),
      affiche: false,
      type,
      date: details.release_date || details.first_air_date || "",
      videoUrl: "",
      saisons: [],
    };
    try {
      if (type === 'film' && Number.isInteger(Number(tmdbId)) && tmdbId > 0) {
        nouvelleSerie.videoUrl = `https://vidzy.org/movie/${encodeURIComponent(tmdbId)}/vf`;
      }
    } catch (e) {
    }
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
              titre: episode.name || `�pisode ${episode.episode_number}`,
              synopsis: episode.overview || "",
              miniature: tmdbImage(episode.still_path, "w500"),
                videoUrl: `https://vidzy.org/serie/${encodeURIComponent(tmdbId)}/${encodeURIComponent(seasonNumber)}/${encodeURIComponent(episode.episode_number)}/vf`,
              sources: [],
            })),
          });
        } catch (seasonError) {
          console.warn(`TMDB saison ${seasonNumber} ignor�e:`, seasonError.message);
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
app.get('/api/tmdb/metadata', async (req, res) => {
  try {
    const idsParam = (req.query.ids || '').toString().trim();
    if (!idsParam) return res.status(400).json({ erreur: 'Param�tre ids requis' });
    const ids = idsParam.split(',').map(s => Number(s.trim())).filter(Number.isInteger);
    if (!ids.length) return res.status(400).json({ erreur: 'Aucun id valide fourni' });
    if (ids.length > 50) return res.status(400).json({ erreur: 'Maximum 50 ids par requ�te' });
    const typeParam = (req.query.types || '').toString().trim();
    const typeList = typeParam ? typeParam.split(',').map((entry) => entry.trim().toLowerCase()) : [];
    const resultTypes = new Map();
    ids.forEach((id, index) => {
      const candidate = typeList[index] || typeList[0] || 'movie';
      resultTypes.set(id, candidate === 'serie' || candidate === 'tv' ? 'tv' : 'movie');
    });
    const results = {};
    for (const id of ids) {
      const type = resultTypes.get(id) || 'movie';
      try {
        const details = await tmdbFetch(type === 'tv' ? `/tv/${id}` : `/movie/${id}`, { language: 'fr-FR' });
        results[id] = {
          release_date: details.release_date || null,
          first_air_date: details.first_air_date || null,
          date: details.release_date || details.first_air_date || null,
          title: details.title || details.original_title || details.name || details.original_name || null,
          belongs_to_collection: details.belongs_to_collection || null,
          type: type === 'tv' ? 'serie' : 'movie',
        };
      } catch (e) {
        results[id] = { error: e.message || 'not found' };
      }
    }
    res.json({ results });
  } catch (erreur) {
    console.error("/api/data error:", erreur);
    res.status(500).json({ erreur: "Impossible de charger les donn\u00e9es" });
  }
});

app.post('/api/admin/cleanup-content', verifierAdmin, async (req, res) => {
  try {
    const donnees = await lireDonnees();
    const series = Array.isArray(donnees.series) ? donnees.series : [];
    const normalize = (s) => (s || '').toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const seenByKey = new Map();
    const toRemoveIds = new Set();
    let removedDuplicates = 0;
    let removedFilmsNoLink = 0;
    let removedEpisodesNoLink = 0;
    let removedSeriesNoLink = 0;
    for (const s of series) {
      const key = s.tmdbId ? `tmdb:${s.tmdbId}` : `title:${normalize(s.titre)}`;
      if (!seenByKey.has(key)) {
        seenByKey.set(key, s);
        continue;
      }
      const keep = seenByKey.get(key);
      const score = (x) => ((x.videoUrl && x.videoUrl.trim()) ? 10 : 0) + ((Array.isArray(x.saisons) ? x.saisons.length : 0) * 2) + (x.tmdbId ? 1 : 0);
      if (score(s) > score(keep)) {
        toRemoveIds.add(keep.id);
        seenByKey.set(key, s);
      } else {
        toRemoveIds.add(s.id);
      }
    }
    for (const s of series) {
      if (toRemoveIds.has(s.id)) continue;
      if (s.type === 'film') {
        if (!s.videoUrl || !s.videoUrl.toString().trim()) {
          toRemoveIds.add(s.id);
          removedFilmsNoLink++;
        }
      } else if (s.type === 'serie') {
        if (Array.isArray(s.saisons)) {
          for (const saison of s.saisons) {
            if (!Array.isArray(saison.episodes)) continue;
            const keepEpisodes = saison.episodes.filter(ep => ep.videoUrl && ep.videoUrl.toString().trim());
            removedEpisodesNoLink += saison.episodes.length - keepEpisodes.length;
            saison.episodes = keepEpisodes;
          }
          s.saisons = s.saisons.filter(se => Array.isArray(se.episodes) && se.episodes.length > 0);
        }
        const hasVideo = s.videoUrl && s.videoUrl.toString().trim();
        const hasEpisodes = Array.isArray(s.saisons) && s.saisons.some(se => Array.isArray(se.episodes) && se.episodes.length > 0);
        if (!hasVideo && !hasEpisodes) {
          toRemoveIds.add(s.id);
          removedSeriesNoLink++;
        }
      }
    }
    if (toRemoveIds.size > 0) {
      const before = donnees.series.length;
      donnees.series = donnees.series.filter(s => !toRemoveIds.has(s.id));
      removedDuplicates = before - donnees.series.length - removedFilmsNoLink - removedSeriesNoLink - removedEpisodesNoLink;
      if (removedDuplicates < 0) removedDuplicates = 0;
      await ecrireDonnees(donnees);
    }
    res.json({ removedDuplicates, removedFilmsNoLink, removedEpisodesNoLink, removedSeriesNoLink });
  } catch (err) {
    console.error('/api/admin/cleanup-content error', err);
    res.status(err.statusCode || 500).json({ erreur: err.message || 'Erreur cleanup' });
  }
});

app.post('/api/admin/clear-catalog', verifierAdmin, async (req, res) => {
  try {
    const donnees = await lireDonnees();
    donnees.series = [];
    donnees.commentaires = [];
    await ecrireDonnees(donnees);
    res.json({ message: 'Catalogue vidé avec succès' });
  } catch (err) {
    console.error('/api/admin/clear-catalog error', err);
    res.status(err.statusCode || 500).json({ erreur: err.message || 'Erreur lors du vidage du catalogue' });
  }
});

app.post("/api/tmdb/update-posters", verifierAdmin, async (req, res) => {
  try {
    const donnees = await lireDonnees();
    let updated = 0;
    const errors = [];
    for (const serie of donnees.series) {
      if (!serie || !serie.tmdbId) continue;
      try {
        const details = serie.tmdbType === "movie"
          ? await tmdbFetch(`/movie/${serie.tmdbId}`, { language: "fr-FR" })
          : await tmdbFetch(`/tv/${serie.tmdbId}`, { language: "fr-FR" });
        const newMini = tmdbPosterPreferred(details);
        if (newMini && newMini !== serie.miniature) {
          serie.miniature = newMini;
          updated++;
        }
        if (serie.type === "serie" && Array.isArray(serie.saisons)) {
          for (const s of serie.saisons) {
            try {
              const seasonNumber = s.tmdbSeasonNumber || s.numero;
              if (!Number.isInteger(Number(seasonNumber))) continue;
              const seasonDetails = await tmdbFetch(`/tv/${serie.tmdbId}/season/${seasonNumber}`, { language: "fr-FR" });
              s.poster = tmdbImage(seasonDetails.poster_path, "w500") || s.poster || "";
              if (Array.isArray(seasonDetails.episodes) && Array.isArray(s.episodes)) {
                for (const ep of s.episodes) {
                  const epDetail = seasonDetails.episodes.find((e) => Number(e.episode_number) === Number(ep.numero) || e.id === ep.tmdbId);
                  if (epDetail) {
                    ep.miniature = tmdbImage(epDetail.still_path, "w500") || ep.miniature || "";
                  }
                }
              }
            } catch (seasonErr) {
            }
          }
        }
      } catch (err) {
        errors.push({ id: serie.id, tmdbId: serie.tmdbId, message: err.message || String(err) });
      }
    }
    await ecrireDonnees(donnees);
    res.json({ updated, errors });
  } catch (err) {
    console.error("/api/tmdb/update-posters:", err);
    res.status(err.statusCode || 500).json({ erreur: err.message || "Erreur lors de la mise � jour des miniatures" });
  }
});
app.post("/api/tmdb/add-imdb-ids", verifierAdmin, async (req, res) => {
  try {
    const donnees = await lireDonnees();
    let updated = 0;
    const errors = [];
    for (const serie of donnees.series) {
      if (!serie || !serie.tmdbId) continue;
      try {
        const external = serie.tmdbType === "movie"
          ? await tmdbFetch(`/movie/${serie.tmdbId}/external_ids`)
          : await tmdbFetch(`/tv/${serie.tmdbId}/external_ids`);
        const imdbId = external?.imdb_id || null;
        if (imdbId && serie.imdbId !== imdbId) {
          serie.imdbId = imdbId;
          updated++;
        }
        if (serie.tmdbType === "tv" && Array.isArray(serie.saisons)) {
          for (const saison of serie.saisons) {
            const seasonNum = saison.tmdbSeasonNumber || saison.numero;
            if (!Number.isInteger(Number(seasonNum))) continue;
            if (Array.isArray(saison.episodes)) {
              for (const ep of saison.episodes) {
                try {
                  const epExt = await tmdbFetch(`/tv/${serie.tmdbId}/season/${seasonNum}/episode/${ep.numero}/external_ids`);
                  const epImdb = epExt?.imdb_id || null;
                  if (epImdb && ep.imdbId !== epImdb) {
                    ep.imdbId = epImdb;
                    updated++;
                  }
                } catch (e) {
                  errors.push({ serieId: serie.id, season: seasonNum, episode: ep.numero, message: e.message || String(e) });
                }
              }
            }
          }
        }
      } catch (err) {
        errors.push({ id: serie.id, tmdbId: serie.tmdbId, message: err.message || String(err) });
      }
    }
    await ecrireDonnees(donnees);
    res.json({ updated, errors });
  } catch (err) {
    console.error("/api/tmdb/add-imdb-ids:", err);
    res.status(err.statusCode || 500).json({ erreur: err.message || "Erreur lors de l'ajout des imdb ids" });
  }
});

const PLATEFORMES_TMDB = [
  { slug: "netflix", label: "Netflix", ids: [8] },
  { slug: "prime-video", label: "Prime Video", ids: [119] },
  { slug: "paramount-plus", label: "Paramount+", ids: [531] },
  { slug: "disney-plus", label: "Disney+", ids: [337] },
  { slug: "apple-tv", label: "Apple TV", ids: [350] },
];

function extrairePlateformesTmdb(providerData = {}) {
  const region = providerData.FR || providerData.US || Object.values(providerData).find(Boolean) || {};
  const providers = region.flatrate || [];
  const providerIds = new Set(providers.map((provider) => Number(provider.provider_id)));
  return PLATEFORMES_TMDB
    .filter((platform) => platform.ids.some((id) => providerIds.has(id)))
    .map(({ slug, label }) => ({ slug, label }));
}

app.post("/api/admin/assign-platforms", verifierAdmin, async (req, res) => {
  try {
    const donnees = await lireDonnees();
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const serie of donnees.series || []) {
      if (!serie?.tmdbId) {
        skipped++;
        continue;
      }

      try {
        const endpoint = serie.tmdbType === "movie" || serie.type === "film"
          ? `/movie/${serie.tmdbId}/watch/providers`
          : `/tv/${serie.tmdbId}/watch/providers`;
        const providerData = await tmdbFetch(endpoint);
        const plateformes = extrairePlateformesTmdb(providerData.results);
        if (!plateformes.length) {
          skipped++;
          continue;
        }

        const ancienneValeur = JSON.stringify(serie.plateformes || []);
        if (ancienneValeur !== JSON.stringify(plateformes)) {
          serie.plateformes = plateformes;
          updated++;
        }
      } catch (error) {
        errors.push({ id: serie.id, tmdbId: serie.tmdbId, message: error.message || String(error) });
      }
    }

    await ecrireDonnees(donnees);
    res.json({ updated, skipped, errors });
  } catch (error) {
    console.error("/api/admin/assign-platforms:", error);
    res.status(error.statusCode || 500).json({ erreur: error.message || "Attribution des plateformes impossible" });
  }
});
app.post("/api/tmdb/search-assign", verifierAdmin, async (req, res) => {
  try {
    const donnees = await lireDonnees();
    let updated = 0;
    const errors = [];
    for (const serie of donnees.series) {
      try {
        if (!serie || serie.tmdbId) continue;
        const titre = (serie.titre || serie.titre || "").toString().trim();
        if (!titre) {
          errors.push({ id: serie.id, message: "no title" });
          continue;
        }
        const search = await tmdbFetch("/search/multi", { query: titre, language: "fr-FR", include_adult: "false", page: 1 });
        const results = (search.results || []).filter((r) => ["movie", "tv"].includes(r.media_type));
        if (!results.length) {
          errors.push({ id: serie.id, titre, message: "no tmdb match" });
          continue;
        }
        const best = results.find((r) => {
          const name = (r.title || r.name || "").toString().toLowerCase();
          return name === titre.toLowerCase();
        }) || results[0];
        const norm = normaliserTmdbResult({ ...best, media_type: best.media_type });
        if (!norm || !norm.id) {
          errors.push({ id: serie.id, titre, message: "normalisation failed" });
          continue;
        }
        if (!serie._oldMiniature) serie._oldMiniature = serie.miniature || "";
        serie.tmdbId = norm.id;
        serie.tmdbType = norm.type === "film" ? "movie" : "tv";
        serie.miniature = (norm.poster || norm.backdrop || serie.miniature || "");
        try {
          if (norm.type === 'film' && Number.isInteger(Number(norm.id)) && norm.id > 0) {
            serie.videoUrl = `https://vidzy.org/movie/${encodeURIComponent(norm.id)}/vf`;
          }
        } catch (e) {
        }
        updated++;
      } catch (errInner) {
        errors.push({ id: serie.id, message: errInner.message || String(errInner) });
      }
    }
    await ecrireDonnees(donnees);
    res.json({ updated, errors });
  } catch (err) {
    console.error("/api/tmdb/search-assign:", err);
    res.status(err.statusCode || 500).json({ erreur: err.message || "Search & assign failed" });
  }
});
app.post("/api/admin/regenerate-vidzy", verifierAdmin, async (req, res) => {
  try {
    const force = Boolean(req.body?.force || req.query?.force === 'true');
    const donnees = await lireDonnees();
    let updated = 0;
    const errors = [];
    for (const serie of donnees.series) {
      try {
        if (!serie || !serie.tmdbId) continue;
        const tmdbId = serie.tmdbId;
        if (serie.type === 'film') {
          if (!force && serie.videoUrlManual) continue;
          const newUrl = `https://vidzy.org/movie/${encodeURIComponent(tmdbId)}/vf`;
          if ((serie.videoUrl || '') !== newUrl) {
            serie.videoUrl = newUrl;
            serie.videoUrlManual = false;
            updated++;
          }
        } else if (serie.type === 'serie' && Array.isArray(serie.saisons)) {
          for (const saison of serie.saisons) {
            const seasonNumber = saison.tmdbSeasonNumber || saison.numero;
            if (!Number.isInteger(Number(seasonNumber))) continue;
            if (!Array.isArray(saison.episodes)) continue;
            for (const ep of saison.episodes) {
              try {
                const epNum = ep.numero;
                const newUrl = `https://vidzy.org/serie/${encodeURIComponent(tmdbId)}/${encodeURIComponent(seasonNumber)}/${encodeURIComponent(epNum)}/vf`;
                if (!force && ep.videoUrlManual) continue;
                if ((ep.videoUrl || '') !== newUrl) {
                  ep.videoUrl = newUrl;
                  ep.videoUrlManual = false;
                  updated++;
                }
              } catch (e) {
                errors.push({ serieId: serie.id, season: seasonNumber, episode: ep.id, message: String(e) });
              }
            }
          }
        }
      } catch (err) {
        errors.push({ id: serie.id, message: String(err) });
      }
    }
    await ecrireDonnees(donnees);
    res.json({ updated, errors });
  } catch (err) {
    console.error('/api/admin/regenerate-vidzy error:', err);
    res.status(err.statusCode || 500).json({ erreur: err.message || 'Erreur lors de la r�g�n�ration des liens Vidzy' });
  }
});
app.post('/api/admin/import-titles', verifierAdmin, async (req, res) => {
  try {
    const titles = Array.isArray(req.body?.titles) ? req.body.titles.map(t => (t || '').toString().trim()).filter(Boolean) : [];
    if (!titles.length) return res.status(400).json({ erreur: 'Aucun titre fourni' });

    const normalizeText = (value = '') => (value || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();

    const donnees = await lireDonnees();
    const existingTitles = new Set((donnees.series || []).map(s => normalizeText(s.titre)));
    const added = [];
    const skipped = [];
    const errors = [];

    for (const title of titles) {
      try {
        const normalizedTitle = normalizeText(title);
        if (existingTitles.has(normalizedTitle)) {
          skipped.push(title);
          continue;
        }

        let tmdbMatch = null;
        try {
          const search = await tmdbFetch('/search/multi', { query: title, language: 'fr-FR', include_adult: 'false', page: 1 });
          const results = Array.isArray(search.results) ? search.results.filter((item) => item && (item.media_type === 'movie' || item.media_type === 'tv' || item.title || item.name)) : [];

          const exact = results.find((item) => {
            const name = (item.title || item.name || item.original_title || item.original_name || '').toString().trim();
            return normalizeText(name) === normalizedTitle;
          });

          if (exact) {
            tmdbMatch = exact;
          } else {
            const best = results.find((item) => normalizeText(item.title || item.name || item.original_title || item.original_name || '') === normalizedTitle)
              || results.find((item) => normalizeText(item.title || item.name || item.original_title || item.original_name || '').includes(normalizedTitle))
              || results[0];
            if (best) tmdbMatch = best;
          }
        } catch (e) {
        }

        if (tmdbMatch && tmdbMatch.id) {
          try {
            const isSerie = tmdbMatch.media_type === 'tv' || tmdbMatch.first_air_date || (!tmdbMatch.title && !!tmdbMatch.name);
            const details = isSerie
              ? await tmdbFetch(`/tv/${tmdbMatch.id}`, { language: 'fr-FR' })
              : await tmdbFetch(`/movie/${tmdbMatch.id}`, { language: 'fr-FR' });

            const nouvelleSerie = {
              id: genererId('serie'),
              tmdbId: Number(tmdbMatch.id),
              tmdbType: isSerie ? 'tv' : 'movie',
              titre: isSerie ? (details.name || details.original_name || title) : (details.title || details.original_title || title),
              synopsis: details.overview || '',
              miniature: tmdbPosterPreferred(details),
              genres: genresDepuisTmdb(details.genres),
              affiche: false,
              type: isSerie ? 'serie' : 'film',
              date: details.release_date || details.first_air_date || '',
              videoUrl: isSerie ? `https://vidzy.org/serie/${encodeURIComponent(tmdbMatch.id)}/vf` : `https://vidzy.org/movie/${encodeURIComponent(tmdbMatch.id)}/vf`,
              saisons: [],
            };

            if (isSerie) {
              const seasonNumbers = (details.seasons || [])
                .map((season) => Number(season.season_number))
                .filter((number) => Number.isInteger(number) && number > 0);

              for (const seasonNumber of seasonNumbers) {
                try {
                  const seasonDetails = await tmdbFetch(`/tv/${tmdbMatch.id}/season/${seasonNumber}`, { language: 'fr-FR' });
                  nouvelleSerie.saisons.push({
                    id: genererId('saison'),
                    numero: seasonNumber,
                    tmdbSeasonNumber: seasonNumber,
                    poster: tmdbImage(seasonDetails.poster_path, 'w500'),
                    episodes: (seasonDetails.episodes || []).map((episode) => ({
                      id: genererId('episode'),
                      tmdbId: episode.id,
                      numero: Number(episode.episode_number),
                      titre: episode.name || `Episode ${episode.episode_number}`,
                      synopsis: episode.overview || '',
                      miniature: tmdbImage(episode.still_path, 'w500'),
                      videoUrl: `https://vidzy.org/serie/${encodeURIComponent(tmdbMatch.id)}/${encodeURIComponent(seasonNumber)}/${encodeURIComponent(episode.episode_number)}/vf`,
                      sources: [],
                    })),
                  });
                } catch (seasonError) {
                  console.warn(`TMDB saison ${seasonNumber} ignorée pour import CSV:`, seasonError.message);
                }
              }
              nouvelleSerie.saisons.sort((a, b) => a.numero - b.numero);
            }

            donnees.series.push(nouvelleSerie);
            existingTitles.add(normalizeText(nouvelleSerie.titre));
            added.push(nouvelleSerie.titre);
          } catch (e) {
            errors.push({ title, message: e.message || String(e) });
          }
        } else {
          try {
            const minimal = {
              id: genererId('serie'),
              titre: title,
              synopsis: '',
              miniature: '',
              genres: [],
              affiche: false,
              type: 'film',
              videoUrl: '',
              saisons: [],
            };
            donnees.series.push(minimal);
            existingTitles.add(normalizeText(title));
            added.push(minimal.titre);
          } catch (e) {
            errors.push({ title, message: e.message || String(e) });
          }
        }
      } catch (e) {
        errors.push({ title, message: e.message || String(e) });
      }
    }

    await ecrireDonnees(donnees);
    res.json({ added: added.length, skipped: skipped.length, errors, addedTitles: added.slice(0, 50) });
  } catch (err) {
    console.error('/api/admin/import-titles error:', err);
    res.status(err.statusCode || 500).json({ erreur: err.message || 'Erreur lors de l import des titres' });
  }
});
app.get("/api/omdb/serie/:serieId", async (req, res) => {
  try {
    const serieId = req.params.serieId;
    const donnees = await lireDonnees();
    const serie = trouverSerie(donnees, serieId);
    if (!serie) return res.status(404).json({ erreur: "S�rie introuvable" });
    if (serie.imdbData) return res.json({ imdbData: serie.imdbData, imdbId: serie.imdbId || null });
    let imdbId = serie.imdbId || null;
    if (!imdbId && serie.tmdbId) {
      try {
        const external = serie.tmdbType === "movie"
          ? await tmdbFetch(`/movie/${serie.tmdbId}/external_ids`)
          : await tmdbFetch(`/tv/${serie.tmdbId}/external_ids`);
        imdbId = external?.imdb_id || null;
      } catch (e) {
      }
    }
    if (!imdbId) return res.status(404).json({ erreur: "Aucun imdbId trouv� pour ce contenu" });
    const imdbData = await omdbFetchByImdbId(imdbId);
    serie.imdbId = imdbId;
    serie.imdbData = imdbData;
    await ecrireDonnees(donnees);
    res.json({ imdbData, imdbId });
  } catch (err) {
    console.error("/api/omdb/serie error:", err);
    res.status(err.statusCode || 500).json({ erreur: err.message || "Erreur OMDb" });
  }
});
app.get("/api/data", async (req, res) => {
  try {
    res.json(await lireDonnees());
  } catch (erreur) {
    console.error("/api/data error:", erreur);
    res.status(500).json({ erreur: "Impossible de charger les donn�es" });
  }
});

app.post("/api/series", verifierAdmin, async (req, res) => {
  try {
    const { titre, synopsis, miniature, genres, affiche, carrousel, type, videoUrl } = req.body;
    if (!titre || !(titre || "").toString().trim()) {
      return res.status(400).json({ erreur: "Titre requis" });
    }
    const donnees = await lireDonnees();
    const nouvelleSerie = normaliserSerie({
      id: genererId("serie"),
      titre: (titre || "").toString().trim(),
      synopsis: (synopsis || "").toString().trim(),
      miniature: (miniature || "").toString().trim(),
      genres: parseGenres(genres),
      affiche: Boolean(affiche),
      carrousel: Boolean(carrousel),
      type: type === "film" ? "film" : "serie",
      videoUrl: (videoUrl || "").toString().trim(),
      saisons: [],
    });
    donnees.series = donnees.series || [];
    donnees.series.push(nouvelleSerie);
    await ecrireDonnees(donnees);
    res.status(201).json(nouvelleSerie);
  } catch (erreur) {
    console.error("/api/series (POST) error:", erreur);
    res.status(500).json({ erreur: "Impossible d'ajouter la s�rie" });
  }
});

app.put("/api/series/:serieId", verifierAdmin, async (req, res) => {
  try {
    const { titre, synopsis, miniature, genres, affiche, carrousel, type, videoUrl } = req.body;
    if (!titre || !(titre || "").toString().trim()) {
      return res.status(400).json({ erreur: "Titre requis" });
    }
    const donnees = await lireDonnees();
    const serie = trouverSerie(donnees, req.params.serieId);
    if (!serie) return res.status(404).json({ erreur: "S�rie introuvable" });
    serie.titre = (titre || "").toString().trim();
    serie.synopsis = (synopsis || "").toString().trim();
    serie.miniature = (miniature || "").toString().trim();
    serie.genres = parseGenres(genres);
    serie.affiche = Boolean(affiche);
    serie.carrousel = Boolean(carrousel);
    serie.type = type === "film" ? "film" : "serie";
    serie.videoUrl = (videoUrl || "").toString().trim();
    await ecrireDonnees(donnees);
    res.json(normaliserSerie(serie));
  } catch (erreur) {
    console.error("/api/series/:serieId (PUT) error:", erreur);
    res.status(500).json({ erreur: "Impossible de modifier la s�rie" });
  }
});

app.post('/api/series/:serieId/video-manual', verifierAdmin, async (req, res) => {
  try {
    const manual = req.body?.manual;
    if (manual === undefined) return res.status(400).json({ erreur: 'Param�tre `manual` requis (true|false)' });
    const donnees = await lireDonnees();
    const serie = trouverSerie(donnees, req.params.serieId);
    if (!serie) return res.status(404).json({ erreur: 'S�rie introuvable' });
    serie.videoUrlManual = Boolean(manual);
    await ecrireDonnees(donnees);
    res.json({ id: serie.id, videoUrlManual: serie.videoUrlManual });
  } catch (err) {
    console.error('/api/series/:serieId/video-manual error:', err);
    res.status(err.statusCode || 500).json({ erreur: err.message || 'Erreur serveur' });
  }
});
app.post('/api/series/:serieId/saisons/:saisonId/episodes/:episodeId/video-manual', verifierAdmin, async (req, res) => {
  try {
    const manual = req.body?.manual;
    if (manual === undefined) return res.status(400).json({ erreur: 'Param�tre `manual` requis (true|false)' });
    const donnees = await lireDonnees();
    const serie = trouverSerie(donnees, req.params.serieId);
    if (!serie) return res.status(404).json({ erreur: 'S�rie introuvable' });
    const saison = trouverSaison(serie, req.params.saisonId);
    if (!saison) return res.status(404).json({ erreur: 'Saison introuvable' });
    const episode = trouverEpisode(saison, req.params.episodeId);
    if (!episode) return res.status(404).json({ erreur: '�pisode introuvable' });
    episode.videoUrlManual = Boolean(manual);
    await ecrireDonnees(donnees);
    res.json({ id: episode.id, videoUrlManual: episode.videoUrlManual });
  } catch (err) {
    console.error('/api/.../video-manual error:', err);
    res.status(err.statusCode || 500).json({ erreur: err.message || 'Erreur serveur' });
  }
});
app.post("/api/series/:serieId/saisons/:saisonId/episodes", verifierAdmin, async (req, res) => {
  try {
    const donnees = await lireDonnees();
    const serie = trouverSerie(donnees, req.params.serieId);
    if (!serie) return res.status(404).json({ erreur: "S�rie introuvable" });
    const saison = trouverSaison(serie, req.params.saisonId);
    if (!saison) return res.status(404).json({ erreur: "Saison introuvable" });
    const { numero, titre, videoUrl, embedCode, vromovId } = req.body;
    const urlVideo = (videoUrl ?? embedCode ?? vromovId ?? "").toString().trim();
    const nouvelEpisode = {
      id: genererId("episode"),
      numero: Number(numero),
      titre: (titre || "").trim(),
      videoUrl: urlVideo,
      videoUrlManual: Boolean(urlVideo),
    };
    saison.episodes.push(nouvelEpisode);
    saison.episodes.sort((a, b) => a.numero - b.numero);
    await ecrireDonnees(donnees);
    res.status(201).json(nouvelEpisode);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible d'ajouter l'�pisode" });
  }
});
app.put("/api/series/:serieId/saisons/:saisonId/episodes/:episodeId", verifierAdmin, async (req, res) => {
  const { numero, titre, videoUrl } = req.body;
  if (!titre || videoUrl === undefined) {
    return res.status(400).json({ erreur: "Titre et URL vid�o requis" });
  }
  try {
    const donnees = await lireDonnees();
    const serie = trouverSerie(donnees, req.params.serieId);
    if (!serie) return res.status(404).json({ erreur: "S�rie introuvable" });
    const saison = trouverSaison(serie, req.params.saisonId);
    if (!saison) return res.status(404).json({ erreur: "Saison introuvable" });
    const episode = trouverEpisode(saison, req.params.episodeId);
    if (!episode) return res.status(404).json({ erreur: "�pisode introuvable" });
    episode.numero = Number(numero);
    episode.titre = (titre || "").trim();
    episode.videoUrl = (videoUrl || "").trim();
    episode.videoUrlManual = Boolean((videoUrl || "").toString().trim());
    saison.episodes.sort((a, b) => a.numero - b.numero);
    await ecrireDonnees(donnees);
    res.json(episode);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible de modifier l'�pisode" });
  }
});
app.delete("/api/series/:serieId/saisons/:saisonId/episodes/:episodeId", verifierAdmin, async (req, res) => {
  try {
    const donnees = await lireDonnees();
    const serie = trouverSerie(donnees, req.params.serieId);
    if (!serie) return res.status(404).json({ erreur: "S�rie introuvable" });
    const saison = trouverSaison(serie, req.params.saisonId);
    if (!saison) return res.status(404).json({ erreur: "Saison introuvable" });
    saison.episodes = saison.episodes.filter((e) => e.id !== req.params.episodeId);
    await ecrireDonnees(donnees);
    res.status(204).end();
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible de supprimer l'�pisode" });
  }
});
app.delete("/api/series/:serieId/saisons/:saisonId", verifierAdmin, async (req, res) => {
  try {
    const donnees = await lireDonnees();
    const serie = trouverSerie(donnees, req.params.serieId);
    if (!serie) return res.status(404).json({ erreur: "S�rie introuvable" });
    serie.saisons = Array.isArray(serie.saisons) ? serie.saisons.filter((s) => s.id !== req.params.saisonId) : [];
    await ecrireDonnees(donnees);
    res.status(204).end();
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible de supprimer la saison" });
  }
});

app.delete("/api/series/:serieId", verifierAdmin, async (req, res) => {
  try {
    const donnees = await lireDonnees();
    const before = Array.isArray(donnees.series) ? donnees.series.length : 0;
    donnees.series = (donnees.series || []).filter((s) => s.id !== req.params.serieId);
    if ((donnees.series || []).length === before) return res.status(404).json({ erreur: "S�rie introuvable" });
    await ecrireDonnees(donnees);
    res.status(204).end();
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible de supprimer la s�rie" });
  }
});
const PSEUDO_MAX = 30;
const TEXTE_MAX = 1000;
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
app.post("/api/episodes/:episodeId/commentaires", async (req, res) => {
  const { pseudo, texte } = req.body;
  if (!texte || !texte.trim()) {
    return res.status(400).json({ erreur: "Le commentaire ne peut pas �tre vide" });
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
    console.log(`FirstSeries.org lancé sur http://localhost:${port}`);
  });
  serveur.on("error", (erreur) => {
    if (erreur.code === "EADDRINUSE") {
      console.warn(`Le port ${port} est d�j� utilis�, tentative sur ${port + 1}...`);
      demarrerServeur(port + 1);
      serveur.close();
      return;
    }
    console.error(erreur);
    process.exit(1);
  });
}
demarrerServeur(PORT);
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
app.post('/api/get-video-link', async (req, res) => {
  const { query } = req.body || {};
  if (!query || !query.toString().trim()) return res.status(400).json({ success: false, error: 'Query manquante' });
  const searchTerm = query.toString().trim();
  try {
    const searchUrl = `https://movix.fun/search?q=${encodeURIComponent(searchTerm)}`;
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 20000
    });
    const html = response.data || '';
    const candidateUrl = extractMovixCandidateUrl(html);
    if (!candidateUrl) {
      throw new Error('Aucun candidat vid�o trouv� sur Movix.');
    }
    const videoLink = await renderAndExtractVideo(candidateUrl);
    if (videoLink) {
      return res.json({ success: true, videoLink, sourceUrl: candidateUrl, source: 'movix' });
    }
    return res.json({ success: true, videoLink: candidateUrl, sourceUrl: candidateUrl, source: 'movix', warning: 'Aucune source de lecture directe d�tect�e, lien de page renvoy�.' });
  } catch (movixError) {
    console.warn('Movix non exploitable:', movixError && movixError.message ? movixError.message : movixError);
  }
  try {
    const pureStreamCandidate = await findPureStreamCandidate(searchTerm);
    if (!pureStreamCandidate) {
      return res.status(404).json({ success: false, error: 'Aucun candidat vid�o trouv� sur Movix ni PureStream.' });
    }
    const videoLink = await renderAndExtractVideo(pureStreamCandidate, 25000);
    if (videoLink) {
      return res.json({ success: true, videoLink, sourceUrl: pureStreamCandidate, source: 'purestream' });
    }
    return res.json({ success: true, videoLink: pureStreamCandidate, sourceUrl: pureStreamCandidate, source: 'purestream', warning: 'Aucune source de lecture directe d�tect�e sur PureStream, lien de page renvoy�.' });
  } catch (pureStreamError) {
    console.error('Erreur PureStream:', pureStreamError && pureStreamError.message ? pureStreamError.message : pureStreamError);
    res.status(500).json({ success: false, error: 'Erreur lors de la r�cup�ration des liens.' });
  }
});
function extractVideoLink(html) {
  if (!html || typeof html !== 'string') return null;
  const $ = cheerio.load(html);
  const anchorSelectors = ['a[href*="/video/"]','a[href*="/watch/"]','a[href*="/movie/"]','a[href*="/series/"]','a[href*="movix.fun"]'];
  for (const sel of anchorSelectors) {
    const a = $(sel).first();
    if (a && a.attr && a.attr('href')) {
      let href = a.attr('href');
      if (href.startsWith('//')) href = 'https:' + href;
      if (href.startsWith('/')) href = 'https://movix.fun' + href;
      return href;
    }
  }
  const m = html.match(/https?:\/\/(?:www\.)?movix\.fun\/[^"]+/);
  if (m) return m[0];
  return null;
}
function normalizeMovixUrl(href) {
  if (!href || typeof href !== 'string') return null;
  let url = href.trim();
  if (!url || url === '#') return null;
  if (url.startsWith('//')) url = 'https:' + url;
  if (url.startsWith('/')) url = 'https://movix.fun' + url;
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('movix.fun')) return parsed.href;
  } catch (err) {}
  return null;
}
function normalizePureStreamUrl(href) {
  if (!href || typeof href !== 'string') return null;
  let url = href.trim();
  if (!url || url === '#') return null;
  if (url.startsWith('//')) url = 'https:' + url;
  if (url.startsWith('/')) url = 'https://purestream.onl' + url;
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('purestream.onl')) return parsed.href;
  } catch (err) {}
  return null;
}
function extractPureStreamCandidateUrl(html) {
  if (!html || typeof html !== 'string') return null;
  const $ = cheerio.load(html);
  const candidates = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const normalized = normalizePureStreamUrl(href);
    if (!normalized) return;
    const lower = normalized.toLowerCase();
    if (lower.includes('/search') || lower.includes('/login') || lower.includes('/register') || lower.includes('/profile') || lower.includes('/auth')) return;
    if (lower.includes('/movie/') || lower.includes('/tv/') || lower.includes('/watch/')) {
      candidates.push(normalized);
    }
  });
  if (candidates.length) return Array.from(new Set(candidates))[0];
  const m = html.match(/https?:\/\/(?:www\.)?purestream\.onl\/(?:movie|tv|watch)[^\s"'>]+/i);
  if (m) return m[0];
  const generic = html.match(/https?:\/\/(?:www\.)?purestream\.onl\/[^\s"'>]+/i);
  return generic ? generic[0] : null;
}
async function findPureStreamCandidate(searchTerm) {
  const candidateUrls = [
    `https://purestream.onl/?s=${encodeURIComponent(searchTerm)}`,
    `https://purestream.onl/search?q=${encodeURIComponent(searchTerm)}`,
  ];
  for (const candidateUrl of candidateUrls) {
    try {
      const response = await axios.get(candidateUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept-Language': 'fr-FR,fr;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 20000
      });
      const html = response.data || '';
      const candidate = extractPureStreamCandidateUrl(html);
      if (candidate) return candidate;
    } catch (err) {
      console.warn('PureStream search failed for', candidateUrl, err && err.message ? err.message : err);
    }
  }
  return null;
}
function extractMovixCandidateUrl(html) {
  if (!html || typeof html !== 'string') return null;
  const $ = cheerio.load(html);
  const candidates = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const normalized = normalizeMovixUrl(href);
    if (!normalized) return;
    const lower = normalized.toLowerCase();
    if (lower.includes('movix.png') || lower.includes('/search') || lower.includes('/login') || lower.includes('/register')) return;
    if (lower.includes('/watch/') || lower.includes('/movie/') || lower.includes('/video/') || lower.includes('/series/')) {
      candidates.push(normalized);
    }
  });
  if (candidates.length) return Array.from(new Set(candidates))[0];
  const m = html.match(/https?:\/\/(?:www\.)?movix\.fun\/(?:watch|movie|video|series)[^\s"'>]+/i);
  if (m) return m[0];
  const generic = html.match(/https?:\/\/(?:www\.)?movix\.fun\/[^\s"'>]+/i);
  return generic ? generic[0] : null;
}
async function renderAndExtractVideo(url, timeout = 20000) {
  let browser;
  try {
    browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(2500).catch(() => {});
    const extracted = await page.evaluate(() => {
      const seen = new Set();
      const pick = (value) => {
        if (!value || typeof value !== 'string') return null;
        const trim = value.trim();
        if (!trim || seen.has(trim)) return null;
        seen.add(trim);
        return trim;
      };
      const candidates = [];
      const video = document.querySelector('video');
      if (video) {
        candidates.push(pick(video.currentSrc));
        const src = video.getAttribute('src') || (video.querySelector('source') && video.querySelector('source').getAttribute('src'));
        candidates.push(pick(src));
      }
      const iframes = Array.from(document.querySelectorAll('iframe'));
      for (const f of iframes) {
        candidates.push(pick(f.getAttribute('src')));
        candidates.push(pick(f.getAttribute('data-src')));
      }
      const dataAttrs = document.querySelectorAll('[data-src],[data-video],[data-embed],[data-player],[src]');
      for (const el of dataAttrs) {
        for (const attr of ['data-src', 'data-video', 'data-embed', 'data-player', 'src']) {
          candidates.push(pick(el.getAttribute(attr)));
        }
      }
      const allScripts = Array.from(document.scripts).map((s) => s.textContent || '').join('\n');
      const patterns = [
        /(https?:\/\/[^"']+\.(?:mp4|m3u8|m3u|mkv|webm)(?:\?[^"'\s>]*)?)/i,
        /(https?:\/\/[^"']+\/embed[^"'\s>]*)/i,
        /(https?:\/\/[^"']+\/player[^"'\s>]*)/i,
      ];
      for (const pattern of patterns) {
        const m = allScripts.match(pattern);
        if (m && m[1]) candidates.push(pick(m[1]));
      }
      for (const candidate of candidates) {
        if (candidate) {
          const lower = candidate.toLowerCase();
          if (lower.includes('.mp4') || lower.includes('.m3u8') || lower.includes('.m3u') || lower.includes('.webm') || lower.includes('/embed') || lower.includes('/player') || lower.includes('youtube.com') || lower.includes('vimeo.com') || lower.includes('vidyard.com') || lower.includes('vidsrc') || lower.includes('stream') || lower.includes('iframe')) {
            return candidate;
          }
        }
      }
      return null;
    });
    await browser.close();
    if (!extracted) return null;
    if (extracted.startsWith('//')) return 'https:' + extracted;
    if (extracted.startsWith('/')) return new URL(url).origin + extracted;
    return extracted;
  } catch (err) {
    if (browser) try { await browser.close(); } catch (e) {}
    console.error('renderAndExtractVideo error:', err && err.message ? err.message : err);
    return null;
  }
}
app.post('/api/import-movix', async (req, res) => {
  const { url } = req.body || {};
  if (!url || !url.toString().trim()) return res.status(400).json({ success: false, error: 'URL manquante' });
  try {
    const parsed = new URL(url);
    if (!/movix\.fun$/i.test(parsed.hostname) && !/movix\.fun$/i.test(parsed.hostname.replace(/^www\./, ''))) {
    }
    if (parsed.pathname.startsWith('/watch/')) {
      const video = await renderAndExtractVideo(url);
      return res.json({ success: true, type: 'watch', url, video });
    }
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    const watchLinks = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const links = anchors.map(a => a.href).filter(h => h && h.includes('/watch/'));
      return Array.from(new Set(links));
    });
    await browser.close();
    const episodes = [];
    for (const link of watchLinks) {
      try {
        const p = new URL(link).pathname;
        const sMatch = p.match(/\/s\/(\d+)/i);
        const eMatch = p.match(/\/e\/(\d+)/i);
        const seasonNum = sMatch ? Number(sMatch[1]) : null;
        const episodeNum = eMatch ? Number(eMatch[1]) : null;
        const title = null; // could be extracted later if needed
        const video = await renderAndExtractVideo(link);
        episodes.push({ watchUrl: link, season: seasonNum, episode: episodeNum, video });
      } catch (err) {
        console.error('error extracting for', link, err && err.message ? err.message : err);
      }
    }
    const seasonsMap = new Map();
    for (const ep of episodes) {
      const s = ep.season || 1;
      if (!seasonsMap.has(s)) seasonsMap.set(s, { id: `saison_${s}`, numero: s, episodes: [] });
      seasonsMap.get(s).episodes.push({ id: `episode_${s}_${ep.episode || 0}`, numero: ep.episode || 0, titre: ep.title || '', videoUrl: ep.video || '' , watchUrl: ep.watchUrl });
    }
    const seasons = Array.from(seasonsMap.values()).map(s => {
      s.episodes.sort((a,b) => a.numero - b.numero);
      return s;
    }).sort((a,b) => a.numero - b.numero);
    return res.json({ success: true, type: 'series', url, seasons, rawEpisodeCount: episodes.length });
  } catch (err) {
    console.error('import-movix error:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, error: 'Erreur lors de l�import depuis Movix' });
  }
});



