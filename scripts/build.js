const fs = require('node:fs');
for (const file of ['public/index.html','public/app.css','public/app.js','api/universe.js','api/scan.js','api/detail.js','lib/upstox.js']) {
  if (!fs.existsSync(file)) throw new Error('Missing deployment asset: ' + file);
}
console.log('StockLens India: static assets and Vercel functions ready.');
