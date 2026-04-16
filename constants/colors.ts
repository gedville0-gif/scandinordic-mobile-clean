export const Colors = {
  dark: {
    background: '#080808',
    surface: '#101010',
    card: 'rgba(255,255,255,0.04)',
    input: '#171717',
    border: 'rgba(212,163,79,0.18)',

    text: '#F5F1E8',
    muted: '#A89F91',

    gold: '#D4A34F',
    green: '#5FBF7A',
    red: '#E16A5E',
    blue: '#5E8FFF',

    navBg: '#0B0B0B',
    navActive: '#D4A34F',
    navInactive: '#8D857A',
  },

  light: {
    background: '#F7F1E7',
    surface: '#FFFDF9',
    card: '#FFFFFF',
    input: '#F1EBDD',
    border: 'rgba(184,134,43,0.18)',

    text: '#1A1816',
    muted: '#6E675D',

    gold: '#B8862B',
    green: '#2F9E5B',
    red: '#D14B3F',
    blue: '#3C6DF0',

    navBg: '#FFF8EE',
    navActive: '#B8862B',
    navInactive: '#8A8175',
  },
};

// Flat alias used by all screens — mutated by applyColorsForMode on theme change
export const COLORS = {
  background: Colors.dark.background,
  surface: Colors.dark.surface,
  card: Colors.dark.card,
  cardElevated: 'rgba(255,255,255,0.07)',
  input: Colors.dark.input,
  border: Colors.dark.border,
  text: Colors.dark.text,
  textSecondary: Colors.dark.muted,
  muted: Colors.dark.muted,
  primary: Colors.dark.gold,
  primaryBright: '#E0B45A',
  primaryDim: 'rgba(212,163,79,0.15)',
  success: Colors.dark.green,
  successDim: 'rgba(95,191,122,0.15)',
  danger: Colors.dark.red,
  dangerDim: 'rgba(225,106,94,0.15)',
  info: Colors.dark.blue,
  infoDim: 'rgba(94,143,255,0.15)',
  tabBar: Colors.dark.navBg,
  warning: '#F59E0B',
  warningDim: 'rgba(245,158,11,0.15)',
  accent: '#A78BFA',
  accentDim: 'rgba(167,139,250,0.15)',
};

export function applyColorsForMode(mode: 'dark' | 'light') {
  const c = Colors[mode];
  const d = mode === 'dark';
  COLORS.background    = c.background;
  COLORS.surface       = c.surface;
  COLORS.card          = c.card;
  COLORS.cardElevated  = d ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)';
  COLORS.input         = c.input;
  COLORS.border        = c.border;
  COLORS.text          = c.text;
  COLORS.textSecondary = c.muted;
  COLORS.muted         = c.muted;
  COLORS.primary       = c.gold;
  COLORS.primaryBright = d ? '#E0B45A' : '#C99930';
  COLORS.primaryDim    = d ? 'rgba(212,163,79,0.15)' : 'rgba(184,134,43,0.12)';
  COLORS.success       = c.green;
  COLORS.successDim    = d ? 'rgba(95,191,122,0.15)' : 'rgba(47,158,91,0.12)';
  COLORS.danger        = c.red;
  COLORS.dangerDim     = d ? 'rgba(225,106,94,0.15)' : 'rgba(209,75,63,0.12)';
  COLORS.info          = c.blue;
  COLORS.infoDim       = d ? 'rgba(94,143,255,0.15)' : 'rgba(60,109,240,0.12)';
  COLORS.tabBar        = c.navBg;
  COLORS.warning       = d ? '#F59E0B' : '#D97706';
  COLORS.warningDim    = d ? 'rgba(245,158,11,0.15)' : 'rgba(217,119,6,0.12)';
  COLORS.accent        = d ? '#A78BFA' : '#7C3AED';
  COLORS.accentDim     = d ? 'rgba(167,139,250,0.15)' : 'rgba(124,58,237,0.12)';
}
