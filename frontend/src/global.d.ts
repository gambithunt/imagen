// Global runtime types for the frontend
export {};

declare global {
  interface Window {
    /** Optional base URL for backend API (e.g. http://localhost:3000) */
    API_BASE?: string;
  }
}
