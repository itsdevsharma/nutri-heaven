// Production uses Nginx's dedicated API namespace so admin page URLs can never
// be mistaken for API requests. Separate backend hosts can set VITE_API_URL.
export const API_URL = import.meta.env?.VITE_API_URL
  || (import.meta.env?.PROD ? '/api' : 'http://localhost:3000');
