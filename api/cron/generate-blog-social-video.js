// api/cron/generate-blog-social-video.js
//
// Segundo paso del pipeline de publicaciones sociales del blog (ver
// generate-blog-post.js). Ese primer cron ya gasta su presupuesto de 60s en
// SerpApi + IA de texto + IA de imagen, asi que crea el borrador de
// social_posts SOLO con la imagen brandeada (media_type='image'). Este cron
// corre unos minutos despues (ver "crons" en vercel.json) con un presupuesto
// de tiempo propio y completo, dedicado unicamente a convertir esa imagen en
// un video "Ken Burns" (zoom lento) para que la publicacion se vea como un
// Reel en vez de una foto estatica.
//
// Busca el borrador de blog_auto mas reciente que siga en status='draft' y
// media_type='image' (es decir, uno que el admin todavia no aprobo/programo),
// y si logra generar el video, ACTUALIZA ese mismo registro (nunca crea uno
// nuevo) reemplazando media_url/media_type. Si el admin ya actuo sobre el
// borrador antes de que este cron corra, se deja intacto (no se pisa una
// decision ya tomada).
//
// Misma autenticacion que generate-blog-post.js (CRON_SECRET opcional).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { getSupabaseAdminClient, sendJson, isAuthorizedCronRequest, uploadSocialDraftMedia } from './generate-blog-post.js';

const execFileAsync = promisify(execFile);

// Sin la presion de tiempo del cron principal, se puede usar una calidad de
// encoding mejor (preset mas lento que "ultrafast") sin riesgo de quedarse
// sin presupuesto dentro del limite de 60s de Vercel Hobby.
export const config = { maxDuration: 60 };

// Solo se consideran borradores creados dentro de esta ventana: si por algun
// motivo un post quedo "colgado" en media_type='image' por mas tiempo que
// esto, ya no vale la pena reintentar el video (probablemente el admin ya lo
// reviso/publico de otra forma, o el articulo perdio actualidad).
const MAX_CANDIDATE_AGE_MS = 3 * 24 * 60 * 60 * 1000;

// Variantes de movimiento para el efecto "Ken Burns". Antes siempre era el
// mismo zoom-in sin x/y explicito (que en ffmpeg equivale a esquina superior
// izquierda, no al centro). Ahora hay 4 variantes -tres zoom centrado/mitad
// inferior + dos paneos laterales- para que los videos no se vean todos
// iguales. Se elige una por publicacion de forma deterministica en base al
// id del borrador (no al azar), asi corridas repetidas del cron dan el mismo
// resultado para un mismo post. Cero costo extra: sigue siendo solo ffmpeg.
function pickKenBurnsEffect(seed, totalFrames) {
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

// Genera un video corto tipo "Ken Burns" (zoom/paneo lento sobre la imagen
// fija) a partir de la imagen ya brandeada del articulo. No usa ningun
// servicio de IA de video (sin costo extra): es pura animacion con ffmpeg,
// con una leve vineta para un acabado mas prolijo. `timeoutMs` corta el
// proceso si se cuelga, para no arriesgar el limite de la funcion.
async function generateKenBurnsVideo(imageBuffer, { durationSeconds = 6, fps = 25, size = 1080, timeoutMs = 45000, seed = '' } = {}) {
  if (!ffmpegPath) {
    throw new Error('No se encontro el binario de ffmpeg (ffmpeg-static).');
  }

  const tmpDir = await mkdtemp(path.join(tmpdir(), 'apf-social-video-'));
  const inputPath = path.join(tmpDir, 'input.png');
  const outputPath = path.join(tmpDir, 'output.mp4');

  try {
    await writeFile(inputPath, imageBuffer);

    const totalFrames = durationSeconds * fps;
    const effect = pickKenBurnsEffect(seed, totalFrames);
    const filter = [
      `scale=${size}:${size}`,
      `zoompan=z='${effect.zoomExpr}':x='${effect.x}':y='${effect.y}':d=${totalFrames}:s=${size}x${size}:fps=${fps}`,
      'vignette=PI/6',
      'format=yuv420p',
    ].join(',');

    await execFileAsync(ffmpegPath, [
      '-y',
      '-loop', '1',
      '-i', inputPath,
      '-vf', filter,
      '-t', String(durationSeconds),
      '-r', String(fps),
      // Sin apuro de tiempo: "fast" da mejor calidad/compresion que
      // "ultrafast" y sigue sobrando margen contra el limite de 60s.
      '-preset', 'fast',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath,
    ], { timeout: timeoutMs });

    return { buffer: await readFile(outputPath), effectName: effect.name };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Trae el borrador pendiente mas antiguo (FIFO) para no saltear ninguno si
// llegaran a acumularse mas de uno entre corridas.
async function findPendingImageDraft(admin) {
  const minCreatedAt = new Date(Date.now() - MAX_CANDIDATE_AGE_MS).toISOString();

  const { data, error } = await admin
    .from('social_posts')
    .select('id, media_url, caption, created_at')
    .eq('source', 'blog_auto')
    .eq('status', 'draft')
    .eq('media_type', 'image')
    .gte('created_at', minCreatedAt)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo buscar el borrador pendiente de video: ${error.message}`);
  }

  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (!isAuthorizedCronRequest(req)) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  try {
    const admin = getSupabaseAdminClient();
    const draft = await findPendingImageDraft(admin);

    if (!draft) {
      return sendJson(res, 200, { skipped: true, reason: 'No hay borradores de publicacion social pendientes de video.' });
    }

    const imageResponse = await fetch(draft.media_url);
    if (!imageResponse.ok) {
      throw new Error(`No se pudo descargar la imagen del borrador (status ${imageResponse.status}).`);
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    const { buffer: videoBuffer, effectName } = await generateKenBurnsVideo(imageBuffer, { seed: draft.id });
    const slugGuess = draft.id;
    const videoUrl = await uploadSocialDraftMedia(admin, slugGuess, videoBuffer, { extension: 'mp4', contentType: 'video/mp4' });

    if (!videoUrl) {
      throw new Error('La subida del video no devolvio una URL publica.');
    }

    // Guard `.eq('status', 'draft')`: si el admin ya aprobo/programo este
    // borrador entre que se busco y que termino de generarse el video, no se
    // pisa esa decision (el update simplemente no afecta ninguna fila).
    const { data: updated, error: updateError } = await admin
      .from('social_posts')
      .update({ media_url: videoUrl, media_type: 'video' })
      .eq('id', draft.id)
      .eq('status', 'draft')
      .select('id')
      .maybeSingle();

    if (updateError) {
      throw new Error(`No se pudo actualizar el borrador con el video: ${updateError.message}`);
    }

    if (!updated) {
      return sendJson(res, 200, {
        upgraded: false,
        reason: 'El borrador ya no estaba en estado draft (el admin lo actualizo mientras se generaba el video).',
      });
    }

    return sendJson(res, 200, { upgraded: true, socialPostId: draft.id, effect: effectName });
  } catch (error) {
    console.error('Error generando el video de la publicacion social del blog:', error);
    return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
