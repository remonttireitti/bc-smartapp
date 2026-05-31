import { useCallback, useRef, useState } from 'react';
import {
  nearestReadingAtTime,
  trendHoverLeftPct,
  trendHoverTimeMs,
  type VrfReading,
  type VrfTrendPeriod,
} from '../lib/vrfMonitoring';

export function useVrfTrendHover(readings: VrfReading[], period: VrfTrendPeriod) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ leftPct: number; reading: VrfReading } | null>(null);

  const onMouseMove = useCallback(
    (event: React.MouseEvent) => {
      const el = trackRef.current;
      if (!el) return;
      const leftPct = trendHoverLeftPct(event.clientX, el.getBoundingClientRect());
      const reading = nearestReadingAtTime(readings, period, trendHoverTimeMs(leftPct, period));
      if (!reading) {
        setHover(null);
        return;
      }
      setHover({ leftPct, reading });
    },
    [readings, period],
  );

  const onMouseLeave = useCallback(() => setHover(null), []);

  return { trackRef, hover, onMouseMove, onMouseLeave };
}
