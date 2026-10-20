# Revisión de cumplimiento y mejoras de StereoLab

Fecha: 20 de octubre de 2026. Base local revisada: commit `abb235e` de `main`.

Este documento conserva el diagnóstico anterior a los cambios. El estado actualizado, las correcciones y las pruebas están en [IMPLEMENTACION.md](./IMPLEMENTACION.md).

La aplicación cumple buena parte de la implementación técnica, pero todavía no se puede dar la práctica por completamente cumplida. El bloqueo principal es la ausencia de `assets/`: no se incluyen las dos fotografías de demostración ni el icono que utiliza la interfaz. El repositorio público y la publicación HTTPS sí existen; el sitio publicado también comienza sin imagen.

Esta revisión no modifica la lógica de la aplicación. Las propuestas de automatización de este informe todavía no están implementadas.

## Evidencia comprobada

- [Repositorio público](https://github.com/ALONSORGT1/visor-sbs): accesible mediante navegador; se muestran `css/`, `js/`, `README.md` e `index.html`, pero no `assets/`.
- [Aplicación en GitHub Pages](https://alonsorgt1.github.io/visor-sbs/): accesible por HTTPS; carga la interfaz y lil-gui, pero la demostración inicial falla.
- El árbol del commit local tampoco contiene `assets/`. No es solamente un problema de ruta o caché del navegador.
- Se cargó un PNG sintético SBS de diagnóstico de 800 × 300 píxeles tanto desde HTTP local como desde la aplicación publicada. Se observaron ambas mitades en el visor. Este archivo no constituye la fotografía propia real solicitada por la práctica.
- En la ejecución local se probaron cambios de paralaje y escala, la selección de Half-SBS, Intercambiar L/R, el modo Cardboard, la salida con Escape y Restablecer calibración. El modo Cardboard mostró únicamente las dos vistas. El reinicio devolvió los valores a 0/100/Full-SBS/sin intercambio.
- Seleccionar `README.md` produjo el mensaje de formato inválido y conservó la imagen anterior.
- `node --check` pasó para los seis módulos. Node se usó únicamente como herramienta de revisión; la aplicación sigue sin necesitarlo.
- No se comprobó un teléfono físico, una sesión privada, las lentes reales, el doble toque táctil de salida ni todos los decodificadores JPG/WebP/AVIF. Tampoco se realizó una medición de rendimiento o consumo de memoria en un móvil.

## Matriz de los 39 puntos

Los puntos de comprensión, autoría y entrega personal no pueden certificarse por leer el código. “Implementado” significa que existe soporte en el proyecto; no sustituye la prueba física cuando el requisito la pide.

| Punto | Estado | Evidencia o pendiente |
|---|---|---|
| 1. Recuperar conocimientos previos | Pendiente personal | El README explica SBS, orden de ojos y separación física; la comprensión y la identificación de las vistas deben demostrarse personalmente. |
| 2. Descomprimir y abrir el proyecto | Parcial | Están HTML, CSS, JS y README. Faltan los recursos originales; no se dispone del ZIP para comparar todo su contenido. |
| 3. Organización de archivos | Parcial | Existen los seis módulos con los nombres pedidos y `css/styles.css`. Faltan `assets/images/demo-sbs-1.jpg` y `demo-sbs-2.jpg`. |
| 4. Ejecución local | Verificado por HTTP | Se abrió mediante servidor HTTP local. El README documenta Live Server y una alternativa con Python. No se comprobó la instalación de la extensión de VS Code. |
| 5. Carga inicial | No cumple | El visor y lil-gui se inician, pero la demo predeterminada no existe y aparece “Sin imagen”. |
| 6. Documento HTML | Cumple en código | Encabezado, carga de archivos, botones, visor, Bootstrap CDN, import map y script ES module presentes. |
| 7. Interfaz responsiva | Implementado; validación parcial | Bootstrap usa filas/columnas y el CSS tiene reglas para móvil y orientación. Se observó adaptación en un panel estrecho; falta móvil real y las dos orientaciones físicas. |
| 8. Rutas relativas | Parcial | Las referencias propias son relativas y aptas para una project page. Los recursos de `assets/` no existen. |
| 9. Personalización | Presente | Marca StereoLab, título, descripción y diseño propios. La operabilidad y comodidad táctil necesitan revisión en teléfono. |
| 10. Entrada de la aplicación | Cumple en código | `main.js` enlaza visor, GUI, cargador, botones y eventos. Evita que una carga anterior reemplace a la más reciente. |
| 11. Escena y renderizador | Cumple en código | `WebGLRenderer`, `OrthographicCamera`, dos escenas y viewport/scissor por ojo. |
| 12. Planos y texturas | Cumple en código | `PlaneGeometry` y UV por mitad; una textura compartida. No utiliza innecesariamente `StereoCamera`. |
| 13. Proporción visual | Cumple en código | Ajuste para contener la imagen y fórmulas distintas para Full-SBS y Half-SBS. El formato debe seleccionarse correctamente. |
| 14. Dos demostraciones | No cumple | No existen las dos fotos. No se pueden comprobar sus perspectivas reales ni señalar objetos cercanos, intermedios y de fondo. |
| 15. Módulo de carga y formatos | Implementado; prueba parcial | Soporta selección local y valida JPG/PNG/WebP/AVIF por tipo o extensión. PNG probado; el resto depende también del decodificador del navegador. |
| 16. Fotografía propia real | Pendiente | La carga técnica funciona con la imagen de diagnóstico. No se proporcionó una fotografía SBS propia real para verificarla. |
| 17. Intercambiar L/R | Implementado y accionado | El control intercambia las geometrías UV; se comprobó visualmente el intercambio en la imagen de diagnóstico. Falta juzgar profundidad con una foto real y las gafas. |
| 18. Privacidad y errores | Cumple en lo revisado | El archivo local se usa mediante object URL, no se envía a una API. Hay límite de 30 MiB y rechazo de formato; se probó un archivo de texto inválido. No hay presupuesto propio de megapíxeles. |
| 19. Calibración lil-gui | Verificado | GUI integrada y controles enlazados a la configuración del visor sin recargar. |
| 20. Paralaje | Implementado y accionado | Valor inicial 0 y paso de 1 px. La comodidad de fusión debe probarse con gafas. |
| 21. Escala y encuadre | Implementado; prueba parcial | Escala probada. Mover X/Y está implementado en las transformaciones; no se certifica el encuadre físico. |
| 22. Desnivel vertical | Implementado | Corrección relativa entre ojos en `viewer.js`. Falta una foto con desnivel conocido y la comprobación física. |
| 23. Formato, reinicio y JSON | Implementado; prueba parcial | Full/Half y reinicio accionados. La exportación JSON existe en código; no se verificó el archivo descargado. No hay importación de ajustes, que es una mejora opcional. |
| 24. Diseño móvil | Pendiente parcial | CSS adaptable presente. Faltan pruebas táctiles y ambas orientaciones en teléfono real. |
| 25. Acceso desde teléfono | Publicación disponible; teléfono pendiente | La URL HTTPS está activa. No se probó con el dispositivo del estudiante. |
| 26. Modo Cardboard | Verificado en navegador de escritorio | Vista inmersiva sin controles, solicitud de fullscreen/orientación y alternativa CSS implementadas. Compatibilidad y giro manual deben probarse en móvil. |
| 27. Prueba con gafas | Pendiente físico | No se puede certificar la fusión, comodidad o profundidad a través de las lentes desde este entorno. |
| 28. Comparación antes/después | Pendiente personal | Debe documentar un problema real y el ajuste que mejoró su experiencia física. |
| 29. Repositorio Git | Verificado | Rama `main`, commit inicial y archivos fuente versionados. |
| 30. Repositorio remoto | Verificado | `origin` apunta a `ALONSORGT1/visor-sbs`; el repositorio es accesible. |
| 31. Contenido en GitHub | Parcial | Repositorio público con el código, pero falta `assets/`. En los archivos revisados no se observaron credenciales. |
| 32. GitHub Pages | Publicación verificada | El sitio responde y muestra la app. No se inspeccionó la selección exacta de rama y carpeta en Settings. |
| 33. Validación HTTPS | Parcial | Interfaz, GUI y carga de PNG local comprobadas en la URL pública. Fallan las demos. No se utilizó sesión privada. |
| 34. URL pública en móvil | Pendiente físico | Falta abrirla y probar Cardboard en teléfono. |
| 35. Cumplimiento técnico global | Parcial | Arquitectura, carga y calibración presentes. Faltan recursos y validación móvil/física con foto propia. |
| 36. URL del repositorio | Verificado | `https://github.com/ALONSORGT1/visor-sbs`. |
| 37. URL de Pages | Verificado en escritorio | `https://alonsorgt1.github.io/visor-sbs/`; falta validación móvil. |
| 38. Conclusiones individuales | Pendiente | El README técnico no sustituye conclusiones personales sobre las pruebas realizadas. No se encontró ese texto en el proyecto. |
| 39. Entrega de las tres evidencias | Pendiente | Existen las dos URLs. Falta aportar conclusiones y verificar su entrega en la plataforma, fuera del alcance de esta revisión. |

## Hallazgos y orden de corrección

### 1. Prioridad alta: recuperar los recursos faltantes

Referencias: `js/main.js:63`, `js/main.js:64`, `js/main.js:100`, `index.html:25` e `index.html:77`.

Faltan `assets/images/demo-sbs-1.jpg`, `assets/images/demo-sbs-2.jpg` y `assets/icons/cardboard.svg`. El README anuncia esos recursos, pero ni la copia local ni GitHub los contienen. Deben recuperarse del ZIP original, conservando rutas y nombres. Las demos deben tener dos perspectivas reales distintas; duplicar una imagen no cumple el objetivo de profundidad. Este es el primer problema que resolver antes de añadir funciones.

### 2. Prioridad alta de uso: separar los ajustes por fotografía

Referencia: `js/main.js:36` y `js/main.js:42`.

Se mantiene un único objeto `config`. Cambiar de fotografía no reinicia ni recupera su calibración: una foto nueva hereda el formato, intercambio y desplazamientos de la anterior. Aunque conservarlos puede servir durante pruebas, no es una configuración automática específica de cada imagen y puede producir una primera vista deformada o desalineada.

Propuesta: recuperar ajustes ya confirmados por identificador de imagen; para una foto nueva, comenzar con valores neutrales y sugerir un formato. Separar las preferencias del visor de las correcciones propias de cada fotografía. Usar una huella del archivo cuando sea viable; nombre, tamaño y fecha por sí solos pueden colisionar. Guardar sólo parámetros y metadatos localmente, con manejo de errores de almacenamiento. Añadir importación del JSON existente.

### 3. Prioridad alta de uso: mantener la calibración al cambiar el tamaño

Referencia: `js/viewer.js:63` y `js/viewer.js:66`.

La imagen se ajusta al espacio disponible, pero los desplazamientos permanecen en píxeles CSS. Si un detalle vertical necesita 8 px de corrección y la imagen pasa a mostrarse al doble de tamaño, el mismo detalle necesita aproximadamente 16 px. Mantener 8 px altera la alineación relativa. Cambiar escala también produce esta diferencia.

Propuesta: almacenar las correcciones de la fotografía en coordenadas de la imagen o como fracciones de su tamaño renderizado, y convertirlas al dibujar. Se pueden seguir mostrando píxeles en lil-gui. Mantener aparte los desplazamientos asociados al perfil óptico del visor. Verificar ida y vuelta entre la vista normal y Cardboard, cambio de orientación y cambio de escala.

### 4. Prioridad media: presupuesto de resolución y memoria

Referencias: `js/fileLoader.js:14`, `js/fileLoader.js:25` y `js/viewer.js:78`.

El límite de bytes del archivo comprimido no limita el coste de la imagen decodificada. Una imagen de 8000 × 8000 tiene unos 244 MiB por copia RGBA de 8 bits; CPU, GPU y la foto anterior pueden coexistir temporalmente. Es una estimación teórica, no una medición del teléfono. La aplicación no define su propio presupuesto de píxeles ni prepara una copia adecuada al tamaño de visualización.

Propuesta: revisar dimensiones y presupuesto antes de crear la textura, reducir proporcionalmente una copia de visualización al tamaño útil y a las capacidades GPU, conservar el original y comunicar la resolución utilizada. La posible reducción interna de Three.js por límites de hardware no evita el coste previo de decodificación. Para anchos impares, definir un recorte simétrico o advertencia clara. Cancelar cargas anteriores cuando sea posible, además de ignorar sus resultados, para evitar decodificaciones simultáneas innecesarias.

### 5. Prioridad menor: cancelación al entrar en pantalla completa

Referencia: `js/ui.js:33`.

Si se solicita salir mientras `requestFullscreen()` está pendiente, su resolución posterior no comprueba que la entrada haya sido cancelada. Un arnés en memoria con la promesa de fullscreen diferida reprodujo el estado “CSS Cardboard desactivado, fullscreen activo” después de pedir salir. Es una prueba de la secuencia lógica con dobles, no una reproducción de frecuencia en un teléfono real.

Propuesta: usar un identificador de operación o revisar `inCardboard` después de cada espera y deshacer una entrada cancelada.

### 6. Mejoras adicionales

- Solicitar un dibujo después de `webglcontextrestored` y mostrar un estado recuperable ante pérdida de contexto. El renderizado bajo demanda no tiene un evento propio que repinte inmediatamente al restaurarse el contexto.
- Evitar que el teléfono apague la pantalla mientras está en Cardboard mediante Screen Wake Lock, cuando esté disponible, y liberarlo al salir. Debe tolerar denegación y liberación automática; la [especificación W3C](https://www.w3.org/TR/screen-wake-lock/) permite solicitar ese bloqueo de pantalla bajo determinadas condiciones.
- Mantener el renderizado bajo demanda, la textura compartida y la liberación de recursos: ya son decisiones apropiadas para fotografías estáticas. No hace falta añadir un bucle continuo de animación.
- Ofrecer una calidad de render ajustable y un presupuesto de píxeles, validando nitidez y consumo en el móvil. `high-performance` no debe interpretarse como una mejora automática de autonomía.
- Alinear la sección de evidencias del README con la consigna: exactamente URL del repositorio, URL funcional de Pages y conclusiones individuales. Sus capturas y fotos sugeridas son opcionales, no requisitos adicionales de entrega. Sustituir los ejemplos `USUARIO` por los enlaces reales del proyecto donde corresponda.

## Automatización para Cardboard

Es viable ofrecer una configuración inicial asistida. No es posible deducir una configuración ideal universal sólo a partir de los píxeles de la fotografía: influyen el formato, la geometría estéreo, las lentes, el teléfono y la experiencia de cada persona.

| Función | Automatización razonable | Límite |
|---|---|---|
| Encuadre y proporción | Ajustar la foto al espacio sin deformarla; la aplicación ya lo hace. | Necesita conocer correctamente Full-SBS o Half-SBS. |
| Resolución de visualización | Preparar una copia según tamaño renderizado, calidad seleccionada y presupuesto GPU. | Los límites físicos y la memoria disponible varían; se deben probar. |
| Recuperación de calibración | Recordar parámetros por foto y por perfil de gafas/teléfono. | Es recuperar una elección validada, no deducirla de nuevo. |
| Formato Full/Half | Leer metadatos explícitos cuando existan; usar nombre y proporción como pistas con confianza. | La resolución aislada no determina el formato. Debe existir una corrección manual sencilla. |
| Orden L/R | Recuperar un orden confirmado o leerlo si está documentado. | No se puede garantizar sólo con ancho/alto. Mantener Intercambiar L/R. |
| Desnivel vertical | Analizar correspondencias de miniaturas y sugerir la mediana robusta del desnivel. | Pocas coincidencias, oclusiones, repetición, rotación o exposición distinta pueden invalidar una traslación sencilla. |
| Convergencia horizontal | Sugerir un desplazamiento para un sujeto o región seleccionada. | El ajuste global no elimina disparidades excesivas o geometría defectuosa. No intentar hacer coincidir todos los detalles y eliminar la profundidad. |
| Perfil óptico Cardboard | Importar parámetros de un visor conocido o de su QR y aplicar el modelo óptico. | Requiere render de distorsión, centros por ojo y validación; escanear el QR por sí solo no corrige la imagen. |

Ejemplo de ambigüedad: un archivo de 1920 × 1080 puede ser Full-SBS con vistas de 960 × 1080, o Half-SBS cuyas vistas deben recuperar un aspecto 16:9. Elegir siempre un modo por esa resolución deformaría uno de los casos.

Para una primera versión sencilla, el flujo recomendado es:

1. Cargar la fotografía y preparar una resolución de visualización adecuada.
2. Recuperar sus ajustes si ya se confirmó antes; en caso contrario, iniciar una vista neutral ajustada al espacio.
3. Mostrar dos previsualizaciones para confirmar Full/Half y dejar Intercambiar L/R accesible.
4. Ofrecer “Analizar alineación” como acción opcional, con confianza, vista previa y Deshacer. Aplicar sugerencias sólo con evidencia suficiente.
5. Entrar en Cardboard, probar brevemente y guardar los ajustes confirmados. Conservar lil-gui como panel avanzado para satisfacer el requisito de la práctica.

El análisis puede ejecutarse localmente una vez por carga sobre miniaturas; un Worker evita bloquear la interfaz. Conviene posponer bibliotecas grandes y rectificación avanzada hasta que hagan falta.

La calibración óptica debe abordarse como una fase independiente. Google describe separación de lentes, distancia a pantalla, alineación y distorsión entre los [parámetros físicos del visor](https://support.google.com/cardboard/manufacturers/answer/6324808?hl=en). Su [ejemplo oficial de Cardboard](https://developers.google.com/cardboard/develop/c/quickstart) utiliza el QR para obtener parámetros y construir matrices y mallas de distorsión. Es un SDK nativo, no un componente que esta aplicación Three.js pueda activar directamente. Haría falta implementar y comprobar su equivalente web. Esta compensación óptica avanzada no figura como requisito obligatorio de la práctica introductoria.

## Pendientes para cerrar la práctica

1. Recuperar y publicar los tres recursos faltantes con sus rutas originales.
2. Comprobar ambas demostraciones y su estereoscopía real.
3. Cargar una foto SBS propia real en el teléfono desde Pages.
4. Probar horizontal/vertical, salida táctil y Cardboard sin controles con las gafas; anotar un ajuste antes/después y la comodidad obtenida.
5. Redactar las conclusiones a partir de esa experiencia y entregar los dos enlaces reales junto con ellas.

El informe es material de revisión del proyecto. No añade un documento obligatorio a las tres evidencias que pide el docente.
