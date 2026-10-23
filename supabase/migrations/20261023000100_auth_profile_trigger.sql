-- Legt beim Anlegen eines Auth-Nutzers automatisch ein Profil an und schaltet Live-Updates fuer Leads ein.
-- Oeffentliche Registrierung ist im Supabase-Dashboard abgeschaltet (Nutzer werden eingeladen).

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

alter publication supabase_realtime add table public.leads;
