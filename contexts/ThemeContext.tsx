import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Colors, applyColorsForMode } from '../constants/colors';
import { getSettings, saveSettings } from '../lib/storage';

type ThemeMode = 'dark' | 'light';

type ThemeContextType = {
  theme: typeof Colors.dark;
  mode: ThemeMode;
  toggleTheme: () => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    const loadTheme = async () => {
      const settings = await getSettings();
      const newMode: ThemeMode = settings?.darkMode === false ? 'light' : 'dark';
      applyColorsForMode(newMode);
      setModeState(newMode);
    };

    loadTheme();
  }, []);

  const setMode = async (newMode: ThemeMode) => {
    applyColorsForMode(newMode);
    setModeState(newMode);
    const settings = await getSettings();
    await saveSettings({ ...(settings ?? {}), darkMode: newMode === 'dark' });
  };

  const toggleTheme = async () => {
    const newMode = mode === 'dark' ? 'light' : 'dark';
    await setMode(newMode);
  };

  const theme = Colors[mode];

  return (
    <ThemeContext.Provider value={{ theme, mode, toggleTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return ctx;
}
