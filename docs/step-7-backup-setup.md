# Configuration et exploitation des sauvegardes

Ce guide décrit la synchronisation Google Sheets, la file d’événements PostgreSQL, les archives XLSX hebdomadaires, le mode hors ligne Admin et la reprise après incident. Google Sheets, les exports XLSX et le cache navigateur ne remplacent pas une sauvegarde/restauration de PostgreSQL.

## Variables d’environnement

Configurer uniquement côté serveur :

- `GOOGLE_SHEETS_SPREADSHEET_ID` : identifiant du classeur partagé avec le compte de service.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` et `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` : identifiants du compte de service. Les séquences `\n` de la clé sont converties en retours à la ligne.
- `BACKUP_CRON_SECRET` : secret aléatoire d’au moins 32 octets pour autoriser le worker HTTP.
- `BACKUP_STORAGE_BUCKET` : nom d’un bucket Supabase Storage **privé**, dédié aux XLSX automatiques.
- `BACKUP_RETENTION_DAYS` : rétention des XLSX (1 à 3650 jours; défaut 365).
- `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` : nécessaires au stockage; cette clé serveur ne doit jamais être exposée au navigateur.

Ne jamais committer le JSON du compte de service, les valeurs réelles `.env`, ni les secrets dans une URL ou un log. Ne pas préfixer ces variables par `NEXT_PUBLIC_`. Utiliser le gestionnaire de secrets de la plateforme.

## Google Sheets

1. Dans Google Cloud Console, sélectionner un projet et activer **Google Sheets API**.
2. Créer un compte de service et une clé JSON dans un emplacement protégé.
3. Créer le Spreadsheet de destination et le partager avec l’adresse `client_email` du compte de service en rôle **Éditeur**.
4. Configurer les variables Google uniquement dans l’environnement serveur.
5. Depuis un environnement autorisé, appeler le worker hebdomadaire protégé. Le premier full sync crée l’onglet `Résumé`, `Sync Log` et un onglet par niveau.

Les lignes élèves/paiements sont synchronisées par Code ID afin que le traitement répété actualise les mêmes lignes. Les titres des feuilles de niveau sont nettoyés et désambiguïsés par identifiant de niveau. Le résumé comprend les montants attendus, encaissés et restants, les états PAID/PARTIAL/UNPAID et le taux de recouvrement. Le classeur contient des données nominatives et financières : limiter son partage aux personnes autorisées.

## Worker et planification

Les mutations métier d’inscription et de paiement ajoutent un `BackupEvent` dans la même transaction PostgreSQL. Aucun appel Google n’est fait dans la transaction métier. Le worker réclame les événements avec un lease et un jeton de propriété, traite jusqu’à 25 événements par lot et écrit les états/logs en PostgreSQL.

- `POST /api/backup/worker` traite la file due; il ne déclenche pas de full sync.
- `GET /api/backup/worker` ajoute un événement `FULL_SYNC_REQUESTED`, traite jusqu’à cinq lots (125 événements maximum), puis tente de produire et stocker le XLSX hebdomadaire. En cas de backlog supérieur, le full sync peut rester en attente; contrôler son statut et relancer.
- Les deux méthodes exigent `Authorization: Bearer <BACKUP_CRON_SECRET>`. Ne jamais appeler depuis le navigateur.
- Les erreurs temporaires sont reprises avec un délai exponentiel de 30 secondes à 24 heures et un plafond de 20 tentatives. Les erreurs HTTP 4xx non temporaires sont permanentes. Les événements FAILED restent visibles pour l’Admin.
- Le tableau de bord Admin permet de réessayer les FAILED et de demander une synchronisation complète. Une reprise remet les tentatives en attente sans supprimer les anciens logs.

Planification recommandée : `POST` toutes les 2 à 5 minutes et `GET` une fois par semaine (par exemple lundi à 03:00 UTC). Adapter la fréquence et les limites au runtime réel. Le dépôt ne contient pas de configuration de plateforme ni de scheduler.

### Linux cron ou scheduler externe

Ne pas écrire le secret directement dans le crontab. Créer un script root-only installé par l’exploitant qui lit le secret depuis un gestionnaire sécurisé et appelle `curl --fail-with-body --silent --show-error` avec l’en-tête `Authorization: Bearer ...`; utiliser POST pour le job fréquent et GET pour le job hebdomadaire. Exemple de calendrier :

```cron
*/5 * * * * /usr/local/sbin/nour-backup-worker frequent
0 3 * * 1 /usr/local/sbin/nour-backup-worker weekly
```

Le script `/usr/local/sbin/nour-backup-worker` n’est pas livré avec l’application et doit être audité/configuré par l’exploitant. Un scheduler HTTPS externe peut remplacer cron si son coffre à secrets protège l’en-tête et ses journaux ne l’impriment pas.

### Exemple GitHub Actions

Si GitHub Actions est retenu, le secret doit être un repository/environment secret nommé `BACKUP_CRON_SECRET`. Restreindre l’environnement de déploiement à la branche de production, conserver des permissions minimales et protéger les logs. Les deux appels à l’endpoint doivent être configurés en jobs séparés : POST fréquent et GET hebdomadaire. GitHub peut retarder ou supprimer des exécutions cron, particulièrement sur un dépôt inactif; cette solution n’offre pas une garantie de RPO de cinq minutes. Aucun workflow n’est fourni dans ce dépôt.

Exemple de workflow à adapter et à installer uniquement si GitHub Actions est le scheduler choisi :

```yaml
name: NOUR backup worker
on:
  schedule:
    - cron: "*/5 * * * *"
    - cron: "0 3 * * 1"
  workflow_dispatch:
permissions:
  contents: read
jobs:
  worker:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Call protected worker
        env:
          BACKUP_CRON_SECRET: ${{ secrets.BACKUP_CRON_SECRET }}
          EVENT_SCHEDULE: ${{ github.event.schedule }}
        run: |
          method=POST
          if [ "$EVENT_SCHEDULE" = "0 3 * * 1" ]; then method=GET; fi
          curl --fail-with-body --silent --show-error \
            -X "$method" \
            -H "Authorization: Bearer $BACKUP_CRON_SECRET" \
            https://VOTRE-DOMAINE/api/backup/worker
```

Le secret doit être défini dans l’environnement GitHub `production`, et la protection de cet environnement doit limiter les déploiements autorisés. Le workflow manuel déclenche POST par défaut; exécuter le GET hebdomadaire manuellement via un scheduler de confiance ou adapter explicitement le workflow, sans exposer de secret.

### Autres plateformes

Vercel, Railway, Render ou un autre scheduler doivent être configurés uniquement après confirmation du fournisseur réellement utilisé. Vérifier qu’il sait envoyer l’en-tête Bearer depuis un secret, que son plan autorise la fréquence requise et que le GET hebdomadaire respecte la durée maximale d’exécution. Aucune configuration de ces plateformes n’est présente dans le dépôt.

## XLSX hebdomadaire durable

La sauvegarde automatique exige un bucket privé dédié configuré par `BACKUP_STORAGE_BUCKET`, ainsi que `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`. Les étapes sont : générer le classeur, le relire, le téléverser sous une clé unique, le télécharger depuis Storage, comparer le SHA-256 et relire le classeur stocké, puis créer le log SUCCESS et la référence d’objet. Une erreur de génération, d’upload, de relecture ou de vérification est journalisée comme FAILED et signalée par une réponse non-2xx.

Les objets sont répartis sous `weekly/AAAA/MM/` et ne s’écrasent pas entre versions. La rétention supprime les objets expirés et retire leur référence de stockage des métadonnées. Prévoir un quota Storage adapté à la taille du registre et à la durée configurée. L’Admin peut télécharger le dernier fichier durable via le tableau de bord (`GET /api/backup/excel/latest`); le endpoint requiert une session Admin. L’export manuel (`GET /api/backup/excel`) est distinct et n’est pas conservé automatiquement.

## Contrôle, panne et reprise

- L’Admin consulte le tableau de bord ou `GET /api/backup/status` pour les dernières réussites/erreurs, les événements en attente/échec et l’état du fichier durable.
- Pour traiter uniquement la file, appeler POST avec le Bearer secret. Pour un full sync et l’archive hebdomadaire, appeler GET.
- Les événements métier restent dans PostgreSQL même si Google est indisponible. Surveiller les FAILED, la réponse HTTP du scheduler, les erreurs applicatives et les quotas Google/Supabase.
- Réessayer les événements FAILED depuis le tableau de bord Admin; les tentatives de synchronisation sont idempotentes par Code ID. Une demande full sync ne restaure pas l’historique PostgreSQL supprimé.
- Si un worker s’arrête brutalement, les leases PROCESSING expirent et un worker ultérieur peut réclamer les événements. Vérifier le verrou, l’horodatage et les logs avant intervention manuelle en base.
- Ne jamais copier le contenu complet des requêtes, les clés ou les données élèves dans un ticket. Conserver les logs applicatifs selon la politique de confidentialité du centre.

## Mode hors ligne Admin

Le service worker conserve uniquement le shell public `offline.html`/`offline.js`; il ne met pas en cache de pages authentifiées, d’API ou de documents privés. Après une première installation en ligne, l’Admin peut charger les vues Élèves/Paiements afin de créer des snapshots IndexedDB, puis ouvrir ces URLs directement hors ligne. Le shell est en lecture seule et affiche explicitement l’absence de snapshot si nécessaire. Les autres pages nécessitent le réseau.

IndexedDB est versionné et scoped par compte Admin, mais ses données (noms, numéros et montants) sont en clair et la session ne peut pas être revalidée hors ligne. Utiliser uniquement sur un appareil fiable et protégé; se déconnecter en ligne avant de partager l’appareil. Le cache navigateur n’est pas une sauvegarde serveur.

## Sauvegarde PostgreSQL et restauration

PostgreSQL reste la source de vérité pour les comptes, inscriptions, factures, ressources, sessions et événements outbox. Le projet ne configure aucun fournisseur PostgreSQL ni stockage de dump; l’exploitant doit choisir, configurer et tester une stratégie indépendante.

### Objectifs et conservation recommandés

- **RPO cible : 15 minutes** avec snapshots/PITR PostgreSQL du fournisseur, si disponibles.
- **RTO cible : 2 heures**, mesuré par un exercice de restauration.
- Conserver **30 sauvegardes journalières et 12 mensuelles** dans un compte ou bucket distinct de la base de production.
- Chiffrer au repos et chiffrer également les exports avant transfert indépendant; conserver les clés séparément dans un gestionnaire de secrets.
- Tester une restauration au moins mensuellement, toujours dans une base jetable isolée. Ne jamais écraser la production pendant un exercice.

Ces valeurs sont des objectifs opérationnels, non des garanties apportées par le code.

### Procédure générale

1. Activer les backups/PITR du PostgreSQL choisi avec une fenêtre de rétention d’au moins 30 jours; confirmer qu’une copie peut être conservée indépendamment du fournisseur de base.
2. Si PITR n’est pas disponible, réaliser au minimum un `pg_dump --format=custom` quotidien, chiffrer le dump avant transfert et appliquer la rétention 30 daily + 12 monthly. Le script et le stockage ne sont pas inclus dans le dépôt.
3. Pour restaurer, créer une base isolée vide avec une version PostgreSQL compatible, déchiffrer le dump dans un environnement protégé, puis exécuter `pg_restore --exit-on-error`. Ne jamais pointer la production vers la base avant validation et autorisation.
4. Vérifier `_prisma_migrations`, les comptes, niveaux, groupes, inscriptions, paiements et `BackupEvent`; exécuter `npx prisma validate` et un test applicatif sur l’environnement isolé.
5. Après décision contrôlée, réexaminer les événements PROCESSING échus et FAILED. Utiliser les contrôles Admin pour relancer ceux qui doivent être synchronisés. Une synchronisation complète vers Google doit partir de PostgreSQL restauré; ne jamais reconstruire la base depuis Google Sheets.
6. Documenter le point de restauration, les contrôles effectués, l’opérateur et le temps de reprise; mesurer les RPO/RTO et corriger la procédure si les cibles ne sont pas tenues.

## Rotation des secrets

- `BACKUP_CRON_SECRET` : générer une nouvelle valeur aléatoire d’au moins 32 octets, mettre à jour le serveur et le scheduler, vérifier un appel autorisé, puis révoquer l’ancienne valeur.
- Compte de service Google : créer/activer une nouvelle clé, tester une synchronisation sur un classeur approprié, mettre à jour le secret serveur puis révoquer l’ancienne clé dans Google Cloud.
- `SUPABASE_SERVICE_ROLE_KEY` : renouveler selon la procédure du projet, redéployer, vérifier PDF et XLSX puis invalider l’ancienne clé.
- `AUTH_SECRET` : sa rotation invalide les sessions et QR signés existants; planifier les reconnexions et régénérer les cartes QR.
- Ne jamais écrire un secret dans Git, le code, une URL, un ticket ou les logs du scheduler.
