-- =====================================================================================
-- YourFavs · Mensajes M4b: las recomendaciones de F4 también salen en el chat
-- (docs/Mensajes/design_handoff_m4/README.md §2.1 «Recomendaciones de F4»).
--
-- F4 no cambia: se recomienda igual, se avisa igual en la campana y se actúa igual. Además, por
-- cada destinatario, una TARJETA en el 1:1 entre quien la envía y esa persona (se crea si no
-- existía), con el mensaje de F4 como comentario y quien la envía como autor. En los grupos NUNCA
-- (delante de terceros se rompería la privacidad de F4).
--
--   · La tarjeta guarda una copia de lo recomendado (`card_ref`) para pintar sin más consultas; el
--     estado (pendiente, añadida, «Enviada»…) se calcula al pintar con las reglas de F4, nunca se guarda.
--   · Retirar (el Deshacer de F4) borra también la tarjeta de quien deja de tenerla («Mensaje
--     eliminado», como cualquier borrado: así el chat abierto lo ve al momento).
--   · Borrar la tarjeta desde el chat NO retira la recomendación (duda 11 del handoff).
--   · Nada de esto puede tumbar una recomendación: si el chat falla, F4 sigue (se traga el error).
-- =====================================================================================

create index messages_rec_card on public.messages (((card_ref ->> 'recId')::bigint)) where card_type = 'rec';

-- -------------------------------------------------------------------------------------
-- Destinatario nuevo → tarjeta en vuestro 1:1.
-- -------------------------------------------------------------------------------------
create function public.msg_on_rec_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec  public.recommendations;
  v_open jsonb;
  v_conv bigint;
  v_msg  public.messages;
begin
  select * into v_rec from public.recommendations where id = new.rec_id;
  if v_rec.id is null then return null; end if;
  v_open := public.msg_open_direct(v_rec.from_id, new.to_id);
  if not coalesce((v_open ->> 'ok')::boolean, false) then return null; end if;
  v_conv := (v_open ->> 'id')::bigint;

  insert into public.messages (conv_id, author_id, body, card_type, card_ref)
  values (v_conv, v_rec.from_id, coalesce(v_rec.message, ''), 'rec', jsonb_strip_nulls(jsonb_build_object(
    'recId', v_rec.id, 'targetType', v_rec.target_type, 'targetId', v_rec.target_id,
    'title', v_rec.title, 'image', v_rec.image_path)))
  returning * into v_msg;
  update public.conversations set last_msg_at = v_msg.created_at where id = v_conv;
  -- Lo que envías tú no te cuenta como sin leer.
  update public.conversation_members set last_read_id = greatest(coalesce(last_read_id, 0), v_msg.id), last_read_at = now()
  where conv_id = v_conv and user_id = v_rec.from_id;
  return null;
exception when others then
  return null;  -- F4 manda: sin tarjeta en el chat, la recomendación se guarda igual
end;
$$;
create trigger msg_on_rec_recipient after insert on public.recommendation_recipients
for each row execute function public.msg_on_rec_recipient();

-- -------------------------------------------------------------------------------------
-- Destinatario retirado (Deshacer de F4, o la recomendación entera) → su tarjeta, borrada.
-- -------------------------------------------------------------------------------------
create function public.msg_on_rec_recipient_gone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.messages m set deleted_at = now(), body = null, undo_md5 = null
  where m.card_type = 'rec' and (m.card_ref ->> 'recId')::bigint = old.rec_id and m.deleted_at is null
    and exists (select 1 from public.conversation_members cm join public.conversations c on c.id = cm.conv_id
                where cm.conv_id = m.conv_id and cm.user_id = old.to_id and c.kind = 'direct');
  return null;
exception when others then
  return null;
end;
$$;
create trigger msg_on_rec_recipient_gone after delete on public.recommendation_recipients
for each row execute function public.msg_on_rec_recipient_gone();

-- Una tarjeta de recomendación siempre lleva a cuál apunta y su título (para la vista previa de la lista).
alter table public.messages add constraint messages_rec_card_ref
  check (card_type is distinct from 'rec' or (card_ref ? 'recId' and card_ref ? 'title'));

revoke all on function public.msg_on_rec_recipient()      from public, anon, authenticated;
revoke all on function public.msg_on_rec_recipient_gone() from public, anon, authenticated;
