// Legacy inventory/payment/workflow fixtures exercise the fixed-shipping
// compatibility mode and do not supply quote IDs. Quote integration suites
// explicitly enable shipping and cover mandatory quotes in store/courier mode.
// Never inherit credentials or shipping behaviour from a developer's .env.
process.env.SHIPROCKET_CHECKOUT_ENABLED = 'false';
