import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { foldersFromPickerResult, sharedDrivePickerUrl, type SharedDrivePickResult } from '../../cloud/drivePicker';

type Props = {
  accessToken: string;
  onPicked: (result: SharedDrivePickResult) => void;
  onCancel: () => void;
  onFailed: () => void;
};

function isAppReturn(url: string): boolean {
  return /^rewavier:\/\//i.test(url) || /^com\.googleusercontent\.apps\./i.test(url);
}

export function SharedDrivePickerWebView({ accessToken, onPicked, onCancel, onFailed }: Props) {
  const uri = useMemo(() => sharedDrivePickerUrl(accessToken, { embedded: true }), [accessToken]);

  const handleRaw = (raw: string) => {
    void foldersFromPickerResult(raw)
      .then((result) => {
        if (!result) {
          onCancel();
          return;
        }
        onPicked(result);
      })
      .catch(() => {
        onFailed();
      });
  };

  const onNav = (nav: WebViewNavigation) => {
    if (!isAppReturn(nav.url)) {
      return true;
    }
    handleRaw(nav.url);
    return false;
  };

  return (
    <WebView
      source={{ uri }}
      style={styles.web}
      javaScriptEnabled
      domStorageEnabled
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      originWhitelist={['*']}
      setSupportMultipleWindows={false}
      onMessage={(event) => handleRaw(event.nativeEvent.data)}
      onShouldStartLoadWithRequest={onNav}
      onHttpError={() => onFailed()}
      onError={() => onFailed()}
    />
  );
}

const styles = StyleSheet.create({
  web: {
    flex: 1,
    minHeight: 360,
    backgroundColor: '#0D0D0F',
  },
});
