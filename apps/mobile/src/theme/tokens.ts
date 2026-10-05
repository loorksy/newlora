import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const colors = {
  bg: '#090B0F',
  surface: '#0F1218',
  elevated: '#141822',
  strong: '#1A1F2B',
  border: '#252B38',
  text: '#F5F7FB',
  secondary: '#9299AA',
  accent: '#D8B77A',
  success: '#8EAA96',
  danger: '#C9847C',
  /** Aliases kept so existing views share the same palette. */
  raised: '#141822',
  muted: '#9299AA',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
} as const;

export const type: Record<
  'title' | 'section' | 'body' | 'meta' | 'button',
  TextStyle
> = {
  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  section: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  meta: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  button: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
};

export const shadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
  },
  default: { elevation: 6 },
}) as ViewStyle;

export const hit = 44;
