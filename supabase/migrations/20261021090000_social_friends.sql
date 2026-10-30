-- =====================================================================================
-- YourFavs · Amistad por solicitudes (F3 de la capa social, docs/PLAN_SOCIAL.md y el handoff
-- docs/design_handoff_social_f2_f3/README.md §5).
--
-- Seguir y amistad son independientes: nada de aquí toca `follows`, salvo bloquear (que ya lo
-- cortaba todo en la F2 y ahora también corta la amistad y las solicitudes).
--
-- Reglas (handoff §0 y §5.2):
--   · Pedir amistad necesita perfil propio activo y que el otro también lo tenga.
--   · Si el otro ya te la había pedido, sois amigos al momento.
--   · Rechazar es SILENCIOSO: quien la envió sigue viendo «Solicitud enviada» y, durante 30 días,
--     volver a enviarla no crea nada (y sigue sin saberlo). Desbloquear no borra ese plazo.
--   · Máximo 20 enviadas sin responder (las rechazadas en plazo cuentan: para quien las envió
--     siguen «enviadas»).
--
-- Seguridad: como en la F2, RLS ACTIVADA y SIN políticas; todo pasa por el servidor con la clave
-- secreta, y las funciones solo las puede ejecutar ese rol.
-- =====================================================================================

create table public.friend_requests (
  id          bigint generated always as identity primary key,
  from_id     uuid not null references auth.users (id) on delete cascade,
  to_id       uuid not null references auth.users (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  -- Cuándo se rechazó. No se borra aunque la solicitud pase luego a `cancelled` (quien la envió la
  -- canceló sin saber nada): así el plazo de 30 días no se salta cancelando y reenviando.
  rejected_at timestamptz,
  check (from_id <> to_id)
);
create unique index friend_requests_one_pending on public.friend_requests (from_id, to_id) where status = 'pending';
create index friend_requests_to on public.friend_requests (to_id, status, created_at desc);
create index friend_requests_from on public.friend_requests (from_id, status, created_at desc);

-- Una fila por pareja, con a < b. `ended_at`/`ended_by`: «Eliminar amigo» la deja marcada en vez
-- de borrarla para que el Deshacer (6 s) pueda devolverla con su `since` original, y SOLO quien la
-- eliminó y solo un momento después: restaurar no puede servir para crear una amistad sin permiso.
create table public.friendships (
  a_id     uuid not null references auth.users (id) on delete cascade,
  b_id     uuid not null references auth.users (id) on delete cascade,
  since    timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references auth.users (id) on delete set null,
  primary key (a_id, b_id),
  check (a_id < b_id)
);
create index friendships_b on public.friendships (b_id) where ended_at is null;

alter table public.friend_requests enable row level security;
alter table public.friendships     enable row level security;

-- -------------------------------------------------------------------------------------
-- ¿Son amigos? (sin orden: la función ordena la pareja)
-- -------------------------------------------------------------------------------------
create function public.social_are_friends(p_x uuid, p_y uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships
    where a_id = least(p_x, p_y) and b_id = greatest(p_x, p_y) and ended_at is null);
$$;

-- Crea (o revive) la amistad de una pareja.
create function public.social_make_friends(p_x uuid, p_y uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.friendships (a_id, b_id) values (least(p_x, p_y), greatest(p_x, p_y))
  on conflict (a_id, b_id) do update set since = now(), ended_at = null, ended_by = null
    where public.friendships.ended_at is not null;
$$;

-- Aviso en el buzón de `p_to`, si no apagó los avisos de personas. Id determinista: no se duplica.
create function public.social_notify(p_to uuid, p_id text, p_type text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor record;
begin
  if exists (select 1 from public.profiles where id = p_to and coalesce(notif_prefs ->> 'social', 'true') = 'false') then
    return;
  end if;
  select sp.name, sp.handle into v_actor from public.social_people(array[p_actor]) sp;
  insert into public.notifications (user_id, id, type, title, subtitle, href, actor_id, created_at, read)
  values (p_to, p_id, p_type, coalesce(v_actor.name, ''), '',
          case when v_actor.handle is not null then '/u/' || v_actor.handle end, p_actor, now(), false)
  on conflict (user_id, id) do nothing;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Pedir amistad. Devuelve:
--   'ok'         solicitud enviada (o «enviada» en silencio si te la rechazaron hace < 30 días)
--   'friends'    ya erais amigos, o te la había pedido y quedáis amigos al momento
--   'no_profile' no tienes perfil activo · 'not_public' el otro no · 'blocked' hay un bloqueo
--   'cap'        20 enviadas sin responder · 'self'
-- -------------------------------------------------------------------------------------
create function public.social_send_request(p_me uuid, p_them uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_in  public.friend_requests%rowtype;
  v_old public.friend_requests%rowtype;
  v_id  bigint;
begin
  if p_me = p_them then return 'self'; end if;
  if not exists (select 1 from public.profiles where id = p_me and public_visibility <> 'off' and public_handle is not null) then
    return 'no_profile';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_me and b.blocked_id = p_them) or (b.blocker_id = p_them and b.blocked_id = p_me)) then
    return 'blocked';
  end if;
  if not exists (select 1 from public.profiles where id = p_them and public_visibility <> 'off' and public_handle is not null) then
    return 'not_public';
  end if;
  if public.social_are_friends(p_me, p_them) then return 'friends'; end if;

  -- Solicitud cruzada: el otro ya te la había pedido → amigos al momento.
  select * into v_in from public.friend_requests
  where from_id = p_them and to_id = p_me and status = 'pending' for update;
  if found then
    update public.friend_requests set status = 'accepted', resolved_at = now() where id = v_in.id;
    perform public.social_make_friends(p_me, p_them);
    -- Su aviso «X quiere ser tu amigo» queda leído (se pintará «Ahora sois amigos»).
    update public.notifications set read = true where user_id = p_me and id = 'freq:' || v_in.id;
    perform public.social_notify(p_them, 'facc:' || v_in.id, 'friend_accepted', p_me);
    return 'friends';
  end if;

  -- Ya enviada y pendiente: nada que hacer.
  if exists (select 1 from public.friend_requests where from_id = p_me and to_id = p_them and status = 'pending') then
    return 'ok';
  end if;

  -- Rechazada hace menos de 30 días: en silencio. Si la habías cancelado después, vuelve a
  -- «rechazada» para que la sigas viendo como enviada; no se crea nada ni se avisa.
  select * into v_old from public.friend_requests
  where from_id = p_me and to_id = p_them and rejected_at > now() - interval '30 days'
  order by rejected_at desc limit 1;
  if found then
    update public.friend_requests set status = 'rejected' where id = v_old.id;
    return 'ok';
  end if;

  if (select count(*) from public.friend_requests
      where from_id = p_me
        and (status = 'pending' or (status = 'rejected' and rejected_at > now() - interval '30 days'))) >= 20 then
    return 'cap';
  end if;

  insert into public.friend_requests (from_id, to_id) values (p_me, p_them) returning id into v_id;
  perform public.social_notify(p_them, 'freq:' || v_id, 'friend_request', p_me);
  return 'ok';
end;
$$;

-- Cancelar la que enviaste (pendiente, o rechazada sin que lo sepas). Sin aviso. El aviso que tenía
-- el otro pasa a leído y se pintará «Esta solicitud ya no está pendiente».
create function public.social_cancel_request(p_me uuid, p_them uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications n set read = true
  from public.friend_requests r
  where r.from_id = p_me and r.to_id = p_them and r.status = 'pending'
    and n.user_id = p_them and n.id = 'freq:' || r.id;
  update public.friend_requests set status = 'cancelled', resolved_at = coalesce(resolved_at, now())
  where from_id = p_me and to_id = p_them
    and (status = 'pending' or (status = 'rejected' and rejected_at > now() - interval '30 days'));
$$;

-- Responder a una solicitud recibida de `p_from`. Aceptar crea la amistad y avisa a quien la pidió;
-- rechazar NO avisa a nadie. Devuelve 'ok' o 'none' (no había ninguna pendiente).
create function public.social_respond_request(p_me uuid, p_from uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.friend_requests%rowtype;
begin
  select * into v_req from public.friend_requests
  where from_id = p_from and to_id = p_me and status = 'pending' for update;
  if not found then return 'none'; end if;
  update public.notifications set read = true where user_id = p_me and id = 'freq:' || v_req.id;
  if p_accept then
    update public.friend_requests set status = 'accepted', resolved_at = now() where id = v_req.id;
    perform public.social_make_friends(p_me, p_from);
    perform public.social_notify(p_from, 'facc:' || v_req.id, 'friend_accepted', p_me);
  else
    update public.friend_requests set status = 'rejected', resolved_at = now(), rejected_at = now() where id = v_req.id;
  end if;
  return 'ok';
end;
$$;

-- Eliminar amigo: no toca `follows` y no avisa. Se marca (no se borra) para poder deshacerlo.
create function public.social_unfriend(p_me uuid, p_them uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.friendships set ended_at = now(), ended_by = p_me
  where a_id = least(p_me, p_them) and b_id = greatest(p_me, p_them) and ended_at is null;
$$;

-- Deshacer «Eliminar amigo»: solo quien la eliminó, en el minuto siguiente y sin bloqueo de por
-- medio. Vuelve con su `since` original. Devuelve si se pudo.
create function public.social_restore_friend(p_me uuid, p_them uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_me and b.blocked_id = p_them) or (b.blocker_id = p_them and b.blocked_id = p_me)) then
    return false;
  end if;
  update public.friendships set ended_at = null, ended_by = null
  where a_id = least(p_me, p_them) and b_id = greatest(p_me, p_them)
    and ended_by = p_me and ended_at > now() - interval '1 minute';
  return found;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Bloquear (F2) ahora también corta amistad y solicitudes. Las solicitudes se cancelan, pero la
-- marca de rechazo (`rejected_at`) se conserva: desbloquear no borra el plazo de 30 días.
-- -------------------------------------------------------------------------------------
create or replace function public.social_block(p_me uuid, p_them uuid)
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
  update public.friend_requests set status = 'cancelled', resolved_at = coalesce(resolved_at, now())
  where ((from_id = p_me and to_id = p_them) or (from_id = p_them and to_id = p_me))
    and status in ('pending', 'rejected');
  delete from public.friendships where a_id = least(p_me, p_them) and b_id = greatest(p_me, p_them);
  insert into public.blocks (blocker_id, blocked_id) values (p_me, p_them)
  on conflict do nothing;
end;
$$;

-- Buscar (F2) con los amigos antes que a quien sigues.
create or replace function public.social_search(p_me uuid, p_q text, p_limit integer)
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
      public.social_are_friends(p_me, p.id) desc,
      exists (select 1 from public.follows f where f.follower_id = p_me and f.followee_id = p.id) desc,
      p.public_handle
    limit least(greatest(coalesce(p_limit, 20), 1), 20);
end;
$$;

revoke all on function public.social_are_friends(uuid, uuid)            from public, anon, authenticated;
revoke all on function public.social_make_friends(uuid, uuid)           from public, anon, authenticated;
revoke all on function public.social_notify(uuid, text, text, uuid)      from public, anon, authenticated;
revoke all on function public.social_send_request(uuid, uuid)           from public, anon, authenticated;
revoke all on function public.social_cancel_request(uuid, uuid)         from public, anon, authenticated;
revoke all on function public.social_respond_request(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.social_unfriend(uuid, uuid)               from public, anon, authenticated;
revoke all on function public.social_restore_friend(uuid, uuid)         from public, anon, authenticated;
revoke all on function public.social_block(uuid, uuid)                  from public, anon, authenticated;
revoke all on function public.social_search(uuid, text, integer)        from public, anon, authenticated;
grant execute on function public.social_are_friends(uuid, uuid)            to service_role;
grant execute on function public.social_make_friends(uuid, uuid)           to service_role;
grant execute on function public.social_notify(uuid, text, text, uuid)      to service_role;
grant execute on function public.social_send_request(uuid, uuid)           to service_role;
grant execute on function public.social_cancel_request(uuid, uuid)         to service_role;
grant execute on function public.social_respond_request(uuid, uuid, boolean) to service_role;
grant execute on function public.social_unfriend(uuid, uuid)               to service_role;
grant execute on function public.social_restore_friend(uuid, uuid)         to service_role;
grant execute on function public.social_block(uuid, uuid)                  to service_role;
grant execute on function public.social_search(uuid, text, integer)        to service_role;
