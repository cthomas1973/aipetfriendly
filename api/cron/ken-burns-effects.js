// api/cron/ken-burns-effects.js
//
// Efecto "Ken Burns" (zoom/paneo lento de ffmpeg) compartido entre
// generate-blog-social-video.js (video mudo) y social-video-audio-captions.js
// (video con voz en off + subtitulos). Se separo en su propio modulo para que
// ambos puedan importarlo sin crear una dependencia circular entre si.

// Variantes de movimiento. Se elige una por publicacion de forma
// deterministica en base al id del borrador (no al azar), asi corridas
// repetidas del cron dan el mismo resultado para un mismo post. Cero costo
// extra: sigue siendo solo ffmpeg.
export function pickKenBurnsEffect(seed, totalFrames) {
  const effects = [
    {
      name: 'zoom-in-centro',
      zoomExpr: 'min(zoom+0.0015,1.15)',
      x: 'iw/2-(iw/zoom/2)',
      y: 'ih/2-(ih/zoom/2)',
    },
    {
      // Centrado en la mitad inferior de la imagen: evita "comerse" el
      // banner de titulo (que va arriba) a medida que avanza el zoom.
      name: 'zoom-in-mitad-inferior',
      zoomExpr: 'min(zoom+0.0015,1.15)',
      x: 'iw/2-(iw/zoom/2)',
      y: 'ih-(ih/zoom)',
    },
    {
      name: 'paneo-izquierda-derecha',
      zoomExpr: 'min(zoom+0.0012,1.12)',
      x: `(iw-iw/zoom)*(on/${totalFrames})`,
      y: 'ih/2-(ih/zoom/2)',
    },
    {
      name: 'paneo-derecha-izquierda',
      zoomExpr: 'min(zoom+0.0012,1.12)',
      x: `(iw-iw/zoom)*(1-on/${totalFrames})`,
      y: 'ih/2-(ih/zoom/2)',
    },
  ];

  let hash = 0;
  for (const char of String(seed)) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return effects[hash % effects.length];
}

// zoompan recorta pixeles enteros de su imagen de ENTRADA en cada frame; si
// esa entrada ya esta al tamanio final (1080x1080), un zoom lento avanza en
// pasos de pocos pixeles por frame y se nota "vibrado"/a los saltos en vez de
// fluido (bug conocido de ffmpeg, no de nuestra formula de zoom). El fix
// estandar es escalar la imagen a una resolucion bastante mayor ANTES de
// zoompan, para que cada frame pueda moverse una fraccion de pixel real del
// tamanio final (zoompan ya reescala de vuelta a `size` con el parametro
// `s`). Con esto el movimiento se ve continuo sin cambiar la formula de zoom.
const ZOOMPAN_UPSCALE_FACTOR = 3;

export function buildKenBurnsBackgroundFilter(effect, { size, totalFrames, fps }) {
  const upscaledSize = size * ZOOMPAN_UPSCALE_FACTOR;
  return [
    `scale=${upscaledSize}:${upscaledSize}:flags=lanczos`,
    `zoompan=z='${effect.zoomExpr}':x='${effect.x}':y='${effect.y}':d=${totalFrames}:s=${size}x${size}:fps=${fps}`,
    'vignette=PI/6',
  ].join(',');
}
