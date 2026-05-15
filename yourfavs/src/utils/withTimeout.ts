/**
 * Carrera entre una promesa y un timeout. Si la promesa no resuelve en `ms`,
 * rechaza con TimeoutError para que el caller pueda renderizar un fallback
 * antes de que Netlify mate la Lambda al cumplirse el límite duro de 10s.
 */
export class TimeoutError extends Error {
    constructor(label: string, ms: number) {
        super(`[ssr] ${label} timeout tras ${ms}ms`);
        this.name = 'TimeoutError';
    }
}

export const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
        p,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new TimeoutError(label, ms)), ms),
        ),
    ]);

export const isTimeout = (err: unknown): err is TimeoutError =>
    err instanceof TimeoutError;
