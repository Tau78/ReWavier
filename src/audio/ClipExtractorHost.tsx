import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { ensureLibraryDirectory, libraryDirectory } from '../files/libraryPaths';
import {
  registerClipExtractor,
  type ClipJob,
  type ExtractedClip,
} from './clipBridge';

const EXTRACTOR_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><style>html,body{margin:0;background:transparent}</style></head>
<body>
<script>
function encodeWav(channelData, sampleRate) {
  var numChannels = channelData.length;
  var numFrames = channelData[0].length;
  var blockAlign = numChannels * 2;
  var dataSize = numFrames * blockAlign;
  var buffer = new ArrayBuffer(44 + dataSize);
  var view = new DataView(buffer);
  function str(offset, text) {
    for (var i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  }
  str(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, dataSize, true);
  var offset = 44;
  for (var i = 0; i < numFrames; i++) {
    for (var c = 0; c < numChannels; c++) {
      var sample = channelData[c][i];
      if (sample > 1) sample = 1;
      if (sample < -1) sample = -1;
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return buffer;
}
function arrayBufferToBase64(buffer) {
  var bytes = new Uint8Array(buffer);
  var binary = '';
  var chunk = 0x8000;
  for (var i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
function postChunks(id, wavBase64, meta) {
  var size = 240000;
  var total = Math.max(1, Math.ceil(wavBase64.length / size));
  window.ReactNativeWebView.postMessage(JSON.stringify({
    id: id,
    ok: true,
    part: 'meta',
    total: total,
    durationMs: meta.durationMs,
    sampleRate: meta.sampleRate,
    channels: meta.channels
  }));
  for (var i = 0; i < total; i++) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      id: id,
      ok: true,
      part: 'chunk',
      index: i,
      data: wavBase64.slice(i * size, (i + 1) * size)
    }));
  }
}
window.__extractClip = function (job) {
  fetch('./' + job.fileName)
    .catch(function () { return fetch(job.fileName); })
    .catch(function () { return fetch(job.uri); })
    .then(function (res) { return res.arrayBuffer(); })
    .then(function (ab) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var ctx = new Ctx();
      return ctx.decodeAudioData(ab.slice(0)).then(function (buf) {
        var startSec = Math.max(0, (job.startMs || 0) / 1000);
        var durSec = Math.max(0, (job.durationMs || 0) / 1000);
        var startFrame = Math.max(0, Math.floor(startSec * buf.sampleRate));
        var endFrame = Math.min(buf.length, Math.ceil((startSec + durSec) * buf.sampleRate));
        if (endFrame <= startFrame) {
          throw new Error('empty clip');
        }
        var nCh = Math.max(1, Math.min(2, buf.numberOfChannels));
        var channels = [];
        for (var c = 0; c < nCh; c++) {
          channels.push(buf.getChannelData(c).subarray(startFrame, endFrame));
        }
        var wav = encodeWav(channels, buf.sampleRate);
        postChunks(job.id, arrayBufferToBase64(wav), {
          durationMs: Math.round(((endFrame - startFrame) / buf.sampleRate) * 1000),
          sampleRate: buf.sampleRate,
          channels: nCh
        });
        ctx.close();
      });
    })
    .catch(function (err) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        id: job.id,
        ok: false,
        error: String(err && err.message ? err.message : err)
      }));
    });
};
</script>
</body>
</html>`;

type Waiter = {
  job: ClipJob;
  resolve: (value: ExtractedClip) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  chunks: string[];
  total: number;
  meta: Omit<ExtractedClip, 'wavBase64'> | null;
};

export function ClipExtractorHost() {
  const webViewRef = useRef<WebView>(null);
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const readyRef = useRef(false);
  const currentRef = useRef<Waiter | null>(null);
  const queueRef = useRef<Waiter[]>([]);

  const kick = () => {
    if (currentRef.current || !readyRef.current || !webViewRef.current) {
      return;
    }
    const next = queueRef.current.shift();
    if (!next) {
      return;
    }
    currentRef.current = next;
    const payload = JSON.stringify({
      id: next.job.id,
      fileName: next.job.fileName,
      uri: next.job.uri,
      startMs: next.job.startMs,
      durationMs: next.job.durationMs,
    });
    webViewRef.current.injectJavaScript(`window.__extractClip(${payload}); true;`);
  };

  useEffect(() => {
    let cancelled = false;
    void ensureLibraryDirectory().then((dir) => {
      if (cancelled) {
        return;
      }
      const file = new File(dir, 'clip-extractor.html');
      file.write(EXTRACTOR_HTML);
      setSourceUri(file.uri);
    });

    registerClipExtractor((job) => {
      return new Promise<ExtractedClip>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (currentRef.current?.job.id === job.id) {
            currentRef.current = null;
            kick();
          }
          reject(new Error('Timeout preparazione clip'));
        }, 60_000);
        queueRef.current.push({
          job,
          resolve,
          reject,
          timer,
          chunks: [],
          total: 0,
          meta: null,
        });
        kick();
      });
    });

    return () => {
      cancelled = true;
      registerClipExtractor(null);
      readyRef.current = false;
    };
  }, []);

  const finishOk = (current: Waiter) => {
    if (!current.meta || current.chunks.length === 0) {
      current.reject(new Error('Clip vuota'));
      return;
    }
    current.resolve({
      ...current.meta,
      wavBase64: current.chunks.join(''),
    });
  };

  const onMessage = (event: WebViewMessageEvent) => {
    let payload: {
      id?: string;
      ok?: boolean;
      part?: string;
      total?: number;
      index?: number;
      data?: string;
      durationMs?: number;
      sampleRate?: number;
      channels?: number;
      error?: string;
    };
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    const current = currentRef.current;
    if (!current || current.job.id !== payload.id) {
      return;
    }
    if (!payload.ok) {
      clearTimeout(current.timer);
      currentRef.current = null;
      current.reject(new Error(payload.error || 'Clip non riuscita'));
      kick();
      return;
    }
    if (payload.part === 'meta') {
      current.total = typeof payload.total === 'number' ? payload.total : 1;
      current.chunks = new Array(current.total).fill('');
      current.meta = {
        durationMs: payload.durationMs ?? current.job.durationMs,
        sampleRate: payload.sampleRate ?? 44100,
        channels: payload.channels ?? 1,
      };
      return;
    }
    if (payload.part === 'chunk' && typeof payload.data === 'string') {
      const index = typeof payload.index === 'number' ? payload.index : 0;
      current.chunks[index] = payload.data;
      const received = current.chunks.filter((chunk) => chunk.length > 0).length;
      if (current.total > 0 && received >= current.total) {
        clearTimeout(current.timer);
        currentRef.current = null;
        finishOk(current);
        kick();
      }
    }
  };

  if (!sourceUri) {
    return null;
  }

  return (
    <View style={styles.host} pointerEvents="none" collapsable={false}>
      <WebView
        ref={webViewRef}
        source={{ uri: sourceUri }}
        style={styles.hidden}
        containerStyle={styles.hidden}
        pointerEvents="none"
        originWhitelist={['*']}
        allowingReadAccessToURL={Paths.document.uri}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        javaScriptEnabled
        onLoadEnd={() => {
          readyRef.current = true;
          kick();
        }}
        onMessage={onMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    width: 0,
    height: 0,
    overflow: 'hidden',
    opacity: 0,
    left: 0,
    top: 0,
    zIndex: -1,
  },
  hidden: {
    width: 1,
    height: 1,
    opacity: 0,
    backgroundColor: 'transparent',
  },
});
