"use client";

import type { AuditRecord } from '../lib/types';
import { StatusBadge } from './StatusBadge';

interface Props {
  record: AuditRecord;
  isNew?: boolean;
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString('en-GB', { hour12: false });
  } catch {
    return ts;
  }
}

function actionSummary(record: AuditRecord): string {
  const { action } = record;
  if (action.action_type === 'HBAR_TRANSFER') {
    return `HBAR_TRANSFER · ${action.amount ?? '?'} ℏ → ${action.to_account ?? '?'}`;
  }
  return action.action_type;
}

export function AuditCard({ record, isNew = false }: Props) {
  const verdict = record.decision.verdict;
  const isApproved = verdict === 'approved';
  const isDenied   = verdict === 'denied';

  const cardBg     = isApproved ? 'var(--approved-bg)' : isDenied ? 'var(--denied-bg)' : 'var(--pending-bg)';
  const cardBorder = isApproved ? 'var(--approved-border)' : isDenied ? 'var(--denied-border)' : 'var(--pending-border)';

  return (
    <div
      className={isNew ? 'anim-slide-top' : ''}
      style={{
        background: cardBg,
        border: `1px solid ${cardBorder}`,
        borderRadius: '4px',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {record.sequence !== undefined && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                fontWeight: 700,
                color: 'var(--faint)',
                letterSpacing: '0.06em',
                minWidth: '24px',
              }}
            >
              #{record.sequence}
            </span>
          )}
          <StatusBadge verdict={verdict} size="sm" />
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', fontWeight: 400 }}>
          {formatTime(record.timestamp)}
        </span>
      </div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text)', fontWeight: 400, lineHeight: 1.3 }}>
        {actionSummary(record)}
      </div>

      <div style={{ fontFamily: 'var(--font-body)', fontSize: '10px', color: 'var(--muted)' }}>
        {record.actor_id}
      </div>

      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '11px',
          color: 'var(--muted)',
          lineHeight: '1.45',
          paddingTop: '5px',
          borderTop: '1px solid oklch(0.22 0.018 230 / 0.6)',
        }}
      >
        {record.decision.reason}
      </div>

      {record.execution_result?.tx_id && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--approved)', fontWeight: 500 }}>
          tx: {record.execution_result.tx_id}
        </div>
      )}
    </div>
  );
}
