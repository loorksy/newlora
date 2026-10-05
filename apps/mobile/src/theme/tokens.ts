import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Visual tokens adapted from HKUDS/nanobot WebUI `webui/src/globals.css`
 * at 63bdd402803a3b055d7a249fd059c4cfb0e7ca98 (MIT).
 * Newlora reimplements the values in React Native; it does not vendor Nanobot source.
 */
export type Palette = {
  bg: string;
  surface: string;
  elevated: string;
  strong: string;
  border: string;
  text: string;
  secondary: string;
  /** Near-black (light) or near-white (dark) fill used for primary controls. */
  primary: string;
  primaryForeground: string;
  /** Neutral hover fill from Nanobot `--accent`, not a brand color. */
  accent: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarContent: string;
  sidebarMuted: string;
  sidebarSelected: string;
  settingsSurface: string;
  usage: string;
  success: string;
  danger: string;
  raised: string;
  muted: string;
};

export const lightPalette: Palette = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  elevated: '#F5F5F5',
  strong: '#E4E4E4',
  border: '#E9E7E5',
  text: '#1E1E20',
  secondary: '#737373',
  primary: '#27272A',
  primaryForeground: '#FAFAFA',
  accent: '#F5F5F5',
  sidebar: '#F7F7F6',
  sidebarForeground: '#0A0A0A',
  sidebarContent: '#4A4A4F',
  sidebarMuted: '#6E6E72',
  sidebarSelected: '#E4E4E4',
  settingsSurface: '#F7F7F6',
  usage: '#EF8C2E',
  success: '#3F7A55',
  danger: '#EF4444',
  raised: '#FFFFFF',
  muted: '#737373',
};

export const darkPalette: Palette = {
  bg: '#303030',
  surface: '#383838',
  elevated: '#383838',
  strong: '#4C4C4C',
  border: '#474747',
  text: '#F4F4F5',
  secondary: '#A6A6A6',
  primary: '#FAFAFA',
  primaryForeground: '#171717',
  accent: '#404040',
  sidebar: '#383838',
  sidebarForeground: '#FAFAFA',
  sidebarContent: '#D5D5D7',
  sidebarMuted: '#B1B1B4',
  sidebarSelected: '#4C4C4C',
  settingsSurface: '#383838',
  usage: '#EF8C2E',
  success: '#8FBFA3',
  danger: '#F87171',
  raised: '#383838',
  muted: '#A6A6A6',
};

/** Light palette matches Nanobot `:root` and is the unconfigured default. */
export const colors = lightPalette;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/** Shape scale from Nanobot `--radius-*` (px). */
export const radius = {
  sm: 4,
  md: 12,
  lg: 22,
  mark: 4,
  compact: 8,
  control: 12,
  floating: 18,
  panel: 22,
  modal: 22,
  prominent: 28,
  pill: 999,
} as const;

export const type: Record<
  'title' | 'section' | 'body' | 'meta' | 'button' | 'hero',
  TextStyle
> = {
  hero: { fontSize: 34, lineHeight: 37, fontWeight: '400' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.3 },
  section: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 24, fontWeight: '400' },
  meta: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  button: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
};

export const shadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 24,
  },
  default: { elevation: 3 },
}) as ViewStyle;

export const hit = 44;
