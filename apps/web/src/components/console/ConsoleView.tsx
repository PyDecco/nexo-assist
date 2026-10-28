'use client';

import { formatTime, initials, type TicketView, type User } from '@nexo/core';
import { ArrowRightLeft, Bot, ChevronDown, ChevronRight, ChevronUp, CircleAlert, CircleCheckBig, Hand, Headset, LoaderCircle, LogOut, MessageCircle, Search, SendHorizontal, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UiMessage } from '@/lib/types';
import { DecisionPanel } from '../chat/DecisionPanel';
import { STATUS_DOT } from '../chat/status';
import { NexoMark } from '../NexoMark';
import { logout } from '../SidebarNav';

type Filter = 'all' | 'for_you' | 'with_agent' | 'mine';
type Tone = 'danger' | 'warning' | 'success' | 'primary' | 'muted';

interface Item {
  id: string;
  user: { name: string; email: string; department: string; initials: string };
  state: 'with_agent' | 'waiting_analyst' | 'with_analyst' | 'closed';
  stateLabel: string;
  tag: string;
  tone: Tone;
  needsYou: boolean;
  assignedToMe: boolean;
  transfer: { reason: string; summary: string; queue: string; ticketNumber?: string; confidence?: number; at: string } | null;
  preview: string | null;
  lastMessageAt: string | null;
}

interface Detail {
  item: Item;
  conversation: { id: string; memory: { focusTicket?: string }; state: Item['state'] };
  employee: User | null;
  messages: UiMessage[];
  tickets: TicketView[];
  ticketsError: string | null;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'for_you', label: 'Para você' },
  { key: 'with_agent', label: 'Com o agent' },
  { key: 'mine', label: 'Minhas' },
];

const AVATAR_COLORS = [
  ['#DCE9F7', '#0062C4'],
  ['#F6E3D3', '#9A4A12'],
  ['#E6E1F7', '#5B3FC4'],
  ['#DDF0E6', '#1E7A4C'],
  ['#F7E1E6', '#A3324F'],
  ['#FBEFD0', '#8A6100'],
];
function avatarColor(email: string) {
  const sum = [...email].reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length] as [string, string];
}

function timeLabel(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'agora';
  if (diff < 24 * 3600_000 && new Date().getDate() === d.getDate()) return formatTime(iso);
  return diff < 48 * 3600_000 ? 'ontem' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

/** Telas 4 e 5 — console do analista. */
export function ConsoleView({ analyst }: { analyst: User }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('for_you');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [counts, setCounts] = useState<Record<Filter, number>>({ all: 0, for_you: 0, with_agent: 0, mine: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [showTickets, setShowTickets] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    const res = await fetch(`/api/console/conversations?filter=${filter}&q=${encodeURIComponent(q)}`, { cache: 'no-store' }).catch(() => null);
    if (!res) return setError('Sem conexão com o servidor.');
    if (res.status === 401) return window.location.assign('/login');
    if (res.ok) {
      const data = (await res.json()) as { items: Item[]; counts: Record<Filter, number> };
      setItems(data.items);
      setCounts(data.counts);
    }
  }, [filter, q]);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/console/conversations/${id}`, { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setDetail((await res.json()) as Detail);
  }, []);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('c');
    if (initial) setSelected(initial);
  }, []);

  useEffect(() => {
    void loadList();
    const id = setInterval(() => void loadList(), 3000);
    return () => clearInterval(id);
  }, [loadList]);

  useEffect(() => {
    if (!selected) return;
    setDetail((d) => (d?.item.id === selected ? d : null));
    void loadDetail(selected);
    const id = setInterval(() => void loadDetail(selected), 3000);
    window.history.replaceState(null, '', `/console?c=${selected}`);
    return () => clearInterval(id);
  }, [selected, loadDetail]);

  const messageCount = detail?.messages.length ?? 0;
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messageCount, selected]);

  async function act(action: 'assume' | 'return' | 'close' | 'message', body?: unknown) {
    if (!selected) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/console/conversations/${selected}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json()) as Detail & { error?: { message: string } };
      if (!res.ok) throw new Error(data.error?.message ?? 'Ação não concluída.');
      setDetail(data);
      if (action === 'message') setText('');
      void loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ação não concluída.');
    } finally {
      setBusy(null);
    }
  }

  const item = detail?.item;
  const firstName = item?.user.name.split(' ')[0] ?? '';
  const focusNumber = item?.transfer?.ticketNumber ?? detail?.conversation.memory.focusTicket;
  const focusTicket = detail?.tickets.find((t) => t.number === focusNumber);
  const otherTickets = detail?.tickets.filter((t) => t.number !== focusNumber) ?? [];
  const openCount = detail?.tickets.filter((t) => t.open).length ?? 0;

  return (
    <div className={`console ${selected ? 'has-selection' : ''}`}>
      <nav className="rail">
        <div style={{ height: 40, display: 'flex', alignItems: 'center', paddingBottom: 8 }}>
          <NexoMark size={22} />
        </div>
        <div className="item" title="Conversas">
          <MessageCircle size={19} />
          {counts.for_you > 0 && <span className="badge">{counts.for_you}</span>}
        </div>
        <button className="item btn-ghost me" title="Sair" style={{ border: 0, background: 'var(--primary-soft)', borderRadius: 999, color: 'var(--primary-text)', fontWeight: 700, fontSize: 12.5 }} onClick={() => logout(router)}>
          {initials(analyst.name)}
          <span className="online" />
        </button>
        <button className="btn btn-ghost" title="Sair" style={{ width: 40, padding: 0, justifyContent: 'center' }} onClick={() => logout(router)}>
          <LogOut size={16} />
        </button>
      </nav>

      <section className="chatlist">
        <div className="chatlist-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1>Conversas</h1>
            <span className="pill pill-success">
              <span className="dot" style={{ background: 'var(--success)', width: 7, height: 7 }} />
              Disponível
            </span>
          </div>
          <label className="search">
            <Search size={15} />
            <input placeholder="Pesquisar conversa ou chamado" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="filters">
            {FILTERS.map((f) => (
              <button key={f.key} className={`filter ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
                {f.label}
                {f.key !== 'all' && <b>{counts[f.key]}</b>}
              </button>
            ))}
          </div>
        </div>
        <div className="items">
          {items === null && (
            <div className="empty">
              <LoaderCircle size={18} className="spin" />
            </div>
          )}
          {items?.length === 0 && <div className="empty">Nenhuma conversa {filter === 'for_you' ? 'precisando de você agora' : 'neste filtro'}.</div>}
          {items?.map((it) => {
            const [bg, fg] = avatarColor(it.user.email);
            return (
              <button key={it.id} className={`conv-item ${selected === it.id ? 'active' : ''} ${it.needsYou ? 'attn' : ''}`} onClick={() => setSelected(it.id)}>
                <span className="avatar" style={{ background: bg, color: fg }}>
                  {it.user.initials}
                </span>
                <span className="txt">
                  <span className="top">
                    <span className="nm">{it.user.name}</span>
                    <span className="time">{timeLabel(it.lastMessageAt)}</span>
                  </span>
                  <span className="last">{it.preview ?? '—'}</span>
                  <span className={`tag tone-${it.tone}`}>
                    <span className={`dot bg-${it.tone}`} />
                    {it.tag}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="conversation">
        {!selected && (
          <div className="empty">
            <Headset size={28} />
            <b>Selecione uma conversa</b>
            <span>As transferidas e as que o agent pediu ajuda aparecem em “Para você”.</span>
          </div>
        )}
        {selected && !detail && (
          <div className="empty">
            <LoaderCircle size={18} className="spin" />
          </div>
        )}
        {detail && item && (
          <>
            <header className="conv-head">
              <button className="btn btn-ghost" style={{ padding: 0, width: 32, justifyContent: 'center' }} onClick={() => setSelected(null)} aria-label="Voltar para a lista">
                <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <span className="avatar" style={{ width: 40, height: 40, background: avatarColor(item.user.email)[0], color: avatarColor(item.user.email)[1], fontWeight: 600, fontSize: 14.5 }}>
                {item.user.initials}
              </span>
              <div className="who">
                <b>{item.user.name}</b>
                <span>
                  {item.user.department}
                  {focusNumber ? ` · ${focusNumber}` : ''}
                </span>
              </div>
              {item.state === 'waiting_analyst' && (
                <span className="pill pill-warning">
                  <Hand size={14} /> Aguardando atendente
                </span>
              )}
              {item.state === 'with_agent' && (
                <span className="pill pill-success">
                  <Bot size={14} /> Agent atendendo
                </span>
              )}
              {item.state === 'closed' && <span className="pill pill-muted">Encerrada</span>}
              {item.state === 'with_analyst' && item.assignedToMe && (
                <>
                  <button className="btn btn-outline" disabled={!!busy} onClick={() => void act('return')}>
                    <Bot size={14} /> Devolver ao agent
                  </button>
                  <button className="btn btn-danger" disabled={!!busy} onClick={() => void act('close')}>
                    <CircleCheckBig size={14} /> Encerrar atendimento
                  </button>
                </>
              )}
              {item.state === 'with_analyst' && !item.assignedToMe && <span className="pill pill-primary">{item.tag}</span>}
              <button className="btn btn-ghost" style={{ padding: 0, width: 36, justifyContent: 'center' }} onClick={() => setShowTickets((s) => !s)} title="Chamados do funcionário">
                {showTickets ? <X size={16} /> : <ChevronDown size={16} />}
              </button>
            </header>

            <div className="c-messages" ref={scrollRef}>
              <div className="spacer" />
              <span className="day">Histórico da conversa</span>
              {detail.messages.map((m) => (
                <ConsoleMessage key={m.id} m={m} />
              ))}
              {item.transfer && item.state === 'waiting_analyst' && (
                <div className="summary-box">
                  <b>Resumo do agent para o analista</b> ({item.transfer.queue}
                  {item.transfer.confidence !== undefined ? ` · confiança ${Math.round(item.transfer.confidence * 100)}%` : ''}):
                  <br />
                  {item.transfer.summary}
                </div>
              )}
            </div>

            <div className="takeover">
              {error && (
                <div className="banner banner-danger">
                  <CircleAlert size={15} /> <span className="grow">{error}</span>
                </div>
              )}
              {item.state === 'with_analyst' && item.assignedToMe ? (
                <form
                  className="input-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (text.trim()) void act('message', { text });
                  }}
                >
                  <textarea
                    rows={1}
                    value={text}
                    placeholder={`Responder ${firstName}…`}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (text.trim()) void act('message', { text });
                      }
                    }}
                  />
                  <button className="send-round" type="submit" disabled={!text.trim() || !!busy} aria-label="Enviar">
                    {busy === 'message' ? <LoaderCircle size={18} className="spin" /> : <SendHorizontal size={18} />}
                  </button>
                </form>
              ) : (
                <>
                  <div className="row">
                    <span className="icon">{item.state === 'waiting_analyst' ? <Hand size={17} /> : <Bot size={17} />}</span>
                    <div className="t">
                      <b>
                        {item.state === 'waiting_analyst'
                          ? `${firstName} espera um atendente`
                          : item.state === 'with_agent'
                            ? 'O agent está atendendo'
                            : item.state === 'closed'
                              ? 'Atendimento encerrado'
                              : `Em atendimento por outro analista`}
                      </b>
                      <span>
                        {item.state === 'waiting_analyst'
                          ? `Agent pausado · ${item.transfer ? `transferida às ${formatTime(item.transfer.at)}` : ''}`
                          : item.state === 'with_agent'
                            ? 'Você pode assumir a qualquer momento; o agent fica pausado.'
                            : ''}
                      </span>
                    </div>
                    {item.state === 'waiting_analyst' && (
                      <button className="btn btn-outline" disabled={!!busy} onClick={() => void act('return')}>
                        <Bot size={15} /> Devolver ao agent
                      </button>
                    )}
                    {(item.state === 'waiting_analyst' || item.state === 'with_agent') && (
                      <button className="btn btn-primary" disabled={!!busy} onClick={() => void act('assume')}>
                        {busy === 'assume' ? <LoaderCircle size={16} className="spin" /> : <Headset size={16} />} Assumir atendimento
                      </button>
                    )}
                  </div>
                  {item.state !== 'closed' && <div className="fake-input">Assuma o atendimento para responder</div>}
                </>
              )}
            </div>
          </>
        )}
      </section>

      {detail && item && showTickets && (
        <aside className="history">
          <div className="history-head">
            <div style={{ flex: 1 }}>
              <b>Chamados {item.user.name.split(' ')[0] ? `de ${firstName}` : ''}</b>
              <span>
                {openCount} abertos · {(detail.tickets.length ?? 0) - openCount} encerrados
              </span>
            </div>
            <button className="btn btn-ghost" style={{ padding: 0, width: 36, justifyContent: 'center' }} onClick={() => setShowTickets(false)} aria-label="Fechar painel">
              <X size={18} />
            </button>
          </div>
          <div className="history-body">
            {detail.ticketsError && (
              <div className="banner banner-warning">
                <CircleAlert size={15} /> {detail.ticketsError}
              </div>
            )}
            {focusTicket && (
              <div>
                <div className="section-label">Desta conversa</div>
                <div className="current-ticket">
                  <div className="r">
                    <span>{focusTicket.number}</span>
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 600, color: focusTicket.overdue ? 'var(--danger-text)' : 'var(--warning-text)' }}>
                      <span className="dot" style={{ background: STATUS_DOT[focusTicket.status], width: 7, height: 7 }} />
                      {focusTicket.statusLabel}
                      {focusTicket.overdue ? ' · vencido' : ''}
                    </span>
                  </div>
                  <div className="title">{focusTicket.title}</div>
                  <span className="muted" style={{ fontSize: 13.5 }}>
                    {focusTicket.category} · prioridade {focusTicket.priorityLabel.toLowerCase()} · {focusTicket.slaLabel}
                  </span>
                  {focusTicket.lastEvent && (
                    <div className="last">
                      <ArrowRightLeft size={15} color="var(--ink-3)" />
                      <span style={{ flex: 1 }}>{focusTicket.lastEvent.text.split(':')[0]}</span>
                      <span className="muted" style={{ fontSize: 12.5 }}>
                        {formatTime(focusTicket.lastEvent.at)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div>
              <div className="section-label">{focusTicket ? 'Outros chamados' : 'Chamados'}</div>
              {otherTickets.length === 0 && <span className="muted">Nenhum outro chamado.</span>}
              {otherTickets.map((t) => (
                <div className="ticket-row" key={t.number} title={t.description}>
                  <span className="dot" style={{ background: t.overdue ? 'var(--danger)' : STATUS_DOT[t.status], width: 7, height: 7 }} />
                  <div className="t">
                    <b>{t.title}</b>
                    <span>
                      {t.number} · {t.open ? t.statusLabel : `${t.statusLabel} ${t.lastUpdateLabel}`}
                      {t.overdue ? ' · vencido' : ''}
                    </span>
                  </div>
                  <ChevronRight size={16} color="var(--ink-3)" />
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

function ConsoleMessage({ m }: { m: UiMessage }) {
  const [open, setOpen] = useState(false);
  if (m.role === 'system') {
    return (
      <div className="msg-system c-system">
        <span>
          <ArrowRightLeft size={13} /> {m.text}
        </span>
      </div>
    );
  }
  if (m.role === 'user') {
    return (
      <div className="c-msg">
        <div className="b">
          {m.text}
          <span className="time">{formatTime(m.createdAt)}</span>
        </div>
      </div>
    );
  }
  const isAgent = m.role === 'agent';
  const [name, team] = m.authorName.split('|');
  const acts = m.actions.map((a) => a.label);
  const cardsNote = m.cards
    .map((c) => (c.kind === 'ticket' ? `card ${c.ticket.number}` : c.kind === 'draft' ? `rascunho: ${c.draft.title} (${c.draft.status})` : c.kind === 'options' ? `opções: ${c.options.join(' / ')}` : c.kind === 'ticket-selector' ? 'lista de chamados' : c.kind === 'update-draft' ? `${c.draft.kind === 'comment' ? 'complemento' : 'reabertura'} ${c.draft.ticketNumber}` : `transferência ${c.queue}`))
    .join(' · ');
  return (
    <div className="c-msg right">
      <div className="sender">
        {isAgent ? 'Nexo Assist' : name}
        <span className="tag" style={isAgent ? { background: 'var(--primary-soft)', color: 'var(--primary-text)' } : { background: 'var(--success-soft)', color: 'var(--success-text)' }}>
          {isAgent ? 'IA' : (team ?? 'Suporte')}
        </span>
        {isAgent && (m.decision || acts.length > 0) && (
          <button className="why" onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {m.decision ? `decisão · ${Math.round(m.decision.confidence * 100)}%` : 'ações'}
          </button>
        )}
      </div>
      {isAgent && acts.length > 0 && <div className="acts">{acts.join(' · ')}</div>}
      {open && <DecisionPanel decision={m.decision} actions={m.actions} meta={m.meta} />}
      <div className={`b ${isAgent ? 'agent' : 'human'}`} style={{ maxWidth: 420 }}>
        {m.text || <i className="muted">(sem texto)</i>}
        {cardsNote && <span className="time" style={{ textAlign: 'left' }}>{cardsNote}</span>}
        <span className="time">{formatTime(m.createdAt)}</span>
      </div>
    </div>
  );
}
