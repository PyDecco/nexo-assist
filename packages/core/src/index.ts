export const TICKET_CATEGORIES = ['Acesso', 'Rede e VPN', 'Hardware', 'Software', 'E-mail', 'Outros'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
