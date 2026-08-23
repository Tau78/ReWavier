import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isGoogleConfigured, useGoogleSignIn } from '../../auth/useGoogleSignIn';
import { useSessionStore } from '../../store/sessionStore';
import { colors, layout } from '../../theme/colors';
import { BrandMark, ScreenAura } from '../../theme/graphics';

function GoogleContinueButton({
  busy,
  run,
}: {
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
}) {
  if (!isGoogleConfigured()) {
    return null;
  }
  return <GoogleContinueButtonConfigured busy={busy} run={run} />;
}

function GoogleContinueButtonConfigured({
  busy,
  run,
}: {
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
}) {
  const google = useGoogleSignIn();
  return (
    <Pressable
      onPress={() => {
        void run(async () => {
          const result = await google.prompt();
          if (result.type === 'dismiss' || result.type === 'cancel') {
            return;
          }
          await google.completeGoogleSignIn(result);
        });
      }}
      disabled={busy}
      style={({ pressed }) => [styles.google, pressed && styles.pressed]}
    >
      <Text style={styles.googleLabel}>Continua con Google</Text>
      <Text style={styles.googleHint}>Il tuo account · Drive già collegato</Text>
    </Pressable>
  );
}

export function LoginScreen() {
  const signInEmail = useSessionStore((s) => s.signInEmail);
  const registerEmail = useSessionStore((s) => s.registerEmail);
  const signInSocial = useSessionStore((s) => s.signInSocial);

  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await work();
    } catch (error) {
      Alert.alert('Accesso', error instanceof Error ? error.message : 'Riprova');
    } finally {
      setBusy(false);
    }
  };

  const onApple = () => {
    void run(async () => {
      const result = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const name = [result.fullName?.givenName, result.fullName?.familyName]
        .filter(Boolean)
        .join(' ');
      await signInSocial({
        provider: 'apple',
        id: `apple:${result.user}`,
        email: result.email ?? '',
        displayName: name || 'Apple',
      });
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenAura />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <BrandMark size="md" />
            <Text style={styles.kicker}>ReWavier</Text>
          </View>
          <Text style={styles.title}>Accedi</Text>
          <Text style={styles.sub}>
            Entra col tuo Google: l’account è tuo e Drive è già collegato. Oppure Apple o email,
            su questo telefono.
          </Text>

          <GoogleContinueButton busy={busy} run={run} />

          {Platform.OS === 'ios' ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={14}
              style={styles.apple}
              onPress={onApple}
            />
          ) : null}

          <Text style={styles.or}>oppure email e password</Text>

          {mode === 'register' ? (
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Nome"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
            />
          ) : null}
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
          />

          <Pressable
            onPress={() =>
              void run(() =>
                mode === 'register'
                  ? registerEmail(email, password, displayName)
                  : signInEmail(email, password),
              )
            }
            disabled={busy}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryLabel}>
              {mode === 'register' ? 'Crea account' : 'Accedi'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setMode(mode === 'register' ? 'signin' : 'register')}
            hitSlop={layout.hitSlop}
          >
            <Text style={styles.switch}>
              {mode === 'register' ? 'Ho già un account' : 'Crea un account email'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 40,
    backgroundColor: colors.background,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  kicker: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 10,
    color: colors.text,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  sub: {
    marginTop: 8,
    marginBottom: 28,
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  google: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  googleLabel: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  googleHint: {
    marginTop: 2,
    color: colors.text,
    opacity: 0.8,
    fontSize: 12,
    fontWeight: '600',
  },
  apple: {
    height: 48,
    marginTop: 12,
  },
  or: {
    marginTop: 28,
    marginBottom: 12,
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  input: {
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  primary: {
    marginTop: 8,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  primaryLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  switch: {
    marginTop: 18,
    textAlign: 'center',
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
});
