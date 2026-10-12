
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Pdf from 'react-native-pdf';

const PDF_URL =
  'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';

const BOOK_ID = 'demo-pdf-1';
const STORAGE_KEY = `reading-progress-${BOOK_ID}`;

export default function ReaderScreen() {
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [error, setError] = useState('');

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
        console.error('Could not restore progress:', err);
      })
      .finally(() => {
        if (active) setProgressLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!progressLoaded || !pdfLoaded || !totalPages) return;

    const validPage = Math.min(Math.max(page, 1), totalPages);

    AsyncStorage.setItem(STORAGE_KEY, String(validPage)).catch((err) => {
      console.error('Could not save progress:', err);
    });
  }, [page, totalPages, progressLoaded, pdfLoaded]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PDF Reader</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!progressLoaded || !pdfLoaded ? (
        <ActivityIndicator size="large" style={styles.loader} />
      ) : null}

      <View style={styles.toolbar}>
        <Pressable
          disabled={page <= 1}
          style={[styles.button, page <= 1 && styles.disabled]}
          onPress={() => setPage((current) => Math.max(1, current - 1))}
        >
          <Text>Previous</Text>
        </Pressable>

        <Text>
          Page {page} of {totalPages || '...'}
        </Text>

        <Pressable
          disabled={!totalPages || page >= totalPages}
          style={[
            styles.button,
            (!totalPages || page >= totalPages) && styles.disabled,
          ]}
          onPress={() =>
            setPage((current) => Math.min(totalPages, current + 1))
          }
        >
          <Text>Next</Text>
        </Pressable>
      </View>

      {progressLoaded ? (
        <Pdf
          source={{ uri: PDF_URL, cache: true }}
          page={page}
          horizontal={false}
          enablePaging={false}
          onLoadComplete={(numberOfPages) => {
            setTotalPages(numberOfPages);
            setPage((current) => Math.min(current, numberOfPages));
            setPdfLoaded(true);
          }}
          onPageChanged={(currentPage, numberOfPages) => {
            setPage(currentPage);
            setTotalPages(numberOfPages);
          }}
          onError={(err) => {
            setError(String(err));
            setPdfLoaded(false);
          }}
          style={styles.pdf}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 12,
    backgroundColor: '#F7F8FC',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 12,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  button: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#DCE5FF',
  },
  disabled: {
    opacity: 0.45,
  },
  pdf: {
    flex: 1,
    width: '100%',
  },
  loader: {
    marginVertical: 10,
  },
  error: {
    color: 'red',
    textAlign: 'center',
    margin: 10,
  },
});
