
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function ReaderFallback() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>PDF Reader</Text>
      <Text style={styles.message}>
        The PDF reader is not configured for this platform yet.
      </Text>
      <Link href="/explore" style={styles.link}>
        Return to library
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F7F8FC',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  message: {
    textAlign: 'center',
    color: '#687086',
    marginBottom: 20,
  },
  link: {
    color: '#4F46E5',
    fontWeight: '700',
  },
});
