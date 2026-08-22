
const FIREBASE_SDK_VERSION = "10.13.2";

function fsChargerScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Impossible de charger ${src}`));
    document.head.appendChild(script);
  });
}

let firebasePromise = null;

function initFirebase() {
  if (firebasePromise) return firebasePromise;

  firebasePromise = (async () => {
    await fsChargerScript(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js`);
    await Promise.all([
      fsChargerScript(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth-compat.js`),
      fsChargerScript(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore-compat.js`),
    ]);

    const reponse = await fetch("/api/firebase-config");
    if (!reponse.ok) throw new Error("Configuration Firebase indisponible");
    const config = await reponse.json();

    if (!window.firebase.apps.length) {
      window.firebase.initializeApp(config);
    }

    return {
      auth: window.firebase.auth(),
      db: window.firebase.firestore(),
    };
  })();

  return firebasePromise;
}

window.initFirebase = initFirebase;
