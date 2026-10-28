const DAY_MS = 24 * 60 * 60 * 1000;
const TZ = 'America/Sao_Paulo';

export function relativeTime(iso: string, now: Date): string {
  const diff = now.getTime() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(diff / DAY_MS);
  if (days === 1) return 'há 1 dia';
  if (days < 7) return `há ${days} dias`;
  if (days < 14) return 'há 1 semana';
  return `há ${Math.floor(days / 7)} semanas`;
}

export function formatDayMonth(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: TZ })
    .format(new Date(iso))
    .replace('.', '')
    .replace(' de ', ' ');
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return `${formatDayMonth(iso)}, ${formatTime(iso)}`;
}

/** "até 13:43" no mesmo dia; "até 30 out, 10:00" em outro dia. */
export function formatDue(iso: string, now: Date): string {
  const sameDay = formatDayMonth(iso) === formatDayMonth(now.toISOString());
  return sameDay ? `até ${formatTime(iso)}` : `até ${formatDateTime(iso)}`;
}
