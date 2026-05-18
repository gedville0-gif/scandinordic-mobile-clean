import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase PKCE recovery flow: the email link contains ?code=<one-time>.
    // The code is bound to THIS device via a code_verifier that was stored in
    // SecureStore when forgot-password.tsx called resetPasswordForEmail.
    // A phishing link delivered to a different device CANNOT complete the
    // exchange — that's the CSRF protection that the old setSession({access_token,
    // refresh_token}) flow lacked (audit issue #10).
    if (params.error || params.error_description) {
      setSessionError(params.error_description || params.error || 'Reset link error');
      return;
    }
    if (!params.code) {
      setSessionError('Invalid or expired reset link. Please request a new one.');
      return;
    }
    supabase.auth.exchangeCodeForSession(params.code).then(({ error: err }) => {
      if (err) {
        setSessionError(err.message);
      } else {
        setSessionReady(true);
      }
    });
  }, [params.code, params.error, params.error_description]);

  const handleUpdate = async () => {
    if (newPassword.length < 6) {
      setError(t('passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('passwordsDoNotMatch'));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPassword });
      if (err) throw err;
      await supabase.auth.signOut();
      setDone(true);
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.badge}>◆ SCANDINORDIC PRO ◆</Text>
          <Text style={styles.title}>{t('setNewPassword')}</Text>
          <View style={styles.dividerLine} />
        </View>

        {done ? (
          <View style={styles.successBox}>
            <Feather name="check-circle" size={32} color={COLORS.success} />
            <Text style={styles.successText}>{t('passwordUpdated')}</Text>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryPressed]}
              onPress={() => router.replace('/(auth)/login')}
            >
              <Text style={styles.primaryLabel}>{t('signIn')}</Text>
            </Pressable>
          </View>
        ) : sessionError ? (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={28} color={COLORS.danger} />
            <Text style={styles.errorBoxText}>{sessionError}</Text>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryPressed]}
              onPress={() => router.replace('/(auth)/forgot-password')}
            >
              <Text style={styles.primaryLabel}>{t('sendResetLink')}</Text>
            </Pressable>
          </View>
        ) : !sessionReady ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={COLORS.primary} size="large" />
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.inputWrap}>
              <Feather name="lock" size={15} color={COLORS.muted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={t('newPassword')}
                placeholderTextColor={COLORS.muted}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showNew}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                returnKeyType="next"
              />
              <Pressable onPress={() => setShowNew(v => !v)} hitSlop={8}>
                <Feather name={showNew ? 'eye-off' : 'eye'} size={15} color={COLORS.muted} />
              </Pressable>
            </View>

            <View style={styles.inputWrap}>
              <Feather name="lock" size={15} color={COLORS.muted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={t('confirmPassword')}
                placeholderTextColor={COLORS.muted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                returnKeyType="done"
                onSubmitEditing={handleUpdate}
              />
              <Pressable onPress={() => setShowConfirm(v => !v)} hitSlop={8}>
                <Feather name={showConfirm ? 'eye-off' : 'eye'} size={15} color={COLORS.muted} />
              </Pressable>
            </View>

            {error && (
              <Text style={styles.errorText}>{error}</Text>
            )}

            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryPressed]}
              onPress={handleUpdate}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.background} size="small" />
              ) : (
                <Text style={styles.primaryLabel}>{t('resetPassword')}</Text>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  badge: {
    fontSize: 9,
    color: COLORS.primary,
    letterSpacing: 3,
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
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
  form: {
    gap: 14,
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
    fontSize: 14,
    color: COLORS.text,
  },
  errorText: {
    fontSize: 13,
    color: COLORS.danger,
    textAlign: 'center',
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
  successBox: {
    alignItems: 'center',
    gap: 16,
    marginTop: 32,
    padding: 28,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  successText: {
    fontSize: 15,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorBox: {
    alignItems: 'center',
    gap: 16,
    marginTop: 32,
    padding: 28,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  errorBoxText: {
    fontSize: 14,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 21,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
});
