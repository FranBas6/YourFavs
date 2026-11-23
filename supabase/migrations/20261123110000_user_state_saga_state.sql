-- Avisos de sagas (C3.7, 2026-11-23): memoria por usuario de qué películas tenía cada saga que sigues y
-- con qué fecha, para avisar de lo nuevo sin soltar de golpe lo de siempre
-- (`services/notifications/sagaSignals.ts`). Como 'notif_series_state', va en `user_state` con una clave
-- nueva: 'notif_saga_state'. Solo hay que ampliar la lista de claves válidas.

alter table public.user_state drop constraint if exists user_state_key_check;
alter table public.user_state add constraint user_state_key_check
    check (key in ('taste', 'notif_provider_state', 'notif_sync', 'notif_series_state', 'notif_saga_state'));
