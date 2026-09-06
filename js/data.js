// ==========================================================================
// MAKTABA — COUCHE D'ACCÈS AUX DONNÉES (Supabase)
// À charger APRÈS supabase-client.js et AVANT les scripts propres à chaque page.
// ==========================================================================

// Préfixe de chemin : "" si on est déjà dans /pages/, sinon "pages/" (depuis la racine)
let MAKTABA_BASE_PAGES = window.location.pathname.includes("/pages/") ? "" : "pages/";

function maktabaLabelLangue(valeur) {
    if (!valeur) return "";
    let libelles = { arabe: "Arabe", francais: "Français", anglais: "Anglais" };
    return valeur.split(" ").filter(Boolean).map(p => libelles[p] || p).join(" / ");
}

// Retourne la métadonnée secondaire la plus pertinente pour une carte de livre
// (pages, volumes ou nombre de hadiths — un seul à la fois, selon ce qui est renseigné)
function maktabaMetaSecondaire(livre) {
    if (livre.nb_hadiths) return `<i class="fa-solid fa-file-lines"></i> ${livre.nb_hadiths} hadiths`;
    if (livre.nb_volumes) return `<i class="fa-solid fa-layer-group"></i> ${livre.nb_volumes} volume${livre.nb_volumes > 1 ? "s" : ""}`;
    if (livre.nb_pages) return `<i class="fa-solid fa-file-lines"></i> ${livre.nb_pages} pages`;
    return "";
}

// Un livre peut appartenir à plusieurs catégories (relation livres_categories).
// Cette fonction aplatit la relation imbriquée renvoyée par Supabase en un tableau simple.
function maktabaCategoriesDe(livre) {
    return (livre.livres_categories || [])
        .map(lc => lc.categories)
        .filter(Boolean);
}

// ==========================================
// LECTURE — CATÉGORIES
// ==========================================

async function chargerCategories() {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
        .from("categories")
        .select("id, slug, nom, nom_arabe, description, icone")
        .order("ordre", { ascending: true });
    if (error) {
        console.error("Maktaba : erreur de chargement des catégories.", error);
        return [];
    }
    return data || [];
}

// Compte le nombre de livres par catégorie (relation many-to-many).
async function compterLivresParCategorie() {
    if (!supabaseClient) return {};

    const { data, error } = await supabaseClient
        .from("livres_categories")
        .select("categories(slug)");

    if (error) {
        console.error("Maktaba : erreur de comptage par catégorie.", error);
        return {};
    }

    let compteurs = {};
    (data || []).forEach(ligne => {
        let cle = ligne.categories?.slug;
        if (cle) compteurs[cle] = (compteurs[cle] || 0) + 1;
    });
    return compteurs;
}

// ==========================================
// LECTURE — LIVRES
// ==========================================

const SELECTION_LIVRE = `
    id, slug, titre, titre_arabe, description, langue, langue_originale,
    annee_publication, editeur, edition, nb_pages, nb_volumes, nb_hadiths,
    authentification, couverture_url, source_url,
    auteurs(nom_complet, nom_arabe, slug),
    livres_categories(categories(slug, nom)),
    fichiers_livres(type, url, est_public)
`;

// Charge la liste des livres (avec auteur + catégories), triés du plus récent au plus ancien.
async function chargerLivres(options = {}) {
    if (!supabaseClient) return [];

    let requete = supabaseClient
        .from("livres")
        .select(SELECTION_LIVRE)
        .order("created_at", { ascending: false });

    if (options.limite) requete = requete.limit(options.limite);

    const { data, error } = await requete;
    if (error) {
        console.error("Maktaba : erreur de chargement des livres.", error);
        return [];
    }
    return data || [];
}

// Charge un livre précis (fiche détaillée) via son slug.
async function chargerLivreParSlug(slug) {
    if (!supabaseClient || !slug) return null;

    const { data, error } = await supabaseClient
        .from("livres")
        .select(SELECTION_LIVRE)
        .eq("slug", slug)
        .maybeSingle();

    if (error) {
        console.error("Maktaba : erreur de chargement du livre.", error);
        return null;
    }
    return data;
}

// ==========================================
// LECTURE — AUTEURS
// ==========================================

// Charge la liste des auteurs avec leur nombre d'ouvrages (calculé, jamais désynchronisé).
async function chargerAuteurs() {
    if (!supabaseClient) return [];

    const { data, error } = await supabaseClient
        .from("auteurs")
        .select("id, slug, nom_complet, nom_arabe, epoque, livres(count)")
        .order("nom_complet", { ascending: true });

    if (error) {
        console.error("Maktaba : erreur de chargement des auteurs.", error);
        return [];
    }
    return data || [];
}

// Charge un auteur précis (fiche + liste de ses ouvrages) via son slug.
async function chargerAuteurParSlug(slug) {
    if (!supabaseClient || !slug) return null;

    const { data, error } = await supabaseClient
        .from("auteurs")
        .select(`*, livres(${SELECTION_LIVRE})`)
        .eq("slug", slug)
        .maybeSingle();

    if (error) {
        console.error("Maktaba : erreur de chargement de l'auteur.", error);
        return null;
    }
    return data;
}

function maktabaNbOuvrages(auteur) {
    return auteur?.livres?.[0]?.count ?? (Array.isArray(auteur?.livres) ? auteur.livres.length : 0);
}

// ==========================================
// FAVORIS (nécessite une session active — RLS impose auth.uid() = utilisateur_id)
// ==========================================

async function estFavori(livreId, utilisateurId) {
    if (!supabaseClient || !utilisateurId) return false;
    const { data, error } = await supabaseClient
        .from("favoris")
        .select("livre_id")
        .eq("livre_id", livreId)
        .eq("utilisateur_id", utilisateurId)
        .maybeSingle();
    if (error) {
        console.error("Maktaba : erreur de vérification des favoris.", error);
        return false;
    }
    return !!data;
}

async function ajouterFavori(livreId, utilisateurId) {
    if (!supabaseClient || !utilisateurId) return false;
    const { error } = await supabaseClient
        .from("favoris")
        .insert({ livre_id: livreId, utilisateur_id: utilisateurId });
    if (error) {
        console.error("Maktaba : erreur d'ajout aux favoris.", error);
        return false;
    }
    return true;
}

async function retirerFavori(livreId, utilisateurId) {
    if (!supabaseClient || !utilisateurId) return false;
    const { error } = await supabaseClient
        .from("favoris")
        .delete()
        .eq("livre_id", livreId)
        .eq("utilisateur_id", utilisateurId);
    if (error) {
        console.error("Maktaba : erreur de suppression du favori.", error);
        return false;
    }
    return true;
}

// Charge les livres favoris d'un utilisateur (mêmes champs qu'une carte-livre classique).
async function chargerFavorisUtilisateur(utilisateurId) {
    if (!supabaseClient || !utilisateurId) return [];

    const { data, error } = await supabaseClient
        .from("favoris")
        .select(`created_at, livres(${SELECTION_LIVRE})`)
        .eq("utilisateur_id", utilisateurId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Maktaba : erreur de chargement des favoris.", error);
        return [];
    }
    return (data || []).map(ligne => ligne.livres).filter(Boolean);
}

// ==========================================
// GABARITS HTML (mêmes classes CSS que l'existant, donc aucun style à retoucher)
// ==========================================

function maktabaCarteLivreHTML(livre) {
    let nomAuteur = livre.auteurs?.nom_complet || "Auteur inconnu";
    let categories = maktabaCategoriesDe(livre);
    let slugsCategories = categories.map(c => c.slug).join(",");
    let badgesCategorie = categories.length
        ? categories.map(c => `<span class="badge-categorie">${c.nom}</span>`).join("")
        : "";
    let meta = maktabaMetaSecondaire(livre);

    return `
        <a href="${MAKTABA_BASE_PAGES}livre.html?slug=${encodeURIComponent(livre.slug)}" class="carte-livre" data-categories="${slugsCategories}" data-langue="${livre.langue}">
            <div class="visuel-carte-livre">
                <span class="visuel-arabe">${livre.titre_arabe || ""}</span>
                ${badgesCategorie}
            </div>
            <div class="corps-carte-livre">
                <h3 class="titre-carte-livre">${livre.titre}</h3>
                <p class="auteur-carte-livre">${nomAuteur}</p>
                <div class="pied-carte-livre">
                    <span><i class="fa-solid fa-language"></i> ${maktabaLabelLangue(livre.langue)}</span>
                    ${meta ? `<span>${meta}</span>` : ""}
                </div>
            </div>
        </a>
    `;
}

function maktabaCarteAuteurHTML(auteur) {
    let nbOuvrages = maktabaNbOuvrages(auteur);
    return `
        <a href="${MAKTABA_BASE_PAGES}auteur.html?slug=${encodeURIComponent(auteur.slug)}" class="carte-auteur">
            <div class="avatar-auteur"><i class="fa-solid fa-feather-pointed"></i></div>
            <span class="nom-arabe-auteur">${auteur.nom_arabe || ""}</span>
            <h3 class="nom-auteur">${auteur.nom_complet}</h3>
            <span class="epoque-auteur">${auteur.epoque || ""}</span>
            <span class="nombre-ouvrages"><i class="fa-solid fa-book"></i> ${nbOuvrages} ouvrage${nbOuvrages > 1 ? "s" : ""}</span>
        </a>
    `;
}
