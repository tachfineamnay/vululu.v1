# ADR 0022 — Plan indicatif et plafond MOCK avant run

- Date : 2026-11-05 ; statut : accepté pour la tranche 6C.
- Exigences : PRD-03/06/13, CDC-F-020/024/030/033/061, CDC-N-001/005.

Un plan lisible expose les étapes réellement supportées et leurs dépendances, le profil, la durée, le mode et les coûts MOCK avant la confirmation du brief. Il ne contient ni soul/instructions privées d’agent, ni credentials. Les nouvelles révisions ont toujours un profil canonique, même si le client omet les paramètres ; les anciennes révisions restent inchangées.

L’estimation est indicative et le plafond du brief confirmé est ferme. Une évolution du catalogue entre lecture et lancement ne permet pas de dépasser ce plafond. Le serveur recalcule le plan et l’admissibilité dans la transaction de lancement, avant création de JobRun, ProductionJob ou outbox. En cas de budget insuffisant, droits incompatibles ou capacité absente, aucun run factice n’est créé. Le snapshot conserve le plan effectivement retenu et sa provenance.

Pour le chemin durable actuel, une invocation MOCK de routage est tarifée selon le catalogue figé ; les échecs simulés ne sont pas facturés et le fallback doit lui aussi tenir dans le plafond. Le rendu local Sharp/FFmpeg ne simule pas une invocation fournisseur et conserve une estimation nulle. Aucun montant n’est une facture réelle. Les futurs formats/audio complèteront ce plan avec leurs opérations effectivement qualifiées ; leur présence dans un schéma ne suffit pas à les annoncer disponibles.

La lecture du plan ne crée pas de run, ne modifie aucune révision et ne contacte aucun fournisseur. La confirmation du brief reste une approbation de version/checksum et de son plafond, sans mécanisme de devis commercial ni modèle de monétisation V2. Aucun nouveau modèle de tarification commerciale ou compte externe.
