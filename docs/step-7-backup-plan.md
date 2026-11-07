# Plan d’implémentation — Étape 7

## Audit du dépôt

- **Gestionnaire de paquets** : npm (`package.json` et `package-lock.json`), Node.js 22.12+.
- **Framework/routage** : Next.js 15.5 App Router sous `src/app`, avec Server Actions et routes HTTP dans `src/app/api`.
- **Base/ORM** : PostgreSQL via `pg`, adaptateur `@prisma/adapter-pg` et Prisma 7; configuration URL de migration dans `prisma.config.ts`.
- **Authentification/autorisation** : cookie de session HttpOnly, JWT et révocation en base dans `src/lib/auth`; `requireUser("ADMIN")` pour les pages/actions serveur et `authorizeApi(request, "ADMIN")` pour les routes API.
- **Schéma réel** : `User` est le compte élève/professeur/admin; les élèves sont filtrés par `role = STUDENT`. `Enrollment` relie `User` à `SubjectGroup`; le niveau est `SubjectGroup.levelId` vers `Level`. `Payment` référence l’élève et stocke `year`, `month`, `totalAmount`, `paidAmount`, `status`; `PaymentLine` fige les groupes et montants pour la paie.
- **Création d’inscription** : l’action `createStudent` crée l’élève et ses `Enrollment` par écriture imbriquée dans `src/app/admin/actions.ts`.
- **Modification de paiement** : `updateStudentPayment` dans `src/app/admin/payments/actions.ts` crée/met à jour `Payment` et `PaymentLine` dans une transaction sérialisable.
- **Routes de données existantes** : scan Admin et téléchargement/gestion de ressources; il n’existe pas actuellement d’API élèves/paiements pour le navigateur. Les pages chargent les données depuis le serveur.
- **Dashboard** : `src/app/admin/dashboard/page.tsx` affiche le composant d’accueil partagé `Welcome`; l’espace Admin global utilise `src/components/admin/admin-shell.tsx`.
- **Jobs et déploiement** : aucune configuration de cron, queue ou plateforme (Vercel/Railway/Render) détectée. L’application a des scripts `next dev`, `next build`, `next start`; déploiement présumé Node standard, plateforme réelle inconnue.
- **Tests** : Node test runner avec `tsx` pour les tests unitaires; Playwright pour les parcours E2E dépendant d’une base PostgreSQL isolée. Aucun formatteur/linter dédié ou CI déclaré dans `package.json`.

## Approche

1. Ajouter des modèles Prisma `BackupEvent` et `BackupLog` et une migration versionnée.
2. Créer les événements d’inscription et de paiement dans la même transaction que l’écriture métier, sans appels Google dans cette transaction.
3. Traiter les événements par lots avec verrouillage/claim atomique, retries exponentiels et opérations Google idempotentes basées sur le Code ID.
4. Ajouter un endpoint worker protégé par secret serveur, un état Admin-only et un déclenchement hebdomadaire documenté, sans supposer de fournisseur cloud.
5. Ajouter l’export Excel Admin-only avec requêtes relationnelles groupées et journal persistant.
6. Ajouter les variables Google uniquement côté serveur et documenter la création du service account, le partage du classeur, le worker et les reprises.
7. Ajouter une cache IndexedDB versionnée et scoped par compte, alimentée par APIs Admin no-store; la donnée serveur a toujours priorité, le cache est une vue hors-ligne en lecture seule.
8. Couvrir les calculs, signatures des événements, idempotence avec mocks, protection de routes et état hors-ligne par tests adaptés; lancer typecheck, unit tests, Prisma validate et build.

## Limites d’audit

La plateforme de déploiement, l’accès à une base de test dédiée et un projet/compte Google n’ont pas été fournis. Le code pourra être validé localement, mais l’application réelle des migrations, l’autorisation Sheets et l’exécution E2E en base nécessitent ces environnements.
