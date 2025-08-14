// src/setupProxy.js
/*
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:8000',
      changeOrigin: true,
      // drop the /api prefix when forwarding
      pathRewrite: { '^/api': '' },
      logLevel: 'debug',
    })
  );
};
*/

const { createProxyMiddleware } = require('http-proxy-middleware');
module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({ 
      target: 'http://localhost:8000', 
      changeOrigin: true,
      // drop the /api prefix when forwarding
      pathRewrite: { '^/api': '' },
      logLevel: 'debug',
    })
  );
};