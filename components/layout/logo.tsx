export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M10 9v8.5a6 6 0 0 0 12 0V9" fill="none" stroke="var(--bg)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="23.5" r="0" fill="var(--bg)" />
    </svg>
  );
}
