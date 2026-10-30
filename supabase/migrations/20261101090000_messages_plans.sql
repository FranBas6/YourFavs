-- =====================================================================================
-- YourFavs · Mensajes M5a: «Plan para verla» (docs/Mensajes/design_handoff_m5/README.md §2).
--
-- Un plan es un título + un día (+ hora y nota opcionales) dentro de una conversación, como una
-- tarjeta 'plan' en el grupo de mensajes de quien lo propone. Cada persona responde «Voy» o
-- «No puedo» (quien lo propone, va). El estado se calcula al pintar para quien mira.
--
--   · Responder NO escribe en el chat. Cambiar el día o la hora y cancelar SÍ dejan una línea de
--     sistema y avisan en la campana SOLO a quien había dicho «Voy» (menos a quien lo hace).
--   · Al cambiar, las respuestas se mantienen.
--   · Todo en hora de Madrid: no se puede proponer en un día pasado, ni hoy a una hora ya pasada.
--   · Si sales del grupo (o te quitan), tu respuesta se borra.
--   · Ver pronto y el calendario LEEN de aquí (M5b); no se copia la fecha a ninguna lista.
--
-- Seguridad: como M1–M4, RLS sin políticas y funciones `security definer` solo para el servidor.
-- =====================================================================================

create table public.watch_plans (
  id           bigint generated always as identity primary key,
  conv_id      bigint not null references public.conversations (id) on delete cascade,
  message_id   bigint unique references public.messages (id) on delete set null,
  created_by   uuid not null references auth.users (id) on delete cascade,
  media_type   text not null check (media_type in ('movie', 'tv')),
  tmdb_id      integer not null,
  title        text not null,
  poster       text,
  plan_date    date not null,                 -- día en Europe/Madrid
  plan_time    time,                          -- null = sin hora
  note         text check (char_length(note) <= 80),
  source       text not null default 'plus' check (source in ('plus', 'title_card', 'wtw')),
  wtw_of       smallint,                      -- «Salió en ¿Qué vemos? · pendiente de los 4»
  wtw_have     smallint,
  prev_date    date,                          -- el último cambio, para «Antes: …»
  prev_time    time,
  changed_at   timestamptz,
  cancelled_at timestamptz,
  created_at   timestamptz not null default now()
);
create index watch_plans_conv on public.watch_plans (conv_id, plan_date);

create table public.watch_plan_rsvps (
  plan_id     bigint not null references public.watch_plans (id) on delete cascade,
  user_id     uuid   not null references auth.users (id) on delete cascade,
  answer      text   not null check (answer in ('yes', 'no')),
  seen_marked boolean not null default false,  -- «¿La visteis?» ya contestado (vista o «Aún no»)
  updated_at  timestamptz not null default now(),
  primary key (plan_id, user_id)
);
create index watch_plan_rsvps_user on public.watch_plan_rsvps (user_id, answer);

alter table public.watch_plans      enable row level security;
alter table public.watch_plan_rsvps enable row level security;

alter table public.messages drop constraint messages_card_type_check;
alter table public.messages add constraint messages_card_type_check
  check (card_type in ('title', 'rec', 'wtw', 'plan'));

-- -------------------------------------------------------------------------------------
-- Ayudas: hoy y ahora en Madrid, y «sáb 24 oct · 21:30» para los avisos.
-- -------------------------------------------------------------------------------------
create function public.plan_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Europe/Madrid')::date; $$;

create function public.plan_label(p_date date, p_time time)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['dom','lun','mar','mié','jue','vie','sáb'])[extract(dow from p_date)::int + 1] || ' '
      || extract(day from p_date)::int || ' '
      || (array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'])[extract(month from p_date)::int]
      || case when p_time is not null then ' · ' || to_char(p_time, 'HH24:MI') else '' end;
$$;

-- ¿Se puede quedar ese día a esa hora? (no en el pasado, en hora de Madrid)
create function public.plan_when_ok(p_date date, p_time time)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_date > public.plan_today()
      or (p_date = public.plan_today()
          and (p_time is null or p_time > (now() at time zone 'Europe/Madrid')::time));
$$;

-- Nota: recortada, sin saltos de línea, null si queda vacía. (El tope de 80 lo pone la tabla.)
create function public.plan_clean_note(p_note text)
returns text
language sql
immutable
set search_path = ''
as $$ select nullif(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), ''); $$;

-- Avisos de la campana a quienes dijeron «Voy» (menos a quien lo hace). Solo dentro de la web.
create function public.plan_notify_yes(p_plan public.watch_plans, p_actor uuid, p_type text, p_title text, p_sub text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, id, type, title, subtitle, href, poster_path, actor_id, created_at, read)
  select r.user_id, p_type || ':' || p_plan.id || ':' || extract(epoch from now())::bigint, p_type,
         p_title, p_sub, '/mislistas/amigos/mensajes/' || p_plan.conv_id, p_plan.poster, p_actor, now(), false
  from public.watch_plan_rsvps r
  where r.plan_id = p_plan.id and r.answer = 'yes' and r.user_id <> p_actor
    and exists (select 1 from public.conversation_members cm
                where cm.conv_id = p_plan.conv_id and cm.user_id = r.user_id and cm.left_at is null)
    -- Quien apagó los avisos sociales no los recibe (como social_notify).
    and not exists (select 1 from public.profiles pr
                    where pr.id = r.user_id and coalesce(pr.notif_prefs ->> 'social', 'true') = 'false')
  on conflict (user_id, id) do nothing;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Proponer. `p_ref`: {mediaType, tmdbId, title, poster?} (lo arma el servidor con TMDB).
-- {ok, message, plan_id} | {ok:false, error: 'none' | 'read_only' | 'past_date' | 'note' | 'title'
--   | 'rate' | 'exists' (+ plan_id, date: ya hay un plan sin pasar de ese título en esta conversación)}
-- -------------------------------------------------------------------------------------
create function public.plan_propose(
  p_me uuid, p_conv bigint, p_ref jsonb, p_date date, p_time time, p_note text,
  p_source text default 'plus', p_wtw_of integer default null, p_wtw_have integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind  public.conv_kind;
  v_other uuid;
  v_note  text := public.plan_clean_note(p_note);
  v_dup   public.watch_plans;
  v_plan  public.watch_plans;
  v_msg   public.messages;
begin
  select c.kind into v_kind from public.conversation_members m join public.conversations c on c.id = m.conv_id
  where m.conv_id = p_conv and m.user_id = p_me and m.left_at is null;
  if v_kind is null then return jsonb_build_object('ok', false, 'error', 'none'); end if;
  if v_kind = 'direct' then
    select user_id into v_other from public.conversation_members where conv_id = p_conv and user_id <> p_me;
    if v_other is null or not public.msg_can_reach(p_me, v_other) then
      return jsonb_build_object('ok', false, 'error', 'read_only');
    end if;
  end if;
  if p_ref is null or coalesce(p_ref ->> 'mediaType', '') not in ('movie', 'tv')
     or coalesce(p_ref ->> 'tmdbId', '') !~ '^[1-9][0-9]{0,8}$' or coalesce(btrim(p_ref ->> 'title'), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'title');
  end if;
  if p_date is null or not public.plan_when_ok(p_date, p_time) then
    return jsonb_build_object('ok', false, 'error', 'past_date');
  end if;
  if char_length(coalesce(v_note, '')) > 80 then return jsonb_build_object('ok', false, 'error', 'note'); end if;
  if (select count(*) from public.messages where author_id = p_me and created_at > now() - interval '1 minute') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'rate');
  end if;
  -- Un solo plan sin pasar del mismo título en la misma conversación.
  select * into v_dup from public.watch_plans
  where conv_id = p_conv and media_type = p_ref ->> 'mediaType' and tmdb_id = (p_ref ->> 'tmdbId')::integer
    and cancelled_at is null and plan_date >= public.plan_today()
  order by plan_date limit 1;
  if v_dup.id is not null then
    return jsonb_build_object('ok', false, 'error', 'exists', 'plan_id', v_dup.id, 'date', v_dup.plan_date, 'time', v_dup.plan_time);
  end if;

  insert into public.watch_plans (conv_id, created_by, media_type, tmdb_id, title, poster, plan_date, plan_time, note,
                                  source, wtw_of, wtw_have)
  values (p_conv, p_me, p_ref ->> 'mediaType', (p_ref ->> 'tmdbId')::integer, left(btrim(p_ref ->> 'title'), 300),
          nullif(left(p_ref ->> 'poster', 200), ''), p_date, p_time, v_note,
          case when p_source in ('plus', 'title_card', 'wtw') then p_source else 'plus' end,
          case when p_source = 'wtw' then p_wtw_of end, case when p_source = 'wtw' then p_wtw_have end)
  returning * into v_plan;
  insert into public.messages (conv_id, author_id, body, card_type, card_ref)
  values (p_conv, p_me, '', 'plan', jsonb_build_object('planId', v_plan.id, 'title', v_plan.title))
  returning * into v_msg;
  update public.watch_plans set message_id = v_msg.id where id = v_plan.id;
  insert into public.watch_plan_rsvps (plan_id, user_id, answer) values (v_plan.id, p_me, 'yes');
  update public.conversations set last_msg_at = v_msg.created_at where id = p_conv;
  update public.conversation_members set last_read_id = greatest(coalesce(last_read_id, 0), v_msg.id), last_read_at = now()
  where conv_id = p_conv and user_id = p_me;
  return jsonb_build_object('ok', true, 'plan_id', v_plan.id, 'message', public.msg_view(v_msg, p_me, v_kind = 'group'));
end;
$$;

-- El plan si `p_me` está ahora en su conversación (si no, nada).
create function public.plan_get(p_me uuid, p_plan bigint)
returns public.watch_plans
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.watch_plans p
  join public.conversation_members cm on cm.conv_id = p.conv_id and cm.user_id = p_me and cm.left_at is null
  where p.id = p_plan;
$$;

-- -------------------------------------------------------------------------------------
-- Responder: 'yes' | 'no'. No escribe en el chat; avisa (vacío) a la conversación para repintar.
-- 'ok' | 'none' | 'owner' | 'closed' (cancelado o ya pasado)
-- -------------------------------------------------------------------------------------
create function public.plan_rsvp(p_me uuid, p_plan bigint, p_answer text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.watch_plans := public.plan_get(p_me, p_plan);
begin
  if v_plan.id is null or p_answer not in ('yes', 'no') then return 'none'; end if;
  if v_plan.created_by = p_me then return 'owner'; end if;
  if v_plan.cancelled_at is not null or v_plan.plan_date < public.plan_today() then return 'closed'; end if;
  insert into public.watch_plan_rsvps (plan_id, user_id, answer) values (p_plan, p_me, p_answer)
  on conflict (plan_id, user_id) do update set answer = excluded.answer, updated_at = now();
  perform public.rt_ping(array(select user_id from public.conversation_members where conv_id = v_plan.conv_id and left_at is null),
                         jsonb_build_object('c', v_plan.conv_id));
  return 'ok';
end;
$$;

-- -------------------------------------------------------------------------------------
-- Cambiar (solo quien lo propone, sin cancelar ni pasado). `p_set_time`: si false, la hora no se
-- toca; `p_set_note` igual con la nota. Cambiar el día o la hora deja una línea de sistema y avisa
-- a quien dijo «Voy»; la nota sola, no. Las respuestas se mantienen.
-- 'ok' | 'none' | 'not_owner' | 'closed' | 'past_date' | 'note' | 'same'
-- -------------------------------------------------------------------------------------
create function public.plan_change(
  p_me uuid, p_plan bigint, p_date date, p_time time, p_set_time boolean, p_note text, p_set_note boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.watch_plans := public.plan_get(p_me, p_plan);
  v_date date;
  v_time time;
  v_note text;
  v_when boolean;
  v_conv text;
begin
  if v_plan.id is null then return 'none'; end if;
  if v_plan.created_by <> p_me then return 'not_owner'; end if;
  if v_plan.cancelled_at is not null or v_plan.plan_date < public.plan_today() then return 'closed'; end if;
  v_date := coalesce(p_date, v_plan.plan_date);
  v_time := case when p_set_time then p_time else v_plan.plan_time end;
  v_note := case when p_set_note then public.plan_clean_note(p_note) else v_plan.note end;
  if char_length(coalesce(v_note, '')) > 80 then return 'note'; end if;
  v_when := v_date is distinct from v_plan.plan_date or v_time is distinct from v_plan.plan_time;
  if not v_when and v_note is not distinct from v_plan.note then return 'same'; end if;
  if v_when and not public.plan_when_ok(v_date, v_time) then return 'past_date'; end if;

  update public.watch_plans set
    plan_date = v_date, plan_time = v_time, note = v_note,
    prev_date = case when v_when then v_plan.plan_date else prev_date end,
    prev_time = case when v_when then v_plan.plan_time else prev_time end,
    changed_at = case when v_when then now() else changed_at end
  where id = p_plan
  returning * into v_plan;

  if v_when then
    perform public.msg_sys(v_plan.conv_id, p_me, 'plan_changed', '{}',
      jsonb_build_object('plan', v_plan.id, 'title', v_plan.title, 'when', public.plan_label(v_date, v_time)));
    select coalesce(c.name, '') into v_conv from public.conversations c where c.id = v_plan.conv_id;
    perform public.plan_notify_yes(v_plan, p_me, 'plan_changed',
      (select sp.name from public.social_people(array[p_me]) sp) || ' ha cambiado el plan de ' || v_plan.title
        || ': ahora el ' || public.plan_label(v_date, v_time),
      case when v_conv <> '' then v_conv || ' · ' else '' end || 'sigues en el plan');
  else
    -- Solo la nota: sin línea ni aviso, pero que la tarjeta se repinte.
    perform public.rt_ping(array(select user_id from public.conversation_members where conv_id = v_plan.conv_id and left_at is null),
                           jsonb_build_object('c', v_plan.conv_id));
  end if;
  return 'ok';
end;
$$;

-- Cancelar (solo quien lo propone). 'ok' | 'none' | 'not_owner' | 'closed'
create function public.plan_cancel(p_me uuid, p_plan bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.watch_plans := public.plan_get(p_me, p_plan);
  v_conv text;
begin
  if v_plan.id is null then return 'none'; end if;
  if v_plan.created_by <> p_me then return 'not_owner'; end if;
  if v_plan.cancelled_at is not null or v_plan.plan_date < public.plan_today() then return 'closed'; end if;
  update public.watch_plans set cancelled_at = now() where id = p_plan returning * into v_plan;
  perform public.msg_sys(v_plan.conv_id, p_me, 'plan_cancelled', '{}',
    jsonb_build_object('plan', v_plan.id, 'title', v_plan.title));
  select coalesce(c.name, '') into v_conv from public.conversations c where c.id = v_plan.conv_id;
  perform public.plan_notify_yes(v_plan, p_me, 'plan_cancelled',
    (select sp.name from public.social_people(array[p_me]) sp) || ' ha cancelado el plan de ' || v_plan.title
      || ' del ' || public.plan_label(v_plan.plan_date, null),
    'La fecha ya no sale en tu Ver pronto');
  return 'ok';
end;
$$;

-- «¿La visteis?» contestado (vista o «Aún no»): deja de preguntar. La vista en sí (el diario) la
-- apunta el servidor con los servicios de siempre. 'ok' | 'none'
create function public.plan_seen(p_me uuid, p_plan bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.watch_plans := public.plan_get(p_me, p_plan);
begin
  if v_plan.id is null then return 'none'; end if;
  update public.watch_plan_rsvps set seen_marked = true, updated_at = now()
  where plan_id = p_plan and user_id = p_me and answer = 'yes';
  return case when found then 'ok' else 'none' end;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Tarjetas de plan para pintar: los planes de esos ids que `p_me` puede ver, con las respuestas de
-- las personas que están AHORA en la conversación y quién falta por responder.
-- -------------------------------------------------------------------------------------
create function public.plan_cards(p_me uuid, p_ids bigint[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'conv_id', p.conv_id, 'created_by', p.created_by, 'media_type', p.media_type, 'tmdb_id', p.tmdb_id,
    'title', p.title, 'poster', p.poster, 'plan_date', p.plan_date, 'plan_time', to_char(p.plan_time, 'HH24:MI'),
    'note', p.note, 'source', p.source, 'wtw_of', p.wtw_of, 'wtw_have', p.wtw_have,
    'prev_date', p.prev_date, 'prev_time', to_char(p.prev_time, 'HH24:MI'), 'changed_at', p.changed_at,
    'cancelled_at', p.cancelled_at, 'today', public.plan_today(),
    'answers', (select coalesce(jsonb_agg(jsonb_build_object('user_id', r.user_id, 'answer', r.answer, 'seen', r.seen_marked)), '[]'::jsonb)
                from public.watch_plan_rsvps r
                join public.conversation_members cm on cm.conv_id = p.conv_id and cm.user_id = r.user_id and cm.left_at is null
                where r.plan_id = p.id),
    'members', (select coalesce(jsonb_agg(cm.user_id order by cm.joined_at), '[]'::jsonb)
                from public.conversation_members cm where cm.conv_id = p.conv_id and cm.left_at is null))), '[]'::jsonb)
  from public.watch_plans p
  join public.conversation_members me on me.conv_id = p.conv_id and me.user_id = p_me and me.left_at is null
  where p.id = any (p_ids);
$$;

-- Si sales del grupo (o te quitan), tu respuesta a sus planes se borra.
create function public.plan_on_member_left()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.left_at is not null and old.left_at is null then
    delete from public.watch_plan_rsvps r using public.watch_plans p
    where p.id = r.plan_id and p.conv_id = new.conv_id and r.user_id = new.user_id;
  end if;
  return null;
end;
$$;
create trigger plan_on_member_left after update of left_at on public.conversation_members
for each row execute function public.plan_on_member_left();

revoke all on function public.plan_today()                                                          from public, anon, authenticated;
revoke all on function public.plan_label(date, time)                                                from public, anon, authenticated;
revoke all on function public.plan_when_ok(date, time)                                              from public, anon, authenticated;
revoke all on function public.plan_clean_note(text)                                                 from public, anon, authenticated;
revoke all on function public.plan_notify_yes(public.watch_plans, uuid, text, text, text)           from public, anon, authenticated;
revoke all on function public.plan_propose(uuid, bigint, jsonb, date, time, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.plan_get(uuid, bigint)                                                from public, anon, authenticated;
revoke all on function public.plan_rsvp(uuid, bigint, text)                                         from public, anon, authenticated;
revoke all on function public.plan_change(uuid, bigint, date, time, boolean, text, boolean)         from public, anon, authenticated;
revoke all on function public.plan_cancel(uuid, bigint)                                             from public, anon, authenticated;
revoke all on function public.plan_seen(uuid, bigint)                                               from public, anon, authenticated;
revoke all on function public.plan_cards(uuid, bigint[])                                            from public, anon, authenticated;
revoke all on function public.plan_on_member_left()                                                 from public, anon, authenticated;
grant execute on function public.plan_propose(uuid, bigint, jsonb, date, time, text, text, integer, integer) to service_role;
grant execute on function public.plan_rsvp(uuid, bigint, text)                                      to service_role;
grant execute on function public.plan_change(uuid, bigint, date, time, boolean, text, boolean)      to service_role;
grant execute on function public.plan_cancel(uuid, bigint)                                          to service_role;
grant execute on function public.plan_seen(uuid, bigint)                                            to service_role;
grant execute on function public.plan_cards(uuid, bigint[])                                         to service_role;
