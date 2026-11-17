/**
 * Administración mínima (plan de mensajes: reportes). No hay rol de administrador en la base: la
 * lista de uids va en la variable de entorno `ADMIN_UIDS` (separados por comas), en `.env` en local
 * y en el panel de Netlify en producción. Sin ella, nadie es admin.
 */
export function isAdmin(uid: string | null | undefined): boolean {
    if (!uid) return false;
    const raw = import.meta.env.ADMIN_UIDS || process.env.ADMIN_UIDS || '';
    return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(uid.toLowerCase());
}
