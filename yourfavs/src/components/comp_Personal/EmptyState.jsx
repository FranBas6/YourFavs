const EmptyState = ({ color, title, message, icon }) => {
    const colorMap = {
        blue: {
            bg: 'bg-blue-50',
            border: 'border-blue-200',
            text: 'text-blue-600',
            iconColor: 'text-blue-400',
        },
        red: {
            bg: 'bg-red-50',
            border: 'border-red-200',
            text: 'text-red-600',
            iconColor: 'text-red-400',
        },
    };

    const { bg, border, text, iconColor } = colorMap[color];

    return (
        <div class={`${bg} ${border} rounded-xl p-6 text-center`}>
            <svg xmlns="http://www.w3.org/2000/svg" class={`h-12 w-12 mx-auto ${iconColor} mb-3`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {icon === "tv" ? (
                    <path d="M17 4H3v12h14V4zM3 18h14a1 1 0 001-1v-1H2v1a1 1 0 001 1z" />
                ) : (
                    <path d="M7 4v16M17 4v16M3 8h18M3 16h18" />
                )}
            </svg>
            <h3 class="text-lg font-semibold mb-1">{title}</h3>
            <p class={`text-sm ${text}`}>{message}</p>
        </div>
    );
};

export default EmptyState;