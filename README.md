# Receta Medica Mobile

PWA movil independiente para capturar recetas desde celular.

## Que incluye

- Receta medica con pacientes, diagnostico, medicamentos, indicaciones y reverso.
- Dictado por voz con Web Speech de Chrome.
- Busqueda de recetas por palabras del paciente, diagnostico, medicamento o codigo.
- Catalogo local de medicamentos.
- Catalogo local de indicaciones.
- Datos del doctor y membrete.
- Vista previa e impresion de frente/reverso.
- Base local en el celular con IndexedDB.
- Exportar/importar respaldo JSON.

## Probar en esta PC

```powershell
cd C:\Users\Oscar\source\repos\EmpresaAPIAgenda\RecetaMedicaMobile
node dev-server.js
```

Abrir:

```text
http://127.0.0.1:8092
```

## Usar en celular sin depender de la PC

Para instalarla en el celular como app, hay que publicarla en HTTPS, por ejemplo Vercel, Netlify o GitHub Pages.

La base de datos queda local en el navegador del celular. El hosting solo entrega los archivos de la app.

## Notas

- Web Speech funciona mejor en Chrome Android.
- La impresion directa depende de que la impresora este disponible desde el celular por WiFi/Mopria/plugin del fabricante.
- Si se borra el sitio/datos del navegador, tambien se borra la base local; usar Exportar respaldo periodicamente.
