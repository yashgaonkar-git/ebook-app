
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Pdf from 'react-native-pdf';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';

type PdfReaderProps = {
  id: string;
  path: string;
  title: string;
};

type ReaderTheme = 'light' | 'sepia' | 'dark';

const THEMES: Record<
  ReaderTheme,
  {
    background: string;
    surface: string;
    pageBackground: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
    accentSoft: string;
    overlay: string;
  }
> = {
  light: {
    background: '#F6F7FB',
    surface: '#FFFFFF',
    pageBackground: '#E9ECF4',
    text: '#192238',
    muted: '#727B90',
    border: '#E4E7EF',
    accent: '#4F46E5',
    accentSoft: '#ECEBFF',
    overlay: '#F6F7FB',
  },
  sepia: {
    background: '#F2E7D3',
    surface: '#FAF1E2',
    pageBackground: '#E8D8BB',
    text: '#493824',
    muted: '#88765E',
    border: '#DDCBAE',
    accent: '#93652D',
    accentSoft: '#EAD9BA',
    overlay: '#F2E7D3',
  },
  dark: {
    background: '#111318',
    surface: '#1D2028',
    pageBackground: '#171A21',
    text: '#F1F2F6',
    muted: '#A2A8B7',
    border: '#303440',
    accent: '#A5A0FF',
    accentSoft: '#302E50',
    overlay: '#111318',
  },
};

const THEME_OPTIONS: {
  id: ReaderTheme;
  label: string;
  color: string;
}[] = [
  { id: 'light', label: 'Light', color: '#FFFFFF' },
  { id: 'sepia', label: 'Sepia', color: '#E8D8BB' },
  { id: 'dark', label: 'Dark', color: '#20232B' },
];

const THEME_STORAGE_KEY = 'bookspace-reader-theme';
const CACHE_DIRECTORY = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}bookspace-pdf-cache/`
  : null;

// Produce a deterministic, filesystem-safe filename from the book identity.
function hashString(value: string): string {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

function getCachedPdfPath(bookId: string, path: string): string | null {
  if (!CACHE_DIRECTORY) return null;

  const cacheKey = hashString(`${bookId}:${path}`);
  return `${CACHE_DIRECTORY}${cacheKey}.pdf`;
}

export default function PdfReader({
  id,
  path,
  title,
}: PdfReaderProps) {
  const storageKey = `reading-progress-${id || path}`;

  const [pdfUrl, setPdfUrl] = useState('');
  const [localPdfUri, setLocalPdfUri] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [cacheStatus, setCacheStatus] = useState<
    'checking' | 'cached' | 'downloading' | 'ready' | 'error'
  >('checking');
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [retryToken, setRetryToken] = useState(0);

  const [readerTheme, setReaderTheme] = useState<ReaderTheme>('light');
  const [themeLoaded, setThemeLoaded] = useState(false);

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [contentsVisible, setContentsVisible] = useState(false);
  const [pageInput, setPageInput] = useState('');
  const [pageInputError, setPageInputError] = useState('');
  const [trackWidth, setTrackWidth] = useState(0);

  const colors = THEMES[readerTheme];

  const progressPercent =
    totalPages > 0
      ? Math.min(100, Math.round((page / totalPages) * 100))
      : 0;

  // Restore the preferred reading theme.
  useEffect(() => {
    let active = true;

    async function restoreTheme() {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);

        if (
          active &&
          (savedTheme === 'light' ||
            savedTheme === 'sepia' ||
            savedTheme === 'dark')
        ) {
          setReaderTheme(savedTheme);
        }
      } catch (err) {
        console.warn('Could not restore reader theme:', err);
      } finally {
        if (active) setThemeLoaded(true);
      }
    }

    void restoreTheme();

    return () => {
      active = false;
    };
  }, []);

  // Persist the selected theme.
  useEffect(() => {
    if (!themeLoaded) return;

    void AsyncStorage.setItem(THEME_STORAGE_KEY, readerTheme).catch((err) => {
      console.warn('Could not save reader theme:', err);
    });
  }, [readerTheme, themeLoaded]);

  // Restore local progress first, then prefer cloud progress.
  useEffect(() => {
    let active = true;

    async function restoreProgress() {
      setProgressLoaded(false);
      setPage(1);

      try {
        const savedLocal = await AsyncStorage.getItem(storageKey);

        let restoredPage =
          savedLocal &&
          Number.isInteger(Number(savedLocal)) &&
          Number(savedLocal) >= 1
            ? Number(savedLocal)
            : 1;

        if (id) {
          const { data: userResult, error: userError } =
            await supabase.auth.getUser();

          if (userError) {
            console.warn('Could not get signed-in user:', userError.message);
          }

          const user = userResult?.user;

          if (user) {
            const { data, error: progressError } = await supabase
              .from('reading_progress')
              .select('current_page')
              .eq('user_id', user.id)
              .eq('book_id', id)
              .maybeSingle();

            if (progressError) {
              console.warn('Could not load cloud progress:', progressError.message);
            } else if (
              data &&
              Number.isInteger(data.current_page) &&
              data.current_page >= 1
            ) {
              restoredPage = data.current_page;

              await AsyncStorage.setItem(
                storageKey,
                String(restoredPage),
              );
            } else if (savedLocal) {
              const { error: insertError } = await supabase
                .from('reading_progress')
                .upsert(
                  {
                    user_id: user.id,
                    book_id: id,
                    current_page: restoredPage,
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'user_id,book_id' },
                );

              if (insertError) {
                console.warn('Could not migrate progress:', insertError.message);
              }
            }
          }
        }

        if (active) setPage(restoredPage);
      } catch (err) {
        console.warn('Could not restore reading progress:', err);
      } finally {
        if (active) setProgressLoaded(true);
      }
    }

    void restoreProgress();

    return () => {
      active = false;
    };
  }, [id, storageKey]);

  // Resolve the public URL from Supabase Storage.
  useEffect(() => {
    let active = true;

    setPdfUrl('');

    if (!path?.trim()) {
      setError('No PDF file path was provided. Return to Explore and select a book.');
      setLoading(false);
      return;
    }

    try {
      const { data } = supabase.storage.from('books').getPublicUrl(path);

      if (!data.publicUrl) {
        throw new Error('Supabase did not return a PDF URL.');
      }

      if (active) {
        setPdfUrl(data.publicUrl);
      }
    } catch (err) {
      console.error('Could not get PDF URL:', err);

      if (active) {
        setError('Could not get the PDF URL from Supabase Storage.');
        setLoading(false);
      }
    }

    return () => {
      active = false;
    };
  }, [path]);

  // Check persistent storage before downloading the PDF.
  useEffect(() => {
    let active = true;

    async function preparePdf() {
      setLoading(true);
      setError('');
      setLocalPdfUri('');
      setTotalPages(0);
      setDownloadPercent(0);
      setCacheStatus('checking');

      if (!pdfUrl || !path?.trim()) return;

      const cachedPath = getCachedPdfPath(id, path);

      try {
        if (!CACHE_DIRECTORY || !cachedPath) {
          throw new Error('Persistent file storage is unavailable on this device.');
        }

        await FileSystem.makeDirectoryAsync(CACHE_DIRECTORY, {
          intermediates: true,
        });

        const cachedInfo = await FileSystem.getInfoAsync(cachedPath);

        if (cachedInfo.exists && !cachedInfo.isDirectory) {
          // Reuse the complete local file without another PDF download.
          if (active) {
            setLocalPdfUri(cachedPath);
            setCacheStatus('cached');
            setLoading(false);
          }
          return;
        }

        if (active) setCacheStatus('downloading');

        // Download to a temporary filename, then move into the cache.
        // A partial download will not be mistaken for a complete cached PDF.
        const temporaryPath = `${cachedPath}.download`;

        const previousTemporary = await FileSystem.getInfoAsync(temporaryPath);
        if (previousTemporary.exists) {
          await FileSystem.deleteAsync(temporaryPath, { idempotent: true });
        }

        const download = await FileSystem.downloadAsync(
          pdfUrl,
          temporaryPath,
          {},
        );

        if (download.status < 200 || download.status >= 300) {
          await FileSystem.deleteAsync(temporaryPath, { idempotent: true });
          throw new Error(`PDF download returned HTTP ${download.status}.`);
        }

        const downloadedInfo = await FileSystem.getInfoAsync(temporaryPath);

        if (
          !downloadedInfo.exists ||
          downloadedInfo.isDirectory ||
          !('size' in downloadedInfo) ||
          !downloadedInfo.size
        ) {
          await FileSystem.deleteAsync(temporaryPath, { idempotent: true });
          throw new Error('The downloaded PDF file is empty or incomplete.');
        }

        await FileSystem.moveAsync({
          from: temporaryPath,
          to: cachedPath,
        });

        if (active) {
          setLocalPdfUri(cachedPath);
          setCacheStatus('ready');
          setDownloadPercent(100);
          setLoading(false);
        }
      } catch (err) {
        console.error('PDF caching failed:', err);

        if (!active) return;

        setCacheStatus('error');
        setLoading(false);
        setError(
          err instanceof Error
            ? `Could not cache this PDF: ${err.message}`
            : 'Could not download this PDF. Check your internet connection.',
        );
      }
    }

    void preparePdf();

    return () => {
      active = false;
    };
  }, [pdfUrl, id, path, retryToken]);

  // Save locally first, then synchronize reading progress with Supabase.
  const saveProgress = useCallback(
    async (nextPage: number) => {
      if (!Number.isInteger(nextPage) || nextPage < 1) return;

      try {
        await AsyncStorage.setItem(storageKey, String(nextPage));
      } catch (err) {
        console.warn('Could not save local progress:', err);
      }

      if (!id) return;

      try {
        const { data: userResult, error: userError } =
          await supabase.auth.getUser();

        if (userError) {
          console.warn('Could not get signed-in user:', userError.message);
          return;
        }

        const user = userResult.user;
        if (!user) return;

        const { error: progressError } = await supabase
          .from('reading_progress')
          .upsert(
            {
              user_id: user.id,
              book_id: id,
              current_page: nextPage,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,book_id' },
          );

        if (progressError) {
          console.warn('Could not sync cloud progress:', progressError.message);
        }
      } catch (err) {
        console.warn('Could not sync reading progress:', err);
      }
    },
    [id, storageKey],
  );

  const handlePageChanged = useCallback(
    (nextPage: number, numberOfPages: number) => {
      setPage(nextPage);
      setTotalPages(numberOfPages);
      void saveProgress(nextPage);
    },
    [saveProgress],
  );

  // react-native-pdf reads from the local file URI.
  const source = useMemo(
    () => (localPdfUri ? { uri: localPdfUri, cache: true } : undefined),
    [localPdfUri],
  );

  const goToPage = useCallback(
    (requestedPage: number) => {
      if (totalPages < 1) return;

      const safePage = Math.min(
        Math.max(Math.round(requestedPage), 1),
        totalPages,
      );

      setPage(safePage);
      void saveProgress(safePage);
    },
    [saveProgress, totalPages],
  );

  const submitPageNumber = () => {
    const requestedPage = Number(pageInput.trim());

    if (
      !pageInput.trim() ||
      !Number.isInteger(requestedPage) ||
      requestedPage < 1 ||
      requestedPage > totalPages
    ) {
      setPageInputError(`Enter a page from 1 to ${totalPages}.`);
      return;
    }

    goToPage(requestedPage);
    setPageInput('');
    setPageInputError('');
    setContentsVisible(false);
  };

  const retryLoading = () => {
    setError('');
    setLoading(true);
    setLocalPdfUri('');
    setCacheStatus('checking');
    setRetryToken((value) => value + 1);
  };

  const closeContents = () => {
    setContentsVisible(false);
    setPageInput('');
    setPageInputError('');
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar
        backgroundColor={colors.background}
        barStyle={readerTheme === 'dark' ? 'light-content' : 'dark-content'}
      />

      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerText}>
          <Text
            numberOfLines={1}
            style={[styles.title, { color: colors.text }]}
          >
            {title || 'PDF Reader'}
          </Text>

          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {totalPages > 0
              ? `${progressPercent}% read`
              : 'Your reading space'}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open reading settings"
          onPress={() => setSettingsVisible(true)}
          style={[
            styles.iconButton,
            { backgroundColor: colors.accentSoft },
          ]}
        >
          <Text style={[styles.iconButtonText, { color: colors.accent }]}>
            Aa
          </Text>
        </Pressable>
      </View>

      <View
        style={[
          styles.progressSection,
          { backgroundColor: colors.surface },
        ]}
      >
        <View
          style={[
            styles.progressTrack,
            { backgroundColor: colors.border },
          ]}
          onLayout={(event) => {
            setTrackWidth(event.nativeEvent.layout.width);
          }}
        >
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel="Reading progress. Tap to navigate to a page."
            disabled={loading || totalPages < 1 || trackWidth < 1}
            onPress={(event) => {
              const position = event.nativeEvent.locationX;
              const ratio = Math.min(
                1,
                Math.max(0, position / trackWidth),
              );

              goToPage(Math.max(1, Math.ceil(ratio * totalPages)));
            }}
            style={styles.progressTouchArea}
          >
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progressPercent}%`,
                  backgroundColor: colors.accent,
                },
              ]}
            />
          </Pressable>
        </View>

        <View style={styles.progressLabels}>
          <Text style={[styles.progressLabel, { color: colors.muted }]}>
            Page {page}
          </Text>
          <Text style={[styles.progressLabel, { color: colors.muted }]}>
            {totalPages > 0 ? `${totalPages} pages` : 'Loading pages'}
          </Text>
        </View>
      </View>

      {error ? (
        <View style={styles.messageContainer}>
          <Text style={[styles.errorText, { color: '#DC2626' }]}>
            {error}
          </Text>

          <Pressable
            style={[
              styles.primaryButton,
              { backgroundColor: colors.accent },
            ]}
            onPress={retryLoading}
          >
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View
            style={[
              styles.readerContainer,
              { backgroundColor: colors.pageBackground },
            ]}
          >
            {(!localPdfUri || !progressLoaded || loading) && (
              <View
                style={[
                  styles.loadingOverlay,
                  { backgroundColor: colors.background },
                ]}
              >
                <ActivityIndicator size="large" color={colors.accent} />

                <Text style={[styles.loadingText, { color: colors.muted }]}>
                  {!progressLoaded
                    ? 'Restoring your reading position...'
                    : cacheStatus === 'checking'
                      ? 'Checking for a saved PDF...'
                      : cacheStatus === 'downloading'
                        ? `Downloading book... ${downloadPercent}%`
                        : 'Preparing your book...'}
                </Text>

                {cacheStatus === 'cached' ? (
                  <Text style={[styles.cacheHint, { color: colors.muted }]}>
                    Using your saved copy
                  </Text>
                ) : null}
              </View>
            )}

            {source && progressLoaded && (
              <Pdf
                key={localPdfUri}
                source={source}
                page={page}
                horizontal={false}
                enablePaging={false}
                enableAntialiasing
                fitPolicy={0}
                spacing={10}
                style={[
                  styles.pdf,
                  { backgroundColor: colors.pageBackground },
                ]}
                onLoadComplete={(numberOfPages) => {
                  setTotalPages(numberOfPages);
                  setPage((current) =>
                    Math.min(Math.max(current, 1), numberOfPages),
                  );
                  setLoading(false);
                  setError('');
                }}
                onPageChanged={handlePageChanged}
                onError={(err) => {
                  console.error('Native PDF loading error:', err);
                  setLoading(false);
                  setError(
                    'Could not open the cached PDF. Try again to check or download the file again.',
                  );
                }}
              />
            )}
          </View>

          <View
            style={[
              styles.bottomBar,
              {
                backgroundColor: colors.surface,
                borderTopColor: colors.border,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open contents and page navigation"
              onPress={() => setContentsVisible(true)}
              style={styles.bottomAction}
            >
              <Text style={[styles.bottomActionIcon, { color: colors.text }]}>
                ☷
              </Text>
              <Text style={[styles.bottomActionLabel, { color: colors.muted }]}>
                Contents
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={loading || page <= 1 || totalPages < 1}
              onPress={() => goToPage(page - 1)}
              style={[
                styles.pageButton,
                { backgroundColor: colors.accentSoft },
                (loading || page <= 1 || totalPages < 1) &&
                  styles.disabledButton,
              ]}
            >
              <Text style={[styles.pageButtonText, { color: colors.accent }]}>
                ‹
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setPageInput(String(page));
                setPageInputError('');
                setContentsVisible(true);
              }}
              style={styles.currentPageButton}
            >
              <Text style={[styles.currentPage, { color: colors.text }]}>
                {page}
                <Text style={{ color: colors.muted }}>
                  {' '}
                  / {totalPages || '—'}
                </Text>
              </Text>
              <Text style={[styles.currentPageHint, { color: colors.muted }]}>
                Go to page
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={loading || totalPages < 1 || page >= totalPages}
              onPress={() => goToPage(page + 1)}
              style={[
                styles.pageButton,
                { backgroundColor: colors.accentSoft },
                (loading || totalPages < 1 || page >= totalPages) &&
                  styles.disabledButton,
              ]}
            >
              <Text style={[styles.pageButtonText, { color: colors.accent }]}>
                ›
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open reading theme settings"
              onPress={() => setSettingsVisible(true)}
              style={styles.bottomAction}
            >
              <Text style={[styles.bottomActionIcon, { color: colors.text }]}>
                ◐
              </Text>
              <Text style={[styles.bottomActionLabel, { color: colors.muted }]}>
                Theme
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Theme settings */}
      <Modal
        visible={settingsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[styles.sheet, { backgroundColor: colors.surface }]}
          >
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>
                  Reading appearance
                </Text>
                <Text style={[styles.sheetSubtitle, { color: colors.muted }]}>
                  Choose a comfortable reading theme.
                </Text>
              </View>

              <Pressable
                onPress={() => setSettingsVisible(false)}
                style={[
                  styles.closeButton,
                  { backgroundColor: colors.accentSoft },
                ]}
              >
                <Text style={[styles.closeButtonText, { color: colors.accent }]}>
                  ×
                </Text>
              </Pressable>
            </View>

            <View style={styles.themeOptions}>
              {THEME_OPTIONS.map((option) => {
                const selected = readerTheme === option.id;

                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setReaderTheme(option.id)}
                    style={[
                      styles.themeOption,
                      {
                        borderColor: selected ? colors.accent : colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.themePreview,
                        {
                          backgroundColor: option.color,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.themePreviewLine,
                          {
                            backgroundColor:
                              option.id === 'dark' ? '#777D8B' : '#B7B0A5',
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.themePreviewLine,
                          {
                            backgroundColor:
                              option.id === 'dark' ? '#777D8B' : '#B7B0A5',
                            width: '55%',
                          },
                        ]}
                      />
                    </View>

                    <Text style={[styles.themeLabel, { color: colors.text }]}>
                      {option.label}
                    </Text>
                    <Text style={[styles.themeSelected, { color: colors.accent }]}>
                      {selected ? 'Selected' : 'Tap to apply'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View
              style={[
                styles.infoCard,
                { backgroundColor: colors.background },
              ]}
            >
              <Text style={[styles.infoTitle, { color: colors.text }]}>
                About PDF themes
              </Text>
              <Text style={[styles.infoText, { color: colors.muted }]}>
                Themes change the reader interface and the area around the
                PDF. They do not recolor the actual PDF pages.
              </Text>
            </View>

            <Pressable
              onPress={() => setSettingsVisible(false)}
              style={[
                styles.primaryButton,
                { backgroundColor: colors.accent },
              ]}
            >
              <Text style={styles.primaryButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Contents and page navigation */}
      <Modal
        visible={contentsVisible}
        transparent
        animationType="slide"
        onRequestClose={closeContents}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.sheet,
              styles.contentsSheet,
              { backgroundColor: colors.surface },
            ]}
          >
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleContainer}>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>
                  Contents & navigation
                </Text>
                <Text style={[styles.sheetSubtitle, { color: colors.muted }]}>
                  Jump directly to a page.
                </Text>
              </View>

              <Pressable
                onPress={closeContents}
                style={[
                  styles.closeButton,
                  { backgroundColor: colors.accentSoft },
                ]}
              >
                <Text style={[styles.closeButtonText, { color: colors.accent }]}>
                  ×
                </Text>
              </Pressable>
            </View>

            <Text style={[styles.inputLabel, { color: colors.text }]}>
              Go to page
            </Text>

            <View style={styles.pageInputRow}>
              <TextInput
                value={pageInput}
                onChangeText={(value) => {
                  setPageInput(value.replace(/[^0-9]/g, ''));
                  setPageInputError('');
                }}
                keyboardType="number-pad"
                placeholder={`1 - ${totalPages || '...'}`}
                placeholderTextColor={colors.muted}
                returnKeyType="go"
                onSubmitEditing={submitPageNumber}
                accessibilityLabel="Page number"
                style={[
                  styles.pageInput,
                  {
                    backgroundColor: colors.background,
                    color: colors.text,
                    borderColor: pageInputError ? '#DC2626' : colors.border,
                  },
                ]}
              />

              <Pressable
                onPress={submitPageNumber}
                disabled={totalPages < 1}
                style={[
                  styles.primaryButton,
                  styles.goButton,
                  { backgroundColor: colors.accent },
                  totalPages < 1 && styles.disabledButton,
                ]}
              >
                <Text style={styles.primaryButtonText}>Go</Text>
              </Pressable>
            </View>

            {pageInputError ? (
              <Text style={styles.inputError}>{pageInputError}</Text>
            ) : null}

            <Text style={[styles.inputLabel, { color: colors.text }]}>
              Quick navigation
            </Text>

            <ScrollView
              style={styles.contentsList}
              contentContainerStyle={styles.contentsListContent}
              showsVerticalScrollIndicator={false}
            >
              {totalPages > 0 ? (
                Array.from(
                  new Set([
                    1,
                    Math.max(1, Math.ceil(totalPages * 0.25)),
                    Math.max(1, Math.ceil(totalPages * 0.5)),
                    Math.max(1, Math.ceil(totalPages * 0.75)),
                    totalPages,
                  ]),
                ).map((targetPage) => {
                  const selected = page === targetPage;

                  return (
                    <Pressable
                      key={targetPage}
                      onPress={() => {
                        goToPage(targetPage);
                        closeContents();
                      }}
                      style={[
                        styles.contentsRow,
                        {
                          backgroundColor: selected
                            ? colors.accentSoft
                            : colors.background,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.contentsPageNumber,
                          { backgroundColor: colors.surface },
                        ]}
                      >
                        <Text
                          style={[
                            styles.contentsPageNumberText,
                            { color: colors.accent },
                          ]}
                        >
                          {targetPage}
                        </Text>
                      </View>

                      <View style={styles.contentsRowText}>
                        <Text
                          style={[
                            styles.contentsRowTitle,
                            { color: colors.text },
                          ]}
                        >
                          {targetPage === 1
                            ? 'Beginning'
                            : targetPage === totalPages
                              ? 'Last page'
                              : `Page ${targetPage}`}
                        </Text>

                        <Text
                          style={[
                            styles.contentsRowSubtitle,
                            { color: colors.muted },
                          ]}
                        >
                          {targetPage === page
                            ? 'Current reading position'
                            : `${Math.round((targetPage / totalPages) * 100)}% through the book`}
                        </Text>
                      </View>

                      <Text
                        style={[styles.contentsArrow, { color: colors.accent }]}
                      >
                        {selected ? '✓' : '›'}
                      </Text>
                    </Pressable>
                  );
                })
              ) : (
                <Text style={[styles.emptyContents, { color: colors.muted }]}>
                  Page navigation will be available once the PDF has loaded.
                </Text>
              )}
            </ScrollView>

            <Pressable
              onPress={closeContents}
              style={[
                styles.primaryButton,
                { backgroundColor: colors.accent },
              ]}
            >
              <Text style={styles.primaryButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    minHeight: 68,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.35,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: {
    fontSize: 17,
    fontWeight: '800',
  },
  progressSection: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
  },
  progressTrack: {
    height: 5,
    borderRadius: 8,
    overflow: 'hidden',
  },
  progressTouchArea: {
    height: 16,
    marginTop: -5,
    justifyContent: 'center',
  },
  progressFill: {
    height: 5,
    borderRadius: 8,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  readerContainer: {
    flex: 1,
    marginHorizontal: 8,
    marginTop: 6,
    marginBottom: 8,
    overflow: 'hidden',
    borderRadius: 12,
  },
  pdf: {
    flex: 1,
    width: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  cacheHint: {
    marginTop: 7,
    fontSize: 11,
  },
  bottomBar: {
    minHeight: 74,
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
  },
  bottomAction: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  bottomActionIcon: {
    fontSize: 23,
    lineHeight: 27,
  },
  bottomActionLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  pageButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageButtonText: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '500',
  },
  currentPageButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 68,
  },
  currentPage: {
    fontSize: 14,
    fontWeight: '800',
  },
  currentPageHint: {
    fontSize: 10,
    marginTop: 3,
  },
  disabledButton: {
    opacity: 0.4,
  },
  messageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 14,
  },
  errorText: {
    textAlign: 'center',
    lineHeight: 21,
  },
  primaryButton: {
    minHeight: 44,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  contentsSheet: {
    height: '76%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 4,
    backgroundColor: '#9297A3',
    opacity: 0.5,
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 22,
  },
  sheetTitleContainer: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  sheetSubtitle: {
    fontSize: 12,
    marginTop: 5,
    lineHeight: 18,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 25,
    lineHeight: 28,
  },
  themeOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  themeOption: {
    flex: 1,
    minWidth: 0,
    borderRadius: 15,
    borderWidth: 1.5,
    padding: 9,
  },
  themePreview: {
    height: 64,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    padding: 8,
  },
  themePreviewLine: {
    height: 4,
    width: '75%',
    borderRadius: 4,
  },
  themeLabel: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 10,
  },
  themeSelected: {
    fontSize: 10,
    marginTop: 4,
  },
  infoCard: {
    padding: 14,
    borderRadius: 14,
    marginTop: 22,
    marginBottom: 18,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 5,
  },
  infoText: {
    fontSize: 12,
    lineHeight: 19,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 9,
  },
  pageInputRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 5,
  },
  pageInput: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  goButton: {
    minWidth: 74,
  },
  inputError: {
    color: '#DC2626',
    fontSize: 12,
    marginTop: 5,
    marginBottom: 8,
  },
  contentsList: {
    flex: 1,
    marginTop: 5,
    marginBottom: 14,
  },
  contentsListContent: {
    gap: 9,
    paddingBottom: 8,
  },
  contentsRow: {
    minHeight: 65,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 11,
  },
  contentsPageNumber: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentsPageNumberText: {
    fontSize: 13,
    fontWeight: '800',
  },
  contentsRowText: {
    flex: 1,
  },
  contentsRowTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  contentsRowSubtitle: {
    fontSize: 11,
    marginTop: 4,
  },
  contentsArrow: {
    fontSize: 24,
    fontWeight: '500',
  },
  emptyContents: {
    textAlign: 'center',
    paddingVertical: 24,
    lineHeight: 20,
  },
});
