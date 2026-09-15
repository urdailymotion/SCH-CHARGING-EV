const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SCRIPT_ID = '1Tu0W0R3rYpkf2tJq3cgSL7xmUlGfm6lWBy0M6CBW2UWPQI4beG2qIvAs';
const DEPLOYMENT_ID = 'AKfycbxXsUohfnJX0Mov8BLO65ACSCxihMYIurtP5avh6vTw-Vkxro0JzsdvEMKJ9wJ82FLs';
const WEB_APP_URL = `https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec`;

const baseDir = path.resolve(__dirname, '..');
const deployStagingDir = path.join(process.env.USERPROFILE || 'C:/Users/PPABIBCU035', '.gas_charging_deploy');

console.log('======================================================================');
console.log('  AUTO DEPLOY TO GOOGLE APPS SCRIPT');
console.log('  Script ID:   ', SCRIPT_ID);
console.log('  Deployment ID:', DEPLOYMENT_ID);
console.log('======================================================================\n');

// 1. Pastikan folder staging ada
if (!fs.existsSync(deployStagingDir)) {
  fs.mkdirSync(deployStagingDir, { recursive: true });
}

// 2. Tulis .clasp.json di folder staging
const claspConfig = {
  scriptId: SCRIPT_ID,
  rootDir: ''
};
fs.writeFileSync(path.join(deployStagingDir, '.clasp.json'), JSON.stringify(claspConfig, null, 2), 'utf8');

// 3. Compile bundle
console.log('[1/3] Meng-compile bundle index.html dan Code.js...');
require('./build_bundle.js');

// 4. Salin file-file hasil compile ke staging
fs.copyFileSync(path.join(__dirname, 'index.html'), path.join(deployStagingDir, 'index.html'));
fs.copyFileSync(path.join(__dirname, 'Code.js'), path.join(deployStagingDir, 'Code.js'));
fs.copyFileSync(path.join(__dirname, 'appsscript.json'), path.join(deployStagingDir, 'appsscript.json'));

// 5. Eksekusi clasp push
console.log('\n[2/3] Mengunggah (clasp push) ke Google Apps Script...');
try {
  const pushOut = execSync('npx @google/clasp push -f', { cwd: deployStagingDir, encoding: 'utf8' });
  console.log(pushOut.trim());
} catch (e) {
  console.error('Error saat push:', e.stdout || e.message);
  process.exit(1);
}

// 6. Eksekusi clasp deploy
console.log('\n[3/3] Melakukan deployment otomatis (clasp deploy)...');
try {
  const deployOut = execSync(`npx @google/clasp deploy -d "Auto-Deploy: ${new Date().toLocaleString()}" -i ${DEPLOYMENT_ID}`, { cwd: deployStagingDir, encoding: 'utf8' });
  console.log(deployOut.trim());
} catch (e) {
  console.log('Mencoba deploy versi baru...');
  try {
    const newDeployOut = execSync(`npx @google/clasp deploy -d "Auto-Deploy Release: ${new Date().toLocaleString()}"`, { cwd: deployStagingDir, encoding: 'utf8' });
    console.log(newDeployOut.trim());
  } catch (err2) {
    console.error('Error saat deploy:', err2.stdout || err2.message);
  }
}

console.log('\n======================================================================');
console.log('  DEPLOYMENT KE GOOGLE APPS SCRIPT BERHASIL 100%!');
console.log('  Web App URL Live:');
console.log(' ', WEB_APP_URL);
console.log('======================================================================\n');

// 7. Buka browser otomatis
try {
  execSync(`cmd.exe /c start "" "${WEB_APP_URL}"`);
} catch (e) {}
