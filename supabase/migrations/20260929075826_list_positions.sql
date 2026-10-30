-- =====================================================================================
-- Posiciones de las listas ordenables a mano (hoy solo SeriesFavs).
--
-- En Firestore, insertar una favorita en la posición 3 era leer la lista entera y reescribir
-- una a una todas las de detrás (hasta 47 escrituras). Aquí es un UPDATE. `security invoker`:
-- corren con los permisos de quien llama, así que la RLS sigue limitando a TUS filas, y además
-- se filtra por auth.uid() de forma explícita.
-- =====================================================================================

-- Desplaza `p_delta` las posiciones dentro de [p_from, p_to] (p_to null = hasta el final).
create function public.shift_list_positions(p_collection text, p_from integer, p_to integer, p_delta integer)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.library_items
     set position = position + p_delta
   where user_id = (select auth.uid())
     and collection = p_collection
     and position >= p_from
     and (p_to is null or position <= p_to);
$$;

-- Renumera 1..n respetando el orden actual (las que no tienen posición, al final por fecha).
create function public.renumber_list_positions(p_collection text)
returns void
language sql
security invoker
set search_path = ''
as $$
  with ordered as (
    select tmdb_id, row_number() over (order by position nulls last, added_at) as rn
      from public.library_items
     where user_id = (select auth.uid()) and collection = p_collection
  )
  update public.library_items li
     set position = o.rn
    from ordered o
   where li.user_id = (select auth.uid())
     and li.collection = p_collection
     and li.tmdb_id = o.tmdb_id;
$$;

revoke execute on function public.shift_list_positions(text, integer, integer, integer) from public, anon;
revoke execute on function public.renumber_list_positions(text) from public, anon;
grant execute on function public.shift_list_positions(text, integer, integer, integer) to authenticated;
grant execute on function public.renumber_list_positions(text) to authenticated;
