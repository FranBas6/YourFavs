-- =====================================================================================
-- YourFavs · Mensajes M4d: «¿Qué vemos?» en una conversación (docs/Mensajes/design_handoff_m4/
-- README.md §2.3 y §3.6).
--
-- Una ruleta con lo que tenéis pendiente las personas que vienen («Quién viene», al menos 2 y
-- siempre tú). Las tiradas son PRIVADAS (solo las ve quien tira; no se guardan); al chat solo llega
-- la que se envía, como una tarjeta 'wtw' más. Cada envío es una tarjeta nueva.
--
--   · El bote: lo que está en Pendientes (las mismas listas que la ruleta de siempre) de TODAS las
--     personas de «Quién viene», sean amigas tuyas o no (eligieron estar en el grupo y en la tirada).
--     Si no hay nada de las N, la mejor de N−1 (solo con 3 o más: en un 1:1 «de 1 de 2» sería
--     enseñar la lista del otro). Nunca entra lo que alguien ocultó de su perfil.
--   · Lo que se guarda en la tarjeta (`have`, `of`) lo recalcula el servidor al enviar: no se puede
--     mandar una tirada inventada.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- El bote de una tirada: cada título pendiente de al menos N−1 (o de las N) personas de `p_who`,
-- con quiénes lo tienen. Vacío si `p_me` no está, si `p_who` no son personas de la conversación
-- (al menos 2, contigo) o si hay un bloqueo entre ellas y tú.
-- -------------------------------------------------------------------------------------
create function public.msg_wtw_pool(p_me uuid, p_conv bigint, p_who uuid[])
returns table (media_type public.media_type, tmdb_id integer, have uuid[], of integer)
language sql
stable
security definer
set search_path = ''
as $$
  with who as (
    select distinct w as id from unnest(p_who) w
  ),
  ok as (
    select count(*)::int as n from who
    where (select count(*) from who) >= 2
      and p_me in (select id from who)
      and not exists (select 1 from who
                      where not exists (select 1 from public.conversation_members cm
                                        where cm.conv_id = p_conv and cm.user_id = who.id and cm.left_at is null))
      and not exists (select 1 from who join public.blocks b
                      on (b.blocker_id = p_me and b.blocked_id = who.id) or (b.blocker_id = who.id and b.blocked_id = p_me))
    having count(*) = (select count(*) from who)
  ),
  pend as (
    select li.media_type, li.tmdb_id, array_agg(distinct li.user_id) as have
    from public.library_items li
    where li.user_id in (select id from who) and exists (select 1 from ok)
      and li.collection in ('MoviesPendientes', 'SeriesPendiente')
      and not exists (select 1 from public.profile_hidden_titles h
                      where h.user_id = li.user_id and h.user_id <> p_me and h.media_type = li.media_type and h.tmdb_id = li.tmdb_id)
    group by li.media_type, li.tmdb_id
  )
  select p.media_type, p.tmdb_id, p.have, (select n from ok)
  from pend p
  where cardinality(p.have) >= (select case when n >= 3 then n - 1 else n end from ok);
$$;

-- -------------------------------------------------------------------------------------
-- Publicar una tirada: la tarjeta 'wtw' (el servidor ya comprobó el bote y armó `p_ref`).
-- {ok, message} | {ok:false, error: 'none' | 'read_only' | 'rate'}
-- -------------------------------------------------------------------------------------
create function public.msg_send_wtw(p_me uuid, p_conv bigint, p_ref jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind  public.conv_kind;
  v_other uuid;
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
  if (select count(*) from public.messages where author_id = p_me and created_at > now() - interval '1 minute') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'rate');
  end if;

  insert into public.messages (conv_id, author_id, body, card_type, card_ref)
  values (p_conv, p_me, '', 'wtw', p_ref || jsonb_build_object('roller', p_me))
  returning * into v_msg;
  update public.conversations set last_msg_at = v_msg.created_at where id = p_conv;
  update public.conversation_members set last_read_id = greatest(coalesce(last_read_id, 0), v_msg.id), last_read_at = now()
  where conv_id = p_conv and user_id = p_me;
  return jsonb_build_object('ok', true, 'message', public.msg_view(v_msg, p_me, v_kind = 'group'));
end;
$$;

revoke all on function public.msg_wtw_pool(uuid, bigint, uuid[]) from public, anon, authenticated;
revoke all on function public.msg_send_wtw(uuid, bigint, jsonb)  from public, anon, authenticated;
grant execute on function public.msg_wtw_pool(uuid, bigint, uuid[]) to service_role;
grant execute on function public.msg_send_wtw(uuid, bigint, jsonb)  to service_role;
