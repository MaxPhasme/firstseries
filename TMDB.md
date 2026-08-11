# Intégration TMDB

## Configuration

Ajoute dans les variables d'environnement de Render (ou dans `.env` en local) :

`TMDB_API_TOKEN=...`

Il s'agit du **API Read Access Token** fourni par TMDB.

## Utilisation

Dans `/admin.html` :
1. connecte-toi à l'administration ;
2. ouvre **Importer depuis TMDB** ;
3. cherche un film ou une série ;
4. clique sur **Importer**.

L'import crée automatiquement :
- titre français si disponible ;
- synopsis ;
- genres ;
- affiche et miniature TMDB ;
- `tmdbId` et `tmdbType` ;
- pour une série, toutes les saisons et tous les épisodes connus par TMDB ;
- les identifiants TMDB des épisodes.

### Important

TMDB fournit des **métadonnées**, pas les fichiers vidéo. Le système n'utilise donc pas TMDB pour fournir les vidéos. Les champs `videoUrl`/`sources` restent destinés à tes sources vidéo autorisées (tes fichiers, ton CDN ou un fournisseur sous licence).

L'API TMDB est appelée uniquement depuis le serveur : le token n'est jamais envoyé au navigateur.
