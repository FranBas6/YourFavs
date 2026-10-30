-- =====================================================================================
-- YourFavs · Mensajes M3b: «Limpiar» el desplegable de Mensajes de la cabecera (idea de Fran).
--
-- Limpiar NO es leer: no toca `last_read_id`, así que nadie recibe un «Visto» por algo que no has
-- leído. Se guarda hasta qué mensaje has limpiado cada conversación (`cleared_id`):
--   · el contador de sin leer cuenta solo lo posterior (a 0 al limpiar);
--   · el desplegable solo enseña las conversaciones con algo posterior (`cleared` en la lista);
--   · la página de Mensajes sigue enseñándolas todas, sin la negrita;
--   · si alguien vuelve a escribir, la conversación reaparece con su contador.
-- =====================================================================================

alter table public.conversation_members add column cleared_id bigint;

-- Hasta dónde no cuenta como sin leer: lo leído o lo limpiado, lo que llegue más lejos.
create function public.msg_seen_upto(p_last_read bigint, p_cleared bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$ select greatest(coalesce(p_last_read, 0), coalesce(p_cleared, 0)); $$;

-- Limpiar: todas tus conversaciones, hasta su último mensaje de ahora.
create function public.msg_clear_inbox(p_me uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_members m
  set cleared_id = x.last_id
  from (select conv_id, max(id) as last_id from public.messages group by conv_id) x
  where x.conv_id = m.conv_id and m.user_id = p_me and m.left_at is null
    and x.last_id > coalesce(m.cleared_id, 0);
$$;

create or replace function public.msg_unread_total(p_me uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(public.msg_unread(p_me, m.conv_id, m.joined_at,
                                        public.msg_seen_upto(m.last_read_id, m.cleared_id), c.kind = 'group')), 0)::int
  from public.conversation_members m
  join public.conversations c on c.id = m.conv_id
  where m.user_id = p_me and m.left_at is null and not m.muted;
$$;

create or replace function public.msg_list(p_me uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(r order by (r ->> 'last_msg_at')::timestamptz desc, (r ->> 'id')::bigint desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', c.id,
      'kind', c.kind,
      'name', c.name,
      'role', m.role,
      'muted', m.muted,
      'last_msg_at', c.last_msg_at,
      'count', (select count(*) from public.conversation_members o where o.conv_id = c.id and o.left_at is null),
      -- 1:1: la otra persona; grupo: las 3 entradas más recientes que no eres tú (para el avatar).
      'members', case when c.kind = 'direct'
        then (select coalesce(jsonb_agg(o.user_id), '[]'::jsonb) from public.conversation_members o where o.conv_id = c.id and o.user_id <> p_me)
        else (select coalesce(jsonb_agg(s.user_id), '[]'::jsonb) from (
                select o.user_id from public.conversation_members o
                where o.conv_id = c.id and o.left_at is null and o.user_id <> p_me
                order by o.joined_at desc, o.user_id limit 3) s) end,
      'last', l.v,
      'unread', public.msg_unread(p_me, c.id, m.joined_at, public.msg_seen_upto(m.last_read_id, m.cleared_id), c.kind = 'group'),
      -- Limpiada en el desplegable y sin nada nuevo desde entonces.
      'cleared', m.cleared_id is not null and coalesce((l.v ->> 'id')::bigint, 0) <= m.cleared_id,
      'read_only', c.kind = 'direct' and public.msg_direct_read_only(p_me, c.id)) as r
    from public.conversation_members m
    join public.conversations c on c.id = m.conv_id
    left join lateral (
      select public.msg_view(x, p_me, c.kind = 'group') as v from public.messages x
      where x.conv_id = c.id and x.created_at >= m.joined_at and public.msg_sees(x.kind, x.sys, p_me)
      order by x.id desc limit 1) l on true
    where m.user_id = p_me and m.left_at is null
  ) s;
$$;

revoke all on function public.msg_seen_upto(bigint, bigint) from public, anon, authenticated;
revoke all on function public.msg_clear_inbox(uuid)         from public, anon, authenticated;
grant execute on function public.msg_clear_inbox(uuid)      to service_role;
