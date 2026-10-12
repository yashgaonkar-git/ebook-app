
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Link } from 'expo-router';

const books = [
  {
    id: '1',
    title: 'The Art of Reading',
    author: 'Demo Author',
    description: 'Discover the joy of reading every day.',
    color: '#DCE9FF',
  },
  {
    id: '2',
    title: 'Journey to Success',
    author: 'Demo Author',
    description: 'A guide to learning and personal growth.',
    color: '#DDF4E4',
  },
  {
    id: '3',
    title: 'Mystery of the Stars',
    author: 'Demo Author',
    description: 'Explore a fictional world of mystery.',
    color: '#F4E1FF',
  },
];

export default function ExploreScreen() {
  const router = useRouter();
  return (
    
    <ScrollView style={styles.container}>

      <Text style={styles.heading}>Discover Books</Text>

      <Text style={styles.subtitle}>
        Find your next favourite read.
      </Text>

      {/* Temporary Supabase connection test */}
      <Link
        href="/supabase-test"
        style={{ marginVertical: 16, color: 'blue' }}
      >
        Test Supabase Connection
      </Link>

      {books.map((book) => (
        <Pressable
          key={book.id}
          style={styles.card}
          onPress={() => router.push('/reader')}        >
          <View style={[styles.cover, { backgroundColor: book.color }]}>
            <Text style={styles.coverIcon}>📖</Text>
          </View>

          <View style={styles.details}>
            <Text style={styles.title}>{book.title}</Text>
            <Text style={styles.author}>By {book.author}</Text>
            <Text style={styles.description}>
              {book.description}
            </Text>
            <Text style={styles.action}>View book →</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FC',
    padding: 20,
  },
  heading: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#18213A',
    marginTop: 25,
  },
  subtitle: {
    fontSize: 16,
    color: '#687086',
    marginTop: 8,
    marginBottom: 25,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    gap: 15,
    alignItems: 'center',
  },
  cover: {
    width: 95,
    height: 125,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverIcon: {
    fontSize: 36,
  },
  details: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#18213A',
  },
  author: {
    color: '#687086',
    marginTop: 5,
  },
  description: {
    color: '#687086',
    marginTop: 9,
    lineHeight: 20,
  },
  action: {
    color: '#4F46E5',
    fontWeight: '600',
    marginTop: 12,
  },
});
