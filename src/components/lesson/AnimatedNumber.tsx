import { useEffect, useRef, useState } from 'react';

import { AppText, type AppTextProps } from '@/src/components/ui/AppText';
import { useMotionReduced } from '@/src/utils/feedback';

/** Counts up to `value` on change. Purely presentational: the value itself comes from the game module. */
export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 600,
  prefix = '',
  suffix = '',
  ...text
}: { value: number; decimals?: number; duration?: number; prefix?: string; suffix?: string } & AppTextProps) {
  const reduced = useMotionReduced();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      from.current = value;
      return;
    }
    const start = Date.now();
    const startValue = from.current;
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(startValue + (value - startValue) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced]);

  return (
    <AppText tabular accessibilityLabel={`${prefix}${value.toFixed(decimals)}${suffix}`} {...text}>
      {prefix}
      {(reduced ? value : shown).toFixed(decimals)}
      {suffix}
    </AppText>
  );
}
