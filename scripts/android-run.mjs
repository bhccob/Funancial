// Installs the debug build on the USB-connected phone and starts it: the last step of
// `npm run android:run`, after `npm run android:sync`. With more than one device connected, set
// ANDROID_SERIAL to the one to use. See docs/android.md.
import { installAndLaunch, requireAdb, requireDevice, requireJava } from './android.mjs';

requireJava();
const adb = requireAdb();
installAndLaunch(adb, requireDevice(adb));
