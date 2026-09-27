/** The app mark: an isometric block, green on black. Same drawing as public/favicon.svg. */
export function LogoMark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2 29 9.5 16 17 3 9.5Z" fill="#6fdc3c" />
      <path d="M3 9.5 16 17v13L3 22.5Z" fill="#2f7a17" />
      <path d="M16 17 29 9.5v13L16 30Z" fill="#1c4d0d" />
      <path d="M16 2 29 9.5 16 17 3 9.5Z" fill="none" stroke="#b4f58f" strokeOpacity=".4" strokeWidth=".6" />
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
