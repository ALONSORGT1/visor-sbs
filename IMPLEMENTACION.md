# Implementación y validación de StereoLab

Fecha: 20 de octubre de 2026. Referencia: `AUDITORIA.md`, revisión del commit inicial `abb235e`.

Commit de implementación y pruebas: `713c4b8`.

## Resultado general

Se implementaron las correcciones de código y la asistencia de calibración conservando HTML, CSS, módulos ES, Three.js, lil-gui, Bootstrap y publicación estática. La aplicación inicia con recursos incluidos, procesa fotografías localmente, conserva ajustes independientes y evita trasladar una calibración de una foto a otra. Se añadió un favicon SVG del visor.

La aplicación no pretende deducir la configuración óptica ideal ni sustituir una prueba con teléfono y gafas. Las demostraciones incluidas son escenas sintéticas identificadas; no son fotografías propias de la práctica.

## Correcciones, archivos y resultados

| Problema original | Implementación y archivos | Resultado y validación |
|---|---|---|
| Demos e icono inexistentes | `assets/images/demo-sbs-1.jpg`, `demo-sbs-2.jpg`, documentación y generador; `assets/icons/cardboard.svg`, `favicon.svg`; referencias en `index.html` | Ambas escenas Full-SBS contienen perspectivas calculadas por separado, con paralaje y oclusiones. La primera carga en navegador sin recursos faltantes. Las fotos originales no estaban disponibles en las ubicaciones revisadas. |
| Primera visita sin imagen y errores poco claros | Estado inicial descriptivo en HTML y manejo de errores en `main.js`/`fileLoader.js` | Si falla una demo se ofrece cargar una imagen local. Si falla una foto nueva, se mantiene la anterior. Mensajes persistentes y controles habilitados según estado. |
| Calibración heredada de otra foto | `calibration.js`, `settings.js`, `fileLoader.js`, `main.js` | SHA-256 del contenido en contextos compatibles; identificador de respaldo en HTTP LAN sin Web Crypto. Se guardan parámetros confirmados mediante “Guardar para esta foto”. Nuevas fotos parten de valores neutrales; preferencias de calidad separadas. Pruebas con igual nombre y distinto contenido. |
| Exportación sin recuperación/importación | Esquema JSON v2 y validación en `calibration.js`; interfaz en HTML/main | Validación de esquema, unidades, metadatos, tipos y rangos; límite de 64 KiB; vista previa antes de aplicar. Aviso cuando el JSON corresponde a otra imagen. Archivos corruptos no alteran la vista. |
| Ajustes en px CSS cambiaban su efecto relativo | `layout.js`, `viewer.js`, `controls.js` | Desplazamientos en % del ancho/alto visible de un ojo; signos y proporciones se mantienen con escala, orientación y tamaño. Pan común y desplazamiento relativo representan las traslaciones independientes de ambos ojos. Pruebas matemáticas y tamaños de navegador 320/768/1280 px. |
| Compatibilidad con JSON original | Conversión explícita en `calibration.js` y cálculo de referencia en main | Utiliza formato y escala del JSON antiguo y tamaño actual del visor. Advierte que es aproximada: los archivos originales no registraron el viewport. Se exige revisar la vista previa. Probada escala 180 % y Half-SBS. |
| Consumo de memoria de imágenes grandes | Cabeceras y presupuesto en `fileLoader.js`; calidad en `settings.js`/`scene.js` | Validación antes de decodificar: hasta 30 MiB comprimidos y 40 MP de origen; límite de lado 32768. Preparación proporcional por calidad y GPU. Las decodificaciones se serializan; las canceladas no pueden reemplazar una carga nueva. Se liberan bitmap, canvas y textura anteriores. |
| Ancho impar | Preparación por mitades en `fileLoader.js`; protección en layout/viewer | Se omite únicamente la columna central y se prepara un ancho par; las vistas no mezclan su frontera. Se informa al usuario y no se modifica el archivo original. |
| Pérdida del contexto WebGL | Eventos en `scene.js`, resubida de recursos en `viewer.js` | Conserva fuente preparada y ajustes, evita dibujar durante la pérdida, restaura recursos y color de fondo, solicita redibujado. Pérdida/restauración real mediante `WEBGL_lose_context` probada en navegador. |
| Carrera fullscreen al entrar/salir | Estado deseado y operaciones serializadas en `ui.js` | Una respuesta tardía no reactiva una salida cancelada ni cierra una reentrada válida. Manejo de rechazo, Escape, doble toque touch/pen, orientación opcional y limpieza. Pruebas deterministas de carreras y 30 ciclos. |
| Pantalla que puede apagarse en Cardboard | Wake Lock con ciclo de visibilidad en `ui.js` | Solicitud opcional, liberación al salir/ocultar, recuperación al volver y descarte de respuestas tardías. Probado con dobles controlados; el comportamiento físico depende del navegador/teléfono. |
| Calibración manual difícil | Previsualizaciones en HTML/main, `assistance.js` y `alignmentWorker.js` | Compara Full/Half, ofrece pistas de nombre sin asumir certeza, análisis vertical local opcional y revisión antes de aplicar. Aplicar/Descartar/Deshacer y edición manual. Prueba con desnivel conocido. |
| Interacciones contradictorias o fuera de orden | Contadores/AbortController y estado de controles en main | Calidad bloqueada durante la carga; una importación vieja no sustituye a otra reciente; cambios manuales, reinicio y nueva foto invalidan JSON pendiente. lil-gui se sincroniza al cambiar de fotografía o descartar una propuesta. Regresiones en navegador. |

## Nuevas funciones y uso

1. **Cargar SBS:** selecciona JPG, PNG, WebP o AVIF compatible con tu navegador. La imagen permanece en el dispositivo. Los recursos CDN requieren conexión; no reciben la fotografía.
2. **Comparar Full-SBS y Half-SBS:** compara las dos miniaturas de un ojo y elige la proporción natural. Las dimensiones por sí solas no prueban que haya compresión anamórfica. Intercambiar L/R permanece disponible en lil-gui.
3. **Calidad:** Equilibrada prepara hasta 8 MP y lado 4096, Alta hasta 16 MP y lado 8192, Ahorro hasta 3 MP y lado 3072. Todos respetan el límite de textura de la GPU. Los presupuestos del framebuffer son 8/16/2 MP respectivamente; Ahorro limita además DPR a 1. No se amplían las fotos pequeñas.
4. **Ajustar encuadre:** centra la vista y vuelve a escala 100 %, manteniendo formato y correcciones relativas.
5. **Analizar alineación:** compara miniaturas de hasta 256 × 256 por ojo. Busca correspondencias únicas, comprueba su consenso y propone sólo una traslación vertical cuando la evidencia es suficiente. Textura plana/repetida, oclusiones o discrepancias producen un aviso en vez de un ajuste inventado. El consenso mostrado no es una probabilidad de comodidad óptica.
6. **Vista previa:** la propuesta se muestra sin guardarse. Puedes editarla, Aplicar o Descartar. Tras aplicar puedes Deshacer; un cambio manual posterior inicia una nueva edición.
7. **Guardar para esta foto:** confirma los valores en este navegador para recuperarlos al abrir de nuevo el mismo contenido. Se retienen hasta 60 calibraciones recientes. Si el almacenamiento falla, se indica que el guardado queda sólo en sesión y se ofrece usar JSON.
8. **Exportar/Importar JSON:** guarda o restaura parámetros y metadatos; nunca incluye los píxeles. Un JSON de otra fotografía necesita revisión explícita antes de aplicarse.
9. **Cardboard:** oculta controles y usa fullscreen/orientación cuando se permiten; dispone de alternativa CSS. Escape o doble toque táctil permiten salir. No hay paneles ni mensajes superpuestos sobre las lentes.

Los controles avanzados de lil-gui conservan paralaje, escala, encuadre X/Y, desnivel, Full/Half e intercambio L/R. Los desplazamientos ahora usan porcentajes para que la calibración sobreviva a cambios de tamaño. El reset no borra silenciosamente la calibración confirmada: para reemplazarla con los valores neutrales hay que volver a guardar.

## Pruebas ejecutadas

### Automatizadas

`node --test`: **57 aprobadas, 0 fallidas**.

- 8 de asistencia: signos y magnitud de desnivel conocido, disparidad horizontal variable, imágenes planas, repetidas, incompatibles y formato ambiguo.
- 14 de calibración: esquema v2, conversión antigua, rangos, campos extra, prototipos, archivo diferente, aislamiento por contenido, copia de valores, retención, preferencias, corrupción y cuota bloqueada.
- 16 del cargador: cabeceras PNG/JPEG/WebP/AVIF, límites antes del decodificador, presupuestos, aspecto/paridad, SHA-256/respaldo, cancelación, serialización y liberación de recursos.
- 13 de inmersión: respuestas tardías, reentrada, rechazo, Escape, doble toque, orientación y Wake Lock con dobles, limpieza y 30 ciclos consecutivos.
- 6 de geometría: Full/Half, ajuste sin deformación, signos, desplazamientos proporcionales y cambios de escala/tamaño.

Las pruebas de APIs nativas con dobles verifican la lógica de la aplicación, no que un teléfono concreto otorgue esos permisos. Las cabeceras de formatos se prueban separadamente del decodificador real.

### Navegador y WebGL reales

`tests/browser-harness.html`, servido por HTTP: **23 aprobadas, 0 fallidas, 0 omitidas**, incluida la casilla de imagen de 18 MP.

Se verificaron carga de PNG, estado inicial, ajustes, independencia de archivos con igual nombre, recuperación, sincronización de GUI, Full/Half, L/R, reinicio, JSON/exportación/importación y carreras, calidad, tres tamaños, análisis vertical conocido con aplicar/deshacer, pérdida/restauración real de WebGL y ausencia de errores de la aplicación capturados durante la suite.

La prueba grande cargó un PNG sintético **6000 × 3000 (18 MP), 9.54 MiB de archivo**, mostró sus dimensiones originales e informó la copia reducida de visualización. No se midieron tiempos comparativos, RAM máxima, consumo GPU, batería ni mejoras porcentuales de rendimiento. Los presupuestos descritos son límites de diseño, no mediciones de memoria real del dispositivo.

Adicionalmente se observaron las demos JPG, la orientación correcta de sus rótulos, el diseño, la vista Cardboard sin controles y dos ciclos de entrada/salida por Escape conservando paralaje 3.5 %, desnivel 1.5 % y escala 80 %. El navegador de comprobación utilizó la vista inmersiva CSS; no se certifica fullscreen nativo en un teléfono.

También se ejecutaron `node --check` en todos los módulos y `git diff --check`.

El harness conserva/restaura los registros locales que usa y genera sólo archivos sintéticos. La prueba no usa fotos personales. Sus instrumentaciones de exportación y lecturas diferidas existen exclusivamente en el archivo de pruebas.

## Estado de los hallazgos originales

| Hallazgo de la auditoría | Estado final | Alcance |
|---|---|---|
| Recursos faltantes y carga inicial dañada | Parcialmente solucionado | Inicio, iconos, favicon y dos demos técnicas restaurados y verificados. Los JPG originales siguen bloqueados por un recurso externo no disponible; se conserva la declaración sintética. |
| Configuración heredada entre fotografías | Solucionado y verificado | Huella del contenido, valores neutrales, guardado confirmado y recuperación independiente. |
| Correcciones alteradas por escala y pantalla | Solucionado y verificado | Coordenadas proporcionales, pruebas puras y tres tamaños de navegador. Comodidad con lentes pendiente. |
| Presupuesto de resolución y memoria | Solucionado y verificado | Preflight, perfiles, reducción, límites GPU, ancho impar y cola de decodificación. Prueba real de 18 MP; RAM/batería móvil no medidas. |
| Carrera de entrada/salida fullscreen | Implementado, pendiente de prueba física | Lógica verificada con promesas diferidas; modo CSS y Escape comprobados. Restricciones nativas del teléfono pendientes. |
| Recuperación del contexto WebGL | Solucionado y verificado | Pérdida/restauración y redibujado probados mediante extensión real del navegador. |
| Importación y persistencia de JSON | Solucionado y verificado | Esquema v2, antigua versión con aviso, vista previa, archivo diferente y resolución fuera de orden. |
| Calibración asistida de imagen | Solucionado y verificado | Comparación Full/Half, análisis vertical conservador, confirmar/descartar/deshacer y edición manual. |
| Screen Wake Lock y orientación | Implementado, pendiente de prueba física | Ciclos y errores comprobados con dobles; permisos y suspensión reales dependen del teléfono. |
| Perfiles QR y distorsión óptica | No implementado, con justificación | Es una fase óptica independiente: necesita parámetros físicos, shader/modelo de distorsión y validación con las lentes. No se presenta la asistencia de imagen como sustituto. No era requisito de la práctica introductoria. |
| Documentación y evidencias académicas | Parcialmente solucionado | README con enlaces reales y flujo actualizado. Fotografía propia, experiencia física y conclusiones individuales requieren trabajo real del estudiante. |

## Ejecución, repetición y publicación

La aplicación no necesita Node, npm, backend, instalación de paquetes ni claves. Desde la raíz usa Live Server o:

```sh
python -m http.server 5500
```

Abre `http://localhost:5500/`. Para la suite del navegador abre `http://localhost:5500/tests/browser-harness.html`, activa la prueba de 18 MP y pulsa **Ejecutar pruebas de navegador**. Los resultados aparecen en la misma página. Para las pruebas de desarrollo, si tienes Node instalado:

```sh
node --test
```

El `package.json` sólo configura módulos y una orden de pruebas; no añade dependencias ni una etapa de compilación. La regeneración opcional de los JPG utiliza Python/NumPy/Pillow; no es necesaria para ejecutar el visor con los recursos incluidos.

Los commits de esta implementación se publican en `main` por autorización explícita del usuario. Pages conserva el despliegue desde la raíz y las rutas relativas. Después del push se debe comprobar la versión servida en el [sitio público](https://alonsorgt1.github.io/visor-sbs/) y los commits en el [repositorio](https://github.com/ALONSORGT1/visor-sbs).

La entrega académica sigue siendo exactamente: URL del repositorio, URL funcional de Pages y conclusiones individuales. Este informe de implementación no se convierte en una evidencia obligatoria adicional.
