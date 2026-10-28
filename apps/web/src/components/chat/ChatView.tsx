'use client';

import type { ChatStreamEvent, TicketView } from '@nexo/core';
import { CircleAlert, Headset, LoaderCircle, MessageCirclePlus, SendHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { readSse } from '@/lib/sse';
import type { ApiError, UiConversation, UiMessage } from '@/lib/types';
import { TopBar } from '../TopBar';
import { AgentMessage, AnalystMessage, type MessageHandlers } from './AgentMessage';

type StreamEvent = ChatStreamEvent | { type: 'fatal'; code: string; message: string };

const STATE_PILL = {
  with_agent: { cls: 'pill-success', dot: 'var(--success)', label: 'Assistente online' },
  waiting_analyst: { cls: 'pill-warning', dot: 'var(--warning)', label: 'Aguardando analista' },
  with_analyst: { cls: 'pill-primary', dot: 'var(--cta)', label: 'Em atendimento com analista' },
  closed: { cls: 'pill-muted', dot: '#1B243155', label: 'Conversa encerrada' },
} as const;

/** Telas 2 e 3 — chat do funcionário com o Nexo Assist. */
export function ChatView() {
  const [conv, setConv] = useState<UiConversation | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [limit, setLimit] = useState(30);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [input, setInput] = useState('');
  const [chosen, setChosen] = useState<string>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const apply = useCallback((data: { conversation: UiConversation; messages: UiMessage[]; limit?: number }) => {
    setConv(data.conversation);
    setMessages(data.messages);
    if (data.limit) setLimit(data.limit);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/conversations/current', { cache: 'no-store' });
      if (res.status === 401) return window.location.assign('/login');
      if (!res.ok) throw new Error(((await res.json()) as ApiError).error?.message ?? 'Falha ao carregar');
      apply(await res.json());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Falha ao carregar a conversa');
    }
  }, [apply]);

  useEffect(() => {
    void load();
  }, [load]);

  // Com um analista, as mensagens dele chegam por polling.
  useEffect(() => {
    if (!conv || (conv.state !== 'waiting_analyst' && conv.state !== 'with_analyst')) return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/conversations/${conv.id}/messages`, { cache: 'no-store' }).catch(() => null);
      if (res?.ok) apply(await res.json());
    }, 3000);
    return () => clearInterval(id);
  }, [conv, apply]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || !conv || sending) return;
      setSending(true);
      setError(null);
      setInput('');
      const tempUser: UiMessage = { id: `u-${Date.now()}`, role: 'user', authorName: 'Você', text, actions: [], cards: [], createdAt: new Date().toISOString() };
      const placeholder: UiMessage = { id: 'streaming', role: 'agent', authorName: 'Nexo Assist', text: '', actions: [], cards: [], createdAt: new Date().toISOString(), streaming: true };
      const withAgent = conv.state === 'with_agent';
      setMessages((m) => [...m, tempUser, ...(withAgent ? [placeholder] : [])]);
      setConv((c) => (c ? { ...c, userMessageCount: c.userMessageCount + 1 } : c));

      const update = (fn: (m: UiMessage) => UiMessage) => setMessages((list) => list.map((m) => (m.streaming ? fn(m) : m)));
      try {
        const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversationId: conv.id, message: text }) });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as ApiError;
          throw new Error(body.error?.message ?? 'Não foi possível enviar.');
        }
        await readSse<StreamEvent>(res, (e) => {
          switch (e.type) {
            case 'action':
              update((m) => ({ ...m, actions: [...m.actions.filter((a) => a.id !== e.step.id), e.step] }));
              break;
            case 'text':
              update((m) => ({ ...m, text: m.text + e.delta }));
              break;
            case 'card':
              update((m) => ({ ...m, cards: [...m.cards, e.card] }));
              break;
            case 'decision':
              update((m) => ({ ...m, decision: e.decision }));
              break;
            case 'error':
              update((m) => ({ ...m, meta: { ...m.meta, error: true } }));
              break;
            case 'state':
              setConv((c) => (c ? { ...c, state: e.state } : c));
              break;
            case 'fatal':
              throw new Error(e.message);
            default:
              break;
          }
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha de conexão. Tente de novo.');
        setMessages((m) => m.filter((x) => !x.streaming));
        if (!input) setInput(text);
      } finally {
        setSending(false);
        setChosen(undefined);
        // Sincroniza com o servidor (ids definitivos, mensagens de sistema de transferência etc.).
        const res = await fetch(`/api/conversations/${conv.id}/messages`, { cache: 'no-store' }).catch(() => null);
        if (res?.ok) apply(await res.json());
        inputRef.current?.focus();
      }
    },
    [conv, sending, apply, input],
  );

  const draftAction = useCallback(
    async (action: 'confirm' | 'cancel') => {
      if (!conv) return;
      setDraftBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/conversations/${conv.id}/draft`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
        const body = (await res.json()) as ApiError & { conversation: UiConversation; messages: UiMessage[] };
        if (!res.ok) throw new Error(body.error?.message ?? 'Não foi possível concluir.');
        apply(body);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível concluir.');
      } finally {
        setDraftBusy(false);
      }
    },
    [conv, apply],
  );

  const newConversation = useCallback(async () => {
    const res = await fetch('/api/conversations/new', { method: 'POST' });
    if (res.ok) {
      apply(await res.json());
      setError(null);
    }
  }, [apply]);

  const lastAgentIndex = useMemo(() => messages.map((m) => m.role).lastIndexOf('agent'), [messages]);
  const lastIsAgent = lastAgentIndex === messages.length - 1;
  const atLimit = (conv?.userMessageCount ?? 0) >= limit;
  const closed = conv?.state === 'closed';
  const canInteract = !!conv && conv.state === 'with_agent' && !sending && !atLimit;
  const lastOptions = lastIsAgent ? messages[lastAgentIndex]?.cards.find((c) => c.kind === 'options') : undefined;

  const handlersFor = (index: number): MessageHandlers => ({
    interactive: canInteract && index === lastAgentIndex && lastIsAgent,
    draftBusy,
    chosen: index === lastAgentIndex ? chosen : undefined,
    onOption: (o) => {
      setChosen(o);
      void send(o);
    },
    onPickTicket: (t: TicketView) => {
      const label = `${t.number} · ${t.title}`;
      setChosen(label);
      void send(label);
    },
    onConfirm: () => void draftAction('confirm'),
    onCancel: () => void draftAction('cancel'),
    onEdit: () => {
      setInput('Quero alterar o rascunho: ');
      inputRef.current?.focus();
    },
  });

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && conv?.hasPendingDraft && !input.trim()) {
      e.preventDefault();
      void draftAction('confirm');
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
      return;
    }
    // Atalhos 1–5 para as opções rápidas quando o campo está vazio.
    if (!input && lastOptions?.kind === 'options' && /^[1-5]$/.test(e.key) && canInteract) {
      const option = lastOptions.options[Number(e.key) - 1];
      if (option) {
        e.preventDefault();
        setChosen(option);
        void send(option);
      }
    }
  }

  const pill = STATE_PILL[conv?.state ?? 'with_agent'];

  return (
    <>
      <TopBar here="Atendimento">
        <span className={`pill ${pill.cls}`}>
          <span className="dot" style={{ background: pill.dot, width: 7, height: 7 }} />
          {pill.label}
        </span>
      </TopBar>
      <div className="chat">
        <div className="messages" ref={scrollRef}>
          {!conv && !loadError && (
            <div className="center-state" style={{ height: '100%' }}>
              <LoaderCircle size={18} className="spin" /> Carregando sua conversa…
            </div>
          )}
          {loadError && (
            <div className="center-state" style={{ height: '100%', flexDirection: 'column' }}>
              <span>
                <CircleAlert size={16} /> {loadError}
              </span>
              <button className="btn btn-outline" onClick={() => void load()}>
                Tentar de novo
              </button>
            </div>
          )}
          {conv && (
            <div className="messages-inner">
              {messages.length === 0 && (
                <div className="msg-agent">
                  <div className="status-line">
                    <span className="who">Nexo Assist</span>
                  </div>
                  <div className="bubble">
                    <p style={{ margin: 0 }}>
                      Olá! Sou o Nexo Assist, do service desk de TI. Me conte o que está acontecendo — posso tirar dúvidas, consultar seus chamados, abrir um chamado ou chamar um analista.
                    </p>
                  </div>
                </div>
              )}
              {messages.map((m, i) => {
                if (m.role === 'user')
                  return (
                    <div className="msg-user" key={m.id}>
                      <div className="bubble">{m.text}</div>
                    </div>
                  );
                if (m.role === 'system')
                  return (
                    <div className="msg-system" key={m.id}>
                      <span>
                        <Headset size={13} /> {m.text}
                      </span>
                    </div>
                  );
                if (m.role === 'analyst') return <AnalystMessage key={m.id} message={m} />;
                return <AgentMessage key={m.id} message={m} handlers={handlersFor(i)} />;
              })}
            </div>
          )}
        </div>
        <div className="composer-area">
          {error && (
            <div className="banner banner-danger" role="alert">
              <CircleAlert size={16} />
              <span className="grow">{error}</span>
              <button className="btn btn-ghost" onClick={() => setError(null)}>
                Fechar
              </button>
            </div>
          )}
          {conv?.state === 'waiting_analyst' && (
            <div className="banner banner-warning">
              <Headset size={16} />
              <span className="grow">Um analista do {conv.transfer?.queue ?? 'service desk'} vai assumir esta conversa. O assistente está pausado; pode escrever que o analista verá aqui.</span>
            </div>
          )}
          {conv?.state === 'with_analyst' && (
            <div className="banner banner-info">
              <Headset size={16} />
              <span className="grow">Você está falando com um analista. O assistente volta quando ele devolver a conversa.</span>
            </div>
          )}
          {(atLimit || closed) && (
            <div className="banner banner-warning">
              <CircleAlert size={16} />
              <span className="grow">{closed ? 'Esta conversa foi encerrada.' : `Você chegou ao limite de ${limit} mensagens desta sessão.`}</span>
              <button className="btn btn-primary" onClick={() => void newConversation()}>
                <MessageCirclePlus size={15} /> Nova conversa
              </button>
            </div>
          )}
          <div className={`composer ${atLimit || closed ? 'locked' : ''}`}>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              placeholder={atLimit ? 'Limite de mensagens atingido' : 'Escreva para o Nexo…'}
              disabled={!conv || sending || atLimit || closed}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Mensagem"
              maxLength={2000}
            />
            <button className="btn btn-primary" onClick={() => void send(input)} disabled={!input.trim() || !conv || sending || atLimit || closed}>
              {sending ? <LoaderCircle size={14} className="spin" /> : <SendHorizontal size={14} />} Enviar
            </button>
          </div>
          <div className="composer-meta">
            <span>{conv?.hasPendingDraft ? 'Rascunho aguardando confirmação · ⌘↵ confirma' : ''}</span>
            <span>
              {conv?.userMessageCount ?? 0}/{limit} mensagens nesta sessão
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
