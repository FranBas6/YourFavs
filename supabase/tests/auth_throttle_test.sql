-- Límite de intentos (QA 5.2): la cuenta sube, bloquea al llegar al máximo, se reinicia al caducar la
-- ventana y nadie con sesión (ni sin ella) puede tocarla.
begin;
create extension if not exists pgtap;
select plan(9);

select is(public.auth_throttle_blocked('t:a', 900, 3), false, 'sin intentos, no bloquea');
select is(public.auth_throttle_hit('t:a', 900), 1, 'primer intento: 1');
select is(public.auth_throttle_hit('t:a', 900), 2, 'segundo intento: 2');
select is(public.auth_throttle_hit('t:a', 900), 3, 'tercer intento: 3');
select is(public.auth_throttle_blocked('t:a', 900, 3), true, 'con 3 de 3, bloquea');

update public.auth_throttle set window_start = now() - interval '20 minutes' where key = 't:a';
select is(public.auth_throttle_blocked('t:a', 900, 3), false, 'ventana caducada: ya no bloquea');
select is(public.auth_throttle_hit('t:a', 900), 1, 'ventana caducada: la cuenta empieza de nuevo');

select public.auth_throttle_clear('t:a');
select is((select count(*)::int from public.auth_throttle where key = 't:a'), 0, 'clear la borra');

set local role authenticated;
select throws_ok($$ select public.auth_throttle_hit('t:b', 900) $$, '42501', null, 'un usuario con sesión no puede sumar intentos');
reset role;

select * from finish();
rollback;
