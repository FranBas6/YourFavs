-- =====================================================================================
-- YourFavs · Mensajes M4a: tarjetas de título en el chat (docs/Mensajes/design_handoff_m4/README.md
-- §2.1–§2.3 y §3.1).
--
-- Un mensaje puede llevar una TARJETA (`card_type` + `card_ref`): solo tarjeta, o tarjeta con texto
-- (el comentario va en `body`, que se pinta como una línea normal encima). Se borra y se reporta
-- como un mensaje más.
--
--   · `card_ref` es una COPIA de TMDB para pintar rápido (título, póster, año…). El estado de cada
--     persona («La viste · ★ 8», «Vas por T2 E3»…) NUNCA se guarda: se calcula al pintar para quien
--     mira con `msg_card_states`.
--   · En las caras solo salen TUS AMIGOS que están en la conversación, con el mismo filtro que
--     «Amigos que la han visto» (`social_friends_seen`: amistad viva, sin bloqueo, perfil encendido,
--     sin sus títulos ocultos). En un grupo puede haber gente que no es amiga tuya: no sale.
--
-- `card_type` ya admite 'rec' (recomendación de F4, M4b) y 'wtw' («¿Qué vemos?», M4d), y `spoiler`
-- queda para el escudo (M4c): así esas fases no tienen que volver a tocar la tabla.
-- =====================================================================================

alter table public.messages
  add column card_type text check (card_type in ('title', 'rec', 'wtw')),
  add column card_ref  jsonb,
  add column spoiler   jsonb,
  add constraint messages_card_ref check ((card_type is null) = (card_ref is null));

-- La vista de un mensaje gana la tarjeta (sin ella si se borró o está plegado).
create or replace function public.msg_view(m public.messages, p_me uuid, p_group boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id,
    'author', m.author_id,
    'kind', m.kind,
    'body', case when m.deleted_at is not null or v.folded then null else m.body end,
    'sys', m.sys,
    'created_at', m.created_at,
    'deleted', m.deleted_at is not null,
    'folded', v.folded,
    'client_id', case when m.author_id = p_me then m.client_id end,
    'card', case when m.card_type is not null and m.deleted_at is null and not v.folded
                 then jsonb_build_object('type', m.card_type, 'ref', m.card_ref) end)
  from (select p_group and m.kind = 'text' and m.deleted_at is null and m.author_id is not null
               and exists (select 1 from public.blocks b where b.blocker_id = p_me and b.blocked_id = m.author_id) as folded) v;
$$;

-- -------------------------------------------------------------------------------------
-- Enviar, ahora también con tarjeta de título. Con tarjeta, el texto es opcional (el comentario).
-- `p_card_ref` lo arma el servidor con lo que devuelve TMDB; aquí solo se quedan las claves
-- conocidas. Las tarjetas 'rec' y 'wtw' no entran por aquí (las crean sus propias funciones).
-- Errores nuevos: 'card' (tarjeta mal formada).
-- -------------------------------------------------------------------------------------
drop function public.msg_send(uuid, bigint, text, uuid);
create function public.msg_send(
  p_me uuid, p_conv bigint, p_body text, p_client uuid, p_card_type text default null, p_card_ref jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind  public.conv_kind;
  v_other uuid;
  v_body  text := regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g');
  v_ref   jsonb;
  v_msg   public.messages;
begin
  select c.kind into v_kind from public.conversation_members m join public.conversations c on c.id = m.conv_id
  where m.conv_id = p_conv and m.user_id = p_me and m.left_at is null;
  if v_kind is null then return jsonb_build_object('ok', false, 'error', 'none'); end if;

  if p_client is not null then
    select * into v_msg from public.messages where conv_id = p_conv and author_id = p_me and client_id = p_client;
    if found then return jsonb_build_object('ok', true, 'message', public.msg_view(v_msg, p_me, v_kind = 'group')); end if;
  end if;

  if v_kind = 'direct' then
    select user_id into v_other from public.conversation_members where conv_id = p_conv and user_id <> p_me;
    if v_other is null or not public.msg_can_reach(p_me, v_other) then
      return jsonb_build_object('ok', false, 'error', 'read_only');
    end if;
  end if;

  if p_card_type is not null then
    if p_card_type <> 'title' or p_card_ref is null
       or coalesce(p_card_ref ->> 'mediaType', '') not in ('movie', 'tv')
       or coalesce(p_card_ref ->> 'tmdbId', '') !~ '^[1-9][0-9]{0,8}$'
       or coalesce(btrim(p_card_ref ->> 'title'), '') = '' then
      return jsonb_build_object('ok', false, 'error', 'card');
    end if;
    v_ref := jsonb_strip_nulls(jsonb_build_object(
      'mediaType', p_card_ref ->> 'mediaType',
      'tmdbId',    (p_card_ref ->> 'tmdbId')::integer,
      'title',     left(btrim(p_card_ref ->> 'title'), 300),
      'poster',    nullif(left(p_card_ref ->> 'poster', 200), ''),
      'year',      nullif(left(p_card_ref ->> 'year', 4), ''),
      'runtime',   case when coalesce(p_card_ref ->> 'runtime', '') ~ '^[0-9]{1,4}$' then (p_card_ref ->> 'runtime')::integer end,
      'seasons',   case when coalesce(p_card_ref ->> 'seasons', '') ~ '^[0-9]{1,3}$' then (p_card_ref ->> 'seasons')::integer end));
  elsif v_body = '' then
    return jsonb_build_object('ok', false, 'error', 'empty');
  end if;
  if char_length(v_body) > 2000 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  if (select count(*) from public.messages where author_id = p_me and created_at > now() - interval '1 minute') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'rate');
  end if;

  insert into public.messages (conv_id, author_id, body, client_id, card_type, card_ref)
  values (p_conv, p_me, v_body, p_client, case when v_ref is not null then 'title' end, v_ref)
  returning * into v_msg;
  update public.conversations set last_msg_at = v_msg.created_at where id = p_conv;
  update public.conversation_members set last_read_id = greatest(coalesce(last_read_id, 0), v_msg.id), last_read_at = now()
  where conv_id = p_conv and user_id = p_me;
  return jsonb_build_object('ok', true, 'message', public.msg_view(v_msg, p_me, v_kind = 'group'));
end;
$$;

-- -------------------------------------------------------------------------------------
-- Estado de las tarjetas para quien mira, al pintar. `p_refs`: [{t: 'movie'|'tv', id}].
-- Una fila por título y persona con algo que ver con él:
--   · quien mira (`user_id = p_me`): 'seen' | 'watching' | 'pending', su nota y, viendo una serie,
--     el último episodio que ha visto (el servidor calcula el siguiente con TMDB);
--   · sus amigos que están ahora en la conversación, con el filtro de `social_friends_seen`.
-- Nada si `p_me` no está en la conversación.
-- -------------------------------------------------------------------------------------
create function public.msg_card_states(p_me uuid, p_conv bigint, p_refs jsonb)
returns table (media_type public.media_type, tmdb_id integer, user_id uuid, state text, score numeric, season smallint, episode smallint)
language sql
stable
security definer
set search_path = ''
as $$
  with refs as (
    select distinct (r ->> 't')::public.media_type as mt, (r ->> 'id')::integer as id
    from jsonb_array_elements(case when jsonb_typeof(p_refs) = 'array' then p_refs else '[]'::jsonb end) r
    where exists (select 1 from public.conversation_members cm where cm.conv_id = p_conv and cm.user_id = p_me and cm.left_at is null)
      and r ->> 't' in ('movie', 'tv') and coalesce(r ->> 'id', '') ~ '^[1-9][0-9]{0,8}$'
    limit 100
  ),
  mine as (
    select f.mt, f.id,
      case
        when exists (select 1 from public.library_items li
                     where li.user_id = p_me and li.media_type = f.mt and li.tmdb_id = f.id
                       and li.collection in ('MoviesVistas', 'LikedMovies', 'MovieFavs', 'SeriesVistas', 'LikedSeries', 'SeriesFavs'))
          or (f.mt = 'movie' and exists (select 1 from public.watch_log w
                                         where w.user_id = p_me and w.media_type = 'movie' and w.tmdb_id = f.id))
          then 'seen'
        when exists (select 1 from public.library_items li
                     where li.user_id = p_me and li.media_type = f.mt and li.tmdb_id = f.id
                       and li.collection in ('MoviesViendo', 'SeriesSiguiendo'))
          or (f.mt = 'tv'
              and exists (select 1 from public.watch_log w where w.user_id = p_me and w.media_type = 'tv' and w.tmdb_id = f.id)
              and not exists (select 1 from public.library_items a
                              where a.user_id = p_me and a.collection = 'SeriesAbandonadas' and a.tmdb_id = f.id))
          then 'watching'
        when exists (select 1 from public.library_items li
                     where li.user_id = p_me and li.media_type = f.mt and li.tmdb_id = f.id
                       and li.collection in ('MoviesPendientes', 'MoviesVerPronto', 'SeriesPendiente', 'SeriesVerPronto'))
          then 'pending'
      end as state
    from refs f
  )
  select m.mt, m.id, p_me, m.state, r.score, e.season, e.episode
  from mine m
  left join public.ratings r on r.user_id = p_me and r.media_type = m.mt and r.tmdb_id = m.id
  left join lateral (
    select w.season, w.episode from public.watch_log w
    where m.state = 'watching' and m.mt = 'tv' and w.user_id = p_me and w.media_type = 'tv' and w.tmdb_id = m.id
      and w.season > 0 and w.episode is not null
    order by w.season desc, w.episode desc
    limit 1) e on true
  where m.state is not null
  union all
  select f.mt, f.id, s.friend_id, s.state, s.score, null::smallint, null::smallint
  from refs f
  cross join lateral public.social_friends_seen(p_me, f.mt, f.id) s
  where s.friend_id in (select cm.user_id from public.conversation_members cm
                        where cm.conv_id = p_conv and cm.left_at is null and cm.user_id <> p_me);
$$;

revoke all on function public.msg_send(uuid, bigint, text, uuid, text, jsonb)  from public, anon, authenticated;
revoke all on function public.msg_card_states(uuid, bigint, jsonb)            from public, anon, authenticated;
grant execute on function public.msg_send(uuid, bigint, text, uuid, text, jsonb) to service_role;
grant execute on function public.msg_card_states(uuid, bigint, jsonb)           to service_role;
