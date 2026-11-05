# ADR 0028 — Mots de passe de recette choisis par l’opérateur

Date : 2026-11-05. Statut : accepté sur instruction explicite utilisateur. Complète ADR 0027. Références : PRD-01/13, CDC-N-001/002/003.

L’utilisateur a modifié les mots de passe démo/admin dans Coolify et demande explicitement de conserver des valeurs plus courtes que les 12 caractères requis par l’amorçage démo. Changer ces variables ne modifie pas les hash des comptes existants.

La recette autorise des valeurs non vides de 72 octets maximum uniquement avec `RECETTE_ALLOW_SHORT_PASSWORDS=1`. Le minimum de 12 caractères reste la règle par défaut des autres amorçages démo. Aucune règle de connexion ni fonctionnalité V2 n’est ajoutée.

Une opération ponctuelle, activée par `RECETTE_RESET_PASSWORDS=1` en mode démo, synchronise les deux comptes déjà amorcés. Elle vérifie d’abord les identités, le rôle super-admin et le marqueur du compte démo, puis change uniquement leurs hash et révoque leurs sessions dans une transaction. Les autres comptes, les rôles et les médias restent inchangés. Aucun mot de passe n’est imprimé ni audité.

Après vérification, désactiver le reset et remasquer les variables dans Coolify. L’amorçage normal reste idempotent et ne réinitialise aucun compte. Le choix de mots de passe courts augmente leur facilité de devinette ; il est limité à cette recette par décision de l’opérateur.

Rollback : le reset ne modifie aucun schéma. Conserver `RECETTE_ALLOW_SHORT_PASSWORDS=1` tant que ces valeurs courtes sont utilisées. Un ancien candidat sans cette option peut refuser son amorçage démo ; ne pas revenir à ce candidat avec une configuration incompatible.
