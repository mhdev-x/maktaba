// MAKTABA — ACCUEIL (livre à la une + sélection + grands auteurs, via Supabase)


document.addEventListener("DOMContentLoaded", async () => {
    let vedette = await chargerLivreParSlug("riyad-as-salihin");
    if (vedette) {
        let elArabe = document.getElementById("hero-arabe");
        let elTitre = document.getElementById("hero-titre");
        let elAuteur = document.getElementById("hero-auteur");
        let elCategorie = document.getElementById("hero-categorie-texte");
        let elMeta = document.getElementById("hero-meta-texte");

        if (elArabe) elArabe.textContent = vedette.titre_arabe || "";
        if (elTitre) elTitre.textContent = vedette.titre;
        if (elAuteur) elAuteur.textContent = vedette.auteurs?.nom_complet || "";
        if (elCategorie) elCategorie.textContent = maktabaCategoriesDe(vedette)[0]?.nom || "";
        if (elMeta) elMeta.innerHTML = maktabaMetaSecondaire(vedette) ||
            `<i class="fa-solid fa-language"></i> ${maktabaLabelLangue(vedette.langue)}`;
    }

    let grilleLivres = document.getElementById("grille-livres-vedette");
    if (grilleLivres) {
        let livres = await chargerLivres({ limite: 4 });
        grilleLivres.innerHTML = livres.length
            ? livres.map(maktabaCarteLivreHTML).join("")
            : `<p class="message-vide-inline">Aucun ouvrage pour le moment.</p>`;
    }

    let grilleAuteurs = document.getElementById("grille-auteurs-vedette");
    if (grilleAuteurs) {
        let auteurs = await chargerAuteurs();
        auteurs.sort((a, b) => maktabaNbOuvrages(b) - maktabaNbOuvrages(a));
        let top = auteurs.slice(0, 4);
        grilleAuteurs.innerHTML = top.length
            ? top.map(maktabaCarteAuteurHTML).join("")
            : `<p class="message-vide-inline">Aucun auteur pour le moment.</p>`;
    }
});
