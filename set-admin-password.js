// set-admin-password.js
// Définit (ou change) le mot de passe admin, stocké de façon sécurisée
// (hashé + salé, jamais en clair) dans Firestore : collection "admin", document "config".
//
// Utilisation :
//   node set-admin-password.js "MonNouveauMotDePasse"

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const SERVICE_ACCOUNT_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT || path.join(__dirname, "firebase-service-account.json");

function chargerServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error("firebase-service-account.json introuvable à la racine du projet.");
  }
  const sa = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
  if (!sa.private_key) {
    throw new Error("firebase-service-account.json ne contient pas de vraie clé (private_key manquant).");
  }
  return sa;
}

async function definirMotDePasse() {
  const motDePasse = process.argv[2];
  if (!motDePasse) {
    console.error("Utilisation : node set-admin-password.js \"MonMotDePasse\"");
    process.exit(1);
  }
  if (motDePasse.length < 8) {
    console.error("❌ Choisis un mot de passe d'au moins 8 caractères.");
    process.exit(1);
  }

  const serviceAccount = chargerServiceAccount();
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) });
  }
  const db = getFirestore();

  const sel = crypto.randomBytes(16);
  const hash = crypto.scryptSync(motDePasse, sel, 64);

  await db.collection("admin").doc("config").set({
    hash: hash.toString("hex"),
    sel: sel.toString("hex"),
    misAJourLe: new Date().toISOString(),
  });

  console.log("✅ Mot de passe admin enregistré dans Firestore (collection 'admin', document 'config').");
  console.log("   Le mot de passe en clair n'est stocké nulle part — seul son hash l'est.");
}

definirMotDePasse().catch((erreur) => {
  console.error("❌ Échec :", erreur.message);
  process.exit(1);
});
