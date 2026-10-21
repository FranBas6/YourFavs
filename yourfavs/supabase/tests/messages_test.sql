-- Pruebas de las reglas de mensajes (migración 20261025090000_messages.sql, handoff §2.2).
-- Uso: npx supabase test db   (todo dentro de una transacción que se deshace al final)
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- ---------------------------------------------------------------- personas
-- a es amiga de b..l; z no es amiga de nadie. Nombres → uuid con pg_temp.u('a').
create temp table t_users (n text primary key, id uuid not null default gen_random_uuid());
insert into t_users (n) select unnest(array['a','b','c','d','e','f','g','h','i','j','k','l','z']);
insert into auth.users (id, email, aud, role)
select id, 'msgtest-' || n || '@example.com', 'authenticated', 'authenticated' from t_users;
create function pg_temp.u(p text) returns uuid language sql stable as $$ select id from t_users where n = p $$;
select public.social_make_friends(pg_temp.u('a'), id) from t_users where n not in ('a', 'z');
select public.social_make_friends(pg_temp.u('b'), pg_temp.u('c'));

create temp table t_v (k text primary key, v bigint);
create function pg_temp.v(p text) returns bigint language sql stable as $$ select v from t_v where k = p $$;
create function pg_temp.hist(p_me text, p_conv bigint) returns jsonb language sql as $$
  select public.msg_history(pg_temp.u(p_me), p_conv, null, null, null, 50) $$;

-- ================================================================ openDirect
insert into t_v values ('ab', (public.msg_open_direct(pg_temp.u('a'), pg_temp.u('b')) ->> 'id')::bigint);
select ok(pg_temp.v('ab') is not null, 'open_direct: amigos → crea el 1:1');
select is((public.msg_open_direct(pg_temp.u('a'), pg_temp.u('b')) ->> 'id')::bigint, pg_temp.v('ab'), 'open_direct: la segunda vez devuelve el mismo');
select is((public.msg_open_direct(pg_temp.u('b'), pg_temp.u('a')) ->> 'id')::bigint, pg_temp.v('ab'), 'open_direct: desde el otro lado, el mismo');
select is(public.msg_open_direct(pg_temp.u('a'), pg_temp.u('z')) ->> 'error', 'not_friends', 'open_direct: no amigos → not_friends');
select is(public.msg_open_direct(pg_temp.u('a'), pg_temp.u('a')) ->> 'error', 'not_friends', 'open_direct: contigo → not_friends');

-- ================================================================ send
select is(public.msg_send(pg_temp.u('a'), pg_temp.v('ab'), '  hola  ', 'aaaaaaaa-0000-0000-0000-000000000001') #>> '{message,body}', 'hola', 'send: guarda el texto recortado');
select is(
  public.msg_send(pg_temp.u('a'), pg_temp.v('ab'), 'hola', 'aaaaaaaa-0000-0000-0000-000000000001') #>> '{message,id}',
  public.msg_send(pg_temp.u('a'), pg_temp.v('ab'), 'otra cosa', 'aaaaaaaa-0000-0000-0000-000000000001') #>> '{message,id}',
  'send: mismo clientId → mismo mensaje (reintento idempotente)');
select is((select count(*)::int from messages where conv_id = pg_temp.v('ab')), 1, 'send: el reintento no duplica');
select is(public.msg_send(pg_temp.u('a'), pg_temp.v('ab'), '   ', null) ->> 'error', 'empty', 'send: vacío tras recortar → empty');
select is(public.msg_send(pg_temp.u('a'), pg_temp.v('ab'), repeat('x', 2001), null) ->> 'error', 'too_long', 'send: 2.001 → too_long');
select is(public.msg_send(pg_temp.u('a'), pg_temp.v('ab'), repeat('x', 2000), null) ->> 'ok', 'true', 'send: 2.000 cabe');
select is(public.msg_send(pg_temp.u('z'), pg_temp.v('ab'), 'intruso', null) ->> 'error', 'none', 'send: quien no es miembro → none');
insert into t_v values ('b1', (public.msg_send(pg_temp.u('b'), pg_temp.v('ab'), 'te leo', null) #>> '{message,id}')::bigint);

-- ================================================================ unread / read / mute / visto
select is(public.msg_unread_total(pg_temp.u('a')), 1, 'unread: a tiene 1 sin leer (el de b)');
select is(public.msg_unread_total(pg_temp.u('b')), 0, 'unread: enviar cuenta como leído');
select is((pg_temp.hist('a', pg_temp.v('ab')) ->> 'seen_id')::bigint, pg_temp.v('b1'), 'visto: a ve hasta dónde leyó b');
select ok(pg_temp.hist('a', pg_temp.v('ab')) ->> 'seen_at' is not null, 'visto: y cuándo');
select '· ' || (public.msg_read(pg_temp.u('a'), pg_temp.v('ab'), 999999999))::text;
select is((select last_read_id from conversation_members where conv_id = pg_temp.v('ab') and user_id = pg_temp.u('a')),
          (select max(id) from messages where conv_id = pg_temp.v('ab')), 'read: nunca más allá del último mensaje');
select '· ' || (public.msg_read(pg_temp.u('a'), pg_temp.v('ab'), 1))::text;
select is((select last_read_id from conversation_members where conv_id = pg_temp.v('ab') and user_id = pg_temp.u('a')),
          (select max(id) from messages where conv_id = pg_temp.v('ab')), 'read: nunca hacia atrás');
select '· ' || (public.msg_send(pg_temp.u('b'), pg_temp.v('ab'), 'otro', null))::text;
select is(public.msg_unread_total(pg_temp.u('a')), 1, 'unread: llega otro');
select is(public.msg_mute(pg_temp.u('a'), pg_temp.v('ab'), true), 'ok', 'mute: ok');
select is(public.msg_unread_total(pg_temp.u('a')), 0, 'mute: silenciada no suma al total');
select is((public.msg_list(pg_temp.u('a')) -> 0 ->> 'unread')::int, 1, 'mute: la fila sigue sabiendo que hay 1');
select '· ' || (public.msg_mute(pg_temp.u('a'), pg_temp.v('ab'), false))::text;

-- ================================================================ delete / restore
insert into t_v values ('m_del', (public.msg_send(pg_temp.u('a'), pg_temp.v('ab'), 'me arrepiento', null) #>> '{message,id}')::bigint);
select is(public.msg_delete(pg_temp.u('b'), pg_temp.v('m_del')), 'none', 'delete: solo el autor');
select is(public.msg_delete(pg_temp.u('a'), pg_temp.v('m_del')), 'ok', 'delete: el autor');
select is((select body from messages where id = pg_temp.v('m_del')), null, 'delete: el texto se va al momento');
select is((select m ->> 'deleted' from jsonb_array_elements(pg_temp.hist('b', pg_temp.v('ab')) -> 'messages') m
           where (m ->> 'id')::bigint = pg_temp.v('m_del')), 'true', 'delete: el otro lo ve como eliminado');
select is(public.msg_restore(pg_temp.u('a'), pg_temp.v('m_del'), 'otro texto'), 'expired', 'restore: con otro texto no (sería editar)');
select is(public.msg_restore(pg_temp.u('a'), pg_temp.v('m_del'), 'me arrepiento'), 'ok', 'restore: con el mismo texto, sí');
select is((select body from messages where id = pg_temp.v('m_del')), 'me arrepiento', 'restore: vuelve el texto');
select '· ' || (public.msg_delete(pg_temp.u('a'), pg_temp.v('m_del')))::text;
update messages set deleted_at = now() - interval '11 seconds' where id = pg_temp.v('m_del');
select is(public.msg_restore(pg_temp.u('a'), pg_temp.v('m_del'), 'me arrepiento'), 'expired', 'restore: pasados 10 s, no');

-- ================================================================ report
select is(public.msg_report(pg_temp.u('b'), pg_temp.v('b1'), 'spam', null), 'none', 'report: el tuyo no');
select is(public.msg_report(pg_temp.u('a'), pg_temp.v('b1'), 'harassment', '  feo  '), 'ok', 'report: ajeno y visible');
select is((select note || '|' || body from message_reports where message_id = pg_temp.v('b1')), 'feo|te leo', 'report: guarda nota y copia del texto');
select is(public.msg_report(pg_temp.u('a'), pg_temp.v('b1'), 'spam', null), 'already', 'report: una vez por persona');
select is(public.msg_report(pg_temp.u('z'), pg_temp.v('b1'), 'spam', null), 'none', 'report: quien no lo ve, no');
select is(public.msg_report(pg_temp.u('b'), pg_temp.v('m_del'), 'spam', null), 'none', 'report: uno eliminado, no');

-- ================================================================ 1:1 en solo lectura (dejar de ser amigos)
select public.social_unfriend(pg_temp.u('a'), pg_temp.u('b'));
select is(pg_temp.hist('a', pg_temp.v('ab')) ->> 'read_only', 'true', 'read_only: tras dejar de ser amigos (a)');
select is(pg_temp.hist('b', pg_temp.v('ab')) ->> 'read_only', 'true', 'read_only: tras dejar de ser amigos (b)');
select is(public.msg_send(pg_temp.u('b'), pg_temp.v('ab'), 'hola?', null) ->> 'error', 'read_only', 'read_only: no se puede escribir');
select is((public.msg_list(pg_temp.u('b')) -> 0 ->> 'read_only'), 'true', 'read_only: la lista lo marca');
select public.social_make_friends(pg_temp.u('a'), pg_temp.u('b'));
select is(pg_temp.hist('a', pg_temp.v('ab')) ->> 'read_only', 'false', 'read_only: volver a ser amigos lo reabre');

-- ================================================================ bloqueo en 1:1 (idéntico para quien fue bloqueado)
insert into t_v values ('ad', (public.msg_open_direct(pg_temp.u('a'), pg_temp.u('d')) ->> 'id')::bigint);
select '· ' || (public.msg_send(pg_temp.u('d'), pg_temp.v('ad'), 'hola a', null))::text;
select public.social_block(pg_temp.u('a'), pg_temp.u('d'));
select ok(not exists (select 1 from jsonb_array_elements(public.msg_list(pg_temp.u('a'))) c where (c ->> 'id')::bigint = pg_temp.v('ad')),
          'bloqueo: quien bloquea pierde el 1:1 de su lista');
select is(pg_temp.hist('a', pg_temp.v('ad')) ->> 'error', 'none', 'bloqueo: y si lo abre, «no disponible»');
select is(pg_temp.hist('d', pg_temp.v('ad')) ->> 'read_only', 'true', 'bloqueo: quien fue bloqueado lo ve en solo lectura');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.hist('d', pg_temp.v('ad'))) k),
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.hist('b', pg_temp.v('ab'))) k),
  'bloqueo: la respuesta trae los mismos campos que la de «no amigos»');
select is(public.msg_send(pg_temp.u('d'), pg_temp.v('ad'), 'sigues?', null) ->> 'error', 'read_only', 'bloqueo: mismo error que «no amigos»');
select is(public.msg_open_direct(pg_temp.u('d'), pg_temp.u('a')) ->> 'error', 'not_friends', 'bloqueo: open_direct responde como «no amigos»');
delete from blocks where blocker_id = pg_temp.u('a') and blocked_id = pg_temp.u('d');
select is(pg_temp.hist('a', pg_temp.v('ad')) ->> 'error', 'none', 'desbloquear sin ser amigos: sigue fuera de la lista');
select public.social_make_friends(pg_temp.u('a'), pg_temp.u('d'));
select is(pg_temp.hist('a', pg_temp.v('ad')) ->> 'read_only', 'false', 'volver a ser amigos: vuelve con su historial');
select is(jsonb_array_length(pg_temp.hist('a', pg_temp.v('ad')) -> 'messages'), 1, 'volver a ser amigos: el historial sigue ahí');

-- ================================================================ createGroup
select is(public.msg_create_group(pg_temp.u('a'), '   ', array[pg_temp.u('b'), pg_temp.u('c')]) ->> 'error', 'name', 'create_group: sin nombre → name');
select is(public.msg_create_group(pg_temp.u('a'), repeat('x', 41), array[pg_temp.u('b'), pg_temp.u('c')]) ->> 'error', 'name', 'create_group: 41 caracteres → name');
select is(public.msg_create_group(pg_temp.u('a'), 'Pelis', array[pg_temp.u('b')]) ->> 'error', 'too_few', 'create_group: 1 amigo → too_few');
select is(public.msg_create_group(pg_temp.u('a'), 'Pelis', array[pg_temp.u('b'), pg_temp.u('a')]) ->> 'error', 'too_few', 'create_group: tú no cuentas');
select is(public.msg_create_group(pg_temp.u('a'), 'Pelis', (select array_agg(id) from t_users where n in ('b','c','d','e','f','g','h','i','j','k'))) ->> 'error',
          'too_many', 'create_group: 10 amigos → too_many');
select is(public.msg_create_group(pg_temp.u('a'), 'Pelis', array[pg_temp.u('b'), pg_temp.u('z')]) ->> 'error', 'not_friends', 'create_group: alguien que no es tu amigo → not_friends');
select is(public.msg_create_group(pg_temp.u('b'), 'Pelis', array[pg_temp.u('c'), pg_temp.u('d')]) ->> 'error', 'not_friends', 'create_group: amigos de OTRO no valen');
insert into t_v values ('g', (public.msg_create_group(pg_temp.u('a'), E'Pelis\n del   viernes', array[pg_temp.u('b'), pg_temp.u('c'), pg_temp.u('e')]) ->> 'id')::bigint);
select is((select name from conversations where id = pg_temp.v('g')), 'Pelis del viernes', 'create_group: nombre con espacios colapsados');
select is((select role from conversation_members where conv_id = pg_temp.v('g') and user_id = pg_temp.u('a')), 'admin', 'create_group: quien crea es admin');
select is((select array_agg(sys ->> 'type' order by id) from messages where conv_id = pg_temp.v('g')), array['created', 'added'], 'create_group: mensajes de sistema created + added');
select is(pg_temp.hist('a', pg_temp.v('g')) ->> 'seen_id', null, 'grupo: sin «Visto»');
select is(pg_temp.hist('a', pg_temp.v('g')) ->> 'read_only', 'false', 'grupo: nunca en solo lectura');
select is(public.msg_unread_total(pg_temp.u('c')), 0, 'grupo: los de sistema no cuentan como sin leer');

-- 20 grupos por persona: k ya está en 20
with c as (insert into conversations (kind, name) select 'group', 'relleno ' || g from generate_series(1, 20) g returning id)
insert into conversation_members (conv_id, user_id) select id, pg_temp.u('k') from c;
select is(public.msg_create_group(pg_temp.u('a'), 'Con k', array[pg_temp.u('b'), pg_temp.u('k')]) ->> 'error', 'too_few', 'create_group: si al saltar a k quedan < 2 → too_few');
select is(public.msg_create_group(pg_temp.u('a'), 'Con k', array[pg_temp.u('b'), pg_temp.u('c'), pg_temp.u('k')]) -> 'skipped',
          jsonb_build_array(pg_temp.u('k')), 'create_group: quien está en 20 grupos se salta (skipped)');

-- ================================================================ addMembers / joined_at
select '· ' || (public.msg_send(pg_temp.u('b'), pg_temp.v('g'), 'antes de que entre f', null))::text;
update messages set created_at = now() - interval '1 hour' where conv_id = pg_temp.v('g');  -- todo lo de antes, «hace una hora»
update conversation_members set joined_at = now() - interval '2 hours' where conv_id = pg_temp.v('g');
select is(public.msg_add_members(pg_temp.u('b'), pg_temp.v('g'), array[pg_temp.u('f')]) ->> 'error', 'not_admin', 'add_members: solo admins');
select is(public.msg_add_members(pg_temp.u('a'), pg_temp.v('g'), array[pg_temp.u('z')]) ->> 'error', 'not_friends', 'add_members: solo amigos tuyos');
select is(public.msg_add_members(pg_temp.u('a'), pg_temp.v('g'), array[pg_temp.u('f')]) ->> 'ok', 'true', 'add_members: admin añade a un amigo');
select is(jsonb_array_length(pg_temp.hist('f', pg_temp.v('g')) -> 'messages'), 1, 'joined_at: f solo ve desde que entró (su «added»)');
select is(pg_temp.hist('f', pg_temp.v('g')) #>> '{messages,0,sys,type}', 'added', 'joined_at: y es el de su entrada');
select is(jsonb_array_length(pg_temp.hist('b', pg_temp.v('g')) -> 'messages'), 4, 'joined_at: b lo ve todo');
select is(public.msg_add_members(pg_temp.u('a'), pg_temp.v('g'), (select array_agg(id) from t_users where n in ('g','h','i','j','l'))) ->> 'ok',
          'true', 'add_members: hasta 10');
select is((select count(*)::int from conversation_members where conv_id = pg_temp.v('g') and left_at is null), 10, 'add_members: el grupo tiene 10');
select is(public.msg_add_members(pg_temp.u('a'), pg_temp.v('g'), array[pg_temp.u('d')]) ->> 'error', 'full', 'add_members: el 11.º → full');

-- ================================================================ removeMember
select is(public.msg_remove_member(pg_temp.u('b'), pg_temp.v('g'), pg_temp.u('c')), 'not_admin', 'remove: solo admins');
select is(public.msg_remove_member(pg_temp.u('a'), pg_temp.v('g'), pg_temp.u('a')), 'none', 'remove: a ti no (eso es salir)');
select is(public.msg_remove_member(pg_temp.u('a'), pg_temp.v('g'), pg_temp.u('l')), 'ok', 'remove: admin quita a l');
select is(pg_temp.hist('l', pg_temp.v('g')) ->> 'error', 'left', 'remove: l deja de verlo («Ya no estás en este grupo»)');
select ok(not exists (select 1 from jsonb_array_elements(public.msg_list(pg_temp.u('l'))) c where (c ->> 'id')::bigint = pg_temp.v('g')),
          'remove: y desaparece de su lista');
select is(public.msg_send(pg_temp.u('l'), pg_temp.v('g'), 'sigo?', null) ->> 'error', 'none', 'remove: ya no puede escribir');
select is((select sys ->> 'type' from messages where conv_id = pg_temp.v('g') order by id desc limit 1), 'removed', 'remove: mensaje de sistema');

-- volver a entrar: joined_at nuevo
update messages set created_at = now() - interval '1 minute' where conv_id = pg_temp.v('g') and created_at = now();
select '· ' || (public.msg_add_members(pg_temp.u('a'), pg_temp.v('g'), array[pg_temp.u('l')]))::text;
select is(jsonb_array_length(pg_temp.hist('l', pg_temp.v('g')) -> 'messages'), 1, 'volver a entrar: ve desde la nueva entrada');

-- ================================================================ makeAdmin / rename
select is(public.msg_make_admin(pg_temp.u('b'), pg_temp.v('g'), pg_temp.u('c')), 'not_admin', 'make_admin: solo admins');
select is(public.msg_make_admin(pg_temp.u('a'), pg_temp.v('g'), pg_temp.u('z')), 'none', 'make_admin: quien no está, no');
select is(public.msg_make_admin(pg_temp.u('a'), pg_temp.v('g'), pg_temp.u('c')), 'ok', 'make_admin: admin hace admin a c');
select is((select role from conversation_members where conv_id = pg_temp.v('g') and user_id = pg_temp.u('c')), 'admin', 'make_admin: c es admin');
select is(public.msg_make_admin(pg_temp.u('c'), pg_temp.v('g'), pg_temp.u('b')), 'ok', 'make_admin: un admin nuevo también puede');

-- Avisos de admin: solo quien da el cargo y quien lo recibe (a→c y c→b).
create function pg_temp.admin_seen(p text, p_conv bigint) returns int language sql as $$
  select count(*)::int from jsonb_array_elements(pg_temp.hist(p, p_conv) -> 'messages') m where m #>> '{sys,type}' = 'admin' $$;
select is(pg_temp.admin_seen('a', pg_temp.v('g')), 1, 'aviso de admin: quien da el cargo lo ve (a→c)');
select is(pg_temp.admin_seen('c', pg_temp.v('g')), 2, 'aviso de admin: c ve el que recibió y el que dio');
select is(pg_temp.admin_seen('b', pg_temp.v('g')), 1, 'aviso de admin: quien lo recibe lo ve (c→b)');
select is(pg_temp.admin_seen('e', pg_temp.v('g')), 0, 'aviso de admin: el resto no ve ninguno');
select isnt((select c ->> 'last' from jsonb_array_elements(public.msg_list(pg_temp.u('e'))) c where (c ->> 'id')::bigint = pg_temp.v('g'))::jsonb #>> '{sys,type}',
            'admin', 'aviso de admin: tampoco sale en la vista previa del resto');
select is(public.msg_rename(pg_temp.u('e'), pg_temp.v('g'), 'Otro'), 'not_admin', 'rename: solo admins');
select is(public.msg_rename(pg_temp.u('a'), pg_temp.v('g'), ''), 'name', 'rename: vacío → name');
select is(public.msg_rename(pg_temp.u('a'), pg_temp.v('g'), 'Viernes de pelis'), 'ok', 'rename: ok');
select is((select sys ->> 'name' from messages where conv_id = pg_temp.v('g') order by id desc limit 1), 'Viernes de pelis', 'rename: mensaje de sistema con el nombre');

-- ================================================================ leave + herencia de admin
-- grupo pequeño: a (admin) + e + f; f entra más tarde que e
insert into t_v values ('h', (public.msg_create_group(pg_temp.u('a'), 'Herencia', array[pg_temp.u('e'), pg_temp.u('f')]) ->> 'id')::bigint);
update conversation_members set joined_at = now() - interval '2 hours' where conv_id = pg_temp.v('h') and user_id = pg_temp.u('e');
update conversation_members set joined_at = now() - interval '1 hour' where conv_id = pg_temp.v('h') and user_id = pg_temp.u('f');
select is(public.msg_leave(pg_temp.u('a'), pg_temp.v('ab')), 'none', 'leave: un 1:1 no se «sale»');
select is(public.msg_leave(pg_temp.u('a'), pg_temp.v('h')), 'ok', 'leave: la única admin sale');
select is((select role from conversation_members where conv_id = pg_temp.v('h') and user_id = pg_temp.u('e')), 'admin', 'herencia: pasa a quien lleva más tiempo (e)');
select is((select role from conversation_members where conv_id = pg_temp.v('h') and user_id = pg_temp.u('f')), 'member', 'herencia: f sigue de miembro');
select is((select array_agg(sys ->> 'type' order by id) from (select * from messages where conv_id = pg_temp.v('h') order by id desc limit 2) x),
          array['left', 'admin'], 'herencia: «ha salido» y luego «Ahora e administra»');
select is((select sys ->> 'inherited' from messages where conv_id = pg_temp.v('h') order by id desc limit 1), 'true', 'herencia: marcado como heredado');
select is(pg_temp.admin_seen('e', pg_temp.v('h')), 1, 'herencia: quien hereda ve «Ahora administras el grupo»');
select is(pg_temp.admin_seen('f', pg_temp.v('h')), 0, 'herencia: el resto no lo ve (sí ve «a ha salido»)');
select '· ' || (public.msg_leave(pg_temp.u('e'), pg_temp.v('h')))::text;
select '· ' || (public.msg_leave(pg_temp.u('f'), pg_temp.v('h')))::text;
select ok(not exists (select 1 from conversations where id = pg_temp.v('h')), 'leave: si no queda nadie, el grupo se borra');

-- ================================================================ plegado por bloqueo en grupos
-- en el grupo g: a bloquea a e. Solo a lo ve plegado; e (bloqueada) y los demás, normal.
insert into t_v values ('e1', (public.msg_send(pg_temp.u('e'), pg_temp.v('g'), 'mensaje de e', null) #>> '{message,id}')::bigint);
insert into t_v values ('a1', (public.msg_send(pg_temp.u('a'), pg_temp.v('g'), 'mensaje de a', null) #>> '{message,id}')::bigint);
select public.social_block(pg_temp.u('a'), pg_temp.u('e'));
select is((select m ->> 'folded' || '|' || coalesce(m ->> 'body', '∅') from jsonb_array_elements(pg_temp.hist('a', pg_temp.v('g')) -> 'messages') m
           where (m ->> 'id')::bigint = pg_temp.v('e1')), 'true|∅', 'plegado: quien bloqueó lo ve plegado y sin texto');
select is((select m ->> 'folded' || '|' || (m ->> 'body') from jsonb_array_elements(pg_temp.hist('b', pg_temp.v('g')) -> 'messages') m
           where (m ->> 'id')::bigint = pg_temp.v('e1')), 'false|mensaje de e', 'plegado: los demás lo ven normal');
select is((select m ->> 'folded' || '|' || (m ->> 'body') from jsonb_array_elements(pg_temp.hist('e', pg_temp.v('g')) -> 'messages') m
           where (m ->> 'id')::bigint = pg_temp.v('a1')), 'false|mensaje de a', 'plegado: quien fue bloqueado no nota nada');
select is(public.msg_folded_body(pg_temp.u('a'), pg_temp.v('e1')), 'mensaje de e', 'plegado: «Mostrar» devuelve el texto a quien bloqueó');
select is(public.msg_folded_body(pg_temp.u('b'), pg_temp.v('e1')), null, 'plegado: a nadie más');
select is(public.msg_report(pg_temp.u('a'), pg_temp.v('e1'), 'spam', null), 'ok', 'plegado: se puede reportar');
select ok(exists (select 1 from conversation_members where conv_id = pg_temp.v('g') and user_id = pg_temp.u('e') and left_at is null),
          'plegado: bloquear no saca a nadie del grupo');
select '· ' || (public.msg_read(pg_temp.u('a'), pg_temp.v('g'), pg_temp.v('a1')))::text;
select '· ' || (public.msg_send(pg_temp.u('e'), pg_temp.v('g'), 'otro de e', null))::text;
select is((select (c ->> 'unread')::int from jsonb_array_elements(public.msg_list(pg_temp.u('a'))) c where (c ->> 'id')::bigint = pg_temp.v('g')), 0,
          'plegado: los de quien bloqueaste no suman sin leer');

-- ================================================================ ritmo
select is((select count(*)::int from (select public.msg_send(pg_temp.u('b'), pg_temp.v('g'), 'r' || i, null) ->> 'ok' as ok
                                       from generate_series(1, 40) i) s where ok = 'true') <= 30, true, 'ritmo: como mucho 30 por minuto');
select is(public.msg_send(pg_temp.u('b'), pg_temp.v('g'), 'uno más', null) ->> 'error', 'rate', 'ritmo: el siguiente → rate');

-- ================================================================ sondeo: nuevos + borrados
insert into t_v values ('poll', (select max(id) from messages where conv_id = pg_temp.v('ab')));
select '· ' || (public.msg_delete(pg_temp.u('a'), (select min(id) from messages where conv_id = pg_temp.v('ab') and author_id = pg_temp.u('a') and deleted_at is null)))::text;
insert into t_v values ('n1', (public.msg_send(pg_temp.u('a'), pg_temp.v('ab'), 'nuevo', null) #>> '{message,id}')::bigint);
select is((select jsonb_agg((m ->> 'id')::bigint) from jsonb_array_elements(
             public.msg_history(pg_temp.u('b'), pg_temp.v('ab'), null, pg_temp.v('poll'), 1, 50) -> 'messages') m),
          jsonb_build_array(pg_temp.v('n1')), 'sondeo: con after, solo los nuevos');
select is(jsonb_array_length(public.msg_history(pg_temp.u('b'), pg_temp.v('ab'), null, pg_temp.v('poll'), 1, 50) -> 'deleted_ids') >= 1, true,
          'sondeo: trae los borrados para tacharlos');

-- ================================================================ borrar la cuenta
delete from auth.users where id = pg_temp.u('b');
select ok(not exists (select 1 from conversations where id = pg_temp.v('ab')), 'cuenta borrada: su 1:1 desaparece');
select ok(exists (select 1 from messages where conv_id = pg_temp.v('g') and author_id is null and kind = 'text'),
          'cuenta borrada: en grupos sus mensajes se quedan, sin autor');
select is((select count(*)::int from conversation_members where conv_id = pg_temp.v('g') and role = 'admin' and left_at is null) >= 1, true,
          'cuenta borrada: el grupo sigue teniendo admin');

-- ================================================================ permisos
select ok(not has_function_privilege('authenticated', 'public.msg_send(uuid, bigint, text, uuid, text, jsonb)', 'execute'), 'permisos: authenticated no puede llamar msg_send');
select ok(not has_function_privilege('anon', 'public.msg_list(uuid)', 'execute'), 'permisos: anon no puede llamar msg_list');
select ok(has_function_privilege('service_role', 'public.msg_history(uuid, bigint, bigint, bigint, bigint, integer)', 'execute'), 'permisos: el servidor sí');

select * from finish();
rollback;
