-- =====================================================================================
-- YourFavs · Mensajes M4c: escudo de spoilers (docs/Mensajes/design_handoff_m4/README.md §2.2
-- «Spoiler», §3.3 y §3.4).
--
-- Un mensaje (o el comentario de una tarjeta) se puede marcar como spoiler de una película, de un
-- episodio o de una serie entera (`messages.spoiler` = {mediaType, tmdbId, title, season?, episode?}).
--
--   · Quien NO ha llegado ahí no recibe el texto: `msg_view` lo quita y manda `locked` + `lines`
--     (los anchos de las barras sustitutas). Nada de desenfocar: el texto no está en el navegador.
--   · «Llegar» se calcula al pintar (`msg_spoiler_reached`), nunca se guarda:
--       película        → la has visto (listas de visto o el diario);
--       episodio TxEy   → has visto ese episodio o uno posterior (saltarse capítulos cuenta), o la
--                         serie está en tus listas de vista;
--       serie entera    → la serie está en tus listas de vista.
--   · Quien lo escribió lo ve siempre. «Mostrar igualmente» pide el texto (`msg_spoiler_body`) y no
--     guarda nada: es solo de esa sesión.
-- =====================================================================================

-- ¿Ha llegado `p_me` a lo que destripa este spoiler?
create function public.msg_spoiler_reached(p_me uuid, p_spoiler jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_spoiler ->> 'mediaType' = 'movie' then
      exists (select 1 from public.library_items li
              where li.user_id = p_me and li.media_type = 'movie' and li.tmdb_id = (p_spoiler ->> 'tmdbId')::integer
                and li.collection in ('MoviesVistas', 'LikedMovies', 'MovieFavs'))
      or exists (select 1 from public.watch_log w
                 where w.user_id = p_me and w.media_type = 'movie' and w.tmdb_id = (p_spoiler ->> 'tmdbId')::integer)
    else
      exists (select 1 from public.library_items li
              where li.user_id = p_me and li.media_type = 'tv' and li.tmdb_id = (p_spoiler ->> 'tmdbId')::integer
                and li.collection in ('SeriesVistas', 'LikedSeries', 'SeriesFavs'))
      or (p_spoiler ? 'episode' and exists (
            select 1 from public.watch_log w
            where w.user_id = p_me and w.media_type = 'tv' and w.tmdb_id = (p_spoiler ->> 'tmdbId')::integer
              and w.season > 0 and w.episode is not null
              and (w.season > (p_spoiler ->> 'season')::integer
                   or (w.season = (p_spoiler ->> 'season')::integer and w.episode >= (p_spoiler ->> 'episode')::integer))))
  end;
$$;

-- Anchos (en %) de las barras que sustituyen a un texto oculto: una por cada ~70 caracteres, 4 como
-- mucho; la última, del largo que le toque (sin bajar de 30). No deja adivinar más que la longitud.
create function public.msg_spoiler_lines(p_len integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when n <= 1 then jsonb_build_array(greatest(30, least(100, coalesce(p_len, 0) * 100 / 70)))
    else (select jsonb_agg(case when i < n then 100 else greatest(30, least(100, (coalesce(p_len, 0) - (n - 1) * 70) * 100 / 70)) end order by i)
          from generate_series(1, n) i) end
  from (select least(4, greatest(1, ceil(coalesce(p_len, 0) / 70.0)::integer)) as n) x;
$$;

-- La vista de un mensaje gana el spoiler: `spoiler`, y para quien no ha llegado `locked` + `lines`
-- SIN `body`. `spoiler_seen`: ya lo has visto (para la etiqueta «✓ Ya lo has visto»).
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
    'body', case when m.deleted_at is not null or v.folded or s.locked then null else m.body end,
    'sys', m.sys,
    'created_at', m.created_at,
    'deleted', m.deleted_at is not null,
    'folded', v.folded,
    'client_id', case when m.author_id = p_me then m.client_id end,
    'card', case when m.card_type is not null and m.deleted_at is null and not v.folded
                 then jsonb_build_object('type', m.card_type, 'ref', m.card_ref) end,
    'spoiler', case when m.deleted_at is null and not v.folded then m.spoiler end,
    'locked', s.locked,
    'lines', case when s.locked then public.msg_spoiler_lines(char_length(m.body)) end,
    'spoiler_seen', s.reached)
  from (select p_group and m.kind = 'text' and m.deleted_at is null and m.author_id is not null
               and exists (select 1 from public.blocks b where b.blocker_id = p_me and b.blocked_id = m.author_id) as folded) v,
       lateral (select r.reached, m.spoiler is not null and m.deleted_at is null and coalesce(m.body, '') <> ''
                                  and m.author_id is distinct from p_me and not r.reached as locked
                from (select m.spoiler is not null and m.author_id is distinct from p_me
                             and public.msg_spoiler_reached(p_me, m.spoiler) as reached) r) s;
$$;

-- -------------------------------------------------------------------------------------
-- Enviar: ahora también marcado como spoiler (de texto o del comentario de una tarjeta).
-- Error nuevo: 'spoiler' (mal formado). Un spoiler sin texto no tiene sentido: se ignora.
-- -------------------------------------------------------------------------------------
drop function public.msg_send(uuid, bigint, text, uuid, text, jsonb);
create function public.msg_send(
  p_me uuid, p_conv bigint, p_body text, p_client uuid,
  p_card_type text default null, p_card_ref jsonb default null, p_spoiler jsonb default null
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
  v_sp    jsonb;
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

  if p_spoiler is not null and v_body <> '' then
    if coalesce(p_spoiler ->> 'mediaType', '') not in ('movie', 'tv')
       or coalesce(p_spoiler ->> 'tmdbId', '') !~ '^[1-9][0-9]{0,8}$'
       or coalesce(btrim(p_spoiler ->> 'title'), '') = ''
       or (p_spoiler ? 'season') <> (p_spoiler ? 'episode')
       or (p_spoiler ? 'episode' and (p_spoiler ->> 'mediaType' <> 'tv'
           or coalesce(p_spoiler ->> 'season', '') !~ '^[1-9][0-9]{0,2}$'
           or coalesce(p_spoiler ->> 'episode', '') !~ '^[1-9][0-9]{0,3}$')) then
      return jsonb_build_object('ok', false, 'error', 'spoiler');
    end if;
    v_sp := jsonb_strip_nulls(jsonb_build_object(
      'mediaType', p_spoiler ->> 'mediaType',
      'tmdbId',    (p_spoiler ->> 'tmdbId')::integer,
      'title',     left(btrim(p_spoiler ->> 'title'), 300),
      'season',    (p_spoiler ->> 'season')::integer,
      'episode',   (p_spoiler ->> 'episode')::integer));
  end if;

  if char_length(v_body) > 2000 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  if (select count(*) from public.messages where author_id = p_me and created_at > now() - interval '1 minute') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'rate');
  end if;

  insert into public.messages (conv_id, author_id, body, client_id, card_type, card_ref, spoiler)
  values (p_conv, p_me, v_body, p_client, case when v_ref is not null then 'title' end, v_ref, v_sp)
  returning * into v_msg;
  update public.conversations set last_msg_at = v_msg.created_at where id = p_conv;
  update public.conversation_members set last_read_id = greatest(coalesce(last_read_id, 0), v_msg.id), last_read_at = now()
  where conv_id = p_conv and user_id = p_me;
  return jsonb_build_object('ok', true, 'message', public.msg_view(v_msg, p_me, v_kind = 'group'));
end;
$$;

-- «Mostrar igualmente»: el texto de un spoiler de un mensaje que ves (no borrado ni plegado). No
-- guarda nada. null si no es un spoiler o no lo puedes ver.
create function public.msg_spoiler_body(p_me uuid, p_msg bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select x.body from public.messages x
  where x.id = p_msg and x.spoiler is not null and x.deleted_at is null
    and public.msg_visible_kind(p_me, p_msg) is not null
    and not (public.msg_visible_kind(p_me, p_msg) = 'group'
             and exists (select 1 from public.blocks b where b.blocker_id = p_me and b.blocked_id = x.author_id));
$$;

revoke all on function public.msg_spoiler_reached(uuid, jsonb)                          from public, anon, authenticated;
revoke all on function public.msg_spoiler_lines(integer)                                from public, anon, authenticated;
revoke all on function public.msg_spoiler_body(uuid, bigint)                            from public, anon, authenticated;
revoke all on function public.msg_send(uuid, bigint, text, uuid, text, jsonb, jsonb)    from public, anon, authenticated;
grant execute on function public.msg_spoiler_body(uuid, bigint)                         to service_role;
grant execute on function public.msg_send(uuid, bigint, text, uuid, text, jsonb, jsonb) to service_role;
