
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!active) return;

      setSignedIn(!error && !!data.session);
      setCheckingAuth(false);
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session);
      setCheckingAuth(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (checkingAuth) return;

    const firstSegment = segments[0] as string | undefined;
    const isPublicRoute =
      firstSegment === 'login' ||
      firstSegment === 'signup' ||
      firstSegment === 'auth';

    if (!signedIn && !isPublicRoute) {
      router.replace('/login');
    } else if (
      signedIn &&
      (firstSegment === 'login' || firstSegment === 'signup')
    ) {
      router.replace('/explore');
    }
  }, [checkingAuth, signedIn, segments, router]);

  if (checkingAuth) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: 'Sign in' }} />
      <Stack.Screen name="signup" options={{ title: 'Create account' }} />
      <Stack.Screen name="explore" options={{ title: 'My Library' }} />
      <Stack.Screen name="reader" options={{ title: 'PDF Reader' }} />
      <Stack.Screen
        name="auth/callback"
        options={{ title: 'Authentication' }}
      />
    </Stack>
  );
}
