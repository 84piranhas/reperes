# Repères

Un site pour apprendre un thème, puis vérifier qu'on l'a compris. On choisit un thème, puis on lit le cours ou on passe le test.

Le site est entièrement statique : pas de serveur, pas de base de données, pas de compte. Le contenu vit dans ce dépôt. La progression de chaque lecteur reste dans son navigateur.

## Organisation

```
index.html            la page unique
assets/app.js         navigation, lecture du cours, moteur de test
assets/styles.css     styles, thèmes clair et sombre
themes/index.json     la liste des thèmes publiés
themes/<id>/
  theme.json          titre, accroche, couleur, liste ordonnée des chapitres
  cours/<chapitre>.html       le texte d'un chapitre
  questions/<chapitre>.json   les questions de ce chapitre
  glossaire.json      les termes du thème (facultatif)
outils/verifier.py    contrôle de cohérence du contenu
```

## Ajouter un thème

1. Créer le dossier `themes/<id>/` avec un `theme.json` sur le modèle de `themes/data/theme.json`.
2. Écrire un fichier `cours/<chapitre>.html` et un fichier `questions/<chapitre>.json` par chapitre déclaré.
3. Ajouter l'identifiant du thème dans `themes/index.json`.
4. Lancer `python3 outils/verifier.py`.

Aucun code n'est à modifier : l'accueil, le sommaire, le test et le glossaire se construisent à partir de ces fichiers.

### theme.json

| Champ | Rôle |
|---|---|
| `id` | Identifiant, identique au nom du dossier |
| `domaine` | Ligne de surtitre |
| `titre`, `titreCourt` | Titre complet, et titre court pour le fil d'Ariane |
| `accroche` | Une ou deux phrases de présentation |
| `couleur` | Couleur d'accent, `clair` et `sombre` |
| `chapitres` | Liste ordonnée : `id`, `titre`, `resume`, `minutes` |

### Un chapitre de cours

Un fragment HTML, sans `<html>` ni `<body>`. Les titres de section sont des `<h2>`, repris automatiquement dans le plan latéral. Éléments disponibles :

- `<dfn>` pour un terme défini ;
- `<table>` : mis en forme et défilant sur petit écran ;
- `<aside class="note …">` avec un `<p class="etiquette">` en tête. Variantes : `terrain` (exemple concret), `piege` (erreur courante), `question` (réflexe à avoir), `retenir` (résumé de fin de chapitre) ;
- `<figure class="schema">` contenant `<div class="cadre">` puis un `<svg>`. Classes prêtes à l'emploi : `b` boîte, `ba` boîte accentuée, `bv` boîte en pointillés, `t` texte, `ts` petit texte, `tacc` texte accentué, `m` centré, `f` trait de flèche, `fp` pointe de flèche. Elles suivent les thèmes clair et sombre.

Les espaces insécables de la typographie française sont posées à l'affichage : écrire simplement `mot ?` ou `« mot »`.

### Un fichier de questions

Un tableau JSON. Chaque question :

```json
{
  "id": "chapitre-01",
  "type": "single",
  "niveau": 1,
  "q": "L'énoncé ?",
  "choix": ["Bonne réponse", "Distracteur", "Distracteur", "Distracteur"],
  "bonnes": [0],
  "explication": "Pourquoi cette réponse, et pourquoi pas les autres."
}
```

- `type` : `single` (une bonne réponse), `multi` (plusieurs), `vf` (vrai ou faux, sans champ `choix` : `bonnes` vaut `[0]` pour vrai, `[1]` pour faux).
- `bonnes` : les rangs des bonnes réponses dans `choix`, à partir de 0.
- Les choix sont mélangés à l'affichage : leur ordre dans le fichier n'a pas d'importance, et il ne faut donc pas écrire de choix du type « toutes les réponses ci-dessus ».
- `niveau` : 1 définition, 2 compréhension, 3 mise en situation.
- Dans les textes, `` `code` `` et `**gras**` sont reconnus.

### glossaire.json

Un tableau d'objets `{ "t": "Terme", "d": "Définition courte.", "c": "id-du-chapitre" }`.

## Travailler en local

```bash
python3 -m http.server 8766
```

Puis ouvrir `http://localhost:8766/`. Un serveur est nécessaire : le site charge son contenu par requêtes, ce qu'un navigateur refuse sur un fichier ouvert directement.

## Publication

GitHub Pages sert la branche `main` telle quelle. Pousser sur `main` publie.
