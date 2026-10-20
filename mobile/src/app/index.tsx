
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function IndexScreen() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!active) return;

      if (error) {
        router.replace('/login');
      } else if (data.session) {
        router.replace('/explore');
      } else {
        router.replace('/login');
      }

      setChecking(false);
    }

    void checkSession();

    return () => {
      active = false;
    };
  }, []);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checking && <ActivityIndicator size="large" color="#4F46E5" />}
    </View>
  );
}
