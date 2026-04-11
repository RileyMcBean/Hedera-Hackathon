"use client";

import { useEffect, useRef, useState } from 'react';
import type { AuditRecord } from '../lib/types';
import { AuditCard } from './AuditCard';

interface Props {
  records: AuditRecord[];
  onReplay: () => void;
  replaying: boolean;
  latestId?: string;
}

export function AuditTrail({ records, onReplay, replaying, latestId }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [prevCount, setPrevCount] = useState(records.length);

  useEffect(() => {
    if (records.length > prevCount && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    setPrevCount(records.length);
  }, [records.length, prevCount]);

  const approved = records.filter(r => r.decision.verdict === 'approved').length;
  const denied   = records.filter(r => r.decision.verdict === 'denied').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            fontWeight: 700,
            color: 'var(--faint)',
            letterSpacing: '0.14em',
            marginBottom: '10px',
          }}
        >
          HCS AUDIT TRAIL
        </div>

        <div style={{ display: 'flex', gap: '14px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: 'var(--approved)', lineHeight: 1 }}>
              {approved}
            </span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--muted)' }}>approved</span>
          </div>
          <div style={{ width: '1px', height: '16px', background: 'var(--border)', alignSelf: 'center' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: 'var(--denied)', lineHeight: 1 }}>
              {denied}
            </span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--muted)' }}>denied</span>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--faint)', alignSelf: 'center' }}>
            {records.length} total
          </span>
        </div>

        <button
          onClick={onReplay}
          disabled={replaying}
          style={{
            width: '100%',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: replaying ? 'var(--faint)' : 'var(--pending)',
            background: 'transparent',
            border: `1px solid ${replaying ? 'var(--border)' : 'oklch(0.78 0.16 60 / 0.35)'}`,
            borderRadius: '3px',
            padding: '7px 0',
            cursor: replaying ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLButtonElement;
            if (!el.disabled) el.style.background = 'oklch(0.78 0.16 60 / 0.07)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          {replaying ? '▶  REFRESHING...' : '▶  REFRESH AUDIT TRAIL'}
        </button>
      </div>

      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}
      >
        {records.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '12px',
              padding: '24px',
            }}
          >
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" opacity={0.2}>
              <rect x="7" y="16" width="22" height="16" rx="2" stroke="var(--muted)" strokeWidth="1.5" fill="none" />
              <path d="M12 16v-5a6 6 0 1 1 12 0v5" stroke="var(--muted)" strokeWidth="1.5" fill="none" />
              <circle cx="18" cy="24" r="2" fill="var(--muted)" />
            </svg>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>
                No decisions recorded
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '11px',
                  color: 'var(--faint)',
                  lineHeight: '1.5',
                  maxWidth: '22ch',
                  textAlign: 'center',
                }}
              >
                Submit an intent above. Every decision — approved or denied — is written here immutably.
              </div>
            </div>
          </div>
        ) : (
          records.map((record, i) => (
            <AuditCard
              key={record.intent_id}
              record={record}
              isNew={i === 0 && record.intent_id === latestId}
            />
          ))
        )}
      </div>
    </div>
  );
}
