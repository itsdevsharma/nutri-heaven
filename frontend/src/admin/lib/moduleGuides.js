const productEditor = {
  description: 'Build a product listing, configure its packs and choose when it goes live.',
  steps: [
    'Enter the title, slug, card description and category. Add a primary image and any gallery images; use alt text to describe them.',
    'Set a selling price above zero and add at least one pack size. Review each pack’s price, stock, SKU and availability.',
    'Fill in product details and SEO fields, then save. New products are created as drafts; use the Status control to publish when ready.',
    'For existing products, use the product actions to manage visibility or archive the listing. Archived products can be recovered as drafts.',
  ],
  tip: 'Save your edits before leaving the screen. Editing actions depend on your assigned role.',
};

export const MODULE_GUIDES = {
  dashboard: {
    description: 'Use the dashboard to spot catalogue and stock work that needs attention.',
    steps: ['Review the product, pack, low-stock and out-of-stock totals.', 'Open a recently updated product or an item under Needs attention to review it.', 'Check Your access to see which actions your admin role allows.'],
    tip: 'Open Sales & engagement for paid revenue and sales reporting.',
  },
  engagement: {
    description: 'Review sales, moderate customer reviews and check newsletter subscriptions.',
    steps: ['Review paid revenue, daily sales for the last 30 days and top-selling products.', 'Use Review product in the catalogue audit to fix flagged listings.', 'Read each customer review, then choose Approve or Reject. Only approved reviews appear publicly.', 'Check subscriber statuses and the transactional email delivery summary.'],
    tip: 'Only confirmed newsletter subscriptions are eligible for marketing email. Revenue and product totals have different discount and shipping rules, shown beside each report.',
  },
  products: {
    description: 'Find, create and maintain the products customers can buy.',
    steps: ['Use the status tabs and search to find a product, then open its editor.', 'Create a new product and complete its details, images and packs before publishing.', 'Select rows to apply the available bulk actions or export selected products.', 'For CSV imports, review the validation preview, resolve invalid rows, then choose Confirm import.'],
    tip: 'Import changes apply only after confirmation. Catalogue editing requires write access.',
  },
  'product-new': productEditor,
  'product-edit': productEditor,
  categories: {
    description: 'Organize the catalogue into categories and subcategories.',
    steps: ['Create a category with a name; enter a slug or leave it blank to generate one.', 'Choose a parent for a subcategory, and add its image, description and SEO details.', 'Set the position or drag categories to reorder them. Lower position numbers appear first.', 'Save the category and use its Active setting to control storefront visibility.'],
    tip: 'A category cannot be its own ancestor. Review product assignments when changing the category structure.',
  },
  inventory: {
    description: 'Monitor stock for each product pack and record physical stock counts.',
    steps: ['Review stock totals and use the stock tabs or search to find a pack.', 'Choose Adjust stock and enter the total counted stock on hand.', 'Set the low-stock alert threshold and enter a reason, such as a weekly count or damaged stock, then save.', 'Open Stock history to review movements and the reasons behind adjustments.'],
    tip: 'Enter the final counted balance, rather than the number of units to add. A low-stock threshold of zero disables the warning for that pack.',
  },
  orders: {
    description: 'Review purchases, maintain shipment tracking and manage fulfilment.',
    steps: ['Review the summary cards, search by order ID or customer details, and filter by fulfilment or payment status.', 'Choose View order or click its order ID to open the items, customer details, delivery address and timeline.', 'Enter the tracking number and tracking link, then choose Save tracking.', 'Super admins can change the fulfilment status as the order progresses; check the payment status separately.', 'To cancel, provide a reason. Eligible paid Razorpay orders that are returned or cancelled offer an Issue full refund action.'],
    tip: 'Review any payment reconciliation message before taking payment-related action. Changing fulfilment status does not itself issue a refund.',
  },
  customers: {
    description: 'Find customer accounts and review their contact details and purchase history.',
    steps: ['Search by name, email or phone and filter by account status.', 'Choose Manage to view saved addresses and order history.', 'Update the customer’s name or phone and choose Save details.', 'If your role permits it, deactivate or reactivate account access.'],
    tip: 'Deactivation removes account access while keeping orders and saved details. Phone numbers must contain 10 digits or be left blank.',
  },
  'cms-banners': {
    description: 'Create homepage promotions and control their carousel order.',
    steps: ['Choose Add banner, upload an image and enter a headline and optional supporting text.', 'Add button text and a destination such as /shop, then review the live preview.', 'Set the display order; lower numbers appear earlier. Save a draft or enable Show on the storefront to publish on save.', 'Use Edit banner, Publish or Hide banner in the list to maintain existing promotions.'],
    tip: 'Use 1080 × 330 px images, or 2160 × 660 px for sharper results. JPEG, PNG and WebP uploads can be up to 12 MB; keep key details near the centre for mobile cropping.',
  },
  'cms-faqs': {
    description: 'Maintain the customer questions and answers shown on the website.',
    steps: ['Enter a clear question and its answer in New item.', 'Set the display order and check Active on website when the FAQ is ready to show.', 'Choose Save and publish. Use Edit on an existing FAQ to update it.', 'Uncheck Active on website and save to hide an FAQ, or use Delete to remove it.'],
    tip: 'Saved active changes publish immediately. Lower display order numbers appear first.',
  },
  'cms-socials': {
    description: 'Manage links to the store’s social profiles.',
    steps: ['Enter the platform name and the full HTTPS profile URL.', 'Set the display order and choose whether the link is Active on website.', 'Choose Save and publish, then check the link on the storefront.', 'Use Edit to change an existing profile, or disable it before saving to hide it.'],
    tip: 'Link to the store’s public profile. Delete removes the saved link from the website.',
  },
  offers: {
    description: 'Create automatic discounts for products, categories or the whole store.',
    steps: ['Enter an offer name, choose percentage or fixed amount, and enter the discount.', 'Limit the offer using comma-separated product slugs or category names; leave both blank for a storewide offer.', 'Set an optional maximum saving, start and end dates, priority and whether it can stack with lower priority offers.', 'Create the offer, then use Edit, Deactivate or Reactivate in Saved offers as needed.'],
    tip: 'Enter percentages as percent and fixed discounts or saving caps in rupees. Check the scope and dates before creating an active promotion.',
  },
  coupons: {
    description: 'Create discount codes with order rules and monitor their use.',
    steps: ['Enter a code, select percentage or fixed amount, and enter the discount.', 'Set optional minimum order value, maximum saving and total usage limit. Zero total uses means unlimited.', 'Choose optional start and end dates, then create the coupon.', 'Use Edit to change rules, Redemptions to review usage, or Deactivate to stop further use.'],
    tip: 'Codes are saved in uppercase. Enter monetary values in rupees and percentages as percent; check the saved rules before sharing a code.',
  },
  'store-content': {
    description: 'Update store information, policies, homepage SEO and tracking settings.',
    steps: ['Edit the customer-facing policy and information text under Shared customer content.', 'Update business contact details and the store address.', 'Set the homepage SEO title and description, and enter the Google verification token if needed. For Meta Pixel, enter its numeric ID and choose whether tracking is enabled.', 'Choose Save and publish, then check the relevant storefront pages.'],
    tip: 'Saving publishes these settings. Product SEO is managed in each product editor; individual homepage FAQs are managed in the FAQs module.',
  },
  users: {
    description: 'Create staff accounts and assign access to the admin panel.',
    steps: ['Choose New user and enter the staff member’s name, email, role and password.', 'Choose a role matching their responsibilities, then create the account.', 'Search or filter existing users and choose Edit to update details. Leave the new password blank to keep the current password.', 'Deactivate a user to remove access immediately, or reactivate them to allow sign-in again.'],
    tip: 'Passwords must contain 12–72 characters. You cannot change your own role or deactivate your own account.',
  },
  audit: {
    description: 'Trace who changed store records and inspect the recorded differences.',
    steps: ['Search for records, people or actions, and filter by record type, action or time.', 'Choose View changes to inspect the before and after values and the recorded actor.', 'Expand View full recorded data for the complete snapshots and use the request ID when investigating a change.', 'Choose Refresh activity to load the latest available events.'],
    tip: 'This is read-only history covering up to 500 recent records. Filters and summary counts apply to the loaded records.',
  },
};
