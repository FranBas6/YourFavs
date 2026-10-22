-- Pruebas de «Plan para verla» (migración 20261101090000_messages_plans.sql, handoff M5 §2).
-- Uso: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- a es amiga de b, c y d. Grupo de a con b, c y d; 1:1 a–b.
create temp table t_users (n text primary key, id uuid not null default gen_random_uuid());
insert into t_users (n) select unnest(array['a','b','c','d','z']);
insert into auth.users (id, email, aud, role)
select id, 'plantest-' || n || '@example.com', 'authenticated', 'authenticated' from t_users;
create function pg_temp.u(p text) returns uuid language sql stable as $$ select id from t_users where n = p $$;
select public.social_make_friends(pg_temp.u('a'), id) from t_users where n in ('b','c','d');

create temp table t_v (k text primary key, v bigint);
create function pg_temp.v(p text) returns bigint language sql stable as $$ select v from t_v where k = p $$;
insert into t_v values ('g', (public.msg_create_group(pg_temp.u('a'), 'Viernes', array[pg_temp.u('b'), pg_temp.u('c'), pg_temp.u('d')]) ->> 'id')::bigint);
insert into t_v values ('ab', (public.msg_open_direct(pg_temp.u('a'), pg_temp.u('b')) ->> 'id')::bigint);

create function pg_temp.ref(p_id int default 976893) returns jsonb language sql as $$
  select jsonb_build_object('mediaType', 'movie', 'tmdbId', p_id, 'title', 'Perfect Days', 'poster', '/p.jpg') $$;
create function pg_temp.tomorrow() returns date language sql stable as $$ select public.plan_today() + 1 $$;

-- ================================================================ proponer
create temp table t_r as select public.plan_propose(pg_temp.u('a'), pg_temp.v('g'), pg_temp.ref(), pg_temp.tomorrow(), '21:30', '  en casa  de Ana ', 'plus') as r;
select is((select r ->> 'ok' from t_r), 'true', 'proponer: ok');
insert into t_v values ('p', (select (r ->> 'plan_id')::bigint from t_r));
select is((select note from watch_plans where id = pg_temp.v('p')), 'en casa de Ana', 'la nota, recortada y sin dobles espacios');
select is((select card_type || ':' || (card_ref ->> 'planId') from messages where id = (select message_id from watch_plans where id = pg_temp.v('p'))),
  'plan:' || pg_temp.v('p'), 'la tarjeta es un mensaje plan con su id');
select is((select answer from watch_plan_rsvps where plan_id = pg_temp.v('p') and user_id = pg_temp.u('a')), 'yes', 'quien lo propone, va');
select is(public.msg_unread_total(pg_temp.u('b')), 1, 'para los demás cuenta como sin leer');

select is(public.plan_propose(pg_temp.u('a'), pg_temp.v('g'), pg_temp.ref(1), public.plan_today() - 1, null, null) ->> 'error', 'past_date', 'ayer: no');
select is(public.plan_propose(pg_temp.u('a'), pg_temp.v('g'), pg_temp.ref(1), public.plan_today(), '00:00', null) ->> 'error', 'past_date', 'hoy a una hora pasada: no');
select is(public.plan_propose(pg_temp.u('a'), pg_temp.v('g'), pg_temp.ref(1), public.plan_today(), null, null) ->> 'ok', 'true', 'hoy sin hora: sí');
select is(public.plan_propose(pg_temp.u('a'), pg_temp.v('g'), pg_temp.ref(2), pg_temp.tomorrow(), null, repeat('x', 81)) ->> 'error', 'note', 'nota de 81: no');
select is(public.plan_propose(pg_temp.u('a'), pg_temp.v('g'), pg_temp.ref(), pg_temp.tomorrow() + 3, null, null) ->> 'error', 'exists', 'otro plan sin pasar del mismo título: exists');
select is(public.plan_propose(pg_temp.u('z'), pg_temp.v('g'), pg_temp.ref(3), pg_temp.tomorrow(), null, null) ->> 'error', 'none', 'quien no está: none');
select is(public.plan_propose(pg_temp.u('a'), pg_temp.v('g'), '{"mediaType":"person","tmdbId":1,"title":"X"}', pg_temp.tomorrow(), null, null) ->> 'error', 'title', 'no es película ni serie: title');

-- ================================================================ responder
select is(public.plan_rsvp(pg_temp.u('b'), pg_temp.v('p'), 'yes'), 'ok', 'b: voy');
select is(public.plan_rsvp(pg_temp.u('c'), pg_temp.v('p'), 'no'), 'ok', 'c: no puedo');
select is(public.plan_rsvp(pg_temp.u('a'), pg_temp.v('p'), 'no'), 'owner', 'quien lo propone no responde');
select is(public.plan_rsvp(pg_temp.u('z'), pg_temp.v('p'), 'yes'), 'none', 'quien no está: none');
select is(public.plan_rsvp(pg_temp.u('b'), pg_temp.v('p'), 'maybe'), 'none', 'solo yes/no');
select is((select count(*)::int from messages where conv_id = pg_temp.v('g') and kind = 'system' and sys ->> 'type' like 'plan%'), 0,
  'responder no escribe en el chat');

-- ================================================================ tarjetas
create temp table t_c as select jsonb_array_elements(public.plan_cards(pg_temp.u('d'), array[pg_temp.v('p')])) as c;
select is((select jsonb_array_length(c -> 'answers') from t_c), 3, 'tarjeta: a, b y c han respondido');
select is((select jsonb_array_length(c -> 'members') from t_c), 4, 'tarjeta: las 4 personas (d sin responder)');
select is((select count(*)::int from jsonb_array_elements(public.plan_cards(pg_temp.u('z'), array[pg_temp.v('p')]))), 0, 'quien no está no ve el plan');

-- ================================================================ cambiar
select is(public.plan_change(pg_temp.u('b'), pg_temp.v('p'), pg_temp.tomorrow() + 1, null, false, null, false), 'not_owner', 'solo quien lo propone cambia');
select is(public.plan_change(pg_temp.u('a'), pg_temp.v('p'), public.plan_today() - 2, null, false, null, false), 'past_date', 'no a un día pasado');
select is(public.plan_change(pg_temp.u('a'), pg_temp.v('p'), pg_temp.tomorrow() + 1, '22:00', true, null, false), 'ok', 'a lo cambia al día siguiente a las 22:00');
select is((select prev_date = pg_temp.tomorrow() and prev_time = '21:30' from watch_plans where id = pg_temp.v('p')), true, 'guarda el «Antes»');
select is((select string_agg(answer, ',' order by answer) from watch_plan_rsvps where plan_id = pg_temp.v('p')), 'no,yes,yes', 'las respuestas se mantienen');
select is((select count(*)::int from messages where conv_id = pg_temp.v('g') and sys ->> 'type' = 'plan_changed'), 1, 'cambiar deja una línea de sistema');
select is((select string_agg((select n from t_users where id = user_id), ',' order by user_id) from notifications where type = 'plan_changed'),
  'b', 'aviso solo a quien dijo «Voy» (b), ni a quien cambia ni a quien no puede');
select is(public.plan_change(pg_temp.u('a'), pg_temp.v('p'), null, null, false, 'en casa de Carla', true), 'ok', 'cambiar solo la nota');
select is((select count(*)::int from messages where conv_id = pg_temp.v('g') and sys ->> 'type' = 'plan_changed'), 1, 'la nota no deja línea');
select is(public.plan_change(pg_temp.u('a'), pg_temp.v('p'), null, null, false, 'en casa de Carla', true), 'same', 'sin cambios: same');

-- ================================================================ salir del grupo
select is(public.msg_leave(pg_temp.u('b'), pg_temp.v('g')), 'ok', 'b sale del grupo');
select ok(not exists (select 1 from watch_plan_rsvps where plan_id = pg_temp.v('p') and user_id = pg_temp.u('b')), 'su respuesta se borra');

-- ================================================================ cancelar
delete from notifications where type like 'plan%';
select is(public.plan_rsvp(pg_temp.u('d'), pg_temp.v('p'), 'yes'), 'ok', 'd: voy');
select is(public.plan_cancel(pg_temp.u('c'), pg_temp.v('p')), 'not_owner', 'solo quien lo propone cancela');
select is(public.plan_cancel(pg_temp.u('a'), pg_temp.v('p')), 'ok', 'a cancela');
select is((select count(*)::int from messages where conv_id = pg_temp.v('g') and sys ->> 'type' = 'plan_cancelled'), 1, 'línea de sistema de cancelación');
select is((select string_agg((select n from t_users where id = user_id), ',') from notifications where type = 'plan_cancelled'), 'd', 'aviso solo a d (va), no a c');
select is(public.plan_rsvp(pg_temp.u('d'), pg_temp.v('p'), 'no'), 'closed', 'cancelado: ya no se responde');
select is(public.plan_change(pg_temp.u('a'), pg_temp.v('p'), pg_temp.tomorrow() + 5, null, false, null, false), 'closed', 'ni se cambia');
-- Cancelado, ya se puede proponer otro del mismo título.
select is(public.plan_propose(pg_temp.u('a'), pg_temp.v('g'), pg_temp.ref(), pg_temp.tomorrow(), null, null) ->> 'ok', 'true', 'tras cancelar, otro plan del mismo título');

-- ================================================================ ¿La visteis?
select is(public.plan_seen(pg_temp.u('a'), pg_temp.v('p')), 'ok', 'quien iba contesta «¿La visteis?»');
select is(public.plan_seen(pg_temp.u('c'), pg_temp.v('p')), 'none', 'quien no iba: none');

-- 1:1 en solo lectura (dejan de ser amigos): no se propone.
update public.friendships set ended_at = now() where (a_id = pg_temp.u('a') and b_id = pg_temp.u('b')) or (a_id = pg_temp.u('b') and b_id = pg_temp.u('a'));
select is(public.plan_propose(pg_temp.u('a'), pg_temp.v('ab'), pg_temp.ref(5), pg_temp.tomorrow(), null, null) ->> 'error', 'read_only', '1:1 en solo lectura: no');

select ok(not has_function_privilege('authenticated', 'public.plan_propose(uuid, bigint, jsonb, date, time, text, text, integer, integer)', 'execute'), 'permisos: solo el servidor');
select ok(not has_function_privilege('anon', 'public.plan_cards(uuid, bigint[])', 'execute'), 'permisos: tarjetas, solo el servidor');

select * from finish();
rollback;
