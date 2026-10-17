import { BRAND_ICON_SVG, BRAND_LOGO_HORIZONTAL_SVG } from '../lib/brandAssets';

type Props = {
  /** 'mark' = icon + CSS wordmark; 'horizontal' = full SVG wordmark image */
  variant?: 'mark' | 'horizontal' | 'icon';
  className?: string;
  /** Icon size in CSS (mark/icon). Default 1.5rem */
  size?: string;
  alt?: string;
};

/** BC Smartapp -logo. Käytä headerissä, kirjautumisessa ja etusivulla. */
export default function BrandLogo({
  variant = 'mark',
  className = '',
  size = '1.6rem',
  alt = 'BC Smartapp',
}: Props) {
  if (variant === 'horizontal') {
    return (
      <img
        className={`brand-logo brand-logo--horizontal ${className}`.trim()}
        src={BRAND_LOGO_HORIZONTAL_SVG}
        alt={alt}
        draggable={false}
      />
    );
  }
  if (variant === 'icon') {
    return (
      <img
        className={`brand-logo brand-logo--icon ${className}`.trim()}
        src={BRAND_ICON_SVG}
        alt=""
        aria-hidden={alt ? undefined : true}
        style={{ width: size, height: size }}
        draggable={false}
      />
    );
  }
  return (
    <span className={`brand-logo brand-logo--mark ${className}`.trim()}>
      <img
        className="brand-logo-mark-icon"
        src={BRAND_ICON_SVG}
        alt=""
        aria-hidden="true"
        style={{ width: size, height: size }}
        draggable={false}
      />
      <span className="brand-logo-wordmark" aria-label={alt}>
        <strong>BC</strong> Smartapp
      </span>
    </span>
  );
}
