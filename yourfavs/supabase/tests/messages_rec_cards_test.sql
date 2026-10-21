-- Pruebas de las recomendaciones en el chat (migración 20261029090000_messages_rec_cards.sql,
-- handoff M4 §2.1). Uso: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- a es amiga de b y de c; b y c no son amigas entre sí.
create temp table t_users (n text primary key, id uuid not null default gen_random_uuid());
insert into t_users (n) select unnest(array['a','b','c']);
insert into auth.users (id, email, aud, role)
select id, 'rectest-' || n || '@example.com', 'authenticated', 'authenticated' from t_users;
create function pg_temp.u(p text) returns uuid language sql stable as $$ select id from t_users where n = p $$;
select public.social_make_friends(pg_temp.u('a'), pg_temp.u('b'));
select public.social_make_friends(pg_temp.u('a'), pg_temp.u('c'));

create temp table t_v (k text primary key, v bigint);
create function pg_temp.v(p text) returns bigint language sql stable as $$ select v from t_v where k = p $$;
create function pg_temp.dm(p text, q text) returns bigint language sql stable as $$
  select id from public.conversations where pair_key = public.msg_pair_key(pg_temp.u(p), pg_temp.u(q)) $$;
create function pg_temp.rec_msgs(p_conv bigint, p_rec bigint) returns setof public.messages language sql stable as $$
  select * from public.messages where conv_id = p_conv and card_type = 'rec' and (card_ref ->> 'recId')::bigint = p_rec $$;

-- Un grupo con las tres (para comprobar que ahí no sale nada).
insert into t_v values ('g', (public.msg_create_group(pg_temp.u('a'), 'Cine', array[pg_temp.u('b'), pg_temp.u('c')]) ->> 'id')::bigint);

-- ================================================================ al recomendar
select ok(pg_temp.dm('a', 'b') is null, 'antes: a y b no tienen 1:1');
insert into t_v values ('r1', (public.social_rec_send(pg_temp.u('a'), 'movie', 693134, 'Dune: Parte dos', '/dune.jpg',
  array[pg_temp.u('b'), pg_temp.u('c')], 'Tienes que verla') ->> 'rec_id')::bigint);
select ok(pg_temp.v('r1') is not null, 'F4 envía como siempre');
select ok(pg_temp.dm('a', 'b') is not null, 'se crea el 1:1 a–b');
select is((select count(*)::int from pg_temp.rec_msgs(pg_temp.dm('a', 'b'), pg_temp.v('r1'))), 1, 'una tarjeta en el 1:1 con b');
select is((select count(*)::int from pg_temp.rec_msgs(pg_temp.dm('a', 'c'), pg_temp.v('r1'))), 1, 'y otra en el 1:1 con c');
select is((select count(*)::int from public.messages where conv_id = pg_temp.v('g') and card_type = 'rec'), 0, 'en el grupo, nada');
select is((select author_id from pg_temp.rec_msgs(pg_temp.dm('a', 'b'), pg_temp.v('r1'))), pg_temp.u('a'), 'la autora es quien la envía');
select is((select body from pg_temp.rec_msgs(pg_temp.dm('a', 'b'), pg_temp.v('r1'))), 'Tienes que verla', 'el mensaje de F4 es el comentario');
select is((select card_ref from pg_temp.rec_msgs(pg_temp.dm('a', 'b'), pg_temp.v('r1'))),
  jsonb_build_object('recId', pg_temp.v('r1'), 'targetType', 'movie', 'targetId', 693134, 'title', 'Dune: Parte dos', 'image', '/dune.jpg'),
  'card_ref: la copia de lo recomendado (sin estado)');
select is(public.msg_unread_total(pg_temp.u('b')), 1, 'a b le cuenta como sin leer');
select is(public.msg_unread_total(pg_temp.u('a')), 0, 'a quien la envía, no');
select is((public.msg_history(pg_temp.u('b'), pg_temp.dm('a', 'b')) -> 'messages' -> -1 -> 'card' ->> 'type'), 'rec', 'b la ve en su historial');

-- Sin mensaje en F4 → tarjeta sin comentario.
insert into t_v values ('r2', (public.social_rec_send(pg_temp.u('a'), 'tv', 95396, 'Severance', null, array[pg_temp.u('b')], null) ->> 'rec_id')::bigint);
select is((select body from pg_temp.rec_msgs(pg_temp.dm('a', 'b'), pg_temp.v('r2'))), '', 'sin mensaje → body vacío');

-- No amigos: F4 la rechaza y no aparece nada.
select is(public.social_rec_send(pg_temp.u('b'), 'movie', 1, 'X', null, array[pg_temp.u('c')], null) ->> 'error', 'not_friends', 'b → c (no amigas): F4 la rechaza');
select ok(pg_temp.dm('b', 'c') is null, 'y no se crea ningún 1:1');

-- ================================================================ Deshacer de F4
select is(public.social_rec_withdraw(pg_temp.u('a'), pg_temp.v('r2')) ->> 'ok', 'true', 'retirar r2 (nadie había hecho nada)');
select ok((select deleted_at is not null and body is null from public.messages where card_type = 'rec' and (card_ref ->> 'recId')::bigint = pg_temp.v('r2')),
  'su tarjeta queda borrada');
select is((public.msg_history(pg_temp.u('b'), pg_temp.dm('a', 'b')) -> 'messages' -> -1 -> 'card'), 'null'::jsonb, 'b ya no ve la tarjeta');

-- r1: b la añade a Pendientes; al retirar, solo se retira para c.
select is(public.social_rec_act(pg_temp.u('b'), pg_temp.v('r1'), 'added'), 'ok', 'b la añade');
select is(public.social_rec_withdraw(pg_temp.u('a'), pg_temp.v('r1')) ->> 'error', 'answered', 'retirar r1: b ya actuó');
select ok((select deleted_at is null from pg_temp.rec_msgs(pg_temp.dm('a', 'b'), pg_temp.v('r1'))), 'la tarjeta de b se queda');
select ok((select deleted_at is not null from pg_temp.rec_msgs(pg_temp.dm('a', 'c'), pg_temp.v('r1'))), 'la de c se borra');

-- ================================================================ borrar desde el chat
select is(public.msg_delete(pg_temp.u('a'), (select id from pg_temp.rec_msgs(pg_temp.dm('a', 'b'), pg_temp.v('r1')))), 'ok', 'a borra la tarjeta en el chat');
select is((select status from public.recommendation_recipients where rec_id = pg_temp.v('r1') and to_id = pg_temp.u('b')), 'added',
  'la recomendación de F4 sigue ahí');

select ok(not has_function_privilege('authenticated', 'public.msg_on_rec_recipient()', 'execute'), 'permisos: el trigger no se puede llamar');

select * from finish();
rollback;
