# Demostraciones técnicas sintéticas

`demo-sbs-1.jpg` y `demo-sbs-2.jpg` son escenas matemáticas generadas por
`generate_demos.py`, **no fotografías propias ni material que sustituya la
fotografía estereoscópica exigida por la práctica**.

Cada archivo contiene dos vistas de 720 × 540 px, Full-SBS (1440 × 540 px total).
Se trazan rayos por separado desde cámaras paralelas separadas 0.10 unidades,
con proyección asimétrica y convergencia a 5.5 unidades. Las superficies a
diferentes profundidades producen paralaje horizontal y oclusiones distintos.
Las cámaras comparten altura: el desnivel vertical esperado es cero.

Los rótulos indican explícitamente que son demostraciones técnicas sintéticas.
Sirven para comprobar carga, proporciones, intercambio L/R, controles y
funcionamiento básico del visor; no calibran lentes ni certifican comodidad
física con Cardboard. Los iconos SVG son originales y se crearon para el proyecto.

Para regenerar (requiere NumPy y Pillow):

```sh
python assets/images/generate_demos.py
```
