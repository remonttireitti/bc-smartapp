import { Link } from 'react-router-dom';
import type { BreadcrumbItem } from '../lib/navigationTrail';

type Props = {
  items: BreadcrumbItem[];
  onNavigate?: (to: string) => void;
};

export default function NavigationBreadcrumb({ items, onNavigate }: Props) {
  if (items.length === 0) return null;

  return (
    <p className="breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`}>
            {index > 0 && ' / '}
            {item.to && !isLast ? (
              onNavigate ? (
                <button type="button" className="breadcrumb-link" onClick={() => onNavigate(item.to!)}>
                  {item.label}
                </button>
              ) : (
                <Link to={item.to}>{item.label}</Link>
              )
            ) : (
              item.label
            )}
          </span>
        );
      })}
    </p>
  );
}
