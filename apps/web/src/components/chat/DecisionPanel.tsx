import { INTENT_LABEL, type ActionStep, type Decision } from '@nexo/core';
import { Check, CircleAlert } from 'lucide-react';

function confidenceColor(c: number) {
  if (c >= 0.8) return 'var(--success)';
  if (c >= 0.5) return 'var(--warning)';
  return 'var(--danger)';
}

const SOURCE_LABEL: Record<Decision['source'], string> = {
  model: 'registrada pelo agent',
  synthesized: 'inferida pelo sistema (o agent não registrou)',
  rule: 'ação determinística do sistema',
};

/**
 * Requisito 7 do PRD: o que o agent entendeu, que ação tomou, com que segurança e por quê,
 * mais o rastro de cada ferramenta usada.
 */
export function DecisionPanel({
  decision,
  actions,
  meta,
}: {
  decision?: Decision | undefined;
  actions: ActionStep[];
  meta?: { runner?: string; model?: string; latencyMs?: number } | undefined;
}) {
  return (
    <div className="decision" role="region" aria-label="Detalhes da decisão do agent">
      {decision ? (
        <dl>
          <dt>Intenção</dt>
          <dd>{INTENT_LABEL[decision.intent]}</dd>
          <dt>O que entendeu</dt>
          <dd>{decision.understood}</dd>
          <dt>Ação tomada</dt>
          <dd>{decision.action}</dd>
          <dt>Grau de segurança</dt>
          <dd className="conf">
            <span className="bar">
              <i style={{ width: `${Math.round(decision.confidence * 100)}%`, background: confidenceColor(decision.confidence) }} />
            </span>
            <b>{Math.round(decision.confidence * 100)}%</b>
            {decision.confidence < 0.5 && <span className="muted">— abaixo de 50%, vai para um analista</span>}
          </dd>
          <dt>Por quê</dt>
          <dd>{decision.reasoning}</dd>
        </dl>
      ) : (
        <span className="muted">Decisão ainda sendo registrada…</span>
      )}
      {actions.length > 0 && (
        <div className="trace">
          {actions.map((a) => (
            <div className="t" key={a.id}>
              {a.status === 'error' ? <CircleAlert size={14} color="var(--danger-text)" /> : <Check size={14} color="var(--success-text)" />}
              <div>
                <div className="label">{a.label}</div>
                {a.detail && <div className="detail">{a.detail}</div>}
              </div>
              <span className="ms">{a.tool}</span>
            </div>
          ))}
        </div>
      )}
      {(meta?.model || decision) && (
        <div className="meta">
          {decision && SOURCE_LABEL[decision.source]}
          {meta?.model && ` · ${meta.runner === 'scripted' ? 'runner determinístico' : meta.model}`}
          {meta?.latencyMs !== undefined && ` · ${(meta.latencyMs / 1000).toFixed(1)} s`}
        </div>
      )}
    </div>
  );
}
