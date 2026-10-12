
import { View, Text, StyleSheet } from 'react-native';

export default function ReaderFallback() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>PDF Reader</Text>
      <Text>This reader is not available on this platform yet.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 12,
  },
});
