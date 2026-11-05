create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema extensions;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create table auth.refresh_tokens (id bigserial primary key, user_id varchar(255), session_id uuid);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), null)::uuid $$;
create function extensions.digest(text, text) returns bytea language sql immutable as $$ select sha256(convert_to($1, 'utf8')) $$;
create publication supabase_realtime;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
