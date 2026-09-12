// MAKTABA — PAGE BIBLIOTHÈQUE (chargement Supabase + Recherche + Filtres)


document.addEventListener("DOMContentLoaded", async () => {
    let champRecherche = document.getElementById("champ-recherche");
    let boutonsCategories = document.querySelectorAll("#filtres-categories .bouton-filtre");
    let boutonsLangues = document.querySelectorAll("#filtres-langues .bouton-filtre");
    let grilleCatalogue = document.getElementById("grille-catalogue");
    let texteCompteur = document.getElementById("nombre-resultats");
    let messageVide = document.getElementById("message-vide");
    let messageChargement = document.getElementById("message-chargement");

    let categorieActive = "tous";
    let langueActive = "tous";
    let rechercheActive = "";

    function filtrerLivres() {
        let cartesLivres = grilleCatalogue.querySelectorAll(".carte-livre");
        let nombreResultats = 0;

        cartesLivres.forEach(carte => {
            let categoriesLivre = (carte.getAttribute("data-categories") || "").split(",").filter(Boolean);
            let langueLivre = carte.getAttribute("data-langue") || "";
            let texteCarte = carte.textContent.toLowerCase();

            let matchCategorie = (categorieActive === "tous") || categoriesLivre.includes(categorieActive);
            let matchLangue = (langueActive === "tous") || langueLivre.includes(langueActive);
            let matchRecherche = texteCarte.includes(rechercheActive);

            if (matchCategorie && matchLangue && matchRecherche) {
                carte.style.display = "flex";
                nombreResultats++;
            } else {
                carte.style.display = "none";
            }
        });

        if (texteCompteur) texteCompteur.textContent = nombreResultats;

        if (messageVide) {
            if (nombreResultats === 0) {
                messageVide.removeAttribute("hidden");
            } else {
                messageVide.setAttribute("hidden", "true");
            }
        }
    }

    if (champRecherche) {
        champRecherche.addEventListener("input", (e) => {
            rechercheActive = e.target.value.toLowerCase().trim();
            filtrerLivres();
        });
    }

    boutonsCategories.forEach(bouton => {
        bouton.addEventListener("click", () => {
            boutonsCategories.forEach(btn => btn.classList.remove("actif"));
            bouton.classList.add("actif");
            categorieActive = bouton.getAttribute("data-filtre");
            filtrerLivres();
        });
    });

    boutonsLangues.forEach(bouton => {
        bouton.addEventListener("click", () => {
            boutonsLangues.forEach(btn => btn.classList.remove("actif"));
            bouton.classList.add("actif");
            langueActive = bouton.getAttribute("data-filtre");
            filtrerLivres();
        });
    });

// CHARGEMENT DES LIVRES DEPUIS SUPABASE

    if (!grilleCatalogue) return;

    let livres = await chargerLivres();

    if (messageChargement) messageChargement.setAttribute("hidden", "true");

    if (!livres.length) {
        grilleCatalogue.innerHTML = "";
        if (messageVide) {
            messageVide.querySelector("p").textContent =
                "Aucun ouvrage n'est encore disponible dans le catalogue.";
            messageVide.removeAttribute("hidden");
        }
        if (texteCompteur) texteCompteur.textContent = "0";
        return;
    }

    grilleCatalogue.innerHTML = livres.map(maktabaCarteLivreHTML).join("");

    let parametres = new URLSearchParams(window.location.search);
    let categorieUrl = parametres.get("categorie");

    if (categorieUrl) {
        let boutonTrouve = null;
        boutonsCategories.forEach(bouton => {
            if (bouton.getAttribute("data-filtre") === categorieUrl.toLowerCase()) {
                boutonTrouve = bouton;
            }
        });

        if (boutonTrouve) {
            boutonsCategories.forEach(btn => btn.classList.remove("actif"));
            boutonTrouve.classList.add("actif");
            categorieActive = categorieUrl.toLowerCase();

            setTimeout(() => {
                let zoneOutils = document.querySelector(".section-outils-bibliotheque");
                if (zoneOutils) zoneOutils.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 100);
        }
    }

    if (parametres.get("focus") === "true" && champRecherche) {
        champRecherche.focus();
    }

    filtrerLivres();
});
