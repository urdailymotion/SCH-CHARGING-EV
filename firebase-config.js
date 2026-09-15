/**
 * PPA VoltSwap - Firebase Cloud Firestore Engine
 * Sistem Database Cloud Realtime & Offline Persistence untuk Operasional Charging EV
 */

(function(window) {
  'use strict';

  const STORAGE_KEY = 'voltswap_firebase_config';
  const STATUS_KEY = 'voltswap_firebase_connected';

  // State
  let app = null;
  let db = null;
  let isConnected = false;
  let unsubSwaps = null;
  let unsubProblems = null;
  let unsubSchedules = null;

  // Default Template (Akan diisi oleh Supervisor via UI Database Manager)
  const defaultTemplate = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  };

  /**
   * Mengambil konfigurasi tersimpan
   */
  function getSavedConfig() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Gagal membaca saved Firebase config:', e);
    }
    return null;
  }

  /**
   * Menyimpan konfigurasi baru ke localStorage
   */
  function saveConfig(cfg) {
    if (!cfg) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }

  /**
   * Cek apakah Firebase sudah terkonfigurasi dengan valid
   */
  function isConfigured() {
    const cfg = getSavedConfig();
    return !!(cfg && cfg.apiKey && cfg.projectId);
  }

  /**
   * Inisialisasi Firebase App & Firestore
   */
  function init() {
    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK belum dimuat di halaman.');
      return false;
    }

    const cfg = getSavedConfig();
    if (!cfg || !cfg.apiKey || !cfg.projectId) {
      console.log('ℹ️ Firebase belum dikonfigurasi. Menggunakan penyimpanan lokal (Offline Mode).');
      updateStatusBadge(false, 'Belum Dikonfigurasi');
      return false;
    }

    try {
      // Inisialisasi jika belum ada
      if (!firebase.apps || firebase.apps.length === 0) {
        app = firebase.initializeApp(cfg);
      } else {
        app = firebase.apps[0];
      }

      db = firebase.firestore();

      // Aktifkan offline persistence jika didukung oleh browser
      try {
        db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
          if (err.code === 'failed-precondition') {
            console.warn('Firestore persistence warning: Multiple tabs open');
          } else if (err.code === 'unimplemented') {
            console.warn('Firestore persistence is not supported by current browser');
          }
        });
      } catch (e) {}

      isConnected = true;
      localStorage.setItem(STATUS_KEY, 'true');
      console.log('🔥 Firebase Cloud Firestore berhasil terhubung! Proyek:', cfg.projectId);
      updateStatusBadge(true, 'Terhubung & Realtime');

      // Mulai realtime listeners
      startRealtimeListeners();
      return true;
    } catch (err) {
      console.error('Error saat inisialisasi Firebase:', err);
      isConnected = false;
      updateStatusBadge(false, 'Gagal Terhubung');
      return false;
    }
  }

  /**
   * Update visual badge di Database Manager
   */
  function updateStatusBadge(active, text) {
    const badge = document.getElementById('badgeFirebaseStatus');
    if (badge) {
      if (active) {
        badge.className = 'db-sync-card-badge status-ready';
        badge.innerHTML = `<span class="dot pulse-green"></span> ${text || 'Aktif (Cloud Realtime)'}`;
      } else {
        badge.className = 'db-sync-card-badge';
        badge.style.background = '#fef3c7';
        badge.style.color = '#92400e';
        badge.innerHTML = `<span style="font-size:10px;">⚠️</span> ${text || 'Mode Lokal (Offline)'}`;
      }
    }
  }

  /**
   * Realtime Listeners
   */
  function startRealtimeListeners() {
    if (!db) return;

    // Listener Transaksi Swaps
    try {
      if (unsubSwaps) unsubSwaps();
      unsubSwaps = db.collection('swaps').orderBy('date', 'desc').onSnapshot((snapshot) => {
        if (!snapshot.empty) {
          const list = [];
          snapshot.forEach((doc) => {
            list.push(doc.data());
          });
          if (list.length > 0 && window.handleFirestoreSwapsUpdate) {
            window.handleFirestoreSwapsUpdate(list);
          }
        }
      }, (err) => {
        console.warn('Firestore swaps listener notice:', err);
      });
    } catch (e) {
      console.warn('Error setting up swaps listener:', e);
    }

    // Listener Problems
    try {
      if (unsubProblems) unsubProblems();
      unsubProblems = db.collection('problems').onSnapshot((snapshot) => {
        if (!snapshot.empty) {
          const list = [];
          snapshot.forEach((doc) => list.push(doc.data()));
          if (list.length > 0 && window.handleFirestoreProblemsUpdate) {
            window.handleFirestoreProblemsUpdate(list);
          }
        }
      }, (err) => console.warn('Problems listener notice:', err));
    } catch (e) {}

    // Listener Schedules
    try {
      if (unsubSchedules) unsubSchedules();
      unsubSchedules = db.collection('schedules').onSnapshot((snapshot) => {
        if (!snapshot.empty) {
          const list = [];
          snapshot.forEach((doc) => list.push(doc.data()));
          if (list.length > 0 && window.handleFirestoreSchedulesUpdate) {
            window.handleFirestoreSchedulesUpdate(list);
          }
        }
      }, (err) => console.warn('Schedules listener notice:', err));
    } catch (e) {}
  }

  /**
   * =========================================================================
   * FIRESTORE CRUD OPERATIONS
   * =========================================================================
   */

  // --- SWAPS ---
  async function addSwap(swap) {
    if (!db || !isConnected) return false;
    try {
      const docId = String(swap.id).trim();
      await db.collection('swaps').doc(docId).set({
        ...swap,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return true;
    } catch (err) {
      console.error('Gagal menambahkan swap ke Firestore:', err);
      return false;
    }
  }

  async function updateSwap(id, swapData) {
    if (!db || !isConnected) return false;
    try {
      const docId = String(id).trim();
      await db.collection('swaps').doc(docId).set({
        ...swapData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return true;
    } catch (err) {
      console.error('Gagal memperbarui swap di Firestore:', err);
      return false;
    }
  }

  async function deleteSwap(id) {
    if (!db || !isConnected) return false;
    try {
      const docId = String(id).trim();
      await db.collection('swaps').doc(docId).delete();
      return true;
    } catch (err) {
      console.error('Gagal menghapus swap di Firestore:', err);
      return false;
    }
  }

  // --- PROBLEMS ---
  async function addProblem(prob) {
    if (!db || !isConnected) return false;
    try {
      const docId = String(prob.id || Date.now()).trim();
      await db.collection('problems').doc(docId).set({
        ...prob,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return true;
    } catch (e) {
      console.error('Gagal menambahkan problem ke Firestore:', e);
      return false;
    }
  }

  async function deleteProblem(id) {
    if (!db || !isConnected) return false;
    try {
      await db.collection('problems').doc(String(id).trim()).delete();
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- SCHEDULES ---
  async function addSchedule(sch) {
    if (!db || !isConnected) return false;
    try {
      const docId = `SCH-${sch.unit}-${sch.shift}-${sch.tanggal.replace(/\//g, '')}`;
      await db.collection('schedules').doc(docId).set({
        ...sch,
        id: docId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return true;
    } catch (e) {
      return false;
    }
  }

  async function deleteSchedule(id) {
    if (!db || !isConnected) return false;
    try {
      await db.collection('schedules').doc(String(id).trim()).delete();
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- USERS ---
  async function saveUser(user) {
    if (!db || !isConnected) return false;
    try {
      const docId = String(user.nik).trim();
      await db.collection('users').doc(docId).set({
        ...user,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return true;
    } catch (e) {
      return false;
    }
  }

  async function deleteUser(nik) {
    if (!db || !isConnected) return false;
    try {
      await db.collection('users').doc(String(nik).trim()).delete();
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * =========================================================================
   * 1-CLICK CLOUD MIGRATION (SEEDING SELURUH DATA LOKAL KE FIRESTORE)
   * =========================================================================
   */
  async function migrateAllLocalData(onProgress) {
    if (!db || !isConnected) {
      throw new Error('Firebase Firestore belum terhubung. Silakan periksa konfigurasi proyek.');
    }

    const swaps = window.getExportableSwaps ? window.getExportableSwaps() : (window.swapsData || []);
    const problems = window.problemsData || [];
    const schedules = window.schedulesData || [];
    const units = window.fleetUnits || [];
    const users = (typeof window.getAppUsers === 'function') ? window.getAppUsers() : (window.OPERATOR_USERS || []);

    const totalItems = swaps.length + problems.length + schedules.length + units.length + users.length;
    let completed = 0;

    function report(stepText) {
      completed++;
      const pct = Math.min(100, Math.round((completed / Math.max(1, totalItems)) * 100));
      if (typeof onProgress === 'function') {
        onProgress(pct, stepText);
      }
    }

    // 1. Batch upload swaps in chunks of 400
    const chunkSize = 400;
    for (let i = 0; i < swaps.length; i += chunkSize) {
      const batch = db.batch();
      const chunk = swaps.slice(i, i + chunkSize);
      chunk.forEach((s) => {
        const docRef = db.collection('swaps').doc(String(s.id).trim());
        batch.set(docRef, { ...s, migratedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        report(`Migrasi Transaksi ${s.id}...`);
      });
      await batch.commit();
    }

    // 2. Upload problems
    if (problems.length > 0) {
      const pBatch = db.batch();
      problems.forEach((p, idx) => {
        const pId = String(p.id || `PRB-${idx+1}`).trim();
        const docRef = db.collection('problems').doc(pId);
        pBatch.set(docRef, { ...p, id: pId }, { merge: true });
        report(`Migrasi Problem ${pId}...`);
      });
      await pBatch.commit();
    }

    // 3. Upload schedules
    if (schedules.length > 0) {
      const sBatch = db.batch();
      schedules.forEach((sc, idx) => {
        const scId = `SCH-${sc.unit}-${sc.shift}-${idx}`;
        const docRef = db.collection('schedules').doc(scId);
        sBatch.set(docRef, { ...sc, id: scId }, { merge: true });
        report(`Migrasi Jadwal DT ${sc.unit}...`);
      });
      await sBatch.commit();
    }

    // 4. Upload units
    if (units.length > 0) {
      const uBatch = db.batch();
      units.forEach((u) => {
        const docRef = db.collection('units').doc(String(u.code).trim());
        uBatch.set(docRef, { ...u }, { merge: true });
        report(`Migrasi Armada DT ${u.code}...`);
      });
      await uBatch.commit();
    }

    // 5. Upload users
    if (users.length > 0) {
      const userBatch = db.batch();
      users.forEach((usr) => {
        const docRef = db.collection('users').doc(String(usr.nik).trim());
        userBatch.set(docRef, { ...usr }, { merge: true });
        report(`Migrasi Pengguna ${usr.name}...`);
      });
      await userBatch.commit();
    }

    // 6. Record metadata sync
    await db.collection('system').doc('sync_info').set({
      lastMigrationDate: new Date().toISOString(),
      totalSwaps: swaps.length,
      totalProblems: problems.length,
      totalSchedules: schedules.length,
      migratedBy: (window.currentAuthUser ? window.currentAuthUser.name : 'Supervisor')
    }, { merge: true });

    return { totalItems, swaps: swaps.length, problems: problems.length, schedules: schedules.length, users: users.length };
  }

  function clearConfig() {
    saveConfig(null);
    isConnected = false;
    if (unsubSwaps) { unsubSwaps(); unsubSwaps = null; }
    if (unsubProblems) { unsubProblems(); unsubProblems = null; }
    if (unsubSchedules) { unsubSchedules(); unsubSchedules = null; }
    localStorage.removeItem(STATUS_KEY);
    updateStatusBadge(false, 'Mode Lokal (Offline)');
  }

  /**
   * Export modul ke objek global
   */
  window.VoltFirebase = {
    init,
    isConfigured,
    getSavedConfig,
    saveConfig,
    clearConfig,
    isConnected: () => isConnected,
    addSwap,
    updateSwap,
    deleteSwap,
    addProblem,
    deleteProblem,
    addSchedule,
    deleteSchedule,
    saveUser,
    deleteUser,
    migrateAllLocalData,
    updateStatusBadge
  };

})(window);
