interface Props {
  onReset: () => void;
  resetting: boolean;
}

export function Header({ onReset, resetting }: Props) {
  return (
    <header
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
        height: '52px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle dot-grid texture */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(circle, oklch(0.30 0.018 230 / 0.5) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          pointerEvents: 'none',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', position: 'relative' }}>
        {/* Shield wordmark */}
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
          <path
            d="M13 1.5L2.5 6.2V12.5C2.5 18.5 7.1 24 13 25.5C18.9 24 23.5 18.5 23.5 12.5V6.2L13 1.5Z"
            fill="oklch(0.76 0.17 174 / 0.12)"
            stroke="oklch(0.76 0.17 174)"
            strokeWidth="1.25"
          />
          {/* Check mark */}
          <path
            d="M9 13l2.5 2.5L17 10"
            stroke="oklch(0.76 0.17 174)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: '13px',
              color: 'var(--text)',
              letterSpacing: '0.15em',
              lineHeight: 1,
            }}
          >
            SIKA SENTINEL
          </div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '10px',
              color: 'var(--muted)',
              fontWeight: 500,
              letterSpacing: '0.01em',
              lineHeight: 1,
            }}
          >
            Runtime Control &amp; Evidence Layer — SikaHub
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', position: 'relative' }}>
        {/* Network pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            padding: '4px 10px',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--approved)',
              boxShadow: '0 0 6px oklch(0.76 0.17 174 / 0.8)',
              display: 'block',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--muted)',
              letterSpacing: '0.08em',
              fontWeight: 500,
            }}
          >
            HEDERA TESTNET
          </span>
        </div>

        <button
          onClick={onReset}
          disabled={resetting}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: resetting ? 'var(--faint)' : 'var(--denied)',
            background: 'transparent',
            border: `1px solid ${resetting ? 'var(--border)' : 'oklch(0.58 0.22 16 / 0.35)'}`,
            borderRadius: '3px',
            padding: '5px 12px',
            cursor: resetting ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={e => {
            if (!resetting) {
              (e.currentTarget as HTMLButtonElement).style.background = 'oklch(0.58 0.22 16 / 0.08)';
            }
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          {resetting ? 'RESETTING...' : 'RESET DEMO'}
        </button>
      </div>
    </header>
  );
}
