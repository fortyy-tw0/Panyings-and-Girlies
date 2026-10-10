/**
 * Design tokens from the "Editable patterns" handoff page (PDF p. 123)
 * and "Mobile implementation" page (p. 121).
 *
 * Light palette only in this batch. Dark tokens from the handoff are listed in
 * `darkColors` for the upcoming Appearance work but are not wired up yet.
 */

export const colors = {
  primary: '#4E0078',
  onPrimary: '#FFFFFF',
  text: '#1E192B',
  textSecondary: '#62586A',
  canvas: '#FFFCF7',
  card: '#FFFFFF',
  emphasis: '#FFF4CC',
  checked: '#F3EAFF',
  border: '#DDD4DF',
  error: '#872D38',
  disabledBackground: '#EEE9EF',
  overlay: 'rgba(30, 25, 43, 0.4)',
} as const;

export const darkColors = {
  canvas: '#19131F',
  card: '#261E2E',
  accent: '#D8AEFF',
  text: '#FFF9FF',
  textSecondary: '#D2C7D9',
  border: '#8A7C94',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 40,
} as const;

export const radius = {
  field: 10,
  card: 16,
  pill: 999,
} as const;

/** Minimum touch target from the handoff (≥48 on both platforms). */
export const MIN_TOUCH = 48;

/** Horizontal content inset for phone screens. */
export const SCREEN_INSET = 20;
