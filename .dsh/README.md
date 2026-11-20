# Skills projet Vululu AI (DeepSeek Harness)

Ce dossier contient les skills DSH spécifiques au dépôt Vululu AI. Ils sont chargés automatiquement par le fournisseur de skills filesystem : chaque entrée directe de `.dsh/skills/` est un bundle `<nom>/SKILL.md` (frontmatter YAML `name` kebab-case + `description` + `whenToUse` optionnel). Les fichiers plats `<nom>.md` seraient aussi acceptés, mais le format bundle est utilisé ici.

## Catalogue

| Skill | Usage principal |
|---|---|
| `vululu-project-orientation` | Entrée de session : autorités documentaires, carte du dépôt, état réel au HEAD courant (2026-11-20), capacités IMPLEMENTED / PROVIDER_DEPENDENT / MOCK / MISSING, vocabulaire de la campagne P00–P13, pièges de lecture. |
| `vululu-lot-delivery` | Exécuter un lot conforme à `AGENTS.md` : d'abord le mode BUILD-FIRST P00–P11 (un commit `BUILD_UNVERIFIED` par lot), puis la procédure complète (preuves PASS/SKIP/MOCK/NOT_RUN, ADR, git, DoD) pour P12–P13. |
| `vululu-local-stack` | Démarrer/vérifier/arrêter la pile locale : PostgreSQL portable 55432, API 3101, Web 3100, FFmpeg, worker/Hatchet et S3 préprod optionnels. |
| `vululu-quality-gates` | Choisir et exécuter les tests/gates (P12–P13 et maintenance vérifiée uniquement), interpréter un échec, rapporter des preuves honnêtes, échecs connus et statut CI `NOT_RUN`. |
| `vululu-architecture-change` | Modifier le code sans casser les couches ni les invariants : recettes domaine/use case/adaptateur/route/migration, contrôles, ADR. |
| `vululu-ops-readiness` | Préparer/valider préproduction et staging sans déployer : verdicts, topologie, runbooks, backup/restore, rollback, conditions de GO. |

Ordre de chargement conseillé : `vululu-project-orientation` d'abord, puis `vululu-lot-delivery` pour toute demande de livraison, puis le(s) skill(s) de domaine selon la mission.

## Règles de maintenance

1. **Les faits sont datés.** Chaque skill indique l'état vérifié (date + HEAD) et distingue VÉRIFIÉ / DOCUMENTÉ / NOT_RUN. Ne jamais promouvoir un constat historique en preuve du jour.
2. **Mise à jour après un lot structurant** : nouvelle migration, changement de port/variable, verdict de certification, évolution de procédure ⇒ mettre à jour le skill concerné dans le même lot documentaire.
3. **Aucun secret** : jamais de valeur de `.env`, token, mot de passe, identifiant privé ni chemin personnel absolu ; seuls des noms de variables et des chemins du dépôt.
4. **Sources de vérité** : `AGENTS.md`, corpus fondateur, ADR et code priment sur un skill. En cas de contradiction, corriger le skill et signaler le conflit.
5. **Format** : corps en français, commandes/identifiants en anglais, ~90–200 lignes par skill, références en chemins du dépôt, pas de duplication inutile d'`AGENTS.md` ou des runbooks.
6. **Découverte** : un skill valide apparaît dans le catalogue DSH de la session ; un fichier sans frontmatter valide est ignoré silencieusement. Vérifier après ajout/renommage.
7. **Versionnement** : `.dsh/` est suivi par Git ; le committer avec un message `docs(skills): ...` après revue, sans push non autorisé. Les skills ne doivent plus citer de rapport local non suivi : l'état courant est `docs/implementation/VULULU_FEATURE_INVENTORY.md`.
8. **Campagne P00–P13** : les skills chargent le [contrat de finition](../docs/implementation/VULULU_FINISH_CONTRACT.md) et l'[inventaire courant](../docs/implementation/VULULU_FEATURE_INVENTORY.md). En cas de conflit, ces deux documents priment sur tout état daté ; en P00–P11, aucun test complet n'est exécuté et aucun `PASS` n'est déclaré.

## Vérification rapide après édition

```powershell
# 1. Le frontmatter est valide et le skill apparaît dans le catalogue (rechargement automatique).
# 2. Le scan de secrets doit rester vert sur l'arbre de travail.
pwsh -NoProfile -File scripts/check-secrets.ps1
# 3. Relire le diff (les skills sont des instructions opérationnelles : une commande fausse coûte cher).
git diff -- .dsh
```

Ne pas y placer de rapport de mission ni de données d'exécution : les preuves vont dans `docs/` selon `vululu-lot-delivery`.
