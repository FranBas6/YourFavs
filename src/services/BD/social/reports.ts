/**
 * Reportes de mensajes para `/admin/reportes` (plan de mensajes, «Reportar»). Solo lo usa quien está
 * en `ADMIN_UIDS`; lee con el cliente admin. Cada reporte guarda una copia del texto al reportar,
 * así que se ve aunque el autor lo borre después.
 */
import { supabaseAdmin } from '../../../lib/supabase/admin';
import { getPeople } from './graph';
import type { PersonCard } from '../../../lib/social/types';

export interface ReportView {
    id: number;
    reason: 'spam' | 'harassment' | 'other';
    note: string | null;
    body: string | null;
    at: number;
    resolvedAt: number | null;
    messageId: number;
    convKind: 'direct' | 'group';
    /** El mensaje ya está borrado (por su autor o desde aquí). */
    messageDeleted: boolean;
    reporter: PersonCard | null;
    author: PersonCard | null;
}

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

export async function listReports(opts: { resolved: boolean }): Promise<ReportView[]> {
    const db = supabaseAdmin();
    let q = db.from('message_reports')
        .select('id, reason, note, body, created_at, resolved_at, message_id, reporter_id, messages!inner(author_id, deleted_at, conversations!inner(kind))')
        .order('created_at', { ascending: false })
        .limit(100);
    q = opts.resolved ? q.not('resolved_at', 'is', null) : q.is('resolved_at', null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    type Row = {
        id: number; reason: ReportView['reason']; note: string | null; body: string | null; created_at: string;
        resolved_at: string | null; message_id: number; reporter_id: string;
        messages: { author_id: string | null; deleted_at: string | null; conversations: { kind: 'direct' | 'group' } };
    };
    const rows = (data ?? []) as unknown as Row[];
    const people = await getPeople(rows.flatMap((r) => [r.reporter_id, r.messages.author_id ?? ''].filter(Boolean)));
    return rows.map((r) => ({
        id: r.id, reason: r.reason, note: r.note, body: r.body, at: ms(r.created_at)!, resolvedAt: ms(r.resolved_at),
        messageId: r.message_id, convKind: r.messages.conversations.kind, messageDeleted: Boolean(r.messages.deleted_at),
        reporter: people.get(r.reporter_id) ?? null,
        author: r.messages.author_id ? people.get(r.messages.author_id) ?? null : null,
    }));
}

/** Marca como revisados todos los reportes de ese mensaje. */
export async function resolveReport(id: number): Promise<void> {
    const db = supabaseAdmin();
    const { data, error } = await db.from('message_reports').select('message_id').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return;
    const r = await db.from('message_reports').update({ resolved_at: new Date().toISOString() })
        .eq('message_id', data.message_id).is('resolved_at', null);
    if (r.error) throw new Error(r.error.message);
}

/** Borra el mensaje reportado para todos («Mensaje eliminado») y da sus reportes por revisados. */
export async function deleteReportedMessage(id: number): Promise<void> {
    const db = supabaseAdmin();
    const { data, error } = await db.from('message_reports').select('message_id').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return;
    const r = await db.from('messages').update({ deleted_at: new Date().toISOString(), body: null, undo_md5: null })
        .eq('id', data.message_id).is('deleted_at', null);
    if (r.error) throw new Error(r.error.message);
    await resolveReport(id);
}
