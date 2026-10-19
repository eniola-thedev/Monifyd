export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="11" fill="#5be37d" />
        <path d="M10.5 29V12.5L20 22.5L29.5 12.5V24" fill="none" stroke="#052112" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="29.5" cy="30" r="3.2" fill="#052112" />
      </svg>
      Monifyd
    </span>
  );
}
