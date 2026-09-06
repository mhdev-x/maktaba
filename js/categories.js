// ==========================================================================
// MAKTABA — PAGE COLLECTIONS (compteurs dynamiques par catégorie)
// ==========================================================================

document.addEventListener("DOMContentLoaded", async () => {
    let compteurs = await compterLivresParCategorie();

    document.querySelectorAll(".carte-page-collection[data-categorie]").forEach(carte => {
        let cle = carte.getAttribute("data-categorie");
        let cible = carte.querySelector(".compteur-collection");
        if (cible) {
            let nombre = compteurs[cle] || 0;
            cible.textContent = `${nombre} ouvrage${nombre > 1 ? "s" : ""}`;
        }
    });
});
