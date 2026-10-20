# StereoLab — Visor estereoscópico SBS

Aplicación educativa estática para **Desarrollo de Soluciones en Ambientes
Virtuales**, construida con HTML, CSS, Bootstrap 5, Three.js y lil-gui. Muestra
pares estereoscópicos Full-SBS y Half-SBS en dos vistas para un teléfono con
gafas tipo Google Cardboard. Mantiene las fotografías y su procesamiento en el
navegador.

El [informe de implementación](./IMPLEMENTACION.md) registra las correcciones,
las 57 pruebas automatizadas, las 23 comprobaciones del navegador y los límites
de validación física. La [auditoría original](./AUDITORIA.md) se conserva como
referencia histórica.

## Ejecución local

No requiere instalar paquetes npm, un backend ni claves API. Desde la carpeta
del proyecto:

```sh
python -m http.server 5500
```

Abre `localhost:5500` en el navegador. También puedes usar Live Server en VS Code.
Los módulos JavaScript necesitan HTTP o HTTPS: abrir `index.html` con doble clic
no es una forma de ejecución compatible.

Las dependencias se cargan desde jsDelivr, con versiones fijadas en `index.html`.
Se necesita acceso a Internet para descargarlas. La aplicación no es una PWA
sin conexión ni incluye una copia local de esas bibliotecas.

## Uso y calibración por fotografía

1. El inicio carga una **demostración técnica sintética**. Las dos demos incluyen
   rótulos visibles y perspectivas calculadas desde cámaras distintas, con
   paralaje y oclusiones. **No son fotografías propias ni sustituyen la fotografía
   estereoscópica real que exige la práctica.**
2. Usa **Cargar SBS** o arrastra una imagen JPG, PNG, WebP o AVIF al visor. El
   navegador debe poder decodificar el formato seleccionado.
3. Compara las previsualizaciones **Full-SBS** y **Half-SBS** si desconoces el
   formato. Full conserva la proporción de cada mitad; Half descomprime cada
   mitad horizontalmente. Las dimensiones por sí solas no prueban la compresión.
   Un nombre como `half-sbs` sólo aporta una sugerencia que puedes corregir.
4. Empieza con escala 100 y traslaciones 0. **Ajustar encuadre** permite volver a
   un encuadre neutral; el panel avanzado lil-gui mantiene paralaje, escala,
   posición, desnivel y **Intercambiar L/R** disponibles.
5. Opcionalmente pulsa **Analizar alineación**. El procesamiento local busca
   coincidencias únicas en miniaturas y sólo ofrece una corrección vertical
   cuando existe consenso suficiente. Revisa la vista previa y elige **Aplicar**
   o **Descartar**. **Deshacer** permite recuperar el estado anterior de la
   propuesta aplicada; también puedes ajustar cualquier control manualmente.
6. Pulsa **Guardar para esta foto** cuando confirmes la calibración. La siguiente
   carga de esa misma fotografía recupera los valores guardados. Las fotografías
   nuevas empiezan con valores neutrales; los cambios sin confirmar no se guardan
   automáticamente como una calibración definitiva.
7. **Exportar JSON** descarga los parámetros y metadatos, sin píxeles. Para
   recuperarlos, carga la fotografía, usa **Importar JSON**, revisa la propuesta
   y confirma su aplicación. Si deseas recuperarlos automáticamente en visitas
   posteriores, pulsa también **Guardar para esta foto**.
8. Elige la calidad y entra en **Cardboard** con el teléfono horizontal. Para
   salir usa Escape en computadora, dos toques próximos y rápidos en el visor
   táctil, o el gesto/botón del navegador para salir de pantalla completa.

### Unidades de los controles

Las traslaciones usan **porcentajes del tamaño renderizado de un ojo**, incluida
la escala. Así conservan su relación con la fotografía al cambiar el tamaño del
visor, rotar el dispositivo, escalar o entrar en pantalla completa.

| Control | Referencia y efecto |
|---|---|
| Paralaje (%) | Porcentaje del ancho de un ojo; reparte el desplazamiento horizontal entre L y R en sentidos opuestos |
| Escala (%) | Tamaño de ambas perspectivas; 100 ajusta la imagen conservando su proporción |
| Mover X (%) | Porcentaje del ancho de un ojo; desplaza ambas vistas horizontalmente |
| Mover Y (%) | Porcentaje del alto de un ojo; desplaza ambas vistas verticalmente |
| Desnivel L/R (%) | Porcentaje del alto de un ojo; un valor positivo eleva L y baja R, la mitad en cada vista |
| Tipo de SBS | Full-SBS o Half-SBS; no cambia los píxeles del archivo |
| Intercambiar L/R | Cambia qué mitad se presenta a cada ojo |

Paralaje/desnivel y encuadre se combinan para controlar las posiciones relativas
de ambos ojos. La alineación digital no cambia la separación física de las
lentes y no calcula la profundidad ideal de una escena.

### Guardado y JSON

La identidad de cada archivo se calcula sobre su contenido: SHA-256 cuando
Web Crypto está disponible, con una huella alternativa de contenido y tamaño
para navegadores que no lo ofrecen. Renombrar un archivo no crea una fotografía
nueva; volver a codificarlo sí puede cambiar su identidad. La huella alternativa
no tiene las garantías criptográficas de SHA-256.

Se conservan hasta 60 calibraciones confirmadas en `localStorage`, separadas de
la preferencia general de calidad. No se guardan las fotografías. El navegador
puede borrar estos datos y el almacenamiento es independiente para cada origen
y navegador. Si está bloqueado o lleno, el visor continúa durante la sesión e
informa que es necesario exportar JSON para conservar los valores.

El formato actual es JSON **versión 2**, esquema `stereolab.calibration` y
unidades `image-percent`. Se validan estructura, tipos, límites, versión y
metadatos. Un JSON de otra fotografía requiere revisar su vista previa antes de
aplicarlo. Los archivos del exportador original también pueden importarse, pero
la conversión desde píxeles CSS es **aproximada**: usa el tamaño renderizado
actual, porque el formato antiguo no guardaba el tamaño de pantalla. Debe
revisarse y confirmarse. El tamaño máximo de importación es 64 KB.

## Resolución, memoria y calidad

Se inspecciona la cabecera antes de decodificar una imagen y se limita el origen
a **30 MiB**, **40 megapíxeles** y 32768 píxeles por dimensión. Un archivo pequeño
puede necesitar mucha memoria al decodificarse; el peso comprimido no determina
el consumo real. Los formatos o cabeceras que no se pueden reconocer se rechazan
con una explicación.

La imagen se prepara localmente sin ampliarla y respetando la proporción de sus
dos mitades. Si el ancho es impar se omite la columna central para obtener dos
ojos del mismo ancho. El límite de textura de WebGL también restringe el tamaño
final.

| Calidad | Presupuesto máximo de textura SBS | Dimensión máxima de textura | Presupuesto máximo del framebuffer |
|---|---:|---:|---:|
| Económica | 3 MP | 3072 px | 2 MP |
| Automática | 8 MP | 4096 px | 8 MP |
| Nítida | 16 MP | 8192 px | 16 MP |

Son presupuestos máximos, no resoluciones garantizadas ni mediciones de memoria.
El tamaño disponible, la pantalla y los límites del dispositivo pueden reducir
el resultado. El framebuffer es el área que dibuja WebGL; su presupuesto es
independiente del de la fotografía. La calidad automática equilibra detalle y
consumo; prueba Económica si el teléfono tiene recursos limitados.

Las cargas anteriores se cancelan o invalidan cuando se elige otro archivo.
Se liberan texturas, geometrías, mapas de bits, URL temporales y recursos que
dejan de usarse. Las fotografías estáticas se dibujan bajo demanda, al cargar,
modificar controles o cambiar el tamaño; no necesitan un bucle continuo.

## Cardboard, recuperación y límites

La entrada y salida de pantalla completa se coordinan para manejar solicitudes
tardías, Escape y pulsaciones repetidas. El modo Cardboard oculta los controles
normales y las etiquetas del visor. Cuando el navegador lo permite, intenta
bloquear la orientación horizontal y usar **Screen Wake Lock** para mantener la
pantalla activa. El bloqueo se libera al salir u ocultar la página y se intenta
recuperar al volver a ella. Si el navegador deniega estas APIs, la visualización
continúa con una alternativa CSS y puedes girar el teléfono manualmente.

Ante una pérdida de contexto WebGL se informa del problema y se intenta
restaurar los recursos y volver a dibujar la imagen sin recargar la página.
Si el navegador o la GPU no pueden recuperarse, la aplicación no puede garantizar
una restauración automática.

El análisis vertical trabaja con miniaturas de hasta 256 × 256 píxeles por ojo,
preferentemente en un worker. Rechaza imágenes planas, pocas coincidencias,
patrones repetidos y resultados contradictorios. Su indicador de consenso **no
es una probabilidad de comodidad óptica**. Tampoco determina el orden L/R,
la profundidad perfecta, rotaciones complejas, distorsión de lentes ni un perfil
óptico ideal. La estimación puede no ofrecer una sugerencia incluso para una
pareja válida; los controles manuales siguen disponibles.

No se implementa lectura de QR de perfiles de gafas ni corrección de distorsión
óptica específica de Cardboard. La comprobación con teléfonos, lentes y usuarios
reales continúa siendo necesaria; las pruebas de software y las demos sintéticas
no sustituyen esa verificación física.

## Privacidad y dependencias

Las fotografías se leen y procesan en el dispositivo. El código no las envía a
servidores ni necesita una cuenta para cargarlas. Las calibraciones locales y
los JSON sólo contienen parámetros y metadatos, incluido el nombre y la huella
del archivo. Revisa esos metadatos antes de compartir un JSON.

GitHub Pages sirve la aplicación y las demos. jsDelivr sirve Bootstrap, Three.js
y lil-gui; esas conexiones permiten a los proveedores recibir los datos normales
de una solicitud web. Este proyecto no incluye analítica ni un backend de
fotografías.

## Estructura

```text
visor-sbs/
├── index.html                   # Interfaz, favicon e import map con versiones fijadas
├── css/styles.css               # Interfaz adaptable y modo Cardboard
├── js/
│   ├── main.js                  # Carga, propuestas y acciones de la interfaz
│   ├── settings.js              # Valores, límites y perfiles de calidad
│   ├── calibration.js           # Validación, persistencia y JSON
│   ├── layout.js                # Coordenadas proporcionales de ambos ojos
│   ├── viewer.js                # Textura SBS, geometrías y calibración
│   ├── scene.js                 # Renderizado bajo demanda y contexto WebGL
│   ├── controls.js              # Panel avanzado lil-gui
│   ├── fileLoader.js            # Cabeceras, huellas y preparación de imágenes
│   ├── assistance.js            # Sugerencias de formato y alineación vertical
│   ├── alignmentWorker.js       # Coincidencias locales fuera del hilo de interfaz
│   └── ui.js                    # Fullscreen, orientación, Wake Lock y avisos
├── assets/
│   ├── images/                  # Dos demos sintéticas, generador y explicación
│   └── icons/                   # Cardboard y favicon SVG
├── tests/                       # Pruebas automatizadas de lógica y regresiones
├── package.json                 # Módulos ES y script de pruebas; sin dependencias npm
├── AUDITORIA.md                 # Informe de diagnóstico original
└── README.md
```

## Pruebas y mantenimiento

Para las pruebas de desarrollo se requiere Node.js con soporte de `node:test`,
sin instalar paquetes:

```sh
node --test
```

El comando comprueba los casos automatizados presentes en `tests/`. No prueba
por sí solo la pantalla completa real, la GPU, lentes o todos los navegadores.
Además se deben comprobar en un navegador la carga inicial, archivos inválidos,
ambos formatos, L/R, calibración, escala, fotos independientes, JSON, cambios de
tamaño, calidad y varias entradas/salidas de Cardboard. La consola no debe
mostrar errores nuevos.

Las demos pueden regenerarse opcionalmente con Python, NumPy y Pillow:

```sh
python assets/images/generate_demos.py
```

Estas bibliotecas sólo son necesarias para regenerar los JPG; el visor usa los
archivos ya incluidos. Los parámetros de las cámaras y el alcance de los
recursos sintéticos están documentados en `assets/images/README.md`.

## Publicación y entrega académica

GitHub Pages publica la rama `main`, carpeta raíz. Todos los recursos usan rutas
relativas para funcionar como página de proyecto. Antes de publicar una nueva
versión, ejecuta las pruebas, revisa la aplicación con servidor HTTP y confirma
que los JPG, iconos y módulos forman parte del commit. Después de subirlo,
comprueba que el despliegue de Pages termine correctamente.

La entrega contiene los dos enlaces y las conclusiones:

1. **Repositorio:** [ALONSORGT1/visor-sbs](https://github.com/ALONSORGT1/visor-sbs).
2. **Sitio publicado:** [StereoLab en GitHub Pages](https://alonsorgt1.github.io/visor-sbs/).

### Conclusiones técnicas

Las dos perspectivas de una imagen SBS necesitan conservar su proporción y su
correspondencia entre ojos. Full-SBS y Half-SBS requieren tratamientos
horizontales distintos; la resolución del archivo no basta para elegirlos con
certeza.

Expresar las traslaciones como porcentaje de la imagen visible conserva la
calibración al redimensionar el visor. Guardar valores confirmados por huella de
contenido evita trasladar por accidente la calibración de una fotografía a otra.

La automatización útil puede reducir la resolución con un presupuesto conocido,
recuperar parámetros y sugerir un desnivel cuando hay coincidencias coherentes.
La configuración óptica de las gafas y la comodidad final siguen requiriendo
verificación física. Las demostraciones sintéticas permiten comprobar el
software, pero la fotografía propia y las conclusiones individuales de cada
integrante deben incorporarse como evidencias reales de la práctica.
