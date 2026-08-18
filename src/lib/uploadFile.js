import { supabase } from '@/api/supabaseClient';

// Uploads a file to the shared public "attachments" Storage bucket (see
// supabase/migrations/20260819020000_attachments_storage_bucket.sql) and
// returns its public URL — real replacement for the dead
// base44.integrations.Core.UploadFile(...) calls (base44.integrations
// doesn't exist on the Supabase-backed base44 client — see
// src/api/base44Client.js — so every file upload in the app has been
// throwing immediately since the migration off base44, not just Receiving's
// packing slip upload). `folder` just groups files for readability in the
// bucket; every file gets a random name so two uploads never collide.
export async function uploadFile(file, folder = 'uploads') {
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
  const path = `${folder}/${crypto.randomUUID()}${ext}`;
  const { error } = await supabase.storage.from('attachments').upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('attachments').getPublicUrl(path);
  return data.publicUrl;
}
