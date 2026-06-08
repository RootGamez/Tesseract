import { useEffect, useState } from 'react';

/**
 * Reads the app's theme tokens (the HSL CSS variables defined in globals.css) as
 * concrete `hsl(...)` strings, and keeps them in sync when the theme switches
 * (light/dark/system toggles the `class` on <html>).
 *
 * Useful for canvas/SVG widgets (e.g. the roulette) that need real color values
 * instead of Tailwind classes, so they automatically respect the current theme.
 */
const TOKENS = [
  'primary', 'primary-foreground',
  'accent', 'accent-foreground',
  'background', 'card', 'foreground',
  'muted', 'muted-foreground', 'border',
] as const;

type Token = (typeof TOKENS)[number];
export type ThemeColors = Record<Token, string>;

function readThemeColors(): ThemeColors {
  const styles = getComputedStyle(document.documentElement);
  const out = {} as ThemeColors;
  for (const token of TOKENS) {
    const raw = styles.getPropertyValue(`--${token}`).trim(); // e.g. "235 80% 60%"
    out[token] = raw ? `hsl(${raw.replace(/\s+/g, ', ')})` : 'transparent';
  }
  return out;
}

export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(() =>
    typeof window === 'undefined'
      ? (Object.fromEntries(TOKENS.map((t) => [t, 'transparent'])) as ThemeColors)
      : readThemeColors(),
  );

  useEffect(() => {
    const update = () => setColors(readThemeColors());
    update();
    // The ThemeProvider toggles a class on <html>; re-read whenever it changes.
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    return () => observer.disconnect();
  }, []);

  return colors;
}
