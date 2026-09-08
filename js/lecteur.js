// ==========================================================================
// MAKTABA — LECTEUR PDF INTÉGRÉ (via ?slug=...)
// PDF.js n'est plus distribué en script classique sur les CDN récents :
// on le charge via import() dynamique, ce qui reste compatible avec un
// fichier JS classique (pas besoin de <script type="module">).
// ==========================================================================

const PDFJS_VERSION = "6.1.200";
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

document.addEventListener("DOMContentLoaded", async () => {
    let parametres = new URLSearchParams(window.location.search);
    let slug = parametres.get("slug");

    let messageChargement = document.getElementById("message-chargement-pdf");
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

    // --- Chargement de PDF.js ---
    let pdfjsLib;
    try {
        pdfjsLib = await import(`${PDFJS_BASE}/pdf.min.mjs`);
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`;
    } catch (erreur) {
        console.error("Maktaba : erreur de chargement de PDF.js.", erreur);
        afficherMessage("Le lecteur n'a pas pu se charger. Vérifiez votre connexion.");
        return;
    }

    let document_;
    try {
        document_ = await pdfjsLib.getDocument({
            url: urlFichier,
            cMapUrl: `${PDFJS_BASE}/cmaps/`,
            cMapPacked: true,
            standardFontDataUrl: `${PDFJS_BASE}/standard_fonts/`,
            wasmUrl: `${PDFJS_BASE}/wasm/`,
        }).promise;
    } catch (erreur) {
        console.error("Maktaba : erreur d'ouverture du PDF.", erreur);
        afficherMessage("Ce fichier n'a pas pu être ouvert.");
        return;
    }

    let nbPages = document_.numPages;
    let pageActuelle = 1;
    let echelle = 1.2;
    const ECHELLE_BASE = 1.2;

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

        let page = await document_.getPage(numero);
        let viewport = page.getViewport({ scale: echelle });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: contexte, viewport }).promise;

        messageChargement.hidden = true;
        canvas.hidden = false;
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
        pourcentageZoom.textContent = `${Math.round((echelle / ECHELLE_BASE) * 100)}%`;
        afficherPage(pageActuelle);
    }
    boutonZoomMoins.addEventListener("click", () => {
        echelle = Math.max(0.6, +(echelle - 0.2).toFixed(2));
        mettreAJourZoom();
    });
    boutonZoomPlus.addEventListener("click", () => {
        echelle = Math.min(3, +(echelle + 0.2).toFixed(2));
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
