import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';

import { hideNativeSplash } from './src/app/hideSplash';
import App from './App';

// Chiudi lo splash nativo appena il bundle JS parte — prima ancora del primo render React.
hideNativeSplash();

registerRootComponent(App);
