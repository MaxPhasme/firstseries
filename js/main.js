// main.js
// Recherche en direct dans le catalogue de séries (index.html)

document.addEventListener("DOMContentLoaded", () => {
  const searchBar = document.getElementById("search-bar");
  if (!searchBar) return;

  searchBar.addEventListener("input", (e) => {
    const terme = e.target.value.toLowerCase();
    if (window.appliquerRechercheCatalogue) {
      window.appliquerRechercheCatalogue(terme);
      return;
    }

    const cartes = document.querySelectorAll(".video-card");
    cartes.forEach((carte) => {
      const titre = carte.querySelector("h3").textContent.toLowerCase();
      carte.style.display = titre.includes(terme) ? "" : "none";
    });
  });
});


// Raccourci clavier moderne : Ctrl/Cmd + K pour accéder rapidement à la recherche.
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    const searchBar = document.getElementById("search-bar");
    if (searchBar) {
      searchBar.focus();
      searchBar.select();
    }
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const shortcut = document.querySelector(".search-shortcut");
  const searchBar = document.getElementById("search-bar");
  if (shortcut && searchBar) {
    shortcut.addEventListener("click", () => {
      searchBar.focus();
      searchBar.select();
    });
  }
});
