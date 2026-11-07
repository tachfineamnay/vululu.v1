# ADR 0020 — Dépendances exactes brief, storyboard et master

- Date : 2026-11-04
- Statut : accepté pour le lot 6, complément de l’ADR 0019.
- Exigences : PRD-06/08/09, CDC-F-024/030/042/051.

La confirmation d’un nouveau brief ne rend pas automatiquement un ancien storyboard conforme. Project.storyboardBriefVersion référence la version du brief ayant produit le storyboard. L’écriture du plan revalide la confirmation sous verrou ; un lancement de production refuse une liaison obsolète. Les anciens projets sans liaison doivent régénérer leur storyboard, sans inventer une association historique.

Chaque nouveau master conserve sourceBriefVersion dans son manifeste existant. Une correction ciblée ne peut pas réutiliser les scènes d’un master provenant d’un autre brief : une production complète est requise dans ce cas. Un ancien master sans cette provenance reste lisible/téléchargeable, mais exige une production complète avant une nouvelle correction.

Les identifiants des scènes restent stables lors de la régénération. Les éditions locales de durée restent explicites. Les révisions, fichiers et approbations historiques ne sont pas réécrits. Cette liaison ne constitue pas une mémoire adaptative ni un moteur LLM ; elle matérialise une dépendance V1 avec un numéro de version.
