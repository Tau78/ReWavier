import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

type MainModule = { default: React.ComponentType };

class BootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('BootErrorBoundary', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={boot.root}>
          <Text style={boot.title}>ReWavier</Text>
          <Text style={boot.body}>
            Qualcosa non è partito. Chiudi l’app dal multitasking e riaprila.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [Main, setMain] = useState<React.ComponentType | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void import('./src/app/AppMain')
      .then((mod: MainModule) => {
        if (alive) {
          setMain(() => mod.default);
        }
      })
      .catch((err: unknown) => {
        if (alive) {
          setBootError(err instanceof Error ? err.message : 'Caricamento fallito');
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  if (bootError) {
    return (
      <View style={boot.root}>
        <Text style={boot.title}>ReWavier</Text>
        <Text style={boot.body}>{bootError}</Text>
      </View>
    );
  }

  if (!Main) {
    return (
      <View style={boot.root}>
        <Text style={boot.title}>ReWavier</Text>
        <ActivityIndicator color="#FF6B35" style={boot.spinner} />
      </View>
    );
  }

  return (
    <BootErrorBoundary>
      <Main />
    </BootErrorBoundary>
  );
}

const boot = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D0D0F',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#FF6B35',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  body: {
    marginTop: 12,
    color: '#8E8E93',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  spinner: {
    marginTop: 20,
  },
});
