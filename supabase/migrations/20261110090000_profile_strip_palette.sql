-- Rediseño, Fase 9 · 9.4 (Apariencia): paleta de la tira de episodios de las fichas de serie.
-- Se guarda en el perfil (como el tema) para que viaje entre dispositivos. NULL = la de siempre (azul).
alter table public.profiles
  add column if not exists strip_palette text
  check (strip_palette in ('azul', 'verde', 'semaforo', 'grisverde', 'verde987', 'contorno'));

comment on column public.profiles.strip_palette is
  'Paleta de la tira de episodios (Ajustes → Apariencia). NULL = azul (por defecto).';
