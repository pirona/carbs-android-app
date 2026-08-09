# Mascotte Carbs — taco chick

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `poussin-taco-master.png` | Source, 3508×4700, fond transparent. À passer à `@capacitor/assets`. |
| `taco-chick-master-1024.png` | Figure entière, 1024×1024, fond transparent. |
| `taco-chick-dark-1024.png` | Thème sombre, trait crème sur `#221A12`. |
| `icon-cream-1024.png` | Icône, fond `#FFF6EA`. |
| `icon-apricot-1024.png` | Icône, fond `#FFD9A0`. |
| `icon-dark-1024.png` | Icône sombre, trait crème sur `#221A12`. |

Les icônes cadrent la figure entière avec 5 % de marge : le sujet survit au recadrage
en cercle comme en squircle de l'adaptive icon Android.

## Palette

| Rôle | Hex |
| --- | --- |
| Fond clair | `#FFF6EA` |
| Corps | `#FFD9A0` |
| Bec | `#F2954D` |
| Encre | `#33291F` |
| Fond sombre | `#221A12` |
| Crème sombre | `#FFF1DA` |

## Règles

Aplats stricts. Pas de dégradé, pas d'ombre portée, pas de reflet glossy, pas de
hachurage, pas d'ombrage doux. Deux couleurs maximum sur le dessin par thème.

Le thème sombre n'est pas une inversion de luminance : le trait passe en `#FFF1DA`,
tout le reste devient le fond. Le seuillage doit se faire en pleine résolution avant
réduction, sinon les fines lignes des pattes basculent côté fond et disparaissent.

## Autres poses

Repos, splash, marche et buste demandent chacun un nouveau dessin à la main : ils ne
se dérivent pas de ce fichier.
