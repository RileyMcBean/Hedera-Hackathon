import type { PipelineStages, StageStatus } from '../types';

interface Props {
  stages: PipelineStages;
}

const STAGES = [
  { key: 'intent' as const,    num: '01', label: 'INTENT',    sub: 'NL Parsing' },
  { key: 'context' as const,   num: '02', label: 'CONTEXT',   sub: 'Actor & Rules' },
  { key: 'policy' as const,    num: '03', label: 'POLICY',    sub: 'Clearance' },
  { key: 'execution' as const, num: '04', label: 'EXECUTION', sub: 'HBAR / HCS' },
  { key: 'evidence' as const,  num: '05', label: 'EVIDENCE',  sub: 'HCS Audit' },
];

interface StageColors {
  ring: string;
  fill: string;
  text: string;
  numColor: string;
  animation: string | undefined;
}

function stageColors(status: StageStatus, _isExecution: boolean): StageColors {
  switch (status) {
    case 'active':
      return {
        ring: 'oklch(0.78 0.16 60)',
        fill: 'oklch(0.78 0.16 60 / 0.15)',
        text: 'oklch(0.78 0.16 60)',
        numColor: 'oklch(0.78 0.16 60)',
        animation: 'ring-pulse 1.4s ease-out infinite',
      };
    case 'complete':
      return {
        ring: 'var(--approved)',
        fill: 'oklch(0.76 0.17 174 / 0.15)',
        text: 'var(--approved)',
        numColor: 'var(--approved)',
        animation: undefined,
      };
    case 'skipped':
      return {
        ring: 'var(--denied)',
        fill: 'oklch(0.58 0.22 16 / 0.10)',
        text: 'var(--denied)',
        numColor: 'var(--denied)',
        animation: undefined,
      };
    default: // idle
      return {
        ring: 'var(--border)',
        fill: 'transparent',
        text: 'var(--faint)',
        numColor: 'var(--faint)',
        animation: undefined,
      };
  }
}

function StageIcon({ status }: { status: StageStatus }) {
  if (status === 'active') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="2.5" fill="oklch(0.78 0.16 60)" />
        <circle cx="7" cy="7" r="2.5" fill="oklch(0.78 0.16 60)">
          <animate attributeName="r" values="2.5;5;2.5" dur="1.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0;1" dur="1.4s" repeatCount="indefinite" />
        </circle>
      </svg>
    );
  }
  if (status === 'complete') {
    return (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path
          d="M2.5 6.5L5.5 9.5L10.5 4"
          stroke="var(--approved)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === 'skipped') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 2L10 10M10 2L2 10" stroke="var(--denied)" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

function TrackSegment({
  leftStatus,
}: {
  leftStatus: StageStatus;
}) {
  const filled = leftStatus === 'complete';
  const denied = leftStatus === 'skipped';
  const trackColor = denied ? 'var(--denied)' : filled ? 'var(--approved)' : 'var(--border)';

  return (
    <div
      style={{
        flex: 1,
        height: '1px',
        background: 'var(--border)',
        position: 'relative',
        overflow: 'hidden',
        minWidth: '20px',
        alignSelf: 'flex-start',
        marginTop: '20px', // vertically center with circle (circle is 40px so 20px offset)
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: trackColor,
          transformOrigin: 'left center',
          transform: filled || denied ? 'scaleX(1)' : 'scaleX(0)',
          transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)',
        }}
      />
    </div>
  );
}

export function PipelineView({ stages }: Props) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '16px 20px 14px',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          color: 'var(--faint)',
          letterSpacing: '0.14em',
          fontWeight: 500,
          marginBottom: '16px',
        }}
      >
        CLEARANCE PIPELINE
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {STAGES.map((stage, i) => {
          const status = stages[stage.key];
          const colors = stageColors(status, stage.key === 'execution');
          const isLast = i === STAGES.length - 1;
          const prevStatus = i > 0 ? stages[STAGES[i - 1].key] : null;

          return (
            <div key={stage.key} style={{ display: 'flex', alignItems: 'flex-start', flex: isLast ? 0 : 1 }}>
              {/* Stage node + label */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  flexShrink: 0,
                }}
              >
                {/* Circular node */}
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    border: `1.5px solid ${colors.ring}`,
                    background: colors.fill,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'border-color 0.4s ease, background 0.4s ease',
                    animation: colors.animation,
                    position: 'relative',
                    flexShrink: 0,
                  }}
                >
                  {status === 'idle' ? (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: colors.numColor,
                        letterSpacing: '-0.02em',
                        transition: 'color 0.4s ease',
                      }}
                    >
                      {stage.num}
                    </span>
                  ) : (
                    <StageIcon status={status} />
                  )}
                </div>

                {/* Labels */}
                <div style={{ textAlign: 'center', width: '68px' }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '8.5px',
                      fontWeight: 700,
                      color: colors.text,
                      letterSpacing: '0.1em',
                      transition: 'color 0.4s ease',
                      lineHeight: 1.2,
                    }}
                  >
                    {stage.label}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '10px',
                      color: 'var(--faint)',
                      marginTop: '2px',
                      lineHeight: 1.2,
                    }}
                  >
                    {stage.sub}
                  </div>
                </div>
              </div>

              {/* Track segment between nodes */}
              {!isLast && prevStatus !== null && (
                <TrackSegment leftStatus={status} />
              )}
              {!isLast && prevStatus === null && (
                <TrackSegment leftStatus={status} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
