# Organisation du code de la carte interactive

Le fichier principal est `interactive-map.js`.  
Il est découpé en modules logiques (pour l’instant via des commentaires) qui
correspondent à des futurs fichiers JS séparés :

1. **MODULE 1 — CONFIG GLOBALE & HELPERS GÉNÉRIQUES**  
   - MAPTILER_KEY, UI_CONFIG  
   - `setUIStyle()`, `applyUIConfig()`  
   - helpers Markdown/front matter/dates…

2. **MODULE 2 — DONNÉES & INDEX DES NOTES**  
   - `allData`, `allTags`, `idToItem`, `linksCache`  
   - `loadDataFromJSON()`, `buildTagCheckboxes()`

3. **MODULE 3 — CARTE, STYLES & CLUSTERS**  
   - Création de la map MapLibre, styles basemap  
   - Globe + fog + rotation  
   - Source `notes`, clusters et points; clics & navigation

4. **MODULE 4 — ENTITÉS, CONSTELLATIONS & ARCS 3D**  
   - Indexation des entités dans les notes  
   - `showEntityConstellation()`, `clearEntityFocus()`  
   - Layer Three.js `MissileArcsLayer`

5. **MODULE 5 — PANNEAU DE NOTE & RÉCAP**  
   - `openSummaryInPanel()`  
   - Gestion du recap, rendu Markdown, liens internes  
   - Fermeture du panneau et recentrage carte

