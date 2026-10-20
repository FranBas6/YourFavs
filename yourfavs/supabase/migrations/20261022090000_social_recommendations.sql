-- =====================================================================================
-- YourFavs · Recomendar a un amigo (F4 de la capa social, docs/PLAN_SOCIAL.md y el handoff
-- docs/design_handoff_social_f4/README.md §4).
--
-- Una recomendación es UN objeto (película, serie, persona o productora) para 1–10 amigos, con un
-- mensaje opcional igual para todos. El estado es por destinatario. Quien la recibe puede añadirla
-- (o activar avisos, o abrir la productora) o descartarla, y responder UNA vez. No es un chat.
--
-- Privacidad de quien recibe: quien envía nunca sabe si el otro ya la tenía o la vio, ni si la
-- descartó sin responder (la sigue viendo «Enviada»). Eso lo hace el servidor al leer
-- (src/services/BD/social/recommendations.ts), no la base.
--
-- Seguridad: como F2/F3, RLS ACTIVADA y SIN políticas; todo por el servidor con la clave secreta.
-- =====================================================================================

create table public.recommendations (
  id          bigint generated always as identity primary key,
  from_id     uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('movie', 'tv', 'person', 'company')),
  target_id   integer not null,              -- id de TMDB (company_id para productoras)
  title       text not null,                 -- copia para pintar sin pedir a TMDB
  image_path  text,                          -- póster, foto o logo (ruta de TMDB)
  message     text check (char_length(message) <= 140),
  created_at  timestamptz not null default now()
);
create index recommendations_from on public.recommendations (from_id, created_at desc);
create index recommendations_target on public.recommendations (target_type, target_id);

create table public.recommendation_recipients (
  rec_id     bigint not null references public.recommendations (id) on delete cascade,
  to_id      uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'added', 'alerts', 'opened', 'discarded')),
  acted_at   timestamptz,
  reply_kind text check (reply_kind in ('quick', 'text')),
  reply_key  text check (reply_key in ('thanks', 'seen_it', 'saving', 'not_for_me')),
  reply_text text check (char_length(reply_text) <= 140),
  replied_at timestamptz,
  primary key (rec_id, to_id)
);
create index rec_rcpt_to on public.recommendation_recipients (to_id, status, rec_id desc);

alter table public.recommendations           enable row level security;
alter table public.recommendation_recipients enable row level security;

-- -------------------------------------------------------------------------------------
-- Enviar. Devuelve jsonb:
--   { ok: true, rec_id, skipped: [uuid] }  (skipped = ya tenían esa misma tuya sin responder)
--   { ok: false, error: 'not_friends' | 'too_many' | 'rate' | 'all_skipped', skipped }
-- Todos los destinatarios deben ser amigos y sin bloqueo. Tope: 10 por envío, 30 envíos al día.
-- Si alguien descartó eso mismo tuyo en los últimos 30 días, se le crea igual pero SIN aviso
-- (descartar es silencioso y quien envía no lo sabe; tampoco hay que volver a molestar).
-- -------------------------------------------------------------------------------------
create function public.social_rec_send(
  p_me uuid, p_type text, p_id integer, p_title text, p_image text, p_to uuid[], p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to      uuid[] := array(select distinct unnest(p_to) except select p_me);
  v_skipped uuid[];
  v_send    uuid[];
  v_rec     bigint;
  v_who     uuid;
  v_msg     text := nullif(btrim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g')), '');
begin
  if coalesce(array_length(v_to, 1), 0) = 0 or array_length(v_to, 1) > 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many', 'skipped', '[]'::jsonb);
  end if;
  if (select count(*) from public.recommendations where from_id = p_me and created_at > now() - interval '1 day') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'rate', 'skipped', '[]'::jsonb);
  end if;
  -- Solo amigos y sin bloqueo en ningún sentido.
  if exists (
    select 1 from unnest(v_to) t(id)
    where not public.social_are_friends(p_me, t.id)
       or exists (select 1 from public.blocks b
                  where (b.blocker_id = p_me and b.blocked_id = t.id) or (b.blocker_id = t.id and b.blocked_id = p_me))) then
    return jsonb_build_object('ok', false, 'error', 'not_friends', 'skipped', '[]'::jsonb);
  end if;

  -- Sin duplicados: quien ya tiene esa misma tuya pendiente y sin responder, fuera.
  v_skipped := array(
    select t.id from unnest(v_to) t(id)
    where exists (
      select 1 from public.recommendation_recipients rr
      join public.recommendations r on r.id = rr.rec_id
      where r.from_id = p_me and r.target_type = p_type and r.target_id = p_id
        and rr.to_id = t.id and rr.status = 'pending' and rr.reply_kind is null));
  v_send := array(select unnest(v_to) except select unnest(v_skipped));
  if coalesce(array_length(v_send, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'all_skipped', 'skipped', to_jsonb(v_skipped));
  end if;

  insert into public.recommendations (from_id, target_type, target_id, title, image_path, message)
  values (p_me, p_type, p_id, left(btrim(p_title), 300), nullif(p_image, ''), left(v_msg, 140))
  returning id into v_rec;

  foreach v_who in array v_send loop
    insert into public.recommendation_recipients (rec_id, to_id) values (v_rec, v_who);
    if not exists (
      select 1 from public.recommendation_recipients rr
      join public.recommendations r on r.id = rr.rec_id
      where r.from_id = p_me and r.target_type = p_type and r.target_id = p_id and r.id <> v_rec
        and rr.to_id = v_who and rr.status = 'discarded' and rr.acted_at > now() - interval '30 days') then
      perform public.social_notify(v_who, 'rec:' || v_rec, 'recommendation', p_me);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'rec_id', v_rec, 'skipped', to_jsonb(v_skipped));
end;
$$;

-- -------------------------------------------------------------------------------------
-- Retirar (el Deshacer del toast). Si nadie ha hecho nada, se borra entera con sus avisos. Si
-- alguien ya actuó o respondió, solo se retira para los que no y se devuelve 'answered' con a
-- quiénes se retiró.
-- -------------------------------------------------------------------------------------
create function public.social_rec_withdraw(p_me uuid, p_rec bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gone uuid[];
begin
  if not exists (select 1 from public.recommendations where id = p_rec and from_id = p_me) then
    return jsonb_build_object('ok', false, 'error', 'none');
  end if;
  v_gone := array(
    select to_id from public.recommendation_recipients
    where rec_id = p_rec and status = 'pending' and reply_kind is null);
  delete from public.notifications where user_id = any (v_gone) and id = 'rec:' || p_rec;
  if exists (select 1 from public.recommendation_recipients
             where rec_id = p_rec and (status <> 'pending' or reply_kind is not null)) then
    delete from public.recommendation_recipients where rec_id = p_rec and to_id = any (v_gone);
    return jsonb_build_object('ok', false, 'error', 'answered', 'withdrawn_for', to_jsonb(v_gone));
  end if;
  delete from public.recommendations where id = p_rec;
  return jsonb_build_object('ok', true);
end;
$$;

-- -------------------------------------------------------------------------------------
-- Actuar como destinatario: 'added' | 'alerts' | 'opened' | 'discarded', solo desde 'pending'.
-- Lo que implica (guardar en Pendientes, activar avisos) lo hace el servidor con la sesión de
-- quien recibe ANTES de llamar aquí. Sin aviso para quien envía. Devuelve 'ok' o 'none'.
-- -------------------------------------------------------------------------------------
create function public.social_rec_act(p_me uuid, p_rec bigint, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('added', 'alerts', 'opened', 'discarded') then return 'none'; end if;
  update public.recommendation_recipients set status = p_status, acted_at = now()
  where rec_id = p_rec and to_id = p_me and status = 'pending';
  if not found then return 'none'; end if;
  update public.notifications set read = true where user_id = p_me and id = 'rec:' || p_rec;
  return 'ok';
end;
$$;

-- -------------------------------------------------------------------------------------
-- Responder, una sola vez. `p_can_pending`: el servidor ya calculó que el título está en tus listas
-- o lo viste (estados «had»/«seen»), que permiten responder sin actuar. Avisa a quien la envió SIN
-- el texto. Devuelve 'ok' | 'already' | 'pending' (aún no has actuado) | 'none'.
-- -------------------------------------------------------------------------------------
create function public.social_rec_reply(p_me uuid, p_rec bigint, p_key text, p_text text, p_can_pending boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row  public.recommendation_recipients%rowtype;
  v_from uuid;
  v_text text := nullif(btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')), '');
begin
  select * into v_row from public.recommendation_recipients where rec_id = p_rec and to_id = p_me for update;
  if not found then return 'none'; end if;
  if v_row.reply_kind is not null then return 'already'; end if;
  if v_row.status = 'pending' and not p_can_pending then return 'pending'; end if;
  if v_text is null and p_key not in ('thanks', 'seen_it', 'saving', 'not_for_me') then return 'none'; end if;
  select from_id into v_from from public.recommendations where id = p_rec;
  if exists (select 1 from public.blocks b
             where (b.blocker_id = p_me and b.blocked_id = v_from) or (b.blocker_id = v_from and b.blocked_id = p_me)) then
    return 'none';
  end if;
  update public.recommendation_recipients
  set reply_kind = case when v_text is null then 'quick' else 'text' end,
      reply_key  = case when v_text is null then p_key end,
      reply_text = left(v_text, 140),
      replied_at = now()
  where rec_id = p_rec and to_id = p_me;
  update public.notifications set read = true where user_id = p_me and id = 'rec:' || p_rec;
  perform public.social_notify(v_from, 'recrep:' || p_rec || ':' || p_me, 'rec_reply', p_me);
  return 'ok';
end;
$$;

revoke all on function public.social_rec_send(uuid, text, integer, text, text, uuid[], text) from public, anon, authenticated;
revoke all on function public.social_rec_withdraw(uuid, bigint)                          from public, anon, authenticated;
revoke all on function public.social_rec_act(uuid, bigint, text)                         from public, anon, authenticated;
revoke all on function public.social_rec_reply(uuid, bigint, text, text, boolean)        from public, anon, authenticated;
grant execute on function public.social_rec_send(uuid, text, integer, text, text, uuid[], text) to service_role;
grant execute on function public.social_rec_withdraw(uuid, bigint)                          to service_role;
grant execute on function public.social_rec_act(uuid, bigint, text)                         to service_role;
grant execute on function public.social_rec_reply(uuid, bigint, text, text, boolean)        to service_role;
