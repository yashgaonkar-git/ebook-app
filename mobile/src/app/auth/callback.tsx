import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function AuthCallbackScreen() {
  const [message, setMessage] = useState('Confirming your account...');

  useEffect(() => {
    let active = true;

    async function handleCallback() {
      try {
        // Supabase's default email confirmation flow can establish
        // the session automatically when the callback URL is handled.
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (data.session) {
          router.replace('/explore');
        } else {
          setMessage(
            'Email confirmation received. Please return to the app and sign in.',
          );
        }
      } catch {
        if (active) {
          setMessage('Could not complete sign-in. Please open the app and sign in.');
        }
      }
    }

    void handleCallback();

    return () => {
      active = false;
    };
  }, []);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
      }}
    >
      <ActivityIndicator size="large" color="#4F46E5" />
      <Text style={{ marginTop: 16, textAlign: 'center' }}>{message}</Text>
    </View>
  );
}