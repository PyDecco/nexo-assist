'use client';

import type { Card, TicketView } from '@nexo/core';
import { Check, ChevronDown, ChevronUp, CircleAlert, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import type { UiMessage } from '@/lib/types';
import { DraftCard, Options, TicketCard, TicketSelector, TransferCard, UpdateDraftCard } from './Cards';
import { DecisionPanel } from './DecisionPanel';
import { RichText } from './RichText';

export interface MessageHandlers {
  interactive: boolean;
  draftBusy: boolean;
  chosen?: string | undefined;
  onOption: (text: string) => void;
  onPickTicket: (t: TicketView) => void;
  onConfirm: () => void;
  onEdit: () => void;
  onCancel: () => void;
}

/** Resposta do agent: linha de ações acima (protótipo), balão, cards e o detalhe da decisão sob demanda. */
export function AgentMessage({ message, handlers }: { message: UiMessage; handlers: MessageHandlers }) {
  const [open, setOpen] = useState(false);
  const visibleActions = message.actions.filter((a) => a.tool !== 'recordDecision');
  const options = message.cards.find((c): c is Extract<Card, { kind: 'options' }> => c.kind === 'options');
  const otherCards = message.cards.filter((c) => c.kind !== 'options');
  const waiting = message.streaming && !message.text && otherCards.length === 0;

  return (
    <div className="msg-agent">
      <div className="status-line">
        <span className="who">Nexo Assist</span>
        {visibleActions.map((a) => (
          <span key={a.id} className={`act ${a.status}`}>
            {a.status === 'error' ? <CircleAlert size={12} /> : a.status === 'running' ? <LoaderCircle size={12} className="spin" /> : <Check size={12} />}
            {a.label}
          </span>
        ))}
        {!message.streaming && (message.decision || visibleActions.length > 0) && (
          <button className="why" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {open ? 'ocultar decisão' : `por quê?${message.decision ? ` · ${Math.round(message.decision.confidence * 100)}%` : ''}`}
          </button>
        )}
      </div>
      {open && <DecisionPanel decision={message.decision} actions={visibleActions} meta={message.meta} />}
      {(message.text || options || waiting) && (
        <div className={`bubble ${message.meta?.error ? 'error' : ''}`}>
          {waiting ? (
            <span className="typing" aria-label="Nexo Assist está pensando">
              <span />
              <span />
              <span />
            </span>
          ) : (
            message.text && <RichText text={message.text} />
          )}
          {options && (
            <>
              <div className="question">{options.question}</div>
              <Options options={options.options} onPick={handlers.onOption} disabled={!handlers.interactive} chosen={handlers.chosen} />
            </>
          )}
        </div>
      )}
      {otherCards.map((card, i) => (
        <CardView key={i} card={card} handlers={handlers} />
      ))}
    </div>
  );
}

function CardView({ card, handlers }: { card: Card; handlers: MessageHandlers }) {
  switch (card.kind) {
    case 'ticket':
      return <TicketCard ticket={card.ticket} />;
    case 'ticket-selector':
      return <TicketSelector tickets={card.tickets} onPick={handlers.onPickTicket} disabled={!handlers.interactive} chosen={handlers.chosen?.split(' · ')[0]} />;
    case 'draft':
      return <DraftCard draft={card.draft} active={handlers.interactive} busy={handlers.draftBusy} onConfirm={handlers.onConfirm} onEdit={handlers.onEdit} onCancel={handlers.onCancel} />;
    case 'update-draft':
      return <UpdateDraftCard draft={card.draft} active={handlers.interactive} busy={handlers.draftBusy} onConfirm={handlers.onConfirm} onEdit={handlers.onEdit} onCancel={handlers.onCancel} />;
    case 'transfer':
      return <TransferCard queue={card.queue} reasonLabel={card.reasonLabel} />;
    case 'options':
      return null;
  }
}

export function AnalystMessage({ message }: { message: UiMessage }) {
  const [name, team] = message.authorName.split('|');
  return (
    <div className="msg-agent msg-analyst">
      <div className="status-line">
        <span className="who">{name}</span>
        <span className="who-tag">{team ?? 'Suporte'}</span>
      </div>
      <div className="bubble">
        <RichText text={message.text} />
      </div>
    </div>
  );
}
