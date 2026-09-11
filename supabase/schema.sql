-- ==========================================================================
-- MAKTABA — SCHÉMA SUPABASE COMPLET (aligné sur le cahier des charges)
-- À exécuter une seule fois (dans l'ordre) dans Supabase > SQL Editor.
-- Idempotent : peut être relancé sans risque pendant le développement.
-- ==========================================================================

-- ------------------------------------------------------------------
-- 0. NETTOYAGE (pratique en développement — sans effet la 1ère fois)
-- ------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

drop table if exists public.contributions cascade;
drop table if exists public.progression_lecture cascade;
drop table if exists public.favoris cascade;
drop table if exists public.fichiers_livres cascade;
drop table if exists public.livres_tags cascade;
drop table if exists public.tags cascade;
drop table if exists public.livres_categories cascade;
drop table if exists public.livres cascade;
drop table if exists public.categories cascade;
drop table if exists public.auteurs cascade;
drop table if exists public.profils cascade;

-- ==========================================================================
-- 1. PROFILS — miroir public de auth.users, avec rôle applicatif
-- ==========================================================================
create table public.profils (
    id          uuid primary key references auth.users(id) on delete cascade,
    nom_complet text,
    role        text not null default 'utilisateur'
                    check (role in ('utilisateur', 'moderateur', 'admin')),
    created_at  timestamptz not null default now()
);

comment on table public.profils is 'Profil applicatif (nom, rôle) — 1 ligne par utilisateur Supabase Auth.';

-- Création automatique du profil à l'inscription (lit user_metadata.nom_complet
-- déjà envoyé par auth.js lors du signUp()).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profils (id, nom_complet)
    values (
        new.id,
        coalesce(
            new.raw_user_meta_data ->> 'nom_complet',   -- inscription par email (notre formulaire)
            new.raw_user_meta_data ->> 'full_name',      -- Google
            new.raw_user_meta_data ->> 'name',           -- Google/GitHub
            new.raw_user_meta_data ->> 'user_name'       -- GitHub (identifiant)
        )
    )
    on conflict (id) do nothing;
    return new;
exception
    when others then
        -- Ne jamais bloquer la création du compte à cause d'un souci sur "profils" :
        -- on journalise l'erreur et on laisse l'inscription réussir quand même.
        -- Le filet de sécurité de la section 13 rattrapera le profil manquant.
        raise warning 'Maktaba: echec de creation du profil pour %: %', new.id, sqlerrm;
        return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- Le service d'authentification Supabase (GoTrue) exécute ses requêtes avec
-- le rôle "supabase_auth_admin", qui n'a par défaut aucun droit sur le schéma
-- public. Sans ces GRANT, chaque inscription échoue avec une erreur 500
-- "Database error saving new user" côté client.
grant usage on schema public to supabase_auth_admin;
grant insert, select on public.profils to supabase_auth_admin;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- ==========================================================================
-- 2. CATÉGORIES (collections) — table à part, un livre peut en avoir plusieurs
-- ==========================================================================
create table public.categories (
    id          uuid primary key default gen_random_uuid(),
    slug        text not null unique,
    nom         text not null,
    nom_arabe   text,
    description text,
    icone       text,             -- classe Font Awesome, ex: "fa-book-open"
    ordre       int not null default 0,
    created_at  timestamptz not null default now()
);

comment on table public.categories is 'Collections/disciplines islamiques (Aqida, Hadith, Fiqh...).';

-- ==========================================================================
-- 3. AUTEURS
-- ==========================================================================
create table public.auteurs (
    id          uuid primary key default gen_random_uuid(),
    slug        text not null unique,
    nom_complet text not null,
    nom_arabe   text,
    epoque      text,
    bio         text,
    created_at  timestamptz not null default now()
);

-- ==========================================================================
-- 4. LIVRES
-- ==========================================================================
create table public.livres (
    id               uuid primary key default gen_random_uuid(),
    slug             text not null unique,
    titre            text not null,
    titre_arabe      text,
    auteur_id        uuid references public.auteurs(id) on delete set null,
    description      text,
    langue           text not null,     -- ex: "arabe francais" (utilisé pour le filtre)
    langue_originale text,
    annee_publication int,
    editeur          text,
    edition          text,
    nb_pages         int,
    nb_volumes       int,
    nb_hadiths       int,
    authentification text,
    couverture_url   text,              -- image dans le bucket "couvertures" (public)
    source_url       text,              -- lien externe si le fichier n'est pas hébergé
    attribution      text,              -- citation obligatoire pour un contenu importé (source, auteur/traducteur/éditeur)
    created_at       timestamptz not null default now()
);

create index livres_auteur_id_idx on public.livres(auteur_id);

-- ------------------------------------------------------------------
-- 4bis. LIVRES <-> CATÉGORIES (many-to-many)
-- ------------------------------------------------------------------
create table public.livres_categories (
    livre_id     uuid not null references public.livres(id) on delete cascade,
    categorie_id uuid not null references public.categories(id) on delete cascade,
    primary key (livre_id, categorie_id)
);

-- ==========================================================================
-- 5. TAGS
-- ==========================================================================
create table public.tags (
    id   uuid primary key default gen_random_uuid(),
    slug text not null unique,
    nom  text not null
);

create table public.livres_tags (
    livre_id uuid not null references public.livres(id) on delete cascade,
    tag_id   uuid not null references public.tags(id) on delete cascade,
    primary key (livre_id, tag_id)
);

-- ==========================================================================
-- 6. FICHIERS DES LIVRES (PDF / EPUB / audio — un livre peut en avoir plusieurs)
-- ==========================================================================
create table public.fichiers_livres (
    id            uuid primary key default gen_random_uuid(),
    livre_id      uuid not null references public.livres(id) on delete cascade,
    type          text not null check (type in ('pdf', 'epub', 'audio')),
    url           text not null,        -- chemin dans le bucket Storage "livres" ou "audio"
    taille_octets bigint,
    langue        text,
    est_public    boolean not null default false,  -- false = réservé aux utilisateurs connectés
    created_at    timestamptz not null default now()
);

create index fichiers_livres_livre_id_idx on public.fichiers_livres(livre_id);

-- ==========================================================================
-- 7. FAVORIS
-- ==========================================================================
create table public.favoris (
    utilisateur_id uuid not null references public.profils(id) on delete cascade,
    livre_id       uuid not null references public.livres(id) on delete cascade,
    created_at     timestamptz not null default now(),
    primary key (utilisateur_id, livre_id)
);

-- ==========================================================================
-- 8. PROGRESSION DE LECTURE
-- ==========================================================================
create table public.progression_lecture (
    utilisateur_id uuid not null references public.profils(id) on delete cascade,
    livre_id       uuid not null references public.livres(id) on delete cascade,
    page_actuelle  int not null default 0,
    page_totale    int,
    updated_at     timestamptz not null default now(),
    primary key (utilisateur_id, livre_id)
);

-- ==========================================================================
-- 9. CONTRIBUTIONS (proposition d'ouvrages par la communauté)
-- ==========================================================================
create table public.contributions (
    id                 uuid primary key default gen_random_uuid(),
    utilisateur_id     uuid not null references public.profils(id) on delete cascade,
    titre_propose      text not null,
    auteur_propose     text,
    categorie_proposee text,
    description        text,
    lien_source        text,
    statut             text not null default 'en_attente'
                            check (statut in ('en_attente', 'approuvee', 'rejetee')),
    commentaire_moderateur text,
    traite_par         uuid references public.profils(id),
    traite_le          timestamptz,
    created_at         timestamptz not null default now()
);

-- ==========================================================================
-- 10. SÉCURITÉ (RLS)
-- ==========================================================================
alter table public.profils            enable row level security;
alter table public.categories         enable row level security;
alter table public.auteurs            enable row level security;
alter table public.livres             enable row level security;
alter table public.livres_categories  enable row level security;
alter table public.tags               enable row level security;
alter table public.livres_tags        enable row level security;
alter table public.fichiers_livres    enable row level security;
alter table public.favoris            enable row level security;
alter table public.progression_lecture enable row level security;
alter table public.contributions      enable row level security;

-- --- Catalogue public : lecture ouverte à tous, écriture réservée à l'admin ---
create policy "Lecture publique des profils" on public.profils for select using (true);
-- (Pas de policy update/insert/delete côté client : le rôle ne doit pas être
-- modifiable par l'utilisateur lui-même, pour éviter toute élévation de privilège.)

create policy "Lecture publique des categories"        on public.categories        for select using (true);
create policy "Lecture publique des auteurs"           on public.auteurs           for select using (true);
create policy "Lecture publique des livres"            on public.livres            for select using (true);
create policy "Lecture publique des livres_categories" on public.livres_categories for select using (true);
create policy "Lecture publique des tags"              on public.tags              for select using (true);
create policy "Lecture publique des livres_tags"       on public.livres_tags       for select using (true);

-- --- Fichiers : publics uniquement si marqués est_public, sinon réservés aux connectés ---
create policy "Lecture des fichiers selon visibilite"
    on public.fichiers_livres for select
    using (est_public = true or auth.role() = 'authenticated');

-- --- Favoris : uniquement ses propres favoris ---
create policy "Un utilisateur gere ses propres favoris (lecture)"
    on public.favoris for select using (auth.uid() = utilisateur_id);
create policy "Un utilisateur gere ses propres favoris (ajout)"
    on public.favoris for insert with check (auth.uid() = utilisateur_id);
create policy "Un utilisateur gere ses propres favoris (suppression)"
    on public.favoris for delete using (auth.uid() = utilisateur_id);

-- --- Progression de lecture : uniquement la sienne ---
create policy "Un utilisateur gere sa propre progression (lecture)"
    on public.progression_lecture for select using (auth.uid() = utilisateur_id);
create policy "Un utilisateur gere sa propre progression (ajout)"
    on public.progression_lecture for insert with check (auth.uid() = utilisateur_id);
create policy "Un utilisateur gere sa propre progression (maj)"
    on public.progression_lecture for update using (auth.uid() = utilisateur_id);

-- --- Contributions : l'auteur voit les siennes, les modérateurs/admins voient tout ---
create policy "Voir ses propres contributions ou etre moderateur"
    on public.contributions for select
    using (
        auth.uid() = utilisateur_id
        or exists (select 1 from public.profils p where p.id = auth.uid() and p.role in ('moderateur', 'admin'))
    );

create policy "Proposer une contribution en son propre nom"
    on public.contributions for insert
    with check (auth.uid() = utilisateur_id);

create policy "Seuls les moderateurs traitent les contributions"
    on public.contributions for update
    using (exists (select 1 from public.profils p where p.id = auth.uid() and p.role in ('moderateur', 'admin')));

-- ==========================================================================
-- 11. STORAGE — buckets + policies
-- ==========================================================================
insert into storage.buckets (id, name, public)
values
    ('couvertures', 'couvertures', true),   -- images de couverture : publiques
    ('livres', 'livres', false),            -- PDF/EPUB : protégés
    ('audio', 'audio', false)               -- fichiers audio : protégés
on conflict (id) do nothing;

create policy "Couvertures visibles par tous"
    on storage.objects for select
    using (bucket_id = 'couvertures');

create policy "Fichiers livres visibles par les utilisateurs connectes"
    on storage.objects for select
    using (bucket_id = 'livres' and auth.role() = 'authenticated');

create policy "Fichiers audio visibles par les utilisateurs connectes"
    on storage.objects for select
    using (bucket_id = 'audio' and auth.role() = 'authenticated');

-- Aucune policy insert/update/delete sur les buckets : l'ajout de fichiers se
-- fait pour l'instant depuis le dashboard Supabase (clé service_role), en
-- attendant le circuit de contribution/modération de la Phase 5.

-- ==========================================================================
-- 12. DONNÉES DE DÉPART
-- ==========================================================================

-- --- Catégories ---
insert into public.categories (slug, nom, nom_arabe, description, icone, ordre) values
    ('aqida',  'Aqida',                       'العقيدة',  'Ouvrages fondamentaux sur la croyance et l''unicité (Tawhid).',        'fa-book-open',        1),
    ('coran',  'Coran et sciences du Coran',  'القرآن وعلومه', 'Le Saint Coran et les sciences qui lui sont liées.',              'fa-book-quran',       2),
    ('hadith', 'Hadith',                      'الحديث',   'Recueils prophétiques, explications et sciences du hadith.',          'fa-scroll',           3),
    ('fiqh',   'Fiqh',                        'الفقه',    'Jurisprudence islamique, règles cultuelles et sociales.',              'fa-scale-balanced',   4),
    ('tafsir', 'Tafsir',                      'التفسير',  'Exégèse, commentaires et sciences liées au Saint Coran.',              'fa-magnifying-glass', 5),
    ('sira',   'Sira',                        'السيرة',   'Biographie du Prophète ﷺ et histoire islamique (Tarikh).',             'fa-mosque',           6),
    ('adab',   'Adab',                        'الأخلاق والآداب', 'Éthique, comportement, spiritualité et purification de l''âme.', 'fa-heart',            7),
    ('usul',   'Usul al-Fiqh',                'أصول الفقه', 'Fondements du droit islamique et règles de déduction.',              'fa-gavel',            8),
    ('arabe',  'Langue Arabe',                'اللغة العربية', 'Grammaire, conjugaison, rhétorique et vocabulaire.',              'fa-pen-nib',          9)
on conflict (slug) do nothing;

-- --- Auteurs ---
insert into public.auteurs (slug, nom_complet, nom_arabe, epoque, bio) values
    ('an-nawawi', 'Imam Yahya ibn Sharaf An-Nawawi', 'الإمام يحيى بن شرف النووي',
     '631 H — 676 H (XIIIe siècle)',
     'L''Imam Muhyi ad-Din Yahya ibn Sharaf An-Nawawi est l''un des plus grands savants de l''islam, maître incontesté dans la jurisprudence chaféite et les sciences du hadith. Né dans le village de Nawa en Syrie, il s''installe à Damas pour y poursuivre ses études. Malgré sa courte vie (il est mort à 45 ans), l''Imam An-Nawawi a laissé un héritage scientifique colossal et béni.'),
    ('ibn-kathir', 'Ibn Kathir', 'ابن كثير', 'VIIIe siècle de l''Hégire', null),
    ('ibn-taymiyyah', 'Ibn Taymiyyah', 'ابن تيمية', 'VIIIe siècle de l''Hégire', null),
    ('ibn-al-qayyim', 'Ibn al-Qayyim', 'ابن قيم الجوزية', 'VIIIe siècle de l''Hégire', null),
    ('muhammad-ibn-abd-al-wahhab', 'Muhammad ibn Abd al-Wahhab', 'محمد بن عبد الوهاب', 'XIIe siècle de l''Hégire', null),
    ('al-bukhari', 'Imam Al-Bukhari', 'الإمام البخاري', 'IIIe siècle de l''Hégire', null),
    ('ibn-hajar-al-asqalani', 'Ibn Hajar Al-Asqalani', 'ابن حجر العسقلاني', 'IXe siècle de l''Hégire', null),
    ('ach-chafii', 'Imam Ach-Chafi''i', 'الإمام الشافعي', 'IIe siècle de l''Hégire', null),
    ('safiur-rahman-al-mubarakpuri', 'Safiur Rahman al-Mubarakpuri', null, 'XXe siècle', null),
    ('abdul-ghani-al-maqdisi', 'Abdul Ghani al-Maqdisi', null, 'VIe siècle de l''Hégire', null)
on conflict (slug) do nothing;

-- --- Livres ---
insert into public.livres
    (slug, titre, titre_arabe, auteur_id, langue, nb_pages, nb_volumes, nb_hadiths, edition, authentification, description)
select v.slug, v.titre, v.titre_arabe, a.id, v.langue, v.nb_pages, v.nb_volumes, v.nb_hadiths, v.edition, v.authentification, v.description
from (values
    ('kitab-at-tawhid', 'Kitab at-Tawhid', 'كتاب التوحيد', 'muhammad-ibn-abd-al-wahhab', 'arabe francais', 160, null, null, null, null, null),
    ('les-40-hadiths', 'Les 40 Hadiths', 'الأربعون النووية', 'an-nawawi', 'arabe francais', 120, null, null, null, null, null),
    ('tafsir-ibn-kathir', 'Tafsir Ibn Kathir', 'تفسير ابن كثير', 'ibn-kathir', 'arabe francais', null, 4, null, null, null, null),
    ('le-nectar-cachete', 'Le Nectar Cacheté', 'الرحيق المختوم', 'safiur-rahman-al-mubarakpuri', 'francais', 540, null, null, null, null, null),
    ('riyad-as-salihin', 'Riyad as-Salihin', 'رياض الصالحين', 'an-nawawi', 'arabe francais', null, null, 1900, 'Dar Al-Minhaj', 'Cheikh Al-Albani',
        'Le Jardin des Vertueux (Riyad as-Salihin) est l''un des recueils de hadiths les plus lus et les plus connus dans le monde musulman. Compilé par l''Imam An-Nawawi au XIIIe siècle, il rassemble des hadiths authentiques couvrant tous les aspects de la foi, du comportement et de la morale islamique, tirés principalement de Sahih Al-Bukhari et Sahih Muslim.'),
    ('umdat-al-ahkam', 'Umdat al-Ahkam', 'عمدة الأحكام', 'abdul-ghani-al-maqdisi', 'arabe', 280, null, null, null, null, null),
    ('al-aqida-al-wasitiyya', 'Al-Aqida al-Wasitiyya', 'العقيدة الواسطية', 'ibn-taymiyyah', 'arabe francais', 96, null, null, null, null, null),
    ('zad-al-maad', 'Zad al-Ma''ad', 'زاد المعاد', 'ibn-al-qayyim', 'arabe francais', null, 5, null, null, null, null)
) as v(slug, titre, titre_arabe, auteur_slug, langue, nb_pages, nb_volumes, nb_hadiths, edition, authentification, description)
join public.auteurs a on a.slug = v.auteur_slug
on conflict (slug) do nothing;

-- --- Rattachement livres <-> catégories (catégorie principale de chacun) ---
insert into public.livres_categories (livre_id, categorie_id)
select l.id, c.id
from (values
    ('kitab-at-tawhid', 'aqida'),
    ('les-40-hadiths', 'hadith'),
    ('tafsir-ibn-kathir', 'tafsir'),
    ('le-nectar-cachete', 'sira'),
    ('riyad-as-salihin', 'hadith'),
    ('riyad-as-salihin', 'adab'),        -- démonstration : un livre peut avoir 2 catégories
    ('umdat-al-ahkam', 'fiqh'),
    ('al-aqida-al-wasitiyya', 'aqida'),
    ('zad-al-maad', 'sira')
) as v(livre_slug, categorie_slug)
join public.livres l on l.slug = v.livre_slug
join public.categories c on c.slug = v.categorie_slug
on conflict do nothing;

-- --- Tags de démonstration ---
insert into public.tags (slug, nom) values
    ('authentique', 'Authentique'),
    ('recueil', 'Recueil'),
    ('reference', 'Ouvrage de référence')
on conflict (slug) do nothing;

insert into public.livres_tags (livre_id, tag_id)
select l.id, t.id
from (values
    ('riyad-as-salihin', 'authentique'),
    ('riyad-as-salihin', 'recueil'),
    ('les-40-hadiths', 'reference')
) as v(livre_slug, tag_slug)
join public.livres l on l.slug = v.livre_slug
join public.tags t on t.slug = v.tag_slug
on conflict do nothing;

-- ==========================================================================
-- 13. FILET DE SÉCURITÉ — profils manquants pour des comptes auth.users
--     créés avant que le trigger/les GRANT ci-dessus n'existent.
-- ==========================================================================
insert into public.profils (id, nom_complet)
select u.id, coalesce(
    u.raw_user_meta_data ->> 'nom_complet',
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    u.raw_user_meta_data ->> 'user_name'
)
from auth.users u
left join public.profils p on p.id = u.id
where p.id is null;
