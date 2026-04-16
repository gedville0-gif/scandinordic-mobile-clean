import { StatusBar } from 'expo-status-bar';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { AuthProvider } from './contexts/AuthContext';
import LoginScreen from './screens/LoginScreen';

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <LoginScreen />
          <StatusBar style="light" />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
