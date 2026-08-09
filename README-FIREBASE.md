# Authentification FirstSeries avec Firebase

Le projet utilise **Firebase Authentication** pour protéger le site.

### Fonctionnement
- `index.html` = page de connexion / création de compte.
- `app.html` = ancien accueil du site, accessible uniquement après connexion.
- `serie.html` et `video.html` vérifient aussi la session Firebase.
- La session utilise `Persistence.LOCAL` : l'utilisateur reste connecté après avoir quitté le site ou fermé le navigateur.
- Déconnexion disponible depuis le menu du compte sur l'accueil.
- Connexion email/mot de passe, création de compte, mot de passe oublié et Google sont prévus.

### Variables Render
Ajoute ces variables dans Render :

```text
FIREBASE_WEB_API_KEY=ta_cle_api_web_firebase
FIREBASE_PROJECT_ID=firstseries
FIREBASE_AUTH_DOMAIN=firstseries.firebaseapp.com
```

`FIREBASE_WEB_API_KEY` est la clé **Web** de ton application Firebase (pas la clé privée du service account). `FIREBASE_PROJECT_ID` peut déjà être récupéré depuis le service account, mais il est recommandé de le définir explicitement.

Les variables `FIREBASE_SERVICE_ACCOUNT` ou `FIREBASE_SERVICE_ACCOUNT_BASE64` déjà utilisées par le serveur restent nécessaires pour Firestore.

### Dans Firebase Console
Dans **Authentication > Sign-in method**, active :
1. Email/Password
2. Google (si tu veux le bouton « Continuer avec Google »)

Ajoute également le domaine de ton site Render dans les domaines autorisés Firebase Authentication.
