import { type ReactNode } from 'react';
import { useHuoltoPrintFormLayout } from '../../hooks/useHuoltoPrintFormLayout';
import { useHuoltoCollapse } from './HuoltoEditUiContext';
import { PrintSubBox } from './print/MaintenancePrintLayout';

interface Props {
  title: string;
  children: ReactNode;
  partKey?: string;
  defaultOpen?: boolean;
  className?: string;
  accent?: string;
}

export function HuoltoPartSection({
  title,
  children,
  partKey,
  defaultOpen = false,
  className = '',
  accent,
}: Props) {
  const printLayout = useHuoltoPrintFormLayout();
  const key = partKey ?? `part:${title}`;
  const { open, toggle } = useHuoltoCollapse(key, printLayout ? true : defaultOpen);

  if (printLayout) {
    return (
      <PrintSubBox title={title.toUpperCase()} accent={accent} className={className}>
        {children}
      </PrintSubBox>
    );
  }

  return (
    <div
      className={`huolto-part-section ${open ? 'huolto-part-open' : 'huolto-part-collapsed'} ${className}`.trim()}
    >
      <button
        type="button"
        className="huolto-part-header"
        onClick={toggle}
        aria-expanded={open}
      >
        <span className="huolto-part-title">{title}</span>
        <span className="huolto-part-chevron" aria-hidden="true" />
      </button>
      {open ? <div className="huolto-part-body">{children}</div> : null}
    </div>
  );
}
