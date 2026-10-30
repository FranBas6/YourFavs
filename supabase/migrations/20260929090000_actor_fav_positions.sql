-- =====================================================================================
-- Posiciones de los actores favoritos (orden manual), igual que list_positions para
-- SeriesFavs: en Firestore insertar o mover uno reescribía uno a uno todos los de detrás.
-- `security invoker` + filtro por auth.uid(): solo tocan TUS filas.
-- =====================================================================================

create function public.shift_actor_fav_positions(p_from integer, p_to integer, p_delta integer)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.actor_favs
     set position = position + p_delta
   where user_id = (select auth.uid())
     and position >= p_from
     and (p_to is null or position <= p_to);
$$;

create function public.renumber_actor_favs()
returns void
language sql
security invoker
set search_path = ''
as $$
  with ordered as (
    select person_id, row_number() over (order by position nulls last, added_at) as rn
      from public.actor_favs
     where user_id = (select auth.uid())
  )
  update public.actor_favs a
     set position = o.rn
    from ordered o
   where a.user_id = (select auth.uid()) and a.person_id = o.person_id;
$$;

revoke execute on function public.shift_actor_fav_positions(integer, integer, integer) from public, anon;
revoke execute on function public.renumber_actor_favs() from public, anon;
grant execute on function public.shift_actor_fav_positions(integer, integer, integer) to authenticated;
grant execute on function public.renumber_actor_favs() to authenticated;
