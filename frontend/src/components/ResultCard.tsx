import type { IntentResponse } from '../types';
import { StatusBadge } from './StatusBadge';

interface Props {
  result: IntentResponse;
}

function DataRow({ label, value, mono = false }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--faint)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
          fontSize: mono ? '12px' : '13px',
          color: 'var(--text)',
          fontWeight: 400,
          lineHeight: 1.3,
          wordBreak: 'break-all',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: '1px',
        background: 'var(--border)',
        margin: '0 -18px',
      }}
    />
  );
}

export function ResultCard({ result }: Props) {
  const { decision, structured_action, execution_result } = result;
  const verdict = decision.verdict;

  const isApproved = verdict === 'approved';
  const isDenied   = verdict === 'denied';

  const verdictBg     = isApproved ? 'var(--approved-bg)'
                      : isDenied   ? 'var(--denied-bg)'
                      :              'var(--pending-bg)';
  const verdictBorder = isApproved ? 'var(--approved-border)'
                      : isDenied   ? 'var(--denied-border)'
                      :              'var(--pending-border)';

  return (
    <div
      className="anim-verdict"
      style={{
        background: verdictBg,
        border: `1px solid ${verdictBorder}`,
        borderRadius: '6px',
        overflow: 'hidden',
      }}
    >
      {/* Verdict header */}
      <div
        style={{
          padding: '16px 18px 14px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <StatusBadge verdict={verdict} size="lg" />
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              color: 'var(--text)',
              margin: 0,
              lineHeight: '1.6',
              maxWidth: '60ch',
            }}
          >
            {decision.reason}
          </p>
        </div>

        {/* Rules evaluated + HCS info */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
          {decision.denial_reason && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--muted)',
                background: 'var(--surface-alt)',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                padding: '2px 7px',
                fontWeight: 500,
              }}
            >
              {decision.denial_reason}
            </span>
          )}
          {result.hcs_sequence_number !== undefined && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--faint)',
                fontWeight: 400,
              }}
            >
              HCS #{result.hcs_sequence_number}
            </span>
          )}
        </div>
      </div>

      <Divider />

      {/* Structured action */}
      <div style={{ padding: '14px 18px' }}>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '10px',
            fontWeight: 700,
            color: 'var(--faint)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '12px',
          }}
        >
          Structured Action
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
            gap: '12px 20px',
          }}
        >
          <DataRow label="Type"   value={structured_action.action_type} mono />
          <DataRow label="From"   value={structured_action.actor_id} mono />
          <DataRow label="To"     value={structured_action.to_account} mono />
          <DataRow label="Amount" value={`${structured_action.amount} HBAR`} mono />
          {structured_action.memo && (
            <DataRow label="Memo" value={structured_action.memo} />
          )}
        </div>
      </div>

      {/* Execution result */}
      {execution_result && execution_result.tx_id && (
        <>
          <Divider />
          <div style={{ padding: '14px 18px' }}>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--faint)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '12px',
              }}
            >
              Execution Result
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
                gap: '12px 20px',
              }}
            >
              <DataRow label="Status" value={execution_result.status} mono />
              <DataRow label="TX ID"  value={execution_result.tx_id} mono />
            </div>
          </div>
        </>
      )}

      {/* Evaluated rules */}
      {decision.evaluated_rules.length > 0 && (
        <>
          <Divider />
          <div style={{ padding: '10px 18px 14px' }}>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--faint)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '8px',
              }}
            >
              Rules Evaluated
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {decision.evaluated_rules.map(rule => (
                <span
                  key={rule}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--muted)',
                    background: 'var(--surface-alt)',
                    border: '1px solid var(--border)',
                    borderRadius: '3px',
                    padding: '2px 6px',
                    fontWeight: 500,
                  }}
                >
                  {rule}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
