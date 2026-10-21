const STRINGS = {
    en: {
        sent: 'Sent',
        delivered: 'Delivered',
        read: 'Read',
        info: 'Message info',
        readBy: 'Read by',
        deliveredTo: 'Delivered to',
        pending: 'Waiting',
        readHidden: 'Read receipts are turned off in this conversation.',
        loadError: 'Could not load the message info.',
        close: 'Close',
        settingsSection: 'Read receipts',
        settingTitle: 'Send and receive read receipts',
        settingHelp: 'In direct messages, if you turn them off you will not send read receipts, nor see other people\'s. Group messages always have them.',
        on: 'On',
        off: 'Off',
        today: 'Today',
        yesterday: 'Yesterday',
    },
    es: {
        sent: 'Enviado',
        delivered: 'Entregado',
        read: 'Leído',
        info: 'Info. del mensaje',
        readBy: 'Leído por',
        deliveredTo: 'Entregado a',
        pending: 'Pendiente',
        readHidden: 'Las confirmaciones de lectura están desactivadas en esta conversación.',
        loadError: 'No se ha podido cargar la info. del mensaje.',
        close: 'Cerrar',
        settingsSection: 'Confirmaciones de lectura',
        settingTitle: 'Enviar y recibir confirmaciones de lectura',
        settingHelp: 'En los mensajes directos, si las desactivas no enviarás confirmaciones de lectura ni verás las de los demás. En los mensajes de grupo están siempre activas.',
        on: 'Activadas',
        off: 'Desactivadas',
        today: 'Hoy',
        yesterday: 'Ayer',
    },
};

export function translator(locale) {
    const strings = STRINGS[(locale || '').split('-')[0]] || STRINGS.en;
    return (key) => strings[key];
}

const DAY_MS = 24 * 60 * 60 * 1000;

// "Today 14:32", "Yesterday 09:10" or a short date, like WhatsApp's message info.
export function formatWhen(ms, locale, t, now = Date.now()) {
    const date = new Date(ms);
    const time = date.toLocaleTimeString(locale, {hour: '2-digit', minute: '2-digit'});
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    if (ms >= startOfToday) {
        return `${t('today')} ${time}`;
    }
    if (ms >= startOfToday - DAY_MS) {
        return `${t('yesterday')} ${time}`;
    }
    return `${date.toLocaleDateString(locale, {day: 'numeric', month: 'short', year: 'numeric'})} ${time}`;
}
