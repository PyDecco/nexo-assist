import { randomUUID } from 'node:crypto';
import type { User } from '@nexo/core';
import type { Db } from './db';
import type { Conversation, StoredMessage } from './types';

interface ConversationRow {
  id: string;
  user_email: string;
  state: Conversation['state'];
  assigned_analyst: string | null;
  transfer_json: string | null;
  pending_draft_json: string | null;
  draft_message_id: string | null;
  memory_json: string;
  user_message_count: number;
  last_message_preview: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: StoredMessage['role'];
  author_name: string;
  text: string;
  payload_json: string;
  created_at: string;
}

const parse = <T>(json: string | null, fallback: T): T => (json ? (JSON.parse(json) as T) : fallback);

/** Persistência da aplicação web: usuários, conversas, mensagens e estado (sobrevive a reinício). */
export class Store {
  constructor(
    private readonly db: Db,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  findUser(email: string): User | null {
    const row = this.db.prepare('SELECT email, name, role, department, team FROM users WHERE email = ?').get(email.trim().toLowerCase()) as
      | { email: string; name: string; role: User['role']; department: string; team: string | null }
      | undefined;
    return row ? { ...row, team: row.team ?? undefined } : null;
  }

  createConversation(userEmail: string): Conversation {
    const now = this.clock().toISOString();
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO conversations (id, user_email, state, created_at, updated_at) VALUES (?, ?, 'with_agent', ?, ?)")
      .run(id, userEmail, now, now);
    return this.getConversation(id)!;
  }

  getConversation(id: string): Conversation | null {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as unknown as ConversationRow | undefined;
    return row ? hydrateConversation(row) : null;
  }

  latestConversation(userEmail: string): Conversation | null {
    const row = this.db
      .prepare('SELECT * FROM conversations WHERE user_email = ? ORDER BY created_at DESC LIMIT 1')
      .get(userEmail) as unknown as ConversationRow | undefined;
    return row ? hydrateConversation(row) : null;
  }

  listConversations(): Conversation[] {
    const rows = this.db
      .prepare('SELECT * FROM conversations WHERE last_message_at IS NOT NULL ORDER BY last_message_at DESC LIMIT 200')
      .all() as unknown as ConversationRow[];
    return rows.map(hydrateConversation);
  }

  updateConversation(id: string, patch: Partial<Omit<Conversation, 'id' | 'userEmail' | 'createdAt'>>): Conversation {
    const current = this.getConversation(id);
    if (!current) throw new Error(`Conversa ${id} não encontrada`);
    const next = { ...current, ...patch, updatedAt: this.clock().toISOString() };
    this.db
      .prepare(
        `UPDATE conversations SET state = ?, assigned_analyst = ?, transfer_json = ?, pending_draft_json = ?, draft_message_id = ?,
         memory_json = ?, user_message_count = ?, last_message_preview = ?, last_message_at = ?, updated_at = ?, closed_at = ? WHERE id = ?`,
      )
      .run(
        next.state,
        next.assignedAnalyst,
        next.transfer ? JSON.stringify(next.transfer) : null,
        next.pendingDraft ? JSON.stringify(next.pendingDraft) : null,
        next.draftMessageId,
        JSON.stringify(next.memory),
        next.userMessageCount,
        next.lastMessagePreview,
        next.lastMessageAt,
        next.updatedAt,
        next.closedAt,
        id,
      );
    return next;
  }

  addMessage(msg: Omit<StoredMessage, 'id' | 'createdAt'> & { id?: string }): StoredMessage {
    const id = msg.id ?? randomUUID();
    const createdAt = this.clock().toISOString();
    const seq = (this.db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM messages WHERE conversation_id = ?').get(msg.conversationId) as { n: number }).n;
    const payload = { actions: msg.actions, cards: msg.cards, decision: msg.decision, meta: msg.meta };
    this.db
      .prepare('INSERT INTO messages (id, conversation_id, seq, role, author_name, text, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, msg.conversationId, seq, msg.role, msg.authorName, msg.text, JSON.stringify(payload), createdAt);
    const preview = msg.role === 'system' ? null : `${msg.role === 'agent' ? 'Nexo: ' : ''}${msg.text}`.slice(0, 120);
    if (preview) {
      this.db.prepare('UPDATE conversations SET last_message_preview = ?, last_message_at = ? WHERE id = ?').run(preview, createdAt, msg.conversationId);
    } else {
      this.db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(createdAt, msg.conversationId);
    }
    return { ...msg, id, createdAt };
  }

  updateMessage(id: string, patch: Partial<Pick<StoredMessage, 'cards' | 'text'>>): void {
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as unknown as MessageRow | undefined;
    if (!row) return;
    const msg = hydrateMessage(row);
    const next = { ...msg, ...patch };
    this.db
      .prepare('UPDATE messages SET text = ?, payload_json = ? WHERE id = ?')
      .run(next.text, JSON.stringify({ actions: next.actions, cards: next.cards, decision: next.decision, meta: next.meta }), id);
  }

  listMessages(conversationId: string, limit?: number): StoredMessage[] {
    const rows = (
      limit
        ? this.db.prepare('SELECT * FROM (SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq DESC LIMIT ?) ORDER BY seq').all(conversationId, limit)
        : this.db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq').all(conversationId)
    ) as unknown as MessageRow[];
    return rows.map(hydrateMessage);
  }
}

function hydrateConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    userEmail: row.user_email,
    state: row.state,
    assignedAnalyst: row.assigned_analyst,
    transfer: parse(row.transfer_json, null),
    pendingDraft: parse(row.pending_draft_json, null),
    draftMessageId: row.draft_message_id,
    memory: parse(row.memory_json, {}),
    userMessageCount: row.user_message_count,
    lastMessagePreview: row.last_message_preview,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
  };
}

function hydrateMessage(row: MessageRow): StoredMessage {
  const payload = parse<Pick<StoredMessage, 'actions' | 'cards' | 'decision' | 'meta'>>(row.payload_json, { actions: [], cards: [] });
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    authorName: row.author_name,
    text: row.text,
    actions: payload.actions ?? [],
    cards: payload.cards ?? [],
    decision: payload.decision,
    meta: payload.meta,
    createdAt: row.created_at,
  };
}
