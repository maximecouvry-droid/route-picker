# Route Picker — V1

Application Next.js personnelle pour afficher tous tes itinéraires Strava sur une carte, les filtrer et ouvrir le parcours choisi dans Strava.

## Fonctionnalités

- Connexion OAuth Strava
- Import paginé des itinéraires
- Superposition des traces sur OpenStreetMap
- Filtres par nom, distance et dénivelé
- Tri par distance, dénivelé ou nom
- Favoris propres à l'application, enregistrés sur l'appareil
- Ouverture de la fiche exacte avec « View on Strava »
- PWA installable
- Aucun stockage serveur ni base de données en V1

## Démarrage local

1. Installer Node.js LTS.
2. Copier `.env.example` en `.env.local`.
3. Créer une application Strava dans les réglages API.
4. Renseigner les variables.
5. Installer et lancer :

```bash
npm install
npm run dev
```

Ouvrir `http://localhost:3000`.

## Réglages de l'application Strava en local

- Website : `http://localhost:3000`
- Authorization Callback Domain : `localhost`

L'URL de retour utilisée est :

```text
http://localhost:3000/api/auth/callback
```

## Déploiement Vercel

Ajouter les quatre variables dans Vercel :

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `APP_SECRET`
- `NEXT_PUBLIC_APP_URL`

`NEXT_PUBLIC_APP_URL` doit être l'adresse publique complète, sans slash final.

Dans Strava, remplacer le domaine de callback par le domaine Vercel, par exemple :

```text
route-picker.vercel.app
```

## Sécurité

Le client secret Strava et les jetons ne sont jamais envoyés au navigateur. Les jetons sont chiffrés dans un cookie HttpOnly à l'aide de `APP_SECRET`.

Pour produire un secret aléatoire sous Windows PowerShell :

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

## Limites V1

- Le filtre géographique par ville/rayon n'est pas encore présent.
- Les favoris de l'application ne modifient pas l'étoile Strava.
- Le bouton ouvre le parcours dans Strava ; la mise en favori reste manuelle.
- Les données mises en cache localement sont propres au navigateur/appareil.


Update: install dependency:

npm install
