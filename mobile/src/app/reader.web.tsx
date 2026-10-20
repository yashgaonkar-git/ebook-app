
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const BUCKET_NAME = 'books';
const PDF_PATH = 'yash_test.pdf';
const BOOK_ID = 'yash-test-pdf';
const STORAGE_KEY = `reading-progress-${BOOK_ID}`;
const SIGNED_URL_EXPIRY_SECONDS = 3600;

type PdfModule = typeof import('react-pdf');

export default function ReaderScreen() {
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [PdfViewer, setPdfViewer] = useState<PdfModule | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [error, setError] = useState('');
  const [loadingPdf, setLoadingPdf] = useState(true);

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
        if (!active) return;

        setError(
          err instanceof Error
            ? `Failed to load PDF viewer: ${err.message}`
            : 'Failed to load the PDF viewer.'
        );
      });

    return () => {
      active = false;
    };
  }, []);

  // Get a temporary URL for the PDF in private Supabase Storage.
  useEffect(() => {
    let active = true;

    async function loadPdfUrl() {
      setLoadingPdf(true);
      setError('');

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        console.log('Supabase session exists:', !!sessionData.session);
        console.log('Supabase user ID:', sessionData.session?.user.id ?? 'No session');
        const { data, error: storageError } = await supabase.storage
          .from(BUCKET_NAME)
          .createSignedUrl(PDF_PATH, SIGNED_URL_EXPIRY_SECONDS);

        if (storageError) {
          throw storageError;
        }

        if (!data?.signedUrl) {
          throw new Error('Supabase did not return a signed URL.');
        }

        if (active) {
          setPdfUrl(data.signedUrl);
        }
      } catch (err: unknown) {
        console.error('Supabase PDF error:', err);

        if (!active) return;

        setError(
          err instanceof Error
            ? `Could not load PDF: ${err.message}`
            : 'Could not load the PDF from Supabase.'
        );
      } finally {
        if (active) {
          setLoadingPdf(false);
        }
      }
    }

    loadPdfUrl();

    return () => {
      active = false;
    };
  }, []);

  // Restore the last-read page from this device.
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
        if (active) {
          setProgressLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // Save the current page locally.
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
      <Text style={styles.subtitle}>{PDF_PATH}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {(loadingPdf || (!PdfViewer && !error)) && !error ? (
        <ActivityIndicator size="large" />
      ) : null}

      {PdfViewer && pdfUrl && !error && !loadingPdf ? (
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
                (!totalPages || page >= totalPages) &&
                  styles.disabledButton,
              ]}
            >
              <Text>Next</Text>
            </Pressable>
          </View>

          <PdfViewer.Document
            key={pdfUrl}
            file={pdfUrl}
            loading={<ActivityIndicator size="large" />}
            onLoadSuccess={({ numPages }) => {
              setTotalPages(numPages);
              setPage((current) => Math.min(current, numPages));
            }}
            onLoadError={(err) => {
              console.error('PDF rendering error:', err);
              setError(`PDF reader error: ${err.message}`);
            }}
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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
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
    textAlign: 'center',
  },
});
