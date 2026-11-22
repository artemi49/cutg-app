-- Verlauf klein halten (HairLab-Projekt, Schema `marketing`).
--
-- Bisher lag jedes Ergebnisbild als data-URL in `gen_items.result` und
-- zusätzlich im Bucket `clipper-history`; dazu jedes Eingabefoto in
-- `gen_items.image`. Nach vier Monaten waren das über 3 GB Datenbank.
--
-- Ab jetzt:
--   * Ergebnisse liegen nur noch im Bucket. `result` bleibt leer, außer das
--     Archivieren ist fehlgeschlagen (Notfall-Ablage, wird später geleert).
--   * Bilder (Eingabefoto, Vorher, Nachher) bleiben nur für die letzten
--     20 Generierungen pro Konto – und für alles aus den letzten 24 Stunden,
--     damit niemandem mitten in der Arbeit ein Bild verschwindet. Aufträge
--     bleiben dabei immer vollständig.
--   * Die Textzeilen des Verlaufs (wer, wann, welcher Style) bleiben komplett,
--     damit Zähler und Monatslimits weiter stimmen.
--
-- Aufgeräumt wird über `mkt_srv_prune`, das der Worker bei leerer Queue
-- aufruft (der Minuten-Cron sorgt dafür, dass das regelmäßig passiert).
-- Dateien löscht der Worker über die Storage-API – direkt per SQL lässt
-- Supabase das nicht zu.
--
-- Nach dem ersten vollständigen Aufräumen einmal von Hand ausführen, damit
-- die Datenbank den Platz auch wirklich freigibt (sperrt nur die beiden
-- Marketing-Tabellen kurz, die App ist nicht betroffen):
--   vacuum full marketing.gen_items;
--   vacuum full marketing.gen_jobs;

-- ------------------------------------------------------------------ Ergebnis abrufen

-- Liefert zusätzlich den Archivpfad: neue Ergebnisse stehen nicht mehr in der DB.
create or replace function public.mkt_get_result(p_job uuid, p_idx integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'marketing', 'public'
as $function$
declare v_owner uuid; v_res jsonb;
begin
  select user_id into v_owner from marketing.gen_jobs where id = p_job;
  if not found then return null; end if;
  if v_owner is distinct from auth.uid() and not marketing.is_admin() then
    raise exception 'No access to this result.';
  end if;

  select jsonb_build_object('image', nullif(i.image, ''), 'result', i.result,
                            'after_path', i.after_path)
    into v_res
  from marketing.gen_items i where i.job_id = p_job and i.idx = p_idx;
  return v_res;
end; $function$;

-- ------------------------------------------------------------------ Aufräumen

create index if not exists gen_items_after_path
  on marketing.gen_items (after_path) where after_path is not null;
create index if not exists gen_jobs_before_path
  on marketing.gen_jobs (before_path) where before_path is not null;

-- Leert Bilddaten außerhalb des Fensters und gibt die Archivdateien zurück,
-- die nichts mehr referenziert. Idempotent – darf jede Minute laufen.
create or replace function public.mkt_srv_prune(p_keep integer default 20, p_limit integer default 100)
 returns setof text
 language plpgsql
 security definer
 set search_path to 'marketing', 'public'
as $function$
declare v_keep uuid[];
begin
  -- Aufträge, die ihre Bilder behalten: alle mit einer der letzten p_keep
  -- Generierungen des Kontos und alles aus den letzten 24 Stunden.
  select coalesce(array_agg(distinct r.job_id), '{}') into v_keep
  from (
    select i.job_id, i.created_at,
           row_number() over (partition by i.user_id order by i.created_at desc, i.idx desc) as rn
    from marketing.gen_items i
  ) r
  where r.rn <= greatest(coalesce(p_keep, 20), 1)
     or r.created_at > now() - interval '24 hours';

  update marketing.gen_items i
     set result = null, image = '', after_path = null,
         purged_at = coalesce(i.purged_at, now())
   where not (i.job_id = any (v_keep))
     and i.status in ('done', 'error')
     and (i.result is not null or i.image <> '' or i.after_path is not null);

  update marketing.gen_jobs j
     set before_path = null
   where j.before_path is not null
     and not (j.id = any (v_keep))
     and not exists (select 1 from marketing.gen_items i
                     where i.job_id = j.id and i.status in ('pending', 'processing'));

  -- Ergebnis liegt im Archiv → die Kopie in der DB ist überflüssig.
  update marketing.gen_items
     set result = null
   where result is not null and after_path is not null and status = 'done';

  -- Archivdateien ohne Verweis (auch aus gelöschten Aufträgen). Frische Dateien
  -- bleiben 10 Minuten verschont: der Worker lädt hoch, bevor er den Pfad einträgt.
  return query
    select o.name from storage.objects o
    where o.bucket_id = 'clipper-history'
      and o.created_at < now() - interval '10 minutes'
      and not exists (select 1 from marketing.gen_items i where i.after_path = o.name)
      and not exists (select 1 from marketing.gen_jobs j where j.before_path = o.name)
    order by o.created_at
    limit greatest(1, least(coalesce(p_limit, 100), 1000));
end; $function$;

revoke all on function public.mkt_srv_prune(integer, integer) from public, anon, authenticated;
grant execute on function public.mkt_srv_prune(integer, integer) to service_role;

-- ------------------------------------------------------------------ Cron-Protokoll

-- Der Minuten-Cron schreibt jeden Lauf in cron.job_run_details (nach vier
-- Monaten 71 MB). Eine Woche reicht zum Nachsehen.
select cron.schedule(
  'cron-protokoll-aufraeumen',
  '17 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
