// migrate.js
// Pousse le contenu de data/db.json vers Firestore, dans le document content/app.
// À lancer UNE SEULE FOIS, une fois que firebase-service-account.json contient ta vraie clé.
//
// Utilisation :
//   node migrate.js

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const DB_FILE = path.join(__dirname, "data", "db.json");
const SERVICE_ACCOUNT_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT || path.join(__dirname, "firebase-service-account.json");

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

  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error(
      "firebase-service-account.json introuvable. Place ta vraie clé de service Firebase à la racine du projet."
    );
  }
  const sa = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
  if (!sa.private_key) {
    throw new Error(
      "firebase-service-account.json ne contient pas de vraie clé (private_key manquant). Regénère-la depuis la console Firebase."
    );
  }
  return sa;
}

async function migrer() {
  console.log("Lecture de data/db.json...");
  if (!fs.existsSync(DB_FILE)) {
    throw new Error("data/db.json introuvable.");
  }
  const donnees = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  const series = Array.isArray(donnees.series) ? donnees.series : [];
  const commentaires = Array.isArray(donnees.commentaires) ? donnees.commentaires : [];

  console.log(`Trouvé : ${series.length} série(s), ${commentaires.length} commentaire(s).`);

  const serviceAccount = chargerServiceAccount();
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) });
  }
  const db = getFirestore();

  console.log("Envoi vers Firestore (collection 'content', document 'app')...");
  await db.collection("content").doc("app").set({ series, commentaires });

  console.log("✅ Migration terminée avec succès.");
  console.log(`   ${series.length} série(s) et ${commentaires.length} commentaire(s) sont maintenant sur Firestore.`);
  console.log("   Tu peux vérifier dans la console Firebase > Firestore Database > content > app.");
}

migrer().catch((erreur) => {
  console.error("❌ Échec de la migration :", erreur.message);
  process.exit(1);
});
