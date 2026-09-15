const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname, '..');
const outDir = __dirname;

console.log('[1/4] Membaca file-file aplikasi lokal dari:', baseDir);

let html = fs.readFileSync(path.join(baseDir, 'index.html'), 'utf8');
let css = fs.readFileSync(path.join(baseDir, 'style.css'), 'utf8');
let dataJs = fs.readFileSync(path.join(baseDir, 'data.js'), 'utf8');
let appJs = fs.existsSync(path.join(baseDir, 'main.js')) ? fs.readFileSync(path.join(baseDir, 'main.js'), 'utf8') : fs.readFileSync(path.join(baseDir, 'app.js'), 'utf8');

let fbJs = fs.existsSync(path.join(baseDir, 'firebase-config.js')) ? fs.readFileSync(path.join(baseDir, 'firebase-config.js'), 'utf8') : '';

// High-performance lightweight background for fast GAS load & zero timeout
css = css.replace(/url\(['"]?login_bg\.jpg['"]?\)/g, 'radial-gradient(ellipse at 50% 20%, #1e3a5f 0%, #0c2040 45%, #050e1d 100%)');

// Inline CSS
html = html.replace(
  '<link rel="stylesheet" href="style.css">',
  `<style>\n${css}\n</style>`
);

// Bersihkan link manifest dan script lokal
html = html.replace(/<link rel="manifest"[^>]*>/g, '');
html = html.replace(/<script src="data\.js"[^>]*><\/script>/g, '');
html = html.replace(/<script src="firebase-config\.js"[^>]*><\/script>/g, '');
html = html.replace(/<script src="(main|app)\.js"[^>]*><\/script>/g, '');

// Inline scripts
const bundleScripts = `
<script>
// Master Data
${dataJs}
</script>
<script>
// Firebase Engine
${fbJs}
</script>
<script>
// Main Application Engine
${appJs}
</script>
`;

html = html.replace('</body>', `${bundleScripts}\n</body>`);

// Simpan output bundle index.html ke folder gas_deploy
fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');

console.log('[2/4] Bundle index.html berhasil dibuat di:', path.join(outDir, 'index.html'));
console.log('      Ukuran file:', (fs.statSync(path.join(outDir, 'index.html')).size / 1024).toFixed(1), 'KB');
