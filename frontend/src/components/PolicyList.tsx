import { useState } from 'react';
import type { Actor, Policy } from '../types';

interface Props {
  policies: Policy[];
  actors: Actor[];
}

function PolicyRow({ policy }: { policy: Policy }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 0',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          gap: '8px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 500,
              color: open ? 'var(--text)' : 'var(--muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              transition: 'color 0.15s',
            }}
          >
            {policy.id}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {policy.threshold !== undefined && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--pending)',
                fontWeight: 700,
              }}
            >
              {policy.threshold}ℏ
            </span>
          )}
          <span
            style={{
              color: 'var(--faint)',
              fontSize: '10px',
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
              display: 'inline-block',
            }}
          >
            ▾
          </span>
        </div>
      </button>
      {open && (
        <div
          style={{
            padding: '6px 0 8px 8px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '11px',
              color: 'var(--muted)',
              margin: 0,
              lineHeight: '1.5',
            }}
          >
            {policy.description}
          </p>
        </div>
      )}
    </div>
  );
}

function ActorRow({ actor }: { actor: Actor }) {
  const [open, setOpen] = useState(false);

  const roleColor =
    actor.role === 'ADMIN'    ? 'var(--approved)'
    : actor.role === 'OPERATOR' ? 'var(--pending)'
    : 'var(--muted)';

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 0',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          gap: '8px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flex: 1, minWidth: 0 }}>
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: roleColor,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: open ? 'var(--text)' : 'var(--muted)',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              transition: 'color 0.15s',
            }}
          >
            {actor.id}
          </span>
        </div>
        <span style={{ color: 'var(--faint)', fontSize: '10px', flexShrink: 0, display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          ▾
        </span>
      </button>

      {open && (
        <div
          style={{
            padding: '6px 0 8px 12px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {[
            ['role',      actor.role],
            ['threshold', `${actor.amount_threshold_hbar} HBAR`],
            ['allowlist', actor.enforce_recipient_allowlist ? 'enforced' : 'open access'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '10px', color: 'var(--faint)' }}>{k}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text)', fontWeight: 500 }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop: '4px' }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '10px', color: 'var(--faint)', marginBottom: '4px' }}>
              approved recipients
            </div>
            {actor.approved_recipients.length === 0 ? (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--faint)' }}>
                (open access)
              </span>
            ) : (
              actor.approved_recipients.map(r => (
                <div
                  key={r}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--approved)',
                    fontWeight: 500,
                    marginBottom: '2px',
                  }}
                >
                  {r}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '9px',
        fontWeight: 700,
        color: 'var(--faint)',
        letterSpacing: '0.14em',
        padding: '12px 12px 6px',
      }}
    >
      {children}
    </div>
  );
}

export function PolicyList({ policies, actors }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <SectionLabel>ACTIVE POLICIES</SectionLabel>
      <div style={{ padding: '0 12px' }}>
        {policies.map(p => <PolicyRow key={p.id} policy={p} />)}
      </div>

      <SectionLabel>REGISTERED ACTORS</SectionLabel>
      <div style={{ padding: '0 12px', flex: 1 }}>
        {actors.map(a => <ActorRow key={a.id} actor={a} />)}
      </div>
    </div>
  );
}
