# F07 — Parcours client

1. Depuis l’accueil public, créer et vérifier un compte. Créer le profil d’activité, confirmer une offre, puis choisir et enregistrer une idée dans le calendrier.
2. Reprendre le contenu enregistré et créer son projet Studio. Le titre, l’objectif, le public, le CTA et le format reprennent les données du calendrier. Relire et enregistrer le brief. L’assistant propose un brouillon local, ou l’IA si le fournisseur et le compte le permettent. Un CTA approuvé peut être repris dans le brief. Les idées d’un plan hebdomadaire approuvé peuvent également être reprises dans le calendrier.
3. Modifier la composition, enregistrer une version, rendre le master puis l’approuver. Les formats et fichiers sont ceux de F06. Revenir au contenu du calendrier et le passer de brouillon à relecture puis à approuvé. Les deux approbations sont distinctes. Un changement de texte, date ou archivage impose de relier une nouvelle version Studio ; un simple changement d’état éditorial ne le fait pas.
4. Télécharger le kit (média, légende et instructions), ou soumettre une programmation après connexion compatible et autorisation explicite. Un export ou une soumission n’est pas une preuve de diffusion. Consulter les résultats, les exports et leur historique ; les mesures non observées restent indisponibles.
5. Dans **Mon compte**, vérifier l’état des achats et les droits, ou ouvrir un dossier d’assistance. Le mode test Stripe ne débite rien.

## Configuration restante en environnement réel

- Vérification et récupération de compte : transport d’e-mail et origine publique conformes à la configuration du serveur.
- IA : Vertex et/ou fournisseur de génération média, autorisations par outil et compte, worker et droits commerciaux si actifs. Ces fournisseurs ne sont pas nécessaires au parcours local.
- Rendu : stockage accessible au serveur et au worker, FFmpeg complet. Programmation directe : Postiz activé, intégration réseau compatible, droits du compte, worker et retours de diffusion. Sans cela, le kit manuel est le chemin prévu.
- Paiements : catalogue approuvé, configuration Stripe du bon mode et webhook, autorisation distincte pour le mode réel. Ne pas activer les services ni déployer pour exécuter les tests locaux.

## Vérification locale

Utiliser PostgreSQL migré et jetable (`DATABASE_URL_TEST`, hôte local, nom finissant en `_test`), FFmpeg/FFprobe et Chromium Playwright. `pnpm exec playwright test --config playwright.customer-account.config.ts` lance l’API avec une boîte de réception de test et un build de production Next.js, en bureau et mobile. Les tests d’intégration de calendrier et de publication couvrent aussi la concurrence, la propriété et le rejet d’une commande devenue obsolète.
