export function PrinterIcon({ title = 'Tulosta' }: { title?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </svg>
  );
}

export function DeviceCardIcon({ title = 'Laitekortti' }: { title?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h10" />
      <path d="M7 12h6" />
    </svg>
  );
}

/** Tulostin + kello — huoltohistorian tulostus */
export function HistoryIcon({ title = 'Huoltohistoria' }: { title?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <path d="M5 9V3h10v6" />
      <path d="M5 13H4a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 4 7.5h13A1.5 1.5 0 0 1 18.5 9v2.5A1.5 1.5 0 0 1 17 13h-1" />
      <path d="M6 12h9v7H6z" />
      <circle cx="17.5" cy="17.5" r="4.25" />
      <path d="M17.5 15.25V17.5l1.75 1.25" />
    </svg>
  );
}
