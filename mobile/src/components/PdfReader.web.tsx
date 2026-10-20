
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';

import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

type PdfReaderProps = {
  id: string;
  path: string;
  title: string;
};

type ThemeName = 'light' | 'sepia' | 'dark';
type PanelName = 'contents' | 'theme' | null;

type PdfModule = {
  Document: ComponentType<any>;
  Page: ComponentType<any>;
  pdfjs: {
    version: string;
    GlobalWorkerOptions: {
      workerSrc: string;
    };
  };
};

const THEME_STORAGE_KEY = 'bookspace-reader-theme';

const themes = {
  light: {
    background: '#F5F7FB',
    surface: '#FFFFFF',
    toolbar: '#FFFFFF',
    text: '#172033',
    secondary: '#68738A',
    border: '#E2E7F0',
    accent: '#4F46E5',
    accentSoft: '#E8EAFE',
    buttonText: '#FFFFFF',
    mutedButton: '#EEF1F8',
    modalOverlay: 'rgba(12, 18, 32, 0.48)',
    input: '#FFFFFF',
  },
  sepia: {
    background: '#F2E8D5',
    surface: '#FBF3E3',
    toolbar: '#F8EEDB',
    text: '#4B3828',
    secondary: '#856D55',
    border: '#E1D0B5',
    accent: '#93632D',
    accentSoft: '#EDE0C9',
    buttonText: '#FFFFFF',
    mutedButton: '#EDE0C9',
    modalOverlay: 'rgba(48, 34, 20, 0.48)',
    input: '#FFF8EA',
  },
  dark: {
    background: '#11151D',
    surface: '#1B222D',
    toolbar: '#1B222D',
    text: '#F1F5FB',
    secondary: '#A2ADBF',
    border: '#303A49',
    accent: '#8B91FF',
    accentSoft: '#30334F',
    buttonText: '#11151D',
    mutedButton: '#293241',
    modalOverlay: 'rgba(0, 0, 0, 0.72)',
    input: '#202936',
  },
};

export default function PdfReader({
  id: bookId,
  path: pdfPath,
  title: bookTitle,
}: PdfReaderProps) {
  const [pdfModule, setPdfModule] = useState<PdfModule | null>(null);
  const [windowWidth, setWindowWidth] = useState(900);
  const [pdfUrl, setPdfUrl] = useState('');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pageInput, setPageInput] = useState('1');
  const [trackWidth, setTrackWidth] = useState(0);

  const [progressLoaded, setProgressLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progressError, setProgressError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  const [themeName, setThemeName] = useState<ThemeName>('light');
  const [activePanel, setActivePanel] = useState<PanelName>(null);

  const theme = themes[themeName];

  const PdfDocument = pdfModule?.Document;
  const PdfPage = pdfModule?.Page;

  const progressPercent =
    totalPages > 0 ? Math.min(100, (page / totalPages) * 100) : 0;

  const pageWidth = useMemo(
    () => Math.max(280, Math.min(850, windowWidth - 36)),
    [windowWidth]
  );

  // Initialize the browser-only PDF library.
  useEffect(() => {
    let active = true;

    async function initializePdf() {
      try {
        const module = await import('react-pdf');

        if (!active) return;

        module.pdfjs.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${module.pdfjs.version}/build/pdf.worker.min.mjs`;

        setPdfModule({
          Document: module.Document,
          Page: module.Page,
          pdfjs: module.pdfjs,
        });
      } catch (err) {
        console.error('PDF initialization failed:', err);

        if (active) {
          setError('Could not initialize the PDF reader. Please refresh and try again.');
          setLoading(false);
        }
      }
    }

    void initializePdf();

    return () => {
      active = false;
    };
  }, []);

  // Track browser width for responsive PDF sizing.
  useEffect(() => {
    const updateWidth = () => setWindowWidth(window.innerWidth);

    updateWidth();
    window.addEventListener('resize', updateWidth);

    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Restore the preferred reader theme.
  useEffect(() => {
    let active = true;

    async function loadTheme() {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);

        if (
          active &&
          (savedTheme === 'light' ||
            savedTheme === 'sepia' ||
            savedTheme === 'dark')
        ) {
          setThemeName(savedTheme);
        }
      } catch (err) {
        console.warn('Could not restore reader theme:', err);
      }
    }

    void loadTheme();

    return () => {
      active = false;
    };
  }, []);

  const changeTheme = useCallback(async (nextTheme: ThemeName) => {
    setThemeName(nextTheme);
    setActivePanel(null);

    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch (err) {
      console.warn('Could not save reader theme:', err);
    }
  }, []);


  // Resolve a temporary PDF URL after server-side access verification.
  useEffect(() => {
    let active = true;

    setPdfUrl('');
    setTotalPages(0);
    setPage(1);
    setPageInput('1');
    setLoading(true);
    setError('');

    async function resolveAuthorizedPdf() {
      if (!bookId?.trim()) {
        setError('The book ID is missing. Return to Explore and select a book.');
        setLoading(false);
        return;
      }

      if (!pdfPath?.trim()) {
        setError('No PDF file path was provided. Return to Explore and select a book.');
        setLoading(false);
        return;
      }

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (!session?.access_token) {
          throw new Error('Please sign in to read this book.');
        }

        const { data, error: functionError } =
          await supabase.functions.invoke('get-book-url', {
            body: { bookId },
          });

        if (functionError) {
          const response = (
            functionError as { context?: Response }
          ).context;

          if (response) {
            let serverMessage = '';

            try {
              const responseBody = await response.clone().json();
                serverMessage = [
                  responseBody?.error,
                  responseBody?.details,
                ]
                  .filter(Boolean)
                  .join(' — ');
            } catch {
              // Use a fallback message if the response isn't JSON.
            }

            if (response.status === 403) {
              throw new Error(
                serverMessage ||
                  'You need access to this paid book before you can read it.',
              );
            }

            if (response.status === 401) {
              throw new Error(
                serverMessage || 'Your session has expired. Please sign in again.',
              );
            }

            throw new Error(
              serverMessage ||
                `Could not authorize this book (HTTP ${response.status}).`,
            );
          }

          throw new Error(
            functionError.message || 'Could not verify access to this book.',
          );
        }

        if (!data?.signedUrl || typeof data.signedUrl !== 'string') {
          throw new Error('The server did not return a valid PDF URL.');
        }

        if (active) {
          setPdfUrl(data.signedUrl);
        }
      } catch (err) {
        console.error('Could not authorize PDF access:', err);

        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not verify access to this book. Please try again.',
          );
          setLoading(false);
        }
      }
    }

    void resolveAuthorizedPdf();

    return () => {
      active = false;
    };
  }, [bookId, pdfPath]);


  // Load the signed-in user and their saved page for this book.
  useEffect(() => {
    let active = true;

    async function loadProgress() {
      setProgressLoaded(false);
      setProgressError('');
      setUserId(null);
      setPage(1);
      setPageInput('1');

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;
        if (!active) return;

        if (!user) {
          setProgressError('Sign in to sync your reading progress across devices.');
          return;
        }

        setUserId(user.id);

        const { data, error: queryError } = await supabase
          .from('reading_progress')
          .select('current_page')
          .eq('user_id', user.id)
          .eq('book_id', bookId)
          .maybeSingle();

        if (queryError) throw queryError;
        if (!active) return;

        const savedPage = Number(data?.current_page);

        if (Number.isInteger(savedPage) && savedPage >= 1) {
          setPage(savedPage);
          setPageInput(String(savedPage));
        }
      } catch (err: unknown) {
        console.error('Could not load cloud progress:', err);

        if (active) {
          setProgressError(
            err instanceof Error
              ? `Could not load cloud progress: ${err.message}`
              : 'Could not load your cloud reading progress.'
          );
        }
      } finally {
        if (active) setProgressLoaded(true);
      }
    }

    if (bookId) {
      void loadProgress();
    } else {
      setProgressLoaded(true);
      setProgressError('The book ID is missing, so progress cannot sync.');
    }

    return () => {
      active = false;
    };
  }, [bookId]);

  // Save the current page to Supabase.
  const saveProgress = useCallback(
    async (nextPage: number) => {
      if (!userId || !bookId || totalPages < 1) return;

      const validPage = Math.min(Math.max(nextPage, 1), totalPages);

      const { error: saveError } = await supabase
        .from('reading_progress')
        .upsert(
          {
            user_id: userId,
            book_id: bookId,
            current_page: validPage,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,book_id' }
        );

      if (saveError) {
        console.error('Could not save cloud progress:', saveError);
        setProgressError(`Could not save reading progress: ${saveError.message}`);
      } else {
        setProgressError('');
      }
    },
    [userId, bookId, totalPages]
  );

  // Navigate to a specific page.
  const changePage = useCallback(
    (nextPage: number) => {
      if (!totalPages) return;

      const validPage = Math.min(Math.max(Math.round(nextPage), 1), totalPages);

      setPage(validPage);
      setPageInput(String(validPage));
      void saveProgress(validPage);
    },
    [totalPages, saveProgress]
  );

  const submitPageInput = () => {
    const requestedPage = Number.parseInt(pageInput, 10);

    if (!Number.isFinite(requestedPage) || !totalPages) {
      setPageInput(String(page));
      return;
    }

    changePage(requestedPage);
  };

  const jumpToFraction = (fraction: number) => {
    if (!totalPages) return;

    changePage(Math.max(1, Math.ceil(totalPages * fraction)));
    setActivePanel(null);
  };

  const handleProgressTrackPress = (event: any) => {
    if (!trackWidth || !totalPages) return;

    const locationX = event?.nativeEvent?.locationX;

    if (typeof locationX !== 'number') return;

    const fraction = Math.max(0, Math.min(1, locationX / trackWidth));
    changePage(Math.max(1, Math.ceil(fraction * totalPages)));
  };

  const buttonStyle = {
    backgroundColor: theme.accent,
  };

  const mutedButtonStyle = {
    backgroundColor: theme.mutedButton,
    borderColor: theme.border,
  };

  const modalVisible = activePanel !== null;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Reader header */}
      <View
        style={[
          styles.header,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={styles.headerText}>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>
            BOOKSPACE READER
          </Text>

          <Text
            style={[styles.heading, { color: theme.text }]}
            numberOfLines={2}
          >
            {bookTitle}
          </Text>

          <Text
            style={[styles.subtitle, { color: theme.secondary }]}
            numberOfLines={1}
          >
            {pdfPath || 'No PDF selected'}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open contents and page navigation"
            onPress={() => setActivePanel('contents')}
            style={[
              styles.headerButton,
              mutedButtonStyle,
            ]}
          >
            <Text style={[styles.headerButtonText, { color: theme.text }]}>
              Contents
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change reader theme"
            onPress={() => setActivePanel('theme')}
            style={[
              styles.headerButton,
              mutedButtonStyle,
            ]}
          >
            <Text style={[styles.headerButtonText, { color: theme.text }]}>
              {themeName === 'light'
                ? '☀ Light'
                : themeName === 'sepia'
                  ? '◐ Sepia'
                  : '☾ Dark'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Reading progress */}
      <View
        style={[
          styles.progressCard,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={styles.progressLabels}>
          <Text style={[styles.progressLabel, { color: theme.secondary }]}>
            READING PROGRESS
          </Text>

          <Text style={[styles.progressValue, { color: theme.text }]}>
            {totalPages ? `${Math.round(progressPercent)}%` : '—'}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Jump to a page using the reading progress bar"
          onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
          onPress={handleProgressTrackPress}
          style={[styles.progressTrack, { backgroundColor: theme.border }]}
        >
          <View
            style={[
              styles.progressFill,
              {
                width: `${progressPercent}%`,
                backgroundColor: theme.accent,
              },
            ]}
          />
        </Pressable>

        <View style={styles.progressBottom}>
          <Text style={[styles.smallText, { color: theme.secondary }]}>
            Page {page} of {totalPages || '…'}
          </Text>

          <Text style={[styles.smallText, { color: theme.secondary }]}>
            Your progress syncs to your account
          </Text>
        </View>
      </View>

      {progressError ? (
        <Text
          accessibilityRole="alert"
          style={[styles.progressWarning, { color: theme.secondary }]}
        >
          {progressError}
        </Text>
      ) : null}

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>

          <Pressable
            onPress={() => {
              setError('');
              setLoading(true);
              setPdfModule(null);
              setTotalPages(0);
              setPage(1);
              setPageInput('1');
            }}
            style={[styles.primaryButton, buttonStyle]}
          >
            <Text style={[styles.primaryButtonText, { color: theme.buttonText }]}>
              Retry reader
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Loading state */}
      {(!pdfModule || !progressLoaded || loading) && !error ? (
        <View
          style={[
            styles.center,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingTitle, { color: theme.text }]}>
            Preparing your book
          </Text>
          <Text style={[styles.loadingMessage, { color: theme.secondary }]}>
            Loading your document and saved reading position…
          </Text>
        </View>
      ) : null}

      {/* PDF and page navigation */}
      {PdfDocument && PdfPage && pdfUrl && progressLoaded && !error ? (
        <>
          <View
            style={[
              styles.navigationBar,
              { backgroundColor: theme.toolbar, borderColor: theme.border },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              disabled={page <= 1 || loading || !totalPages}
              onPress={() => changePage(page - 1)}
              style={[
                styles.navigationButton,
                mutedButtonStyle,
                (page <= 1 || loading || !totalPages) && styles.disabled,
              ]}
            >
              <Text style={[styles.navigationButtonText, { color: theme.text }]}>
                ‹ Previous
              </Text>
            </Pressable>

            <View style={styles.pageEntryGroup}>
              <TextInput
                accessibilityLabel="Current page number"
                value={pageInput}
                onChangeText={setPageInput}
                onSubmitEditing={submitPageInput}
                onBlur={submitPageInput}
                keyboardType="number-pad"
                returnKeyType="go"
                selectTextOnFocus
                style={[
                  styles.pageInput,
                  {
                    color: theme.text,
                    backgroundColor: theme.input,
                    borderColor: theme.border,
                  },
                ]}
              />

              <Text style={[styles.ofText, { color: theme.secondary }]}>
                / {totalPages || '…'}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={!totalPages || page >= totalPages || loading}
              onPress={() => changePage(page + 1)}
              style={[
                styles.navigationButton,
                buttonStyle,
                (!totalPages || page >= totalPages || loading) && styles.disabled,
              ]}
            >
              <Text
                style={[
                  styles.navigationButtonText,
                  { color: theme.buttonText },
                ]}
              >
                Next ›
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={[
              styles.documentScroll,
              { backgroundColor: theme.background },
            ]}
            contentContainerStyle={styles.documentContent}
          >
            <View
              style={[
                styles.paperContainer,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
              ]}
            >
              <PdfDocument
                key={pdfUrl}
                file={pdfUrl}
                loading={
                  <View style={styles.pdfLoading}>
                    <ActivityIndicator size="large" color={theme.accent} />
                    <Text style={{ color: theme.secondary, marginTop: 10 }}>
                      Loading PDF page…
                    </Text>
                  </View>
                }
                onLoadSuccess={({ numPages }: { numPages: number }) => {
                  setTotalPages(numPages);
                  setPage((current) => {
                    const validPage = Math.min(
                      Math.max(current, 1),
                      numPages
                    );
                    setPageInput(String(validPage));
                    return validPage;
                  });
                  setLoading(false);
                  setError('');
                }}
                onLoadError={(err: unknown) => {
                  console.error('Web PDF loading error:', err);
                  setLoading(false);
                  setError(
                    'Could not open this PDF. Check the Supabase Storage URL and browser access.'
                  );
                }}
              >
                <PdfPage
                  pageNumber={page}
                  width={pageWidth}
                  renderTextLayer
                  renderAnnotationLayer
                />
              </PdfDocument>
            </View>

            <Text style={[styles.documentHint, { color: theme.secondary }]}>
              Use Previous / Next, enter a page number, or select the progress
              bar to move through the book.
            </Text>
          </ScrollView>
        </>
      ) : null}

      {/* Theme and contents modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setActivePanel(null)}
      >
        <View
          style={[
            styles.modalOverlay,
            { backgroundColor: theme.modalOverlay },
          ]}
        >
          <View
            style={[
              styles.modalCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {activePanel === 'theme' ? 'Reading appearance' : 'Contents & navigation'}
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close panel"
                onPress={() => setActivePanel(null)}
                style={[
                  styles.closeButton,
                  { backgroundColor: theme.mutedButton },
                ]}
              >
                <Text style={[styles.closeButtonText, { color: theme.text }]}>
                  ✕
                </Text>
              </Pressable>
            </View>

            {activePanel === 'theme' ? (
              <View style={styles.themeOptions}>
                {(
                  [
                    {
                      key: 'light',
                      label: 'Light',
                      description: 'Clean and bright',
                      swatch: '#F5F7FB',
                    },
                    {
                      key: 'sepia',
                      label: 'Sepia',
                      description: 'Warm, paper-like surroundings',
                      swatch: '#F2E8D5',
                    },
                    {
                      key: 'dark',
                      label: 'Dark',
                      description: 'Dim reader interface',
                      swatch: '#11151D',
                    },
                  ] as const
                ).map((option) => {
                  const selected = themeName === option.key;

                  return (
                    <Pressable
                      key={option.key}
                      accessibilityRole="button"
                      onPress={() => void changeTheme(option.key)}
                      style={[
                        styles.themeOption,
                        {
                          backgroundColor: theme.background,
                          borderColor: selected ? theme.accent : theme.border,
                          borderWidth: selected ? 2 : 1,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.themeSwatch,
                          { backgroundColor: option.swatch },
                        ]}
                      />

                      <View style={styles.themeOptionText}>
                        <Text style={[styles.themeName, { color: theme.text }]}>
                          {option.label}
                        </Text>
                        <Text
                          style={[
                            styles.themeDescription,
                            { color: theme.secondary },
                          ]}
                        >
                          {option.description}
                        </Text>
                      </View>

                      <Text style={[styles.themeCheck, { color: theme.accent }]}>
                        {selected ? '✓' : ''}
                      </Text>
                    </Pressable>
                  );
                })}

                <Text style={[styles.modalNote, { color: theme.secondary }]}>
                  Your theme preference is saved on this device. It changes the
                  reader interface; the PDF page itself keeps its original colors.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.contentsScroll}
                contentContainerStyle={styles.contentsContent}
              >
                <Text style={[styles.sectionLabel, { color: theme.secondary }]}>
                  QUICK JUMP
                </Text>

                <View style={styles.quickJumpGrid}>
                  {[
                    { label: 'Beginning', fraction: 0 },
                    { label: '25%', fraction: 0.25 },
                    { label: 'Middle', fraction: 0.5 },
                    { label: '75%', fraction: 0.75 },
                    { label: 'Last page', fraction: 1 },
                  ].map((item) => (
                    <Pressable
                      key={item.label}
                      disabled={!totalPages}
                      onPress={() => jumpToFraction(item.fraction)}
                      style={[
                        styles.quickJumpButton,
                        {
                          backgroundColor: theme.mutedButton,
                          borderColor: theme.border,
                        },
                        !totalPages && styles.disabled,
                      ]}
                    >
                      <Text style={[styles.quickJumpText, { color: theme.text }]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text
                  style={[
                    styles.sectionLabel,
                    { color: theme.secondary, marginTop: 22 },
                  ]}
                >
                  GO TO PAGE
                </Text>

                <View style={styles.jumpInputRow}>
                  <TextInput
                    accessibilityLabel="Enter page to open"
                    value={pageInput}
                    onChangeText={setPageInput}
                    onSubmitEditing={() => {
                      submitPageInput();
                      setActivePanel(null);
                    }}
                    keyboardType="number-pad"
                    returnKeyType="go"
                    selectTextOnFocus
                    placeholder="Page number"
                    placeholderTextColor={theme.secondary}
                    style={[
                      styles.jumpInput,
                      {
                        color: theme.text,
                        backgroundColor: theme.input,
                        borderColor: theme.border,
                      },
                    ]}
                  />

                  <Pressable
                    disabled={!totalPages}
                    onPress={() => {
                      submitPageInput();
                      setActivePanel(null);
                    }}
                    style={[
                      styles.primaryButton,
                      buttonStyle,
                      !totalPages && styles.disabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.primaryButtonText,
                        { color: theme.buttonText },
                      ]}
                    >
                      Open page
                    </Text>
                  </Pressable>
                </View>

                <View
                  style={[
                    styles.currentPageCard,
                    { backgroundColor: theme.background, borderColor: theme.border },
                  ]}
                >
                  <Text style={[styles.currentPageLabel, { color: theme.secondary }]}>
                    CURRENT POSITION
                  </Text>
                  <Text style={[styles.currentPageNumber, { color: theme.text }]}>
                    Page {page} of {totalPages || '…'}
                  </Text>
                </View>

                <Text style={[styles.modalNote, { color: theme.secondary }]}>
                  This panel provides page-based navigation. Chapter titles are
                  not available because the current reader does not extract the
                  PDF's outline.
                </Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    padding: 12,
    gap: 10,
  },
  header: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 5,
  },
  heading: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 11,
    marginTop: 5,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 7,
  },
  headerButton: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
  },
  headerButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressCard: {
    padding: 14,
    borderRadius: 13,
    borderWidth: 1,
  },
  progressLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  progressValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  progressTrack: {
    height: 7,
    borderRadius: 8,
    overflow: 'hidden',
    cursor: 'pointer',
  } as any,
  progressFill: {
    height: '100%',
    borderRadius: 8,
  },
  progressBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  smallText: {
    fontSize: 11,
  },
  progressWarning: {
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  navigationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  navigationButton: {
    minWidth: 100,
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navigationButtonText: {
    fontSize: 12,
    fontWeight: '800',
  },
  pageEntryGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  pageInput: {
    width: 58,
    height: 37,
    textAlign: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    fontSize: 13,
    fontWeight: '700',
  },
  ofText: {
    fontSize: 12,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.4,
  },
  documentScroll: {
    flex: 1,
    minHeight: 180,
    borderRadius: 12,
  },
  documentContent: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  paperContainer: {
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  pdfLoading: {
    minHeight: 200,
    minWidth: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentHint: {
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  center: {
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 24,
  },
  loadingTitle: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: '800',
  },
  loadingMessage: {
    marginTop: 6,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  errorContainer: {
    alignItems: 'center',
    padding: 22,
    gap: 14,
  },
  errorText: {
    color: '#DC2626',
    textAlign: 'center',
    lineHeight: 21,
  },
  primaryButton: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 12,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '88%',
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 18,
  },
  modalTitle: {
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  themeOptions: {
    gap: 10,
  },
  themeOption: {
    minHeight: 68,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  themeSwatch: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#00000020',
  },
  themeOptionText: {
    flex: 1,
  },
  themeName: {
    fontSize: 14,
    fontWeight: '800',
  },
  themeDescription: {
    fontSize: 11,
    marginTop: 4,
  },
  themeCheck: {
    fontSize: 20,
    fontWeight: '800',
  },
  contentsScroll: {
    flexShrink: 1,
  },
  contentsContent: {
    paddingBottom: 6,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 10,
  },
  quickJumpGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickJumpButton: {
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  quickJumpText: {
    fontSize: 12,
    fontWeight: '700',
  },
  jumpInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  jumpInput: {
    flex: 1,
    minWidth: 0,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    fontSize: 13,
  },
  currentPageCard: {
    marginTop: 18,
    padding: 13,
    borderWidth: 1,
    borderRadius: 11,
  },
  currentPageLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  currentPageNumber: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 5,
  },
  modalNote: {
    fontSize: 11,
    lineHeight: 17,
    marginTop: 14,
  },
});
