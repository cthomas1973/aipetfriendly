#!/usr/bin/env node
/**
 * regenerate-post-image.mjs
 *
 * Script MANUAL puntual: corrige un post del blog cuya imagen quedo con la
 * especie equivocada (bug de pet_focus sorteado antes de saber el tema real
 * del articulo, ver api/cron/generate-blog-post.js). Regenera la imagen con
 * la especie correcta, actualiza blog_posts y recrea el borrador de
 * publicacion social (Admin > Publicaciones) con la imagen nueva.
 *
 * Uso: node --env-file=.env.local scripts/regenerate-post-image.mjs <slug> <perro|gato>
 * Requiere en el entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SERVICE_KEY),
 * AI_API_KEY (y opcionalmente AI_BASE_URL / AI_IMAGE_MODEL).
 */

import {
  getSupabaseAdminClient,
  generateArticleImage,
  uploadImageToStorage,
  createSocialDraftFromBlogPost,
} from '../api/cron/generate-blog-post.js';

const PET_FOCUS_BY_SPECIES = {
  perro: 'perro mestizo',
  gato: 'gato mestizo domestico',
};

async function main() {
  const [slug, species] = process.argv.slice(2);
  if (!slug || !PET_FOCUS_BY_SPECIES[species]) {
    throw new Error('Uso: node --env-file=.env.local scripts/regenerate-post-image.mjs <slug> <perro|gato>');
  }
  const petFocus = PET_FOCUS_BY_SPECIES[species];

  const admin = getSupabaseAdminClient();

  const { data: post, error } = await admin.from('blog_posts').select('*').eq('slug', slug).maybeSingle();
  if (error) {
    throw new Error(`No se pudo buscar el post: ${error.message}`);
  }
  if (!post) {
    throw new Error(`No existe ningun post con slug "${slug}".`);
  }

  console.log(`Regenerando imagen de "${post.title}" con protagonista: ${petFocus}...`);
  const imageBuffer = await generateArticleImage(post.title, post.topic, petFocus);
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

  await createSocialDraftFromBlogPost(admin, { blogPost: { ...post, image_url: imageUrl }, articleImageBuffer: imageBuffer });

  console.log('Listo: imagen del post y borrador social actualizados.');
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
