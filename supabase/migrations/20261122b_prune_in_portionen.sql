-- mkt_srv_prune in Portionen.
--
-- Der erste Lauf von 20261122_verlauf_klein.sql wollte die Bilddaten von
-- 1.303 Einträgen (~3 GB) in einem Rutsch freigeben und lief jedes Mal in das
-- Statement-Timeout des Workers (service_role über PostgREST, ~8 s). Alte
-- TOAST-Daten freizugeben ist teuer, und `image <> ''` hat zusätzlich jedes
-- Eingabefoto entpackt.
--
-- Jetzt: höchstens p_batch Einträge pro Aufruf und nur Bedingungen auf
-- billigen Spalten (purged_at, after_path, NULL-Prüfung).
--
-- Den Rückstand vom 22.11. so abzubauen war zu langsam (200 Einträge > 2 min
-- auf Nano, weil jeder alte TOAST-Block einzeln gelöscht wird). Stattdessen
-- wurde gen_items einmalig neu geschrieben – nur die Bilder der behaltenen
-- Aufträge kamen mit, die alte Datei (3,1 GB) wurde am Stück verworfen:
--
--   begin;
--   set local lock_timeout = '15s';
--   alter table marketing.gen_items add column _behalten boolean not null default false;
--   with r as (
--     select i.job_id, i.created_at,
--            row_number() over (partition by i.user_id order by i.created_at desc, i.idx desc) as rn
--     from marketing.gen_items i)
--   update marketing.gen_items set _behalten = true
--    where job_id in (select job_id from r where rn <= 20 or created_at > now() - interval '24 hours')
--       or status in ('pending', 'processing');
--   alter table marketing.gen_items
--     alter column result type text using (case when _behalten and after_path is null then result end),
--     alter column image  type text using (case when _behalten then image else '' end);
--   alter table marketing.gen_items drop column _behalten;
--   commit;
--
-- Ergebnis: gen_items 3,1 GB → 64 MB, Datenbank 3.262 MB → 220 MB. Danach
-- einmal `select count(*) from public.mkt_srv_prune(20, 1000, 2000);` für die
-- Verweise; die Dateien löscht der Worker.

drop function if exists public.mkt_srv_prune(integer, integer);

create or replace function public.mkt_srv_prune(
  p_keep integer default 20, p_limit integer default 100, p_batch integer default 20)
 returns setof text
 language plpgsql
 security definer
 set search_path to 'marketing', 'public'
as $function$
declare
  v_keep  uuid[];
  v_batch integer := greatest(1, least(coalesce(p_batch, 20), 5000));
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
   where i.id in (
     select x.id from marketing.gen_items x
     where not (x.job_id = any (v_keep))
       and x.status in ('done', 'error')
       and (x.purged_at is null or x.after_path is not null)
     limit v_batch);

  update marketing.gen_jobs j
     set before_path = null
   where j.before_path is not null
     and not (j.id = any (v_keep))
     and not exists (select 1 from marketing.gen_items i
                     where i.job_id = j.id and i.status in ('pending', 'processing'));

  -- Ergebnis liegt im Archiv → die Kopie in der DB ist überflüssig.
  update marketing.gen_items i
     set result = null
   where i.id in (
     select x.id from marketing.gen_items x
     where x.result is not null and x.after_path is not null and x.status = 'done'
     limit v_batch);

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

revoke all on function public.mkt_srv_prune(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.mkt_srv_prune(integer, integer, integer) to service_role;
