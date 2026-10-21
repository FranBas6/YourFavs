-- =====================================================================================
-- YourFavs · Mensajes M3: tiempo real (docs/Mensajes/PLAN_MENSAJES.md, «Resultado de M0», opción A).
--
-- Cada persona tiene una clave aleatoria (`profiles.rt_key`) y escucha un canal PÚBLICO de Realtime
-- llamado `u:{rt_key}`: solo lo oye quien conoce el nombre, que solo se le da a su dueño. Por ese
-- canal no viaja contenido, solo «avisos vacíos»:
--   · {c: id}  hay algo nuevo en la conversación id (mensaje, borrado, «Visto», alguien entra o sale)
--   · {n: 1}   hay algo nuevo en la campana (y en el rojo de solicitudes)
-- El navegador, al oír uno, pide lo de siempre al servidor. Si alguien robara el nombre del canal,
-- solo vería esos avisos (y como mucho podría mandar avisos falsos, que solo hacen refrescar).
--
-- El tiempo real nunca tumba nada: si Realtime falla, el error se traga y el mensaje se guarda
-- igual (el navegador sigue con el sondeo de M1).
-- =====================================================================================

alter table public.profiles add column rt_key uuid not null default gen_random_uuid();
create unique index profiles_rt_key on public.profiles (rt_key);

-- Aviso vacío al canal de cada una de esas personas.
create function public.rt_ping(p_users uuid[], p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key uuid;
begin
  for v_key in select rt_key from public.profiles where id = any (p_users) loop
    perform realtime.send(p_payload, 'ping', 'u:' || v_key::text, false);
  end loop;
exception when others then
  null;  -- sin tiempo real, el sondeo lo trae igual
end;
$$;

-- Mensaje nuevo, borrado o restaurado: a quien está dentro y, en los de sistema, también a quien
-- nombran (al que quitan del grupo, para que desaparezca de su lista en el acto).
create function public.rt_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.rt_ping(
    array(
      select user_id from public.conversation_members where conv_id = new.conv_id and left_at is null
      union
      select (t.v #>> '{}')::uuid from jsonb_array_elements(coalesce(new.sys -> 'targets', '[]'::jsonb)) t(v)),
    jsonb_build_object('c', new.conv_id));
  return null;
exception when others then
  return null;
end;
$$;
create trigger rt_on_message after insert or update of deleted_at, body on public.messages
for each row execute function public.rt_on_message();

-- «Visto» en un 1:1: cuando lees, a la otra persona.
create function public.rt_on_read()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_read_id is distinct from old.last_read_id
     and exists (select 1 from public.conversations where id = new.conv_id and kind = 'direct') then
    perform public.rt_ping(
      array(select user_id from public.conversation_members where conv_id = new.conv_id and user_id <> new.user_id),
      jsonb_build_object('c', new.conv_id));
  end if;
  return null;
exception when others then
  return null;
end;
$$;
create trigger rt_on_read after update of last_read_id on public.conversation_members
for each row execute function public.rt_on_read();

-- Campana: aviso nuevo (seguidores, solicitudes, recomendaciones…).
create function public.rt_on_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.rt_ping(array[new.user_id], jsonb_build_object('n', 1));
  return null;
exception when others then
  return null;
end;
$$;
create trigger rt_on_notification after insert on public.notifications
for each row execute function public.rt_on_notification();

revoke all on function public.rt_ping(uuid[], jsonb)   from public, anon, authenticated;
revoke all on function public.rt_on_message()          from public, anon, authenticated;
revoke all on function public.rt_on_read()             from public, anon, authenticated;
revoke all on function public.rt_on_notification()     from public, anon, authenticated;
