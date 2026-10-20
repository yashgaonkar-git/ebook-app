
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const [message, setMessage] = useState('Completing sign-in...');

  useEffect(() => {
    let active = true;

    async function completeSignIn() {
      try {
        // Read the URL only in the browser.
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const errorDescription =
          url.searchParams.get('error_description') ||
          url.searchParams.get('error');

        if (errorDescription) {
          throw new Error(errorDescription);
        }

        if (code) {
          const { error } =
            await supabase.auth.exchangeCodeForSession(code);

          if (error) throw error;
        } else {
          // Supabase may have already processed the session.
          const { data, error } = await supabase.auth.getSession();

          if (error) throw error;

          if (!data.session) {
            throw new Error(
              'No authorization code or session found. Please try Google login again.'
            );
          }
        }

        if (active) {
          router.replace('/explore');
        }
      } catch (err: unknown) {
        if (active) {
          setMessage(
            err instanceof Error
              ? `Sign-in failed: ${err.message}`
              : 'Unable to complete sign-in.'
          );
        }
      }
    }

    if (typeof window !== 'undefined') {
      void completeSignIn();
    }

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  message: {
    marginTop: 16,
    textAlign: 'center',
  },
});
