const { AsyncLocalStorage } = require('node:async_hooks');

const tenantContext = new AsyncLocalStorage();

module.exports = tenantContext;
