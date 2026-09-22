// api/cron/generate-blog-social-video.js
//
// Segundo paso del pipeline de publicaciones sociales del blog (ver
// generate-blog-post.js). Ese primer cron ya gasta su presupuesto de 60s en
// SerpApi + IA de texto + IA de imagen, asi que crea el borrador de
// social_posts SOLO con la imagen brandeada (media_type='image'). Este cron
// corre unos minutos despues (ver "crons" en vercel.json) con un presupuesto
// de tiempo propio y completo, dedicado unicamente a convertir esa imagen en
// un video "Ken Burns" (zoom/paneo lento) para que la publicacion se vea
// como un Reel en vez de una foto estatica.
//
// El zoom/paneo se aplica sobre la FOTO ORIGINAL del articulo (blog_posts.
// image_url), no sobre la imagen ya brandeada: el banner de titulo y el logo
// se overlayan FIJOS encima del video con ffmpeg (ver
// generateKenBurnsVideoWithBranding), asi no se mueven ni se deforman con el
// zoom. Si por algun motivo no se puede reconstruir esa foto original (post
// no encontrado, imagen no descargable, etc.), cae a un fallback que zoomea
// la imagen ya brandeada completa (comportamiento anterior, ver
// generateKenBurnsVideo) para que el pipeline nunca se rompa.
//
// Ademas, si se pudo reconstruir la foto original, se intenta primero la
// version con voz en off (guion-gancho generado por IA) + subtitulos
// quemados sincronizados (ver social-video-audio-captions.js). Si CUALQUIER
// paso de ese pipeline extra falla (falta AI_API_KEY, la API de TTS o de
// transcripcion no responde, etc.) se cae al video mudo de siempre
// (generateKenBurnsVideoWithBranding), para que el pipeline nunca se rompa
// por esto. Este agregado SI tiene costo (TTS + transcripcion), a diferencia
// del resto del pipeline que es solo ffmpeg/sharp.
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
import sharp from 'sharp';
import { getSupabaseAdminClient, sendJson, isAuthorizedCronRequest, uploadSocialDraftMedia, buildBrandingLayers } from './generate-blog-post.js';
import { pickKenBurnsEffect, buildKenBurnsBackgroundFilter } from './ken-burns-effects.js';
import {
  generateReelHookScript,
  generateVoiceOverAudio,
  transcribeAudioWithWordTimestamps,
  generateReelVideoWithAudioAndCaptions,
} from './social-video-audio-captions.js';

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

// Genera un video corto tipo "Ken Burns" (zoom/paneo lento sobre la imagen
// fija) a partir de la imagen ya brandeada del articulo. No usa ningun
// servicio de IA de video (sin costo extra): es pura animacion con ffmpeg,
// con una leve vineta para un acabado mas prolijo. `timeoutMs` corta el
// proceso si se cuelga, para no arriesgar el limite de la funcion.
export async function generateKenBurnsVideo(imageBuffer, { durationSeconds = 6, fps = 25, size = 1080, timeoutMs = 45000, seed = '' } = {}) {
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
      buildKenBurnsBackgroundFilter(effect, { size, totalFrames, fps }),
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
    .select('id, media_url, caption, created_at, source_ref_id')
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

// Prepara la foto original del articulo (SIN el banner de titulo/logo
// horneados) + las capas de branding por separado, para poder overlayarlas
// FIJAS encima del video ya animado (ver generateKenBurnsVideoWithBranding)
// en vez de zoomearlas junto con el fondo. Si algo falla (el post no tiene
// source_ref_id, no se encuentra en blog_posts, o no se puede descargar la
// imagen original) devuelve null y el caller cae al fallback anterior
// (zoom sobre la imagen ya brandeada completa), para que el pipeline nunca
// se rompa por esto.
export async function tryBuildBrandingFromBlogPost(admin, draft) {
  if (!draft.source_ref_id) {
    return null;
  }

  try {
    const { data: blogPost, error } = await admin
      .from('blog_posts')
      .select('image_url, title, content')
      .eq('id', draft.source_ref_id)
      .maybeSingle();

    if (error || !blogPost?.image_url) {
      return null;
    }

    const rawResponse = await fetch(blogPost.image_url);
    if (!rawResponse.ok) {
      return null;
    }
    const rawOriginal = Buffer.from(await rawResponse.arrayBuffer());

    // Mismo tamanio final que el video (1080x1080), asi las posiciones del
    // banner/logo calculadas por buildBrandingLayers coinciden con el frame
    // que arma ffmpeg (que tambien escala a 1080x1080).
    const size = 1080;
    const rawImageBuffer = await sharp(rawOriginal).resize(size, size, { fit: 'cover' }).png().toBuffer();
    const { bannerLayer, logoLayer } = await buildBrandingLayers(rawImageBuffer, blogPost.title);

    return { rawImageBuffer, bannerLayer, logoLayer, title: blogPost.title, content: blogPost.content };
  } catch (error) {
    console.warn('No se pudo preparar el branding separado del video, se usa el fallback (zoom sobre la imagen ya brandeada):', error);
    return null;
  }
}

// Igual que generateKenBurnsVideo, pero el zoom/paneo se aplica SOLO a la
// foto original (sin banner ni logo), y el banner de titulo + el logo se
// overlayan FIJOS encima con ffmpeg (no se mueven ni se zoomean), para que
// el texto del titulo quede siempre legible en su lugar mientras el fondo
// se anima. Sigue sin usar ningun servicio de IA de video.
export async function generateKenBurnsVideoWithBranding(rawImageBuffer, { bannerLayer, logoLayer, durationSeconds = 6, fps = 25, size = 1080, timeoutMs = 45000, seed = '' } = {}) {
  if (!ffmpegPath) {
    throw new Error('No se encontro el binario de ffmpeg (ffmpeg-static).');
  }

  const tmpDir = await mkdtemp(path.join(tmpdir(), 'apf-social-video-'));
  const outputPath = path.join(tmpDir, 'output.mp4');

  try {
    const bgPath = path.join(tmpDir, 'bg.png');
    await writeFile(bgPath, rawImageBuffer);

    const totalFrames = durationSeconds * fps;
    const effect = pickKenBurnsEffect(seed, totalFrames);
    const bgFilter = buildKenBurnsBackgroundFilter(effect, { size, totalFrames, fps });

    const inputArgs = ['-loop', '1', '-framerate', String(fps), '-i', bgPath];
    const filterSteps = [`[0:v]${bgFilter}[bg]`];
    let lastLabel = 'bg';
    let nextInputIndex = 1;

    if (bannerLayer) {
      const bannerPath = path.join(tmpDir, 'banner.png');
      await writeFile(bannerPath, bannerLayer.buffer);
      inputArgs.push('-loop', '1', '-framerate', String(fps), '-i', bannerPath);
      const label = `b${nextInputIndex}`;
      filterSteps.push(`[${lastLabel}][${nextInputIndex}:v]overlay=${bannerLayer.left}:${bannerLayer.top}[${label}]`);
      lastLabel = label;
      nextInputIndex += 1;
    }

    if (logoLayer) {
      const logoPath = path.join(tmpDir, 'logo.png');
      await writeFile(logoPath, logoLayer.buffer);
      inputArgs.push('-loop', '1', '-framerate', String(fps), '-i', logoPath);
      const label = `l${nextInputIndex}`;
      filterSteps.push(`[${lastLabel}][${nextInputIndex}:v]overlay=${logoLayer.left}:${logoLayer.top}[${label}]`);
      lastLabel = label;
      nextInputIndex += 1;
    }

    filterSteps.push(`[${lastLabel}]format=yuv420p[outv]`);

    await execFileAsync(ffmpegPath, [
      '-y',
      ...inputArgs,
      '-filter_complex', filterSteps.join(';'),
      '-map', '[outv]',
      '-t', String(durationSeconds),
      '-r', String(fps),
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

    const branding = await tryBuildBrandingFromBlogPost(admin, draft);

    let videoBuffer;
    let effectName;
    let hasAudio = false;

    if (branding) {
      // Primero se intenta la version completa (guion-gancho + voz en off +
      // subtitulos quemados). Si CUALQUIER paso de ese pipeline falla (falta
      // AI_API_KEY, la API de TTS/transcripcion no responde, etc.) se cae al
      // video mudo de siempre, para que el pipeline nunca se rompa por esto.
      try {
        const script = await generateReelHookScript({ title: branding.title, content: branding.content });
        const audioBuffer = await generateVoiceOverAudio(script);
        const words = await transcribeAudioWithWordTimestamps(audioBuffer);
        const result = await generateReelVideoWithAudioAndCaptions(branding.rawImageBuffer, {
          bannerLayer: branding.bannerLayer,
          logoLayer: branding.logoLayer,
          audioBuffer,
          words,
          seed: draft.id,
        });
        videoBuffer = result.buffer;
        effectName = result.effectName;
        hasAudio = true;
      } catch (audioError) {
        console.warn('Fallo el pipeline de audio+subtitulos, se usa el fallback mudo:', audioError);
        const result = await generateKenBurnsVideoWithBranding(branding.rawImageBuffer, {
          bannerLayer: branding.bannerLayer,
          logoLayer: branding.logoLayer,
          seed: draft.id,
        });
        videoBuffer = result.buffer;
        effectName = result.effectName;
      }
    } else {
      const imageResponse = await fetch(draft.media_url);
      if (!imageResponse.ok) {
        throw new Error(`No se pudo descargar la imagen del borrador (status ${imageResponse.status}).`);
      }
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      const result = await generateKenBurnsVideo(imageBuffer, { seed: draft.id });
      videoBuffer = result.buffer;
      effectName = result.effectName;
    }

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

    return sendJson(res, 200, { upgraded: true, socialPostId: draft.id, effect: effectName, hasAudio });
  } catch (error) {
    console.error('Error generando el video de la publicacion social del blog:', error);
    return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
