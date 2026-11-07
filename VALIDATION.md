# Validation — étape 2

- Prisma 7.10.1 : schéma validé et client généré.
- Next.js 15.5.29 : build de production et vérification TypeScript.
- 5 tests unitaires réussis : téléphone et chiffres arabes, zéros du PIN, frontières des routes, JWT altéré/expiré/rôle invalide/algorithme incorrect, hash Argon2id.
- 8 tests d'intégration et navigateur réussis : accès anonyme, responsive et saisie PIN, trois rôles et refus des accès croisés, déconnexion et rejet du JWT révoqué, téléphone, blocage pendant une session, numéro partagé, vérification Origin et limiteur concurrent, parcours complet du formulaire jusqu'à la page élève.
- Deux tests navigateur répétés avec succès après intégration de la police locale. Vérification visuelle des captures desktop et mobile 390 px ; absence de débordement horizontal.

Les tests d'intégration ont utilisé PGlite via son protocole PostgreSQL, avec application des deux fichiers SQL de migration. L'outil Prisma Migrate n'a pas pu s'exécuter sur ce serveur de test ; ses fichiers SQL ont été appliqués directement avec le driver pg. Aucun projet Supabase réel n'a été connecté. La validation des connexions, des migrations Prisma sur Supabase et du domaine HTTPS de production reste à effectuer avec les paramètres du centre.
