-- Sagas que sigues (2026-11-23, rama feat/avisos-finalizadas · C2). «Seguir saga» es una sola acción:
-- la saga sale en Mis listas › Sagas (`/mislistas/sagas`) y, más adelante, la campana avisa de sus
-- películas nuevas, fechas y estrenos. Igual que `followed_people`: una fila por saga, con el nombre y
-- las imágenes guardados al seguirla para pintar la lista sin esperar a TMDB.
--
-- Tabla propia y no `notification_subs`: allí `media_type` es el enum común (movie/tv) que comparten
-- las listas, y meterle «collection» dejaría guardar sagas donde no tocan.

create table public.followed_collections (
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection_id  integer not null,
  name           text,
  poster_path    text,
  backdrop_path  text,
  added_at       timestamptz not null default now(),
  primary key (user_id, collection_id)
);

alter table public.followed_collections enable row level security;

-- Mismo patrón que el resto de tablas por usuario: solo tus filas, para todo.
create policy "followed_collections: solo tus filas" on public.followed_collections for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.followed_collections from anon;
grant select, insert, update, delete on public.followed_collections to authenticated;
