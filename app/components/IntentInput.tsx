"use client";

import { useRef, useState } from 'react';
import type { Actor } from '../lib/types';

interface Props {
  actors: Actor[];
  onSubmit: (text: string, actorId: string) => void;
  submitting: boolean;
}

const DEMO_BEATS = [
  { beat: '01', label: 'Clean transfer',  text: 'Send 50 HBAR to 0.0.800',               actor: '0.0.100' },
  { beat: '02', label: 'Over limit',      text: 'Transfer 200 HBAR to 0.0.800',          actor: '0.0.100' },
  { beat: '03', label: 'Bad recipient',   text: 'Pay 10 HBAR to 0.0.999 for contractor', actor: '0.0.200' },
];

export function IntentInput({ actors, onSubmit, submitting }: Props) {
  const [text, setText] = useState('');
  const [actorId, setActorId] = useState(actors[0]?.id ?? '0.0.100');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    onSubmit(trimmed, actorId);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        overflow: 'hidden',
      }}
    >
      {/* Window chrome */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-alt)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.58 0.22 16 / 0.7)' }} />
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.78 0.16 60 / 0.7)' }} />
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.76 0.17 174 / 0.7)' }} />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--faint)',
              marginLeft: '8px',
              letterSpacing: '0.06em',
              fontWeight: 400,
            }}
          >
            sentinel://intent-input
          </span>
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          {DEMO_BEATS.map(b => (
            <button
              key={b.beat}
              onClick={() => {
                setText(b.text);
                setActorId(b.actor);
                textareaRef.current?.focus();
              }}
              disabled={submitting}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'var(--muted)',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                padding: '2px 7px',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.color = 'var(--approved)';
                el.style.borderColor = 'var(--approved-border)';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.color = 'var(--muted)';
                el.style.borderColor = 'var(--border)';
              }}
            >
              BEAT {b.beat}
            </button>
          ))}
        </div>
      </div>

      {/* Actor selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px 0' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            fontWeight: 700,
            color: 'var(--faint)',
            letterSpacing: '0.12em',
            flexShrink: 0,
          }}
        >
          ACTOR
        </span>
        <select
          value={actorId}
          onChange={e => setActorId(e.target.value)}
          disabled={submitting}
          style={{
            flex: 1,
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 400,
            color: 'var(--text)',
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            padding: '5px 8px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {actors.map(a => (
            <option key={a.id} value={a.id}>
              {a.id} · {a.role} · {a.amount_threshold_hbar} HBAR limit{a.enforce_recipient_allowlist ? ' · allowlist enforced' : ' · open access'}
            </option>
          ))}
        </select>
      </div>

      {/* Text input */}
      <div style={{ padding: '8px 14px 0', position: 'relative' }}>
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '20px',
            left: '14px',
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--approved)',
            userSelect: 'none',
            pointerEvents: 'none',
            lineHeight: 1.6,
          }}
        >
          ›
        </span>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitting}
          rows={3}
          placeholder="Enter a natural-language payout or treasury instruction..."
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            fontWeight: 400,
            padding: '8px 8px 8px 20px',
            resize: 'none',
            lineHeight: '1.6',
            caretColor: 'var(--approved)',
          }}
        />
      </div>

      {/* Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px 12px',
        }}
      >
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--faint)' }}>
          ⌘↵ execute
        </span>
        <button
          onClick={handleSubmit}
          disabled={submitting || !text.trim()}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: submitting || !text.trim() ? 'var(--faint)' : 'oklch(0.08 0.012 230)',
            background: submitting || !text.trim() ? 'var(--border)' : 'var(--approved)',
            border: 'none',
            borderRadius: '3px',
            padding: '8px 20px',
            cursor: submitting || !text.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: submitting || !text.trim() ? 'none' : '0 0 14px oklch(0.76 0.17 174 / 0.35)',
          }}
        >
          {submitting ? 'PROCESSING...' : 'EXECUTE'}
        </button>
      </div>
    </div>
  );
}
