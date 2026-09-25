// api/admin/regenerate-blog-post-image.js
//
// Endpoint manual (no cron): regenera la imagen de un post del blog ya
// creado, por si quedo con la especie equivocada (ver bug corregido en
// api/cron/generate-blog-post.js: el pet_focus se sorteaba antes de saber el
// tema real del articulo) o simplemente porque el admin quiere una version
// distinta antes de programar la publicacion (ver AdminPublicacionesSection).
// Actualiza blog_posts.image_url/pet_focus y recrea el borrador de
// publicacion social (Admin > Publicaciones) con la imagen nueva.
//
// Requiere sesion de admin (Authorization: Bearer <access_token del usuario>,
// verificado contra la tabla admin_users, igual que generate-guide-reel.js).
//
// Body: { slug o postId (blog_posts.id), species: 'perro'|'gato',
// extraInstructions (opcional) }. Devuelve { success, imageUrl, socialPostId
// }: socialPostId es el id NUEVO del borrador en social_posts (el anterior
// se borra y se recrea), asi el frontend puede seguir operando sobre el
// mismo borrador aunque haya cambiado de id.

import { createClient } from '@supabase/supabase-js';
import {
  getSupabaseAdminClient,
  sendJson,
  getEnvOrThrow,
  generateArticleImage,
  uploadImageToStorage,
  createSocialDraftFromBlogPost,
} from '../cron/generate-blog-post.js';

export const config = { maxDuration: 60 };

const PET_FOCUS_BY_SPECIES = {
  perro: 'perro mestizo',
  gato: 'gato mestizo domestico',
};

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
    const { slug, postId, species, extraInstructions } = req.body || {};
    const petFocus = PET_FOCUS_BY_SPECIES[species];
    if ((!slug && !postId) || !petFocus) {
      return sendJson(res, 400, { error: 'Se requiere "slug" o "postId", y "species" ("perro" o "gato").' });
    }

    const postQuery = admin.from('blog_posts').select('*');
    const { data: post, error } = await (postId ? postQuery.eq('id', postId) : postQuery.eq('slug', slug)).maybeSingle();
    if (error) {
      throw new Error(`No se pudo buscar el post: ${error.message}`);
    }
    if (!post) {
      return sendJson(res, 404, { error: `No existe ningun post con ${postId ? `id "${postId}"` : `slug "${slug}"`}.` });
    }

    const imageBuffer = await generateArticleImage(post.title, post.topic, petFocus, extraInstructions);
    const imageUrl = await uploadImageToStorage(admin, post.slug, imageBuffer);

    const { error: updateError } = await admin
      .from('blog_posts')
      .update({ image_url: imageUrl, pet_focus: petFocus })
      .eq('id', post.id);
    if (updateError) {
      throw new Error(`No se pudo actualizar el post: ${updateError.message}`);
    }

    const { error: deleteError } = await admin
      .from('social_posts')
      .delete()
      .eq('source', 'blog_auto')
      .eq('source_ref_id', post.id);
    if (deleteError) {
      throw new Error(`No se pudo limpiar el borrador social previo: ${deleteError.message}`);
    }

    const socialPostId = await createSocialDraftFromBlogPost(admin, { blogPost: { ...post, image_url: imageUrl }, articleImageBuffer: imageBuffer });

    return sendJson(res, 200, { success: true, imageUrl, socialPostId });
  } catch (ex) {
    return sendJson(res, 500, { error: ex instanceof Error ? ex.message : String(ex) });
  }
}
