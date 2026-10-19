-- =====================================================================================
-- YourFavs · Seguir, bloquear y llegar por el enlace de alguien (F2 de la capa social,
-- docs/PLAN_SOCIAL.md y el handoff docs/design_handoff_social_f2_f3/README.md §5).
--
-- Seguir es libre y en un solo sentido. Bloquear corta todo entre dos personas, sin avisar.
-- La amistad por solicitud llega en la F3 con sus propias tablas: aquí no hay nada de ella.
--
-- Seguridad: las tablas nuevas tienen la RLS ACTIVADA y NINGUNA política. Nadie las lee ni las
-- escribe desde el navegador: todo pasa por el servidor con la clave secreta, que valida antes
-- (src/services/BD/social/graph.ts). Las funciones de abajo solo las puede ejecutar ese rol.
-- =====================================================================================

create table public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
-- «Seguidores»: quién me sigue, lo más reciente primero. «Siguiendo» usa la clave primaria.
create index follows_followee on public.follows (followee_id, created_at desc);

create table public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
-- Para mirar «¿me ha bloqueado?» desde el otro lado.
create index blocks_blocked on public.blocks (blocked_id);

alter table public.follows enable row level security;
alter table public.blocks  enable row level security;

-- Llegar por el enlace de alguien: quién te trajo (se sigue a esa persona al crear la cuenta) y si
-- ya descartaste la sugerencia «¿Añadir a X como amigo?» (se pinta en la F3).
alter table public.profiles
  add column referred_by                   uuid references auth.users (id) on delete set null,
  add column referral_suggestion_dismissed boolean not null default false;

-- Avisos entre personas: quién lo provoca. El aviso guarda solo eso; su estado («Seguir también»
-- o «Ahora sigues a Ana») se calcula al pintarlo, con la relación de ese momento. Si la cuenta
-- de quien lo provocó se borra, el aviso se va con ella.
alter table public.notifications
  add column actor_id uuid references auth.users (id) on delete cascade;
create index notifications_actor on public.notifications (actor_id) where actor_id is not null;

-- -------------------------------------------------------------------------------------
-- Personas: nombre, dirección y avatar de una lista de usuarios.
--
-- El nombre es el «Nombre visible» de Ajustes o, si no hay, el de la cuenta (Google o el
-- registro), igual que en el resto de la app. Ese segundo vive en auth.users, que el servidor no
-- puede leer por la API: por eso es una función. La dirección solo sale si el perfil está activo.
-- -------------------------------------------------------------------------------------
create function public.social_people(p_ids uuid[])
returns table (
  id          uuid,
  handle      text,
  name        text,
  has_avatar  boolean,
  updated_at  timestamptz,
  archetype   jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    case when p.public_visibility <> 'off' then p.public_handle end,
    coalesce(
      nullif(btrim(p.display_name), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      case when p.public_visibility <> 'off' then p.public_handle end
    ),
    (p.avatar_url is not null
      or coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture', '') like 'https://%'),
    p.updated_at,
    case when p.public_visibility <> 'off' then p.public_archetype end
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = any (p_ids);
$$;

-- -------------------------------------------------------------------------------------
-- Buscar personas (centro «Amigos» y ⌘K). Solo perfiles activos, nunca a ti mismo ni a nadie
-- con quien haya un bloqueo en cualquier sentido. Por dirección o por nombre, sin distinguir
-- mayúsculas. Orden: la dirección exacta primero, luego a quién sigues, luego el resto.
-- -------------------------------------------------------------------------------------
create function public.social_search(p_me uuid, p_q text, p_limit integer)
returns table (id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q   text := lower(btrim(regexp_replace(coalesce(p_q, ''), '^@', '')));
  v_pat text;
begin
  if char_length(v_q) < 2 then return; end if;
  -- `%`, `_` y `\` del texto se buscan tal cual, no como comodines.
  v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select p.id
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.public_visibility <> 'off'
      and p.public_handle is not null
      and p.id <> p_me
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = p_me and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = p_me))
      and (
        p.public_handle like v_pat
        or lower(coalesce(
             nullif(btrim(p.display_name), ''),
             u.raw_user_meta_data ->> 'full_name',
             u.raw_user_meta_data ->> 'name', '')) like v_pat)
    order by
      (p.public_handle = v_q) desc,
      exists (select 1 from public.follows f where f.follower_id = p_me and f.followee_id = p.id) desc,
      p.public_handle
    limit least(greatest(coalesce(p_limit, 20), 1), 20);
end;
$$;

-- -------------------------------------------------------------------------------------
-- Seguir. Devuelve 'ok' | 'self' | 'blocked' | 'not_public'.
--
-- Solo a perfiles activos y sin bloqueo en ningún sentido. Repetirlo no hace nada. Al crear el
-- seguimiento, avisa a la otra persona con UN aviso por pareja (`follow:{quien}`): si ya existe y
-- es de hace menos de 24 h no se toca, así que seguir y dejar de seguir en bucle no inunda; si es
-- más viejo, vuelve arriba como nuevo. No avisa si la otra persona apagó los avisos de personas.
-- -------------------------------------------------------------------------------------
create function public.social_follow(p_me uuid, p_them uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles%rowtype;
  v_me     record;
  v_new    boolean;
begin
  if p_me = p_them then return 'self'; end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_me and b.blocked_id = p_them)
       or (b.blocker_id = p_them and b.blocked_id = p_me)) then
    return 'blocked';
  end if;
  select * into v_target from public.profiles where id = p_them;
  if not found or v_target.public_visibility = 'off' or v_target.public_handle is null then
    return 'not_public';
  end if;

  insert into public.follows (follower_id, followee_id) values (p_me, p_them)
  on conflict do nothing;
  v_new := found;

  if v_new and coalesce(v_target.notif_prefs ->> 'social', 'true') <> 'false' then
    select sp.name, sp.handle into v_me from public.social_people(array[p_me]) sp;
    insert into public.notifications (user_id, id, type, title, subtitle, href, actor_id, created_at, read)
    values (p_them, 'follow:' || p_me, 'follow', coalesce(v_me.name, ''), '',
            case when v_me.handle is not null then '/u/' || v_me.handle end, p_me, now(), false)
    on conflict (user_id, id) do update
      set created_at = now(), read = false, title = excluded.title, href = excluded.href
      where public.notifications.created_at < now() - interval '24 hours';
  end if;
  return 'ok';
end;
$$;

-- Dejar de seguir. Sin aviso. El «te sigue» que tuviera la otra persona se da por leído (deja de
-- contar en el globo) y la campana ya no lo pinta, porque ya no es verdad.
create function public.social_unfollow(p_me uuid, p_them uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.follows where follower_id = p_me and followee_id = p_them;
  update public.notifications set read = true
  where user_id = p_them and id = 'follow:' || p_me and not read;
$$;

-- -------------------------------------------------------------------------------------
-- Bloquear, en una transacción: dejáis de seguiros en los dos sentidos, se borran los avisos
-- que os hubierais provocado el uno al otro y se apunta el bloqueo. Sin aviso. Desbloquear solo
-- quita el bloqueo: no devuelve nada de lo borrado. (La F3 suma amistad y solicitudes.)
-- -------------------------------------------------------------------------------------
create function public.social_block(p_me uuid, p_them uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_me = p_them then return; end if;
  delete from public.follows
  where (follower_id = p_me and followee_id = p_them)
     or (follower_id = p_them and followee_id = p_me);
  delete from public.notifications
  where (user_id = p_me and actor_id = p_them)
     or (user_id = p_them and actor_id = p_me);
  insert into public.blocks (blocker_id, blocked_id) values (p_me, p_them)
  on conflict do nothing;
end;
$$;

-- Solo el servidor (clave secreta). Supabase da EXECUTE a anon y authenticated por defecto en el
-- esquema public: se quita, para que nadie las llame desde fuera con su propio uid de parámetro.
revoke all on function public.social_people(uuid[])               from public, anon, authenticated;
revoke all on function public.social_search(uuid, text, integer)   from public, anon, authenticated;
revoke all on function public.social_follow(uuid, uuid)            from public, anon, authenticated;
revoke all on function public.social_unfollow(uuid, uuid)          from public, anon, authenticated;
revoke all on function public.social_block(uuid, uuid)             from public, anon, authenticated;
grant execute on function public.social_people(uuid[])             to service_role;
grant execute on function public.social_search(uuid, text, integer) to service_role;
grant execute on function public.social_follow(uuid, uuid)         to service_role;
grant execute on function public.social_unfollow(uuid, uuid)       to service_role;
grant execute on function public.social_block(uuid, uuid)          to service_role;
