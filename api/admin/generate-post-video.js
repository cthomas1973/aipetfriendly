// api/admin/generate-post-video.js
//
// Endpoint manual (no cron): genera el video Ken Burns (con voz+subtitulos si
// se puede) para un borrador puntual de social_posts, en vez de esperar a la
// proxima corrida de api/cron/generate-blog-social-video.js. Pensado para el
// flujo de Admin > Publicaciones: despues de regenerar la imagen de un post
// (ver regenerate-blog-post-image.js, que recrea el borrador con
// media_type='image'), este endpoint permite generar el video ahi mismo
// antes de programar la publicacion, sin depender del horario del cron.
//
// Requiere sesion de admin (Authorization: Bearer <access_token del usuario>,
// verificado contra la tabla admin_users, igual que generate-guide-reel.js).
//
// Body: { postId } (id de social_posts, no de blog_posts). Devuelve el mismo
// shape que el cron: { upgraded, socialPostId, mediaUrl, effect, hasAudio }.

import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient, sendJson, getEnvOrThrow } from '../cron/generate-blog-post.js';
import { generateVideoForDraft } from '../cron/generate-blog-social-video.js';

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
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const admin = getSupabaseAdminClient();

  try {
    await requireAdminUser(req, admin);
  } catch (authError) {
    return sendJson(res, 401, { error: authError.message });
  }

  try {
    const { postId } = req.body || {};
    if (!postId) {
      return sendJson(res, 400, { error: 'Se requiere "postId".' });
    }

    const { data: draft, error } = await admin
      .from('social_posts')
      .select('id, media_url, caption, created_at, source_ref_id, status, media_type')
      .eq('id', postId)
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo buscar el borrador: ${error.message}`);
    }
    if (!draft) {
      return sendJson(res, 404, { error: `No existe ningun borrador con id "${postId}".` });
    }
    if (draft.media_type !== 'image') {
      return sendJson(res, 400, { error: 'Este borrador ya tiene video (o no tiene una imagen para convertir).' });
    }

    const result = await generateVideoForDraft(admin, draft);
    return sendJson(res, 200, result);
  } catch (ex) {
    return sendJson(res, 500, { error: ex instanceof Error ? ex.message : String(ex) });
  }
}
