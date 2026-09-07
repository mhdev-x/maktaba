-- ==========================================================================
-- GABARIT — Ajouter un livre manuellement (respect des conditions de la
-- source : citation claire, texte non modifié).
-- Remplis les valeurs entre <...>, exécute bloc par bloc dans Supabase SQL Editor.
-- ==========================================================================

-- ------------------------------------------------------------------
-- 1. Auteur (uniquement s'il n'existe pas déjà dans public.auteurs)
-- ------------------------------------------------------------------
insert into public.auteurs (slug, nom_complet, nom_arabe, epoque, bio)
values (
    '<slug-auteur>',            -- ex: 'ibn-kathir' (déjà existant, à réutiliser si possible)
    '<Nom complet de l''auteur>',
    '<nom arabe ou NULL>',
    '<époque ou NULL>',
    '<bio ou NULL>'
)
on conflict (slug) do nothing;

-- ------------------------------------------------------------------
-- 2. Le livre
-- ------------------------------------------------------------------
insert into public.livres (
    slug, titre, titre_arabe, auteur_id, description, langue,
    langue_originale, annee_publication, editeur, edition,
    nb_pages, nb_volumes, nb_hadiths, authentification,
    couverture_url, source_url, attribution
)
select
    '<slug-du-livre>',                     -- ex: 'les-histoires-des-prophetes'
    '<Titre du livre>',
    '<titre arabe ou NULL>',
    a.id,
    '<description ou NULL>',
    '<langue ex: francais>',
    '<langue originale ex: arabe, ou NULL>',
    <année ou NULL>,
    '<éditeur ou NULL>',
    '<édition ou NULL>',
    <nb_pages ou NULL>, <nb_volumes ou NULL>, <nb_hadiths ou NULL>,
    '<authentification ou NULL>',
    '<url couverture ou NULL>',
    '<lien vers la source si le fichier n''est pas hébergé, ou NULL>',
    -- ⚠️ Attribution obligatoire si le contenu vient d'une plateforme tierce :
    'Source : <IslamHouse.com / QuranEnc.com / ...> — Traduction/Édition : <nom>'
from public.auteurs a
where a.slug = '<slug-auteur>';

-- ------------------------------------------------------------------
-- 3. Rattachement à une ou plusieurs catégories
-- ------------------------------------------------------------------
insert into public.livres_categories (livre_id, categorie_id)
select l.id, c.id
from public.livres l, public.categories c
where l.slug = '<slug-du-livre>'
  and c.slug in ('<categorie-1>', '<categorie-2>'); -- ex: 'sira', 'adab'

-- ------------------------------------------------------------------
-- 4. Fichier (seulement si tu héberges réellement le PDF dans le bucket "livres")
-- ------------------------------------------------------------------
-- insert into public.fichiers_livres (livre_id, type, url, est_public)
-- select l.id, 'pdf', '<chemin-dans-le-bucket-livres.pdf>', false
-- from public.livres l
-- where l.slug = '<slug-du-livre>';
