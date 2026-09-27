/** The app mark: an isometric grass block. Same drawing as public/favicon.svg. */
export function LogoMark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2 29 9.5 16 17 3 9.5Z" fill="#7cc24a" />
      <path d="M3 9.5 16 17v13L3 22.5Z" fill="#8a5a3b" />
      <path d="M16 17 29 9.5v13L16 30Z" fill="#6b4429" />
      <path d="M3 9.5 16 17v3.5L3 13Z" fill="#5f9a37" />
      <path d="M16 17 29 9.5V13l-13 7.5Z" fill="#4c7f2b" />
      <path d="M16 2 29 9.5 16 17 3 9.5Z" fill="none" stroke="#a6dd7c" strokeOpacity=".35" strokeWidth=".6" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-pixel text-[15px] leading-none tracking-wide text-fg">Megablock</span>
    </span>
  );
}
