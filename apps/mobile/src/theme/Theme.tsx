import React, { createContext, useContext, useMemo, useState } from 'react';
import { darkPalette, lightPalette, type Palette } from './tokens';

export type ThemeName = 'light' | 'dark';

const ThemeContext = createContext<{
  name: ThemeName;
  colors: Palette;
  setTheme: (name: ThemeName) => void;
}>({
  name: 'light',
  colors: lightPalette,
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [name, setTheme] = useState<ThemeName>('light');
  const value = useMemo(
    () => ({
      name,
      colors: name === 'dark' ? darkPalette : lightPalette,
      setTheme,
    }),
    [name],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useColors() {
  return useContext(ThemeContext).colors;
}
