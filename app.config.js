const appJson = require('./app.json');

function isGoogleClientId(value) {
  return typeof value === 'string' && /^\d+-[a-zA-Z0-9]+\.apps\.googleusercontent\.com$/.test(value);
}

function reversedGoogleScheme(clientId) {
  if (!isGoogleClientId(clientId)) {
    return null;
  }
  return `com.googleusercontent.apps.${clientId.replace(/\.apps\.googleusercontent\.com$/i, '')}`;
}

const iosClientId = isGoogleClientId(
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || appJson.expo.extra?.googleIosClientId || '',
)
  ? process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || appJson.expo.extra?.googleIosClientId
  : '';
const expoIosClientId = isGoogleClientId(
  process.env.EXPO_PUBLIC_GOOGLE_EXPO_IOS_CLIENT_ID ||
    appJson.expo.extra?.googleExpoIosClientId ||
    '',
)
  ? process.env.EXPO_PUBLIC_GOOGLE_EXPO_IOS_CLIENT_ID || appJson.expo.extra?.googleExpoIosClientId
  : '';
const webClientId = isGoogleClientId(
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || appJson.expo.extra?.googleWebClientId || '',
)
  ? process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || appJson.expo.extra?.googleWebClientId
  : '';
const storeScheme = reversedGoogleScheme(iosClientId);
const expoScheme = reversedGoogleScheme(expoIosClientId);
const urlSchemes = ['rewavier'];
if (storeScheme) {
  urlSchemes.push(storeScheme);
}
if (expoScheme && expoScheme !== storeScheme) {
  urlSchemes.push(expoScheme);
}

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      googleIosClientId: iosClientId,
      googleExpoIosClientId: expoIosClientId,
      googleWebClientId: webClientId,
    },
    ios: {
      ...appJson.expo.ios,
      infoPlist: {
        ...appJson.expo.ios.infoPlist,
        CFBundleURLTypes: [
          {
            CFBundleURLSchemes: urlSchemes,
          },
        ],
      },
    },
  },
};
