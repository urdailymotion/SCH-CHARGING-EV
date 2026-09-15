/**
 * PPA VoltSwap - Firestore Auto-Seeder & Injector
 * Menyuntikkan seluruh master data (Swaps, Problems, Schedules, Units, Users)
 * langsung ke Google Firebase Cloud Firestore: charging-ev-scm
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

const PROJECT_ID = 'charging-ev-scm';
const API_KEY = 'AIzaSyAW7Groj5v8TzbEwXhTXBDc8RT1ehBT4_0';

console.log('======================================================================');
console.log(`🔥 PENYUNTIKAN DATA KE GOOGLE FIREBASE CLOUD FIRESTORE: ${PROJECT_ID}`);
console.log('======================================================================\n');

// 1. Baca data dari data.js
console.log('[1/4] Memuat data lokal dari data.js...');
const sandbox = { window: {} };
vm.createContext(sandbox);
const dataJsCode = fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8');
vm.runInContext(dataJsCode, sandbox);

const initData = sandbox.window.INITIAL_DATA || {};
const swaps = initData.swaps || [];
const problems = initData.problems || [];
const schedules = initData.schedules || [];
const populasi = initData.populasi || [];

// Users dari main.js
let users = [];
try {
  const mainJsCode = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const matchUsers = mainJsCode.match(/const OPERATOR_USERS = (\[[\s\S]*?\]);/);
  if (matchUsers) {
    users = eval(matchUsers[1]);
  }
} catch (e) {}

console.log(`      ✓ Transaksi Swaps : ${swaps.length} data`);
console.log(`      ✓ Log Masalah     : ${problems.length} data`);
console.log(`      ✓ Jadwal Swap     : ${schedules.length} data`);
console.log(`      ✓ Populasi Unit DT: ${populasi.length} unit`);
console.log(`      ✓ Pengguna / User : ${users.length} akun`);

// Helper untuk format value Firestore REST API
function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  return { stringValue: String(val) };
}

function toFirestoreDocument(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
    }
  }
  return { fields };
}

function firestoreRequest(method, docPath, body) {
  return new Promise((resolve, reject) => {
    const urlPath = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}?key=${API_KEY}`;
    const postData = body ? JSON.stringify(body) : null;

    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject({ status: res.statusCode, data: parsed });
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
          else reject({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runInjection() {
  // 2. Uji Koneksi & Izin Security Rules
  console.log('\n[2/4] Menguji izin akses Security Rules Firestore...');
  try {
    await firestoreRequest('PATCH', 'system/test_connection', {
      fields: {
        status: { stringValue: 'connected' },
        timestamp: { stringValue: new Date().toISOString() }
      }
    });
    console.log('      ✓ Izin akses Firestore AKTIF & TERVERIFIKASI!');
  } catch (err) {
    if (err.status === 403) {
      console.log('\n[!] PERHATIAN: AKSES DITOLAK OLEH FIRESTORE (HTTP 403 PERMISSION DENIED)');
      console.log('----------------------------------------------------------------------');
      console.log('Database Firestore Anda saat ini masih dalam "Mode Terkunci" (Production Mode).');
      console.log('\nLangkah Sangat Mudah untuk Membuka Izin Akses (1 Menit):');
      console.log('1. Buka browser ke Firebase Console:');
      console.log('   https://console.firebase.google.com/project/charging-ev-scm/firestore/rules');
      console.log('2. Ubah isi aturan menjadi:');
      console.log('   rules_version = \'2\';');
      console.log('   service cloud.firestore {');
      console.log('     match /databases/{database}/documents {');
      console.log('       match /{document=**} {');
      console.log('         allow read, write: if true;');
      console.log('       }');
      console.log('     }');
      console.log('   }');
      console.log('3. Klik tombol "Publish" (Publikasikan).');
      console.log('4. Jalankan ulang script ini: node seed_firestore.js');
      console.log('----------------------------------------------------------------------\n');
      process.exit(1);
    } else {
      console.error('Terjadi kesalahan tidak terduga:', err);
      process.exit(1);
    }
  }

  // 3. Suntikkan Seluruh Data
  console.log('\n[3/4] Mulai menyuntikkan data ke Cloud Firestore...');

  // 3a. Users
  console.log(`\n  -> Menyuntikkan ${users.length} data Users...`);
  for (const u of users) {
    const docId = `users/${encodeURIComponent(String(u.nik).trim())}`;
    await firestoreRequest('PATCH', docId, toFirestoreDocument(u));
    process.stdout.write('.');
  }
  console.log(' [Selesai]');

  // 3b. Populasi Unit
  console.log(`\n  -> Menyuntikkan ${populasi.length} Populasi Unit DT...`);
  for (const code of populasi) {
    const unitObj = {
      code: String(code),
      type: 'EV Dump Truck 90T',
      status: (code === '1615' || code === '1644') ? 'Standby' : 'Aktif',
      note: (code === '1615' || code === '1644') ? 'Standby / Belum Ada Swap Hari Ini' : 'Operasional Normal'
    };
    const docId = `units/${encodeURIComponent(String(code).trim())}`;
    await firestoreRequest('PATCH', docId, toFirestoreDocument(unitObj));
    process.stdout.write('.');
  }
  console.log(' [Selesai]');

  // 3c. Schedules
  console.log(`\n  -> Menyuntikkan ${schedules.length} data Jadwal Swap...`);
  for (let i = 0; i < schedules.length; i++) {
    const sc = schedules[i];
    const docId = `schedules/SCH_${sc.unit}_${sc.shift}_${i}`;
    await firestoreRequest('PATCH', docId, toFirestoreDocument(sc));
    process.stdout.write('.');
  }
  console.log(' [Selesai]');

  // 3d. Problems
  console.log(`\n  -> Menyuntikkan ${problems.length} data Log Gangguan/Problem...`);
  for (let i = 0; i < problems.length; i++) {
    const pr = problems[i];
    const pId = String(pr.id || `PRB-${i+1}`).trim();
    const docId = `problems/${encodeURIComponent(pId)}`;
    await firestoreRequest('PATCH', docId, toFirestoreDocument({ ...pr, id: pId }));
    process.stdout.write('.');
  }
  console.log(' [Selesai]');

  // 3e. Swaps
  console.log(`\n  -> Menyuntikkan ${swaps.length} data Transaksi Swaps...`);
  let count = 0;
  for (const sw of swaps) {
    const docId = `swaps/${encodeURIComponent(String(sw.id).trim())}`;
    await firestoreRequest('PATCH', docId, toFirestoreDocument(sw));
    count++;
    if (count % 25 === 0 || count === swaps.length) {
      process.stdout.write(` [${count}/${swaps.length}] `);
    } else {
      process.stdout.write('.');
    }
  }
  console.log(' [Selesai]');

  // 4. Catat Metadata
  console.log('\n[4/4] Mencatat metadata sinkronisasi sistem...');
  await firestoreRequest('PATCH', 'system/sync_info', toFirestoreDocument({
    lastMigrationDate: new Date().toISOString(),
    totalSwaps: swaps.length,
    totalProblems: problems.length,
    totalSchedules: schedules.length,
    totalUnits: populasi.length,
    totalUsers: users.length,
    source: 'Automated Injection Script'
  }));

  console.log('\n======================================================================');
  console.log('🎉 SEMUA DATA BERHASIL DISUNTIKKAN KE FIREBASE CLOUD FIRESTORE 100%!');
  console.log(`   Proyek: ${PROJECT_ID}`);
  console.log(`   Total Transaksi : ${swaps.length}`);
  console.log(`   Total Log Masalah: ${problems.length}`);
  console.log(`   Total Jadwal    : ${schedules.length}`);
  console.log(`   Total Unit DT   : ${populasi.length}`);
  console.log(`   Total Akun User : ${users.length}`);
  console.log('======================================================================\n');
}

runInjection().catch(err => {
  console.error('\n[Error Fatal]', err);
});
