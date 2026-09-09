# Contribuer à Maktaba

Baarak Allahu fik pour ton intérêt à contribuer. Ce document couvre les deux
façons de participer : proposer du contenu, et contribuer au code.

## Proposer un ouvrage

Aucune compétence technique requise. Utilise le formulaire sur
`pages/proposer.html` (lien "Proposer un ouvrage" dans le pied de page du
site). Chaque proposition est examinée par un modérateur avant publication —
notamment pour vérifier les droits de republication (voir plus bas).

## Contribuer au code

### Avant de commencer

- Pour un changement mineur (correction de bug, typo, petite amélioration) :
  ouvre directement une pull request.
- Pour un changement important (nouvelle fonctionnalité, modification du
  schéma de données) : ouvre d'abord une issue pour en discuter, afin
  d'éviter le travail en double et de rester aligné avec la direction du
  projet.

### Conventions du projet

- **Pas de framework** (React, Vue...) et pas d'étape de build : le projet
  reste en HTML/CSS/JS pur, volontairement, pour rester accessible à qui
  apprend en contribuant.
- **Noms en français** : variables, fonctions, classes CSS et identifiants
  HTML sont en français dans tout le projet (ex. `chargerLivres()`,
  `.carte-livre`, `#grille-catalogue`). Merci de garder cette cohérence
  plutôt que de mélanger avec de l'anglais.
- **Gestion d'erreurs** : tout appel à Supabase doit être entouré d'un
  `try/catch` ou vérifier `error` avant de continuer — jamais d'échec
  silencieux non journalisé (`console.error`).
- **Un script par page** : chaque page a son propre fichier JS
  (`livres.js`, `auteur.js`...) ; la logique partagée va dans `js/data.js`.

### Base de données

Toute modification du schéma Supabase se fait via une modification ciblée
(`ALTER TABLE`), jamais en ré-exécutant `supabase/schema.sql` en entier sur
une base contenant déjà des données réelles (ce fichier commence par des
`DROP TABLE ... CASCADE`, pensés pour une installation initiale sur un
projet neuf).

### Tester en local

1. Un projet Supabase de test (gratuit) avec `supabase/schema.sql` exécuté.
2. Un serveur local pour servir les fichiers (ex. Live Server de VS Code) —
   pas d'ouverture en `file://`.

## Politique de droits d'auteur (importante)

Avant de proposer d'héberger un fichier (PDF, audio...), assure-toi qu'il
relève d'un de ces trois cas :
1. Domaine public (texte original d'un savant classique).
2. Autorisation explicite de republication par la source (IslamHouse.com,
   QuranEnc.com, HadeethEnc.com...), avec citation de la source obligatoire.
3. Permission directe de l'éditeur/traducteur.

Détail complet sur `pages/droits-auteur.html`. En cas de doute, ouvre une
issue plutôt que de committer le fichier.

## Signaler un bug

Une issue GitHub suffit : décris ce que tu as constaté, ce que tu attendais,
et comment reproduire le problème si possible.
