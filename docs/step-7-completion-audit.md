# Étape 7 — Audit de complétion des sauvegardes

## Portée et conclusion

Audit du code livré dans le workspace : outbox PostgreSQL, worker, synchronisation Google Sheets, exports XLSX, stockage Supabase, endpoints Admin et cache hors ligne. Les statuts ci-dessous distinguent l’inspection/tests locaux d’une validation réelle des services externes. Aucune sauvegarde PostgreSQL externe n’est automatisée par l’application.

| Fonction | Preuves dans le code | Statut | Limites et suites |
|---|---|---|---|
| Événements d’inscription/paiement transactionnels | `src/app/admin/actions.ts`, `src/app/admin/payments/actions.ts`, `prisma/schema.prisma` | Implémenté, revu dans le code | L’outbox protège la livraison vers les destinations secondaires, pas contre une perte ou une corruption de PostgreSQL. |
| Worker, leases et propriété de traitement | `src/lib/backup/worker.ts`, `prisma/migrations/202611060006_backup_outbox/migration.sql`, `prisma/migrations/202611060007_weekly_excel_storage/migration.sql` | Implémenté, revu dans le code | Le worker traite jusqu’à 25 événements par appel; la planification fréquente reste à installer par l’exploitant. |
| Retry, classification et limite de tentatives | `src/lib/backup/retry.ts`, `src/lib/backup/worker.ts` | Implémenté; tests unitaires présents | Les erreurs permanentes et les événements plafonnés restent FAILED jusqu’à action Admin. |
| Synchronisation Google Sheets idempotente par Code ID | `src/lib/google-sheets-sync.ts`, `src/lib/backup/google-row.ts` | Implémenté, tests unitaires ciblés | Le service Google réel, les permissions du compte de service et les quotas n’ont pas été validés sans identifiants de test. |
| Titres d’onglets et résumé Sheets | `src/lib/backup/google-sheet-utils.ts`, `src/lib/google-sheets-sync.ts`, `tests/backup.test.ts` | Implémenté, helpers testés | Le classeur réel doit être vérifié après le premier full sync. Les données Sheets sont nominatives et financières. |
| XLSX hebdomadaire durable | `src/lib/backup/weekly-excel.ts`, `src/lib/storage/supabase.ts` | Implémenté, non validé contre Storage réel | Génération, relecture locale, upload, read-back, SHA-256, journalisation et rétention existent. Bucket privé et identifiants Supabase requis; aucun test d’intégration réel n’a été possible. Le nettoyage traite au plus 1000 anciennes entrées par exécution. |
| État de sauvegarde et téléchargement Admin | `src/app/api/backup/status/route.ts`, `src/app/api/backup/excel/latest/route.ts`, `src/components/admin/backup-dashboard.tsx` | Implémenté; tests E2E d’autorisation ajoutés | La session Admin et le stockage doivent être testés dans un environnement isolé configuré. |
| Reprise Admin des FAILED/full sync | `src/app/api/backup/admin/route.ts`, `src/components/admin/backup-dashboard.tsx` | Implémenté, revu dans le code | L’action retry remet en attente tous les événements FAILED; l’opérateur doit d’abord consulter le dashboard et vérifier la destination externe. |
| Cache offline des vues Admin | `src/lib/backup/offline-cache.ts`, `src/hooks/use-offline-backup.ts`, `public/sw.js`, `public/offline.html`, `public/offline.js` | Shell et cache implémentés; tests unitaires/static présents | Le shell ne revalide pas l’identité hors ligne et IndexedDB n’est pas chiffré. Utiliser uniquement sur un appareil Admin protégé. Ce cache n’est pas une sauvegarde serveur. |
| Échec de sync en cas de backlog hebdomadaire | `src/lib/backup/worker.ts`, `src/app/api/backup/worker/route.ts` | Limite connue documentée | Le GET ne traite que cinq lots de 25. Si des événements plus anciens occupent ces 125 places, le full sync hebdomadaire peut rester en attente et l’endpoint renvoie 503; l’archive XLSX est tout de même tentée. Continuer les POST fréquents et vérifier l’état avant de relancer. |
| Planificateur | `docs/step-7-backup-setup.md` | Procédure documentée, non configurée | Aucun fournisseur, cron ou workflow de production n’est présent dans le dépôt. Installer POST fréquent (2–5 min recommandé) et GET hebdomadaire selon le runtime réel. |
| Sauvegarde/restauration PostgreSQL | `docs/step-7-backup-setup.md`, `README.md` | Responsabilité d’exploitation documentée, non fournie par l’app | Configurer backups/PITR indépendants, 30 quotidiennes + 12 mensuelles, chiffrement, RPO cible 15 min, RTO cible 2 h et test de restauration mensuel. Les cibles ne sont pas garanties par le code. |

## Résultats de tests et validations

Les 23 tests unitaires passent : `tests/backup.test.ts` couvre les calculs mensuels, l’allocation par lignes figées, les titres et montants Sheets, l’upsert Code ID, le retry et les règles de cache IndexedDB; `tests/pwa.test.ts` couvre le manifeste, les icônes et les règles de cache du service worker. `e2e/student-admin-pwa.spec.ts` inclut les contrôles d’accès des endpoints `excel/latest` et worker sans secret, ainsi que l’outbox inscription/paiement. La découverte Playwright liste 14 tests; l’exécution E2E n’a pas été tentée faute de base PostgreSQL jetable configurée.

La migration `202611060007_weekly_excel_storage` est versionnée, mais ne doit pas être considérée appliquée à une base tant que l’opérateur ne l’a pas déployée. Aucun accès à une base de test dédiée, à Supabase Storage, à Google Sheets ou à la configuration de déploiement n’est fourni dans ce workspace; ces intégrations ne peuvent donc pas être déclarées vérifiées de bout en bout.

## Risques opérationnels à conserver

1. PostgreSQL est la source de vérité; Sheets et XLSX ne permettent pas une restauration complète des comptes, sessions, ressources et relations.
2. Le GET hebdomadaire peut dépasser le délai maximal d’un runtime serverless selon la taille du registre et le service externe. Vérifier la durée d’exécution réelle ou utiliser un runtime adapté.
3. La génération XLSX dépend d’un bucket privé, de quota Storage, de réseau et de service-role key correctement configurés.
4. Les archives et le cache offline contiennent des données personnelles et financières; appliquer une politique d’accès, de conservation et de protection des appareils.
5. Valider le retour d’un téléchargement stocké, l’expiration de la rétention, les reprises FAILED, un backlog >125 événements et la restauration PostgreSQL lors des exercices opérationnels.
