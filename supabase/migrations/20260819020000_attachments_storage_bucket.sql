-- attachments — public storage bucket for user-uploaded files: packing
-- slips (Receiving), the pest control floor plan (PestControlMapSettings),
-- and anything similar later. Both call sites were calling
-- base44.integrations.Core.UploadFile, which doesn't exist at all on the
-- Supabase-backed base44 client (see src/api/base44Client.js) — file upload
-- has never actually worked anywhere in this app since the migration off
-- base44. Public read so a stored URL can be used directly in <img>/<iframe>
-- src the way the existing viewer components already expect, without a
-- separate signed-URL refresh step.

insert into storage.buckets (id, name, public) values ('attachments', 'attachments', true)
on conflict (id) do nothing;

create policy "attachments_authenticated_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'attachments');
create policy "attachments_public_read" on storage.objects
  for select to public using (bucket_id = 'attachments');
create policy "attachments_authenticated_update" on storage.objects
  for update to authenticated using (bucket_id = 'attachments');
create policy "attachments_authenticated_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'attachments');
