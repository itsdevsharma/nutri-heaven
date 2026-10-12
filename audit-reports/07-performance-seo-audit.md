# Performance and SEO audit

Updated 2026-10-12 after implementation and reproducible local verification. The earlier baseline is preserved in `baseline-2026-10-12/`; it contains superseded findings.

Shop browsing now fetches bounded 24-item pages with debounced search and server-side sorting/filtering. The homepage still uses its bounded featured catalogue request. Product browsing no longer truncates the accessible catalogue at 50 items.

Existing SEO functions embed generated HTML with hashed asset URLs, metadata, canonical URLs and structured data. Seven local SEO tests pass, including rendering without a runtime dist directory and sitemap pagination. Actual indexing/Search Console status is unverified.

Chromium account flow passed at 390×844 without horizontal overflow. The current catalogue passed overflow, search, category and menu checks at 320, 375, 390, 450, 760, 768, 1024 and 1440px. The integrated browser flow also verifies phone account and catalogue behavior. No Lighthouse/Core Web Vitals score or physical iOS/Android testing is claimed.

Run the read-only deployment smoke script after publishing. Static assets, SEO functions and API must come from the same intended deployment configuration.
