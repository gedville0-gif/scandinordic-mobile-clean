import { Redirect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { COLORS } from '../constants/colors';
import { isOnboardingCompleted } from '../lib/storage';

export default function Index() {
  const { user, loading } = useAuth();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loading && user) {
      isOnboardingCompleted().then(setOnboardingDone);
    }
  }, [loading, user]);

  if (loading || (user && onboardingDone === null)) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  if (user) {
    if (!onboardingDone) return <Redirect href="/(onboarding)/profession" />;
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
