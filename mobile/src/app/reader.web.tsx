
import { useLocalSearchParams } from 'expo-router';
import PdfReader from '../components/PdfReader';

export default function ReaderWebRoute() {
  const params = useLocalSearchParams<{
    id?: string;
    path?: string;
    title?: string;
  }>();

  const bookId = typeof params.id === 'string' ? params.id : '';
  const pdfPath = typeof params.path === 'string' ? params.path : '';
  const bookTitle =
    typeof params.title === 'string' ? params.title : 'PDF Reader';

  return (
    <PdfReader
      id={bookId}
      path={pdfPath}
      title={bookTitle}
    />
  );
}
