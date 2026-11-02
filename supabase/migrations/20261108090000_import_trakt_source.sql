-- Lote F2 (2026-11-02): importar desde una cuenta de Trakt. La tabla de importaciones solo admitía
-- IMDb, Letterboxd y TMDB como origen; se añade Trakt (la restricción se rehace con el mismo nombre).
alter table public.import_jobs drop constraint if exists import_jobs_source_check;
alter table public.import_jobs add constraint import_jobs_source_check
  check (source in ('imdb', 'letterboxd', 'tmdb', 'trakt'));
