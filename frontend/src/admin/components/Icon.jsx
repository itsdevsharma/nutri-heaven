/** A single 20px stroke icon system; route IDs remain the navigation source. */
const paths = {
  dashboard: 'M3 3h6v7H3z M13 3h6v4h-6z M13 11h6v8h-6z M3 14h6v5H3z',
  engagement: 'M3 19h17 M6 15V9 M11 15V4 M16 15v-5',
  products: 'm3 6 8-4 8 4v12l-8 4-8-4z M3 6l8 4 8-4 M11 10v12',
  categories: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  inventory: 'M3 5h18v15H3z M2 2h20v3H2z M9 10h6',
  orders: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',
  customers: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M17 4a4 4 0 0 1 0 7 M22 21v-2a4 4 0 0 0-3-4',
  shipping: 'M1 4h13v13H1z M14 9h4l4 4v4h-8 M5 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M18 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
  reviews: 'm12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
  offers: 'M3 3h8l10 10-8 8L3 11z M7 7h.01',
  coupons: 'M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4z M14 5v3 M14 11v2 M14 16v3',
  'cms-banners': 'M3 3h18v18H3z m0 13 5-5 5 5 3-3 5 5 M16 7h.01',
  'cms-faqs': 'M4 3h16v14H9l-5 4z M10 7a2 2 0 1 1 3 2v2 M12 14h.01',
  'cms-socials': 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  users: 'M5 21v-2a7 7 0 0 1 14 0v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  'store-content': 'M4 3h16v18H4z M8 7h8 M8 11h8 M8 15h5',
  audit: 'M9 3h6v4H9z M9 5H5v16h14V5h-4 M8 12h8 M8 16h8',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  collapse: 'M3 3h18v18H3z M8 3v18 m8-13-4 4 4 4',
  expand: 'M3 3h18v18H3z M8 3v18 m5-13 4 4-4 4',
  close: 'm6 6 12 12 M6 18 18 6',
};
export function Icon({ name, ...props }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] || paths['store-content']} /></svg>;
}
