'use client';

import type { TicketDraft, TicketUpdateDraft, TicketView } from '@nexo/core';
import { formatDayMonth } from '@nexo/core';
import { ArrowRightLeft, LoaderCircle } from 'lucide-react';
import { PRIORITY_DOT, STATUS_DOT } from './status';

export function TicketCard({ ticket }: { ticket: TicketView }) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="card-eyebrow">
          <span>Chamado</span>
          <span className="sep" />
          <span style={{ fontWeight: 400 }}>{ticket.number}</span>
          <span className="grow" />
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: ticket.status === 'waiting_analyst' ? 'var(--warning-text)' : 'var(--ink-3)' }}>
            <span className="dot" style={{ background: STATUS_DOT[ticket.status] }} />
            {ticket.statusLabel}
          </span>
        </div>
        <h3 className="card-title">{ticket.title}</h3>
        <p className="card-desc">{ticket.description}</p>
      </div>
      <div className="card-grid">
        <div>
          <div className="k">Categoria</div>
          <div className="v">{ticket.subcategory ? `${ticket.category} › ${ticket.subcategory}` : ticket.category}</div>
        </div>
        <div>
          <div className="k">Prioridade</div>
          <div className="v">
            <span className="dot" style={{ background: PRIORITY_DOT[ticket.priority] }} />
            {ticket.priorityLabel}
          </div>
        </div>
        <div>
          <div className="k">Aberto em</div>
          <div className="v">{ticket.createdLabel}</div>
        </div>
        <div>
          <div className="k">Última atualização</div>
          <div className="v">
            <span style={ticket.overdue ? { color: 'var(--warning-text)' } : undefined}>{ticket.lastUpdateLabel}</span>
            {ticket.overdue ? <small>· prazo vencido</small> : ticket.dueLabel ? <small>· resposta {ticket.dueLabel}</small> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TicketSelector({
  tickets,
  onPick,
  disabled,
  chosen,
}: {
  tickets: TicketView[];
  onPick: (t: TicketView) => void;
  disabled: boolean;
  chosen?: string | undefined;
}) {
  return (
    <div className="card selector" role="listbox" aria-label="Escolha um chamado">
      {tickets.map((t) => (
        <button key={t.number} className={`row ${chosen === t.number ? 'chosen' : ''}`} disabled={disabled} onClick={() => onPick(t)} role="option" aria-selected={chosen === t.number}>
          <span className="radio" />
          <span className="num">{t.number}</span>
          <span className="title">{t.title}</span>
          <span className="st">
            <span className="dot" style={{ background: t.overdue ? 'var(--danger)' : STATUS_DOT[t.status] }} />
            {t.overdue ? 'Vencido' : t.statusLabel}
          </span>
          <span className="date">{formatDayMonth(t.createdAt)}</span>
        </button>
      ))}
    </div>
  );
}

function DraftState({ status, createdTicket }: { status: TicketDraft['status']; createdTicket?: string | undefined }) {
  if (status === 'confirmed') {
    return (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--success-text)' }}>
        <span className="dot" style={{ background: 'var(--success)' }} />
        {createdTicket ? `Criado · ${createdTicket}` : 'Confirmado'}
      </span>
    );
  }
  if (status === 'cancelled') return <span className="muted">Descartado</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--warning-text)' }}>
      <span className="dot" style={{ background: 'var(--warning)' }} />
      Aguardando confirmação
    </span>
  );
}

interface DraftActionsProps {
  active: boolean;
  busy: boolean;
  onConfirm: () => void;
  onEdit: () => void;
  onCancel: () => void;
}

function DraftActions({ active, busy, onConfirm, onEdit, onCancel }: DraftActionsProps) {
  if (!active) return null;
  return (
    <div className="card-actions">
      <button className="btn btn-primary" onClick={onConfirm} disabled={busy}>
        {busy ? <LoaderCircle size={14} className="spin" /> : null} Confirmar <span className="kbd">⌘↵</span>
      </button>
      <button className="btn btn-outline" onClick={onEdit} disabled={busy}>
        Editar
      </button>
      <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
        Cancelar
      </button>
      <span className="grow" />
    </div>
  );
}

export function DraftCard({ draft, ...actions }: { draft: TicketDraft } & DraftActionsProps) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="card-eyebrow">
          <span>{draft.type === 'INC' ? 'Novo chamado · incidente' : 'Novo chamado · requisição'}</span>
          <span className="sep" />
          <span style={{ fontWeight: 400 }}>Rascunho {draft.id}</span>
          <span className="grow" />
          <DraftState status={draft.status} createdTicket={draft.createdTicket} />
        </div>
        <h3 className="card-title">{draft.title}</h3>
        <p className="card-desc">{draft.description}</p>
      </div>
      <div className="card-grid">
        <div>
          <div className="k">Categoria</div>
          <div className="v">{draft.category}</div>
        </div>
        <div>
          <div className="k">Prioridade</div>
          <div className="v">
            <span className="dot" style={{ background: PRIORITY_DOT[draft.priority] }} />
            {draft.priorityLabel}
            <small>· resposta {draft.dueLabel}</small>
          </div>
        </div>
        <div>
          <div className="k">Afetados</div>
          <div className="v">{draft.affectedLabel}</div>
        </div>
      </div>
      <DraftActions {...actions} active={actions.active && draft.status === 'pending'} />
    </div>
  );
}

export function UpdateDraftCard({ draft, ...actions }: { draft: TicketUpdateDraft } & DraftActionsProps) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="card-eyebrow">
          <span>{draft.kind === 'comment' ? 'Complemento' : 'Reabertura'}</span>
          <span className="sep" />
          <span style={{ fontWeight: 400 }}>{draft.ticketNumber}</span>
          <span className="grow" />
          <DraftState status={draft.status} />
        </div>
        <h3 className="card-title">{draft.ticketTitle}</h3>
        <p className="card-desc">{draft.note}</p>
      </div>
      <DraftActions {...actions} active={actions.active && draft.status === 'pending'} />
    </div>
  );
}

export function Options({
  options,
  onPick,
  disabled,
  chosen,
}: {
  options: string[];
  onPick: (o: string) => void;
  disabled: boolean;
  chosen?: string | undefined;
}) {
  return (
    <div className="options">
      {options.map((o, i) => (
        <button key={o} className={`option ${chosen === o ? 'chosen' : ''}`} disabled={disabled} onClick={() => onPick(o)}>
          <span className="key">{i + 1}</span>
          {o}
        </button>
      ))}
    </div>
  );
}

export function TransferCard({ queue, reasonLabel }: { queue: string; reasonLabel: string }) {
  return (
    <div className="transfer-card">
      <ArrowRightLeft size={16} style={{ flex: 'none', marginTop: 2 }} />
      <span>
        <b>Transferida para {queue}</b> · {reasonLabel}. O agent fica pausado até um analista assumir ou devolver a conversa.
      </span>
    </div>
  );
}
