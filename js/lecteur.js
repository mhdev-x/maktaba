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

// ==========================================================================
// POLYFILLS — PDF.js 6.x utilise des méthodes JavaScript très récentes
// (Baseline seulement depuis février 2026) que certains navigateurs, dont
// Safari sur iPhone/iPad selon la version d'iOS, ne connaissent pas encore.
// Sans ça, le rendu échoue avec "getOrInsertComputed is not a function"
// (bug de compatibilité documenté sur le dépôt officiel de PDF.js, pas
// spécifique à Maktaba). On fournit une implémentation de secours pour
// que le lecteur fonctionne partout, y compris sur les navigateurs pas
// encore à jour.
// ==========================================================================
(function () {
    if (!Map.prototype.getOrInsertComputed) {
        Map.prototype.getOrInsertComputed = function (cle, callback) {
            if (this.has(cle)) return this.get(cle);
            let valeur = callback(cle);
            this.set(cle, valeur);
            return valeur;
        };
    }
    if (!Map.prototype.getOrInsert) {
        Map.prototype.getOrInsert = function (cle, valeurParDefaut) {
            if (this.has(cle)) return this.get(cle);
            this.set(cle, valeurParDefaut);
            return valeurParDefaut;
        };
    }
    if (typeof WeakMap !== "undefined") {
        if (!WeakMap.prototype.getOrInsertComputed) {
            WeakMap.prototype.getOrInsertComputed = function (cle, callback) {
                if (this.has(cle)) return this.get(cle);
                let valeur = callback(cle);
                this.set(cle, valeur);
                return valeur;
            };
        }
        if (!WeakMap.prototype.getOrInsert) {
            WeakMap.prototype.getOrInsert = function (cle, valeurParDefaut) {
                if (this.has(cle)) return this.get(cle);
                this.set(cle, valeurParDefaut);
                return valeurParDefaut;
            };
        }
    }
    if (!Promise.try) {
        Promise.try = function (fonction, ...args) {
            return new Promise((resolve, reject) => {
                try {
                    resolve(fonction(...args));
                } catch (erreur) {
                    reject(erreur);
                }
            });
        };
    }
    if (!Promise.withResolvers) {
        Promise.withResolvers = function () {
            let resolve, reject;
            let promise = new Promise((res, rej) => { resolve = res; reject = rej; });
            return { promise, resolve, reject };
        };
    }
    if (!Uint8Array.prototype.toHex) {
        Uint8Array.prototype.toHex = function () {
            return Array.from(this).map(o => o.toString(16).padStart(2, "0")).join("");
        };
    }
    if (!Uint8Array.fromHex) {
        Uint8Array.fromHex = function (hex) {
            let octets = hex.match(/.{1,2}/g) || [];
            return new Uint8Array(octets.map(o => parseInt(o, 16)));
        };
    }
    if (!URL.parse) {
        URL.parse = function (url, base) {
            try {
                return new URL(url, base);
            } catch {
                return null;
            }
        };
    }
})();

// ==========================================================================
// JOURNAL TECHNIQUE — capture les avertissements/erreurs de la console pour
// pouvoir les consulter directement sur la page (utile sur mobile, où les
// outils de développement ne sont pas accessibles facilement).
// ==========================================================================
let journalTechnique = [];
(function () {
    let avertissementOriginal = console.warn.bind(console);
    let erreurOriginale = console.error.bind(console);

    console.warn = function (...args) {
        journalTechnique.push({ type: "warn", texte: args.map(String).join(" ") });
        avertissementOriginal(...args);
    };
    console.error = function (...args) {
        journalTechnique.push({ type: "error", texte: args.map(String).join(" ") });
        erreurOriginale(...args);
    };
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
    let zoneCanvasEl = document.getElementById("zone-canvas");
    let boutonModeContinu = document.getElementById("bouton-mode-continu");
    let boutonPleinEcran = document.getElementById("bouton-plein-ecran");
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
    let modeContinu = false;
    let conteneurContinu = null;
    let observateurPagesContinu = null;
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

            // Taille d'affichage voulue (en pixels CSS)
            let viewportAffichage = page.getViewport({ scale: echelle });

            // Rendu net sur écrans haute densité (Retina, la quasi-totalité des
            // smartphones et laptops récents) : on dessine sur un canvas dont
            // la résolution réelle est supérieure à la taille affichée, sinon
            // le rendu paraît flou comparé à un lecteur PDF natif.
            let ratioPixels = Math.min(window.devicePixelRatio || 1, 2.5); // plafonné pour la mémoire
            let viewportRendu = page.getViewport({ scale: echelle * ratioPixels });

            // Sécurité : Safari sur iPhone/iPad limite la taille réelle (en
            // pixels) d'un <canvas> à environ 16 millions — on réduit l'échelle
            // si le rendu haute densité la dépasserait, plutôt que d'échouer.
            const PIXELS_MAX_CANVAS = 16000000;
            if (viewportRendu.width * viewportRendu.height > PIXELS_MAX_CANVAS) {
                let facteurReduction = Math.sqrt(PIXELS_MAX_CANVAS / (viewportRendu.width * viewportRendu.height));
                echelle = +(echelle * facteurReduction).toFixed(2);
                viewportAffichage = page.getViewport({ scale: echelle });
                viewportRendu = page.getViewport({ scale: echelle * ratioPixels });
            }

            canvas.width = Math.floor(viewportRendu.width);
            canvas.height = Math.floor(viewportRendu.height);
            canvas.style.width = `${Math.floor(viewportAffichage.width)}px`;
            canvas.style.height = `${Math.floor(viewportAffichage.height)}px`;

            await page.render({ canvasContext: contexte, viewport: viewportRendu }).promise;

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

    // --- Plein écran ---
    if (boutonPleinEcran) {
        boutonPleinEcran.addEventListener("click", () => {
            if (!document.fullscreenElement) {
                document.querySelector(".zone-lecture").requestFullscreen?.().catch(() => {});
            } else {
                document.exitFullscreen?.();
            }
        });
        document.addEventListener("fullscreenchange", () => {
            let actif = !!document.fullscreenElement;
            boutonPleinEcran.classList.toggle("actif", actif);
            boutonPleinEcran.querySelector("i").className = actif ? "fa-solid fa-compress" : "fa-solid fa-expand";
        });
    }

    // --- Gestes tactiles (mode page unique) : balayage, double-tap, pincement ---
    let toucheDepartX = null, toucheDepartY = null, toucheDepartTemps = null;
    let pincementDistanceDepart = null, pincementEchelleDepart = null, pincementFacteurCourant = 1;
    let dernierTapTemps = 0;

    function distanceEntreDoigts(touches) {
        let dx = touches[0].clientX - touches[1].clientX;
        let dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    zoneCanvasEl.addEventListener("touchstart", (e) => {
        if (modeContinu) return; // le défilement continu gère le scroll nativement
        if (e.touches.length === 2) {
            pincementDistanceDepart = distanceEntreDoigts(e.touches);
            pincementEchelleDepart = echelle;
            pincementFacteurCourant = 1;
        } else if (e.touches.length === 1) {
            toucheDepartX = e.touches[0].clientX;
            toucheDepartY = e.touches[0].clientY;
            toucheDepartTemps = Date.now();
        }
    }, { passive: true });

    zoneCanvasEl.addEventListener("touchmove", (e) => {
        if (modeContinu) return;
        if (e.touches.length === 2 && pincementDistanceDepart) {
            e.preventDefault(); // empêche le zoom natif du navigateur de prendre le dessus
            let distanceActuelle = distanceEntreDoigts(e.touches);
            pincementFacteurCourant = distanceActuelle / pincementDistanceDepart;
            // Retour visuel immédiat (peu coûteux) ; le re-rendu net se fait au relâchement
            canvas.style.transform = `scale(${pincementFacteurCourant})`;
        }
    }, { passive: false });

    zoneCanvasEl.addEventListener("touchend", (e) => {
        if (modeContinu) return;

        if (pincementDistanceDepart) {
            canvas.style.transform = "";
            let nouvelleEchelle = pincementEchelleDepart * pincementFacteurCourant;
            echelle = Math.min(ECHELLE_MAX, Math.max(ECHELLE_MIN, +nouvelleEchelle.toFixed(2)));
            pincementDistanceDepart = null;
            pincementFacteurCourant = 1;
            mettreAJourZoom();
            return;
        }

        if (toucheDepartX === null) return;
        let toucheFin = e.changedTouches[0];
        let deltaX = toucheFin.clientX - toucheDepartX;
        let deltaY = toucheFin.clientY - toucheDepartY;
        let dureeMs = Date.now() - toucheDepartTemps;
        toucheDepartX = null;

        // Tap court et immobile : possible double-tap
        if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && dureeMs < 300) {
            let maintenant = Date.now();
            if (maintenant - dernierTapTemps < 350) {
                echelle = echelle > echelleBase * 1.3 ? echelleBase : Math.min(ECHELLE_MAX, echelleBase * 1.8);
                mettreAJourZoom();
                dernierTapTemps = 0;
            } else {
                dernierTapTemps = maintenant;
            }
            return;
        }

        // Balayage horizontal net = page suivante/précédente
        if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
            if (deltaX < 0) afficherPage(pageActuelle + 1); // vers la gauche = page suivante
            else afficherPage(pageActuelle - 1);
        }
    }, { passive: true });

    // --- Mode défilement continu (alternative au mode page unique) ---
    async function rendreCanvasContinu(c, numero) {
        c.dataset.rendu = "1";
        try {
            let page = await document_.getPage(numero);
            let dpr = Math.min(window.devicePixelRatio || 1, 2.5);
            let viewportRendu = page.getViewport({ scale: echelle * dpr });
            c.width = Math.floor(viewportRendu.width);
            c.height = Math.floor(viewportRendu.height);
            await page.render({ canvasContext: c.getContext("2d"), viewport: viewportRendu }).promise;
        } catch (erreur) {
            console.error(`Maktaba : erreur de rendu (défilement continu) page ${numero}.`, erreur);
            delete c.dataset.rendu; // permet de retenter si la page redevient visible
        }
    }

    async function activerModeContinu() {
        canvas.hidden = true;

        conteneurContinu = document.createElement("div");
        conteneurContinu.className = "conteneur-defilement-continu";
        zoneCanvasEl.appendChild(conteneurContinu);

        let pageReference = await document_.getPage(1);
        let viewportReference = pageReference.getViewport({ scale: echelle });

        for (let n = 1; n <= nbPages; n++) {
            let c = document.createElement("canvas");
            c.style.width = `${Math.floor(viewportReference.width)}px`;
            c.style.height = `${Math.floor(viewportReference.height)}px`;
            c.dataset.page = String(n);
            c.className = "page-continue";
            conteneurContinu.appendChild(c);
        }

        observateurPagesContinu = new IntersectionObserver((entrees) => {
            entrees.forEach(entree => {
                let c = entree.target;
                let n = parseInt(c.dataset.page, 10);
                if (entree.isIntersecting && !c.dataset.rendu) {
                    rendreCanvasContinu(c, n);
                }
                if (entree.isIntersecting && entree.intersectionRatio > 0.5) {
                    pageActuelle = n;
                    champPage.value = n;
                    if (utilisateurId) enregistrerProgression(livre.id, utilisateurId, n, nbPages);
                }
            });
        }, { root: zoneCanvasEl, rootMargin: "150% 0px", threshold: [0, 0.5] });

        conteneurContinu.querySelectorAll("canvas").forEach(c => observateurPagesContinu.observe(c));

        let cibleInitiale = conteneurContinu.querySelector(`canvas[data-page="${pageActuelle}"]`);
        if (cibleInitiale) cibleInitiale.scrollIntoView({ block: "start" });

        // Pincement pour zoomer, disponible aussi en défilement continu
        // (le balayage/double-tap n'ont pas d'équivalent ici : le défilement
        // naturel à un doigt remplace déjà la navigation entre pages).
        let pDistDepart = null, pEchelleDepart = null, pFacteurCourant = 1;

        conteneurContinu.addEventListener("touchstart", (e) => {
            if (e.touches.length === 2) {
                pDistDepart = distanceEntreDoigts(e.touches);
                pEchelleDepart = echelle;
                pFacteurCourant = 1;
            }
        }, { passive: true });

        conteneurContinu.addEventListener("touchmove", (e) => {
            if (e.touches.length === 2 && pDistDepart) {
                e.preventDefault();
                pFacteurCourant = distanceEntreDoigts(e.touches) / pDistDepart;
                conteneurContinu.style.transform = `scale(${pFacteurCourant})`;
                conteneurContinu.style.transformOrigin = "top center";
            }
        }, { passive: false });

        conteneurContinu.addEventListener("touchend", async () => {
            if (pDistDepart) {
                conteneurContinu.style.transform = "";
                let nouvelleEchelle = pEchelleDepart * pFacteurCourant;
                echelle = Math.min(ECHELLE_MAX, Math.max(ECHELLE_MIN, +nouvelleEchelle.toFixed(2)));
                pDistDepart = null;
                pFacteurCourant = 1;
                await redimensionnerModeContinu();
            }
        }, { passive: true });
    }

    async function redimensionnerModeContinu() {
        if (!conteneurContinu) return;
        let pageReference = await document_.getPage(1);
        let viewportReference = pageReference.getViewport({ scale: echelle });
        let rectZone = zoneCanvasEl.getBoundingClientRect();
        let canvases = Array.from(conteneurContinu.querySelectorAll("canvas"));

        canvases.forEach(c => {
            c.style.width = `${Math.floor(viewportReference.width)}px`;
            c.style.height = `${Math.floor(viewportReference.height)}px`;
            delete c.dataset.rendu;
        });

        // Re-rendre immédiatement les pages actuellement à l'écran à la nouvelle échelle
        canvases.forEach(c => {
            let rect = c.getBoundingClientRect();
            if (rect.bottom > rectZone.top && rect.top < rectZone.bottom) {
                rendreCanvasContinu(c, parseInt(c.dataset.page, 10));
            }
        });
    }

    function desactiverModeContinu() {
        if (observateurPagesContinu) {
            observateurPagesContinu.disconnect();
            observateurPagesContinu = null;
        }
        if (conteneurContinu) {
            conteneurContinu.remove();
            conteneurContinu = null;
        }
        canvas.hidden = false;
        afficherPage(pageActuelle);
    }

    if (boutonModeContinu) {
        boutonModeContinu.addEventListener("click", async () => {
            modeContinu = !modeContinu;
            zoneCanvasEl.classList.toggle("mode-continu", modeContinu);
            boutonModeContinu.classList.toggle("actif", modeContinu);
            boutonModeContinu.querySelector("i").className = modeContinu ? "fa-solid fa-file" : "fa-solid fa-scroll";
            boutonModeContinu.setAttribute("aria-label", modeContinu ? "Revenir au mode page unique" : "Basculer en défilement continu");

            if (modeContinu) {
                await activerModeContinu();
            } else {
                desactiverModeContinu();
            }
        });
    }

    // Navigation au clavier (flèches gauche/droite)
    document.addEventListener("keydown", (e) => {
        if (modeContinu) return; // en défilement continu, le clavier ne fait rien de spécial pour l'instant
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

    // --- Journal technique (consultable sans outils de développement) ---
    let boutonJournal = document.getElementById("bouton-journal-technique");
    let boutonFermerJournal = document.getElementById("bouton-fermer-journal");
    let panneauJournal = document.getElementById("panneau-journal-technique");
    let contenuJournal = document.getElementById("contenu-journal-technique");

    function rafraichirJournal() {
        contenuJournal.innerHTML = journalTechnique.length
            ? journalTechnique.map(entree =>
                `<p class="ligne-journal ligne-journal-${entree.type}">${entree.texte.replace(/</g, "&lt;")}</p>`
              ).join("")
            : `<p class="ligne-journal">Aucun avertissement pour le moment.</p>`;
        contenuJournal.scrollTop = contenuJournal.scrollHeight;
    }

    if (boutonJournal && panneauJournal) {
        boutonJournal.addEventListener("click", () => {
            rafraichirJournal();
            panneauJournal.hidden = false;
        });
    }
    if (boutonFermerJournal && panneauJournal) {
        boutonFermerJournal.addEventListener("click", () => {
            panneauJournal.hidden = true;
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
