const appJson = require('./app.json');

function reversedGoogleScheme(clientId) {
  if (!clientId || !clientId.endsWith('.apps.googleusercontent.com')) {
    return null;
  }
  return `com.googleusercontent.apps.${clientId.replace('.apps.googleusercontent.com', '')}`;
}

const iosClientId =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
  appJson.expo.extra?.googleIosClientId ||
  '';
const expoIosClientId =
  process.env.EXPO_PUBLIC_GOOGLE_EXPO_IOS_CLIENT_ID ||
  appJson.expo.extra?.googleExpoIosClientId ||
  '';
const webClientId =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  appJson.expo.extra?.googleWebClientId ||
  '';
const googleScheme = reversedGoogleScheme(iosClientId || expoIosClientId);

const urlSchemes = ['rewavier'];
if (googleScheme) {
  urlSchemes.push(googleScheme);
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
