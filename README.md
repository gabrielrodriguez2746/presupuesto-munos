# Presupuesto Muñoz

Dashboard read-only del presupuesto familiar, publicado en GitHub Pages, alimentado
en vivo por tres pestañas de Google Sheets publicadas como CSV (Presupuesto,
Supuestos, Colchón). Sin backend, sin build: `index.html` + `app.js` vanilla +
Papa Parse y Chart.js por CDN.

Nunca escribe en el Sheet — es solo lectura. Editar el presupuesto siempre pasa
por Google Sheets.

## Configuración (URLs de los CSV)

Las URLs de los tres CSV publicados NO están en el código — irían en el
historial de un repo, aunque sea privado. Se pasan en el fragmento (`#...`)
de la URL de la página, que nunca se envía al servidor ni queda en logs:

    https://tu-usuario.github.io/presupuesto-munos/#p=URL_PRESUPUESTO&s=URL_SUPUESTOS&c=URL_COLCHON

Cada `URL_*` es la URL de "Publicar en la web" → CSV de esa pestaña,
url-encoded (`encodeURIComponent`). Sin este fragmento la página muestra un
aviso y no intenta cargar nada. Guarda el enlace completo como marcador —
es la única copia de esas URLs que necesitas conservar.

## Desarrollo local

Abrir `index.html` directamente en el navegador, o servirlo con cualquier
servidor estático (por ejemplo `python3 -m http.server`), y añadir el
fragmento `#p=...&s=...&c=...` descrito arriba a la URL.

## Estructura

- `index.html` — esqueleto de la página
- `style.css` — estilos
- `app.js` — fetch + parseo de los CSV, proyección del colchón, render
