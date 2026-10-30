-- =====================================================================================
-- YourFavs · Mensajes M5c: el calendario .ics con una dirección secreta por persona
-- (handoff M5 §3.8).
--
-- Hasta ahora todo el mundo se suscribía a la misma `/api/calendar/subscribe.ics`, que solo sabía
-- quién eras por la cookie de sesión: Google o Apple Calendar no la mandan, así que fuera de la web
-- el feed salía sin tus estrenos. Ahora cada persona tiene su dirección
-- `/api/calendar/u/{ics_token}.ics`:
--   · `ics_token`: 43 caracteres base62 (~256 bits), se crea al pedirla por primera vez;
--   · «Crear una nueva» la cambia y la anterior deja de funcionar al momento;
--   · `ics_plans`: «Incluir mis planes» (encendido por defecto).
--
-- Seguridad: como M1–M5b, funciones `security definer` solo para el servidor. La dirección solo
-- se le enseña a su dueño (Ajustes y el botón del calendario).
-- =====================================================================================

alter table public.profiles
  add column ics_token text unique check (ics_token ~ '^[0-9A-Za-z]{43}$'),
  add column ics_plans boolean not null default true;

-- 43 caracteres base62 al azar (rechazo de bytes ≥ 248 para no sesgar el reparto).
create function public.ics_new_token()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_abc constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  v_out text := '';
  v_bytes bytea;
  v_b int;
begin
  while char_length(v_out) < 43 loop
    v_bytes := extensions.gen_random_bytes(64);
    for i in 0 .. 63 loop
      v_b := get_byte(v_bytes, i);
      if v_b < 248 and char_length(v_out) < 43 then
        v_out := v_out || substr(v_abc, (v_b % 62) + 1, 1);
      end if;
    end loop;
  end loop;
  return v_out;
end;
$$;

-- Tu dirección (la crea si aún no la tienes). null si no hay perfil.
create function public.ics_token_get(p_me uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  select ics_token into v_token from public.profiles where id = p_me;
  if v_token is null then
    update public.profiles set ics_token = public.ics_new_token()
    where id = p_me and ics_token is null
    returning ics_token into v_token;
    -- Otra petición la creó a la vez: la suya vale.
    if v_token is null then select ics_token into v_token from public.profiles where id = p_me; end if;
  end if;
  return v_token;
end;
$$;

-- «Crear una nueva»: la anterior deja de funcionar al momento.
create function public.ics_token_rotate(p_me uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  update public.profiles set ics_token = public.ics_new_token() where id = p_me returning ics_token;
$$;

-- De quién es una dirección (y si quiere sus planes en ella). Sin filas si no existe.
create function public.ics_owner(p_token text)
returns table (user_id uuid, plans boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.ics_plans from public.profiles p
  where p_token ~ '^[0-9A-Za-z]{43}$' and p.ics_token = p_token;
$$;

revoke all on function public.ics_new_token()           from public, anon, authenticated;
revoke all on function public.ics_token_get(uuid)       from public, anon, authenticated;
revoke all on function public.ics_token_rotate(uuid)    from public, anon, authenticated;
revoke all on function public.ics_owner(text)           from public, anon, authenticated;
grant execute on function public.ics_token_get(uuid)    to service_role;
grant execute on function public.ics_token_rotate(uuid) to service_role;
grant execute on function public.ics_owner(text)        to service_role;
