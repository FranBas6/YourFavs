import type { APIRoute } from 'astro';
import { getCalendarData } from '../../../services/API/Calendar/calendarService';

export const GET: APIRoute = async ({ params }) => {
    const { yearMonth } = params;
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
        return new Response(JSON.stringify({ error: 'Formato inválido. Usa YYYY-MM' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const [year, month] = yearMonth.split('-').map(Number);

    try {
        const data = await getCalendarData(year, month);
        return new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Error al obtener datos del calendario:', error);
        return new Response(JSON.stringify({ error: 'Error interno' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
