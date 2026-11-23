# Domino

Dominos multijoueur en ligne (2 à 4 joueurs) : Next.js 15 (App Router) + Supabase (Auth, Postgres, Realtime). Projet jumeau de Ludo (`../ludo`) : même pile, même design.

- Inscription et connexion **par pseudo uniquement**. Les comptes sont **communs avec Ludo** : un joueur de Ludo se connecte au Domino avec le même pseudo.
- Un joueur crée une salle et reçoit un **code à 6 chiffres** (ou un lien `/room/<code>`) à partager.
- Le bouton **Play** (réservé à l'hôte) s'active dès qu'un 2e joueur est là. Maximum 4 joueurs.
- Le serveur fait foi : mélange et distribution côté serveur, coups validés par le moteur, écriture avec la clé `service_role`.
- **Les mains restent secrètes** : chaque joueur ne reçoit que ses propres pièces.

## Installation

```bash
npm install
cp .env.example .env.local   # puis remplir les valeurs (les mêmes que Ludo)
npm run dev                  # http://localhost:3002/domino
```

Domino est servi sous `games.vporel.com/domino` (`basePath: "/domino"`, voir `src/lib/base-path.ts`). La racine du domaine appartient à la vitrine des jeux (`../vporel-website-games`).

Sans Supabase, le bac à sable http://localhost:3002/domino/dev permet de jouer seul à toutes les places (développement uniquement).

### Variables d'environnement (`.env.local`)

| Variable | Rôle |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase (le même que Cloverly et Ludo) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé `anon` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé `service_role` (serveur uniquement) |

### Supabase

1. Exécuter `supabase/migrations/001_domino_init.sql` dans le SQL Editor. Tout est préfixé `domino_` pour cohabiter avec Cloverly et Ludo.
2. Rien à configurer côté Auth : les comptes sont créés côté serveur avec l'email déjà confirmé (`<pseudo>@user.games.vporel.com`), comme pour Ludo.
3. Realtime : la migration ajoute `domino_rooms`, `domino_room_players` et `domino_games` à la publication `supabase_realtime`. La table `domino_game_secrets` (mains et pioche) n'y est volontairement pas, et aucun client ne peut la lire.

## Règles implémentées

- Jeu **double-six** (28 pièces). **7 pièces** chacun à 2 joueurs, **5 pièces** à 3 ou 4 joueurs. Le reste forme la pioche.
- Le joueur qui a **le plus gros double** l'ouvre automatiquement (sans double : la pièce la plus forte). La main passe ensuite au joueur suivant.
- À son tour, on pose une pièce qui correspond à l'une des deux extrémités. Si aucune ne va, on **pioche** une pièce à la fois jusqu'à pouvoir poser. Pioche vide et rien à poser : on **passe** (automatiquement).
- **Domino** : le premier qui pose sa dernière pièce gagne et marque la somme des points restant dans les mains adverses.
- **Jeu bloqué** (pioche vide et personne ne peut jouer) : celui qui a le moins de points en main gagne et marque la différence avec chaque adversaire. Égalité pour le minimum : pas de gagnant, 0 point.
- **Minuteur de 30 s** par action. À expiration, n'importe quel client demande au serveur de jouer automatiquement (pioche si nécessaire, puis pose la pièce la plus forte).
- Un joueur qui quitte abandonne : ses pièces retournent sous la pioche. S'il ne reste qu'un joueur, il gagne par abandon (0 point).
- Une partie = une manche. Le profil compte les parties jouées, les victoires et les **points** gagnés.

## Structure

```
src/game/            moteur pur (TS), testé : tiles, engine (règles), layout (géométrie de la table), describe (journal)
src/server/rooms.ts  accès base côté serveur + verrou optimiste (colonne version) + écriture atomique public/secret
src/app/actions/     server actions : auth, salles, coups
src/components/      Table (SVG), DominoTile, GameView, Lobby, useRoom (realtime)
src/app/dev          bac à sable local, sans Supabase (dev uniquement) : http://localhost:3002/domino/dev
supabase/migrations  schéma, RLS (lecture membres uniquement, état secret illisible), trigger « 4 joueurs max »
```

## Scripts

- `npm run dev` : serveur de développement (port 3002)
- `npm test` : tests unitaires (Vitest)
- `npm run lint`
- `npm run build` : build de production (sortie « standalone », lancé aussi par le workflow de déploiement GitHub)
# games-domino
