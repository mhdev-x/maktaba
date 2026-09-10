// ==========================================================================
// MAKTABA — SCRIPT GLOBAL (app.js)
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {

    // 1. MENU BURGER MOBILE
    let boutonMenu = document.querySelector(".bouton-menu");
    let liensNavigation = document.querySelector(".liens-navigation");

    if (boutonMenu && liensNavigation) {
        boutonMenu.addEventListener("click", () => {
            let menuOuvert = liensNavigation.classList.toggle("menu-ouvert");
            boutonMenu.setAttribute("aria-expanded", menuOuvert);

            if (menuOuvert) {
                boutonMenu.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
                boutonMenu.setAttribute("aria-label", "Fermer le menu");
            } else {
                boutonMenu.innerHTML = `<i class="fa-solid fa-bars"></i>`;
                boutonMenu.setAttribute("aria-label", "Ouvrir le menu");
            }
        });
    }

    // 2. GESTION DU THÈME (DARK / LIGHT MODE)
    let boutonsTheme = document.querySelectorAll(".bascule-theme");
    let body = document.body;
    let themeSauvegarde = localStorage.getItem("maktaba-theme");

    function mettreAJourIcones(themeActuel) {
        boutonsTheme.forEach(bouton => {
            let icone = bouton.querySelector("i");
            if (icone) {
                if (themeActuel === "clair") {
                    icone.classList.remove("fa-moon");
                    icone.classList.add("fa-sun");
                } else {
                    icone.classList.remove("fa-sun");
                    icone.classList.add("fa-moon");
                }
            }
        });
    }

    if (themeSauvegarde === "clair") {
        body.classList.add("theme-clair");
        mettreAJourIcones("clair");
    }

    boutonsTheme.forEach(bouton => {
        bouton.addEventListener("click", () => {
            body.classList.toggle("theme-clair");
            let estClair = body.classList.contains("theme-clair");
            localStorage.setItem("maktaba-theme", estClair ? "clair" : "sombre");
            mettreAJourIcones(estClair ? "clair" : "sombre");
        });
    });

    // 3. REDIRECTION BOUTON RECHERCHE NAVBAR
    let boutonsRecherche = document.querySelectorAll(".btn-ouvrir-recherche");

    boutonsRecherche.forEach(bouton => {
        bouton.addEventListener("click", () => {
            let inPagesFolder = window.location.pathname.includes('/pages/');
            let destination = inPagesFolder ? "livres.html?focus=true" : "pages/livres.html?focus=true";
            window.location.href = destination;
        });
    });

    // ==========================================
    // 4. 🔐 GESTION DE L'ÉTAT DE CONNEXION (NAVBAR)
    // ==========================================
    let inPagesFolder = window.location.pathname.includes('/pages/');
    let cheminConnexion = inPagesFolder ? "connexion.html" : "pages/connexion.html";
    let cheminProfil = inPagesFolder ? "profil.html" : "pages/profil.html";

    // Éléments desktop
    let menuCompte = document.getElementById("menu-compte");
    let boutonCompte = document.getElementById("bouton-compte");
    let dropdownCompte = document.getElementById("dropdown-compte");
    let lienMonProfil = document.getElementById("lien-mon-profil");
    let boutonDeconnexion = document.getElementById("bouton-deconnexion");

    // Élément mobile
    let compteMobile = document.getElementById("compte-mobile");

    async function gererEtatConnexion() {
        if (typeof supabaseClient === "undefined" || !supabaseClient) return;

        let utilisateurConnecte = null;
        try {
            const { data, error } = await supabaseClient.auth.getSession();
            if (error) throw error;
            utilisateurConnecte = data.session ? data.session.user : null;
        } catch (erreur) {
            // Pas de session récupérable (réseau, token invalide, etc.) :
            // on affiche simplement l'état "déconnecté" plutôt que de casser la page.
            console.error("Maktaba : impossible de récupérer la session.", erreur);
        }

        if (utilisateurConnecte) {
            let nomComplet = utilisateurConnecte.user_metadata?.nom_complet || "Mon profil";
            let premierPrenom = nomComplet.split(" ")[0];

            // --- Desktop ---
            if (boutonCompte) {
                boutonCompte.innerHTML = `
                    <i class="fa-solid fa-circle-user"></i>
                    <span>${premierPrenom}</span>
                `;
                boutonCompte.classList.add("bouton-connecte");
            }
            if (lienMonProfil) {
                lienMonProfil.setAttribute("href", cheminProfil);
            }

            // --- Mobile ---
            if (compteMobile) {
                compteMobile.innerHTML = `
                    <a href="${cheminProfil}" class="bouton-connexion bouton-connecte">
                        <i class="fa-solid fa-circle-user"></i>
                        <span>${premierPrenom}</span>
                    </a>
                    <button class="bouton-connexion" type="button" id="bouton-deconnexion-mobile">
                        <i class="fa-solid fa-arrow-right-from-bracket"></i>
                        <span>Déconnexion</span>
                    </button>
                `;

                let boutonDeconnexionMobile = document.getElementById("bouton-deconnexion-mobile");
                if (boutonDeconnexionMobile) {
                    boutonDeconnexionMobile.addEventListener("click", deconnecterUtilisateur);
                }
            }

        } else {
            // --- Desktop : état déconnecté ---
            if (boutonCompte) {
                boutonCompte.innerHTML = `
                    <i class="fa-solid fa-user"></i>
                    <span>Connexion</span>
                `;
                boutonCompte.classList.remove("bouton-connecte");
            }

            // --- Mobile : état déconnecté ---
            if (compteMobile) {
                compteMobile.innerHTML = `
                    <a href="${cheminConnexion}" class="bouton-connexion" id="bouton-compte-mobile">
                        <i class="fa-solid fa-user"></i>
                        <span>Connexion</span>
                    </a>
                `;
            }
        }
    }

    // ==========================================
    // 5. 🖱️ OUVERTURE / FERMETURE DU DROPDOWN (DESKTOP)
    // ==========================================
    if (boutonCompte && dropdownCompte) {
        boutonCompte.addEventListener("click", async (e) => {
            if (!supabaseClient) {
                window.location.href = cheminConnexion;
                return;
            }

            let session = null;
            try {
                const { data } = await supabaseClient.auth.getSession();
                session = data.session;
            } catch (erreur) {
                console.error("Maktaba : erreur lors de la vérification de session.", erreur);
            }

            // Si non connecté : le bouton agit comme un simple lien vers connexion.html
            if (!session) {
                window.location.href = cheminConnexion;
                return;
            }

            // Si connecté : on ouvre/ferme le menu déroulant
            let estOuvert = !dropdownCompte.hidden;
            dropdownCompte.hidden = estOuvert;
            boutonCompte.setAttribute("aria-expanded", !estOuvert);
        });

        // Fermer le dropdown si on clique en dehors
        document.addEventListener("click", (e) => {
            if (menuCompte && !menuCompte.contains(e.target)) {
                dropdownCompte.hidden = true;
                boutonCompte.setAttribute("aria-expanded", "false");
            }
        });
    }

    // ==========================================
    // 6. 🚪 DÉCONNEXION
    // ==========================================
    async function deconnecterUtilisateur() {
        try {
            if (supabaseClient) {
                await supabaseClient.auth.signOut();
            }
        } catch (erreur) {
            console.error("Maktaba : erreur lors de la déconnexion.", erreur);
        } finally {
            window.location.href = inPagesFolder ? "../index.html" : "index.html";
        }
    }

    if (boutonDeconnexion) {
        boutonDeconnexion.addEventListener("click", deconnecterUtilisateur);
    }

    gererEtatConnexion();
});
