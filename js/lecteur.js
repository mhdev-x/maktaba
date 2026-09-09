// ==========================================================================
// MAKTABA — LECTEUR PDF INTÉGRÉ (via ?slug=...)
// PDF.js est hébergé localement (js/vendor/pdfjs/) plutôt que via un CDN
// externe : structure garantie stable (lib, worker, cmaps, polices et wasm
// viennent tous du même paquet officiel vérifié), aucune dépendance à un
// tiers pour une fonctionnalité centrale du site. Chargé en import()
// dynamique, car PDF.js n'est distribué qu'en module ES.
// ==========================================================================

// Résolu à partir de l'URL réelle de CE script, donc correct quelle que soit
// la page qui l'inclut (racine ou pages/).
const PDFJS_BASE = (() => {
    let urlScript = document.currentScript ? document.currentScript.src : null;
    return urlScript
        ? new URL("vendor/pdfjs/", urlScript).href
        : new URL("vendor/pdfjs/", window.location.href).href; // repli improbable
})();

document.addEventListener("DOMContentLoaded", async () => {
    let parametres = new URLSearchParams(window.location.search);
    let slug = parametres.get("slug");

    let messageChargement = document.getElementById("message-chargement-pdf");
    let chargementLecteur = document.getElementById("chargement-lecteur");
    let barreChargement = document.getElementById("barre-chargement-pdf");
    let canvas = document.getElementById("canvas-pdf");
    let titreLecteur = document.getElementById("titre-lecteur");
    let lienRetour = document.getElementById("lien-retour-livre");
    let champPage = document.getElementById("champ-page-actuelle");
    let nombreTotalPages = document.getElementById("nombre-total-pages");
    let boutonPrecedent = document.getElementById("bouton-page-precedente");
    let boutonSuivant = document.getElementById("bouton-page-suivante");
    let boutonZoomMoins = document.getElementById("bouton-zoom-moins");
    let boutonZoomPlus = document.getElementById("bouton-zoom-plus");
    let pourcentageZoom = document.getElementById("pourcentage-zoom");
    let listeSommaire = document.getElementById("liste-sommaire");
    let boutonBasculerSommaire = document.getElementById("bouton-basculer-sommaire");
    let sommaireLecteur = document.getElementById("sommaire-lecteur");

    function afficherMessage(texte) {
        if (chargementLecteur) chargementLecteur.classList.add("etat-erreur");
        messageChargement.textContent = texte;
        messageChargement.hidden = false;
        canvas.hidden = true;
    }

    if (!slug) {
        afficherMessage("Aucun livre sélectionné.");
        return;
    }
    if (lienRetour) lienRetour.setAttribute("href", `livre.html?slug=${encodeURIComponent(slug)}`);

    if (!supabaseClient) {
        afficherMessage("Service indisponible pour le moment.");
        return;
    }

    let livre = await chargerLivreParSlug(slug);
    if (!livre) {
        afficherMessage("Cet ouvrage est introuvable.");
        return;
    }
    if (titreLecteur) titreLecteur.textContent = livre.titre;
    document.title = `${livre.titre} — Lecture — Maktaba`;

    let fichierPdf = (livre.fichiers_livres || []).find(f => f.type === "pdf");
    if (!fichierPdf) {
        afficherMessage("Aucun fichier de lecture n'est disponible pour cet ouvrage.");
        return;
    }

    // --- Session (nécessaire pour un fichier protégé, et pour la progression) ---
    let session = null;
    try {
        const { data } = await supabaseClient.auth.getSession();
        session = data.session;
    } catch (erreur) {
        console.error("Maktaba : erreur de récupération de session.", erreur);
    }
    let utilisateurId = session ? session.user.id : null;

    if (!fichierPdf.est_public && !utilisateurId) {
        messageChargement.innerHTML =
            `Vous devez être connecté pour lire cet ouvrage. <a href="connexion.html">Se connecter</a>`;
        messageChargement.hidden = false;
        return;
    }

    let urlFichier = await obtenirUrlFichier(fichierPdf);
    if (!urlFichier) {
        afficherMessage("Impossible de charger le fichier. Réessayez plus tard.");
        return;
    }

    // --- Chargement de PDF.js (fichiers locaux, js/vendor/pdfjs/) ---
    let pdfjsLib;
    try {
        pdfjsLib = await import(`${PDFJS_BASE}pdf.mjs`);
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}pdf.worker.mjs`;
    } catch (erreur) {
        console.error("Maktaba : erreur de chargement de PDF.js.", erreur);
        afficherMessage(`Le lecteur n'a pas pu se charger${erreur?.message ? ` (${erreur.message})` : ""}.`);
        return;
    }

    let document_;
    try {
        let tacheChargement = pdfjsLib.getDocument({
            url: urlFichier,
            cMapUrl: `${PDFJS_BASE}cmaps/`,
            cMapPacked: true,
            standardFontDataUrl: `${PDFJS_BASE}standard_fonts/`,
            wasmUrl: `${PDFJS_BASE}wasm/`,
        });

        // Progression réelle du téléchargement, pour ne pas laisser l'utilisateur
        // face à un texte figé pendant potentiellement plusieurs secondes.
        tacheChargement.onProgress = ({ loaded, total }) => {
            if (total) {
                let pourcentage = Math.round((loaded / total) * 100);
                messageChargement.textContent = `Chargement du document... ${pourcentage}%`;
                if (barreChargement) barreChargement.style.width = `${pourcentage}%`;
            } else {
                let mo = (loaded / 1024 / 1024).toFixed(1);
                messageChargement.textContent = `Chargement du document... (${mo} Mo)`;
                if (barreChargement) barreChargement.style.width = "60%"; // taille inconnue : on avance quand même visuellement
            }
        };

        document_ = await tacheChargement.promise;
    } catch (erreur) {
        console.error("Maktaba : erreur d'ouverture du PDF.", erreur);
        afficherMessage(`Ce fichier n'a pas pu être ouvert${erreur?.message ? ` (${erreur.message})` : ""}.`);
        return;
    }

    let nbPages = document_.numPages;
    let pageActuelle = 1;
    let echelle = 1.2;
    let echelleBase = 1.2; // recalculée automatiquement au premier rendu (voir plus bas)
    let echelleInitialisee = false;
    const ECHELLE_MIN = 0.5;
    const ECHELLE_MAX = 3;

    // --- Reprise de la progression de lecture ---
    if (utilisateurId) {
        let progression = await chargerProgression(livre.id, utilisateurId);
        if (progression && progression.page_actuelle > 0 && progression.page_actuelle <= nbPages) {
            pageActuelle = progression.page_actuelle;
        }
    }

    nombreTotalPages.textContent = nbPages;
    champPage.max = nbPages;

    let contexte = canvas.getContext("2d");
    let renduEnCours = false;

    async function afficherPage(numero) {
        if (renduEnCours || numero < 1 || numero > nbPages) return;
        renduEnCours = true;

        try {
            let page = await document_.getPage(numero);

            // Au tout premier rendu, on ajuste l'échelle à la largeur réellement
            // disponible plutôt que d'utiliser une valeur fixe : une page scannée
            // en haute résolution se rend beaucoup plus vite à une échelle adaptée
            // qu'agrandie inutilement au-delà de ce qui sera affiché à l'écran.
            if (!echelleInitialisee) {
                let viewportBrut = page.getViewport({ scale: 1 });
                let largeurDisponible = document.getElementById("zone-canvas").clientWidth - 64;
                if (largeurDisponible > 0) {
                    echelle = Math.min(ECHELLE_MAX, Math.max(ECHELLE_MIN, largeurDisponible / viewportBrut.width));
                    echelleBase = echelle;
                }
                echelleInitialisee = true;
            }

            let viewport = page.getViewport({ scale: echelle });

            // Sécurité : Safari sur iPhone/iPad limite la taille d'un <canvas>
            // à environ 16 millions de pixels (contre bien plus sur ordinateur).
            // Au-delà, le rendu échoue silencieusement. On réduit l'échelle
            // automatiquement si la page (souvent un scan haute résolution)
            // dépasserait cette limite.
            const PIXELS_MAX_CANVAS = 16000000;
            if (viewport.width * viewport.height > PIXELS_MAX_CANVAS) {
                let facteurReduction = Math.sqrt(PIXELS_MAX_CANVAS / (viewport.width * viewport.height));
                echelle = +(echelle * facteurReduction).toFixed(2);
                viewport = page.getViewport({ scale: echelle });
            }

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({ canvasContext: contexte, viewport }).promise;

            chargementLecteur.hidden = true;
            canvas.hidden = false;
        } catch (erreur) {
            // Une page corrompue ou mal encodée ne doit pas bloquer la lecture
            // du reste du livre : on le signale et on laisse naviguer ailleurs.
            console.error(`Maktaba : erreur de rendu de la page ${numero}.`, erreur);
            canvas.hidden = true;
            chargementLecteur.classList.add("etat-erreur");
            chargementLecteur.hidden = false;
            let detail = erreur && erreur.message ? ` (${erreur.message})` : "";
            messageChargement.textContent = `Cette page (${numero}) n'a pas pu être affichée${detail}.`;
        }

        pageActuelle = numero;
        champPage.value = numero;
        renduEnCours = false;

        if (utilisateurId) {
            enregistrerProgression(livre.id, utilisateurId, numero, nbPages);
        }
    }

    boutonPrecedent.addEventListener("click", () => afficherPage(pageActuelle - 1));
    boutonSuivant.addEventListener("click", () => afficherPage(pageActuelle + 1));
    champPage.addEventListener("change", () => {
        let cible = parseInt(champPage.value, 10);
        if (cible >= 1 && cible <= nbPages) {
            afficherPage(cible);
        } else {
            champPage.value = pageActuelle;
        }
    });

    function mettreAJourZoom() {
        pourcentageZoom.textContent = `${Math.round((echelle / echelleBase) * 100)}%`;
        afficherPage(pageActuelle);
    }
    boutonZoomMoins.addEventListener("click", () => {
        echelle = Math.max(ECHELLE_MIN, +(echelle - 0.2).toFixed(2));
        mettreAJourZoom();
    });
    boutonZoomPlus.addEventListener("click", () => {
        echelle = Math.min(ECHELLE_MAX, +(echelle + 0.2).toFixed(2));
        mettreAJourZoom();
    });

    // Navigation au clavier (flèches gauche/droite)
    document.addEventListener("keydown", (e) => {
        if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
        if (e.key === "ArrowRight") afficherPage(pageActuelle + 1);
        if (e.key === "ArrowLeft") afficherPage(pageActuelle - 1);
    });

    // Sommaire mobile (masqué par défaut sur petit écran via CSS)
    if (boutonBasculerSommaire && sommaireLecteur) {
        boutonBasculerSommaire.addEventListener("click", () => {
            sommaireLecteur.classList.toggle("sommaire-ouvert");
        });
    }

    // --- Sommaire (si le PDF en contient un) ---
    try {
        let plan = await document_.getOutline();
        if (plan && plan.length) {
            listeSommaire.innerHTML = "";
            for (let item of plan) {
                let bouton = document.createElement("button");
                bouton.type = "button";
                bouton.className = "lien-sommaire";
                bouton.textContent = item.title;
                bouton.addEventListener("click", async () => {
                    if (!item.dest) return;
                    try {
                        let dest = typeof item.dest === "string"
                            ? await document_.getDestination(item.dest)
                            : item.dest;
                        let numeroPage = (await document_.getPageIndex(dest[0])) + 1;
                        afficherPage(numeroPage);
                    } catch (erreur) {
                        console.error("Maktaba : erreur de navigation via le sommaire.", erreur);
                    }
                });
                listeSommaire.appendChild(bouton);
            }
        }
    } catch (erreur) {
        console.error("Maktaba : erreur de chargement du sommaire.", erreur);
    }

    afficherPage(pageActuelle);
});
