// ==========================================================================
// MAKTABA — TABLEAU DE MODÉRATION DES CONTRIBUTIONS
// Réservé aux profils role = moderateur | admin (appliqué aussi par RLS
// côté serveur : même en contournant cette page, une requête depuis un
// compte non autorisé serait refusée par Supabase).
// ==========================================================================

document.addEventListener("DOMContentLoaded", async () => {
    let blocAccesRefuse = document.getElementById("bloc-acces-refuse");
    let blocModeration = document.getElementById("bloc-moderation");
    let listeModeration = document.getElementById("liste-moderation");
    let boutonsFiltres = document.querySelectorAll("#filtres-moderation .bouton-filtre");

    if (!supabaseClient) return;

    let session = null;
    try {
        const { data } = await supabaseClient.auth.getSession();
        session = data.session;
    } catch (erreur) {
        console.error("Maktaba : erreur de récupération de session.", erreur);
    }

    if (!session) {
        blocAccesRefuse.hidden = false;
        return;
    }

    let profil = await chargerMonProfil(session.user.id);
    if (!profil || !["moderateur", "admin"].includes(profil.role)) {
        blocAccesRefuse.hidden = false;
        return;
    }

    let moderateurId = session.user.id;
    blocModeration.hidden = false;

    let filtreActif = "en_attente";

    async function rafraichir() {
        listeModeration.innerHTML = `<p class="message-vide-inline">Chargement...</p>`;
        let contributions = await chargerToutesLesContributions(filtreActif);

        listeModeration.innerHTML = contributions.length
            ? contributions.map(maktabaCarteModerationHTML).join("")
            : `<p class="message-vide-inline">Aucune contribution dans cette catégorie.</p>`;
    }

    boutonsFiltres.forEach(bouton => {
        bouton.addEventListener("click", () => {
            boutonsFiltres.forEach(b => b.classList.remove("actif"));
            bouton.classList.add("actif");
            filtreActif = bouton.getAttribute("data-filtre");
            rafraichir();
        });
    });

    // Délégation d'événements : la liste est régénérée à chaque filtre,
    // donc on écoute sur le conteneur parent plutôt que sur chaque bouton.
    listeModeration.addEventListener("click", async (e) => {
        let boutonApprouver = e.target.closest(".bouton-approuver");
        let boutonRejeter = e.target.closest(".bouton-rejeter");
        let bouton = boutonApprouver || boutonRejeter;
        if (!bouton) return;

        let carte = bouton.closest(".carte-moderation");
        let contributionId = carte.getAttribute("data-id");
        let commentaire = carte.querySelector(".champ-commentaire-moderation").value.trim();
        let statut = boutonApprouver ? "approuvee" : "rejetee";

        carte.querySelectorAll("button").forEach(b => (b.disabled = true));

        let succes = await traiterContribution(contributionId, statut, commentaire, moderateurId);

        if (succes) {
            await rafraichir();
        } else {
            carte.querySelectorAll("button").forEach(b => (b.disabled = false));
            alert("Une erreur est survenue. Réessayez.");
        }
    });

    await rafraichir();
});
