-- Limpieza de Firebase (2026-10-30). `firebase_uid` solo sirvió para enlazar las cuentas al migrar de
-- Firestore a Supabase (29-09); ya no la usa ningún código, función, vista ni política. Su índice
-- único se va con ella.
alter table public.profiles drop column if exists firebase_uid;
