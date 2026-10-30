-- sipgate Neo: der Anbieter-Wert 'sipgate_neo' wird neben 'sipgate_classic' erlaubt. Nur Datei, noch NICHT ausgefuehrt.
-- Nach 20261028000000_telefonie.sql. Der Constraint-Name haengt vom automatisch vergebenen Namen ab
-- (normalerweise telefonie_zugaenge_anbieter_check); deshalb werden alle CHECK-Constraints der Tabelle, die "anbieter"
-- betreffen, robust entfernt und dann neu angelegt.
do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.telefonie_zugaenge'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%anbieter%'
  loop
    execute format('alter table public.telefonie_zugaenge drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.telefonie_zugaenge
  add constraint telefonie_zugaenge_anbieter_check check (anbieter in ('sipgate_classic', 'sipgate_neo'));
