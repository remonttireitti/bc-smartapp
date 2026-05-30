import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

type Crumb = {
  href?: string;
  label: string;
};

type Props = {
  crumbs: Crumb[];
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  sticky?: boolean;
};

export default function TempMonitoringPageHeader({
  crumbs,
  title,
  subtitle,
  actions,
  sticky = false,
}: Props) {
  return (
    <header className={`temp-page-header page-header${sticky ? ' temp-page-header--sticky' : ''}`}>
      <div className="temp-page-header-main">
        <nav className="breadcrumb temp-breadcrumb" aria-label="Sijainti">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="temp-breadcrumb-item">
              {index > 0 && <span className="temp-breadcrumb-sep">/</span>}
              {crumb.href ? <Link to={crumb.href}>{crumb.label}</Link> : <span>{crumb.label}</span>}
            </span>
          ))}
        </nav>
        <h1>{title}</h1>
        {subtitle && <div className="temp-page-subtitle muted">{subtitle}</div>}
      </div>
      {actions && <div className="temp-page-header-actions page-header-actions">{actions}</div>}
    </header>
  );
}
