interface ImportMetaEnv {
  /** Where the price service lives; empty means the app's own origin. */
  readonly VITE_FUNANCIAL_API_URL?: string;
  /** Sent to the price service as `X-Funancial-Token`; without it the app does not ask for prices. */
  readonly VITE_FUNANCIAL_API_TOKEN?: string;
}
