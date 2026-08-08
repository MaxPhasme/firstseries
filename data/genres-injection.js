const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'db.json');
const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const genreMapping = {
  'Game of Thrones': ['Action', 'Aventure', 'Drame', 'Fantastique'],
  'Stranger Things': ['Science-Fiction', 'Horreur', 'Drame'],
  'Wednesday': ['Fantastique', 'Comédie', 'Policier'],
  'The Boys': ['Action', 'Drame', 'Policier'],
  'The Witcher': ['Fantastique', 'Action', 'Drame'],
  'House of the Dragon': ['Aventure', 'Drame', 'Fantastique'],
  'Squid Game': ['Thriller', 'Drame', 'Policier'],
  'Euphoria': ['Drame'],
  'Cobra Kai': ['Action', 'Comédie', 'Drame'],
  'You': ['Thriller', 'Drame', 'Policier'],
  'Reacher': ['Action', 'Policier', 'Drame'],
};

const updated = data.series.map((serie) => {
  if (!Array.isArray(serie.genres) || serie.genres.length === 0) {
    return {
      ...serie,
      genres: genreMapping[serie.titre] || ['Drame'],
    };
  }
  return serie;
});

fs.writeFileSync(dbPath, JSON.stringify({ ...data, series: updated }, null, 2));
console.log('Genres injected for', updated.length, 'series.');
