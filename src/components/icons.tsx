type IconProps = { className?: string };

export function IconTrash({ className = 'ui-icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconPrint({ className = 'ui-icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 3h10v4H7V3zm12 8H5a2 2 0 0 0-2 2v5h4v3h10v-3h4v-5a2 2 0 0 0-2-2zm-2 8H7v-4h10v4z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconBack({ className = 'ui-icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15 7.4 10.4 12l4.6 4.6L14 18l-6-6 6-6 1 1.4z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconGear({ className = 'ui-icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 8.5A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5zm8.1 4.4 1.3-.8-.9-1.6-1.5.6a7.2 7.2 0 0 0-1.2-.7l-.2-1.6h-1.8l-.2 1.6a7.2 7.2 0 0 0-1.2.7l-1.5-.6-.9 1.6 1.3.8a7.4 7.4 0 0 0 0 1.4l-1.3.8.9 1.6 1.5-.6c.4.3.8.5 1.2.7l.2 1.6h1.8l.2-1.6c.4-.2.8-.4 1.2-.7l1.5.6.9-1.6-1.3-.8a7.4 7.4 0 0 0 0-1.4z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconDraft({ className = 'ui-icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m14 3 7 7-10 10H4v-7L14 3zm1.4 1.4L6 13.6V18h4.4l9.4-9.4-4.4-4.2z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconDelegated({ className = 'ui-icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 12h12.2l-3.6-3.6L13 6.8l6.2 6.2-6.2 6.2-1.4-1.4 3.6-3.6H3v-2z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconScheduled({ className = 'ui-icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 3h2v2h6V3h2v2h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1V3zm12 8H5v9h14v-9z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconInProgress({ className = 'ui-icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2a10 10 0 1 0 10 10h-2A8 8 0 1 1 12 4V2zm0 4v6l4.2 2.4-.9 1.6L10 13V6h2z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconCompleted({ className = 'ui-icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9.5 16.2 4.8 11.5l1.4-1.4 3.3 3.3 8.3-8.3 1.4 1.4-9.7 9.7z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconBilled({ className = 'ui-icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconInvoiceOpen({ className = 'ui-icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5zM8 11h8v1.5H8V11zm0 3.5h5v1.5H8V14.5z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconHelp({ className = 'ui-icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 15h-2v-2h2v2zm1.2-7.1c0 1.4-1.2 2-2 2.4-.4.2-.8.5-.8 1.1v.6h-2v-.8c0-1.2 1-1.8 1.8-2.2.7-.4 1.2-.7 1.2-1.5 0-.9-.8-1.5-1.8-1.5-1 0-1.7.6-1.9 1.4l-1.9-.4c.3-1.6 1.7-3 3.8-3 2.2 0 3.7 1.4 3.7 3.4z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconEuro({ className = 'ui-icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14.5 5.5A6.5 6.5 0 0 0 8.4 9H5v2h2.7a6.4 6.4 0 0 0-.2 1 6.4 6.4 0 0 0 .2 1H5v2h3.4a6.5 6.5 0 0 0 6.1 3.5V17h2v-1.7c1.9-.5 3.3-2 3.7-3.8h-2.4a3.6 3.6 0 0 1-3.3 2.1H9.8c.4-1.1 1.2-2 2.3-2.5h5.4V9h-5.4c1.1-.5 1.9-1.4 2.3-2.5h2.7V5.5h-2.3z"
        fill="currentColor"
      />
    </svg>
  );
}
