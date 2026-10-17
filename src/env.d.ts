interface ImportMetaEnv {
  /** Where the price service lives; empty means the app's own origin. */
  readonly VITE_FUNANCIAL_API_URL?: string;
  /** Sent to the price service as `X-Funancial-Token`; without it the app does not ask for prices. */
  readonly VITE_FUNANCIAL_API_TOKEN?: string;
  /** `1` only in the release script's web build. Without it the app never checks for an update. */
  readonly VITE_RELEASE?: string;
  /** Where a release build looks for `latest.json`; empty means the live download page. */
  readonly VITE_UPDATE_URL?: string;
}
