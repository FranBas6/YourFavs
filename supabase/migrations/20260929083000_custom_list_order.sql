-- =====================================================================================
-- Reordenar las listas personalizadas y sus títulos arrastrando.
--
-- La página manda el orden COMPLETO; en Firestore era un batch con una escritura por lista o
-- por título. Aquí un UPDATE con `unnest ... with ordinality` (posición = índice + 1).
-- `security invoker`: la RLS sigue limitando a TUS filas, y se filtra por auth.uid() además.
-- =====================================================================================

create function public.reorder_custom_lists(p_ids text[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.custom_lists l
     set position = o.pos
    from unnest(p_ids) with ordinality as o(id, pos)
   where l.user_id = (select auth.uid()) and l.id = o.id;
$$;

-- `p_item_ids` con el id de siempre de cada título: 'movie_550' / 'tv_1399'.
create function public.reorder_custom_list_items(p_list_id text, p_item_ids text[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.custom_list_items i
     set position = o.pos
    from unnest(p_item_ids) with ordinality as o(item_id, pos)
   where i.user_id = (select auth.uid())
     and i.list_id = p_list_id
     and i.media_type::text || '_' || i.tmdb_id = o.item_id;
$$;

revoke execute on function public.reorder_custom_lists(text[]) from public, anon;
revoke execute on function public.reorder_custom_list_items(text, text[]) from public, anon;
grant execute on function public.reorder_custom_lists(text[]) to authenticated;
grant execute on function public.reorder_custom_list_items(text, text[]) to authenticated;
