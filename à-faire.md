# À faire (manuellement)

## 1. Supabase
- [ ] Exécuter `supabase/migrations/001_domino_init.sql` dans le SQL Editor du projet Supabase (le même que Cloverly et Ludo). Elle ne crée que des objets préfixés `domino_`.
- [ ] Vérifier dans **Database → Publications → supabase_realtime** que `domino_rooms`, `domino_room_players` et `domino_games` y sont, et que `domino_game_secrets` n'y est **pas**.

## 2. Environnement local
- [ ] `cp .env.example .env.local`, puis y copier les trois valeurs de `../ludo/.env.local` (même projet Supabase).
- [ ] `npm run dev`, puis ouvrir http://localhost:3002/domino. Se connecter avec un pseudo Ludo existant doit fonctionner directement.
- [ ] Tester une partie à deux : deux navigateurs (ou une fenêtre privée), deux pseudos, une salle.

## 3. Dépôt GitHub et déploiement
- [ ] Créer le dépôt GitHub (par exemple `vporel/games-domino`), puis `git init`, premier commit et push sur `main`.
- [ ] GitHub, **Settings → Secrets and variables → Actions → Variables** : `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` (les mêmes que Ludo).
- [ ] Dans `../_deploy-o2switch/projects/`, créer `domino.sh` sur le modèle de `ludo.sh` :
  ```sh
  APP_PATH="$HOME/games.vporel.com/domino"
  REPO="ssh://git@ssh.github.com:443/vporel/games-domino.git"
  ```
- [ ] Sur le serveur : générer la clé `~/.ssh/deploy_domino` et l'ajouter comme **Deploy key** (lecture seule) du dépôt (voir `../_deploy-o2switch/README.md`).
- [ ] cPanel, **Setup Node.js App**, puis **Create Application** : Node.js 20 ou plus, mode Production, Application URL `games.vporel.com/domino`, Application root `games.vporel.com/domino`, startup file `server.js`.
- [ ] Variables d'environnement de l'application : `NODE_ENV=production`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Premier déploiement : lancer le workflow à la main (`workflow_dispatch`), attendre le cron, **Restart**, puis vérifier https://games.vporel.com/domino.
- [ ] Si `/domino` n'est pas servi par cPanel, même solution de repli que Ludo (voir `../vporel-website-games/à-faire.md`, variable `GAME_ORIGIN_DOMINO`).
