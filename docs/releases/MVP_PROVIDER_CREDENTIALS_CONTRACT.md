# MVP — Clés API IA

- Date : 2026-11-05 ; ADR 0027 ; PRD-01/07/11/13, CDC-F-031/060, CDC-N-001/002/003/005/007.
- Périmètre : configuration administrative, sans fournisseur connecté ni coût réel.

## API et permissions

`PUT /api/admin/providers/:key/credentials` reçoit uniquement `{ apiKey: string }`. `DELETE` sur cette route supprime de façon idempotente. Session, super-admin, CSRF et limite de mutations sont obligatoires. Le cas d’usage applique aussi le rôle, indépendamment du transport.

La clé est nettoyée de ses espaces de bord ; contenu UTF-8 valide, non vide, au plus 4096 octets et sans contrôle ASCII interne. Les erreurs ne recopient jamais la saisie. Un fournisseur inconnu donne 404 ; un rôle ordinaire donne 403 ; une session absente donne 401. Aucun endpoint ne restitue la clé.

Les réponses et `GET /api/admin/providers` donnent uniquement `credentials: { configured, updatedAt, writable }`. `configured` indique un enregistrement existant ; `writable` indique une configuration de chiffrement utilisable, pas une connexion validée. L’état affiché reste « Clé enregistrée, connexion non testée ».

## Stockage et exploitation

Migration additive 19 : table ProviderCredential liée au fournisseur, une enveloppe chiffrée, date et identifiant du dernier acteur. Aucun secret dans Provider/Model ou dans les snapshots de run. Les catalogues MOCK et leur politique figée restent inchangés.

AES-256-GCM : nonce de 12 octets aléatoires, tag de 16 octets, fournisseur lié par AAD. L’enveloppe versionnée contient v/iv/tag/data ; la clé maîtresse est séparée, via PROVIDER_CREDENTIALS_ENCRYPTION_KEY, base64 canonique de 32 octets. L’absence ou le mauvais format du secret serveur empêche l’écriture avec 503 et laisse la démo disponible ; supprimer une enveloppe reste possible sans déchiffrement.

Le déchiffrement serveur refuse une enveloppe altérée, un mauvais contexte de fournisseur ou une autre clé maîtresse. Aucun fallback en clair. La clé maîtresse est sauvegardée séparément et sécurisée ; elle est indispensable pour restaurer les credentials. Son remplacement sans migration des enveloppes n’est pas une rotation supportée. Les variables ne vont ni au Web ni au build.

Le formulaire réutilise les panneaux et styles admin : saisie masquée, confirmation de remplacement/suppression, erreurs accessibles, champ effacé après succès, actions de 44 px et cartes adaptées au mobile. Aucun stockage local de la saisie. Le compte démo n’a pas accès au panneau.

Référence primaire : [Node.js 24 — Crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html), createCipheriv, setAAD et getAuthTag. La présence d’une clé ne qualifie ni son fournisseur, ni son tarif, ni un appel réel.
