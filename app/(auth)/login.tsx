import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

export default function LoginScreen() {
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const { t } = useLanguage();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    try {
      if (isSignUp) await signUp(email.trim(), password);
      else await signIn(email.trim(), password);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSocialLoading('google');
    try {
      await signInWithGoogle();
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Google sign-in failed');
    } finally {
      setSocialLoading(null);
    }
  };

  const handleApple = async () => {
    Alert.alert('Coming soon', 'Apple sign-in will be available soon.');
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.orb1} />
        <View style={styles.orb2} />

        <View style={styles.header}>
          <Text style={styles.badge}>◆ SCANDINORDIC PRO ◆</Text>
          <Text style={styles.title}>
            {isSignUp ? t('createAccount') : t('welcomeBack')}
          </Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.socialRow}>
          <Pressable
            style={({ pressed }) => [styles.socialBtn, pressed && styles.pressed]}
            onPress={handleGoogle}
            disabled={!!socialLoading}
          >
            {socialLoading === 'google' ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <>
                <Text style={styles.socialIcon}>G</Text>
                <Text style={styles.socialLabel}>Google</Text>
              </>
            )}
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.socialBtn, pressed && styles.pressed]}
            onPress={handleApple}
            disabled={!!socialLoading}
          >
            <>
              <Text style={styles.socialIcon}></Text>
              <Text style={styles.socialLabel}>Apple</Text>
            </>
          </Pressable>
        </View>

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>{t('or')}</Text>
          <View style={styles.orLine} />
        </View>

        <View style={styles.form}>
          <View style={styles.inputWrap}>
            <Feather name="mail" size={15} color={COLORS.muted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={t('email')}
              placeholderTextColor={COLORS.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="next"
            />
          </View>
          <View style={styles.inputWrap}>
            <Feather name="lock" size={15} color={COLORS.muted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder={t('password')}
              placeholderTextColor={COLORS.muted}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showPassword}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
            <Pressable onPress={() => setShowPassword(v => !v)} hitSlop={8}>
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={15} color={COLORS.muted} />
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryPressed]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.background} size="small" />
            ) : (
              <Text style={styles.primaryLabel}>
                {isSignUp ? t('signUp') : t('signIn')}
              </Text>
            )}
          </Pressable>
        </View>

        <Pressable onPress={() => setIsSignUp(v => !v)} style={styles.toggleWrap}>
          <Text style={styles.toggleText}>
            {isSignUp ? t('alreadyHaveAccount') : t('dontHaveAccount')}
          </Text>
        </Pressable>

        <Text style={styles.version}>◆ ScandiNordic Pro v.2</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = () => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
  },
  orb1: {
    position: 'absolute',
    top: -60,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: COLORS.primaryDim,
  },
  orb2: {
    position: 'absolute',
    bottom: 40,
    right: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.successDim,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  badge: {
    fontSize: 9,
    color: COLORS.primary,
    letterSpacing: 3,
    marginBottom: 10,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  dividerLine: {
    width: 200,
    height: 1,
    backgroundColor: COLORS.primaryDim,
    marginTop: 16,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pressed: {
    opacity: 0.7,
  },
  socialIcon: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  socialLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  orText: {
    fontSize: 11,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  form: {
    gap: 12,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    height: 50,
    gap: 10,
  },
  inputIcon: {
    flexShrink: 0,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },
  primaryBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryPressed: {
    backgroundColor: COLORS.primaryBright,
  },
  primaryLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.background,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  toggleWrap: {
    alignItems: 'center',
    marginTop: 20,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.primary,
  },
  version: {
    textAlign: 'center',
    fontSize: 9,
    color: COLORS.muted,
    marginTop: 32,
    letterSpacing: 2,
  },
});
