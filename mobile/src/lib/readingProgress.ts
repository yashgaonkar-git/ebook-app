
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

async function getCurrentUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

export async function loadReadingProgress(
  bookId: string,
  storageKey: string,
): Promise<number | null> {
  // Keep local progress as a fallback.
  const savedLocal = await AsyncStorage.getItem(storageKey);
  const localPage =
    savedLocal && Number.isInteger(Number(savedLocal)) && Number(savedLocal) >= 1
      ? Number(savedLocal)
      : null;

  if (!bookId) return localPage;

  try {
    const userId = await getCurrentUserId();
    if (!userId) return localPage;

    const { data, error } = await supabase
      .from('reading_progress')
      .select('current_page')
      .eq('user_id', userId)
      .eq('book_id', bookId)
      .maybeSingle();

    if (error) throw error;

    if (data && Number.isInteger(data.current_page) && data.current_page >= 1) {
      await AsyncStorage.setItem(storageKey, String(data.current_page));
      return data.current_page;
    }

    // If cloud progress doesn't exist yet, migrate the local page.
    if (localPage !== null) {
      await saveReadingProgress(bookId, storageKey, localPage);
    }

    return localPage;
  } catch (error) {
    console.warn('Could not load cloud reading progress:', error);
    return localPage;
  }
}

export async function saveReadingProgress(
  bookId: string,
  storageKey: string,
  page: number,
): Promise<void> {
  if (!Number.isInteger(page) || page < 1) return;

  // Save locally first, even if the user is offline.
  await AsyncStorage.setItem(storageKey, String(page));

  if (!bookId) return;

  try {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const { error } = await supabase
      .from('reading_progress')
      .upsert(
        {
          user_id: userId,
          book_id: bookId,
          current_page: page,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,book_id' },
      );

    if (error) throw error;
  } catch (error) {
    console.warn('Could not sync reading progress to Supabase:', error);
  }
}
