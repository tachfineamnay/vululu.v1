# MVP Coolify — Recette de livraison

Date : 2026-11-05. Branche : `codex/v1-demo-coolify`. Candidat source `f170d95` (fonctionnalités `c77d763`, correctif Compose `b47fece`, tests de recette `f170d95`). Ressource dédiée : **Vululu MVP - Recette / vululu-mvp-recette**.

URL : https://vululu-recette.148.230.113.74.sslip.io

**MVP déployé et redéploiement vérifié ; remise des accès en attente.** Cette recette ne certifie pas toute la V1 historique.

## Preuves exécutées

| Contrôle | Résultat |
|---|---|
| Composition, snapshot et pipelines | 30 PASS / 2 S3 SKIP |
| Credentials, chiffrement, auth et lectures admin | 46 PASS |
| Migration additive préservant un fournisseur existant | 1 PASS / 6 tests filtrés |
| Bootstrap sans promotion ni réinitialisation | 3 PASS |
| Typage, build API/Web et lint strict | PASS |
| Secrets, frontières et 9 documents fondateurs | PASS |
| Images Linux / installation vierge Coolify | PASS |
| 19 migrations PostgreSQL | Appliquées ; schéma à jour |
| HTTPS public | 200, certificat validé sans contournement |
| Parcours brief et conversation MOCK | 2 PASS sur la cible |
| Vidéo, correction, QA, approbation, Postiz MOCK | PASS, 32,6 s |
| Gestion admin des clés et refus démo | PASS après correction du test, 11,1 s ; rejeu clavier 10,7 s |
| Cookie session | Secure / HttpOnly / SameSite=Lax |
| Interface des clés à 390 px | PASS ; champ masqué/effacé, confirmations, aucun débordement, boutons ≥44 px ; capture inspectée ; focus, Tab et Entrée vérifiés |
| Lecture vidéo via le proxy, Range valide/invalide | 206 / 416 PASS ; verticale rejouée, 32,8 s |
| Redémarrage contrôlé | PASS ; API authentifiée, médias et credential conservés |
| Sauvegarde PostgreSQL et restauration dans une autre base | PASS : `pg_dump -Fc`, `createdb`, `pg_restore --exit-on-error` |
| Archive média restaurée dans un autre répertoire + DB restaurée | PASS : 5 masters, 17 scènes, 1 credential, FFprobe, SHA-256 et master relu via API |
| Redéploiement avec données existantes | PASS ; avant/après : 7 masters, 23 scènes, 1 credential ; HTTPS 200, 19 migrations à jour |

La première commande E2E a donné 3 PASS / 1 FAIL : le nouveau test utilisait un mauvais nom de cookie (`vululu_session` au lieu de `session`). Le test corrigé passe sans changement du serveur ; les quatre parcours sont ainsi validés. Les vérifications Range ont ensuite été ajoutées et exécutées. Journaux locaux ignorés : `.v1/mvp-coolify-e2e.log`, `mvp-coolify-credentials.log`, `mvp-coolify-range.log`.

La restauration a porté sur une copie isolée, sans écraser la base source ni le volume média. Elle a été vérifiée avant le dernier rejeu vidéo, qui explique le passage de 5/17 à 7/23 sur la source. Ce test ne constitue pas une sauvegarde hors serveur. Les tâches de recette sont désactivées : aucune planification automatique n’a été activée. Le dump et l’archive de preuve sous `/tmp` ne sont pas une politique de rétention ; voir le runbook pour la sauvegarde durable.

## Sécurité et accès

Autorisation explicite de préparation/déploiement reçue le 2026-11-05. Aucune autre application du serveur n’a été modifiée. PostgreSQL et API n’exposent aucun port hôte ; deux volumes persistants sont attachés. Les cinq secrets générés par Coolify sont runtime uniquement et protégés ; le build confirme l’absence de variables à ajouter aux Dockerfiles. Aucune clé IA réelle n’a été saisie.

Compte démo ordinaire : `demo@vululu.example`. Compte admin séparé : `admin@vululu.example`. Les mots de passe sont temporairement consultables dans cette ressource Coolify, après autorisation explicite de l’utilisateur. La confirmation de récupération puis leur remasquage restent attendus. Les secrets PostgreSQL, session et chiffrement demeurent masqués. Aucune valeur dans Git, ce rapport ou le chat. Le rejeu clavier passe (10,7 s) et ajoute une seconde fixture de credential synthétique. Conserver les secrets de session et de chiffrement entre les versions.

## Limites et suite

- IA et Postiz : MOCK explicite ; enregistrer une clé ne teste pas le fournisseur.
- MCP après le MVP. Formats supplémentaires et mix audio à venir ; le choix des échantillons de voix sous licence libre est conservé.
- Instance unique, stockage local persistant ; S3/Hatchet non qualifiés. Reprise automatique d’un run interrompu non qualifiée : terminer les productions avant maintenance.
- Sauvegarde hors VPS et rétention à mettre en place selon le runbook. Aucune nouvelle dépendance payante.
- Docker local s’est arrêté pendant sa propre recette. La qualification Linux a été réalisée sur Coolify. Le premier build distant a révélé le contexte relatif erroné, corrigé dans `b47fece`.

Installation, sauvegarde et rollback : [MVP_COOLIFY_RUNBOOK.md](MVP_COOLIFY_RUNBOOK.md). Rollback de code sans suppression de volume ni migration inverse. Rapports fonctionnels : `docs/execution/MVP_01_LAYOUT.md` et `MVP_02_PROVIDER_CREDENTIALS.md`.

## Changement des mots de passe demandé par l’opérateur

L’utilisateur a remplacé les deux variables dans Coolify et confirmé vouloir conserver des valeurs courtes. ADR 0028 : exception explicite limitée à la recette, reset ponctuel des deux identités amorcées et révocation de leurs sessions. Tests de reset/amorcage : **27 PASS**, 3 fichiers, 75,78 s ; typage et lint ciblé PASS. Le bootstrap normal ne réinitialise toujours aucun compte. Déploiement de synchronisation et vérification des nouvelles connexions : EN COURS.
