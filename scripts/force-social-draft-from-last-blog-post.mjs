#!/usr/bin/env node
/**
 * force-social-draft-from-last-blog-post.mjs
 *
 * Script MANUAL de prueba (no es un cron, no se ejecuta solo): toma el ultimo
 * post del blog que tenga imagen, borra cualquier borrador social 'blog_auto'
 * ya creado para ese post (para poder forzar la regeneracion mientras se
 * ajusta el diseño) y crea uno nuevo, reusando la misma logica que corre
 * automaticamente en api/cron/generate-blog-post.js. NO gasta cuota de
 * SerpApi/IA: no genera un post nuevo, solo reusa uno ya existente.
 *
 * Uso: node --env-file=.env.local scripts/force-social-draft-from-last-blog-post.mjs
 * Requiere en el entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SERVICE_KEY).
 */

import { getSupabaseAdminClient, createSocialDraftFromBlogPost } from '../api/cron/generate-blog-post.js';

async function main() {
  const admin = getSupabaseAdminClient();

  const { data: post, error } = await admin
    .from('blog_posts')
    .select('*')
    .not('image_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo buscar el ultimo post del blog: ${error.message}`);
  }
  if (!post) {
    console.log('No hay ningun post del blog con imagen todavia.');
    return;
  }

  console.log(`Usando post: "${post.title}" (slug: ${post.slug})`);

  const { error: deleteError } = await admin
    .from('social_posts')
    .delete()
    .eq('source', 'blog_auto')
    .eq('source_ref_id', post.id);
  if (deleteError) {
    throw new Error(`No se pudo limpiar el borrador previo: ${deleteError.message}`);
  }

  const imageResponse = await fetch(post.image_url);
  if (!imageResponse.ok) {
    throw new Error(`No se pudo descargar la imagen del post (status ${imageResponse.status}).`);
  }
  const articleImageBuffer = Buffer.from(await imageResponse.arrayBuffer());

  await createSocialDraftFromBlogPost(admin, { blogPost: post, articleImageBuffer });

  console.log('Listo: borrador creado en Admin > Publicaciones.');
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
