# 0030 — Déclinaisons et export de campagne

Les déclinaisons utilisent les révisions C03, pas de nouveaux projets ni un second moteur. Le champ optionnel `delivery` fixe format et destination ; sans lui le comportement vidéo C03 reste disponible. Une révision peut référencer la clé composée d’une révision éditoriale immuable. L’enregistrement vérifie projet, propriétaire et plateforme. Les anciens enregistrements ne sont ni réécrits ni liés rétroactivement.

Un master statique est le premier PNG ; toutes les pages d’un carrousel restent accessibles et leur ordre entre dans la somme d’approbation. Les clips utilisent le même calque Sharp transparent que l’aperçu, composé par FFmpeg sur les images en mouvement. La piste du clip est ignorée : seule la piste explicitement sélectionnée et autorisée est utilisée.

Le ZIP contient la dernière version rendue de chaque tuple projet/contenu/plateforme/format, pas tous les brouillons historiques. L’export vérifie les empreintes et ne change ni l’approbation ni le statut éditorial. Limite actuelle : 100 Mio par lot en mémoire ; au-delà, téléchargements individuels.
