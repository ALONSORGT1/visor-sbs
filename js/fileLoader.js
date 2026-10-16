const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MAX_BYTES = 30 * 1024 * 1024;

/**
 * Carga local con URL temporal; ningún archivo del estudiante sale de su navegador.
 * También carga las imágenes de muestra relativas al repositorio de GitHub Pages.
 */
export async function loadSbsImage(source) {
  const isFile = source instanceof File;
  if (isFile) {
    if (!SUPPORTED_TYPES.has(source.type) && !/\.(jpe?g|png|webp|avif)$/i.test(source.name)) {
      throw new Error('Selecciona una imagen JPG, PNG, WebP o AVIF.');
    }
    if (source.size > MAX_BYTES) throw new Error('La fotografía supera el límite de 30 MB.');
  }
  const url = isFile ? URL.createObjectURL(source) : source;
  const image = new Image();
  image.decoding = 'async';
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('No se pudo abrir la imagen. Comprueba el formato o archivo.'));
      image.src = url;
    });
    if (image.naturalWidth < 4 || image.naturalHeight < 2) {
      throw new Error('La resolución de la imagen es demasiado pequeña.');
    }
    return { image, name: isFile ? source.name : decodeURIComponent(source.split('/').pop()) };
  } finally {
    // El elemento Image conserva los píxeles decodificados tras revocar la URL.
    if (isFile) URL.revokeObjectURL(url);
  }
}
