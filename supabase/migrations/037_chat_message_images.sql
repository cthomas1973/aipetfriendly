-- Permite adjuntar una imagen (foto) a un mensaje de chat, para que el
-- usuario pueda subir una foto (ej. una mancha en la piel) y la IA la
-- analice junto con el resto del contexto de la mascota.
--
-- La imagen en si se sube a Supabase Storage (bucket "chat-images", publico)
-- desde el edge function pet-ai-chat con la service role key, igual que
-- send-clinical-pdf hace con el bucket "clinical-pdfs" (el bucket se crea
-- de forma perezosa si todavia no existe). No hace falta ninguna politica de
-- Storage nueva porque la escritura siempre pasa por la service role key
-- (bypassea RLS) y la lectura es publica por el flag "public" del bucket.

alter table public.chat_messages
  add column if not exists image_url text;
