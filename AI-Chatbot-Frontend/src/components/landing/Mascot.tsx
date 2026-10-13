interface MascotProps {
  mood?: 'happy' | 'thinking' | 'cheer';
  size?: number;
}

/** Friendly owl study buddy. Pure SVG, no external assets, kid safe. */
export function Mascot({ mood = 'happy', size = 72 }: MascotProps) {
  const mouth =
    mood === 'thinking' ? (
      <ellipse cx="60" cy="78" rx="7" ry="4" fill="#1E293B" />
    ) : mood === 'cheer' ? (
      <path d="M48 74 Q60 88 72 74 Q60 79 48 74 Z" fill="#1E293B" />
    ) : (
      <path d="M50 73 Q60 82 70 73" stroke="#1E293B" strokeWidth="3" strokeLinecap="round" fill="none" />
    );

  return (
    <div className="mascot-float" style={{ width: size, height: size }} role="img" aria-label="Shikhi the owl, your study friend">
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
        <ellipse cx="60" cy="108" rx="30" ry="7" fill="#E2E8F0" opacity="0.9" />
        <ellipse cx="60" cy="62" rx="42" ry="44" fill="#8B5CF6" stroke="#1E293B" strokeWidth="3" />
        <ellipse cx="60" cy="66" rx="30" ry="28" fill="#EDE9FE" />
        <circle cx="46" cy="54" r="13" fill="#fff" stroke="#1E293B" strokeWidth="3" />
        <circle cx="74" cy="54" r="13" fill="#fff" stroke="#1E293B" strokeWidth="3" />
        <circle cx="46" cy="55" r="5.5" fill="#1E293B">
          <animate attributeName="cy" values="55;53;55" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx="74" cy="55" r="5.5" fill="#1E293B">
          <animate attributeName="cy" values="55;53;55" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx="48" cy="53" r="1.8" fill="#fff" />
        <circle cx="76" cy="53" r="1.8" fill="#fff" />
        <path d="M56 64 L64 64 L60 70 Z" fill="#FBBF24" stroke="#1E293B" strokeWidth="2" strokeLinejoin="round" />
        {mouth}
        <path d="M28 42 L18 30 L32 34 Z" fill="#FBBF24" stroke="#1E293B" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M92 42 L102 30 L88 34 Z" fill="#FBBF24" stroke="#1E293B" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M34 96 Q60 104 86 96" stroke="#34D399" strokeWidth="5" strokeLinecap="round" fill="none" />
        <rect x="42" y="94" width="36" height="9" rx="4.5" fill="#FBBF24" stroke="#1E293B" strokeWidth="2" />
      </svg>
    </div>
  );
}

export function MiniStars({ count = 3 }: { count?: number }) {
  return (
    <span className="mini-stars" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="mini-star" style={{ animationDelay: `${i * 0.35}s` }}>
          ★
        </span>
      ))}
    </span>
  );
}
