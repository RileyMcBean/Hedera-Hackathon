"use client";

import type { Verdict } from '../lib/types';

interface Props {
  verdict: Verdict;
  size?: 'sm' | 'md' | 'lg';
}

const config: Record<
  Verdict,
  { label: string; color: string; bg: string; border: string; dashed?: boolean }
> = {
  approved:         { label: 'APPROVED',          color: 'var(--approved)', bg: 'var(--approved-bg)',  border: 'var(--approved-border)' },
  denied:           { label: 'DENIED',            color: 'var(--denied)',   bg: 'var(--denied-bg)',    border: 'var(--denied-border)' },
  approval_required:{ label: 'APPROVAL REQUIRED', color: 'var(--pending)',  bg: 'var(--pending-bg)',   border: 'var(--pending-border)' },
  manual_review:    { label: 'MANUAL REVIEW',     color: 'var(--pending)',  bg: 'var(--pending-bg)',   border: 'var(--pending-border)', dashed: true },
};

const sizes = {
  sm: { fontSize: '9px',  padding: '2px 7px',  gap: '4px', dot: 5 },
  md: { fontSize: '10px', padding: '3px 9px',  gap: '5px', dot: 6 },
  lg: { fontSize: '12px', padding: '5px 12px', gap: '6px', dot: 7 },
};

export function StatusBadge({ verdict, size = 'md' }: Props) {
  const cfg = config[verdict] ?? config.manual_review;
  const sz  = sizes[size];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${sz.gap}px`,
        fontFamily: 'var(--font-mono)',
        fontWeight: 700,
        fontSize: sz.fontSize,
        letterSpacing: '0.1em',
        color: cfg.color,
        background: cfg.bg,
        border: `1px ${cfg.dashed ? 'dashed' : 'solid'} ${cfg.border}`,
        borderRadius: '3px',
        padding: sz.padding,
        whiteSpace: 'nowrap',
        lineHeight: 1,
      }}
    >
      <span
        style={{
          width: `${sz.dot}px`,
          height: `${sz.dot}px`,
          borderRadius: '50%',
          background: cfg.color,
          flexShrink: 0,
          boxShadow: `0 0 5px ${cfg.color}`,
        }}
      />
      {cfg.label}
    </span>
  );
}
