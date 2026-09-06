import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { libraryDirectory } from '../files/libraryFiles';
import { normalizePeaks } from './pcmPeaks';
import {
  MAX_WAVEFORM_DECODE_BYTES,
  MAX_WAVEFORM_DECODE_DURATION_MS,
  registerWaveformDecoder,
  type WaveformJob,
} from './waveformBridge';
import type { DecodedPeaks } from './decodePcmFile';

const DECODER_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><style>html,body{margin:0;background:transparent}</style></head>
<body>
<script>
var MAX_BYTES = ${MAX_WAVEFORM_DECODE_BYTES};
var MAX_DURATION_SEC = ${MAX_WAVEFORM_DECODE_DURATION_MS / 1000};
function mix(channels, i) {
  var sum = 0;
  for (var c = 0; c < channels.length; c++) sum += channels[c][i] || 0;
  return sum / channels.length;
}
window.__decode = function (job) {
  if (job.durationMs && job.durationMs > ${MAX_WAVEFORM_DECODE_DURATION_MS}) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      id: job.id,
      ok: false,
      error: 'File troppo lungo per la waveform'
    }));
    return;
  }
  fetch('./' + job.fileName)
    .catch(function () { return fetch(job.fileName); })
    .catch(function () { return fetch(job.uri); })
    .then(function (res) {
      var len = Number(res.headers.get('content-length') || 0);
      if (len > MAX_BYTES) {
        throw new Error('File troppo grande per la waveform');
      }
      return res.arrayBuffer();
    })
    .then(function (ab) {
      if (ab.byteLength > MAX_BYTES) {
        throw new Error('File troppo grande per la waveform');
      }
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var ctx = new Ctx();
      return ctx.decodeAudioData(ab.slice(0)).then(function (buf) {
        if (buf.duration > MAX_DURATION_SEC) {
          ctx.close();
          throw new Error('File troppo lungo per la waveform');
        }
        var channels = [];
        for (var c = 0; c < buf.numberOfChannels; c++) channels.push(buf.getChannelData(c));
        var n = buf.length;
        var samples = job.samples;
        var peaks = new Array(samples);
        var block = n / samples;
        for (var i = 0; i < samples; i++) {
          var start = Math.floor(i * block);
          var end = Math.min(n, Math.floor((i + 1) * block));
          var peak = 0;
          var sum = 0;
          var len = Math.max(1, end - start);
          for (var j = start; j < end; j++) {
            var v = Math.abs(mix(channels, j));
            if (v > peak) peak = v;
            sum += v * v;
          }
          peaks[i] = 0.65 * Math.sqrt(sum / len) + 0.35 * peak;
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({
          id: job.id,
          ok: true,
          peaks: peaks,
          durationMs: Math.round(buf.duration * 1000)
        }));
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
  job: WaveformJob;
  resolve: (value: DecodedPeaks) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

function fileByteSize(uri: string): number | null {
  try {
    const file = new File(uri);
    if (!file.exists) {
      return null;
    }
    return typeof file.size === 'number' ? file.size : null;
  } catch {
    return null;
  }
}

function refuseOversizedJob(job: WaveformJob): Error | null {
  const durationMs = job.durationMs ?? 0;
  if (durationMs > MAX_WAVEFORM_DECODE_DURATION_MS) {
    return new Error('File troppo lungo per la waveform');
  }
  const size = fileByteSize(job.uri);
  if (size != null && size > MAX_WAVEFORM_DECODE_BYTES) {
    return new Error('File troppo grande per la waveform');
  }
  return null;
}

function rejectWaiters(waiters: Waiter[], message: string): void {
  for (const waiter of waiters) {
    clearTimeout(waiter.timer);
    waiter.reject(new Error(message));
  }
}

export function WaveformDecoderHost() {
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
    const oversized = refuseOversizedJob(next.job);
    if (oversized) {
      clearTimeout(next.timer);
      next.reject(oversized);
      kick();
      return;
    }
    currentRef.current = next;
    const payload = JSON.stringify({
      id: next.job.id,
      fileName: next.job.fileName,
      uri: next.job.uri,
      samples: next.job.samples,
      durationMs: next.job.durationMs ?? 0,
    });
    webViewRef.current.injectJavaScript(`window.__decode(${payload}); true;`);
  };

  useEffect(() => {
    const dir = libraryDirectory();
    const file = new File(dir, 'waveform-decoder.html');
    file.write(DECODER_HTML);
    setSourceUri(file.uri);

    registerWaveformDecoder((job) => {
      return new Promise<DecodedPeaks>((resolve, reject) => {
        const oversized = refuseOversizedJob(job);
        if (oversized) {
          reject(oversized);
          return;
        }
        const timer = setTimeout(() => {
          if (currentRef.current?.job.id === job.id) {
            currentRef.current = null;
            kick();
          } else {
            queueRef.current = queueRef.current.filter((w) => w.job.id !== job.id);
          }
          reject(new Error('Timeout decodifica waveform'));
        }, 45_000);
        queueRef.current.push({ job, resolve, reject, timer });
        kick();
      });
    });

    return () => {
      registerWaveformDecoder(null);
      readyRef.current = false;
      const pending = queueRef.current.splice(0, queueRef.current.length);
      const current = currentRef.current;
      currentRef.current = null;
      if (current) {
        pending.push(current);
      }
      rejectWaiters(pending, 'Decodifica waveform interrotta');
    };
  }, []);

  const onMessage = (event: WebViewMessageEvent) => {
    let payload: {
      id?: string;
      ok?: boolean;
      peaks?: number[];
      durationMs?: number;
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
    clearTimeout(current.timer);
    currentRef.current = null;
    if (
      payload.ok &&
      Array.isArray(payload.peaks) &&
      payload.peaks.length > 0 &&
      payload.peaks.every((value) => typeof value === 'number')
    ) {
      const peaks = payload.peaks;
      const durationMs = payload.durationMs ?? 0;
      // Yield so React can paint / handle taps before normalizePeaks.
      setTimeout(() => {
        current.resolve({
          peaks: normalizePeaks(peaks),
          durationMs,
        });
        kick();
      }, 0);
      return;
    }
    current.reject(new Error(payload.error || 'Decodifica waveform non riuscita'));
    kick();
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
