// ==========================================================================
// MAKTABA — FICHE LIVRE (chargée dynamiquement via ?slug=...)
// ==========================================================================

document.addEventListener("DOMContentLoaded", async () => {
    let parametres = new URLSearchParams(window.location.search);
    let slug = parametres.get("slug");

    let conteneur = document.getElementById("conteneur-livre-details");
    let filAriane = document.getElementById("fil-ariane-livre");
    let filArianeCategorie = document.getElementById("fil-ariane-categorie");

    if (!slug) {
        if (conteneur) {
            conteneur.innerHTML = `<p class="message-vide-inline">Aucun livre sélectionné. <a href="livres.html">Retour à la bibliothèque</a>.</p>`;
        }
        return;
    }

    let livre = await chargerLivreParSlug(slug);

    if (!livre) {
        if (conteneur) {
            conteneur.innerHTML = `<p class="message-vide-inline">Cet ouvrage est introuvable. <a href="livres.html">Retour à la bibliothèque</a>.</p>`;
        }
        return;
    }

    let categories = maktabaCategoriesDe(livre);

    document.title = `${livre.titre} — Maktaba`;
    if (filAriane) filAriane.textContent = livre.titre;
    if (filArianeCategorie) {
        if (categories.length) {
            filArianeCategorie.textContent = categories[0].nom;
            filArianeCategorie.setAttribute("href", `livres.html?categorie=${categories[0].slug}`);
            filArianeCategorie.hidden = false;
        } else {
            filArianeCategorie.hidden = true;
        }
    }

    document.getElementById("couverture-arabe-livre").textContent = livre.titre_arabe || "";
    document.getElementById("couverture-titre-livre").textContent = livre.titre;
    document.getElementById("couverture-auteur-livre").textContent = livre.auteurs?.nom_complet || "";

    let conteneurBadges = document.getElementById("badges-categorie-livre");
    if (conteneurBadges) {
        conteneurBadges.innerHTML = categories.length
            ? categories.map(c => `<span class="badge-categorie">${c.nom}</span>`).join("")
            : "";
    }

    document.getElementById("titre-arabe-livre").textContent = livre.titre_arabe || "";
    document.getElementById("titre-principal-livre").childNodes[0].textContent = livre.titre + " ";

    let lienAuteur = document.getElementById("lien-auteur-livre");
    if (lienAuteur) {
        lienAuteur.textContent = livre.auteurs?.nom_complet || "Auteur inconnu";
        lienAuteur.setAttribute("href", livre.auteurs?.slug ? `auteur.html?slug=${livre.auteurs.slug}` : "auteurs.html");
    }

    document.getElementById("donnee-langue-livre").textContent = maktabaLabelLangue(livre.langue);

    let donneePagesLabel = document.getElementById("donnee-pages-label");
    let donneePagesValeur = document.getElementById("donnee-pages-valeur");
    if (livre.nb_hadiths) {
        donneePagesLabel.textContent = "Contenu";
        donneePagesValeur.textContent = `~ ${livre.nb_hadiths} hadiths`;
    } else if (livre.nb_volumes) {
        donneePagesLabel.textContent = "Volumes";
        donneePagesValeur.textContent = `${livre.nb_volumes} volumes`;
    } else if (livre.nb_pages) {
        donneePagesLabel.textContent = "Pages";
        donneePagesValeur.textContent = `${livre.nb_pages} pages`;
    } else {
        donneePagesLabel.textContent = "Contenu";
        donneePagesValeur.textContent = "—";
    }

    document.getElementById("donnee-edition-valeur").textContent = livre.edition || "—";
    document.getElementById("donnee-authentification-valeur").textContent = livre.authentification || "—";
    document.getElementById("donnee-editeur-valeur").textContent = livre.editeur || "—";
    document.getElementById("donnee-annee-valeur").textContent = livre.annee_publication || "—";
    document.getElementById("donnee-langue-originale-valeur").textContent =
        maktabaLabelLangue(livre.langue_originale) || "—";

    document.getElementById("description-livre-texte").innerHTML = livre.description
        ? `<p>${livre.description}</p>`
        : `<p>Aucune description disponible pour le moment.</p>`;

    // --- Bouton "Lire en ligne" : ouvre le lecteur intégré si un fichier est disponible ---
    let boutonLire = document.getElementById("bouton-lire-livre");
    let fichierPdf = (livre.fichiers_livres || []).find(f => f.type === "pdf");
    if (boutonLire) {
        if (fichierPdf) {
            boutonLire.addEventListener("click", () => {
                window.location.href = `lecteur.html?slug=${encodeURIComponent(livre.slug)}`;
            });
        } else {
            boutonLire.disabled = true;
            boutonLire.title = "Fichier non disponible pour le moment";
        }
    }

    // --- Bouton "Voir la source" : affiché seulement si le livre a un lien externe ---
    let boutonSource = document.getElementById("bouton-source-livre");
    if (boutonSource) {
        if (livre.source_url) {
            boutonSource.hidden = false;
            boutonSource.addEventListener("click", () => window.open(livre.source_url, "_blank", "noopener"));
        } else {
            boutonSource.hidden = true;
        }
    }

    // --- Favoris ---
    let boutonFavori = document.querySelector(".btn-favori");
    let messageErreurFavori = document.getElementById("message-erreur-favori");

    function afficherErreurFavori(texte) {
        if (!messageErreurFavori) return;
        messageErreurFavori.textContent = texte;
        messageErreurFavori.hidden = false;
    }

    if (boutonFavori && supabaseClient) {
        let session = null;
        try {
            const { data } = await supabaseClient.auth.getSession();
            session = data.session;
        } catch (erreur) {
            console.error("Maktaba : erreur de récupération de session.", erreur);
        }

        function mettreAJourBoutonFavori(estActif) {
            boutonFavori.innerHTML = estActif
                ? `<i class="fa-solid fa-bookmark"></i> Retirer des favoris`
                : `<i class="fa-regular fa-bookmark"></i> Ajouter aux favoris`;
            boutonFavori.classList.toggle("favori-actif", estActif);
        }

        if (session) {
            let utilisateurId = session.user.id;
            let estActif = await estFavori(livre.id, utilisateurId);
            mettreAJourBoutonFavori(estActif);

            boutonFavori.addEventListener("click", async () => {
                boutonFavori.disabled = true;
                if (messageErreurFavori) messageErreurFavori.hidden = true;

                let nouvelEtat = !boutonFavori.classList.contains("favori-actif");
                let succes = nouvelEtat
                    ? await ajouterFavori(livre.id, utilisateurId)
                    : await retirerFavori(livre.id, utilisateurId);

                if (succes) {
                    mettreAJourBoutonFavori(nouvelEtat);
                } else {
                    afficherErreurFavori(
                        "Une erreur est survenue. Si le problème persiste, vérifiez que votre profil existe bien côté serveur."
                    );
                }
                boutonFavori.disabled = false;
            });
        } else {
            // Visiteur non connecté : le bouton renvoie simplement vers la connexion.
            boutonFavori.addEventListener("click", () => {
                window.location.href = "connexion.html";
            });
        }
    }
});
