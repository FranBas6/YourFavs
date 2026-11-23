-- Avisos de series (B, 2026-11-23): memoria por usuario de qué episodio era el último emitido y cuál el
-- próximo anunciado de cada serie que mira la campana (`services/notifications/titleSignals.ts`,
-- `seriesSignals`). Se guarda como el resto del estado suelto de avisos, en `user_state`, con una clave
-- nueva: 'notif_series_state'. Solo hay que ampliar la lista de claves válidas.

alter table public.user_state drop constraint if exists user_state_key_check;
alter table public.user_state add constraint user_state_key_check
    check (key in ('taste', 'notif_provider_state', 'notif_sync', 'notif_series_state'));
