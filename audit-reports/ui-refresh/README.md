# Nutri Heaven UI refresh

Implemented 26 November 2026. This report covers the existing React/Vite application; it does not constitute a live payment or deployment certification.

## Initial audit

The application already had reusable admin primitives and working commerce flows. The main problems were competing CSS refinement blocks, hardcoded page palettes, small supporting text, serif typography on operational screens, bright lime navigation selection, inconsistent control shapes, decorative effects, and exposed API infrastructure in the shell. A late button rule could override semantic variants. Admin form labels were not consistently associated with their inputs. Mobile navigation lacked focus containment, and the modal focus loop included its backdrop. Storefront overlays lacked consistent keyboard dismissal and focus return.

## Design system

`frontend/src/theme.css` owns brand, neutral and semantic colors, font families, a 4px spacing scale, radii, elevation, control height and transition timing. Existing brand variables remain as aliases. Forest green, the logo, warm storefront surfaces, and editorial display typography are preserved.

`frontend/src/admin/admin.css` consumes those foundations through existing module aliases. The duplicated shared-polish block was replaced, rather than adding another competing block. Operational headings use the existing Manrope face; table text is 14px and shared supporting text is at least 12px. Neutral surfaces, 6/8px radii, restrained borders, tabular numbers, quieter tabs/status badges and clear button variants form a consistent console language.

`frontend/src/storefront-theme.css` adapts the foundations for commercial screens. It standardizes product purchasing controls, account and checkout inputs, cart quantities, overlays, policy text and footer treatment. It removes several ornamental gradients/circles, hover lifting and heavy shadows. Text overlays on photography remain where needed for readability.

Responsive rules retain the application's existing 960px navigation, 760px storefront and 640px compact-console breakpoints. No dependency was added. Admin JavaScript is loaded separately from the storefront: the former approximately 587kB combined entry now becomes an approximately 354kB entry plus a 236kB admin chunk, before gzip. The production build no longer emits the 500kB chunk warning.

## Shared components

| Component | Change |
| --- | --- |
| AdminLayout | Persistent expanded/icon-only preference; responsive drawer; Escape dismissal, focus containment/return, inert background; skip link; useful footer |
| Sidebar | Consistent SVG stroke icons, restrained selected state, labelled collapsed links with native tooltips, independently scrolling navigation and reachable account actions |
| Topbar | Legible breadcrumbs; responsive, labelled navigation trigger with expanded/control attributes; removed API-host chip |
| PageHeader / Card / StatCard | Shared typography, spacing, white surfaces, restrained borders and clear action hierarchy through their existing class contracts |
| FormField | Stable IDs, associated labels, hint/error descriptions and invalid state for direct native controls; existing values, handlers and validation preserved |
| DataTable | Keyboard-focusable scrolling region, explicit alignment, tabular numbers and keyboard activation for clickable rows |
| Modal / ConfirmProvider | Linked title/description, proper focus loop excluding backdrop, inert application background, nested scroll locking and focus restoration |
| Feedback / Pagination / StatusPill / ToastProvider | Common sizing, semantic palette, readable text and consistent surfaces through shared styles |
| Icon | Dependency-free, uniform SVG navigation icon system |
| useDialog | Shared storefront overlay focus loop, Escape handling, scroll lock and return focus |
| CartDrawer / ProductModal | Accessible dialog semantics and shared overlay behavior |
| Products | Clear archive confirmation, cancellation without a mutation, busy feedback and success/error notification |

## Page and module coverage

The shared shell and primitives propagate to Dashboard; Products and product create/edit; Categories; Inventory; Orders and order details; Customers; Shipping; Sales & engagement; Reviews; Offers; Coupons; Banners; FAQs; Social links; Users; Store content; Audit trail; login; and system/error screens.

Customer coverage includes the homepage, catalogue/category navigation, product detail/quick view, cart, checkout, pending checkout/recovery, order confirmation, account/authentication/order history, gallery and policy pages. Existing tables, filters, search, exports, forms and workflow controls remain available. Catalogue/dashboard/offer descriptions were also made more useful to store operators.

## Validation

- Frontend production build: passed, with no large-chunk warning after the bundle split.
- Backend TypeScript build: passed.
- Frontend unit/SEO suite: **39 tests passed**.
- Backend suite: **20 suites / 203 tests passed**.
- Existing browser suites: order workflow, order amount adjustment, order pagination, engagement reporting/export, customer payment, customer tracking, checkout recovery, pending checkout and admin installation passed at their configured desktop/tablet/mobile sizes.
- The pending-checkout test now expects the shopping bag's correct `dialog` role instead of `complementary`; workflow assertions remain intact.
- `frontend/test/design-system.browser.cjs` audits 32 route cases (including not-found fallbacks) at 1440, 768, 390 and 320px and records render errors and horizontal overflow. It also exercises sidebar collapse, mobile Escape dismissal, modal keyboard wrapping/focus return, cart and product quick-view dismissal. The interaction scope additionally checks archive cancellation/confirmation, header contrast and login field labels.
- Final presentation audit: **128/128 route/viewport checks passed**, with no page errors or horizontal page overflow. Focused interaction checks passed at all four widths; all 28 before/after screenshot links resolve.
- `git diff --check`: passed.

The presentation suite uses isolated API fixtures and never changes live records. During its development, incomplete review/order fixtures caused errors; those fixtures were corrected to match existing contracts. They were not treated as application defects. No business API, schema, payment calculation, inventory algorithm, authentication or authorization rule was changed.

## Screenshots and reproducibility

The `before/` captures were generated against a separate temporary checkout of the original Git HEAD, using the same catalogue fixtures as `after/`. Screenshots cover desktop and mobile home, shop, account sign-in, console dashboard, products, login and engagement. `after/results.json` records the full route/viewport audit; scoped runs have separate result files.

| Screen | Desktop before | Desktop after | Mobile before | Mobile after |
| --- | --- | --- | --- | --- |
| Products | [Before](before/_admin_products-1440.png) | [After](after/_admin_products-1440.png) | [Before](before/_admin_products-390.png) | [After](after/_admin_products-390.png) |
| Dashboard | [Before](before/_admin-1440.png) | [After](after/_admin-1440.png) | [Before](before/_admin-390.png) | [After](after/_admin-390.png) |
| Shop | [Before](before/_shop-1440.png) | [After](after/_shop-1440.png) | [Before](before/_shop-390.png) | [After](after/_shop-390.png) |
| Account | [Before](before/_account-1440.png) | [After](after/_account-1440.png) | [Before](before/_account-390.png) | [After](after/_account-390.png) |
| Admin login | [Before](before/_admin_login-1440.png) | [After](after/_admin_login-1440.png) | [Before](before/_admin_login-390.png) | [After](after/_admin_login-390.png) |
| Engagement | [Before](before/_admin_insights-1440.png) | [After](after/_admin_insights-1440.png) | [Before](before/_admin_insights-390.png) | [After](after/_admin_insights-390.png) |
| Home | [Before](before/_-1440.png) | [After](after/_-1440.png) | [Before](before/_-390.png) | [After](after/_-390.png) |

Run Vite on 5173, then run `node frontend/test/design-system.browser.cjs`. Set `PLAYWRIGHT_MODULE` to an existing Playwright installation when it is not on Node's module path. `AUDIT_SCOPE=interactions` runs the focused interaction audit; `AUDIT_SCOPE=screenshots` refreshes screenshot evidence. `AUDIT_SCOPE=routes` runs rendering/overflow checks without screenshots; `AUDIT_WIDTHS=1440` can limit a batch to a single viewport. The test does not add Playwright to production dependencies.

## Limits and follow-up

No production deployment or live gateway/courier transaction was performed. Passing fixture-based browser tests does not certify all real-world data combinations, screen readers or WCAG 2.2 AA conformance. Manual assistive-technology testing remains appropriate. This repository does not configure separate frontend lint/typecheck scripts; Vite compilation and the existing test suites were run instead.

Older storefront composition rules still exist in the legacy stylesheet. The shared theme now owns the foundations, but a later cleanup can migrate the remaining editorial/gallery-specific rules without combining that work with commerce logic changes. Complex FormField groups containing several inputs still need individual labels at the call site; the wrapper associates its direct native control. External fonts retain the existing system-font fallbacks and hosting behavior.
