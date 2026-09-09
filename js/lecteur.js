// ==========================================================================
// MAKTABA — LECTEUR PDF INTÉGRÉ (via ?slug=...)
// ==========================================================================

// POLYFILL MOBILE : Correctif pour Safari / WebKit mobile
if (typeof Map.prototype.getOrInsertComputed !== "function") {
    Map.prototype.getOrInsertComputed = function(key, computeFn) {
        if (this.has(key)) {
            return this.get(key);
        }
        const value = computeFn(key);
        this.set(key, value);
        return value;
    };
}

const PDFJS_BASE = (() => {
    let urlScript = document.currentScript ? document.currentScript.src : null;
    return urlScript
        ? new URL("vendor/pdfjs/", urlScript).href
        : new URL("vendor/pdfjs/", window.location.href).href;
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
    let lienSecoursNatif = document.getElementById("lien-pdf-natif");

    function afficherMessage(texte) {
        if (chargementLecteur) chargementLecteur.classList.add("etat-erreur");
        if (messageChargement) messageChargement.textContent = texte;
        if (messageChargement) messageChargement.hidden = false;
        if (canvas) canvas.hidden = true;
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

    let session = null;
    try {
        const { data } = await supabaseClient.auth.getSession();
        session = data.session;
    } catch (erreur) {
        console.error("Maktaba : erreur de récupération de session.", erreur);
    }
    let utilisateurId = session ? session.user.id : null;

    if (!fichierPdf.est_public && !utilisateurId) {
        if (messageChargement) {
            messageChargement.innerHTML =
                `Vous devez être connecté pour lire cet ouvrage. <a href="connexion.html">Se connecter</a>`;
            messageChargement.hidden = false;
        }
        return;
    }

    let urlFichier = await obtenirUrlFichier(fichierPdf);
    if (!urlFichier) {
        afficherMessage("Impossible de charger le fichier. Réessayez plus tard.");
        return;
    }

    // Configurer le lien de secours pour mobile
    if (lienSecoursNatif) {
        lienSecoursNatif.href = urlFichier;
    }

    const estMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    let pdfjsLib;
    try {
        pdfjsLib = await import(`${PDFJS_BASE}pdf.mjs`);
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}pdf.worker.mjs`;

        // Désactiver les warnings de polices Safari
        const warnOriginal = console.warn;
        console.warn = function(...args) {
            const message = args[0]?.toString() || '';
            if (message.includes('Cannot load system font') || message.includes('Font extra bytes') || message.includes('cmap')) {
                return;
            }
            warnOriginal.apply(console, args);
        };
    } catch (erreur) {
        console.error("Maktaba : erreur de chargement de PDF.js.", erreur);
        afficherMessage("Le lecteur n'a pas pu se charger. Vérifiez votre connexion.");
        return;
    }

    let document_;
    try {
        if (messageChargement) messageChargement.textContent = "Téléchargement du document...";

        // Récupération directe sous forme de buffer pour contourner les erreurs d'encodage Safari
        let reponse = await fetch(urlFichier);
        if (!reponse.ok) throw new Error("Échec du téléchargement.");
        let dataBuffer = await reponse.arrayBuffer();

        // Encodage strict avec fallback CDN pour les cmaps si le serveur local bloque les MIME types binaires
        let optionsChargement = {
            data: dataBuffer,
            cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/",
            cMapPacked: true,
            standardFontDataUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/",
            isEvalSupported: false,
            useSystemFonts: true,
            disableFontFace: false
        };

        let tacheChargement = pdfjsLib.getDocument(optionsChargement);
        document_ = await tacheChargement.promise;
    } catch (erreur) {
        console.error("Maktaba : erreur d'ouverture du PDF.", erreur);
        afficherMessage("Ce fichier présente un format ou un encodage non supporté directement.");
        return;
    }

    let nbPages = document_.numPages;
    let pageActuelle = 1;
    let echelle = 1.0;
    let echelleBase = 1.0;
    let echelleInitialisee = false;
    const ECHELLE_MIN = 0.5;
    const ECHELLE_MAX = 3.0;

    if (utilisateurId) {
        let progression = await chargerProgression(livre.id, utilisateurId);
        if (progression && progression.page_actuelle > 0 && progression.page_actuelle <= nbPages) {
            pageActuelle = progression.page_actuelle;
        }
    }

    if (nombreTotalPages) nombreTotalPages.textContent = nbPages;
    if (champPage) champPage.max = nbPages;

    let contexte = canvas.getContext("2d", { willReadFrequently: false });
    let tacheRenduEnCours = null;

    async function afficherPage(numero) {
        if (numero < 1 || numero > nbPages) return;

        if (tacheRenduEnCours) {
            try {
                tacheRenduEnCours.cancel();
            } catch (e) {}
            tacheRenduEnCours = null;
        }

        try {
            let page = await document_.getPage(numero);

            let zoneCanvas = document.getElementById("zone-canvas");
            let largeurDisponible = zoneCanvas ? zoneCanvas.clientWidth - 20 : window.innerWidth - 20;

            if (!echelleInitialisee) {
                let viewportBrut = page.getViewport({ scale: 1.0 });
                if (largeurDisponible > 0) {
                    echelle = Math.min(ECHELLE_MAX, Math.max(ECHELLE_MIN, largeurDisponible / viewportBrut.width));
                    echelleBase = echelle;
                }
                echelleInitialisee = true;
            }

            // Ratio de résolution ajusté pour éviter la saturation mémoire WebKit sur mobile
            let pixelRatio = estMobile ? 1.5 : (window.devicePixelRatio || 1.0);
            let viewport = page.getViewport({ scale: echelle * pixelRatio });

            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);

            canvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
            canvas.style.height = `${Math.floor(viewport.height / pixelRatio)}px`;

            let optionsRendu = {
                canvasContext: contexte,
                viewport: viewport
            };

            tacheRenduEnCours = page.render(optionsRendu);
            await tacheRenduEnCours.promise;
            tacheRenduEnCours = null;

            if (chargementLecteur) chargementLecteur.hidden = true;
            if (canvas) canvas.hidden = false;
        } catch (erreur) {
            if (erreur?.name === 'RenderingCancelledException') {
                return;
            }

            console.error(`Maktaba : erreur de rendu de la page ${numero}.`, erreur);
            if (canvas) canvas.hidden = true;
            if (chargementLecteur) {
                chargementLecteur.classList.add("etat-erreur");
                chargementLecteur.hidden = false;
            }
            if (messageChargement) {
                messageChargement.textContent = `Cette page (${numero}) présente un problème d'affichage sur ce navigateur.`;
            }
        }

        pageActuelle = numero;
        if (champPage) champPage.value = numero;

        if (utilisateurId) {
            enregistrerProgression(livre.id, utilisateurId, numero, nbPages);
        }
    }

    if (boutonPrecedent) boutonPrecedent.addEventListener("click", () => afficherPage(pageActuelle - 1));
    if (boutonSuivant) boutonSuivant.addEventListener("click", () => afficherPage(pageActuelle + 1));
    if (champPage) {
        champPage.addEventListener("change", () => {
            let cible = parseInt(champPage.value, 10);
            if (cible >= 1 && cible <= nbPages) {
                afficherPage(cible);
            } else {
                champPage.value = pageActuelle;
            }
        });
    }

    function mettreAJourZoom() {
        if (pourcentageZoom) pourcentageZoom.textContent = `${Math.round((echelle / echelleBase) * 100)}%`;
        afficherPage(pageActuelle);
    }
    if (boutonZoomMoins) {
        boutonZoomMoins.addEventListener("click", () => {
            echelle = Math.max(ECHELLE_MIN, +(echelle - 0.2).toFixed(2));
            mettreAJourZoom();
        });
    }
    if (boutonZoomPlus) {
        boutonZoomPlus.addEventListener("click", () => {
            echelle = Math.min(ECHELLE_MAX, +(echelle + 0.2).toFixed(2));
            mettreAJourZoom();
        });
    }

    document.addEventListener("keydown", (e) => {
        if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
        if (e.key === "ArrowRight") afficherPage(pageActuelle + 1);
        if (e.key === "ArrowLeft") afficherPage(pageActuelle - 1);
    });

    if (boutonBasculerSommaire && sommaireLecteur) {
        boutonBasculerSommaire.addEventListener("click", () => {
            sommaireLecteur.classList.toggle("sommaire-ouvert");
        });
    }

    try {
        let plan = await document_.getOutline();
        if (plan && plan.length && listeSommaire) {
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