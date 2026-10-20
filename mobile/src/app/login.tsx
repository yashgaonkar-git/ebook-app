
import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function signInWithGoogle() {
    setLoading(true);
    setError('');

    try {
      if (Platform.OS !== 'web') {
        throw new Error(
          'Android Google login will be configured in the next step. Please test on web first.'
        );
      }

      const redirectTo = `${window.location.origin}/callback`;

      const { error: authError } =
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
          },
        });

      if (authError) {
        throw authError;
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to start Google sign-in.'
      );
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>eBook Application</Text>
      <Text style={styles.subtitle}>
        Sign in to access your books
      </Text>

      <Pressable
        disabled={loading}
        onPress={signInWithGoogle}
        style={[styles.button, loading && styles.disabled]}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>
            Continue with Google
          </Text>
        )}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F7F8FC',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#555555',
    marginBottom: 28,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    minWidth: 220,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.65,
  },
  error: {
    color: '#DC2626',
    marginTop: 18,
    textAlign: 'center',
  },
});
