// MAKTABA — PAGE AUTEURS (liste complète, chargée depuis Supabase)

document.addEventListener("DOMContentLoaded", async () => {
    let grille = document.getElementById("grille-auteurs");
    let messageChargement = document.getElementById("message-chargement");
    if (!grille) return;

    let auteurs = await chargerAuteurs();

    if (messageChargement) messageChargement.setAttribute("hidden", "true");

    if (!auteurs.length) {
        grille.innerHTML = `<p class="message-vide-inline">Aucun auteur n'est encore référencé.</p>`;
        return;
    }

    grille.innerHTML = auteurs.map(maktabaCarteAuteurHTML).join("");
});
