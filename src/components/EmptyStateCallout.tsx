import { Link } from 'react-router-dom';

type Props = {
  title: string;
  description: string;
  primaryLabel: string;
  primaryTo: string;
  secondaryLabel?: string;
  secondaryTo?: string;
};

export default function EmptyStateCallout({
  title,
  description,
  primaryLabel,
  primaryTo,
  secondaryLabel,
  secondaryTo,
}: Props) {
  return (
    <div className="empty-state-callout">
      <strong>{title}</strong>
      <p className="muted">{description}</p>
      <div className="empty-state-callout-actions">
        <Link to={primaryTo} className="btn btn-primary">
          {primaryLabel}
        </Link>
        {secondaryLabel && secondaryTo ? (
          <Link to={secondaryTo} className="btn btn-secondary">
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
