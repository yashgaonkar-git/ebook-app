
import { useState } from 'react';
import {
  ActivityIndicator,
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

export default function SignupScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSignup() {
    const normalizedEmail = email.trim().toLowerCase();

    setError('');
    setMessage('');

    if (!fullName.trim() || !normalizedEmail || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (password.length < 8) {
      setError('Your password must contain at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const { data, error: signupError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
            emailRedirectTo: 'http://localhost:8081',
            data: {
            full_name: fullName.trim(),
            },
        },
      });

      if (signupError) throw signupError;

      if (data.session) {
        router.replace('/explore');
      } else {
        setMessage(
          'Account created. Check your email for the confirmation link, then sign in.',
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to create your account. Please try again.',
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

          <Text style={styles.heading}>Create account</Text>
          <Text style={styles.subtitle}>
            Join your personal reading library.
          </Text>

          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your full name"
            placeholderTextColor="#9299AA"
            autoCapitalize="words"
            autoComplete="name"
            editable={!loading}
          />

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
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            placeholderTextColor="#9299AA"
            secureTextEntry
            autoComplete="new-password"
            editable={!loading}
          />

          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Enter password again"
            placeholderTextColor="#9299AA"
            secureTextEntry
            autoComplete="new-password"
            editable={!loading}
            onSubmitEditing={handleSignup}
            returnKeyType="done"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {message ? <Text style={styles.success}>{message}</Text> : null}

          <Pressable
            onPress={handleSignup}
            disabled={loading}
            style={[styles.primaryButton, loading && styles.disabled]}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Create account</Text>
            )}
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/login" style={styles.linkText}>
              Sign in
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
    marginBottom: 20,
  },
  label: {
    color: '#29334B',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 12,
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
  linkText: { color: '#4F46E5', fontWeight: '700' },
  error: {
    color: '#DC2626',
    fontSize: 13,
    marginTop: 12,
    lineHeight: 19,
  },
  success: {
    color: '#15803D',
    fontSize: 13,
    marginTop: 12,
    lineHeight: 19,
  },
  primaryButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 11,
    padding: 15,
    alignItems: 'center',
    marginTop: 20,
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
    marginTop: 24,
    flexWrap: 'wrap',
  },
  footerText: { color: '#737B90', fontSize: 14 },
});
