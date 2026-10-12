import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const PDF_URL =
  'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';

const BOOK_ID = 'demo-pdf-1';
const STORAGE_KEY = `reading-progress-${BOOK_ID}`;

type PdfModule = typeof import('react-pdf');

export default function ReaderScreen() {
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [PdfViewer, setPdfViewer] = useState<PdfModule | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [error, setError] = useState('');

  // Load the PDF viewer in the browser.
  useEffect(() => {
    let active = true;

    import('react-pdf')
      .then((module) => {
        if (!active) return;

        module.pdfjs.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${module.pdfjs.version}/build/pdf.worker.min.mjs`;

        setPdfViewer(module);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load the PDF viewer.'
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // Restore the last-read page.
  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((savedPage) => {
        if (!active || !savedPage) return;

        const parsedPage = Number(savedPage);

        if (Number.isInteger(parsedPage) && parsedPage >= 1) {
          setPage(parsedPage);
        }
      })
      .catch((err) => {
        console.error('Could not restore reading progress:', err);
      })
      .finally(() => {
        if (active) setProgressLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  // Save progress after restoration and PDF loading.
  useEffect(() => {
    if (!progressLoaded || !totalPages) return;

    const validPage = Math.min(Math.max(page, 1), totalPages);

    AsyncStorage.setItem(STORAGE_KEY, String(validPage)).catch((err) => {
      console.error('Could not save reading progress:', err);
    });
  }, [page, totalPages, progressLoaded]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>PDF Reader</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!PdfViewer && !error ? (
        <ActivityIndicator size="large" />
      ) : null}

      {PdfViewer && !error ? (
        <>
          <View style={styles.toolbar}>
            <Pressable
              disabled={page <= 1}
              onPress={() => setPage((current) => current - 1)}
              style={[styles.button, page <= 1 && styles.disabledButton]}
            >
              <Text>Previous</Text>
            </Pressable>

            <Text>
              Page {page} of {totalPages || '...'}
            </Text>

            <Pressable
              disabled={!totalPages || page >= totalPages}
              onPress={() => setPage((current) => current + 1)}
              style={[
                styles.button,
                (!totalPages || page >= totalPages) && styles.disabledButton,
              ]}
            >
              <Text>Next</Text>
            </Pressable>
          </View>

          <PdfViewer.Document
            file={PDF_URL}
            loading={<ActivityIndicator size="large" />}
            onLoadSuccess={({ numPages }) => {
              setTotalPages(numPages);
              setPage((current) => Math.min(current, numPages));
            }}
            onLoadError={(err) => setError(err.message)}
          >
            <PdfViewer.Page pageNumber={page} width={650} />
          </PdfViewer.Document>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F7F8FC',
    flexGrow: 1,
  },
  heading: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 20,
  },
  button: {
    padding: 12,
    backgroundColor: '#DCE5FF',
    borderRadius: 8,
  },
  disabledButton: {
    opacity: 0.45,
  },
  error: {
    color: 'red',
    marginVertical: 20,
  },
});
