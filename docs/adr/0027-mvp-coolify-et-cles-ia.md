# ADR 0027 — MVP Coolify et clés IA optionnelles

- Date : 2026-11-05 ; statut : accepté pour mise en œuvre du MVP.
- Références : instruction utilisateur du 2026-11-05, plan `2026-11-05-mvp-coolify-cles-ia.md`, PRD-01/07/11/13, CDC-F-031/060, CDC-N-001/002/003/005/007.
- Complète ADR 0016 ; ne certifie pas la V1 complète.

Le premier jalon est un MVP interne sur Coolify : compte démo, verticale vidéo, correction, QA et approbation, plus gestion des clés IA. MCP, nouveaux formats et mix audio complet suivent le MVP. L’utilisateur réalise le déploiement sur son serveur ; aucune publication distante n’est implicitement autorisée.

Le MVP utilise une instance applicative unique, PostgreSQL et un volume média persistant derrière les ports existants. Hatchet/S3 restent des extensions de déploiement à qualifier, pas une garantie du mode local. Avant changement d’image, arrêter les nouveaux lancements et terminer ou marquer explicitement les runs interrompus ; ne pas promettre une reprise durable automatique. Une sauvegarde PostgreSQL/médias, une restauration isolée et la persistance après redémarrage restent requises avant le GO du jalon.

Un super-admin peut enregistrer, remplacer ou supprimer une clé par fournisseur du catalogue. Le compte démo et les utilisateurs ordinaires n’ont aucun accès aux credentials. Le formulaire HTTPS envoie la clé une fois ; aucune réponse ne la restitue. La démo fonctionne sans clé, et l’enregistrement n’appelle aucun fournisseur.

Les clés sont chiffrées avec AES-256-GCM et un nonce aléatoire ; l’identifiant du fournisseur est authentifié comme contexte. La clé maîtresse de 32 octets, encodée en base64 canonique, est injectée dans l’API via PROVIDER_CREDENTIALS_ENCRYPTION_KEY. Elle n’est ni générée ni conservée dans Git ou la base applicative. Son absence ne bloque pas la démo mais interdit l’enregistrement. Aucun stockage en clair de secours.

Le stockage conserve seulement l’enveloppe chiffrée et les métadonnées de modification. Les journaux, audits, snapshots, bundles et stockage navigateur ne contiennent ni clé ni ciphertext. La réponse d’administration indique uniquement l’existence et la date d’une clé ; « enregistrée » ne signifie pas « connectée » ou « validée ». Le déchiffrement est réservé aux adaptateurs serveur ; aucun endpoint de lecture du secret.

La sauvegarde de la clé maîtresse est distincte et sécurisée. Sa perte rend les credentials existants illisibles ; changer cette clé sans procédure de migration n’est pas une rotation supportée. Remplacer une clé fournisseur passe par une nouvelle enveloppe ; supprimer est idempotent. Une intégration IA réelle nécessitera ensuite fournisseur, usage, tarif et budget explicites, sans bloquer le démarrage de la démo.
