# Bibliotecas por defecto de Excalidraw

Los archivos `.excalidrawlib` que pongas en esta carpeta estarán disponibles
en la pizarra desde el primer inicio (se cargan una vez por navegador).

## Cómo añadir una biblioteca

1. Descarga la biblioteca que quieras desde https://libraries.excalidraw.com
   (botón "Download" → obtienes un archivo `.excalidrawlib`).
2. Copia ese archivo dentro de esta carpeta (`frontend/public/libraries/`).
3. Añade su nombre al array de `index.json`. Ejemplo:

   ```json
   ["software-architecture.excalidrawlib", "uml.excalidrawlib"]
   ```

4. Recarga la app. Para volver a forzar la carga de las bibliotecas por
   defecto en un navegador que ya las cargó, borra la clave
   `tesseract-default-libs-loaded` de localStorage (DevTools → Application).

> Nota: importar bibliotecas directamente desde libraries.excalidraw.com con el
> botón "Add to Excalidraw" también funciona y se guardan automáticamente en
> IndexedDB; estas bibliotecas por defecto son solo el set inicial.
