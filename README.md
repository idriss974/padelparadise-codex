# Padel Paradise – Plateforme de réservation et de gestion de club

Padel Paradise est une solution web complète pour les clubs de padel qui souhaitent digitaliser leur activité :
réservation de terrains, organisation de matchs publics/privés, suivi des statistiques des joueurs et interface
administrateur sécurisée.

## Aperçu des fonctionnalités

- **Réservation ultra-rapide (4 clics)** avec tarification automatique heures creuses/pleines et split payment.
- **Organisation de matchs** publics ou privés, inscriptions simplifiées, messagerie intégrée et publication des
  résultats.
- **Espace joueur** avec suivi détaillé (historique, ratios, progression, succès débloqués, réseau social interne).
- **Notifications intelligentes** (réservations, matchs, communauté) et fil d’alertes personnalisées.
- **Interface club dédiée** (URL : `/club`) avec tableau de bord, planning en temps réel, suivi des transactions
  SumUp, gestion des membres et ressources de formation.

## Démarrage rapide

1. **Installer les dépendances** – aucune dépendance externe n’est requise : la plateforme fonctionne en Node.js natif.
2. **Lancer le serveur** :
   ```bash
   npm run dev
   ```
   Le site est disponible sur `http://localhost:3000`.
3. **Connexion administrateur** :
   - URL : `http://localhost:3000/club`
   - Identifiant : `admin@padelparadise.club`
   - Mot de passe : `ClubPadel!2025`

Un fichier `data/db.json` est généré automatiquement au premier lancement avec ce compte administrateur et la structure
initiale de données.

## Architecture

```
├── public/                # Front-end statique (site public + interface club)
│   ├── assets/
│   │   ├── images/        # Logo, avatars, visuels
│   │   └── js/            # Logique front (site + interface club)
│   ├── styles/            # Feuilles de styles
│   └── club/              # Interface administrateur
├── lib/                   # Helpers serveur (auth, DB, stats, validations)
├── data/                  # Base JSON persistante (créée au démarrage)
├── docs/                  # Documentation administrateur
├── server.js              # Serveur Node HTTP + API REST
└── package.json
```

### API principale

- `POST /api/auth/register` – inscription utilisateur (hashage scrypt + création stats).
- `POST /api/auth/login` / `POST /api/auth/logout` – sessions sécurisées (JWT signé HMAC + cookie HttpOnly).
- `GET/PUT /api/users/me` – profil et statistiques du joueur connecté.
- `GET/POST /api/reservations` – réservation de terrains (anti-conflits, split payment, notifications).
- `GET/POST /api/matches` – gestion des matchs, inscriptions, messagerie, publication des résultats.
- `GET /api/community/players` – recherche de joueurs, follow/unfollow.
- `GET /api/notifications` – alertes personnalisées.
- **Espace club** : `/api/admin/dashboard`, `/api/admin/reservations`, `/api/admin/transactions`, `/api/admin/members`.

## Sécurité & conformité

- Sessions utilisateurs signées (`HS256`), cookies HttpOnly + SameSite.
- Hashage des mots de passe via `crypto.scrypt` + salage aléatoire.
- Accès administrateur protégé, vérification systématique des privilèges côté serveur.
- Gestion des conflits de réservation et validation des entrées (emails, dates ISO, durées).
- Endpoints de paiement prêts pour l’intégration SumUp (`/api/payments/sumup` – sandbox simulée).

## Documentation club

- Accès : `/docs/ADMIN_GUIDE.html` (également exposé dans l’interface club).
- Contenu : parcours administrateur, suivi financier, gestion des membres, bonnes pratiques.
- Formation vidéo intégrée (iframe YouTube) accessible dans l’onglet « Ressources ».

## Déploiement

- La plateforme est stateless : il suffit de déployer le dossier (Node 18+ recommandé).
- Configurer `PORT`, `APP_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` pour adapter l’environnement.
- Les données sont stockées dans `data/db.json` (volume persistant conseillé en production).

## Tests rapides

```bash
npm run dev
# Ouvrir http://localhost:3000 et réaliser :
# 1. Inscription d’un joueur
# 2. Réservation (heures creuses + heures pleines)
# 3. Création/inscription à un match
# 4. Connexion administrateur sur /club
```

Padel Paradise est prêt pour votre club – bon match !
