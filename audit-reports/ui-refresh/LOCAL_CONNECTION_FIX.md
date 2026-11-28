# Local storefront connection — 26 November 2026

The storefront running at http://localhost:5175 showed a service-unavailable message even though GET /health and GET /products returned HTTP 200. The API response omitted Access-Control-Allow-Origin for that origin. Temporary servers from the UI audit had occupied 5173 and 5174, causing Vite to choose 5175.

Planned configuration correction: stop the audit-owned servers and add the explicit localhost/127.0.0.1 port 5175 origins to the development fallback list and environment example. Production still requires its explicit CORS_ORIGINS setting. No wildcard origins, API contracts, authentication, payment, inventory, or database changes are involved.

Verification: the live API now returns Access-Control-Allow-Origin for http://localhost:5175, including its OPTIONS preflight. An untrusted origin still receives no allow-origin header. A real-browser check of the homepage found no service-unavailable message or JavaScript errors; /shop displayed eight real catalogue products with no JavaScript errors. The four security-configuration tests passed. Screenshots are saved as after/live-home-connection-fixed.png and after/live-shop-connection-fixed.png.
