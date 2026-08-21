-- Lets a training sign-off be flagged for follow-up (separate from the
-- existing free-text `notes` column, which already covers general
-- per-item assessment notes) - mirrors the requires_followup flag already
-- used on maintenance_record for the same "needs another look" signal.
alter table public.training_signoff add column requires_followup boolean not null default false;
