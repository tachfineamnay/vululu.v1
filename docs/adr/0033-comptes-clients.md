# 0033 — Inscription vérifiée des clients sans invitation

- Date : 2026-11-20
- Statut : décision F01, à relire avec la PR
- Références : PRD-01 (exception explicite pour l’inscription du rôle `user`), CDC-F-001/003 (invitations et administration conservées), CDC-N-003 (expiration, révocation, CSRF), E01 Identity.

## Décision

L’autorisation F01 fait évoluer la restriction historique de **PRD-01** sans modifier les documents importés : une adresse disponible doit pouvoir créer un compte client ordinaire sans invitation. Les rôles privilégiés et les invitations restent gérés par le super-administrateur. Une invitation active réserve l’adresse ; ni un doublon de casse ni une demande publique ne modifient une identité existante. Les comptes et les sessions historiques restent valides.

L’inscription commence par l’adresse email. Le nom et le premier mot de passe sont définis **après** réception du lien et en même temps que sa consommation et la création de l’utilisateur. Cela évite de laisser un tiers choisir un mot de passe que le propriétaire de la boîte activerait involontairement. Aucun compte en attente ni session ne donne accès au Studio. Le client vérifié se connecte via le mécanisme existant. Sans profil d’activité, la connexion normale le dirige vers le contexte de marque existant, puis vers l’offre confirmée et le nouveau projet. L’offre est proposée, non exigée ; aucun rendu ni publication n’est déclenché.

Les liens opaques aléatoires de 256 bits sont liés à une opération et stockés uniquement sous forme de condensat SHA-256. Ils expirent après 24 h (vérification) ou 30 min (récupération). Un renvoi ne casse pas le lien précédent ; une consommation réussie invalide les liens frères. La consommation et ses effets sont transactionnels ; un verrou PostgreSQL sur l’adresse normalisée coordonne l’inscription, les invitations, la connexion et les modifications de mot de passe. Le changement de mot de passe révoque les autres sessions et les liens de récupération en cours. Une réinitialisation révoque toutes les sessions du compte. La récupération par email est réservée au rôle `user` ; les comptes de support et super-administrateurs gardent leur procédure existante. Le profil permet de changer le nom affiché, pas l’adresse d’identité.

Les envois répondent de la même façon aux adresses éligibles, inconnues, déjà inscrites et limitées par destinataire. Le limiteur PostgreSQL ferme en cas d’erreur : plafond partagé inscription/renvoi de 4 par heure et par adresse, quota de récupération distinct de 4 par heure, 30 demandes par IP par tranche de 15 min pour chacun des groupes envoi et consommation. La connexion conserve son quota existant et ajoute un plafond par IP ; le changement authentifié est également limité par compte. Les mutations privées conservent CSRF et contrôle de session.

Le port d’email transactionnel a un adaptateur Resend HTTPS borné par délai. Les liens sont construits à partir d’une origine canonique côté serveur et les jetons sont dans le fragment (pas dans les journaux HTTP). Le transport est asynchrone et ne confirme pas la livraison au navigateur ; les liens en clair ne sont pas persistés dans une boîte d’envoi. En cas d’échec fournisseur ou d’arrêt du processus entre l’acceptation et l’envoi, le client peut redemander un lien. Le seul signal d’échec fournisseur est un événement opérationnel sans destinataire, corps ni secret. Aucun compte fournisseur ni abonnement n’est créé par ce lot.

Voir [configuration et preuves F01](../delivery/F01_CUSTOMER_ACCOUNT.md).
