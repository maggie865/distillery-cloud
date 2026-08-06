-- Server-side enforcement that only @bluffdistillery.com accounts can sign in.
--
-- The app already restricts this on the client (AuthContext signs out and
-- rejects any session whose email isn't @bluffdistillery.com, and the Google
-- button passes hd=bluffdistillery.com to narrow the account picker) - but
-- neither of those is a real security boundary, since a client can be
-- bypassed. This "Before User Created" auth hook is the actual boundary: it
-- runs inside Supabase Auth itself and can reject account creation outright.
--
-- After running this migration, wire it up in the Supabase dashboard:
--   Authentication -> Hooks -> "Before User Created" -> Postgres function
--   -> select public.restrict_signup_domain -> Enable
--
-- NOTE: verify the hook name and event payload shape against current
-- Supabase docs before enabling - this was written without live access to
-- supabase.com/docs and Auth Hooks have changed shape before.

create or replace function public.restrict_signup_domain(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_email text;
begin
  user_email := event->'user'->>'email';

  if user_email is null or user_email !~* '^[^@]+@bluffdistillery\.com$' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Only @bluffdistillery.com Google accounts are permitted to sign in.'
      )
    );
  end if;

  return jsonb_build_object();
end;
$$;

-- Only the Auth service should be able to call this.
revoke execute on function public.restrict_signup_domain(jsonb) from public, anon, authenticated;
grant execute on function public.restrict_signup_domain(jsonb) to supabase_auth_admin;
