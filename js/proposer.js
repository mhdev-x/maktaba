// ==========================================================================
// MAKTABA — PROPOSER UN OUVRAGE (formulaire de contribution)
// ==========================================================================

document.addEventListener("DOMContentLoaded", async () => {
    let blocNonConnecte = document.getElementById("bloc-non-connecte");
    let blocFormulaire = document.getElementById("bloc-formulaire");
    let blocMesContributions = document.getElementById("bloc-mes-contributions");
    let form = document.getElementById("form-proposer");
    let selectCategorie = document.getElementById("categorie-proposee");
    let messageProposition = document.getElementById("message-proposition");
    let listeMesContributions = document.getElementById("liste-mes-contributions");

    if (!supabaseClient) return;

    let session = null;
    try {
        const { data } = await supabaseClient.auth.getSession();
        session = data.session;
    } catch (erreur) {
        console.error("Maktaba : erreur de récupération de session.", erreur);
    }

    if (!session) {
        if (blocNonConnecte) blocNonConnecte.hidden = false;
        return;
    }

    let utilisateurId = session.user.id;
    if (blocFormulaire) blocFormulaire.hidden = false;
    if (blocMesContributions) blocMesContributions.hidden = false;

    // --- Remplir la liste des catégories ---
    if (selectCategorie) {
        let categories = await chargerCategories();
        categories.forEach(cat => {
            let option = document.createElement("option");
            option.value = cat.slug;
            option.textContent = cat.nom;
            selectCategorie.appendChild(option);
        });
    }

    function afficherMessage(texte, type) {
        if (!messageProposition) return;
        messageProposition.textContent = texte;
        messageProposition.classList.remove("erreur", "succes");
        messageProposition.classList.add(type);
        messageProposition.hidden = false;
    }

    function activerChargement(actif) {
        let bouton = form.querySelector(".bouton-auth-pleine-largeur");
        let spinner = bouton.querySelector(".icone-spinner");
        bouton.disabled = actif;
        if (spinner) spinner.hidden = !actif;
    }

    async function rafraichirMesContributions() {
        if (!listeMesContributions) return;
        let contributions = await chargerMesContributions(utilisateurId);
        listeMesContributions.innerHTML = contributions.length
            ? contributions.map(maktabaCarteContributionHTML).join("")
            : `<p class="message-vide-inline">Vous n'avez encore proposé aucun ouvrage.</p>`;
    }

    await rafraichirMesContributions();

    // --- Soumission du formulaire ---
    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            messageProposition.hidden = true;
            activerChargement(true);

            let proposition = {
                titre_propose: document.getElementById("titre-propose").value.trim(),
                auteur_propose: document.getElementById("auteur-propose").value.trim(),
                categorie_proposee: selectCategorie ? selectCategorie.value : "",
                lien_source: document.getElementById("lien-source-propose").value.trim(),
                description: document.getElementById("description-proposee").value.trim(),
            };

            let resultat = await proposerContribution(utilisateurId, proposition);
            activerChargement(false);

            if (resultat.succes) {
                afficherMessage("Merci ! Votre proposition a été envoyée et sera examinée par un modérateur.", "succes");
                form.reset();
                await rafraichirMesContributions();
            } else {
                afficherMessage("Une erreur est survenue lors de l'envoi. Réessayez dans quelques instants.", "erreur");
            }
        });
    }
});
