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
