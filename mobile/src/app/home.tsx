import { Redirect } from 'expo-router';

export default function HomeFallback() {
  return <Redirect href="/explore" />;
}