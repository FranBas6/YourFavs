-- =====================================================================================
-- YourFavs · Mensajes entre amigos: 1:1 (M1) y grupos (M2). Plan docs/Mensajes/PLAN_MENSAJES.md y
-- handoff docs/Mensajes/design_handoff_mensajes/README.md §2.
--
-- Reglas que no se negocian (handoff §0):
--   · 1:1 solo entre amigos y sin bloqueo, uno por pareja (`pair_key`). Si dejáis de ser amigos o
--     hay un bloqueo, queda en SOLO LECTURA; eso se calcula al leer y el cliente recibe solo
--     `read_only`, nunca el motivo. Quien bloquea pierde el 1:1 de su lista (`left_at`); al volver a
--     ser amigos, vuelve (triggers de abajo).
--   · Grupos de 3 a 10 personas, solo con amigos de quien añade; 20 grupos por persona. Quien entra
--     ve desde `joined_at`; quien sale o es quitado deja de ver el grupo. Si sale el último admin,
--     hereda quien lleva más tiempo dentro.
--   · En grupos, los mensajes de alguien que TÚ bloqueaste salen plegados (sin texto) solo para ti.
--   · Los avisos de admin («Has dado permisos de administración a…», «Ahora administras el grupo») solo
--     los ven quien da el cargo y quien lo recibe; el resto ve la etiqueta «Admin» en el panel (Fran).
--   · Solo texto (≤ 2.000). Borrar deja «Mensaje eliminado» al momento; Deshacer en 10 s como mucho.
--   · Frenos: 30 mensajes por minuto y 200 conversaciones nuevas al día por persona.
--
-- Seguridad: como F2–F6, RLS ACTIVADA y SIN políticas; todo pasa por el servidor con la clave
-- secreta y `me` de la sesión (src/services/BD/social/messages.ts). Las funciones solo las puede
-- ejecutar ese rol. Sin tiempo real todavía (M3): el navegador pregunta cada pocos segundos.
-- =====================================================================================

create type public.conv_kind as enum ('direct', 'group');

create table public.conversations (
  id          bigint generated always as identity primary key,
  kind        public.conv_kind not null,
  name        text check (kind = 'direct' or (name is not null and char_length(name) between 1 and 40)),
  pair_key    text unique,                 -- solo 1:1: least(uuid) || ':' || greatest(uuid)
  created_by  uuid references auth.users (id) on delete set null,
  last_msg_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  check ((kind = 'direct') = (pair_key is not null))
);
create index conversations_created_by on public.conversations (created_by, created_at desc);

create table public.conversation_members (
  conv_id      bigint not null references public.conversations (id) on delete cascade,
  user_id      uuid   not null references auth.users (id) on delete cascade,
  role         text   not null default 'member' check (role in ('admin', 'member')),
  joined_at    timestamptz not null default now(),   -- ves los mensajes con created_at >= joined_at
  left_at      timestamptz,                          -- null = dentro
  muted        boolean not null default false,
  last_read_id bigint,                               -- «Visto», «Nuevos» y el contador
  last_read_at timestamptz,                          -- cuándo leyó hasta ahí («Visto · 21:06»)
  primary key (conv_id, user_id)
);
create index conv_members_user on public.conversation_members (user_id) where left_at is null;

create table public.messages (
  id         bigint generated always as identity primary key,
  conv_id    bigint not null references public.conversations (id) on delete cascade,
  author_id  uuid references auth.users (id) on delete set null,   -- null en los de sistema (y si se borra la cuenta)
  kind       text not null default 'text' check (kind in ('text', 'system')),
  body       text check (char_length(body) <= 2000),               -- null si se borró
  sys        jsonb,                        -- {type, actor, targets[], name?, inherited?}
  client_id  uuid,                         -- idempotencia del reintento
  deleted_at timestamptz,
  -- Huella del texto borrado, solo para comprobar el Deshacer (el texto lo devuelve el cliente:
  -- así no se puede «restaurar» otro texto distinto, que sería editar). Se limpia al restaurar.
  undo_md5   text,
  created_at timestamptz not null default now(),
  unique (conv_id, author_id, client_id)
);
create index messages_conv on public.messages (conv_id, id desc);
create index messages_author on public.messages (author_id, created_at desc);

create table public.message_reports (
  id          bigint generated always as identity primary key,
  message_id  bigint not null references public.messages (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason      text not null check (reason in ('spam', 'harassment', 'other')),
  note        text check (char_length(note) <= 200),
  body        text,                        -- copia del texto al reportar (por si luego lo borra)
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  unique (message_id, reporter_id)
);
create index message_reports_open on public.message_reports (created_at desc) where resolved_at is null;

alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.message_reports      enable row level security;

-- -------------------------------------------------------------------------------------
-- Ayudantes
-- -------------------------------------------------------------------------------------
create function public.msg_pair_key(p_x uuid, p_y uuid)
returns text
language sql
immutable
set search_path = ''
as $$ select least(p_x, p_y)::text || ':' || greatest(p_x, p_y)::text; $$;

-- ¿Hay un bloqueo entre dos personas, en cualquier sentido?
create function public.msg_blocked_between(p_x uuid, p_y uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.blocks
                 where (blocker_id = p_x and blocked_id = p_y) or (blocker_id = p_y and blocked_id = p_x));
$$;

-- ¿Puede `p_me` escribir a / añadir a `p_them`? Amigos y sin bloqueo en ningún sentido.
create function public.msg_can_reach(p_me uuid, p_them uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_me <> p_them and public.social_are_friends(p_me, p_them) and not public.msg_blocked_between(p_me, p_them);
$$;

-- Grupos en los que está alguien ahora mismo.
create function public.msg_group_count(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.conversation_members m
  join public.conversations c on c.id = m.conv_id
  where m.user_id = p_user and m.left_at is null and c.kind = 'group';
$$;

-- Mensaje de sistema; sube la conversación en las listas.
create function public.msg_sys(p_conv bigint, p_actor uuid, p_type text, p_targets uuid[], p_extra jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.messages (conv_id, author_id, kind, sys)
  values (p_conv, null, 'system',
          jsonb_build_object('type', p_type, 'actor', p_actor, 'targets', to_jsonb(coalesce(p_targets, '{}'::uuid[])))
          || coalesce(p_extra, '{}'::jsonb));
  -- Un aviso de admin solo lo ven dos personas: no sube el grupo en la lista de nadie.
  if p_type <> 'admin' then
    update public.conversations set last_msg_at = now() where id = p_conv;
  end if;
end;
$$;

-- ¿Ve `p_me` este mensaje? Todos, salvo los avisos de admin: solo quien da el cargo y quien lo recibe
-- (en la herencia no hay quien lo da: solo quien hereda).
create function public.msg_sees(p_kind text, p_sys jsonb, p_me uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_kind <> 'system'
      or coalesce(p_sys ->> 'type', '') <> 'admin'
      or p_sys ->> 'actor' = p_me::text
      or coalesce(p_sys -> 'targets', '[]'::jsonb) ? p_me::text;
$$;

-- Nombre de grupo: espacios y saltos de línea colapsados en uno; null si no cabe (1–40).
create function public.msg_clean_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when char_length(v) between 1 and 40 then v end
  from (select btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')) as v) s;
$$;

-- Fila de un mensaje tal como la ve `p_me` (plegado si es de un grupo y su autor está bloqueado por ti).
create function public.msg_view(m public.messages, p_me uuid, p_group boolean)
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
    'client_id', case when m.author_id = p_me then m.client_id end)
  from (select p_group and m.kind = 'text' and m.deleted_at is null and m.author_id is not null
               and exists (select 1 from public.blocks b where b.blocker_id = p_me and b.blocked_id = m.author_id) as folded) v;
$$;

-- -------------------------------------------------------------------------------------
-- 1:1: abre el que ya existe o lo crea. {ok, id} | {ok:false, error: 'not_friends' | 'rate'}
-- -------------------------------------------------------------------------------------
create function public.msg_open_direct(p_me uuid, p_them uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key  text := public.msg_pair_key(p_me, p_them);
  v_conv bigint;
begin
  if p_them is null or not public.msg_can_reach(p_me, p_them) then
    return jsonb_build_object('ok', false, 'error', 'not_friends');
  end if;
  select id into v_conv from public.conversations where pair_key = v_key;
  if v_conv is null then
    if (select count(*) from public.conversations where created_by = p_me and created_at > now() - interval '1 day') >= 200 then
      return jsonb_build_object('ok', false, 'error', 'rate');
    end if;
    insert into public.conversations (kind, pair_key, created_by) values ('direct', v_key, p_me)
    on conflict (pair_key) do nothing
    returning id into v_conv;
    if v_conv is null then  -- la creó el otro a la vez
      select id into v_conv from public.conversations where pair_key = v_key;
    end if;
    insert into public.conversation_members (conv_id, user_id) values (v_conv, p_me), (v_conv, p_them)
    on conflict do nothing;
  end if;
  -- Siendo amigos y sin bloqueo, nadie debería estar fuera; por si acaso.
  update public.conversation_members set left_at = null where conv_id = v_conv and left_at is not null;
  return jsonb_build_object('ok', true, 'id', v_conv);
end;
$$;

-- -------------------------------------------------------------------------------------
-- Grupo nuevo: 2–9 amigos tuyos + tú. Quien ya esté en 20 grupos se salta (`skipped`).
-- {ok, id, skipped} | {ok:false, error: 'name' | 'too_few' | 'too_many' | 'not_friends' | 'cap' | 'rate', skipped?}
-- -------------------------------------------------------------------------------------
create function public.msg_create_group(p_me uuid, p_name text, p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name    text := public.msg_clean_name(p_name);
  v_ids     uuid[] := array(select distinct x from unnest(coalesce(p_ids, '{}')) x where x is not null and x <> p_me);
  v_skipped uuid[];
  v_add     uuid[];
  v_conv    bigint;
begin
  if v_name is null then return jsonb_build_object('ok', false, 'error', 'name'); end if;
  if coalesce(array_length(v_ids, 1), 0) < 2 then return jsonb_build_object('ok', false, 'error', 'too_few'); end if;
  if array_length(v_ids, 1) > 9 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
  if exists (select 1 from unnest(v_ids) t(id) where not public.msg_can_reach(p_me, t.id)) then
    return jsonb_build_object('ok', false, 'error', 'not_friends');
  end if;
  if public.msg_group_count(p_me) >= 20 then return jsonb_build_object('ok', false, 'error', 'cap'); end if;
  if (select count(*) from public.conversations where created_by = p_me and created_at > now() - interval '1 day') >= 200 then
    return jsonb_build_object('ok', false, 'error', 'rate');
  end if;

  v_skipped := array(select t.id from unnest(v_ids) t(id) where public.msg_group_count(t.id) >= 20);
  v_add := array(select unnest(v_ids) except select unnest(v_skipped));
  if coalesce(array_length(v_add, 1), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'too_few', 'skipped', to_jsonb(v_skipped));
  end if;

  insert into public.conversations (kind, name, created_by) values ('group', v_name, p_me) returning id into v_conv;
  insert into public.conversation_members (conv_id, user_id, role) values (v_conv, p_me, 'admin');
  insert into public.conversation_members (conv_id, user_id) select v_conv, t.id from unnest(v_add) t(id);
  perform public.msg_sys(v_conv, p_me, 'created', null, jsonb_build_object('name', v_name));
  perform public.msg_sys(v_conv, p_me, 'added', v_add, null);
  return jsonb_build_object('ok', true, 'id', v_conv, 'skipped', to_jsonb(v_skipped));
end;
$$;

-- -------------------------------------------------------------------------------------
-- Añadir (solo admins; amigos TUYOS sin bloqueo; 10 personas como mucho). Quien había salido vuelve
-- con un `joined_at` nuevo (ve desde ahí) y como miembro.
-- {ok, skipped} | {ok:false, error: 'none' | 'not_admin' | 'not_friends' | 'full'}
-- -------------------------------------------------------------------------------------
create function public.msg_add_members(p_me uuid, p_conv bigint, p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role    text;
  v_ids     uuid[];
  v_skipped uuid[];
  v_add     uuid[];
begin
  select m.role into v_role from public.conversation_members m join public.conversations c on c.id = m.conv_id
  where m.conv_id = p_conv and m.user_id = p_me and m.left_at is null and c.kind = 'group';
  if v_role is null then return jsonb_build_object('ok', false, 'error', 'none'); end if;
  if v_role <> 'admin' then return jsonb_build_object('ok', false, 'error', 'not_admin'); end if;

  v_ids := array(
    select distinct x from unnest(coalesce(p_ids, '{}')) x
    where x is not null and x <> p_me
      and not exists (select 1 from public.conversation_members m where m.conv_id = p_conv and m.user_id = x and m.left_at is null));
  if coalesce(array_length(v_ids, 1), 0) = 0 then return jsonb_build_object('ok', true, 'skipped', '[]'::jsonb); end if;
  if exists (select 1 from unnest(v_ids) t(id) where not public.msg_can_reach(p_me, t.id)) then
    return jsonb_build_object('ok', false, 'error', 'not_friends');
  end if;
  v_skipped := array(select t.id from unnest(v_ids) t(id) where public.msg_group_count(t.id) >= 20);
  v_add := array(select unnest(v_ids) except select unnest(v_skipped));
  if coalesce(array_length(v_add, 1), 0) = 0 then return jsonb_build_object('ok', true, 'skipped', to_jsonb(v_skipped)); end if;
  if (select count(*) from public.conversation_members where conv_id = p_conv and left_at is null) + array_length(v_add, 1) > 10 then
    return jsonb_build_object('ok', false, 'error', 'full');
  end if;

  insert into public.conversation_members (conv_id, user_id) select p_conv, t.id from unnest(v_add) t(id)
  on conflict (conv_id, user_id) do update
    set joined_at = now(), left_at = null, role = 'member', last_read_id = null, last_read_at = null, muted = false;
  perform public.msg_sys(p_conv, p_me, 'added', v_add, null);
  return jsonb_build_object('ok', true, 'skipped', to_jsonb(v_skipped));
end;
$$;

-- -------------------------------------------------------------------------------------
-- Si un grupo se queda sin admin, el cargo pasa a quien lleva más tiempo (su última entrada).
-- Si se queda sin nadie, se borra.
-- -------------------------------------------------------------------------------------
create function public.msg_fix_group(p_conv bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_heir uuid;
begin
  if not exists (select 1 from public.conversation_members where conv_id = p_conv and left_at is null) then
    delete from public.conversations where id = p_conv;
    return;
  end if;
  if not exists (select 1 from public.conversation_members where conv_id = p_conv and left_at is null and role = 'admin') then
    select user_id into v_heir from public.conversation_members
    where conv_id = p_conv and left_at is null order by joined_at, user_id limit 1;
    update public.conversation_members set role = 'admin' where conv_id = p_conv and user_id = v_heir;
    perform public.msg_sys(p_conv, null, 'admin', array[v_heir], jsonb_build_object('inherited', true));
  end if;
end;
$$;

-- Quitar a alguien (solo admins, no a ti). 'ok' | 'none' | 'not_admin'
create function public.msg_remove_member(p_me uuid, p_conv bigint, p_them uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select m.role into v_role from public.conversation_members m join public.conversations c on c.id = m.conv_id
  where m.conv_id = p_conv and m.user_id = p_me and m.left_at is null and c.kind = 'group';
  if v_role is null or p_them = p_me then return 'none'; end if;
  if v_role <> 'admin' then return 'not_admin'; end if;
  update public.conversation_members set left_at = now()
  where conv_id = p_conv and user_id = p_them and left_at is null;
  if not found then return 'none'; end if;
  perform public.msg_sys(p_conv, p_me, 'removed', array[p_them], null);
  return 'ok';
end;
$$;

-- Salir de un grupo (cualquiera). 'ok' | 'none'
create function public.msg_leave(p_me uuid, p_conv bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversation_members m set left_at = now()
  from public.conversations c
  where c.id = m.conv_id and c.kind = 'group' and m.conv_id = p_conv and m.user_id = p_me and m.left_at is null;
  if not found then return 'none'; end if;
  perform public.msg_sys(p_conv, p_me, 'left', null, null);
  perform public.msg_fix_group(p_conv);
  return 'ok';
end;
$$;

-- Hacer admin a otro miembro (solo admins). 'ok' | 'none' | 'not_admin'
create function public.msg_make_admin(p_me uuid, p_conv bigint, p_them uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select m.role into v_role from public.conversation_members m join public.conversations c on c.id = m.conv_id
  where m.conv_id = p_conv and m.user_id = p_me and m.left_at is null and c.kind = 'group';
  if v_role is null then return 'none'; end if;
  if v_role <> 'admin' then return 'not_admin'; end if;
  update public.conversation_members set role = 'admin'
  where conv_id = p_conv and user_id = p_them and left_at is null and role = 'member';
  if found then
    perform public.msg_sys(p_conv, p_me, 'admin', array[p_them], null);
    return 'ok';
  end if;
  -- Ya era admin: nada que hacer. Si no está en el grupo: 'none'.
  return case when exists (select 1 from public.conversation_members
                           where conv_id = p_conv and user_id = p_them and left_at is null) then 'ok' else 'none' end;
end;
$$;

-- Renombrar (solo admins). 'ok' | 'none' | 'not_admin' | 'name'
create function public.msg_rename(p_me uuid, p_conv bigint, p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_name text := public.msg_clean_name(p_name);
begin
  select m.role into v_role from public.conversation_members m join public.conversations c on c.id = m.conv_id
  where m.conv_id = p_conv and m.user_id = p_me and m.left_at is null and c.kind = 'group';
  if v_role is null then return 'none'; end if;
  if v_role <> 'admin' then return 'not_admin'; end if;
  if v_name is null then return 'name'; end if;
  update public.conversations set name = v_name where id = p_conv and name is distinct from v_name;
  if found then perform public.msg_sys(p_conv, p_me, 'renamed', null, jsonb_build_object('name', v_name)); end if;
  return 'ok';
end;
$$;

-- -------------------------------------------------------------------------------------
-- Enviar. Idempotente por `p_client` (el reintento devuelve el mismo mensaje). Enviar cuenta
-- como haber leído hasta ahí.
-- {ok, message} | {ok:false, error: 'none' | 'read_only' | 'empty' | 'too_long' | 'rate'}
-- -------------------------------------------------------------------------------------
create function public.msg_send(p_me uuid, p_conv bigint, p_body text, p_client uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind  public.conv_kind;
  v_other uuid;
  v_body  text := regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g');
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
  if v_body = '' then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  if char_length(v_body) > 2000 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  if (select count(*) from public.messages where author_id = p_me and created_at > now() - interval '1 minute') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'rate');
  end if;

  insert into public.messages (conv_id, author_id, body, client_id) values (p_conv, p_me, v_body, p_client)
  returning * into v_msg;
  update public.conversations set last_msg_at = v_msg.created_at where id = p_conv;
  update public.conversation_members set last_read_id = greatest(coalesce(last_read_id, 0), v_msg.id), last_read_at = now()
  where conv_id = p_conv and user_id = p_me;
  return jsonb_build_object('ok', true, 'message', public.msg_view(v_msg, p_me, v_kind = 'group'));
end;
$$;

-- Borrar el tuyo: «Mensaje eliminado» para todos al momento. 'ok' | 'none'
create function public.msg_delete(p_me uuid, p_msg bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Limpieza de paso: huellas de Deshacer tuyas que ya caducaron.
  update public.messages set undo_md5 = null
  where author_id = p_me and undo_md5 is not null and deleted_at < now() - interval '10 seconds';
  update public.messages set deleted_at = now(), undo_md5 = md5(body), body = null
  where id = p_msg and author_id = p_me and kind = 'text' and deleted_at is null;
  return case when found then 'ok' else 'none' end;
end;
$$;

-- Deshacer el borrado (10 s como mucho; el cliente ofrece 6). Solo con el MISMO texto. 'ok' | 'expired'
create function public.msg_restore(p_me uuid, p_msg bigint, p_body text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.messages set body = p_body, deleted_at = null, undo_md5 = null
  where id = p_msg and author_id = p_me and deleted_at > now() - interval '10 seconds'
    and undo_md5 = md5(coalesce(p_body, ''));
  return case when found then 'ok' else 'expired' end;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Leer, silenciar, reportar, texto plegado
-- -------------------------------------------------------------------------------------

-- Marca como leído hasta `p_last` (nunca hacia atrás ni más allá del último mensaje).
create function public.msg_read(p_me uuid, p_conv bigint, p_last bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_members m
  set last_read_id = v.target, last_read_at = now()
  from (select least(p_last, coalesce((select max(id) from public.messages where conv_id = p_conv), 0)) as target) v
  where m.conv_id = p_conv and m.user_id = p_me and m.left_at is null and p_last is not null
    and v.target > coalesce(m.last_read_id, 0);
$$;

create function public.msg_mute(p_me uuid, p_conv bigint, p_muted boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversation_members set muted = coalesce(p_muted, false)
  where conv_id = p_conv and user_id = p_me and left_at is null;
  return case when found then 'ok' else 'none' end;
end;
$$;

-- ¿Ve `p_me` este mensaje? Miembro activo y mensaje desde su entrada. Devuelve el tipo de chat.
create function public.msg_visible_kind(p_me uuid, p_msg bigint)
returns public.conv_kind
language sql
stable
security definer
set search_path = ''
as $$
  select c.kind from public.messages x
  join public.conversations c on c.id = x.conv_id
  join public.conversation_members m on m.conv_id = x.conv_id and m.user_id = p_me and m.left_at is null
  where x.id = p_msg and x.created_at >= m.joined_at;
$$;

-- Reportar un mensaje ajeno que ves. 'ok' | 'already' | 'none'
create function public.msg_report(p_me uuid, p_msg bigint, p_reason text, p_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text;
begin
  if public.msg_visible_kind(p_me, p_msg) is null then return 'none'; end if;
  select body into v_body from public.messages
  where id = p_msg and kind = 'text' and deleted_at is null and author_id is distinct from p_me;
  if not found then return 'none'; end if;
  insert into public.message_reports (message_id, reporter_id, reason, note, body)
  values (p_msg, p_me, p_reason, nullif(left(btrim(coalesce(p_note, '')), 200), ''), v_body)
  on conflict (message_id, reporter_id) do nothing;
  return case when found then 'ok' else 'already' end;
end;
$$;

-- Texto de un mensaje plegado («Mostrar»): solo si es de un grupo y su autor lo bloqueaste tú.
create function public.msg_folded_body(p_me uuid, p_msg bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select x.body from public.messages x
  where x.id = p_msg and x.kind = 'text' and x.deleted_at is null
    and public.msg_visible_kind(p_me, p_msg) = 'group'
    and exists (select 1 from public.blocks b where b.blocker_id = p_me and b.blocked_id = x.author_id);
$$;

-- -------------------------------------------------------------------------------------
-- Lecturas
-- -------------------------------------------------------------------------------------

-- Sin leer de una conversación para `p_me` (sin silenciar en cuenta: eso lo decide quien suma).
create function public.msg_unread(p_me uuid, p_conv bigint, p_joined timestamptz, p_last bigint, p_group boolean)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.messages x
  where x.conv_id = p_conv and x.id > coalesce(p_last, 0) and x.created_at >= p_joined
    and x.kind = 'text' and x.deleted_at is null and x.author_id is distinct from p_me
    and not (p_group and exists (select 1 from public.blocks b where b.blocker_id = p_me and b.blocked_id = x.author_id));
$$;

-- Total para los contadores: suma de las conversaciones sin silenciar.
create function public.msg_unread_total(p_me uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(public.msg_unread(p_me, m.conv_id, m.joined_at, m.last_read_id, c.kind = 'group')), 0)::int
  from public.conversation_members m
  join public.conversations c on c.id = m.conv_id
  where m.user_id = p_me and m.left_at is null and not m.muted;
$$;

-- ¿Está en solo lectura este 1:1 para `p_me`? (no sois amigos o hay un bloqueo; el motivo no sale)
create function public.msg_direct_read_only(p_me uuid, p_conv bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select not public.msg_can_reach(p_me, m.user_id)
                   from public.conversation_members m where m.conv_id = p_conv and m.user_id <> p_me), true);
$$;

-- Lista de conversaciones de `p_me`, la más reciente primero.
create function public.msg_list(p_me uuid)
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
      'last', (select public.msg_view(x, p_me, c.kind = 'group') from public.messages x
               where x.conv_id = c.id and x.created_at >= m.joined_at and public.msg_sees(x.kind, x.sys, p_me)
               order by x.id desc limit 1),
      'unread', public.msg_unread(p_me, c.id, m.joined_at, m.last_read_id, c.kind = 'group'),
      'read_only', c.kind = 'direct' and public.msg_direct_read_only(p_me, c.id)) as r
    from public.conversation_members m
    join public.conversations c on c.id = m.conv_id
    where m.user_id = p_me and m.left_at is null
  ) s;
$$;

-- -------------------------------------------------------------------------------------
-- Historial de una conversación. Sin `p_after`: los `p_limit` anteriores a `p_before` (o los
-- últimos). Con `p_after` (el sondeo): los nuevos, más los borrados desde `p_from` para tacharlos.
-- {ok:false, error:'left'} si saliste de un grupo; 'none' si no es tuya (o no existe).
-- -------------------------------------------------------------------------------------
create function public.msg_history(
  p_me uuid, p_conv bigint, p_before bigint default null, p_after bigint default null, p_from bigint default null, p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_c     public.conversations;
  v_m     public.conversation_members;
  v_group boolean;
  v_lim   integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_msgs  jsonb;
  v_more  boolean := false;
begin
  select * into v_c from public.conversations where id = p_conv;
  select * into v_m from public.conversation_members where conv_id = p_conv and user_id = p_me;
  if v_c.id is null or v_m.conv_id is null then return jsonb_build_object('ok', false, 'error', 'none'); end if;
  if v_m.left_at is not null then
    return jsonb_build_object('ok', false, 'error', case when v_c.kind = 'group' then 'left' else 'none' end);
  end if;
  v_group := v_c.kind = 'group';

  if p_after is not null then
    select coalesce(jsonb_agg(public.msg_view(x::public.messages, p_me, v_group) order by x.id), '[]'::jsonb) into v_msgs
    from (select * from public.messages
          where conv_id = p_conv and id > p_after and created_at >= v_m.joined_at and public.msg_sees(kind, sys, p_me)
          order by id limit 200) x;
  else
    select coalesce(jsonb_agg(public.msg_view(x::public.messages, p_me, v_group) order by x.id), '[]'::jsonb) into v_msgs
    from (select * from public.messages
          where conv_id = p_conv and created_at >= v_m.joined_at and (p_before is null or id < p_before)
            and public.msg_sees(kind, sys, p_me)
          order by id desc limit v_lim) x;
    v_more := exists (select 1 from public.messages
                      where conv_id = p_conv and created_at >= v_m.joined_at and public.msg_sees(kind, sys, p_me)
                        and id < coalesce((v_msgs -> 0 ->> 'id')::bigint, p_before, 0));
  end if;

  return jsonb_build_object(
    'ok', true,
    'conv', jsonb_build_object('id', v_c.id, 'kind', v_c.kind, 'name', v_c.name, 'created_at', v_c.created_at),
    'me', jsonb_build_object('role', v_m.role, 'muted', v_m.muted, 'last_read_id', v_m.last_read_id, 'joined_at', v_m.joined_at),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id', o.user_id, 'role', o.role, 'joined_at', o.joined_at)
                                          order by o.joined_at, o.user_id), '[]'::jsonb)
                from public.conversation_members o
                where o.conv_id = p_conv and (o.left_at is null or not v_group)),
    'messages', v_msgs,
    'has_more', v_more,
    'deleted_ids', case when p_after is not null and p_from is not null then
      (select coalesce(jsonb_agg(id), '[]'::jsonb) from public.messages
       where conv_id = p_conv and id >= p_from and id <= p_after and deleted_at is not null) end,
    'seen_id', case when not v_group then
      (select o.last_read_id from public.conversation_members o where o.conv_id = p_conv and o.user_id <> p_me) end,
    'seen_at', case when not v_group then
      (select o.last_read_at from public.conversation_members o where o.conv_id = p_conv and o.user_id <> p_me) end,
    'read_only', not v_group and public.msg_direct_read_only(p_me, p_conv));
end;
$$;

-- -------------------------------------------------------------------------------------
-- Reacciones a lo que pasa fuera del chat
-- -------------------------------------------------------------------------------------

-- Bloquear: quien bloquea pierde el 1:1 de su lista (quien fue bloqueado lo ve en solo lectura).
create function public.msg_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversation_members m set left_at = now()
  from public.conversations c
  where c.pair_key = public.msg_pair_key(new.blocker_id, new.blocked_id)
    and m.conv_id = c.id and m.user_id = new.blocker_id and m.left_at is null;
  return null;
end;
$$;
create trigger msg_on_block after insert on public.blocks
for each row execute function public.msg_on_block();

-- Volver a ser amigos (o deshacer «Eliminar amigo»): el 1:1 vuelve a la lista de los dos.
create function public.msg_on_friends()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ended_at is null then
    update public.conversation_members m set left_at = null
    from public.conversations c
    where c.pair_key = public.msg_pair_key(new.a_id, new.b_id)
      and m.conv_id = c.id and m.left_at is not null
      and not public.msg_blocked_between(new.a_id, new.b_id);
  end if;
  return null;
end;
$$;
create trigger msg_on_friends after insert or update of ended_at on public.friendships
for each row execute function public.msg_on_friends();

-- Borrar la cuenta: sus 1:1 se borran; en los grupos, sus mensajes quedan sin autor y, si era el
-- último admin, el cargo se hereda (o el grupo se borra si no queda nadie).
create function public.msg_on_member_gone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.conv_kind;
begin
  select kind into v_kind from public.conversations where id = old.conv_id;
  if v_kind is null then return null; end if;  -- ya se está borrando la conversación entera
  if v_kind = 'direct' then
    delete from public.conversations where id = old.conv_id;
  else
    perform public.msg_fix_group(old.conv_id);
  end if;
  return null;
end;
$$;
create trigger msg_on_member_gone after delete on public.conversation_members
for each row execute function public.msg_on_member_gone();

-- -------------------------------------------------------------------------------------
-- Solo el servidor (clave secreta).
-- -------------------------------------------------------------------------------------
revoke all on function public.msg_pair_key(uuid, uuid)                                   from public, anon, authenticated;
revoke all on function public.msg_blocked_between(uuid, uuid)                            from public, anon, authenticated;
revoke all on function public.msg_can_reach(uuid, uuid)                                  from public, anon, authenticated;
revoke all on function public.msg_group_count(uuid)                                      from public, anon, authenticated;
revoke all on function public.msg_sys(bigint, uuid, text, uuid[], jsonb)                 from public, anon, authenticated;
revoke all on function public.msg_clean_name(text)                                       from public, anon, authenticated;
revoke all on function public.msg_view(public.messages, uuid, boolean)                   from public, anon, authenticated;
revoke all on function public.msg_sees(text, jsonb, uuid)                                from public, anon, authenticated;
revoke all on function public.msg_open_direct(uuid, uuid)                                from public, anon, authenticated;
revoke all on function public.msg_create_group(uuid, text, uuid[])                       from public, anon, authenticated;
revoke all on function public.msg_add_members(uuid, bigint, uuid[])                      from public, anon, authenticated;
revoke all on function public.msg_fix_group(bigint)                                      from public, anon, authenticated;
revoke all on function public.msg_remove_member(uuid, bigint, uuid)                      from public, anon, authenticated;
revoke all on function public.msg_leave(uuid, bigint)                                    from public, anon, authenticated;
revoke all on function public.msg_make_admin(uuid, bigint, uuid)                         from public, anon, authenticated;
revoke all on function public.msg_rename(uuid, bigint, text)                             from public, anon, authenticated;
revoke all on function public.msg_send(uuid, bigint, text, uuid)                         from public, anon, authenticated;
revoke all on function public.msg_delete(uuid, bigint)                                   from public, anon, authenticated;
revoke all on function public.msg_restore(uuid, bigint, text)                            from public, anon, authenticated;
revoke all on function public.msg_read(uuid, bigint, bigint)                             from public, anon, authenticated;
revoke all on function public.msg_mute(uuid, bigint, boolean)                            from public, anon, authenticated;
revoke all on function public.msg_visible_kind(uuid, bigint)                             from public, anon, authenticated;
revoke all on function public.msg_report(uuid, bigint, text, text)                       from public, anon, authenticated;
revoke all on function public.msg_folded_body(uuid, bigint)                              from public, anon, authenticated;
revoke all on function public.msg_unread(uuid, bigint, timestamptz, bigint, boolean)     from public, anon, authenticated;
revoke all on function public.msg_unread_total(uuid)                                     from public, anon, authenticated;
revoke all on function public.msg_direct_read_only(uuid, bigint)                         from public, anon, authenticated;
revoke all on function public.msg_list(uuid)                                             from public, anon, authenticated;
revoke all on function public.msg_history(uuid, bigint, bigint, bigint, bigint, integer) from public, anon, authenticated;
revoke all on function public.msg_on_block()                                             from public, anon, authenticated;
revoke all on function public.msg_on_friends()                                           from public, anon, authenticated;
revoke all on function public.msg_on_member_gone()                                       from public, anon, authenticated;
-- Lo que llama el servidor (el resto son piezas internas de estas).
grant execute on function public.msg_open_direct(uuid, uuid)                                to service_role;
grant execute on function public.msg_create_group(uuid, text, uuid[])                       to service_role;
grant execute on function public.msg_add_members(uuid, bigint, uuid[])                      to service_role;
grant execute on function public.msg_remove_member(uuid, bigint, uuid)                      to service_role;
grant execute on function public.msg_leave(uuid, bigint)                                    to service_role;
grant execute on function public.msg_make_admin(uuid, bigint, uuid)                         to service_role;
grant execute on function public.msg_rename(uuid, bigint, text)                             to service_role;
grant execute on function public.msg_send(uuid, bigint, text, uuid)                         to service_role;
grant execute on function public.msg_delete(uuid, bigint)                                   to service_role;
grant execute on function public.msg_restore(uuid, bigint, text)                            to service_role;
grant execute on function public.msg_read(uuid, bigint, bigint)                             to service_role;
grant execute on function public.msg_mute(uuid, bigint, boolean)                            to service_role;
grant execute on function public.msg_report(uuid, bigint, text, text)                       to service_role;
grant execute on function public.msg_folded_body(uuid, bigint)                              to service_role;
grant execute on function public.msg_unread_total(uuid)                                     to service_role;
grant execute on function public.msg_list(uuid)                                             to service_role;
grant execute on function public.msg_history(uuid, bigint, bigint, bigint, bigint, integer) to service_role;
