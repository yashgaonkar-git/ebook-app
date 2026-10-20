
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

type ProgressRow = {
  book_id: string;
  current_page: number | null;
  updated_at: string | null;
};

type Book = {
  id: string;
  title: string;
  author: string;
  file_path: string;
  cover_url: string | null;
  category: string | null;
};

type ContinueBook = Book & {
  current_page: number;
  updated_at: string | null;
};

const COLORS = {
  background: '#F6F7FB',
  surface: '#FFFFFF',
  text: '#192238',
  muted: '#727B90',
  primary: '#4F46E5',
  border: '#E6E9F2',
};

const COVER_COLORS = [
  '#E8EAFE',
  '#DFF5EC',
  '#FCE8D9',
  '#F4E3F8',
  '#DDEFFC',
];

export default function ContinueReadingScreen() {
  const router = useRouter();

  const [items, setItems] = useState<ContinueBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProgress = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        router.replace('/login');
        return;
      }

      const { data: progressData, error: progressError } =
        await supabase
          .from('reading_progress')
          .select('book_id, current_page, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });

      if (progressError) throw progressError;

      const progress = (progressData ?? []) as ProgressRow[];

      if (progress.length === 0) {
        setItems([]);
        return;
      }

      const bookIds = [
        ...new Set(
          progress
            .map((row) => row.book_id)
            .filter(Boolean)
        ),
      ];

      const { data: booksData, error: booksError } =
        await supabase
          .from('books')
          .select(
            'id, title, author, file_path, cover_url, category'
          )
          .in('id', bookIds);

      if (booksError) throw booksError;

      const books = (booksData ?? []) as Book[];

      const booksById = new Map(
        books.map((book) => [String(book.id), book])
      );

      const merged: ContinueBook[] = progress
        .map((row) => {
          const book = booksById.get(String(row.book_id));

          if (!book) return null;

          return {
            ...book,
            current_page: Math.max(
              1,
              Number(row.current_page) || 1
            ),
            updated_at: row.updated_at,
          };
        })
        .filter(
          (item): item is ContinueBook => item !== null
        );

      setItems(merged);
    } catch (err: unknown) {
      console.error('Failed to load reading progress:', err);

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load your reading history.'
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void loadProgress();
    }, [loadProgress])
  );

  const openBook = (book: ContinueBook) => {
    router.push({
      pathname: '/reader',
      params: {
        id: book.id,
        path: book.file_path,
        title: book.title,
      },
    });
  };

  const formatDate = (value: string) => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleDateString();
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.page}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>

        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>
            YOUR READING JOURNEY
          </Text>
          <Text style={styles.title}>Continue Reading</Text>
          <Text style={styles.subtitle}>
            Pick up where you left off.
          </Text>
        </View>

        <Pressable
          onPress={() => void loadProgress()}
          style={styles.refreshButton}
          accessibilityRole="button"
          accessibilityLabel="Refresh reading history"
        >
          <Text style={styles.refreshText}>↻</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator
            size="large"
            color={COLORS.primary}
          />
          <Text style={styles.stateText}>
            Loading your reading history...
          </Text>
        </View>
      ) : error ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>
            Couldn't load your reading history
          </Text>
          <Text style={styles.stateText}>{error}</Text>

          <Pressable
            onPress={() => void loadProgress()}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.stateCard}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>▤</Text>
          </View>

          <Text style={styles.stateTitle}>
            Your reading journey starts here
          </Text>

          <Text style={styles.stateText}>
            Books with saved reading progress will appear here
            so you can quickly return to them.
          </Text>

          <Pressable
            onPress={() => router.replace('/explore')}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              Explore books
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.list}>
          <Text style={styles.resultCount}>
            {items.length}{' '}
            {items.length === 1 ? 'book' : 'books'} in your
            reading history
          </Text>

          {items.map((book, index) => (
            <View key={book.id} style={styles.bookCard}>
              <View
                style={[
                  styles.cover,
                  {
                    backgroundColor:
                      COVER_COLORS[
                        index % COVER_COLORS.length
                      ],
                  },
                ]}
              >
                {book.cover_url ? (
                  <Image
                    source={{ uri: book.cover_url }}
                    style={styles.coverImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Text
                    style={styles.coverFallback}
                    numberOfLines={4}
                  >
                    {book.title}
                  </Text>
                )}
              </View>

              <View style={styles.bookInfo}>
                {book.category ? (
                  <Text style={styles.category}>
                    {book.category}
                  </Text>
                ) : null}

                <Text
                  style={styles.bookTitle}
                  numberOfLines={2}
                >
                  {book.title}
                </Text>

                <Text style={styles.author} numberOfLines={1}>
                  {book.author}
                </Text>

                <Text style={styles.pageLabel}>
                  Last saved at page {book.current_page}
                </Text>

                {book.updated_at ? (
                  <Text style={styles.dateLabel}>
                    Last read {formatDate(book.updated_at)}
                  </Text>
                ) : null}

                <Pressable
                  onPress={() => openBook(book)}
                  style={styles.continueButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Continue reading ${book.title}`}
                >
                  <Text style={styles.continueButtonText}>
                    Continue reading
                  </Text>
                  <Text style={styles.continueArrow}>→</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  page: {
    padding: 22,
    paddingBottom: 48,
    maxWidth: 1000,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginBottom: 28,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 32,
    color: COLORS.text,
    lineHeight: 34,
    marginTop: -3,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  title: {
    color: COLORS.text,
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 4,
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#ECEEFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshText: {
    color: COLORS.primary,
    fontSize: 25,
    fontWeight: '700',
  },
  stateCard: {
    minHeight: 240,
    padding: 26,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 10,
  },
  stateText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
    maxWidth: 420,
  },
  primaryButton: {
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#ECEEFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconText: {
    color: COLORS.primary,
    fontSize: 28,
  },
  list: {
    gap: 14,
  },
  resultCount: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  bookCard: {
    flexDirection: 'row',
    gap: 15,
    padding: 13,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cover: {
    width: 94,
    minHeight: 138,
    borderRadius: 11,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 9,
  },
  coverImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  coverFallback: {
    color: '#292B55',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  bookInfo: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  category: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 5,
  },
  bookTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 21,
  },
  author: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 4,
  },
  pageLabel: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 10,
  },
  dateLabel: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 3,
  },
  continueButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 11,
    backgroundColor: '#ECEEFF',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  continueButtonText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  continueArrow: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '800',
  },
});
