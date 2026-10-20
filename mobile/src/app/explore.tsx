
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

type Book = {
  id: string;
  title: string;
  author: string;
  description: string | null;
  file_path: string;
  cover_url: string | null;
  category: string | null;
  is_paid: boolean;
  price: number;
  currency: string;
};

type AccessStatus = 'pending' | 'granted' | 'rejected' | 'none';

const COLORS = {
  background: '#F6F7FB',
  surface: '#FFFFFF',
  text: '#192238',
  muted: '#727B90',
  primary: '#4F46E5',
  border: '#E6E9F2',
  cover: '#E9EAFE',
};

const CATEGORY_COLORS = [
  '#E8EAFE',
  '#DFF5EC',
  '#FCE8D9',
  '#F4E3F8',
  '#DDEFFC',
];

export default function ExploreScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [menuVisible, setMenuVisible] = useState(false);
  const [signOutConfirmVisible, setSignOutConfirmVisible] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [accessStatuses, setAccessStatuses] = useState<
    Record<string, AccessStatus>
  >({});
  const [requestingBookId, setRequestingBookId] = useState<string | null>(null);

  const isDesktop = width >= 900;
  const isTablet = width >= 600 && width < 900;
  const columns = isDesktop ? 4 : isTablet ? 3 : 2;
  const horizontalPadding = width < 480 ? 18 : 28;
  const gridGap = 18;
  const contentWidth = Math.max(0, width - horizontalPadding * 2);
  const cardWidth = Math.max(
    130,
    (contentWidth - gridGap * (columns - 1)) / columns
  );

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    const { error: signOutError } = await supabase.auth.signOut();
    setSigningOut(false);

    if (signOutError) {
      setSignOutConfirmVisible(false);
      Alert.alert('Sign out failed', signOutError.message);
      return;
    }

    setSignOutConfirmVisible(false);
    router.replace('/login');
  }, [router]);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        router.replace('/login');
        return;
      }

      const { data: bookData, error: bookError } = await supabase
        .from('books')
        .select(
          'id, title, author, description, file_path, cover_url, category, is_paid, price, currency'
        )
        .order('created_at', { ascending: false });

      if (bookError) throw bookError;

      const loadedBooks = (bookData ?? []).map((item) => ({
        ...item,
        is_paid: item.is_paid ?? false,
        price: Number(item.price ?? 0),
        currency: item.currency || 'INR',
      })) as Book[];

      setBooks(loadedBooks);

      const [
        { data: purchaseData, error: purchaseError },
        { data: requestData, error: requestError },
      ] = await Promise.all([
        supabase
          .from('purchases')
          .select('book_id, status')
          .eq('user_id', user.id)
          .in('status', ['granted', 'completed']),

        supabase
          .from('book_access_requests')
          .select('book_id, status, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ]);

      if (purchaseError) throw purchaseError;
      if (requestError) throw requestError;

      const statuses: Record<string, AccessStatus> = {};

      for (const book of loadedBooks) {
        statuses[book.id] = book.is_paid ? 'none' : 'granted';
      }

      for (const purchase of purchaseData ?? []) {
        statuses[purchase.book_id] = 'granted';
      }

      // Requests arrive newest first. Keep the newest status for each book.
      const seenRequests = new Set<string>();

      for (const request of requestData ?? []) {
        if (seenRequests.has(request.book_id)) continue;
        seenRequests.add(request.book_id);

        if (statuses[request.book_id] === 'granted') continue;

        if (
          request.status === 'pending' ||
          request.status === 'rejected' ||
          request.status === 'granted'
        ) {
          statuses[request.book_id] = request.status;
        }
      }

      setAccessStatuses(statuses);
    } catch (err: unknown) {
      console.error('Failed to load books:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load books. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void loadBooks();
    }, [loadBooks])
  );

  const categories = useMemo(() => {
    const uniqueCategories = Array.from(
      new Set(
        books
          .map((book) => book.category?.trim())
          .filter((category): category is string => Boolean(category))
      )
    ).sort((a, b) => a.localeCompare(b));

    return ['All', ...uniqueCategories];
  }, [books]);

  const filteredBooks = useMemo(() => {
    const query = search.trim().toLowerCase();

    return books.filter((book) => {
      const matchesCategory =
        selectedCategory === 'All' ||
        book.category?.trim() === selectedCategory;

      const searchableText = [
        book.title,
        book.author,
        book.description ?? '',
        book.category ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return matchesCategory && (!query || searchableText.includes(query));
    });
  }, [books, search, selectedCategory]);

  const openBook = (book: Book) => {
    router.push({
      pathname: '/reader',
      params: {
        id: book.id,
        path: book.file_path,
        title: book.title,
      },
    });
  };

  const requestBookAccess = async (book: Book) => {
    if (requestingBookId) return;

    setRequestingBookId(book.id);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        router.replace('/login');
        return;
      }

      // Refresh request and purchase information before submitting.
      const [
        { data: existingRequests, error: requestError },
        { data: existingPurchases, error: purchaseError },
      ] = await Promise.all([
        supabase
          .from('book_access_requests')
          .select('status, created_at')
          .eq('user_id', user.id)
          .eq('book_id', book.id)
          .order('created_at', { ascending: false })
          .limit(1),

        supabase
          .from('purchases')
          .select('status')
          .eq('user_id', user.id)
          .eq('book_id', book.id)
          .in('status', ['granted', 'completed'])
          .limit(1),
      ]);

      if (requestError) throw requestError;
      if (purchaseError) throw purchaseError;

      if (existingPurchases && existingPurchases.length > 0) {
        setAccessStatuses((previous) => ({
          ...previous,
          [book.id]: 'granted',
        }));
        Alert.alert('Access approved', 'You can now open this book.');
        return;
      }

      const latestRequest = existingRequests?.[0];

      if (latestRequest?.status === 'pending') {
        setAccessStatuses((previous) => ({
          ...previous,
          [book.id]: 'pending',
        }));
        Alert.alert(
          'Request pending',
          'Your request is awaiting administrator review.'
        );
        return;
      }

      if (latestRequest?.status === 'granted') {
        setAccessStatuses((previous) => ({
          ...previous,
          [book.id]: 'granted',
        }));
        Alert.alert('Access approved', 'You can now open this book.');
        return;
      }

      const { error: insertError } = await supabase
        .from('book_access_requests')
        .insert({
          user_id: user.id,
          book_id: book.id,
          status: 'pending',
        });

      if (insertError) {
        // The partial unique index prevents multiple pending requests.
        if (insertError.code === '23505') {
          setAccessStatuses((previous) => ({
            ...previous,
            [book.id]: 'pending',
          }));
          Alert.alert(
            'Request pending',
            'You already have a pending request for this book.'
          );
          return;
        }

        throw insertError;
      }

      setAccessStatuses((previous) => ({
        ...previous,
        [book.id]: 'pending',
      }));

      Alert.alert(
        'Request submitted',
        'Your access request has been sent to the administrator. This is not a payment.'
      );
    } catch (err: unknown) {
      console.error('Failed to request book access:', err);
      Alert.alert(
        'Request failed',
        err instanceof Error
          ? err.message
          : 'Could not submit your request. Please try again.'
      );
    } finally {
      setRequestingBookId(null);
    }
  };

  const renderBookAction = (book: Book) => {
    const status = accessStatuses[book.id];

    if (!book.is_paid || status === 'granted') {
      return (
        <Pressable
          onPress={() => openBook(book)}
          accessibilityRole="button"
          accessibilityLabel={`Read ${book.title}`}
          style={styles.readButton}
        >
          <Text style={styles.readButtonText}>Read book</Text>
          <Text style={styles.readArrow}>→</Text>
        </Pressable>
      );
    }

    if (status === 'pending') {
      return (
        <View style={[styles.readButton, styles.pendingButton]}>
          <Text style={styles.pendingButtonText}>Request pending</Text>
        </View>
      );
    }

    return (
      <Pressable
        onPress={() => void requestBookAccess(book)}
        disabled={requestingBookId !== null}
        accessibilityRole="button"
        accessibilityLabel={`Request access to ${book.title}`}
        style={({ pressed }) => [
          styles.readButton,
          styles.requestButton,
          pressed && styles.menuItemPressed,
          requestingBookId !== null && styles.disabledButton,
        ]}
      >
        <Text style={styles.requestButtonText}>
          {requestingBookId === book.id
            ? 'Submitting…'
            : status === 'rejected'
              ? 'Request again'
              : 'Request access'}
        </Text>
        {requestingBookId !== book.id ? (
          <Text style={styles.requestArrow}>→</Text>
        ) : (
          <ActivityIndicator size="small" color="#FFFFFF" />
        )}
      </Pressable>
    );
  };

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.page,
          { paddingHorizontal: horizontalPadding },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>B</Text>
            </View>
            <Text style={styles.brandName}>BookSpace</Text>
          </View>

          <View style={styles.topBarActions}>
            <Text style={styles.libraryLabel}>MY LIBRARY</Text>
            <Pressable
              onPress={() => setMenuVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Open BookSpace menu"
              accessibilityState={{ expanded: menuVisible }}
              style={({ pressed }) => [
                styles.menuButton,
                pressed && styles.menuButtonPressed,
              ]}
            >
              <Text style={styles.menuIcon}>☰</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>YOUR NEXT CHAPTER STARTS HERE</Text>
          <Text style={styles.heroTitle}>Discover your next read.</Text>
          <Text style={styles.heroDescription}>
            Explore your library and find something worth getting lost in.
          </Text>

          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search titles, authors, topics..."
              placeholderTextColor="#9299AA"
              style={styles.searchInput}
              returnKeyType="search"
              accessibilityLabel="Search books"
            />
            {search.length > 0 ? (
              <Pressable
                onPress={() => setSearch('')}
                accessibilityLabel="Clear search"
                style={styles.clearButton}
              >
                <Text style={styles.clearText}>×</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Browse categories</Text>
            <Text style={styles.sectionSubtitle}>
              Find a book that matches your mood.
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryList}
        >
          {categories.map((category, index) => {
            const active = category === selectedCategory;

            return (
              <Pressable
                key={category}
                onPress={() => setSelectedCategory(category)}
                style={[
                  styles.categoryChip,
                  active && styles.categoryChipActive,
                ]}
              >
                <View
                  style={[
                    styles.categoryDot,
                    {
                      backgroundColor: active
                        ? '#FFFFFF'
                        : CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.categoryText,
                    active && styles.categoryTextActive,
                  ]}
                >
                  {category}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.booksHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              {search.trim()
                ? 'Search results'
                : selectedCategory === 'All'
                  ? 'Explore books'
                  : selectedCategory}
            </Text>
            <Text style={styles.sectionSubtitle}>
              {loading
                ? 'Loading your library...'
                : `${filteredBooks.length} ${
                    filteredBooks.length === 1 ? 'book' : 'books'
                  } available`}
            </Text>
          </View>

          <Pressable
            onPress={() => void loadBooks()}
            style={styles.refreshButton}
          >
            <Text style={styles.refreshText}>Refresh ↻</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.stateText}>Loading your library...</Text>
          </View>
        ) : error ? (
          <View style={styles.stateContainer}>
            <Text style={styles.stateIcon}>!</Text>
            <Text style={styles.stateTitle}>Couldn't load books</Text>
            <Text style={styles.stateText}>{error}</Text>
            <Pressable
              onPress={() => void loadBooks()}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : filteredBooks.length === 0 ? (
          <View style={styles.stateContainer}>
            <Text style={styles.stateIcon}>⌕</Text>
            <Text style={styles.stateTitle}>
              {books.length === 0 ? 'Your library is empty' : 'No books found'}
            </Text>
            <Text style={styles.stateText}>
              {books.length === 0
                ? 'Add books to your Supabase books table to see them here.'
                : 'Try a different search or select another category.'}
            </Text>
            {search || selectedCategory !== 'All' ? (
              <Pressable
                onPress={() => {
                  setSearch('');
                  setSelectedCategory('All');
                }}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Clear filters</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.grid}>
            {filteredBooks.map((book, index) => (
              <View
                key={book.id}
                style={[styles.card, { width: cardWidth }]}
              >
                <View style={styles.cardPressable}>
                  <Pressable
                    onPress={() => {
                      if (
                        !book.is_paid ||
                        accessStatuses[book.id] === 'granted'
                      ) {
                        openBook(book);
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      !book.is_paid || accessStatuses[book.id] === 'granted'
                        ? `Read ${book.title}`
                        : `${book.title}, access required`
                    }
                  >
                    <View
                      style={[
                        styles.cover,
                        {
                          backgroundColor:
                            CATEGORY_COLORS[index % CATEGORY_COLORS.length],
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
                        <>
                          <View style={styles.coverDecoration} />
                          <Text style={styles.coverIcon}>▤</Text>
                          <Text style={styles.coverBookTitle} numberOfLines={3}>
                            {book.title}
                          </Text>
                          <Text style={styles.coverAuthor} numberOfLines={1}>
                            {book.author}
                          </Text>
                        </>
                      )}

                      {book.category ? (
                        <View style={styles.coverBadge}>
                          <Text
                            style={styles.coverBadgeText}
                            numberOfLines={1}
                          >
                            {book.category}
                          </Text>
                        </View>
                      ) : null}

                      <View
                        style={[
                          styles.priceBadge,
                          book.is_paid ? styles.paidBadge : styles.freeBadge,
                        ]}
                      >
                        <Text style={styles.priceBadgeText}>
                          {book.is_paid
                            ? `${book.currency || 'INR'} ${Number(
                                book.price || 0
                              ).toFixed(2)}`
                            : 'FREE'}
                        </Text>
                      </View>
                    </View>
                  </Pressable>

                  <View style={styles.cardDetails}>
                    <Text style={styles.bookTitle} numberOfLines={2}>
                      {book.title}
                    </Text>
                    <Text style={styles.bookAuthor} numberOfLines={1}>
                      {book.author}
                    </Text>

                    {book.description ? (
                      <Text style={styles.bookDescription} numberOfLines={2}>
                        {book.description}
                      </Text>
                    ) : null}

                    {book.is_paid &&
                    accessStatuses[book.id] !== 'granted' ? (
                      <Text style={styles.manualApprovalNote}>
                        Manual approval required. No payment is collected here.
                      </Text>
                    ) : null}

                    {renderBookAction(book)}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Made for readers, one page at a time.
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setMenuVisible(false)}
          />
          <View style={styles.menuPanel}>
            <View style={styles.menuHeader}>
              <View style={styles.menuLogo}>
                <Text style={styles.menuLogoText}>B</Text>
              </View>
              <View style={styles.menuHeaderText}>
                <Text style={styles.menuTitle}>BookSpace</Text>
                <Text style={styles.menuSubtitle}>Your personal library</Text>
              </View>
              <Pressable
                onPress={() => setMenuVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close menu"
                style={styles.closeMenuButton}
              >
                <Text style={styles.closeMenuText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.menuDivider} />

            <Pressable
              onPress={() => setMenuVisible(false)}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
              ]}
            >
              <Text style={styles.menuItemIcon}>▤</Text>
              <View style={styles.menuItemCopy}>
                <Text style={styles.menuItemTitle}>My Library</Text>
                <Text style={styles.menuItemDescription}>Browse your books</Text>
              </View>
              <Text style={styles.menuChevron}>›</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setMenuVisible(false);
                router.push('/continue');
              }}
              accessibilityRole="button"
              accessibilityLabel="Open Continue Reading"
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
              ]}
            >
              <Text style={styles.menuItemIcon}>◷</Text>
              <View style={styles.menuItemCopy}>
                <Text style={styles.menuItemTitle}>Continue Reading</Text>
                <Text style={styles.menuItemDescription}>
                  Pick up where you left off
                </Text>
              </View>
              <Text style={styles.menuChevron}>›</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setMenuVisible(false);
                router.push('/profile');
              }}
              accessibilityRole="button"
              accessibilityLabel="Open profile and account settings"
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
              ]}
            >
              <Text style={styles.menuItemIcon}>☺</Text>
              <View style={styles.menuItemCopy}>
                <Text style={styles.menuItemTitle}>Profile & account</Text>
                <Text style={styles.menuItemDescription}>
                  Manage your name and password
                </Text>
              </View>
              <Text style={styles.menuChevron}>›</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setMenuVisible(false);
                void loadBooks();
              }}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
              ]}
            >
              <Text style={styles.menuItemIcon}>↻</Text>
              <View style={styles.menuItemCopy}>
                <Text style={styles.menuItemTitle}>Refresh library</Text>
                <Text style={styles.menuItemDescription}>
                  Get the latest book list
                </Text>
              </View>
              <Text style={styles.menuChevron}>›</Text>
            </Pressable>

            <View style={styles.menuDivider} />

            <Pressable
              onPress={() => {
                setMenuVisible(false);
                setSignOutConfirmVisible(true);
              }}
              style={({ pressed }) => [
                styles.menuItem,
                styles.signOutMenuItem,
                pressed && styles.menuItemPressed,
              ]}
            >
              <Text style={styles.signOutIcon}>↪</Text>
              <View style={styles.menuItemCopy}>
                <Text style={styles.signOutTitle}>Sign out</Text>
                <Text style={styles.menuItemDescription}>
                  Sign out of your account
                </Text>
              </View>
              <Text style={styles.menuChevron}>›</Text>
            </Pressable>

            <Text style={styles.menuFooter}>BOOKSPACE · MADE FOR READERS</Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={signOutConfirmVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() =>
          !signingOut && setSignOutConfirmVisible(false)
        }
      >
        <View style={styles.confirmOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() =>
              !signingOut && setSignOutConfirmVisible(false)
            }
          />
          <View style={styles.confirmCard}>
            <View style={styles.confirmIconWrap}>
              <Text style={styles.confirmIcon}>↪</Text>
            </View>
            <Text style={styles.confirmTitle}>Leaving BookSpace?</Text>
            <Text style={styles.confirmDescription}>
              You will be signed out of your account. You can sign in again
              anytime.
            </Text>
            <Pressable
              disabled={signingOut}
              onPress={() => void handleSignOut()}
              style={({ pressed }) => [
                styles.confirmPrimaryButton,
                pressed && styles.confirmButtonPressed,
                signingOut && styles.disabledButton,
              ]}
            >
              <Text style={styles.confirmPrimaryText}>
                {signingOut ? 'Signing out…' : 'Sign out'}
              </Text>
            </Pressable>
            <Pressable
              disabled={signingOut}
              onPress={() => setSignOutConfirmVisible(false)}
              style={({ pressed }) => [
                styles.confirmSecondaryButton,
                pressed && styles.menuItemPressed,
              ]}
            >
              <Text style={styles.confirmSecondaryText}>Continue reading</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  page: {
    paddingTop: 22,
    paddingBottom: 48,
  },
  topBar: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 35,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  brandName: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  libraryLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonPressed: {
    backgroundColor: '#ECEEFF',
  },
  menuIcon: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '700',
  },
  modalRoot: {
    flex: 1,
    alignItems: 'flex-end',
    paddingTop: 64,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(18, 24, 40, 0.35)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  menuPanel: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 14,
  },
  menuLogo: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLogoText: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '800',
  },
  menuHeaderText: {
    flex: 1,
  },
  menuTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
  },
  menuSubtitle: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 3,
  },
  closeMenuButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeMenuText: {
    color: COLORS.muted,
    fontSize: 25,
    lineHeight: 28,
  },
  menuDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  menuItemPressed: {
    backgroundColor: '#F1F2FF',
  },
  menuItemIcon: {
    width: 36,
    height: 36,
    textAlign: 'center',
    textAlignVertical: 'center',
    overflow: 'hidden',
    borderRadius: 11,
    backgroundColor: '#ECEEFF',
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: '700',
    paddingTop: 4,
  },
  menuItemCopy: {
    flex: 1,
    gap: 3,
  },
  menuItemTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  menuItemDescription: {
    color: COLORS.muted,
    fontSize: 11,
  },
  menuChevron: {
    color: '#9AA2B3',
    fontSize: 25,
    paddingHorizontal: 4,
  },
  signOutMenuItem: {
    marginTop: 2,
  },
  signOutIcon: {
    width: 36,
    height: 36,
    textAlign: 'center',
    textAlignVertical: 'center',
    overflow: 'hidden',
    borderRadius: 11,
    backgroundColor: '#FEE2E2',
    color: '#B91C1C',
    fontSize: 23,
    fontWeight: '700',
    paddingTop: 3,
  },
  signOutTitle: {
    color: '#B91C1C',
    fontSize: 14,
    fontWeight: '800',
  },
  menuFooter: {
    color: '#A0A7B7',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    textAlign: 'center',
    paddingTop: 12,
  },
  confirmOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(18, 24, 40, 0.55)',
  },
  confirmCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  confirmIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmIcon: {
    color: '#B91C1C',
    fontSize: 30,
    fontWeight: '800',
  },
  confirmTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  confirmDescription: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 22,
  },
  confirmPrimaryButton: {
    width: '100%',
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: '#B91C1C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  confirmPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  confirmSecondaryButton: {
    width: '100%',
    minHeight: 46,
    borderRadius: 13,
    marginTop: 9,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  confirmSecondaryText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  confirmButtonPressed: {
    opacity: 0.85,
  },
  disabledButton: {
    opacity: 0.6,
  },
  hero: {
    backgroundColor: '#ECEEFF',
    borderRadius: 24,
    padding: 26,
    marginBottom: 34,
    overflow: 'hidden',
  },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '800',
    letterSpacing: -1.1,
    maxWidth: 560,
  },
  heroDescription: {
    color: '#626B83',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10,
    marginBottom: 24,
    maxWidth: 520,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3E5F3',
    borderRadius: 13,
    minHeight: 52,
    paddingHorizontal: 14,
    maxWidth: 650,
  },
  searchIcon: {
    color: COLORS.primary,
    fontSize: 27,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 14,
    outlineStyle: 'none',
  } as object,
  clearButton: {
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  clearText: {
    fontSize: 23,
    color: COLORS.muted,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  sectionSubtitle: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 5,
    lineHeight: 19,
  },
  categoryScroll: {
    flexGrow: 0,
    marginBottom: 32,
  },
  categoryList: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 3,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  categoryChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#596176',
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  booksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
  },
  refreshButton: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: '#ECEEFF',
  },
  refreshText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    alignItems: 'stretch',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#EAECF3',
    overflow: 'hidden',
    marginBottom: 1,
  },
  cardPressable: {
    flex: 1,
  },
  cover: {
    height: 205,
    margin: 10,
    marginBottom: 0,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
    paddingTop: 20,
    paddingBottom: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  coverDecoration: {
    position: 'absolute',
    width: 115,
    height: 115,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.34)',
    top: -43,
    right: -35,
  },
  coverIcon: {
    fontSize: 28,
    color: '#4444A1',
    marginBottom: 12,
  },
  coverBookTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#292B55',
    textAlign: 'center',
    lineHeight: 22,
  },
  coverAuthor: {
    fontSize: 10,
    color: '#555778',
    marginTop: 8,
    textAlign: 'center',
  },
  coverBadge: {
    position: 'absolute',
    top: 9,
    left: 9,
    maxWidth: '65%',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  coverBadgeText: {
    color: COLORS.text,
    fontSize: 9,
    fontWeight: '800',
  },
  priceBadge: {
    position: 'absolute',
    top: 9,
    right: 9,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: '55%',
  },
  paidBadge: {
    backgroundColor: '#FEF3C7',
  },
  freeBadge: {
    backgroundColor: '#D1FAE5',
  },
  priceBadgeText: {
    color: '#192238',
    fontSize: 10,
    fontWeight: '800',
  },
  cardDetails: {
    padding: 13,
    paddingBottom: 15,
    flex: 1,
  },
  bookTitle: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    minHeight: 40,
  },
  bookAuthor: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 5,
  },
  bookDescription: {
    color: '#777F91',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  manualApprovalNote: {
    color: '#777F91',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 9,
  },
  readButton: {
    marginTop: 14,
    minHeight: 38,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: '#F0F0FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  readButtonText: {
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 12,
  },
  readArrow: {
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 16,
  },
  requestButton: {
    backgroundColor: COLORS.primary,
  },
  requestButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  requestArrow: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  pendingButton: {
    backgroundColor: '#FFF7DB',
    justifyContent: 'center',
  },
  pendingButtonText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '800',
  },
  stateContainer: {
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 25,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stateIcon: {
    fontSize: 30,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 8,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
  },
  stateText: {
    color: COLORS.muted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
  primaryButton: {
    marginTop: 18,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: '#ECEEFF',
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 13,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 45,
    paddingTop: 20,
    alignItems: 'center',
  },
  footerText: {
    color: COLORS.muted,
    fontSize: 12,
  },
});
