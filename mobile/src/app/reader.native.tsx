
import { useLocalSearchParams } from 'expo-router';
import PdfReader from '../components/PdfReader';

export default function ReaderNativeRoute() {
  const params = useLocalSearchParams<{
    id?: string;
    path?: string;
    title?: string;
  }>();

  return (
    <PdfReader
      id={typeof params.id === 'string' ? params.id : ''}
      path={typeof params.path === 'string' ? params.path : ''}
      title={typeof params.title === 'string' ? params.title : 'PDF Reader'}
    />
  );
}
