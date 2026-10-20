
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, router } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      if (loginError) throw loginError;

      router.replace('/explore');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to sign in. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordReset() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError('Enter your email address first.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(normalizedEmail);

      if (resetError) throw resetError;

      Alert.alert(
        'Reset email requested',
        'If password recovery is enabled, check your email for the reset link.',
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not request a reset email.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>B</Text>
          </View>

          <Text style={styles.heading}>Welcome back</Text>
          <Text style={styles.subtitle}>
            Sign in to continue reading your books.
          </Text>

          <Text style={styles.label}>Email address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#9299AA"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            editable={!loading}
            returnKeyType="next"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor="#9299AA"
            secureTextEntry
            autoComplete="current-password"
            editable={!loading}
            onSubmitEditing={handleLogin}
            returnKeyType="done"
          />

          <Pressable
            onPress={handlePasswordReset}
            disabled={loading}
            style={styles.forgot}
          >
            <Text style={styles.linkText}>Forgot password?</Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={handleLogin}
            disabled={loading}
            style={[styles.primaryButton, loading && styles.disabled]}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Sign in</Text>
            )}
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <Link href="/signup" style={styles.linkText}>
              Sign up
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F6FC' },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    padding: 26,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E8EBF4',
  },
  logo: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  logoText: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: '#192238',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#737B90',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 28,
  },
  label: {
    color: '#29334B',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDE2ED',
    backgroundColor: '#FAFBFE',
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: '#192238',
  },
  forgot: { alignSelf: 'flex-end', paddingTop: 12, paddingBottom: 6 },
  linkText: { color: '#4F46E5', fontWeight: '700' },
  error: {
    color: '#DC2626',
    fontSize: 13,
    marginTop: 12,
    lineHeight: 19,
  },
  primaryButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 11,
    padding: 15,
    alignItems: 'center',
    marginTop: 18,
  },
  disabled: { opacity: 0.65 },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 25,
    flexWrap: 'wrap',
  },
  footerText: { color: '#737B90', fontSize: 14 },
});
