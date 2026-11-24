-- Límite de intentos de entrar, registrarse y recuperar la contraseña (QA 5.2, H71).
-- El login va desde nuestro servidor (no desde el navegador), así que los límites «por IP» de Supabase
-- ven siempre las IPs de Netlify: no frenan a un atacante concreto y, con tráfico real, pueden bloquear a
-- todos a la vez. Llevamos nuestra propia cuenta, en la base de datos para que valga entre instancias:
-- claves como 'login:ip:1.2.3.4' o 'login:email:ana@x.com', cada una con su ventana de tiempo.
-- Solo la toca el servidor (clave de servicio); nadie con sesión puede leerla ni escribirla.

create table public.auth_throttle (
  key          text primary key,
  window_start timestamptz not null default now(),
  hits         integer     not null default 0
);

alter table public.auth_throttle enable row level security;
revoke all on public.auth_throttle from anon, authenticated;

-- ¿Ha llegado ya al máximo en la ventana actual? (no suma)
create or replace function public.auth_throttle_blocked(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select t.hits >= p_max
    from public.auth_throttle t
    where t.key = p_key and t.window_start > now() - make_interval(secs => p_window_seconds)
  ), false);
$$;

-- Suma un intento y devuelve cuántos lleva en la ventana (si la ventana caducó, empieza de nuevo en 1).
create or replace function public.auth_throttle_hit(p_key text, p_window_seconds integer)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.auth_throttle as t (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case when t.window_start > now() - make_interval(secs => p_window_seconds) then t.hits + 1 else 1 end,
        window_start = case when t.window_start > now() - make_interval(secs => p_window_seconds) then t.window_start else now() end
  returning t.hits;
$$;

-- Borra una cuenta (p. ej. el email tras entrar bien) y, de paso, las caducadas de hace más de un día.
create or replace function public.auth_throttle_clear(p_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.auth_throttle where key = p_key or window_start < now() - interval '1 day';
$$;

revoke all on function public.auth_throttle_blocked(text, integer, integer) from public, anon, authenticated;
revoke all on function public.auth_throttle_hit(text, integer) from public, anon, authenticated;
revoke all on function public.auth_throttle_clear(text) from public, anon, authenticated;
grant execute on function public.auth_throttle_blocked(text, integer, integer) to service_role;
grant execute on function public.auth_throttle_hit(text, integer) to service_role;
grant execute on function public.auth_throttle_clear(text) to service_role;
