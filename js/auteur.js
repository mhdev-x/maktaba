// MAKTABA — FICHE AUTEUR (chargée dynamiquement via ?slug=nom-de-l-auteur)

document.addEventListener("DOMContentLoaded", async () => {
    let parametres = new URLSearchParams(window.location.search);
    let slug = parametres.get("slug");

    let conteneurProfil = document.getElementById("conteneur-profil-auteur");
    let conteneurOeuvres = document.getElementById("grille-oeuvres-auteur");
    let titreOeuvres = document.getElementById("titre-oeuvres-auteur");
    let filAriane = document.getElementById("fil-ariane-auteur");

    if (!slug) {
        if (conteneurProfil) {
            conteneurProfil.innerHTML = `<p class="message-vide-inline">Aucun auteur sélectionné. <a href="auteurs.html">Retour à la liste des auteurs</a>.</p>`;
        }
        return;
    }

    let auteur = await chargerAuteurParSlug(slug);

    if (!auteur) {
        if (conteneurProfil) {
            conteneurProfil.innerHTML = `<p class="message-vide-inline">Cet auteur est introuvable. <a href="auteurs.html">Retour à la liste des auteurs</a>.</p>`;
        }
        return;
    }

    document.title = `${auteur.nom_complet} — Maktaba`;
    if (filAriane) filAriane.textContent = auteur.nom_complet;

    document.getElementById("nom-arabe-auteur").textContent = auteur.nom_arabe || "";
    document.getElementById("nom-francais-auteur").textContent = auteur.nom_complet;
    document.getElementById("epoque-auteur").innerHTML =
        `<i class="fa-solid fa-hourglass-half"></i> ${auteur.epoque || ""}`;
    document.getElementById("bio-auteur").innerHTML = auteur.bio
        ? `<p>${auteur.bio}</p>`
        : `<p>Biographie à venir.</p>`;

    let livres = auteur.livres || [];
    if (titreOeuvres) titreOeuvres.textContent = `Ses ouvrages (${livres.length})`;

    if (conteneurOeuvres) {
        conteneurOeuvres.innerHTML = livres.length
            ? livres.map(maktabaCarteLivreHTML).join("")
            : `<p class="message-vide-inline">Aucun ouvrage référencé pour le moment.</p>`;
    }
});
