// api/admin/generate-guide-reel.js
//
// Genera "a demanda" (boton manual en el admin, no cron) el mismo tipo de
// reel que se genera automaticamente para los posts del blog (guion-gancho
// via IA + voz en off + subtitulos quemados + banner de titulo/logo fijos +
// zoom Ken Burns), pero para una guia de src/data/petGuides.ts.
//
// Las guias son contenido estatico en codigo (no hay tabla ni "evento de
// publicacion" en la base), asi que no hay forma de detectar automaticamente
// "una guia nueva" sin agregar un cron + tabla de tracking. Se opto por un
// endpoint que el admin dispara a mano desde el panel de Publicaciones,
// eligiendo la guia de una lista (ver public/guides-feed.json).
//
// Requiere sesion de admin (Authorization: Bearer <access_token del usuario>,
// verificado contra la tabla admin_users, igual que las RPCs de Postgres).
// Si el pipeline de audio+subtitulos falla, cae al video Ken Burns mudo (como
// el cron de blog) para no dejar al admin sin nada tras la espera.

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import {
  getSupabaseAdminClient,
  sendJson,
  uploadSocialDraftMedia,
  buildBrandingLayers,
  getEnvOrThrow,
  SITE_URL,
} from '../cron/generate-blog-post.js';
import { generateKenBurnsVideoWithBranding } from '../cron/generate-blog-social-video.js';
import {
  generateReelHookScript,
  generateVoiceOverAudio,
  transcribeAudioWithWordTimestamps,
  generateReelVideoWithAudioAndCaptions,
} from '../cron/social-video-audio-captions.js';

export const config = { maxDuration: 60 };

async function requireAdminUser(req, admin) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    throw new Error('Falta el token de autenticacion.');
  }

  const supabaseUrl = getEnvOrThrow('SUPABASE_URL');
  const anonKey = getEnvOrThrow('VITE_SUPABASE_ANON_KEY');
  const authClient = createClient(supabaseUrl, anonKey);

  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) {
    throw new Error('Token invalido o expirado.');
  }

  const { data: adminRow, error: adminError } = await admin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (adminError || !adminRow) {
    throw new Error('No autorizado (se requiere rol admin).');
  }

  return user;
}

async function findGuideBySlug(slug) {
  const response = await fetch(`${SITE_URL}/guides-feed.json`);
  if (!response.ok) {
    throw new Error(`No se pudo traer guides-feed.json (status ${response.status}).`);
  }
  const guides = await response.json();
  const guide = Array.isArray(guides) ? guides.find((g) => g.slug === slug) : null;
  if (!guide) {
    throw new Error(`No se encontro la guia "${slug}" en guides-feed.json (¿esta publicada?).`);
  }
  return guide;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const admin = getSupabaseAdminClient();
    await requireAdminUser(req, admin);

    const slug = String(req.body?.slug || '').trim();
    if (!slug) {
      return sendJson(res, 400, { error: 'Falta el slug de la guia.' });
    }

    const guide = await findGuideBySlug(slug);
    if (!guide.coverImageSrc) {
      return sendJson(res, 400, { error: 'La guia no tiene coverImage, no se puede generar el reel.' });
    }

    const imageResponse = await fetch(`${SITE_URL}${guide.coverImageSrc}`);
    if (!imageResponse.ok) {
      throw new Error(`No se pudo descargar la imagen de portada de la guia (status ${imageResponse.status}).`);
    }
    const rawOriginal = Buffer.from(await imageResponse.arrayBuffer());
    const size = 1080;
    const rawImageBuffer = await sharp(rawOriginal).resize(size, size, { fit: 'cover' }).png().toBuffer();
    const { bannerLayer, logoLayer } = await buildBrandingLayers(rawImageBuffer, guide.title);

    let videoBuffer;
    let effectName;
    let hasAudio = false;
    try {
      const script = await generateReelHookScript({ title: guide.title, content: guide.summary });
      const audioBuffer = await generateVoiceOverAudio(script);
      const words = await transcribeAudioWithWordTimestamps(audioBuffer);
      const result = await generateReelVideoWithAudioAndCaptions(rawImageBuffer, {
        bannerLayer,
        logoLayer,
        audioBuffer,
        words,
        seed: slug,
      });
      videoBuffer = result.buffer;
      effectName = result.effectName;
      hasAudio = true;
    } catch (audioError) {
      console.warn('Fallo el pipeline de audio+subtitulos para la guia, se usa el fallback mudo:', audioError);
      const result = await generateKenBurnsVideoWithBranding(rawImageBuffer, { bannerLayer, logoLayer, seed: slug });
      videoBuffer = result.buffer;
      effectName = result.effectName;
    }

    const videoUrl = await uploadSocialDraftMedia(admin, slug, videoBuffer, {
      extension: 'mp4',
      contentType: 'video/mp4',
      prefix: 'guide',
    });
    if (!videoUrl) {
      throw new Error('La subida del video no devolvio una URL publica.');
    }

    const caption = `📰 ${guide.title}\n\n${guide.summary}\n\nLeé la guía completa 👉 ${SITE_URL}/guias/${slug}\n\n🐾 AiPetFriendly`;

    const { data: inserted, error: insertError } = await admin
      .from('social_posts')
      .insert({
        media_url: videoUrl,
        media_type: 'video',
        caption,
        status: 'draft',
        source: 'guide_manual',
      })
      .select('id')
      .single();

    if (insertError) {
      throw new Error(`No se pudo crear el borrador de publicacion: ${insertError.message}`);
    }

    return sendJson(res, 200, { success: true, socialPostId: inserted.id, effect: effectName, hasAudio });
  } catch (error) {
    console.error('Error generando el reel de una guia:', error);
    return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
