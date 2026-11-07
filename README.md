# NOUR Center — Application de gestion scolaire

Application web responsive de gestion du centre de soutien scolaire NOUR. Elle réunit les espaces Administrateur, Professeur et Élève, avec authentification par rôle, paiements mensuels, ressources pédagogiques, accès par QR, sauvegarde vers Google Sheets et PWA.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Parcours et écrans](#parcours-et-écrans)
- [Architecture et données](#architecture-et-données)
- [Technologies](#technologies)
- [Prérequis et configuration](#prérequis-et-configuration)
- [Base de données et migrations](#base-de-données-et-migrations)
- [Créer le premier compte](#créer-le-premier-compte)
- [Fonctionnement par rôle](#fonctionnement-par-rôle)
- [Documents PDF et Supabase Storage](#documents-pdf-et-supabase-storage)
- [PWA et QR code](#pwa-et-qr-code)
- [Sauvegardes, Google Sheets et mode hors ligne](#sauvegardes-google-sheets-et-mode-hors-ligne)
- [Commandes et tests](#commandes-et-tests)
- [Mise en production](#mise-en-production)
- [Sécurité et limites connues](#sécurité-et-limites-connues)
- [Fonctionnalités non incluses](#fonctionnalités-non-incluses)

## Fonctionnalités

- **Administration** : création des niveaux et groupes, attribution d’un professeur et de sa commission, inscription des élèves avec un tarif mensuel personnalisé pour chaque matière, filtres, cartes d’accès avec Code ID/PIN et QR signé, paiements mensuels, rappels WhatsApp, calcul de la part des professeurs et contrôle QR à l’entrée.
- **Professeurs** : consultation des groupes qui leur sont affectés, de leurs élèves et de leurs ressources; ajout de cours, séries d’exercices, examens datés et liens externes; suppression de leurs propres ressources.
- **Élèves** : accueil mobile, matières suivies, examens à venir, ressources classées par type, état de paiement personnel et QR code d’accès.
- **Authentification** : connexion des élèves et professeurs par Code ID ou téléphone marocain et PIN à quatre chiffres; connexion Admin par Code ID et mot de passe de 12 caractères minimum. Sessions révocables et contrôle des accès côté serveur.
- **PWA** : manifeste installable, icônes, raccourcis et service worker. Les pages privées ne sont pas mises en cache par le service worker; les vues Élèves/Paiements de l’Admin disposent d’un cache IndexedDB séparé par compte et en lecture seule.
- **Sauvegardes** : outbox PostgreSQL pour synchroniser les changements vers Google Sheets, export Excel réservé aux Admins, journal d’état et vues élèves/paiements en cache local en lecture seule.

## Technologies

- Node.js 22.12 ou plus récent, Next.js 16.4.5, React 19 et TypeScript.
- PostgreSQL (par exemple Supabase) et Prisma 7 avec l’adaptateur PostgreSQL.
- Tailwind CSS, `qrcode.react` pour les QR codes et `html5-qrcode` pour le scanner.
- Supabase Storage REST pour conserver les PDF dans un bucket privé.

## Prérequis et configuration

1. Installer Node.js 22.12+ et npm.
2. Installer les dépendances et créer le fichier d’environnement :

   ```bash
   npm ci
   cp .env.example .env
   ```

3. Créer un secret aléatoire et le copier dans `AUTH_SECRET` :

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
   ```

4. Renseigner les variables du fichier `.env` :

   | Variable | Requise | Description |
   |---|---:|---|
   | `DATABASE_URL` | Oui | URL PostgreSQL utilisée par l’application (pooler transactionnel possible). |
   | `DIRECT_URL` | Oui | URL PostgreSQL pour Prisma Migrate, de préférence connexion directe ou pooler de session. |
   | `APP_ORIGIN` | Oui | Origine exacte de l’application, sans chemin, par exemple `http://localhost:3000`. En production, utiliser l’origine HTTPS publique. |
   | `AUTH_SECRET` | Oui | Secret aléatoire long pour signer les sessions; ne pas le publier ni le réutiliser dans les tests. |
   | `RESEND_API_KEY` | Pour la récupération Admin | Clé serveur Resend utilisée pour envoyer les codes de vérification et de récupération; ne pas l’exposer au navigateur. |
   | `RECOVERY_EMAIL_FROM` | Pour la récupération Admin | Expéditeur vérifié dans Resend, par exemple `NOUR <securite@votre-domaine.ma>`. |
   | `TRUSTED_IP_HEADER` | Non | En-tête d’adresse client uniquement si un reverse proxy de confiance l’écrase systématiquement. Laisser vide sinon. |
   | `SUPABASE_URL` | Pour les PDF | URL du projet Supabase. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Pour les PDF | Clé serveur Supabase; ne jamais l’exposer dans le navigateur ou avec un préfixe `NEXT_PUBLIC_`. |
   | `SUPABASE_STORAGE_BUCKET` | Pour les PDF | Nom du bucket privé; valeur d’exemple : `nour-resources`. |
   | `GOOGLE_SHEETS_SPREADSHEET_ID` | Pour Google Sheets | Identifiant du classeur partagé avec le compte de service. |
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Pour Google Sheets | Adresse du compte de service Google. |
   | `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Pour Google Sheets | Clé privée du compte de service; secret serveur uniquement. |
   | `BACKUP_CRON_SECRET` | Pour le worker | Secret aléatoire d’au moins 32 octets pour autoriser le worker HTTP. |
   | `BACKUP_STORAGE_BUCKET` | Pour la sauvegarde XLSX hebdomadaire | Bucket Supabase Storage **privé**, dédié aux exports automatiques. |
   | `BACKUP_RETENTION_DAYS` | Non | Rétention XLSX hebdomadaire, de 1 à 3650 jours; défaut 365. |

5. Appliquer les migrations puis démarrer :

   ```bash
   npm run db:deploy
   npm run dev
   ```

   Ouvrir [http://localhost:3000/login](http://localhost:3000/login).

Ne pas utiliser les valeurs d’exemple de `.env.example` comme identifiants réels. `DATABASE_URL`, `DIRECT_URL`, les clés Supabase et `AUTH_SECRET` sont des secrets d’exploitation.

## Base de données et migrations

Le schéma Prisma est dans `prisma/schema.prisma`. Les migrations versionnées sont :

1. `202611060001_initial` — niveaux, groupes, comptes, inscriptions, paiements et ressources.
2. `202611060002_auth` — sessions révocables et limitation des tentatives de connexion.
3. `202611060003_payment_lines` — ventilation figée des factures par groupe, niveau et professeur pour le calcul de la paie.
4. `202611060004_exam_date` — date et heure des examens.
5. `202611060005_admin_password_signed_qr` — hash de mot de passe administrateur et version de révocation des QR codes.
6. `202611060006_backup_outbox` — événements d’outbox, journal de sauvegarde et verrou du worker.
7. `202611060007_weekly_excel_storage` — stockage externe des sauvegardes XLSX et jeton de propriété des leases d’événements.
8. `202611060008_student_enrollment_pricing` — ajoute un tarif mensuel à chaque inscription élève-matière et reporte les anciens tarifs de groupe sur les inscriptions existantes.
9. `202611060009_admin_password_recovery` — email de récupération vérifié et codes temporaires pour réinitialiser le mot de passe Admin.

La migration 5 révoque également les sessions Admin existantes. Après son déploiement, les QR imprimés avant la mise à jour doivent être remplacés depuis la gestion des élèves; cette opération renouvelle le PIN de l’élève et invalide le QR précédent.

Déployer les migrations avec `npm run db:deploy`. Il n’y a pas de compte précréé. Pour une base nouvelle, lancer toutes les migrations avant de créer le compte administrateur. Pour une base déjà existante, sauvegarder et comparer son schéma et son historique Prisma avant tout déploiement; ne pas rejouer une migration initiale sur une base déjà initialisée. Si la base n’a pas été gérée par Prisma Migrate, établir et vérifier un baseline selon la procédure Prisma avant d’ajouter les migrations suivantes.

Les anciens tarifs étaient enregistrés au niveau du groupe. La migration 8 les copie vers chaque inscription existante; à partir de cette migration, le tarif est défini individuellement par élève et par matière. Les factures conservent leurs lignes et tarifs figés lors de leur création : modifier le tarif d’une inscription affecte les prochaines factures, pas les factures déjà créées. Les factures anciennes sans ventilation historique sont reconstituées à partir des prix, inscriptions et commissions disponibles au moment de la migration, et ne peuvent pas restituer des tarifs historiques qui n’avaient pas été enregistrés.

## Parcours et écrans

| Espace | URL | Ce que l’utilisateur peut faire |
|---|---|---|
| Connexion | `/login` | Se connecter avec son Code ID ou son numéro de téléphone et son PIN; les Administrateurs utilisent un mot de passe. |
| Admin | `/admin/dashboard` | Accéder aux fonctions d’administration, consulter l’état des sauvegardes et télécharger le registre Excel. |
| Admin | `/admin/classes` | Créer des niveaux et leurs groupes/matières et choisir un professeur actif ainsi que sa commission. |
| Admin | `/admin/students` | Créer un élève, choisir son niveau et ses matières, fixer un tarif mensuel différent pour chaque matière, modifier ensuite chaque tarif, rechercher/filtrer les inscriptions, parcourir 30 élèves par page, afficher ou imprimer sa carte d’accès, réinitialiser son PIN et révoquer son QR précédent. |
| Admin | `/admin/payments` | Filtrer par mois et niveau, rechercher par nom ou Code ID, parcourir 30 factures par page, consulter les montants attendus/encaissés/restants, enregistrer PAID/PARTIAL/UNPAID, ouvrir un rappel WhatsApp et consulter la paie calculée des professeurs. |
| Admin | `/admin/scan` | Ouvrir la caméra après autorisation, scanner un QR signé et vérifier l’état de paiement du mois courant. |
| Professeur | `/teacher/space` | Voir uniquement ses groupes, les élèves inscrits et les ressources; publier PDF ou liens externes et retirer ses ressources. |
| Élève | `/student/home` | Voir ses groupes, les examens proches et les dernières ressources disponibles. |
| Élève | `/student/subjects/[groupId]` | Voir les ressources du groupe auquel il est inscrit, par type, et ouvrir/télécharger les documents autorisés. |
| Élève | `/student/account` | Voir son propre état de paiement courant et afficher son QR d’accès. |

### Flux de travail

1. L’exploitant prépare la base, applique les migrations et crée le premier compte Admin avec le script serveur.
2. L’Admin crée les comptes professeurs depuis `/admin/classes`, puis crée les niveaux et groupes et attribue les enseignants. `npm run account:create` reste disponible pour l’exploitant du serveur.
3. L’Admin inscrit les élèves aux groupes et définit le prix mensuel de chaque matière pour chaque élève. Le système produit le Code ID, le PIN initial et le QR signé; les identifiants doivent être remis confidentiellement.
4. L’Admin met à jour le paiement mensuel. Le total est calculé comme la somme des tarifs d’inscription de l’élève; une facture conserve un instantané de ses lignes, tarifs et taux de commission.
5. Le professeur publie des cours, exercices ou examens datés pour ses groupes. L’élève consulte uniquement les ressources correspondant à ses inscriptions.
6. À l’entrée, l’Admin scanne la carte; le serveur vérifie la signature, la version du QR et l’état du paiement.
7. Les événements d’inscription/paiement rejoignent l’outbox PostgreSQL et sont synchronisés vers Google Sheets séparément du flux métier. L’Admin peut aussi télécharger un export Excel.

## Architecture et données

- **Interface** : Next.js App Router, composants React et Server Actions. Les pages à accès restreint sont sous `/admin`, `/teacher` et `/student`.
- **Contrôle d’accès** : `src/proxy.ts` applique les vérifications de session et de rôle aux routes ciblées. Les Server Actions et API vérifient également leur autorisation; la protection du proxy n’est pas le seul contrôle.
- **API** :
  - `/api/auth/login` (POST), `/api/auth/logout` (POST) et `/api/auth/session` (GET) gèrent les sessions.
  - `/api/admin/scan` (POST) valide un QR et consulte le paiement courant.
  - `/api/teacher/resources` (POST) reçoit les ressources PDF; les routes de téléchargement vérifient l’accès avant de créer un lien signé.
  - `/api/backup/data`, `/api/backup/status`, `/api/backup/excel` et `/api/backup/excel/latest` sont réservées à l’Admin.
  - `/api/backup/worker` (POST) traite la file; (GET) demande le full sync et l’archive XLSX hebdomadaire. Les deux méthodes exigent `Authorization: Bearer <BACKUP_CRON_SECRET>`.
- **Base** : PostgreSQL via Prisma 7 et `@prisma/adapter-pg`. Les modèles principaux sont `User`, `Level`, `SubjectGroup`, `Enrollment`, `Payment`, `PaymentLine`, `Resource`, `AuthSession`, `AuthRateLimit`, `BackupEvent`, `BackupLog` et `BackupWorkerLock`.
- **Paiements** : les montants sont des `Decimal` en base et les calculs financiers utilisent des centimes entiers. Les périodes mensuelles suivent l’heure `Africa/Casablanca`; les commissions sont calculées sur les montants effectivement encaissés et ventilées selon les lignes figées de la facture.
- **Sauvegarde** : les événements de sauvegarde sont persistés avec la transaction d’inscription ou de paiement. Le worker détient un verrou persistant, traite les événements par lots et réessaie les erreurs avec un délai borné. Google Sheets est une destination externe configurée séparément.
- **Fichiers** : les PDF résident dans un bucket Supabase Storage privé. Les liens signés de téléchargement sont de courte durée et ne remplacent pas le contrôle d’accès applicatif.
- **Hors ligne** : IndexedDB conserve localement les vues Admin Élèves/Paiements déjà chargées. Ce mode est en lecture seule et n’assure pas le premier chargement sans réseau.

## Créer le premier compte

La commande `npm run account:create` est réservée à l’exploitant du serveur. Elle crée un compte et ne modifie pas un compte existant. Pour le premier compte Admin, après avoir appliqué toutes les migrations, exemple Bash :

```bash
export ACCOUNT_CODE=NOUR-1001
export ACCOUNT_NAME='Direction NOUR'
export ACCOUNT_ROLE=ADMIN
export ACCOUNT_PHONE='+212612345678'
read -rsp 'Mot de passe Admin (12 caractères minimum) : ' ACCOUNT_PASSWORD
export ACCOUNT_PASSWORD
npm run account:create
unset ACCOUNT_PASSWORD
```

`ACCOUNT_PHONE` est facultatif. Pour un `ADMIN`, `ACCOUNT_PASSWORD` est requis (12 à 128 caractères); le compte ne peut pas se connecter avec son PIN. Le mot de passe est stocké avec Argon2id et n’est ni affiché ni journalisé. Pour les rôles `TEACHER` et `STUDENT`, utiliser `ACCOUNT_ROLE=TEACHER` ou `STUDENT` et fournir un PIN de quatre chiffres comme texte dans `ACCOUNT_PIN`.

Pour donner un mot de passe à un compte administrateur déjà présent après déploiement de la migration 5 :

```bash
export ACCOUNT_CODE=NOUR-1001
read -rsp 'Nouveau mot de passe Admin (12 caractères minimum) : ' ACCOUNT_PASSWORD
export ACCOUNT_PASSWORD
npm run account:set-admin-password
unset ACCOUNT_PASSWORD
```

Cette opération met à jour le hash Argon2id et révoque toutes les sessions existantes de cet Admin. Les comptes Admin existants sans `passwordHash` ne peuvent plus se connecter avec leur ancien PIN; un opérateur doit leur définir un mot de passe par cette commande avant leur prochaine connexion.

## Fonctionnement par rôle

### Administrateur

- `/admin/dashboard` — tableau de bord et navigation générale.
- `/admin/classes` — créer des niveaux; créer des groupes/matières sous un niveau; affecter un professeur actif et renseigner le pourcentage de commission du professeur.
- `/admin/students` — créer les élèves, les inscrire aux groupes de leur niveau et saisir un tarif mensuel en MAD pour chaque matière choisie; modifier ensuite un tarif avec l’action crayon; chercher par nom et filtrer par niveau ou groupe; afficher/imprimer une carte d’accès.
- `/admin/payments` — consulter un mois et un niveau; enregistrer un paiement complet ou partiel; suivre le total encaissé, les montants restants et les statuts; préparer un rappel WhatsApp; consulter la paie des professeurs.
- `/admin/scan` — ouvrir la caméra du téléphone ou de l’ordinateur et lire le QR code d’un élève. La réponse indique l’état du mois courant selon l’heure du Maroc.
- `/admin/settings` — enregistrer et vérifier l’email de récupération du compte Admin.

En cas d’oubli du mot de passe, le lien **Mot de passe Admin oublié ?** sur la page de connexion envoie un code à six chiffres à l’adresse de récupération vérifiée. Le code expire après 10 minutes, est limité à cinq essais et ne peut servir qu’une fois. Après réinitialisation, toutes les sessions Admin existantes sont révoquées. Configurer `RESEND_API_KEY` et un expéditeur vérifié `RECOVERY_EMAIL_FROM`, appliquer la migration 9, puis enregistrer et vérifier l’adresse depuis `/admin/settings` tant que l’Admin est encore connecté. Si aucun email n’a été vérifié ou si le service email est indisponible, l’exploitant peut toujours utiliser la commande serveur `npm run account:set-admin-password`.

Le Code ID élève est généré côté serveur au format `NOUR-####` et le PIN est aléatoire. Seul le hash du PIN est conservé. La carte d’accès révèle le PIN initial à l’administrateur dans la session où il est généré; afficher de nouveau une carte existante nécessite de confirmer une réinitialisation du PIN, révoque les sessions de l’élève et invalide ses QR précédents. Le QR contient un jeton HMAC signé par le serveur, pas seulement le Code ID. Il reste stable jusqu’à sa révocation par renouvellement de carte/PIN; le scanner rejette les anciens QR et les valeurs falsifiées.

Le montant d’une facture est calculé en additionnant les tarifs individuels des matières auxquelles l’élève est inscrit. Un tarif peut être modifié dans `/admin/students`; une nouvelle facture prendra le tarif actualisé, sans changer les lignes des factures déjà créées. La première création de la facture mensuelle enregistre un instantané de ses lignes, montants et taux de commission. Les avances sont réparties au prorata entre les matières, et les parts des professeurs sont calculées sur les montants effectivement encaissés. Un lien WhatsApp ouvre une conversation préremplie avec le téléphone enregistré; l’envoi reste à confirmer par l’utilisateur dans WhatsApp.

### Sauvegardes, Google Sheets et mode hors ligne

- Les créations d’élèves/inscriptions et modifications de paiements enregistrent un événement dans PostgreSQL au sein de la transaction métier. La synchronisation Google est ensuite traitée par le worker; une panne Google ne fait donc pas échouer l’opération métier.
- Le worker synchronise les lignes par Code ID et reprend les échecs avec un délai exponentiel (30 secondes à 24 heures). Une planification hebdomadaire déclenche aussi une synchronisation complète.
- `POST /api/backup/worker` traite la file; `GET /api/backup/worker` demande le full sync Google et génère un XLSX hebdomadaire dans le bucket privé `BACKUP_STORAGE_BUCKET`. Le fichier est relu et vérifié avant l’enregistrement de son chemin de stockage dans `BackupLog`. Chaque version dispose d’une clé unique; les fichiers expirés sont supprimés selon `BACKUP_RETENTION_DAYS`.
- L’Admin peut télécharger le dernier XLSX hebdomadaire stocké ou générer un export manuel depuis le tableau de bord. Les exports manuels ne sont pas stockés automatiquement.
- `/api/backup/worker` est réservé à un appel serveur avec `Authorization: Bearer <BACKUP_CRON_SECRET>`; l’Admin consulte l’état dans le tableau de bord. Les exports Excel sont disponibles via des endpoints Admin-only.
- Les pages Élèves et Paiements conservent des snapshots IndexedDB versionnés et séparés par compte Admin dans une installation NOUR mono-centre. Lorsqu’une page est déjà ouverte, la coupure réseau laisse ses données fraîches en lecture seule; une navigation directe hors ligne vers ces deux pages utilise le shell public `offline.html` et lit le snapshot correspondant. Sans snapshot correspondant, un message d’indisponibilité s’affiche.
- Le shell hors ligne n’est mis en cache qu’après une première visite en ligne. L’IndexedDB est en clair et la page offline ne peut pas revalider la session auprès du serveur; utiliser uniquement sur un appareil Admin de confiance, protéger l’appareil et se déconnecter en ligne après usage.
- La configuration détaillée de Google Cloud, les exemples de planification du worker et les procédures de vérification/reprise sont dans [docs/step-7-backup-setup.md](./docs/step-7-backup-setup.md).
- Le bilan d’implémentation, les preuves par fichiers, les limites connues et ce qui reste à valider sur les services externes sont dans [docs/step-7-completion-audit.md](./docs/step-7-completion-audit.md).
- PostgreSQL reste la source de vérité : définir indépendamment des sauvegardes chiffrées, une rétention recommandée de 30 quotidiennes + 12 mensuelles, une cible RPO de 15 minutes et RTO de 2 heures, et tester mensuellement la restauration dans une base isolée. Ces cibles ne sont pas garanties par le code; le guide décrit les étapes opérationnelles.

### Professeur

- `/teacher/space` — groupes attribués, niveaux, élèves inscrits et ressources pédagogiques.
- Les ressources sont de type `COURSE`, `EXERCISE` ou `EXAM`; un examen comprend une date et une heure.
- Le professeur peut publier un PDF privé ou un lien externe HTTP(S), et supprimer ses propres ressources. Il ne voit ni ne modifie les groupes des autres professeurs.

### Élève

- `/student/home` — accueil, groupes inscrits, examens proches et résumé de son propre paiement.
- `/student/subjects/[groupId]` — cours, exercices et examens du groupe, répartis en onglets; les fichiers et liens sont accessibles depuis leur bouton d’ouverture.
- `/student/account` — paiement personnel du mois courant et QR code à présenter à l’entrée.
- La navigation mobile est disponible en bas de l’écran; une navigation adaptée au bureau est également fournie.

Un élève ne peut ouvrir que les ressources des groupes auxquels il est inscrit. Son espace n’affiche jamais les paiements des autres élèves.

## Documents PDF et Supabase Storage

Pour activer l’envoi de PDF :

1. Créer dans Supabase le bucket dont le nom est défini par `SUPABASE_STORAGE_BUCKET`.
2. Le laisser **privé**; l’application utilise les variables serveur `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`.
3. Redémarrer l’application après configuration.

Les PDF sont limités à 10 Mo et leur type et signature de fichier sont vérifiés. Les téléchargements passent par une route serveur qui vérifie l’identité et le rôle du demandeur; pour un élève, elle vérifie aussi l’inscription au groupe. Les URL signées expirent après cinq minutes. Un lien externe n’est pas hébergé par NOUR et reste soumis à la disponibilité et aux règles du site tiers.

## PWA et QR code

Le manifeste est `public/manifest.json`, les icônes sont dans `public/icons/` et le service worker est `public/sw.js`. Le QR d’accès de l’élève est un jeton HMAC-SHA256 versionné, signé avec `AUTH_SECRET` et lié au Code ID et à sa version courante en base. Le serveur compare la signature en temps constant; réinitialiser la carte augmente la version et révoque les QR imprimés auparavant. Le jeton ne porte pas de date d’expiration afin que la carte reste utilisable, mais toute rotation de `AUTH_SECRET` invalide les QR existants et impose de régénérer les cartes. Une copie non autorisée d’un QR valide reste utilisable jusqu’à révocation; le QR signé empêche la fabrication/altération, pas le rejeu d’une carte copiée.

L’application peut être installée depuis un navigateur compatible :

- En développement, utiliser `localhost`.
- En production, servir le site en HTTPS. Les permissions caméra du scanner exigent aussi un contexte sécurisé et l’autorisation de l’utilisateur.
- Sur les navigateurs mobiles, utiliser l’action d’installation du navigateur; sur iOS/Safari, utiliser « Ajouter à l’écran d’accueil » si proposé.

Le service worker ne met pas en cache les pages authentifiées, les API ou les documents privés. Il conserve uniquement le shell public `offline.html`/`offline.js` qui peut lire les snapshots locaux des pages Élèves/Paiements de l’Admin. Les autres écrans nécessitent le réseau. La caméra du scanner est démarrée après action explicite de l’administrateur; les résultats du scan sont récupérés par une API protégée et ne sont pas contenus dans le QR.

## Commandes et tests

```bash
npm run dev                 # serveur local de développement
npm test                    # tests unitaires
npm run typecheck           # vérification TypeScript
npx prisma validate         # validation du schéma Prisma
npm run build               # génération Prisma et build de production
npm start                   # serveur Next.js de production (après le build)
npm run db:generate         # générer le client Prisma
npm run db:deploy           # appliquer les migrations en attente
npm run loadtest:seed       # créer un jeu synthétique (base locale dédiée uniquement)
npm run loadtest:clean      # retirer uniquement le jeu synthétique DEMO-LOAD
```

Le jeu de charge ajoute 500 élèves, 12 professeurs, 20 groupes, environ 1 500 inscriptions et 500 factures avec tarifs variables et statuts PAID/PARTIAL/UNPAID. Les scripts sont volontairement limités à la base locale `nour` sur `127.0.0.1:55440`; ils refusent toute autre base et n’utilisent que le préfixe réservé `DEMO-LOAD-202611`. Garder ces comptes de démonstration séparés des données réelles. Après le test, exécuter `npm run loadtest:clean`; le script refuse de supprimer les données s’il détecte des liens vers des élèves, groupes ou professeurs non-DEMO.

Les tests navigateur/API Playwright créent puis suppriment des utilisateurs et données d’essai. Ils exigent une **base PostgreSQL dédiée et jetable** avec toutes les migrations appliquées. Ne jamais les diriger vers la base de production, une base réelle, ni une base contenant des données utilisateur.

Exemple, après avoir créé une base isolée réservée aux tests :

```bash
npx playwright install chromium
export DATABASE_URL='postgresql://nour_test:local_test_password@127.0.0.1:5432/nour_test'
export DIRECT_URL="$DATABASE_URL"
export APP_ORIGIN='http://127.0.0.1:3100'
export AUTH_SECRET='secret-de-test-aleatoire-et-jetable'
export NOUR_TEST_DATABASE=1
npm run db:deploy
npx playwright test
```

Playwright démarre son serveur sur `127.0.0.1:3100`. Les tests E2E refusent de démarrer sans `NOUR_TEST_DATABASE=1` et les deux URL de base. Les tests unitaires ne nécessitent pas la base PostgreSQL. Vérifier également l’état du bucket Supabase séparément dans un environnement de test configuré avant de publier des PDF en production.

La suite comprend 27 tests unitaires et 16 tests navigateur/API Playwright. Les E2E ne sont exécutés que contre une base PostgreSQL jetable, jamais contre la production. L’audit de sauvegarde explique les tests exécutés et les intégrations externes non vérifiées dans [docs/step-7-completion-audit.md](./docs/step-7-completion-audit.md).

## Mise en production

1. Provisionner PostgreSQL et configurer les variables d’environnement de production.
2. Configurer un domaine HTTPS et renseigner `APP_ORIGIN` avec son origine exacte.
3. Créer le bucket privé `SUPABASE_STORAGE_BUCKET` pour les PDF si nécessaire et le bucket privé distinct `BACKUP_STORAGE_BUCKET` pour activer les archives XLSX hebdomadaires.
4. Déployer les migrations avec `npm run db:deploy` depuis un environnement autorisé à joindre `DIRECT_URL`.
5. Construire avec `npm run build`, puis démarrer avec `npm start` ou le runtime Node compatible de l’hébergeur.
6. Créer le compte administrateur via une commande sécurisée d’administration/serveur; ne pas exposer le script de création comme endpoint public.
7. Configurer le worker fréquent et le scheduler hebdomadaire depuis un gestionnaire de secrets; vérifier la durée maximale d’exécution du GET.
8. Tester l’authentification, les restrictions de rôle, les paiements, le téléchargement privé, l’installation PWA et les permissions caméra sur le domaine de production.

Le projet cible Next.js 16.4.5. Le contrôle des requêtes utilise la convention `proxy.ts` (migrée depuis `middleware.ts`), exécutée dans le runtime Node.js de Next.js 16. La compilation utilise Turbopack par défaut. Ne pas rétrograder vers Next.js 15 sans rétablir et tester sa convention de middleware.

## Sécurité et limites connues

- Les routes et actions serveur vérifient le rôle et l’accès à la ressource; les layouts seuls ne constituent pas une protection.
- Les sessions sont signées en JWT et conservées dans un cookie HttpOnly; leur révocation est vérifiée en base. Le PIN est haché avec Argon2id et n’est jamais renvoyé dans une réponse de connexion.
- Les Admins s’authentifient uniquement avec un mot de passe de 12 à 128 caractères haché via Argon2id; leur PIN n’est jamais accepté par la connexion. Les élèves et professeurs conservent le PIN à quatre chiffres, qui reste une limite de sécurité pour ces profils.
- Le QR de présence est signé et versionné, mais stable pour permettre une carte imprimée. En cas de perte ou de partage, régénérer la carte depuis `/admin/students`; cela change le PIN, invalide l’ancien QR et révoque les sessions de l’élève.
- La connexion applique une limitation des tentatives stockée en base. `TRUSTED_IP_HEADER` doit rester vide si le proxy n’est pas explicitement fiable et configuré pour écraser cet en-tête.
- Les mutations vérifient l’origine attendue; ne pas ajouter de mutation par requête GET.
- Le worker réessaie les erreurs temporaires avec un délai exponentiel de 30 secondes à 24 heures et un plafond de 20 tentatives. Les erreurs HTTP 4xx non temporaires sont considérées permanentes; un Admin peut reprogrammer les événements FAILED depuis le tableau de bord.
- Garder les pages authentifiées, les API privées et les fichiers PDF hors de tout cache CDN/service worker partagé.
- Prévoir l’exploitation et la sauvegarde de PostgreSQL, la rotation des secrets et le nettoyage périodique des anciennes lignes d’authentification expirées.
- Google Sheets est une copie secondaire, pas un remplacement de la sauvegarde PostgreSQL. Configurer et tester séparément des sauvegardes PostgreSQL et leur procédure de restauration.
- Après la création d’un élève, l’Admin peut ouvrir WhatsApp avec le numéro de l’élève/parent et un message prérempli contenant le Code ID, le PIN initial et le lien de connexion. Il doit vérifier le destinataire et confirmer l’envoi dans WhatsApp; aucun message n’est envoyé automatiquement par l’application.
- L’intégration réelle avec Supabase Storage et les tests E2E nécessitent des environnements configurés séparément; le build local ne valide ni les identifiants Supabase ni la disponibilité d’un serveur PostgreSQL.
- L’Excel hebdomadaire durable exige un bucket Supabase distinct et privé nommé dans `BACKUP_STORAGE_BUCKET`; sans configuration, le GET hebdomadaire enregistre un échec au lieu de déclarer une sauvegarde réussie.
- Le cache offline contient des données Admin en clair et s’appuie sur la sécurité physique du navigateur/appareil. Il n’est ni une sauvegarde serveur ni une authentification hors ligne.
- À la date de cette mise à jour, les dépendances installées passent `npm audit` sans vulnérabilité connue. Réexécuter cet audit régulièrement et appliquer les correctifs de sécurité.

## Fonctionnalités non incluses

Les éléments suivants ne sont pas proposés par l’interface actuelle et ne doivent pas être considérés comme livrés : désactivation des comptes professeur depuis l’Admin, édition/suppression/archivage des niveaux et groupes, suppression/archivage des élèves, désinscription avec historique, reçus PDF, export CSV/Excel métier distinct du registre de sauvegarde, remises et frais d’inscription, validation de paie « payé/non payé », journal de présence des scans, journal d’audit utilisateur, gestion d’année scolaire et réinscriptions, emploi du temps, notes, notifications applicatives. L’interface principale est disponible en français et en arabe (RTL). Les données saisies, les exports et certains messages techniques des services externes conservent leur langue d’origine.


## Langues, recherches et suivi des mois

- Le sélecteur **Français / العربية** est accessible sur chaque écran. Le choix est conservé par cookie pendant un an et appliqué au rendu serveur, aux libellés et au sens de lecture. Les noms, matières et autres données saisies ne sont pas traduits.
- Les recherches acceptent les accents français, les variantes de lettres et signes diacritiques arabes, plusieurs mots et les numéros marocains avec ou sans espaces/préfixe international. Les élèves peuvent être filtrés par niveau, matière et activation du compte ; les paiements par période, niveau et statut.
- Dans **Paiements**, sélectionnez n’importe quel mois de 2000 à 9999, ou utilisez **Mois précédent / actuel / suivant**. Les règlements des mois passés et futurs sont indépendants. Le total à payer est figé lors de la création de chaque facture.
- **Total versé MAD** correspond au montant cumulé déjà encaissé pour le mois : saisir 150 remplace le cumul par 150, et n’ajoute pas 150 au montant précédent. **Payé** règle le total. **Impayé** remet le montant encaissé à zéro après confirmation.
- **Historique** affiche les douze mois de l’année choisie, leurs montants et le total encaissé. L’Admin peut cocher plusieurs mois réglés avant le démarrage de l’application et les enregistrer d’un seul coup. Les factures déjà existantes conservent leur montant; les nouvelles sont créées au tarif actuel des groupes de l’élève. Les mois déjà payés et les périodes futures ne peuvent pas être cochés.
- Les indicateurs de règlements suivent la recherche et le statut sélectionné. L’onglet de paie des professeurs reste calculé sur l’ensemble du mois et du niveau sélectionnés.
- Les factures d’élèves désactivés restent incluses dans les totaux financiers. Leur modification exige de réactiver le compte.

Les tests doivent utiliser une base jetable. Pour éviter un conflit avec le serveur local, définir `NOUR_BUILD_DIR=.next-e2e` avant `npx playwright test`. Aucun compte réel ni secret n’est ajouté par cette évolution.
