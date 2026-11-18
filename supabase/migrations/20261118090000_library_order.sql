-- =====================================================================================
-- Ordenar una lista fija a mano (de momento, Ver pronto: «MoviesVerPronto» y «SeriesVerPronto»).
--
-- La página manda el orden de los títulos que ENSEÑA. Puede no enseñarlos todos (los que tienen un
-- plan salen en «Planes», no en la rejilla), así que los que no vienen se colocan DETRÁS, en el orden
-- que ya tenían (posición, y si no tenían, de más antiguo a más reciente). Así todas las filas de la
-- lista acaban con una posición distinta y el orden no depende de empates.
--
-- `security invoker`: la RLS sigue limitando a TUS filas, y se filtra por auth.uid() además. Lo mismo
-- que `reorder_custom_list_items` (20260929083000_custom_list_order.sql).
-- =====================================================================================

create function public.reorder_library_items(p_collection text, p_ids integer[])
returns void
language sql
security invoker
set search_path = ''
as $$
  with req as (
    -- Los que manda la página y están de verdad en tu lista, en su orden (un repetido cuenta la
    -- primera vez; un id que no está se ignora, así no deja huecos).
    select o.tmdb_id, min(o.pos) as pos
      from unnest(p_ids) with ordinality as o(tmdb_id, pos)
      join public.library_items li
        on li.user_id = (select auth.uid()) and li.collection = p_collection and li.tmdb_id = o.tmdb_id
     group by o.tmdb_id
  ),
  ranked_req as (
    select tmdb_id, row_number() over (order by pos) as pos from req
  ),
  rest as (
    -- El resto de la lista, detrás, sin perder su orden.
    select li.tmdb_id,
           (select count(*) from ranked_req) + row_number() over (order by li.position nulls last, li.added_at) as pos
      from public.library_items li
     where li.user_id = (select auth.uid())
       and li.collection = p_collection
       and li.tmdb_id not in (select tmdb_id from ranked_req)
  ),
  final as (
    select tmdb_id, pos from ranked_req
    union all
    select tmdb_id, pos from rest
  )
  update public.library_items li
     set position = f.pos
    from final f
   where li.user_id = (select auth.uid())
     and li.collection = p_collection
     and li.tmdb_id = f.tmdb_id;
$$;

revoke execute on function public.reorder_library_items(text, integer[]) from public, anon;
grant execute on function public.reorder_library_items(text, integer[]) to authenticated;
