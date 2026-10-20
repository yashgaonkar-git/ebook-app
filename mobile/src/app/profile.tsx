import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

const COLORS = {
  background: '#F6F7FB',
  surface: '#FFFFFF',
  text: '#192238',
  muted: '#727B90',
  primary: '#4F46E5',
  border: '#E6E9F2',
  success: '#047857',
  danger: '#B91C1C',
};

export default function ProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setMessage('');
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      setMessage('Your session could not be loaded. Please sign in again.');
      setMessageType('error');
      setLoading(false);
      router.replace('/login');
      return;
    }

    const user = data.user;
    const currentName =
      (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name) ||
      (typeof user.user_metadata?.name === 'string' && user.user_metadata.name) ||
      '';
    setEmail(user.email ?? '');
    setName(currentName);
    setOriginalName(currentName);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const saveProfile = async () => {
    const cleanedName = name.trim();
    if (!cleanedName) {
      setMessage('Please enter your name.');
      setMessageType('error');
      return;
    }
    if (cleanedName.length > 80) {
      setMessage('Your name must be 80 characters or fewer.');
      setMessageType('error');
      return;
    }

    setSaving(true);
    setMessage('');
    const { data, error } = await supabase.auth.updateUser({
      data: { full_name: cleanedName },
    });
    setSaving(false);

    if (error) {
      setMessage(error.message);
      setMessageType('error');
      return;
    }

    const savedName =
      typeof data.user?.user_metadata?.full_name === 'string'
        ? data.user.user_metadata.full_name
        : cleanedName;
    setName(savedName);
    setOriginalName(savedName);
    setMessage('Your profile has been updated.');
    setMessageType('success');
  };

  const sendPasswordReset = async () => {
    if (!email) {
      setMessage('No email address is associated with this account.');
      setMessageType('error');
      return;
    }
    setSendingReset(true);
    setMessage('');
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setSendingReset(false);

    if (error) {
      setMessage(error.message);
      setMessageType('error');
      return;
    }

    setMessage('Password reset instructions have been sent to your email, if the address is eligible.');
    setMessageType('success');
  };

  const signOut = async () => {
    setSaving(true);
    const { error } = await supabase.auth.signOut();
    setSaving(false);
    if (error) {
      setMessage(error.message);
      setMessageType('error');
      return;
    }
    router.replace('/login');
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading your account…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.page}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.replace('/explore')}
          accessibilityRole="button"
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>‹  My Library</Text>
        </Pressable>
        <Text style={styles.brand}>BookSpace</Text>
      </View>

      <View style={styles.heading}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(name.trim() || email || 'R').charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.title}>Profile & account</Text>
        <Text style={styles.subtitle}>Manage your BookSpace account details.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Personal information</Text>
        <Text style={styles.fieldLabel}>Full name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Enter your full name"
          placeholderTextColor="#9299AA"
          autoCapitalize="words"
          maxLength={80}
          style={styles.input}
          accessibilityLabel="Full name"
        />

        <Text style={[styles.fieldLabel, styles.emailLabel]}>Email address</Text>
        <View style={styles.readOnlyField}>
          <Text style={styles.emailText}>{email || 'No email available'}</Text>
          <Text style={styles.verifiedLabel}>LOGIN EMAIL</Text>
        </View>
        <Text style={styles.helperText}>
          Your email is used to sign in. To change it, use Supabase's email-change confirmation flow.
        </Text>

        {message ? (
          <View style={[styles.messageBox, messageType === 'error' ? styles.errorBox : styles.successBox]}>
            <Text style={[styles.messageText, messageType === 'error' ? styles.errorText : styles.successText]}>
              {message}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => void saveProfile()}
          disabled={saving || name.trim() === originalName.trim()}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.primaryButton,
            (saving || name.trim() === originalName.trim()) && styles.disabledButton,
            pressed && !saving && styles.pressedButton,
          ]}
        >
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Save changes</Text>}
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Security</Text>
        <Text style={styles.securityDescription}>
          Request a password reset link by email. Open the email to complete the reset process.
        </Text>
        <Pressable
          onPress={() => void sendPasswordReset()}
          disabled={sendingReset || !email}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.secondaryButton,
            sendingReset && styles.disabledSecondaryButton,
            pressed && !sendingReset && styles.pressedButton,
          ]}
        >
          {sendingReset ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : (
            <Text style={styles.secondaryButtonText}>Send password reset email</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Session</Text>
        <Text style={styles.securityDescription}>
          Sign out of BookSpace on this device. You can sign in again at any time.
        </Text>
        <Pressable
          onPress={() => void signOut()}
          disabled={saving}
          accessibilityRole="button"
          style={({ pressed }) => [styles.signOutButton, pressed && styles.pressedButton]}
        >
          <Text style={styles.signOutButtonText}>Sign out</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>BOOKSPACE · MADE FOR READERS</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  page: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 42, width: '100%', maxWidth: 860, alignSelf: 'center' },
  loadingScreen: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: COLORS.muted, fontSize: 14 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  backButton: { paddingVertical: 9, paddingHorizontal: 11, borderRadius: 10, backgroundColor: '#ECEEFF' },
  backButtonText: { color: COLORS.primary, fontWeight: '800', fontSize: 13 },
  brand: { color: COLORS.text, fontWeight: '800', fontSize: 17 },
  heading: { alignItems: 'center', marginBottom: 26 },
  avatar: { width: 76, height: 76, borderRadius: 24, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  avatarText: { color: '#FFFFFF', fontSize: 32, fontWeight: '800' },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800', textAlign: 'center', letterSpacing: -0.6 },
  subtitle: { color: COLORS.muted, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 21 },
  card: { backgroundColor: COLORS.surface, borderRadius: 18, padding: 22, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  sectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800', marginBottom: 19 },
  fieldLabel: { color: COLORS.text, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#FFFFFF', borderRadius: 11, minHeight: 48, paddingHorizontal: 13, paddingVertical: 11, color: COLORS.text, fontSize: 14 },
  emailLabel: { marginTop: 18 },
  readOnlyField: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#F8F9FC', borderRadius: 11, minHeight: 48, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  emailText: { color: COLORS.text, fontSize: 14, flexShrink: 1 },
  verifiedLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  helperText: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 9 },
  messageBox: { borderRadius: 10, padding: 12, marginTop: 16 },
  successBox: { backgroundColor: '#D1FAE5' },
  errorBox: { backgroundColor: '#FEE2E2' },
  messageText: { fontSize: 12, lineHeight: 18 },
  successText: { color: COLORS.success },
  errorText: { color: COLORS.danger },
  primaryButton: { minHeight: 48, borderRadius: 11, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 18 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  disabledButton: { opacity: 0.45 },
  pressedButton: { opacity: 0.78 },
  secondaryButton: { minHeight: 48, borderRadius: 11, backgroundColor: '#ECEEFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryButtonText: { color: COLORS.primary, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  disabledSecondaryButton: { opacity: 0.5 },
  securityDescription: { color: COLORS.muted, fontSize: 13, lineHeight: 20, marginBottom: 16 },
  signOutButton: { minHeight: 46, borderRadius: 11, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FFF7F7', alignItems: 'center', justifyContent: 'center' },
  signOutButtonText: { color: COLORS.danger, fontSize: 14, fontWeight: '800' },
  footer: { textAlign: 'center', color: COLORS.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginTop: 20 },
});
