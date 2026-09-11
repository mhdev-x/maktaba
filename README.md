# Maktaba — مكتبة

Bibliothèque islamique numérique gratuite et open source, dédiée aux ouvrages
sur le Coran, le Hadith, la Aqida, le Fiqh et les autres sciences islamiques,
sélectionnés selon la compréhension des pieux prédécesseurs (Salaf as-Salih).

Projet né d'un besoin personnel — organiser une collection de livres
islamiques numériques — puis ouvert à la communauté comme sadaqa jariya.

## Fonctionnalités

- Catalogue de livres avec recherche, filtres par catégorie/langue, fiches auteurs
- Comptes utilisateurs (inscription/connexion via Supabase Auth)
- Favoris et suivi de progression de lecture
- Lecteur PDF intégré (PDF.js, hébergé localement — voir `js/vendor/pdfjs/`)
- Formulaire de proposition d'ouvrages par la communauté, avec modération
- 100% HTML/CSS/JavaScript vanilla — aucun framework, aucune étape de build

## Stack technique

- **Frontend** : HTML, CSS, JavaScript (sans framework), Font Awesome
- **Backend** : [Supabase](https://supabase.com) — PostgreSQL, Auth, Storage, Row Level Security

## Structure du projet

```
maktaba/
├── index.html              # Page d'accueil
├── css/                    # Styles, découpés par thème (base, navigation-hero,
│                           # composants, pages, theme-clair, pages-secondaires,
│                           # dynamique, lecteur) + responsive.css
├── js/                     # Scripts (un fichier par page + data.js partagé)
│   └── vendor/pdfjs/       # PDF.js hébergé localement
├── pages/                  # Toutes les autres pages du site
└── supabase/
    ├── schema.sql                      # Schéma complet (tables, RLS, seed)
    └── ajouter-un-livre-template.sql   # Gabarit pour ajouter un livre manuellement
```

## Installation (pour contribuer au code)

1. Clone le dépôt.
2. Crée un projet [Supabase](https://supabase.com) gratuit.
3. Dans Supabase, SQL Editor, exécute `supabase/schema.sql` (une seule fois, sur un projet neuf).
4. Renseigne l'URL et la clé anonyme de ton projet dans `js/supabase-client.js`.
5. Ouvre `index.html` avec un serveur local (ex. extension "Live Server" de VS Code) — ne pas ouvrir en `file://` directement, Supabase et les modules JS ES ont besoin d'un vrai serveur HTTP.

## Contribuer

Deux façons de participer, aucune ne nécessite de savoir coder :
- **Proposer un ouvrage** : formulaire directement sur le site (`pages/proposer.html`).
- **Contribuer au code** : voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Droits d'auteur

Maktaba ne republie que des contenus dans le domaine public, explicitement
libres de diffusion (IslamHouse.com, QuranEnc.com, HadeethEnc.com...), ou
avec l'accord de l'ayant droit. Détails complets sur la page
[Droits d'auteur](pages/droits-auteur.html) du site.

## Licence

Le code de ce projet est sous licence [MIT](LICENSE). Le contenu des ouvrages
référencés reste soumis aux droits de leurs auteurs/éditeurs respectifs.

---

*وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ*
