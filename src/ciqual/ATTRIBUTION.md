# CIQUAL data attribution

`ciqual.json` is derived from the **ANSES-CIQUAL 2020** food composition table
(3,185 foods, 67 nutritional constituents), published by the French
[Agence nationale de sécurité sanitaire de l'alimentation, de l'environnement et du travail (ANSES)](https://ciqual.anses.fr).

- Source dataset: https://www.data.gouv.fr/datasets/table-de-composition-nutritionnelle-des-aliments-ciqual-2020/
- License: **Licence Ouverte / Etalab** (`fr-lo`) — free reuse, including commercial, with attribution.
- This file keeps only 4 fields per food (id, label, category, kcal/protein/fat/carb per 100g)
  from the ~1,767 entries in scope (`entrées et plats composés`, `viandes/œufs/poissons`,
  `fruits/légumes/légumineuses/oléagineux`, `produits céréaliers`, `produits laitiers`,
  `matières grasses`) — see `scripts/build-ciqual.mjs` for the conversion.

Show this attribution somewhere reachable in the app (Settings/About screen) per the license's
attribution requirement.
