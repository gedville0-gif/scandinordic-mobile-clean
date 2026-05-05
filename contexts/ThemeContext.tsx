import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { applyColorsForMode } from '../constants/colors';
import { getSettings, saveSettings } from '../lib/storage';

type ThemeMode = 'dark' | 'light';

type ThemeContextType = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    getSettings().then(settings => {
      const loaded: ThemeMode = settings?.darkMode === false ? 'light' : 'dark';
      applyColorsForMode(loaded);
      setModeState(loaded);
    });
  }, []);

  const setMode = async (newMode: ThemeMode) => {
    applyColorsForMode(newMode);
    setModeState(newMode);
    const settings = await getSettings();
    await saveSettings({ ...(settings ?? {}), darkMode: newMode === 'dark' });
  };

  const toggleTheme = async () => {
    await setMode(mode === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ mode, setMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
