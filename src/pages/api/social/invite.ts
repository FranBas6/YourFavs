/**
 * GET /api/social/invite?h={handle} → { ok, inviter: { name, firstName, handle, avatar, initials, color } | null }
 *
 * Para el modal de acceso (handoff social D14): «Te invita Ana Ruiz · @ana». El navegador lee su
 * cookie `yf_ref` y pregunta por ese handle. Solo devuelve perfiles ACTIVOS y lo mismo que ya
 * enseña su página pública, así que no pide sesión y se puede cachear como ella.
 */
import type { APIRoute } from 'astro';
import { findInviter } from '../../../services/BD/social/referral';
import { firstName } from '../../../lib/social/ui';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
    const inviter = await findInviter((url.searchParams.get('h') ?? '').slice(0, 40));
    const body = inviter
        ? { ok: true, inviter: { name: inviter.name, firstName: firstName(inviter.name), handle: inviter.handle, avatar: inviter.avatar, initials: inviter.initials, color: inviter.color } }
        : { ok: true, inviter: null };
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=300, max-age=60' },
    });
};
