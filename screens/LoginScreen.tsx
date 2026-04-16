import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, Alert,
} from 'react-native';
import { Colors } from '../constants/colors';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

const C = Colors.dark;

export default function LoginScreen() {
  const styles = makeStyles();
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const { t } = useLanguage();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) return;

    // TEMP DEBUG — remove before release
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const host = supabaseUrl.replace('https://', '').split('/')[0] || 'not set';
    const hasKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ? 'yes' : 'no';
    Alert.alert(
      'Debug: Sign-in attempt',
      `Email: ${email.trim().toLowerCase()}\nPassword length: ${password.length}\nSupabase host: ${host}\nAnon key set: ${hasKey}`
    );

    setLoading(true);
    try {
      if (isSignUp) await signUp(email.trim(), password);
      else await signIn(email.trim(), password);
      Alert.alert('Sign-in success', 'You are now signed in.');
    } catch (err: any) {
      const lines: string[] = [];
      lines.push(`message: ${err?.message || 'Unknown error'}`);
      if (err?.status != null) lines.push(`status: ${err.status}`);
      if (err?.code != null) lines.push(`code: ${err.code}`);
      try { lines.push(JSON.stringify(err, null, 2)); } catch {}
      Alert.alert('Sign-in error', lines.join('\n'));
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
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.orb1} />
        <View style={styles.orb2} />

        <View style={styles.card}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.badge}>◆ ScandiNordic Pro ◆</Text>
            <Text style={styles.title}>
              {isSignUp ? t('createAccount') : t('welcomeBack')}
            </Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social buttons */}
          <View style={styles.socialRow}>
            <Pressable
              style={({ pressed }) => [styles.socialBtn, pressed && styles.pressed]}
              disabled={googleLoading}
              onPress={async () => {
                setGoogleLoading(true);
                try {
                  await signInWithGoogle();
                } catch (err: any) {
                  Alert.alert('Google sign-in error', err?.message || 'Failed');
                } finally {
                  setGoogleLoading(false);
                }
              }}
            >
              {googleLoading
                ? <ActivityIndicator size="small" color={C.gold} />
                : <><Text style={styles.socialIcon}>G</Text><Text style={styles.socialLabel}>Google</Text></>
              }
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.socialBtn, pressed && styles.pressed]}
              onPress={() => Alert.alert('Coming soon', 'Apple sign-in will be available soon.')}
            >
              <Text style={styles.socialIcon}></Text>
              <Text style={styles.socialLabel}>Apple</Text>
            </Pressable>
          </View>

          {/* OR divider */}
          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>or</Text>
            <View style={styles.orLine} />
          </View>

          {/* Inputs */}
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={t('email')}
              placeholderTextColor={C.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="next"
            />
            <TextInput
              style={styles.input}
              placeholder={t('password')}
              placeholderTextColor={C.muted}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryPressed]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={C.background} size="small" />
                : <Text style={styles.primaryLabel}>
                    {isSignUp ? t('signUp') : t('signIn')}
                  </Text>
              }
            </Pressable>
          </View>

          {/* Toggle */}
          <Pressable onPress={() => setIsSignUp(v => !v)} style={styles.toggleWrap}>
            <Text style={styles.toggleText}>
              {isSignUp ? t('alreadyHaveAccount') : t('dontHaveAccount')}
            </Text>
          </Pressable>

          {/* Footer */}
          <Text style={styles.version}>◆ ScandiNordic pro v.2</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = () => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 16,
  },
  orb1: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: C.gold + '18',
  },
  orb2: {
    position: 'absolute',
    bottom: -80,
    right: -80,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: C.green + '18',
  },
  card: {
    width: '100%',
    maxWidth: 380,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  badge: {
    fontSize: 10,
    color: C.gold,
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  dividerLine: {
    width: '100%',
    height: 1,
    backgroundColor: C.gold + '40',
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
    height: 48,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  pressed: {
    opacity: 0.7,
  },
  socialIcon: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
  },
  socialLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: C.text,
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
    backgroundColor: C.border,
    opacity: 0.4,
  },
  orText: {
    fontSize: 10,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 4,
  },
  form: {
    gap: 12,
  },
  input: {
    height: 48,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    fontSize: 13,
    color: C.text,
  },
  primaryBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryPressed: {
    opacity: 0.85,
  },
  primaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.background,
    textTransform: 'uppercase',
    letterSpacing: 3,
  },
  toggleWrap: {
    alignItems: 'center',
    marginTop: 24,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '500',
    color: C.gold,
  },
  version: {
    textAlign: 'center',
    fontSize: 9,
    color: C.muted + '66',
    marginTop: 32,
    letterSpacing: 4,
  },
});
