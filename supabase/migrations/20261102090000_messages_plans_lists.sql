-- =====================================================================================
-- YourFavs · Mensajes M5b: los planes fuera del chat (handoff M5 §3.4–§3.6).
--
--   · `plan_mine`: tus planes con «Voy» (quien lo propone, va) entre dos fechas, para el bloque
--     «Planes» de Ver pronto y el calendario de la web. Se LEE de los planes: ninguna lista guarda
--     la fecha, así que «No puedo», cancelar o salir del grupo la quitan solos.
--   · `plan_today_sync`: el aviso «Hoy» de la campana, que se crea al abrirla o al cambiar de página
--     el mismo día (sin cron). Uno por plan y día; si la hora ya pasó, no se crea.
--
-- Seguridad: como M1–M5a, funciones `security definer` solo para el servidor.
-- =====================================================================================

-- Con quién es el plan: el nombre del grupo o, en un 1:1, el de la otra persona.
create function public.plan_conv_label(p_me uuid, p_conv bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.kind = 'group' then c.name
         else (select sp.name from public.social_people(array(
                 select cm.user_id from public.conversation_members cm
                 where cm.conv_id = c.id and cm.user_id <> p_me)) sp limit 1)
         end
  from public.conversations c where c.id = p_conv;
$$;

-- -------------------------------------------------------------------------------------
-- Tus planes con «Voy», sin cancelar, en conversaciones donde sigues, de `p_from` a `p_to`
-- (null = sin límite). Por fecha y hora (sin hora, al final del día).
-- {plans: [{id, convId, kind, with, mediaType, tmdbId, title, poster, date, time, note, yes,
--           seen, past}], convs: ¿tienes alguna conversación?}
-- -------------------------------------------------------------------------------------
create function public.plan_mine(p_me uuid, p_from date, p_to date default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'convId', p.conv_id, 'kind', c.kind,
               'with', public.plan_conv_label(p_me, p.conv_id),
               'mediaType', p.media_type, 'tmdbId', p.tmdb_id, 'title', p.title, 'poster', p.poster,
               'date', p.plan_date, 'time', to_char(p.plan_time, 'HH24:MI'), 'note', p.note,
               'yes', (select count(*) from public.watch_plan_rsvps y where y.plan_id = p.id and y.answer = 'yes'),
               'seen', r.seen_marked, 'past', p.plan_date < public.plan_today())
             order by p.plan_date, p.plan_time nulls last, p.id)
      from public.watch_plans p
      join public.watch_plan_rsvps r on r.plan_id = p.id and r.user_id = p_me and r.answer = 'yes'
      join public.conversation_members cm on cm.conv_id = p.conv_id and cm.user_id = p_me and cm.left_at is null
      join public.conversations c on c.id = p.conv_id
      where p.cancelled_at is null and p.plan_date >= p_from and (p_to is null or p.plan_date <= p_to)
    ), '[]'::jsonb),
    'convs', exists (select 1 from public.conversation_members m where m.user_id = p_me and m.left_at is null)
  );
$$;

-- -------------------------------------------------------------------------------------
-- «Hoy: Perfect Days a las 21:30 con Viernes de pelis». Para quien dijo «Voy» (quien lo propone,
-- también), salvo con los avisos sociales apagados. id `plan_today:{plan}:{día}`: idempotente, y
-- si el plan se mueve a otro día, ese día tendrá el suyo. Devuelve cuántos ha creado.
-- -------------------------------------------------------------------------------------
create function public.plan_today_sync(p_me uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if exists (select 1 from public.profiles pr
             where pr.id = p_me and coalesce(pr.notif_prefs ->> 'social', 'true') = 'false') then
    return 0;
  end if;
  insert into public.notifications (user_id, id, type, title, subtitle, href, poster_path, actor_id, created_at, read)
  select p_me, 'plan_today:' || p.id || ':' || p.plan_date, 'plan_today',
         'Hoy: ' || p.title
           || case when p.plan_time is not null then ' a las ' || to_char(p.plan_time, 'HH24:MI') else '' end
           || coalesce(' con ' || public.plan_conv_label(p_me, p.conv_id), ''),
         'Plan · van ' || (select count(*) from public.watch_plan_rsvps y where y.plan_id = p.id and y.answer = 'yes')
           || coalesce(' · ' || p.note, ''),
         '/mislistas/amigos/mensajes/' || p.conv_id, p.poster, null, now(), false
  from public.watch_plans p
  join public.watch_plan_rsvps r on r.plan_id = p.id and r.user_id = p_me and r.answer = 'yes'
  join public.conversation_members cm on cm.conv_id = p.conv_id and cm.user_id = p_me and cm.left_at is null
  where p.cancelled_at is null
    and p.plan_date = public.plan_today()
    and (p.plan_time is null or p.plan_time > (now() at time zone 'Europe/Madrid')::time)
  on conflict (user_id, id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.plan_conv_label(uuid, bigint)   from public, anon, authenticated;
revoke all on function public.plan_mine(uuid, date, date)      from public, anon, authenticated;
revoke all on function public.plan_today_sync(uuid)            from public, anon, authenticated;
grant execute on function public.plan_mine(uuid, date, date)   to service_role;
grant execute on function public.plan_today_sync(uuid)         to service_role;
