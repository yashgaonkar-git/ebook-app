
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function SupabaseTestScreen() {
  const [status, setStatus] = useState('Testing connection...');

  useEffect(() => {
    async function testConnection() {
      try {
        const { error } = await supabase
          .from('books')
          .select('id')
          .limit(1);

        if (error) {
          setStatus(`Database error: ${error.message}`);
        } else {
          setStatus('SUCCESS: Supabase connection is working!');
        }
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }

    testConnection();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Supabase Connection Test</Text>
      <ActivityIndicator size="large" color="#2563eb" />
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  status: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 16,
  },
});
