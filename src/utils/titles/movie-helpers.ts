export function formatCurrency(amount: number): string | null {
    if (!amount || amount === 0) return null;
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}
