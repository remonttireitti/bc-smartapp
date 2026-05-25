import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import Tooltip from './Tooltip';

type Props = {
  label: string;
  children: ReactNode;
  href?: string;
  target?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'danger';
  className?: string;
  tooltipSide?: 'top' | 'bottom';
};

export default function IconButton({
  label,
  children,
  href,
  target,
  onClick,
  disabled = false,
  variant = 'default',
  className = '',
  tooltipSide = 'top',
}: Props) {
  const classes = [
    'icon-btn',
    variant === 'danger' ? 'icon-btn-danger' : '',
    variant === 'primary' ? 'icon-btn-primary' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (href) {
    return (
      <Tooltip label={label} side={tooltipSide} touchHelp={false}>
        <Link
          to={href}
          className={classes}
          target={target}
          aria-label={label}
          title={label}
        >
          {children}
        </Link>
      </Tooltip>
    );
  }

  return (
    <Tooltip label={label} side={tooltipSide} touchHelp={false}>
      <button
        type="button"
        className={classes}
        disabled={disabled}
        aria-label={label}
        title={label}
        onClick={onClick}
      >
        {children}
      </button>
    </Tooltip>
  );
}
