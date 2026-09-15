/**
 * VoltSwap Ops - Enterprise AdminLTE & PPA Safe & Strong Portal Engine
 */

// =============================================================================
// 1. DATA STATE & PERSISTENCE
// =============================================================================

let activeLocation = localStorage.getItem('voltswap_location') || 'ROOM A1';
let swapsData = [];
let problemsData = [];
let fleetUnits = [];
let schedulesData = [];

// =============================================================================
// 1b. GAS SYNC MODULE
// Deteksi otomatis: jika berjalan di GAS → aktifkan sync ke Google Sheets
// Jika lokal (localhost) → hanya pakai localStorage
// =============================================================================

const IS_GAS_ENV = (typeof google !== 'undefined' && typeof google.script !== 'undefined');

const gasSync = {

  /**
   * Load semua data dari GAS (dipanggil saat app init)
   * Mengganti data localStorage dengan data terbaru dari Google Sheets
   */
  loadAll: function(onComplete) {
    if (!IS_GAS_ENV) {
      if (typeof onComplete === 'function') onComplete(false);
      return;
    }
    gasSync._showSyncBadge('⏳ Memuat data dari Google Sheets...');
    google.script.run
      .withSuccessHandler(function(result) {
        if (result && result.status === 'success') {
          // 1. Swaps
          if (result.swaps && result.swaps.length > 0) {
            swapsData = result.swaps;
            localStorage.setItem('voltswap_swaps', JSON.stringify(swapsData));
          }
          // 2. Problems
          if (result.problems && result.problems.length > 0) {
            problemsData = result.problems;
            localStorage.setItem('voltswap_problems', JSON.stringify(problemsData));
          }
          // 3. Populasi Unit (fleet)
          if (result.populasi && result.populasi.length > 0) {
            fleetUnits = result.populasi.map(code => ({
              code: code,
              type: 'EV Dump Truck 90T',
              status: 'Aktif',
              note: 'Operasional Normal'
            }));
            localStorage.setItem('voltswap_fleet_list', JSON.stringify(fleetUnits));
          }
          // 4. Schedules
          if (result.schedules && result.schedules.length > 0) {
            schedulesData = result.schedules;
            localStorage.setItem('voltswap_schedules', JSON.stringify(schedulesData));
          }
          // 5. Sync user list dari GAS (opsional — tetap gunakan OPERATOR_USERS lokal sbg fallback)
          if (result.users && result.users.length > 0) {
            localStorage.setItem('voltswap_gas_users', JSON.stringify(result.users));
          }
          gasSync._showSyncBadge('✅ Data berhasil dimuat dari Google Sheets', 'success');
          if (typeof populateDateFilters === 'function') populateDateFilters();
          if (typeof populateUnitSelects === 'function') populateUnitSelects();
          renderMainTable();
          updateSummaryCard();
          if (typeof renderHistoryDaily === 'function') renderHistoryDaily();
          if (typeof updatePpaExecutiveDashboard === 'function') updatePpaExecutiveDashboard();
          if (typeof renderScheduleTable === 'function') renderScheduleTable();
          if (typeof renderProblemTable === 'function') renderProblemTable();
          if (typeof renderUnitTable === 'function') renderUnitTable();
        } else {
          gasSync._showSyncBadge('⚠️ Gagal memuat: ' + (result ? result.message : 'Unknown'), 'warn');
        }
        if (typeof onComplete === 'function') onComplete(true);
      })
      .withFailureHandler(function(err) {
        gasSync._showSyncBadge('❌ GAS Error: ' + err, 'error');
        if (typeof onComplete === 'function') onComplete(false);
      })
      .apiGetAllSheetsData();
  },

  /**
   * Push satu transaksi baru ke Google Sheets setelah disimpan lokal
   */
  pushTransaction: function(rec) {
    if (!IS_GAS_ENV) return;
    google.script.run
      .withSuccessHandler(function(result) {
        if (result && result.status === 'success') {
          showToast('☁️ Transaksi tersinkron ke Google Sheets!', 'success');
        } else {
          showToast('⚠️ Gagal sync ke Sheets: ' + (result ? result.message : ''), 'warning');
        }
      })
      .withFailureHandler(function(err) {
        showToast('❌ GAS sync error: ' + err, 'danger');
      })
      .apiSaveSwapTransaction(rec);
  },

  /**
   * Push problem log baru ke Google Sheets
   */
  pushProblem: function(prob) {
    if (!IS_GAS_ENV) return;
    google.script.run
      .withSuccessHandler(function(result) {
        if (result && result.status === 'success') {
          showToast('☁️ Log gangguan tersinkron ke Google Sheets!', 'success');
        } else {
          showToast('⚠️ Gagal sync problem: ' + (result ? result.message : ''), 'warning');
        }
      })
      .withFailureHandler(function() {})
      .apiSaveProblemLog(prob);
  },

  /**
   * Hapus unit dari sheet POPULASI UNIT di Google Sheets
   */
  deleteUnit: function(code) {
    if (!IS_GAS_ENV) return;
    gasSync._showSyncBadge('⏳ Menghapus unit di Google Sheets...', 'loading');
    google.script.run
      .withSuccessHandler(function(res) {
        if (res && res.status === 'success') {
          gasSync._showSyncBadge('✅ Unit dihapus dari Google Sheets', 'success');
          showToast(`☁️ Unit DT ${code} berhasil dihapus dari Google Sheets!`, 'success');
        } else {
          gasSync._showSyncBadge('⚠️ Gagal hapus di Sheets', 'warn');
          showToast(`⚠️ Gagal hapus unit di Sheets: ${(res ? res.message : '')}`, 'warning');
        }
      })
      .withFailureHandler(function(err) {
        gasSync._showSyncBadge('❌ Error sync', 'error');
        showToast('❌ GAS Error saat hapus unit: ' + err, 'danger');
      })
      .apiDeleteUnit(code);
  },

  /**
   * Tambah unit ke sheet POPULASI UNIT di Google Sheets
   */
  addUnit: function(code) {
    if (!IS_GAS_ENV) return;
    gasSync._showSyncBadge('⏳ Menambah unit ke Google Sheets...', 'loading');
    google.script.run
      .withSuccessHandler(function(res) {
        if (res && res.status === 'success') {
          gasSync._showSyncBadge('✅ Unit tersimpan di Google Sheets', 'success');
          showToast(`☁️ Unit DT ${code} tersinkron ke Google Sheets!`, 'success');
        } else {
          gasSync._showSyncBadge('⚠️ Gagal simpan di Sheets', 'warn');
        }
      })
      .withFailureHandler(function(err) {
        showToast('❌ GAS Error saat tambah unit: ' + err, 'danger');
      })
      .apiAddUnit(code);
  },

  /**
   * Hapus transaksi dari sheet DATA INPUT di Google Sheets
   */
  deleteTransaction: function(id) {
    if (!IS_GAS_ENV) return;
    gasSync._showSyncBadge('⏳ Menghapus transaksi di Google Sheets...', 'loading');
    google.script.run
      .withSuccessHandler(function(res) {
        if (res && res.status === 'success') {
          gasSync._showSyncBadge('✅ Transaksi dihapus dari Google Sheets', 'success');
          showToast(`☁️ Transaksi ${id} berhasil dihapus dari Google Sheets!`, 'success');
        } else {
          gasSync._showSyncBadge('⚠️ Gagal hapus di Sheets', 'warn');
        }
      })
      .withFailureHandler(function(err) {
        showToast('❌ GAS Error: ' + err, 'danger');
      })
      .apiDeleteTransaction(id);
  },

  /**
   * Validasi login via GAS (cek password dari sheet USER)
   */
  validateLogin: function(nik, password, onResult) {
    if (!IS_GAS_ENV) {
      // Local mode: password = NIK
      if (typeof onResult === 'function') onResult(password === nik || password === '' ? 'ok' : 'wrong_password');
      return;
    }
    google.script.run
      .withSuccessHandler(function(result) {
        if (typeof onResult === 'function') onResult(result);
      })
      .withFailureHandler(function() {
        if (typeof onResult === 'function') onResult({ status: 'error', message: 'GAS error' });
      })
      .apiValidateLogin(nik, password);
  },

  _showSyncBadge: function(msg, type) {
    const badge = document.getElementById('gasSyncStatusBadge');
    if (!badge) return;
    badge.style.display = 'flex';
    badge.textContent = msg;
    badge.className = 'gas-sync-badge ' + (type || 'loading');
    if (type === 'success') {
      setTimeout(() => { badge.style.display = 'none'; }, 3000);
    }
  }
};


function buildDefaultFleet() {
  const initialPop = window.INITIAL_DATA ? window.INITIAL_DATA.populasi : [];
  return initialPop.map(code => {
    const isInactive = (code === '1615' || code === '1644');
    return {
      code: code,
      type: 'EV Dump Truck 90T',
      status: isInactive ? 'Standby' : 'Aktif',
      note: isInactive ? 'Standby / Belum Ada Swap Hari Ini' : 'Operasional Normal'
    };
  });
}

function initDataState() {
  const storedSwaps = localStorage.getItem('voltswap_swaps');
  const storedProblems = localStorage.getItem('voltswap_problems');
  const storedFleet = localStorage.getItem('voltswap_fleet_list');

  if (storedSwaps) {
    try {
      swapsData = JSON.parse(storedSwaps);
      if (swapsData.length < 200 && window.INITIAL_DATA && window.INITIAL_DATA.swaps.length >= 240) {
        swapsData = [...window.INITIAL_DATA.swaps];
        localStorage.setItem('voltswap_swaps', JSON.stringify(swapsData));
      }
    } catch (e) {
      swapsData = [...(window.INITIAL_DATA ? window.INITIAL_DATA.swaps : [])];
    }
  } else {
    swapsData = [...(window.INITIAL_DATA ? window.INITIAL_DATA.swaps : [])];
    localStorage.setItem('voltswap_swaps', JSON.stringify(swapsData));
  }

  // Populate operator identity for existing records
  const opList = OPERATOR_USERS.filter(u => u.role === 'OPERATOR');
  swapsData.forEach((s, idx) => {
    if (!s.operator || !s.operatorNik) {
      const op = opList[idx % opList.length];
      s.operator = op.name;
      s.operatorNik = op.nik;
    }
    if (!s.category) {
      s.category = 'CHARGING SWAP';
    }
  });

  if (storedProblems) {
    try {
      problemsData = JSON.parse(storedProblems);
    } catch (e) {
      problemsData = [...(window.INITIAL_DATA ? window.INITIAL_DATA.problems : [])];
    }
  } else {
    problemsData = [...(window.INITIAL_DATA ? window.INITIAL_DATA.problems : [])];
    localStorage.setItem('voltswap_problems', JSON.stringify(problemsData));
  }

  if (storedFleet) {
    try {
      fleetUnits = JSON.parse(storedFleet);
    } catch (e) {
      fleetUnits = buildDefaultFleet();
    }
  } else {
    fleetUnits = buildDefaultFleet();
    localStorage.setItem('voltswap_fleet_list', JSON.stringify(fleetUnits));
  }

  // Load schedules data
  const storedSchedules = localStorage.getItem('voltswap_schedules');
  if (storedSchedules) {
    try {
      schedulesData = JSON.parse(storedSchedules);
    } catch (e) {
      schedulesData = [...(window.INITIAL_DATA && window.INITIAL_DATA.schedules ? window.INITIAL_DATA.schedules : [])];
    }
  } else {
    schedulesData = [...(window.INITIAL_DATA && window.INITIAL_DATA.schedules ? window.INITIAL_DATA.schedules : [])];
    localStorage.setItem('voltswap_schedules', JSON.stringify(schedulesData));
  }
}

// =============================================================================
// DATE NORMALIZATION & DYNAMIC FILTER POPULATION
// =============================================================================

function parseDateComparable(dStr) {
  if (!dStr || typeof dStr !== 'string') return null;
  dStr = dStr.trim();
  if (dStr.includes('/')) {
    const parts = dStr.split('/');
    if (parts.length === 3) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2].length === 2 ? '20' + parts[2] : parts[2];
      return `${y}-${m}-${d}`;
    }
  }
  if (dStr.includes('-')) {
    const parts = dStr.split('-');
    if (parts[0].length === 4) return dStr;
    if (parts.length === 3) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2].length === 2 ? '20' + parts[2] : parts[2];
      return `${y}-${m}-${d}`;
    }
  }
  return null;
}

function formatDateLabel(dStr) {
  if (!dStr || typeof dStr !== 'string') return '';
  dStr = dStr.trim();
  const parts = dStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sept', 'Okt', 'Nov', 'Des'];
    const month = monthNames[m] || parts[1];
    return `${day} ${month} ${parts[2]}`;
  }
  return dStr;
}

function populateDateFilters() {
  const dateSet = new Set();
  swapsData.forEach(s => {
    if (s.date && typeof s.date === 'string' && s.date.trim()) {
      dateSet.add(s.date.trim());
    }
  });

  const sortedDates = Array.from(dateSet).sort((a, b) => {
    const compA = parseDateComparable(a) || '';
    const compB = parseDateComparable(b) || '';
    return compB.localeCompare(compA);
  });

  // 1. History Daily Filter
  const dailyDateSelect = document.getElementById('dailyFilterDate');
  if (dailyDateSelect) {
    const currentVal = dailyDateSelect.value;
    dailyDateSelect.innerHTML = '<option value="ALL">Semua Tanggal</option>';
    sortedDates.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = formatDateLabel(d);
      dailyDateSelect.appendChild(opt);
    });
    if (currentVal && (currentVal === 'ALL' || dateSet.has(currentVal))) {
      dailyDateSelect.value = currentVal;
    } else if (sortedDates.length > 0) {
      dailyDateSelect.value = sortedDates[0];
    }
  }

  // 2. PPA Executive Dashboard Filter
  const ppaDateSelect = document.getElementById('ppaFilterDate');
  if (ppaDateSelect) {
    const currentVal = ppaDateSelect.value;
    ppaDateSelect.innerHTML = '<option value="ALL">Semua Tanggal</option>';
    sortedDates.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = formatDateLabel(d);
      ppaDateSelect.appendChild(opt);
    });
    if (currentVal && (currentVal === 'ALL' || dateSet.has(currentVal))) {
      ppaDateSelect.value = currentVal;
    } else {
      ppaDateSelect.value = 'ALL';
    }
  }
}

function generateNextSwapId() {
  let maxNum = 0;
  swapsData.forEach(s => {
    if (s.id) {
      const match = s.id.match(/(\d+)$/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
  });
  const nextNum = Math.max(swapsData.length + 1, maxNum + 1);
  return `DA01/CHG/2026/SWAP/${String(nextNum).padStart(4, '0')}`;
}

function persistData() {
  localStorage.setItem('voltswap_swaps', JSON.stringify(swapsData));
  localStorage.setItem('voltswap_problems', JSON.stringify(problemsData));
  renderMainTable();
  updateSummaryCard();
}

function saveFleet() {
  localStorage.setItem('voltswap_fleet_list', JSON.stringify(fleetUnits));
  populateUnitSelects();
  renderUnitTable();
  renderArmadaGrid();
}

// =============================================================================
// 2. OPERATOR AUTHENTICATION & ACCESS CONTROL (NIK LOOKUP & ROLE PERMISSIONS)
// =============================================================================

const OPERATOR_USERS = [
  { nik: "81230529", name: "ZAKARIYA ABIDIN", title: "CHARGING MAN", role: "OPERATOR", dept: "Charging Operations" },
  { nik: "81230588", name: "DAFFA GEDE KURNIAWAN", title: "CHARGING MAN", role: "OPERATOR", dept: "Charging Operations" },
  { nik: "81230176", name: "ABI SETIAWAN", title: "CHARGING MAN", role: "OPERATOR", dept: "Charging Operations" },
  { nik: "81230594", name: "VIRNANDA AGUS SETIAWAN", title: "CHARGING MAN", role: "OPERATOR", dept: "Charging Operations" },
  { nik: "81230596", name: "SRIVASTA NASOKA FARIMBA", title: "CHARGING MAN", role: "OPERATOR", dept: "Charging Operations" },
  { nik: "81230112", name: "BACHTIAR PUTRA DANANJAYA", title: "CHARGING MAN", role: "OPERATOR", dept: "Charging Operations" },
  { nik: "81230103", name: "APRIL YULIUS PESSIWARISA", title: "CHARGING MAN", role: "OPERATOR", dept: "Charging Operations" },
  { nik: "81230134", name: "INDRA ARIVYANTO", title: "CHARGING MAN", role: "OPERATOR", dept: "Charging Operations" },
  { nik: "11050104", name: "ANTON WAHYU ANTAT WULAN", title: "GROUB LEADER", role: "SUPERVISOR", dept: "Operations Supervision" },
  { nik: "21002786", name: "TONI PURWANTO", title: "GROUB LEADER", role: "SUPERVISOR", dept: "Operations Supervision" },
  { nik: "22002555", name: "YUDA PUGUH WIDODO", title: "GROUB LEADER", role: "SUPERVISOR", dept: "Operations Supervision" },
  { nik: "24006305", name: "AHMAD ZAENAL MUNTAHA", title: "GROUB LEADER", role: "SUPERVISOR", dept: "Operations Supervision" },
  { nik: "25001040", name: "MURY AGUNG PRASETYA", title: "GROUB LEADER", role: "SUPERVISOR", dept: "Operations Supervision" },
  { nik: "25001710", name: "LAURENSIUS APRI PRASETYO CALDAS", title: "GROUB LEADER", role: "SUPERVISOR", dept: "Operations Supervision" },
  { nik: "25001776", name: "ANDI MUHAMMAD ALFERY", title: "GROUB LEADER", role: "SUPERVISOR", dept: "Operations Supervision" },
  { nik: "26002909", name: "BAMBY PRASETYO", title: "GROUB LEADER", role: "SUPERVISOR", dept: "Operations Supervision" },
  { nik: "81230177", name: "SRIYANTO", title: "ADMIN", role: "SUPERVISOR", dept: "Operations Administration" }
];

window.getAppUsers = function() {
  const stored = localStorage.getItem('voltswap_users_list');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch(e) {}
  }
  // Simpan initial list jika belum ada
  localStorage.setItem('voltswap_users_list', JSON.stringify(OPERATOR_USERS));
  return [...OPERATOR_USERS];
};

window.saveAppUsers = function(list) {
  localStorage.setItem('voltswap_users_list', JSON.stringify(list));
};

let currentAuthUser = null;

function getSavedAuthUser() {
  const stored = localStorage.getItem('voltswap_auth_user');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.nik) {
        if (!parsed.shift) parsed.shift = localStorage.getItem('voltswap_shift') || "1";
        if (!parsed.date) parsed.date = localStorage.getItem('voltswap_date') || new Date().toISOString().split('T')[0];
        return parsed;
      }
    } catch (e) {}
  }
  // Default to first operator in list: ZAKARIYA ABIDIN
  return {
    nik: "81230529",
    name: "ZAKARIYA ABIDIN",
    role: "OPERATOR",
    location: localStorage.getItem('voltswap_location') || "ROOM A1",
    shift: localStorage.getItem('voltswap_shift') || "1",
    category: localStorage.getItem('voltswap_category') || "CHARGING SWAP",
    date: localStorage.getItem('voltswap_date') || new Date().toISOString().split('T')[0]
  };
}

function applyAuthUserSession(user) {
  currentAuthUser = { ...user };
  activeLocation = user.location || 'ROOM A1';
  const activeShift = user.shift || '1';
  const activeCategory = user.category || localStorage.getItem('voltswap_category') || 'CHARGING SWAP';
  const activeDate = user.date || localStorage.getItem('voltswap_date') || new Date().toISOString().split('T')[0];
  currentAuthUser.date = activeDate;
  currentAuthUser.category = activeCategory;
  localStorage.setItem('voltswap_auth_user', JSON.stringify(currentAuthUser));
  localStorage.setItem('voltswap_location', activeLocation);
  localStorage.setItem('voltswap_shift', activeShift);
  localStorage.setItem('voltswap_category', activeCategory);
  localStorage.setItem('voltswap_date', activeDate);

  // 1. Header elements
  const topName = document.getElementById('topUserDisplayName');
  const topNikRole = document.getElementById('topUserNikRole');
  const topBadge = document.getElementById('topStationBadge');

  if (topName) topName.textContent = user.name;
  if (topNikRole) topNikRole.textContent = `NIK: ${user.nik} | ${user.role}`;
  if (topBadge) {
    const isSmallScreen = window.innerWidth <= 600;
    topBadge.textContent = isSmallScreen ? `${user.location} • S${activeShift}` : `${user.location} • SHIFT ${activeShift}`;
  }

  // Sidebar drawer user identity
  const sideName = document.getElementById('sidebarUserName');
  const sideNikRole = document.getElementById('sidebarUserNikRole');
  const sidePill = document.getElementById('sidebarStationPill');
  if (sideName) sideName.textContent = user.name;
  if (sideNikRole) sideNikRole.textContent = `NIK: ${user.nik} • ${user.role}`;
  if (sidePill) sidePill.textContent = `${user.location} • S${activeShift}`;

  // 2. Input Data view identity banner
  const formOpName = document.getElementById('formDedOperatorName');
  const formOpNik = document.getElementById('formDedOperatorNik');
  const formOpRole = document.getElementById('formDedOperatorRole');
  const formOpShift = document.getElementById('formDedOperatorShift');
  const formOpLoc = document.getElementById('formDedOperatorLoc');
  const dedSwapLoc = document.getElementById('dedSwapLoc');
  const dedSwapShift = document.getElementById('dedSwapShift');
  const dedSwapDate = document.getElementById('dedSwapDate');

  if (formOpName) formOpName.textContent = user.name;
  if (formOpNik) formOpNik.textContent = `(${user.nik})`;
  if (formOpRole) {
    formOpRole.textContent = user.role;
    formOpRole.className = `status-pill ${user.role === 'SUPERVISOR' ? 'blue' : 'green'}`;
  }
  if (formOpShift) {
    formOpShift.textContent = `SHIFT ${activeShift}`;
    formOpShift.className = `status-pill ${activeShift === '2' ? 'amber' : 'purple'}`;
  }
  if (formOpLoc) {
    formOpLoc.textContent = `🏢 ${user.location === 'SUPERVISOR' ? 'ROOM A1' : user.location}`;
  }
  if (dedSwapLoc) {
    dedSwapLoc.value = (user.location === 'SUPERVISOR') ? 'ROOM A1' : user.location;
  }
  if (dedSwapShift) {
    dedSwapShift.value = activeShift;
  }
  const dedSwapShiftDisplay = document.getElementById('dedSwapShiftDisplay');
  if (dedSwapShiftDisplay) {
    dedSwapShiftDisplay.value = `Shift ${activeShift}`;
  }
  if (dedSwapDate) {
    dedSwapDate.value = activeDate;
    dedSwapDate.readOnly = true;
  }
  const dedSwapCategory = document.getElementById('dedSwapCategory');
  const dedSwapCategoryDisplay = document.getElementById('dedSwapCategoryDisplay');
  if (dedSwapCategory) dedSwapCategory.value = activeCategory;
  if (dedSwapCategoryDisplay) dedSwapCategoryDisplay.value = activeCategory;

  // 3. Filter and Add modal defaults
  const filterLoc = document.getElementById('filterLocationSelect');
  const newSwapLoc = document.getElementById('newSwapLoc');
  const newSwapShift = document.getElementById('newSwapShift');
  const addProbShift = document.getElementById('addProbShift');
  if (filterLoc) {
    filterLoc.value = (user.location === 'SUPERVISOR') ? 'ALL' : user.location;
  }
  if (newSwapLoc) {
    newSwapLoc.value = (user.location === 'SUPERVISOR') ? 'ROOM A1' : user.location;
  }
  if (newSwapShift) {
    newSwapShift.value = activeShift;
  }
  if (addProbShift) {
    addProbShift.value = activeShift;
  }

  // 4. Pembatasan Hak Akses Menu Berdasarkan Role
  const isPrivilegedUser = (user.role === 'SUPERVISOR' ||
    String(user.title || '').toUpperCase().includes('LEADER') ||
    String(user.title || '').toUpperCase().includes('ADMIN') ||
    String(user.title || '').toUpperCase().includes('SUPERVISOR'));

  const sidebarItemDb = document.getElementById('sidebarItemDatabase');
  if (sidebarItemDb) {
    sidebarItemDb.style.display = isPrivilegedUser ? '' : 'none';
  }

  // Jika sedang login sebagai Operator biasa tetapi layar aktif berada di Database Manager, kembalikan ke Transaksi Swap
  const viewDatabase = document.getElementById('viewDatabaseManager');
  if (!isPrivilegedUser && viewDatabase && viewDatabase.style.display !== 'none') {
    viewDatabase.style.display = 'none';
    const viewSwap = document.getElementById('viewSwapTransaction');
    if (viewSwap) viewSwap.style.display = 'block';
    const linkSwap = document.getElementById('sublinkSwap');
    if (linkSwap) linkSwap.classList.add('active');
    const itemOp = document.getElementById('menuOperation')?.closest('.sidebar-item');
    if (itemOp) {
      itemOp.classList.add('open');
      itemOp.classList.add('active');
    }
  }

  const sublinkDashboard = document.getElementById('sublinkDashboard');
  const sidebarItemPopulasi = document.getElementById('sidebarItemPopulasi');
  if (sublinkDashboard) sublinkDashboard.style.display = '';
  if (sidebarItemPopulasi) sidebarItemPopulasi.style.display = '';

  currentPage = 1;
  renderMainTable();
  updateSummaryCard();
}

function initOperatorAuthModal() {
  const nikInput = document.getElementById('loginNikInput');
  const userNameInput = document.getElementById('loginUserName');
  const statusBadge = document.getElementById('loginNikStatusBadge');
  const accessDesc = document.getElementById('loginAccessDesc');
  const stationSelect = document.getElementById('loginStationSelect');
  const shiftSelect = document.getElementById('loginShiftSelect');
  const optSpv = document.getElementById('optStationSpv');
  const btnSubmit = document.getElementById('btnLoginSubmit');
  const form = document.getElementById('formOperatorLogin');

  // Live NIK validation & auto-fill name
  function checkNikMatch(val) {
    const cleanNik = (val || '').trim();
    const matched = OPERATOR_USERS.find(u => u.nik === cleanNik);

    if (matched) {
      // Auto-fill employee name
      if (userNameInput) userNameInput.value = matched.name;
      
      if (statusBadge) {
        statusBadge.style.background = '#dcfce7';
        statusBadge.style.color = '#166534';
        statusBadge.style.borderColor = '#bbf7d0';
        statusBadge.innerHTML = `<span>✅</span> <span>Terverifikasi: <strong>${matched.name}</strong> (${matched.role})</span>`;
      }

      if (matched.role === 'SUPERVISOR') {
        if (optSpv) optSpv.style.display = '';
        if (stationSelect) stationSelect.value = 'SUPERVISOR';
        if (accessDesc) {
          accessDesc.innerHTML = `🌟 <strong style="color:#00a65a;">Akses Penuh Supervisor:</strong> Semua menu terbuka termasuk Visual Analytics & KPI serta Populasi Unit EV.`;
        }
      } else {
        if (optSpv) optSpv.style.display = 'none';
        if (stationSelect && stationSelect.value === 'SUPERVISOR') {
          stationSelect.value = 'ROOM A1';
        }
        if (accessDesc) {
          accessDesc.innerHTML = `• <strong>Input Data</strong>: Terbuka (Formulir Digital Logsheet)<br>• <strong>Operation</strong>: Terbuka (Charging Swap, History Daily, Problem Log)<br><span style="color:#b91c1c;">• Visual Analytics & KPI, Populasi: <em>Terkunci khusus Supervisor</em></span>`;
        }
      }

      if (btnSubmit) btnSubmit.disabled = false;
    } else {
      if (userNameInput) userNameInput.value = '';
      if (statusBadge) {
        if (cleanNik.length === 0) {
          statusBadge.style.background = '#fef3c7';
          statusBadge.style.color = '#92400e';
          statusBadge.style.borderColor = '#fde68a';
          statusBadge.innerHTML = `<span>⏳</span> <span>Silakan masukkan 8 digit NIK atau klik daftar di atas</span>`;
        } else {
          statusBadge.style.background = '#fee2e2';
          statusBadge.style.color = '#991b1b';
          statusBadge.style.borderColor = '#fecaca';
          statusBadge.innerHTML = `<span>❌</span> <span>NIK "${cleanNik}" tidak terdaftar dalam database operator</span>`;
        }
      }
      if (btnSubmit) btnSubmit.disabled = true;
    }
  }

  if (nikInput) {
    nikInput.addEventListener('input', (e) => checkNikMatch(e.target.value));
    nikInput.addEventListener('change', (e) => checkNikMatch(e.target.value));
  }

  // Pre-fill modal fields when opened
  window.syncLoginModalWithUser = function() {
    if (!currentAuthUser) return;
    if (nikInput) {
      nikInput.value = currentAuthUser.nik;
      checkNikMatch(currentAuthUser.nik);
    }
    if (stationSelect) stationSelect.value = currentAuthUser.location || 'ROOM A1';
    if (shiftSelect) shiftSelect.value = currentAuthUser.shift || '1';
  };

  // Form submission
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const enteredNik = nikInput ? nikInput.value.trim() : '';
      const matched = OPERATOR_USERS.find(u => u.nik === enteredNik);
      if (!matched) {
        showToast('NIK tidak valid / belum terdaftar', 'danger');
        return;
      }

      const selectedLoc = stationSelect ? stationSelect.value : 'ROOM A1';
      const selectedShift = shiftSelect ? shiftSelect.value : '1';

      const userSession = {
        nik: matched.nik,
        name: matched.name,
        role: matched.role,
        location: selectedLoc,
        shift: selectedShift
      };

      applyAuthUserSession(userSession);
      closeModal('modalLocationLogin');
      showToast(`Login Berhasil! Selamat bertugas, ${matched.name} (${selectedLoc})`, 'success');
    });
  }
}

// =============================================================================
// DEDICATED SPLIT-CARD LOGIN PORTAL (PPA SAFE & STRONG)
// Matches Reference Design Mockup
// =============================================================================

function initSplitCardLogin() {
  const portalScreen = document.getElementById('loginPortalScreen');
  const radNonSch = document.getElementById('optModeNonSchedule');
  const radSch = document.getElementById('optModeSchedule');
  const lblNonSch = document.getElementById('lblModeNonSchedule');
  const lblSch = document.getElementById('lblModeSchedule');
  const badgeSchMode = document.getElementById('loginScheduleModeBadge');
  const descSchMode = document.getElementById('loginScheduleModeDesc');

  function updateLoginModeUI(mode) {
    if (mode === 'ON') {
      if (lblSch) lblSch.classList.add('active');
      if (lblNonSch) lblNonSch.classList.remove('active');
      if (badgeSchMode) {
        badgeSchMode.innerHTML = '<span class="badge-dot">●</span> SCHEDULE';
        badgeSchMode.className = 'mode-status-badge schedule';
      }
      if (descSchMode) {
        descSchMode.innerHTML = '<span class="note-icon">⏱️</span><span class="note-text"><strong>Mode Schedule Aktif:</strong> Jam kedatangan unit otomatis dikomparasikan dengan target jadwal.</span>';
      }
    } else {
      if (lblNonSch) lblNonSch.classList.add('active');
      if (lblSch) lblSch.classList.remove('active');
      if (badgeSchMode) {
        badgeSchMode.innerHTML = '<span class="badge-dot">●</span> ON-DEMAND';
        badgeSchMode.className = 'mode-status-badge ondemand';
      }
      if (descSchMode) {
        descSchMode.innerHTML = '<span class="note-icon">💡</span><span class="note-text"><strong>On-Demand (Default):</strong> Pencatatan langsung tanpa komparasi jadwal operasional.</span>';
      }
    }
  }

  if (radNonSch && radSch) {
    radNonSch.addEventListener('change', () => { if (radNonSch.checked) updateLoginModeUI('OFF'); });
    radSch.addEventListener('change', () => { if (radSch.checked) updateLoginModeUI('ON'); });
  }

  const savedMode = localStorage.getItem('voltswap_schedule_mode') || 'OFF';
  if (savedMode === 'ON' && radSch) {
    radSch.checked = true;
    updateLoginModeUI('ON');
  } else if (radNonSch) {
    radNonSch.checked = true;
    updateLoginModeUI('OFF');
  }

  const nikInput = document.getElementById('splitLoginNik');
  const dateInput = document.getElementById('splitLoginDate');
  const stationSelect = document.getElementById('splitLoginStation');
  const shiftSelect = document.getElementById('splitLoginShift');
  const categorySelect = document.getElementById('splitLoginCategory');
  const optSpv = document.getElementById('splitOptStationSpv');
  const pwdInput = document.getElementById('splitLoginPassword');
  const btnTogglePwd = document.getElementById('btnToggleSplitPassword');
  const btnSubmit = document.getElementById('btnSplitLoginSubmit');
  const indicator = document.getElementById('splitNikAutoResult');
  const form = document.getElementById('formSplitCardLogin');

  // Toggle Password Visibility
  if (btnTogglePwd && pwdInput) {
    btnTogglePwd.addEventListener('click', () => {
      const isPwd = pwdInput.type === 'password';
      pwdInput.type = isPwd ? 'text' : 'password';
      btnTogglePwd.textContent = isPwd ? '🙈' : '👁️';
    });
  }

  // Flexible Operator User Resolver (Handles raw 8 digits, spaces, or datalist label strings)
  function findOperatorUser(val) {
    if (!val) return null;
    const raw = String(val).trim();
    if (!raw) return null;
    const userList = (typeof window.getAppUsers === 'function') ? window.getAppUsers() : OPERATOR_USERS;

    // 1. Direct match by NIK
    let match = userList.find(u => u.nik === raw);
    if (match) return match;

    // 2. Extract first 8-digit sequence (e.g. from datalist "81230529 - ZAKARIYA ABIDIN")
    const digitMatch = raw.match(/\b\d{8}\b/);
    if (digitMatch) {
      match = userList.find(u => u.nik === digitMatch[0]);
      if (match) return match;
    }

    // 3. Match if raw string starts with user's NIK
    match = userList.find(u => raw.startsWith(u.nik));
    if (match) return match;

    // 4. Case-insensitive name match
    const upper = raw.toUpperCase();
    match = userList.find(u => upper.includes(u.name.toUpperCase()));
    if (match) return match;

    return null;
  }

  function checkCanSubmit() {
    // Keep button active on mobile so user receives instant validation feedback on tap
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.removeAttribute('disabled');
    }
  }

  // Live NIK validation & Auto Detection
  function checkSplitNik(val) {
    const matched = findOperatorUser(val);

    if (matched) {
      if (indicator) {
        indicator.style.display = 'flex';
        indicator.className = 'nik-auto-indicator success';
        const isSpv = (matched.role === 'SUPERVISOR');
        const roleLabel = matched.title || matched.role;
        indicator.innerHTML = `
          <span style="font-size: 13px;">✅</span>
          <div class="indicator-body" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span>Terverifikasi: <strong style="color: #15803d;">${matched.name}</strong></span>
            <span class="indicator-role-tag" style="background: ${isSpv ? '#dbeafe' : '#dcfce7'}; color: ${isSpv ? '#1d4ed8' : '#15803d'}; border: 1px solid ${isSpv ? '#93c5fd' : '#86efac'}; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px;">${roleLabel}</span>
          </div>
        `;
      }

      if (matched.role === 'SUPERVISOR') {
        if (optSpv) optSpv.style.display = '';
        if (stationSelect && !stationSelect.value) {
          stationSelect.value = 'SUPERVISOR';
        }
      } else {
        if (optSpv) optSpv.style.display = 'none';
        if (stationSelect && stationSelect.value === 'SUPERVISOR') {
          stationSelect.value = 'ROOM A1';
        }
      }
    } else {
      if (indicator) {
        const cleanVal = (val || '').trim();
        if (cleanVal.length === 0) {
          indicator.style.display = 'flex';
          indicator.className = 'nik-auto-indicator';
          indicator.innerHTML = `<span>ℹ️</span> <span>Ketik 8 digit NIK karyawan Anda</span>`;
        } else {
          indicator.style.display = 'flex';
          indicator.className = 'nik-auto-indicator error';
          indicator.innerHTML = `<span>❌</span> <span>NIK "${cleanVal}" tidak terdaftar dalam database</span>`;
        }
      }
    }
    checkCanSubmit();
  }

  if (nikInput) {
    nikInput.addEventListener('input', (e) => checkSplitNik(e.target.value));
    nikInput.addEventListener('change', (e) => {
      checkSplitNik(e.target.value);
      const matched = findOperatorUser(e.target.value);
      if (matched && nikInput.value !== matched.nik) {
        nikInput.value = matched.nik;
      }
    });
  }
  if (stationSelect) {
    stationSelect.addEventListener('change', checkCanSubmit);
  }
  if (shiftSelect) {
    shiftSelect.addEventListener('change', checkCanSubmit);
  }
  if (categorySelect) {
    categorySelect.addEventListener('change', checkCanSubmit);
  }

  // Open Screen & Pre-fill function (Starts completely clean & empty)
  window.openSplitLoginScreen = function() {
    document.documentElement.classList.add('needs-login');
    if (portalScreen) {
      portalScreen.classList.remove('portal-hidden');
      portalScreen.classList.add('portal-active');
      portalScreen.style.setProperty('display', 'flex', 'important');
      portalScreen.style.setProperty('opacity', '1', 'important');
      portalScreen.style.setProperty('visibility', 'visible', 'important');
      portalScreen.style.setProperty('pointer-events', 'auto', 'important');
    }
    if (nikInput) nikInput.value = '';
    if (pwdInput) pwdInput.value = '';
    if (indicator) {
      indicator.style.display = 'flex';
      indicator.className = 'nik-auto-indicator';
      indicator.innerHTML = '<span>ℹ️</span> <span>Ketik 8 digit NIK karyawan Anda</span>';
    }
    // Kosongkan tanggal agar dipilih manual oleh user dari dropdown
    if (dateInput) {
      dateInput.value = '';
    }
    // Kosongkan lokasi, shift & kategori agar pengguna memilih manual dari dropdown
    if (stationSelect) stationSelect.value = '';
    if (shiftSelect) shiftSelect.value = '';
    if (categorySelect) categorySelect.value = '';
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.removeAttribute('disabled');
    }
  };

  // Close Screen function (Seamless zero-flicker hide on both desktop and mobile)
  window.closeSplitLoginScreen = function() {
    document.documentElement.classList.remove('needs-login');
    if (portalScreen) {
      portalScreen.classList.remove('portal-active');
      portalScreen.classList.add('portal-hidden');
      portalScreen.style.setProperty('display', 'none', 'important');
      portalScreen.style.setProperty('opacity', '0', 'important');
      portalScreen.style.setProperty('visibility', 'hidden', 'important');
      portalScreen.style.setProperty('pointer-events', 'none', 'important');
    }
  };

  // Logout function
  window.logoutUserSession = function() {
    localStorage.removeItem('voltswap_is_logged_in');
    window.openSplitLoginScreen();
    showToast('Anda telah keluar dari sesi kerja.', 'info');
  };

  function getUserPassword(nik) {
    const cleanNik = String(nik || '').trim();
    try {
      const dbUsers = (typeof window.getAppUsers === 'function') ? window.getAppUsers() : [];
      const u = dbUsers.find(x => String(x.nik).trim() === cleanNik);
      if (u && u.password) return String(u.password).trim();
    } catch (e) {}

    try {
      const gasUsers = JSON.parse(localStorage.getItem('voltswap_gas_users') || '[]');
      const gu = gasUsers.find(u => String(u.nik).trim() === cleanNik);
      if (gu && gu.password) return String(gu.password).trim();
    } catch (e) {}

    const op = OPERATOR_USERS.find(u => String(u.nik).trim() === cleanNik);
    if (op && op.password) return String(op.password).trim();

    return cleanNik; // Fallback: password default adalah NIK
  }

  // Dedicated Login Action Handler
  function handleLoginAction(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const rawNik = nikInput ? nikInput.value : '';
    const matched = findOperatorUser(rawNik);
    if (!matched) {
      showToast('Silakan masukkan NIK operator yang valid (contoh: 81230529)!', 'danger');
      if (nikInput) {
        nikInput.focus();
      }
      return;
    }

    const selectedDate = dateInput ? dateInput.value : '';
    if (!selectedDate) {
      showToast('Silakan tentukan tanggal operasional terlebih dahulu!', 'warning');
      if (dateInput) dateInput.focus();
      return;
    }

    const selectedLoc = stationSelect ? stationSelect.value : '';
    const selectedShift = shiftSelect ? shiftSelect.value : '';
    if (!selectedLoc) {
      showToast('Silakan pilih lokasi stasiun kerja terlebih dahulu!', 'warning');
      if (stationSelect) stationSelect.focus();
      return;
    }
    if (!selectedShift) {
      showToast('Silakan pilih shift kerja terlebih dahulu!', 'warning');
      if (shiftSelect) shiftSelect.focus();
      return;
    }

    const selectedCategory = categorySelect ? categorySelect.value : '';
    if (!selectedCategory) {
      showToast('Silakan pilih kategori operasional (CHARGING SWAP atau CHARGING PILE) terlebih dahulu!', 'warning');
      if (categorySelect) categorySelect.focus();
      return;
    }

    // 6. WAJIB ISI PASSWORD & VALIDASI DATABASE
    const enteredPassword = (pwdInput ? pwdInput.value : '').trim();
    if (!enteredPassword) {
      showToast('Silakan masukkan password akun Anda terlebih dahulu!', 'warning');
      if (pwdInput) pwdInput.focus();
      return;
    }

    const radSch = document.getElementById('optModeSchedule');
    const selectedScheduleMode = (radSch && radSch.checked) ? 'ON' : 'OFF';
    localStorage.setItem('voltswap_schedule_mode', selectedScheduleMode);

    function completeLoginSuccess() {
      const userSession = {
        nik: matched.nik,
        name: matched.name,
        role: matched.role,
        date: selectedDate,
        location: selectedLoc,
        shift: selectedShift,
        category: selectedCategory,
        scheduleMode: selectedScheduleMode
      };

      localStorage.setItem('voltswap_is_logged_in', 'true');
      applyAuthUserSession(userSession);
      window.closeSplitLoginScreen();
      const modeText = (selectedScheduleMode === 'ON') ? '⏱️ Mode Schedule' : '⚡ On-Demand';
      showToast(`Selamat datang, ${matched.name}! Tanggal: ${formatDateDisplay(selectedDate)} • ${selectedCategory} • Lokasi: ${selectedLoc} • Shift: ${selectedShift} • ${modeText}`, 'success');

      if (typeof gasSync !== 'undefined' && typeof gasSync.loadAll === 'function') {
        gasSync.loadAll();
      }
    }

    // Verifikasi Password ke Database Google Sheets
    const expectedPassword = getUserPassword(matched.nik);

    if (IS_GAS_ENV) {
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Memverifikasi password...';
      }
      google.script.run
        .withSuccessHandler(function(res) {
          if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Masuk ke Aplikasi';
          }
          if (res && res.status === 'success') {
            completeLoginSuccess();
          } else {
            showToast('❌ ' + (res ? res.message : 'Password salah! Silakan periksa kembali.'), 'danger');
            if (pwdInput) {
              pwdInput.value = '';
              pwdInput.focus();
            }
          }
        })
        .withFailureHandler(function(err) {
          if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Masuk ke Aplikasi';
          }
          // Fallback lokal jika terjadi gangguan koneksi GAS
          if (enteredPassword === expectedPassword) {
            completeLoginSuccess();
          } else {
            showToast('❌ Password salah! Silakan periksa kembali.', 'danger');
            if (pwdInput) {
              pwdInput.value = '';
              pwdInput.focus();
            }
          }
        })
        .apiValidateLogin(matched.nik, enteredPassword);
    } else {
      // Local mode validation
      if (enteredPassword === expectedPassword) {
        completeLoginSuccess();
      } else {
        showToast('❌ Password salah! Silakan periksa kembali.', 'danger');
        if (pwdInput) {
          pwdInput.value = '';
          pwdInput.focus();
        }
      }
    }
  }

  // Form Submit & Button Click
  if (form) {
    form.addEventListener('submit', handleLoginAction);
  }
  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.removeAttribute('disabled');
    btnSubmit.addEventListener('click', handleLoginAction);
  }

  // Check login state on initial boot
  const isLoggedIn = (localStorage.getItem('voltswap_is_logged_in') === 'true');
  if (!isLoggedIn) {
    window.openSplitLoginScreen();
  } else {
    window.closeSplitLoginScreen();
  }
}

// Backward-compatible fallback
window.selectLocationSession = function(loc) {
  if (currentAuthUser) {
    currentAuthUser.location = loc;
    applyAuthUserSession(currentAuthUser);
  }
  closeModal('modalLocationLogin');
  showToast(`Sesi stasiun dialihkan ke: ${loc}`, 'success');
};


// =============================================================================
// 3. NAVIGATION & VIEW SWITCHING
// =============================================================================

function initNavigation() {
  // Sidebar Toggle (Desktop Collapse / Mobile Drawer)
  const toggleBtn = document.getElementById('btnToggleSidebar');
  const sidebar = document.getElementById('mainSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');

  function closeMobileSidebar() {
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('active');
  }

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.innerWidth <= 768) {
        sidebar.classList.toggle('mobile-open');
        if (backdrop) backdrop.classList.toggle('active');
      } else {
        sidebar.classList.toggle('collapsed');
      }
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', closeMobileSidebar);
  }

  // Fitur Logout HANYA melalui tombol di dalam sidebar (dengan tampilan modal konfirmasi eksekutif)
  const btnSidebarLogout = document.getElementById('btnSidebarLogout');
  if (btnSidebarLogout) {
    btnSidebarLogout.addEventListener('click', () => {
      closeMobileSidebar();
      // Sinkronisasi nama dan stasiun pengguna ke dalam dialog konfirmasi
      const modalName = document.getElementById('logoutModalUserName');
      const modalLoc = document.getElementById('logoutModalUserStation');
      const modalShift = document.getElementById('logoutModalUserShift');

      if (currentAuthUser) {
        if (modalName) modalName.textContent = currentAuthUser.name;
        if (modalLoc) modalLoc.textContent = currentAuthUser.location || 'ROOM A1';
        if (modalShift) modalShift.textContent = `Shift ${currentAuthUser.shift || '1'}`;
      }

      openModal('modalConfirmLogout');
    });
  }

  // Tombol aksi di dalam modal konfirmasi logout
  const btnConfirmDoLogout = document.getElementById('btnConfirmDoLogout');
  if (btnConfirmDoLogout && !btnConfirmDoLogout.dataset.bound) {
    btnConfirmDoLogout.dataset.bound = 'true';
    btnConfirmDoLogout.addEventListener('click', () => {
      closeModal('modalConfirmLogout');
      if (window.logoutUserSession) window.logoutUserSession();
    });
  }

  // Sidebar links
  const linkInputData = document.getElementById('menuInputData');
  const sidebarItemInput = document.getElementById('sidebarItemInputData');
  const menuOp = document.getElementById('menuOperation');
  const itemOp = menuOp?.closest('.sidebar-item');
  const linkSwap = document.getElementById('sublinkSwap');
  const linkDaily = document.getElementById('sublinkHistoryDaily');
  const linkProb = document.getElementById('sublinkProblem');
  const linkDash = document.getElementById('sublinkDashboard');
  const linkPopulasi = document.getElementById('menuPopulasiUnit');
  const sidebarItemPop = document.getElementById('sidebarItemPopulasi');
  const linkDatabase = document.getElementById('menuDatabaseManager');
  const sidebarItemDb = document.getElementById('sidebarItemDatabase');

  const viewInput = document.getElementById('viewInputData');
  const viewSwap = document.getElementById('viewSwapTransaction');
  const viewDaily = document.getElementById('viewHistoryDaily');
  const viewProb = document.getElementById('viewProblemLog');
  const linkSchedule = document.getElementById('sublinkSchedule');
  const viewSchedule = document.getElementById('viewSwapSchedule');
  const viewDash = document.getElementById('viewAnalyticsDashboard');
  const viewPopulasi = document.getElementById('viewPopulasiUnit');
  const viewDatabase = document.getElementById('viewDatabaseManager');

  function hideAllViews() {
    if (viewInput) viewInput.style.display = 'none';
    if (viewSwap) viewSwap.style.display = 'none';
    if (viewDaily) viewDaily.style.display = 'none';
    if (viewProb) viewProb.style.display = 'none';
    if (viewSchedule) viewSchedule.style.display = 'none';
    if (viewDash) viewDash.style.display = 'none';
    if (viewPopulasi) viewPopulasi.style.display = 'none';
    if (viewDatabase) viewDatabase.style.display = 'none';

    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.treeview-link').forEach(l => l.classList.remove('active'));
  }

  // Click on Top-Level 'OPERATION' Menu -> Toggle Accordion with smooth animation
  // Click on Top-Level 'OPERATION' Menu -> Pastikan selalu terbuka dan aktif
  if (menuOp && itemOp) {
    menuOp.addEventListener('click', (e) => {
      e.preventDefault();
      itemOp.classList.add('open');
      itemOp.classList.add('active');
      if (sidebarItemInput) sidebarItemInput.classList.remove('active');
      if (sidebarItemPop) sidebarItemPop.classList.remove('active');

      const hasActiveSublink = document.querySelector('.sidebar-treeview .treeview-link.active');
      if (!hasActiveSublink) {
        linkSwap?.click();
      }
    });
  }

  if (linkInputData) {
    linkInputData.addEventListener('click', () => {
      hideAllViews();
      closeMobileSidebar();
      if (viewInput) viewInput.style.display = 'block';
      if (sidebarItemInput) sidebarItemInput.classList.add('active');
      // Tetap pertahankan sub-menu OPERATION selalu terbuka agar terlihat jelas
      if (itemOp) itemOp.classList.add('open');
      initDedicatedInputForm();
    });
  }

  if (linkSwap) {
    linkSwap.addEventListener('click', (e) => {
      e?.stopPropagation?.();
      hideAllViews();
      closeMobileSidebar();
      viewSwap.style.display = 'block';
      linkSwap.classList.add('active');
      if (itemOp) {
        itemOp.classList.add('open');
        itemOp.classList.add('active');
      }
      renderMainTable();
    });
  }

  if (linkDaily) {
    linkDaily.addEventListener('click', (e) => {
      e?.stopPropagation?.();
      hideAllViews();
      closeMobileSidebar();
      if (viewDaily) viewDaily.style.display = 'block';
      linkDaily.classList.add('active');
      if (itemOp) {
        itemOp.classList.add('open');
        itemOp.classList.add('active');
      }
      renderHistoryDaily();
    });
  }

  
  if (linkSchedule) {
    linkSchedule.addEventListener('click', (e) => {
      e?.stopPropagation?.();
      hideAllViews();
      closeMobileSidebar();
      if (viewSchedule) viewSchedule.style.display = 'block';
      linkSchedule.classList.add('active');
      if (itemOp) {
        itemOp.classList.add('open');
        itemOp.classList.add('active');
      }
      initScheduleModule();
    });
  }

  if (linkProb) {
    linkProb.addEventListener('click', (e) => {
      e?.stopPropagation?.();
      hideAllViews();
      closeMobileSidebar();
      viewProb.style.display = 'block';
      linkProb.classList.add('active');
      if (itemOp) {
        itemOp.classList.add('open');
        itemOp.classList.add('active');
      }
      renderProblemTable();
    });
  }

  if (linkDash) {
    linkDash.addEventListener('click', (e) => {
      e?.stopPropagation?.();
      hideAllViews();
      closeMobileSidebar();
      viewDash.style.display = 'block';
      linkDash.classList.add('active');
      if (itemOp) {
        itemOp.classList.add('open');
        itemOp.classList.add('active');
      }
      renderPpaExecutiveDashboard();
    });
  }

  if (linkPopulasi) {
    linkPopulasi.addEventListener('click', () => {
      hideAllViews();
      closeMobileSidebar();
      viewPopulasi.style.display = 'block';
      if (sidebarItemPop) sidebarItemPop.classList.add('active');
      if (itemOp) itemOp.classList.remove('open');
      renderUnitTable();
    });
  }

  if (linkDatabase) {
    linkDatabase.addEventListener('click', () => {
      const u = currentAuthUser || getSavedAuthUser();
      const isPrivileged = u && (u.role === 'SUPERVISOR' ||
        String(u.title || '').toUpperCase().includes('LEADER') ||
        String(u.title || '').toUpperCase().includes('ADMIN') ||
        String(u.title || '').toUpperCase().includes('SUPERVISOR'));

      if (!isPrivileged) {
        showToast('⛔ Akses Ditolak: Menu DATABASE MANAGER hanya dapat diakses oleh SUPERVISOR / LEADER / ADMIN!', 'danger');
        return;
      }

      hideAllViews();
      closeMobileSidebar();
      if (viewDatabase) viewDatabase.style.display = 'block';
      if (sidebarItemDb) sidebarItemDb.classList.add('active');
      if (itemOp) itemOp.classList.remove('open');
      if (typeof window.initDatabaseManagerModule === 'function') {
        window.initDatabaseManagerModule();
      }
    });
  }
}

// =============================================================================
// 4. MAIN DATA TABLE (CHARGING SWAP TRANSACTION) - CRUD & PAGINATION
// =============================================================================

let currentPage = 1;
let entriesPerPage = 10;
let filteredList = [];
let deleteRecordTargetId = null;

function initTableControls() {
  // Entries per page
  const selectEntries = document.getElementById('selectEntriesPerPage');
  if (selectEntries) {
    selectEntries.addEventListener('change', (e) => {
      entriesPerPage = parseInt(e.target.value) || 10;
      currentPage = 1;
      renderMainTable();
    });
  }

  // Live Table Search
  const searchInput = document.getElementById('inputTableSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      currentPage = 1;
      renderMainTable();
    });
  }

  // Searching Form Filter
  const btnShow = document.getElementById('btnApplySearchFilter');
  if (btnShow) {
    btnShow.addEventListener('click', () => {
      currentPage = 1;
      renderMainTable();
      showToast("Filter pencarian diterapkan", "success");
    });
  }

  const btnReset = document.getElementById('btnResetSearchFilter');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      const startEl = document.getElementById('filterStartDate');
      const endEl = document.getElementById('filterEndDate');
      const shiftEl = document.getElementById('filterShiftSelect');
      const locEl = document.getElementById('filterLocationSelect');
      const searchEl = document.getElementById('inputTableSearch');
      if (startEl) startEl.value = '';
      if (endEl) endEl.value = '';
      if (shiftEl) shiftEl.value = 'ALL';
      if (locEl) locEl.value = 'ALL';
      if (searchEl) searchEl.value = '';
      currentPage = 1;
      renderMainTable();
      showToast("Filter pencarian direset", "info");
    });
  }

  // Mobile View Mode Toggle (Cards vs Table)
  const btnCards = document.getElementById('btnToggleMobileCards');
  const btnTable = document.getElementById('btnToggleMobileTable');
  const cardsBox = document.getElementById('mobileCardsContainer');
  const tableBox = document.getElementById('tableResponsiveBox');

  if (btnCards && btnTable && cardsBox && tableBox) {
    btnCards.addEventListener('click', () => {
      btnCards.classList.add('active');
      btnTable.classList.remove('active');
      cardsBox.classList.remove('hide-mobile-cards');
      tableBox.classList.remove('force-table-show');
    });

    btnTable.addEventListener('click', () => {
      btnTable.classList.add('active');
      btnCards.classList.remove('active');
      cardsBox.classList.add('hide-mobile-cards');
      tableBox.classList.add('force-table-show');
    });
  }

  // Export Buttons
  const btnExpData = document.getElementById('btnExportData');
  if (btnExpData) btnExpData.addEventListener('click', exportFullCSV);

  const btnExpIPCU = document.getElementById('btnExportIPCU');
  if (btnExpIPCU) btnExpIPCU.addEventListener('click', exportSummaryCSV);

  // Add Transaction Modal
  const btnAdd = document.getElementById('btnOpenAddSwapModal');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      populateUnitSelects();
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('newSwapDate').value = today;
      document.getElementById('newSwapLoc').value = (activeLocation === 'SUPERVISOR') ? 'ROOM A1' : activeLocation;
      const now = new Date();
      document.getElementById('newSwapJamOut').value = now.toTimeString().split(' ')[0];
      const sixAgo = new Date(now.getTime() - 6 * 60000);
      document.getElementById('newSwapJamIn').value = sixAgo.toTimeString().split(' ')[0];
      openModal('modalAddSwap');
    });
  }

  // Form Submit Add Swap
  const formAdd = document.getElementById('formNewSwap');
  if (formAdd) {
    formAdd.addEventListener('submit', (e) => {
      e.preventDefault();
      const newId = generateNextSwapId();
      const shiftVal = document.getElementById('newSwapShift').value;
      const unitVal = document.getElementById('newSwapUnit').value;

      const isScheduleOn = (localStorage.getItem('voltswap_schedule_mode') === 'ON');
      let calculatedStatus = 'On Demand';
      let calculatedTimeSch = '-';

      if (isScheduleOn) {
        const match = schedulesData.find(s => s.unit === unitVal && String(s.shift) === String(shiftVal));
        if (match) {
          calculatedTimeSch = match.timeSch;
          const jamInVal = document.getElementById('newSwapJamIn').value.trim();
          if (jamInVal) {
            const diffMins = calculateMinutesDifference(jamInVal, match.timeSch);
            calculatedStatus = (Math.abs(diffMins) <= 15) ? 'On Time' : 'Out Off Time';
          } else {
            calculatedStatus = 'On Time';
          }
        }
      }

      const formattedBatIn = formatBatteryPercentage(document.getElementById('newSwapBatIn').value || '-');
      const formattedBatOut = formatBatteryPercentage(document.getElementById('newSwapBatOut').value || '100%');

      const newRec = {
        id: newId,
        date: formatDateDisplay(document.getElementById('newSwapDate').value),
        shift: shiftVal,
        category: 'CHARGING SWAP',
        location: document.getElementById('newSwapLoc').value,
        unit: unitVal,
        hm: document.getElementById('newSwapHM').value || '-',
        batteryBefore: formattedBatIn,
        jamIn: document.getElementById('newSwapJamIn').value,
        batteryAfter: formattedBatOut,
        jamOut: document.getElementById('newSwapJamOut').value,
        durationMin: 6,
        energyKwh: parseFloat(document.getElementById('newSwapEnergy').value) || 0,
        statusRemark: calculatedStatus,
        problemRemark: document.getElementById('newSwapRemark2').value,
        operator: currentAuthUser ? currentAuthUser.name : 'ZAKARIYA ABIDIN',
        operatorNik: currentAuthUser ? currentAuthUser.nik : '81230529',
        timeSch: calculatedTimeSch
      };

      swapsData.unshift(newRec);
      persistData();
      closeModal('modalAddSwap');
      showToast(`Transaksi ${newId} berhasil ditambahkan!`, 'success');
    });
  }

  // Form Submit Edit Record
  const formEdit = document.getElementById('formEditRecord');
  if (formEdit) {
    formEdit.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = document.getElementById('editId').value;
      const rec = swapsData.find(s => s.id === id);
      if (rec) {
        rec.date = formatDateDisplay(document.getElementById('editDate').value);
        rec.shift = document.getElementById('editShift').value;
        rec.location = document.getElementById('editLocation').value;
        rec.unit = document.getElementById('editUnit').value;
        rec.hm = document.getElementById('editHM').value;
        rec.energyKwh = parseFloat(document.getElementById('editEnergy').value) || 0;
        rec.jamIn = document.getElementById('editJamIn').value;
        rec.jamOut = document.getElementById('editJamOut').value;
        rec.batteryBefore = formatBatteryPercentage(document.getElementById('editBatIn').value);
        rec.batteryAfter = formatBatteryPercentage(document.getElementById('editBatOut').value);
        rec.statusRemark = document.getElementById('editStatus').value;
        rec.problemRemark = document.getElementById('editRemark').value;

        persistData();
        closeModal('modalEdit');
        showToast(`Data transaksi ${id} berhasil diperbarui!`, 'success');
      }
    });
  }

  // Delete Confirm Action
  const btnDelete = document.getElementById('btnDoDelete');
  if (btnDelete) {
    btnDelete.addEventListener('click', () => {
      if (deleteRecordTargetId) {
        const idToDelete = deleteRecordTargetId;
        swapsData = swapsData.filter(s => s.id !== idToDelete);
        persistData();
        closeModal('modalDelete');
        showToast(`Transaksi ${idToDelete} telah dihapus.`, 'warning');
        gasSync.deleteTransaction(idToDelete);
      }
    });
  }
}

function renderMainTable() {
  const tbody = document.getElementById('mainTableBody');
  if (!tbody) return;

  const searchQuery = (document.getElementById('inputTableSearch')?.value || '').toLowerCase().trim();
  const filterShift = document.getElementById('filterShiftSelect')?.value || 'ALL';
  const filterLoc = document.getElementById('filterLocationSelect')?.value || 'ALL';
  const filterStart = document.getElementById('filterStartDate')?.value || '';
  const filterEnd = document.getElementById('filterEndDate')?.value || '';

  filteredList = swapsData.filter(item => {
    const matchSearch = !searchQuery ||
                        (item.unit || '').toLowerCase().includes(searchQuery) ||
                        (item.id || '').toLowerCase().includes(searchQuery) ||
                        (item.operator || '').toLowerCase().includes(searchQuery) ||
                        (item.operatorNik || '').toLowerCase().includes(searchQuery) ||
                        (item.problemRemark || '').toLowerCase().includes(searchQuery) ||
                        (item.statusRemark || '').toLowerCase().includes(searchQuery);

    const matchShift = (filterShift === 'ALL') || (String(item.shift) === filterShift);
    const matchLoc = (filterLoc === 'ALL') || (item.location === filterLoc);

    let matchDate = true;
    if (filterStart || filterEnd) {
      const itemComp = parseDateComparable(item.date);
      if (itemComp) {
        if (filterStart && itemComp < filterStart) matchDate = false;
        if (filterEnd && itemComp > filterEnd) matchDate = false;
      }
    }

    return matchSearch && matchShift && matchLoc && matchDate;
  });

  const totalRecords = filteredList.length;
  const totalPages = Math.ceil(totalRecords / entriesPerPage) || 1;
  if (currentPage > totalPages) currentPage = totalPages;

  const startIdx = (currentPage - 1) * entriesPerPage;
  const pageItems = filteredList.slice(startIdx, startIdx + entriesPerPage);

  const endIdx = Math.min(startIdx + entriesPerPage, totalRecords);
  const infoEl = document.getElementById('tableRecordInfo');
  if (infoEl) {
    infoEl.textContent = totalRecords > 0 ? `Showing ${startIdx + 1} to ${endIdx} of ${totalRecords} entries` : 'No entries found';
  }

  tbody.innerHTML = '';

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="17" style="text-align:center; padding: 25px; color:#888;">Tidak ada data transaksi yang cocok dengan kriteria pencarian.</td></tr>`;
  } else {
    pageItems.forEach((row) => {
      const tr = document.createElement('tr');
      const isOnTime = (row.statusRemark === 'On Time');
      const formattedTxId = row.id.includes('DA01') ? row.id : `DA01/CHG/2026/SWAP/${row.id.replace('SWP-', '')}`;
      const isPile = (row.category || '').toUpperCase().includes('PILE');
      const catLabel = row.category || 'CHARGING SWAP';

      tr.innerHTML = `
        <td style="white-space: nowrap; text-align: center; vertical-align: middle;">
          <div style="font-weight: 700; color: #1e293b; font-size: 11.5px; letter-spacing: 0.01em; text-align: center;">${row.operator || 'ZAKARIYA ABIDIN'}</div>
          <div style="font-size: 9.5px; color: #64748b; font-family: var(--font-mono); text-align: center;">${row.operatorNik ? 'NIK: ' + row.operatorNik : '81230529'}</div>
        </td>
        <td style="font-family: var(--font-mono); font-weight:600; color: #0b5394; text-align: center; vertical-align: middle;">${formattedTxId}</td>
        <td style="text-align: center; vertical-align: middle;">
          <span class="badge-cat-table ${isPile ? 'pile' : ''}">${catLabel}</span>
        </td>
        <td style="text-align: center; vertical-align: middle;"><strong>DT ${row.unit}</strong></td>
        <td style="text-align: center; vertical-align: middle;">${row.date}</td>
        <td style="text-align: center; vertical-align: middle;">${row.shift}</td>
        <td style="font-family: var(--font-mono); text-align: center; vertical-align: middle;">${row.jamIn}</td>
        <td style="font-family: var(--font-mono); text-align: center; vertical-align: middle;">${row.jamOut}</td>
        <td style="text-align: center; vertical-align: middle;">${row.durationMin}</td>
        <td style="text-align: center; font-weight:600; color:#00a65a; vertical-align: middle;">${Number(row.energyKwh).toLocaleString()}</td>
        <td style="font-family: var(--font-mono); text-align: center; vertical-align: middle;">${row.hm || '-'}</td>
        <td style="color:#d32f2f; font-weight:600; text-align: center; vertical-align: middle;">${formatBatteryPercentage(row.batteryBefore)}</td>
        <td style="color:#00a65a; font-weight:600; text-align: center; vertical-align: middle;">${formatBatteryPercentage(row.batteryAfter)}</td>
        <td style="text-align: center; vertical-align: middle;"><span style="font-weight:600;">${row.location}</span></td>
        <td style="text-align: center; vertical-align: middle;"><span class="status-tag ${isOnTime ? 'ontime' : 'outtime'}">${row.statusRemark}</span></td>
        <td style="font-size:11px; color:#666; text-align: center; vertical-align: middle;">${row.problemRemark}</td>
        <td style="text-align: center; vertical-align: middle;">
          <div class="table-actions-cell" style="justify-content: center;">
            <button class="btn-tbl-action view" title="Preview Detail" onclick="previewRecord('${row.id}')">👁️</button>
            <button class="btn-tbl-action edit" title="Edit Transaksi" onclick="editRecord('${row.id}')">✏️</button>
            <button class="btn-tbl-action del" title="Hapus Transaksi" onclick="deletePrompt('${row.id}')">🗑️</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Render Mobile Cards View (Tampilan Khusus Smartphone yang Bersih & Elegan)
  const mobileCardsContainer = document.getElementById('mobileCardsContainer');
  if (mobileCardsContainer) {
    mobileCardsContainer.innerHTML = '';
    if (pageItems.length === 0) {
      mobileCardsContainer.innerHTML = `<div class="mobile-empty-alert">Tidak ada transaksi yang cocok dengan filter pencarian.</div>`;
    } else {
      pageItems.forEach((row) => {
        const isOnTime = (row.statusRemark === 'On Time');
        const formattedTxId = row.id.includes('DA01') ? row.id : `DA01/CHG/2026/SWAP/${row.id.replace('SWP-', '')}`;
        const card = document.createElement('div');
        card.className = 'mobile-swap-card';
        card.innerHTML = `
          <div class="m-card-header">
            <div class="m-card-unit">
              <span class="m-unit-icon">🚜</span>
              <strong class="m-unit-title">DT ${row.unit}</strong>
              <span class="m-loc-pill">${row.location}</span>
            </div>
            <span class="status-tag ${isOnTime ? 'ontime' : 'outtime'}">${row.statusRemark}</span>
          </div>

          <div class="m-card-body-grid">
            <div class="m-stat-row">
              <span class="m-stat-lbl">🕒 Jam Swap:</span>
              <span class="m-stat-val">${row.jamIn} - ${row.jamOut} <strong style="color:#0b5394;">(${row.durationMin} mnt)</strong></span>
            </div>
            <div class="m-stat-row">
              <span class="m-stat-lbl">🔋 SOC Baterai:</span>
              <span class="m-stat-val"><span style="color:#d32f2f;font-weight:700;">${formatBatteryPercentage(row.batteryBefore)}</span> ➔ <span style="color:#00a65a;font-weight:700;">${formatBatteryPercentage(row.batteryAfter)}</span></span>
            </div>
            <div class="m-stat-row">
              <span class="m-stat-lbl">⚡ Energi Terpakai:</span>
              <span class="m-stat-val" style="color:#008d4c;font-weight:700;">${Number(row.energyKwh).toLocaleString()} kWh</span>
            </div>
            <div class="m-stat-row">
              <span class="m-stat-lbl">👤 Manpower:</span>
              <span class="m-stat-val">${row.operator || 'ZAKARIYA ABIDIN'} • Shift ${row.shift} (HM: ${row.hm || '-'})</span>
            </div>
          </div>

          <div class="m-card-footer">
            <span class="m-card-txid">${formattedTxId}</span>
            <div class="m-card-btns">
              <button class="btn-m-action view" onclick="previewRecord('${row.id}')">👁️ Detail</button>
              <button class="btn-m-action edit" onclick="editRecord('${row.id}')">✏️ Edit</button>
              <button class="btn-m-action del" onclick="deletePrompt('${row.id}')">🗑️ Hapus</button>
            </div>
          </div>
        `;
        mobileCardsContainer.appendChild(card);
      });
    }
  }

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const container = document.getElementById('paginationContainer');
  if (!container) return;

  container.innerHTML = '';

  const prevBtn = document.createElement('button');
  prevBtn.className = `page-item-btn btn-page btn-nav-prev ${currentPage <= 1 ? 'disabled' : ''}`;
  prevBtn.innerHTML = '<span>‹</span> Prev';
  prevBtn.title = 'Halaman Sebelumnya';
  prevBtn.disabled = (currentPage <= 1);
  prevBtn.onclick = () => { if (currentPage > 1) { currentPage--; renderMainTable(); } };
  container.appendChild(prevBtn);

  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.className = `page-item-btn btn-page ${i === currentPage ? 'active' : ''}`;
    pageBtn.textContent = i;
    const targetP = i;
    pageBtn.onclick = () => { currentPage = targetP; renderMainTable(); };
    container.appendChild(pageBtn);
  }

  if (endPage < totalPages) {
    const dots = document.createElement('span');
    dots.className = 'pagination-ellipsis';
    dots.textContent = '...';
    container.appendChild(dots);

    const lastBtn = document.createElement('button');
    lastBtn.className = 'page-item-btn btn-page';
    lastBtn.textContent = totalPages;
    lastBtn.onclick = () => { currentPage = totalPages; renderMainTable(); };
    container.appendChild(lastBtn);
  }

  const nextBtn = document.createElement('button');
  nextBtn.className = `page-item-btn btn-page btn-nav-next ${currentPage >= totalPages ? 'disabled' : ''}`;
  nextBtn.innerHTML = 'Next <span>›</span>';
  nextBtn.title = 'Halaman Berikutnya';
  nextBtn.disabled = (currentPage >= totalPages);
  nextBtn.onclick = () => { if (currentPage < totalPages) { currentPage++; renderMainTable(); } };
  container.appendChild(nextBtn);
}

// =============================================================================
// 5. CRUD ACTION HANDLERS (SWAP)
// =============================================================================

window.previewRecord = function(id) {
  const rec = swapsData.find(s => s.id === id);
  if (!rec) return;

  const formattedTxId = rec.id.includes('DA01') ? rec.id : `DA01/CHG/2026/SWAP/${rec.id.replace('SWP-', '')}`;
  document.getElementById('pvId').textContent = formattedTxId;
  document.getElementById('pvDateShift').textContent = `${rec.date} (Shift ${rec.shift})`;
  document.getElementById('pvLoc').textContent = rec.location;
  document.getElementById('pvUnit').textContent = `DT ${rec.unit}`;
  document.getElementById('pvHM').textContent = rec.hm || '-';
  document.getElementById('pvTimes').textContent = `${rec.jamIn} s/d ${rec.jamOut}`;
  document.getElementById('pvDur').textContent = `${rec.durationMin} Menit`;
  document.getElementById('pvEnergy').textContent = `${Number(rec.energyKwh).toLocaleString()} kWh`;
  document.getElementById('pvBattery').textContent = `${formatBatteryPercentage(rec.batteryBefore)} ➔ ${formatBatteryPercentage(rec.batteryAfter)}`;
  document.getElementById('pvStatus').innerHTML = `<span class="status-tag ${rec.statusRemark === 'On Time' ? 'ontime' : 'outtime'}">${rec.statusRemark}</span>`;
  document.getElementById('pvRemark').textContent = rec.problemRemark;
  const pvKet = document.getElementById('pvKeterangan');
  if (pvKet) pvKet.textContent = rec.keterangan || '-';
  const pvOp = document.getElementById('pvOperator');
  if (pvOp) {
    pvOp.textContent = `${rec.operator || 'ZAKARIYA ABIDIN'} (NIK: ${rec.operatorNik || '81230529'})`;
  }

  openModal('modalPreview');
};

window.editRecord = function(id) {
  const rec = swapsData.find(s => s.id === id);
  if (!rec) return;

  populateUnitSelects();

  document.getElementById('editId').value = rec.id;
  
  let formattedDate = '2026-09-11';
  if (rec.date && rec.date.includes('/')) {
    const p = rec.date.split('/');
    if (p.length === 3) formattedDate = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
  }
  document.getElementById('editDate').value = formattedDate;
  document.getElementById('editShift').value = rec.shift;
  document.getElementById('editLocation').value = rec.location;
  document.getElementById('editUnit').value = rec.unit;
  document.getElementById('editHM').value = rec.hm || '';
  document.getElementById('editEnergy').value = rec.energyKwh;
  document.getElementById('editJamIn').value = rec.jamIn;
  document.getElementById('editJamOut').value = rec.jamOut;
  document.getElementById('editBatIn').value = formatBatteryPercentage(rec.batteryBefore);
  document.getElementById('editBatOut').value = formatBatteryPercentage(rec.batteryAfter);
  document.getElementById('editStatus').value = rec.statusRemark;
  document.getElementById('editRemark').value = rec.problemRemark;

  openModal('modalEdit');
};

window.deletePrompt = function(id) {
  deleteRecordTargetId = id;
  const formattedTxId = id.includes('DA01') ? id : `DA01/CHG/2026/SWAP/${id.replace('SWP-', '')}`;
  document.getElementById('delIdText').textContent = formattedTxId;
  openModal('modalDelete');
};

// =============================================================================
// 6. POPULASI UNIT EV - CRUD MASTER DATA
// =============================================================================

let currentUnitPage = 1;
let unitEntriesPerPage = 10;
let filteredUnits = [];
let deleteUnitTargetCode = null;

function initPopulasiUnitControls() {
  // Select entries per page
  const selectPerPage = document.getElementById('selectUnitPerPage');
  if (selectPerPage) {
    selectPerPage.addEventListener('change', (e) => {
      unitEntriesPerPage = parseInt(e.target.value) || 10;
      currentUnitPage = 1;
      renderUnitTable();
    });
  }

  // Live search & status filter
  const inputSearch = document.getElementById('inputUnitSearch');
  if (inputSearch) {
    inputSearch.addEventListener('input', () => {
      currentUnitPage = 1;
      renderUnitTable();
    });
  }

  const filterStatus = document.getElementById('filterUnitStatus');
  if (filterStatus) {
    filterStatus.addEventListener('change', () => {
      currentUnitPage = 1;
      renderUnitTable();
    });
  }

  // Add Unit button & form
  const btnAdd = document.getElementById('btnOpenAddUnitModal');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      document.getElementById('addUnitCode').value = '';
      document.getElementById('addUnitType').value = 'EV Dump Truck 90T';
      document.getElementById('addUnitStatus').value = 'Aktif';
      document.getElementById('addUnitNote').value = '';
      openModal('modalAddUnit');
    });
  }

  const formNewUnit = document.getElementById('formNewUnit');
  if (formNewUnit) {
    formNewUnit.addEventListener('submit', (e) => {
      e.preventDefault();
      const rawCode = document.getElementById('addUnitCode').value.trim();
      const cleanCode = rawCode.toUpperCase().replace('DT', '').trim();
      if (!cleanCode) return;

      if (fleetUnits.some(u => u.code === cleanCode)) {
        showToast(`Kode unit DT ${cleanCode} sudah ada dalam populasi!`, 'danger');
        return;
      }

      const newUnit = {
        code: cleanCode,
        type: document.getElementById('addUnitType').value || 'EV Dump Truck 90T',
        status: document.getElementById('addUnitStatus').value || 'Aktif',
        note: document.getElementById('addUnitNote').value || ''
      };

      fleetUnits.unshift(newUnit);
      saveFleet();
      closeModal('modalAddUnit');
      showToast(`Unit DT ${cleanCode} berhasil ditambahkan ke populasi!`, 'success');
      gasSync.addUnit(cleanCode);
    });
  }

  // Edit Unit form
  const formEditUnit = document.getElementById('formEditUnit');
  if (formEditUnit) {
    formEditUnit.addEventListener('submit', (e) => {
      e.preventDefault();
      const oldCode = document.getElementById('editUnitOldCode').value;
      const rawNewCode = document.getElementById('editUnitCode').value.trim();
      const cleanNewCode = rawNewCode.toUpperCase().replace('DT', '').trim();

      const unit = fleetUnits.find(u => u.code === oldCode);
      if (unit) {
        if (cleanNewCode !== oldCode && fleetUnits.some(u => u.code === cleanNewCode)) {
          showToast(`Kode unit DT ${cleanNewCode} sudah digunakan!`, 'danger');
          return;
        }

        if (cleanNewCode !== oldCode) {
          gasSync.deleteUnit(oldCode);
          gasSync.addUnit(cleanNewCode);
        }

        unit.code = cleanNewCode;
        unit.type = document.getElementById('editUnitType').value;
        unit.status = document.getElementById('editUnitStatus').value;
        unit.note = document.getElementById('editUnitNote').value;

        saveFleet();
        closeModal('modalEditUnit');
        showToast(`Data unit DT ${cleanNewCode} berhasil diperbarui!`, 'success');
      }
    });
  }

  // Delete Unit action
  const btnDoDelete = document.getElementById('btnDoDeleteUnit');
  if (btnDoDelete) {
    btnDoDelete.addEventListener('click', () => {
      if (deleteUnitTargetCode) {
        const codeToDelete = deleteUnitTargetCode;
        fleetUnits = fleetUnits.filter(u => u.code !== codeToDelete);
        saveFleet();
        closeModal('modalDeleteUnit');
        showToast(`Unit DT ${codeToDelete} telah dihapus dari populasi.`, 'warning');
        gasSync.deleteUnit(codeToDelete);
      }
    });
  }
}

function renderUnitTable() {
  const tbody = document.getElementById('unitTableBody');
  if (!tbody) return;

  const searchQuery = (document.getElementById('inputUnitSearch')?.value || '').toLowerCase().trim();
  const filterStatus = document.getElementById('filterUnitStatus')?.value || 'ALL';

  const swapStats = {};
  swapsData.forEach(s => {
    if (s.unit) {
      if (!swapStats[s.unit]) {
        swapStats[s.unit] = { count: 0, lastLoc: s.location, lastTime: s.jamOut };
      }
      swapStats[s.unit].count++;
    }
  });

  filteredUnits = fleetUnits.filter(u => {
    const matchSearch = u.code.toLowerCase().includes(searchQuery) ||
                        (u.type || '').toLowerCase().includes(searchQuery) ||
                        (u.note || '').toLowerCase().includes(searchQuery);
    const matchStatus = (filterStatus === 'ALL') || (u.status === filterStatus);
    return matchSearch && matchStatus;
  });

  const total = filteredUnits.length;
  const totalPages = Math.ceil(total / unitEntriesPerPage) || 1;
  if (currentUnitPage > totalPages) currentUnitPage = totalPages;

  const startIdx = (currentUnitPage - 1) * unitEntriesPerPage;
  const pageUnits = filteredUnits.slice(startIdx, startIdx + unitEntriesPerPage);

  const endIdx = Math.min(startIdx + unitEntriesPerPage, total);
  const infoEl = document.getElementById('unitRecordInfo');
  if (infoEl) {
    infoEl.textContent = total > 0 ? `Showing ${startIdx + 1} to ${endIdx} of ${total} entries` : 'No entries found';
  }

  tbody.innerHTML = '';
  if (pageUnits.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 25px; color:#888;">Tidak ada data unit yang cocok.</td></tr>`;
  } else {
    pageUnits.forEach((u, idx) => {
      const stats = swapStats[u.code] || { count: 0, lastLoc: '-', lastTime: '-' };
      const tr = document.createElement('tr');
      const isStandby = u.status === 'Standby';
      const isBD = u.status === 'Breakdown';

      tr.innerHTML = `
        <td style="text-align: center; color: #888;">${startIdx + idx + 1}</td>
        <td><strong style="color: #0b5394; font-size: 13px;">DT ${u.code}</strong></td>
        <td>${u.type}</td>
        <td>
          <span class="status-tag ${isStandby ? 'outtime' : (isBD ? 'outtime' : 'ontime')}">
            ${u.status}
          </span>
        </td>
        <td style="text-align: right; font-weight: 700; color: ${stats.count > 0 ? '#00a65a' : '#999'};">
          ${stats.count}x Swap
        </td>
        <td>${stats.lastLoc} ${stats.lastTime !== '-' ? `(${stats.lastTime})` : ''}</td>
        <td style="font-size: 11px; color: #666;">${u.note || '-'}</td>
        <td style="text-align: center;">
          <div class="table-actions-cell">
            <button class="btn-tbl-action edit" title="Edit Unit" onclick="editUnitPrompt('${u.code}')">✏️</button>
            <button class="btn-tbl-action del" title="Hapus Unit" onclick="deleteUnitPrompt('${u.code}')">🗑️</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderUnitPagination(totalPages);
}

function renderUnitPagination(totalPages) {
  const container = document.getElementById('unitPaginationContainer');
  if (!container) return;

  container.innerHTML = '';

  const prevBtn = document.createElement('button');
  prevBtn.className = `page-item-btn btn-page btn-nav-prev ${currentUnitPage <= 1 ? 'disabled' : ''}`;
  prevBtn.innerHTML = '<span>‹</span> Prev';
  prevBtn.title = 'Halaman Sebelumnya';
  prevBtn.disabled = (currentUnitPage <= 1);
  prevBtn.onclick = () => { if (currentUnitPage > 1) { currentUnitPage--; renderUnitTable(); } };
  container.appendChild(prevBtn);

  for (let i = 1; i <= totalPages; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.className = `page-item-btn btn-page ${i === currentUnitPage ? 'active' : ''}`;
    pageBtn.textContent = i;
    const targetP = i;
    pageBtn.onclick = () => { currentUnitPage = targetP; renderUnitTable(); };
    container.appendChild(pageBtn);
  }

  const nextBtn = document.createElement('button');
  nextBtn.className = `page-item-btn btn-page btn-nav-next ${currentUnitPage >= totalPages ? 'disabled' : ''}`;
  nextBtn.innerHTML = 'Next <span>›</span>';
  nextBtn.title = 'Halaman Berikutnya';
  nextBtn.disabled = (currentUnitPage >= totalPages);
  nextBtn.onclick = () => { if (currentUnitPage < totalPages) { currentUnitPage++; renderUnitTable(); } };
  container.appendChild(nextBtn);
}

window.editUnitPrompt = function(code) {
  const unit = fleetUnits.find(u => u.code === code);
  if (!unit) return;

  document.getElementById('editUnitOldCode').value = unit.code;
  document.getElementById('editUnitCode').value = unit.code;
  document.getElementById('editUnitType').value = unit.type;
  document.getElementById('editUnitStatus').value = unit.status;
  document.getElementById('editUnitNote').value = unit.note || '';

  openModal('modalEditUnit');
};

window.deleteUnitPrompt = function(code) {
  deleteUnitTargetCode = code;
  document.getElementById('delUnitCodeText').textContent = `DT ${code}`;
  openModal('modalDeleteUnit');
};

function renderArmadaGrid() {
  const container = document.getElementById('armadaGridBox');
  if (!container) return;

  container.innerHTML = '';
  const counts = {};
  swapsData.forEach(s => {
    if (s.unit) counts[s.unit] = (counts[s.unit] || 0) + 1;
  });

  fleetUnits.forEach(u => {
    const count = counts[u.code] || 0;
    const isZero = count === 0;
    const box = document.createElement('div');
    box.style.cssText = `background:#fff; border:1px solid ${isZero ? '#ffcdd2' : '#ddd'}; padding:10px; text-align:center; border-radius:3px;`;
    box.innerHTML = `
      <div style="font-size:14px; font-weight:700; color:#333;">DT ${u.code}</div>
      <div style="font-size:11px; color:${isZero ? '#d32f2f' : '#00a65a'}; font-weight:600; margin-top:4px;">
        ${count}x Swap
      </div>
      ${isZero ? `<div style="font-size:9px; background:#ffebee; color:#c62828; padding:2px; margin-top:4px;">${u.status}</div>` : ''}
    `;
    container.appendChild(box);
  });
}

// =============================================================================
// 7. SUMMARY CARD (DISTRIBUTED ENERGY)
// =============================================================================

function updateSummaryCard() {
  let a1Count = 0, a1Energy = 0;
  let a2Count = 0, a2Energy = 0;

  swapsData.forEach(s => {
    const kwh = parseFloat(s.energyKwh) || 0;
    if (s.location === 'ROOM A1') {
      a1Count++;
      a1Energy += kwh;
    } else if (s.location === 'ROOM A2') {
      a2Count++;
      a2Energy += kwh;
    }
  });

  const totalCount = a1Count + a2Count;
  const totalEnergy = a1Energy + a2Energy;

  if (document.getElementById('sumA1Count')) document.getElementById('sumA1Count').textContent = a1Count.toLocaleString();
  if (document.getElementById('sumA1Energy')) document.getElementById('sumA1Energy').textContent = a1Energy.toLocaleString();
  if (document.getElementById('sumA2Count')) document.getElementById('sumA2Count').textContent = a2Count.toLocaleString();
  if (document.getElementById('sumA2Energy')) document.getElementById('sumA2Energy').textContent = a2Energy.toLocaleString();
  if (document.getElementById('sumTotalCount')) document.getElementById('sumTotalCount').textContent = totalCount.toLocaleString();
  if (document.getElementById('sumTotalEnergy')) document.getElementById('sumTotalEnergy').textContent = totalEnergy.toLocaleString();
}

// =============================================================================
// 8. EXPORT DATA (CSV)
// =============================================================================

function exportFullCSV() {
  if (swapsData.length === 0) return;

  const headers = ['Manpower', 'NIK', 'Transaction ID', 'Category', 'Unit', 'Date', 'Shift', 'Time In', 'Time Out', 'Duration (Min)', 'Energy (kWh)', 'HM', 'Battery Before', 'Battery After', 'Location', 'Status', 'Remark'];
  const rows = [headers.join(',')];

  swapsData.forEach(s => {
    const txId = s.id.includes('DA01') ? s.id : `DA01/CHG/2026/SWAP/${s.id.replace('SWP-', '')}`;
    rows.push([
      `"${s.operator || 'ZAKARIYA ABIDIN'}"`,
      `"${s.operatorNik || '81230529'}"`,
      `"${txId}"`,
      `"${s.category || 'CHARGING SWAP'}"`,
      `"DT ${s.unit}"`,
      `"${s.date}"`,
      s.shift,
      `"${s.jamIn}"`,
      `"${s.jamOut}"`,
      s.durationMin,
      s.energyKwh,
      `"${s.hm || ''}"`,
      `"${s.batteryBefore}"`,
      `"${s.batteryAfter}"`,
      `"${s.location}"`,
      `"${s.statusRemark}"`,
      `"${s.problemRemark}"`
    ].join(','));
  });

  downloadCSV(rows.join('\n'), `Refueling_Charging_Transaction_${new Date().toISOString().slice(0,10)}.csv`);
  showToast("File Export Data Transaksi berhasil diunduh!", "success");
}

function exportSummaryCSV() {
  const headers = ['Location', 'Total Transactions', 'Total Energy (kWh)'];
  let a1Count = 0, a1Energy = 0, a2Count = 0, a2Energy = 0;
  swapsData.forEach(s => {
    if (s.location === 'ROOM A1') { a1Count++; a1Energy += (parseFloat(s.energyKwh)||0); }
    if (s.location === 'ROOM A2') { a2Count++; a2Energy += (parseFloat(s.energyKwh)||0); }
  });

  const rows = [
    headers.join(','),
    `"ROOM A1",${a1Count},${a1Energy}`,
    `"ROOM A2",${a2Count},${a2Energy}`,
    `"TOTAL",${a1Count + a2Count},${a1Energy + a2Energy}`
  ];

  downloadCSV(rows.join('\n'), `IPCC_Distributed_Energy_Summary_${new Date().toISOString().slice(0,10)}.csv`);
  showToast("File Export IPCC Summary berhasil diunduh!", "success");
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// =============================================================================
// 9. POPULATE DROPDOWNS & HELPERS
// =============================================================================

function populateUnitSelects() {
  const newSelect = document.getElementById('newSwapUnit');
  const editSelect = document.getElementById('editUnit');
  const dedSelect = document.getElementById('dedSwapUnit');

  if (newSelect) {
    const prevVal = newSelect.value;
    newSelect.innerHTML = '<option value="" selected disabled>-- Pilih Unit --</option>';
    fleetUnits.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.code;
      opt.textContent = `DT ${u.code}`;
      newSelect.appendChild(opt);
    });
    if (prevVal) newSelect.value = prevVal;
  }

  if (editSelect) {
    const prevVal = editSelect.value;
    editSelect.innerHTML = '<option value="" selected disabled>-- Pilih Unit --</option>';
    fleetUnits.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.code;
      opt.textContent = `DT ${u.code}`;
      editSelect.appendChild(opt);
    });
    if (prevVal) editSelect.value = prevVal;
  }

  if (dedSelect) {
    if (dedSelect.tagName === 'SELECT') {
      const prevVal = dedSelect.value;
      dedSelect.innerHTML = '<option value="" selected disabled>-- Pilih Unit Armada --</option>';
      fleetUnits.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.code;
        opt.textContent = `DT ${u.code}`;
        dedSelect.appendChild(opt);
      });
      if (prevVal) dedSelect.value = prevVal;
    } else {
      renderUnitDropdownOptions(dedSelect.value || '');
    }
  }

  const ppaUnitSelect = document.getElementById('ppaFilterUnit');
  if (ppaUnitSelect) {
    const prevVal = ppaUnitSelect.value;
    ppaUnitSelect.innerHTML = '<option value="ALL">Semua Unit</option>';
    fleetUnits.forEach(u => {
      const code = typeof u === 'object' ? u.code : u;
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = `DT ${code}`;
      ppaUnitSelect.appendChild(opt);
    });
    if (prevVal) ppaUnitSelect.value = prevVal;
  }
}

function renderUnitDropdownOptions(filter = '') {
  const listEl = document.getElementById('unitDropdownList');
  if (!listEl) return;
  const cleanFilter = (filter || '').toLowerCase().trim().replace(/^dt[- ]?/i, '');
  const matched = fleetUnits.filter(u => {
    if (!cleanFilter) return true;
    const fullCode = String(u.code).toLowerCase();
    const label = `dt ${u.code} ${u.model || ''}`.toLowerCase();
    return fullCode.includes(cleanFilter) || label.includes(cleanFilter);
  });

  if (matched.length === 0) {
    listEl.innerHTML = `<div style="padding: 10px 14px; color: #94a3b8; font-size: 12px; text-align: center;">Tidak ada unit dengan kata kunci "${filter}"</div>`;
    return;
  }

  listEl.innerHTML = matched.map(u => `
    <div class="unit-option-item" data-code="${u.code}">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span>🚛</span>
        <span style="font-weight: 800; color: #0b5394;">DT ${u.code}</span>
        <span style="font-size: 11px; color: #64748b; font-weight: 500;">${u.model || 'EV Dump Truck 90T'}</span>
      </div>
      <span style="font-size: 10px; font-weight: 700; background: ${u.status === 'AKTIF' ? '#dcfce7' : '#fee2e2'}; color: ${u.status === 'AKTIF' ? '#15803d' : '#b91c1c'}; padding: 2px 6px; border-radius: 4px;">
        ${u.status || 'AKTIF'}
      </span>
    </div>
  `).join('');

  listEl.querySelectorAll('.unit-option-item').forEach(item => {
    item.addEventListener('click', () => {
      const code = item.getAttribute('data-code');
      selectComboboxUnit(code);
    });
  });
}

function selectComboboxUnit(code) {
  const input = document.getElementById('dedSwapUnit');
  const listEl = document.getElementById('unitDropdownList');
  if (input) {
    input.value = `DT ${code}`;
    input.dataset.unitCode = code;
  }
  if (listEl) listEl.style.display = 'none';
  updateDedSwapScheduleTarget();
  document.getElementById('dedSwapHM')?.focus();
}

function initSearchableUnitCombobox() {
  const unitInput = document.getElementById('dedSwapUnit');
  const listEl = document.getElementById('unitDropdownList');
  const btnToggle = document.getElementById('btnToggleUnitDropdown');

  if (!unitInput) return;

  renderUnitDropdownOptions(unitInput.value || '');

  if (!unitInput.dataset.comboboxBound) {
    unitInput.dataset.comboboxBound = 'true';

    unitInput.addEventListener('focus', () => {
      renderUnitDropdownOptions(unitInput.value);
      if (listEl) listEl.style.display = 'block';
    });

    unitInput.addEventListener('click', () => {
      renderUnitDropdownOptions(unitInput.value);
      if (listEl) listEl.style.display = 'block';
    });

    unitInput.addEventListener('input', (e) => {
      renderUnitDropdownOptions(e.target.value);
      if (listEl) listEl.style.display = 'block';
      updateDedSwapScheduleTarget();
    });

    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('unitComboboxWrap');
      if (wrap && !wrap.contains(e.target)) {
        if (listEl) listEl.style.display = 'none';
      }
    });

    if (btnToggle) {
      btnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (listEl) {
          const isOpen = listEl.style.display === 'block';
          if (isOpen) {
            listEl.style.display = 'none';
          } else {
            renderUnitDropdownOptions(unitInput.value);
            listEl.style.display = 'block';
            unitInput.focus();
          }
        }
      });
    }
  }
}

function formatBatteryPercentage(val) {
  if (val === null || val === undefined || val === '') return '-';
  let str = String(val).trim();
  if (!str || str === '-') return '-';
  let clean = str.replace(/%/g, '').trim();
  let num = parseFloat(clean);
  if (isNaN(num)) return str;
  if (num === 0) return '0%';
  if (num > 0 && num <= 1) {
    return Math.round(num * 100) + '%';
  }
  return Math.round(num) + '%';
}

function initDedicatedInputForm() {
  populateUnitSelects();
  initSearchableUnitCombobox();
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('dedSwapDate');
  const locInput = document.getElementById('dedSwapLoc');
  const shiftInput = document.getElementById('dedSwapShift');
  const shiftDisplay = document.getElementById('dedSwapShiftDisplay');
  const jamInInput = document.getElementById('dedSwapJamIn');
  const jamOutInput = document.getElementById('dedSwapJamOut');
  const energyInput = document.getElementById('dedSwapEnergy');
  const batIn = document.getElementById('dedSwapBatIn');
  const batOut = document.getElementById('dedSwapBatOut');
  const hmInput = document.getElementById('dedSwapHM');
  const dedUnitSel = document.getElementById('dedSwapUnit');
  const timeSchInput = document.getElementById('dedSwapTimeSch');

  // Set session defaults
  const activeDate = currentAuthUser?.date || localStorage.getItem('voltswap_date') || today;
  if (dateInput) {
    dateInput.value = activeDate;
    dateInput.readOnly = true;
  }
  if (locInput) locInput.value = (activeLocation === 'SUPERVISOR') ? 'ROOM A1' : activeLocation;
  
  const activeShift = currentAuthUser?.shift || localStorage.getItem('voltswap_shift') || '1';
  if (shiftInput) shiftInput.value = activeShift;
  if (shiftDisplay) shiftDisplay.value = `Shift ${activeShift}`;

  const activeCategory = currentAuthUser?.category || localStorage.getItem('voltswap_category') || 'CHARGING SWAP';
  const dedCategoryInput = document.getElementById('dedSwapCategory');
  const dedCategoryDisplay = document.getElementById('dedSwapCategoryDisplay');
  if (dedCategoryInput) dedCategoryInput.value = activeCategory;
  if (dedCategoryDisplay) dedCategoryDisplay.value = activeCategory;
  
  // Clean all entry fields initially
  if (dedUnitSel && !dedUnitSel.value) dedUnitSel.value = '';
  if (jamInInput && !jamInInput.value) jamInInput.value = '';
  if (jamOutInput && !jamOutInput.value) jamOutInput.value = '';
  if (energyInput && !energyInput.value) energyInput.value = '';
  if (batIn && !batIn.value) batIn.value = '';
  if (batOut && !batOut.value) batOut.value = '';
  if (hmInput && !hmInput.value) hmInput.value = '';
  if (timeSchInput) timeSchInput.value = '';

  // Auto-format battery percentage on blur
  if (batIn && !batIn.dataset.pctBound) {
    batIn.dataset.pctBound = 'true';
    batIn.addEventListener('blur', (e) => {
      if (e.target.value) e.target.value = formatBatteryPercentage(e.target.value);
    });
  }
  if (batOut && !batOut.dataset.pctBound) {
    batOut.dataset.pctBound = 'true';
    batOut.addEventListener('blur', (e) => {
      if (e.target.value) e.target.value = formatBatteryPercentage(e.target.value);
    });
  }

  const form = document.getElementById('formDedicatedInputSwap');

  if (dedUnitSel && !dedUnitSel.dataset.schBound) {
    dedUnitSel.dataset.schBound = 'true';
    dedUnitSel.addEventListener('change', updateDedSwapScheduleTarget);
  }
  if (jamInInput && !jamInInput.dataset.schBound) {
    jamInInput.dataset.schBound = 'true';
    jamInInput.addEventListener('input', updateDedSwapScheduleTarget);
  }

  // Charging Time Auto Calculator (Jam Out - Jam In)
  window.updateDedicatedChargingTime = function() {
    const inEl = document.getElementById('dedSwapJamIn');
    const outEl = document.getElementById('dedSwapJamOut');
    const timeDisplay = document.getElementById('dedSwapChargingTime');
    const hiddenDur = document.getElementById('dedSwapDurationMin');
    if (!inEl || !outEl || !timeDisplay) return;

    const inVal = (inEl.value || '').trim();
    const outVal = (outEl.value || '').trim();
    if (!inVal || !outVal) {
      timeDisplay.value = '-- Menit';
      if (hiddenDur) hiddenDur.value = '0';
      return;
    }

    const inParts = inVal.split(':').map(Number);
    const outParts = outVal.split(':').map(Number);
    if (inParts.length < 2 || outParts.length < 2) {
      timeDisplay.value = '-- Menit';
      if (hiddenDur) hiddenDur.value = '0';
      return;
    }

    const inSec = inParts[0] * 3600 + inParts[1] * 60 + (inParts[2] || 0);
    const outSec = outParts[0] * 3600 + outParts[1] * 60 + (outParts[2] || 0);

    let diffSec = outSec - inSec;
    if (diffSec < 0) diffSec += 86400; // Melintasi tengah malam

    const diffMin = Math.round((diffSec / 60) * 10) / 10;
    timeDisplay.value = `${diffMin} Menit`;
    if (hiddenDur) hiddenDur.value = String(diffMin);
  };

  // Dinamis Keterangan Requirement
  window.updateKeteranganRequirement = function() {
    const sEl = document.getElementById('dedSwapStatus');
    const rEl = document.getElementById('dedSwapRemark2');
    const badge = document.getElementById('badgeKeteranganStatus');
    const input = document.getElementById('dedSwapKeterangan');
    if (!sEl || !badge || !input) return;

    const statusVal = sEl.value || 'On Time';
    const remarkVal = rEl ? rEl.value : '';

    if (statusVal === 'On Time') {
      badge.style.background = '#e2e8f0';
      badge.style.color = '#475569';
      badge.innerHTML = 'ℹ️ Opsional (On Time)';
      input.placeholder = 'Catatan / keterangan operasional (opsional jika On Time)...';
      input.style.borderColor = '#cbd5e1';
      input.style.boxShadow = 'none';
      return;
    }

    // Kasus Out Off Time:
    // Cek apakah Problem Remark sudah dipilih dari salah satu kendala di dropdown (selain kosong & selain No Problem)
    const hasSpecificProblem = remarkVal && remarkVal !== '13.NO PROBLEM';

    if (hasSpecificProblem) {
      // Ada pilihannya di Problem Remark -> Keterangan jadi Opsional, form bisa langsung disimpan!
      badge.style.background = '#e0f2fe';
      badge.style.color = '#0369a1';
      badge.innerHTML = `ℹ️ Opsional (${remarkVal})`;
      input.placeholder = 'Keterangan tambahan (opsional, kendala sudah dipilih)...';
      input.style.borderColor = '#93c5fd';
      input.style.boxShadow = 'none';
    } else {
      // Tidak ada pilihannya di Problem Remark (kosong) -> WAJIB isi keterangan manual!
      badge.style.background = '#fef3c7';
      badge.style.color = '#b45309';
      badge.innerHTML = '⚠️ Wajib Diisi (Out Off Time)';
      input.placeholder = 'Ketik manual alasan / kendala kenapa Out Off Time...';
      input.style.borderColor = '#f59e0b';
      input.style.boxShadow = '0 0 0 2px rgba(245, 158, 11, 0.18)';
    }
  };

  if (jamInInput && !jamInInput.dataset.calcBound) {
    jamInInput.dataset.calcBound = 'true';
    jamInInput.addEventListener('input', window.updateDedicatedChargingTime);
    jamInInput.addEventListener('change', window.updateDedicatedChargingTime);
  }
  if (jamOutInput && !jamOutInput.dataset.calcBound) {
    jamOutInput.dataset.calcBound = 'true';
    jamOutInput.addEventListener('input', window.updateDedicatedChargingTime);
    jamOutInput.addEventListener('change', window.updateDedicatedChargingTime);
  }

  const sStatusEl = document.getElementById('dedSwapStatus');
  const sRemarkEl = document.getElementById('dedSwapRemark2');
  const sKetEl = document.getElementById('dedSwapKeterangan');

  if (sStatusEl && !sStatusEl.dataset.ketBound) {
    sStatusEl.dataset.ketBound = 'true';
    sStatusEl.addEventListener('change', () => {
      if (sStatusEl.value === 'On Time') {
        // Ketika On Time, Problem Remark otomatis jadi 13.NO PROBLEM
        if (sRemarkEl) sRemarkEl.value = '13.NO PROBLEM';
      } else {
        // Ketika Out Off Time, jika sebelumnya 13.NO PROBLEM, otomatis kosongkan!
        if (sRemarkEl && sRemarkEl.value === '13.NO PROBLEM') {
          sRemarkEl.value = '';
        }
        // Jika Problem Remark kosong, kursor fokus ke kolom Keterangan
        if (sRemarkEl && !sRemarkEl.value && sKetEl) {
          sKetEl.focus();
        }
      }
      window.updateKeteranganRequirement();
    });
  }

  if (sRemarkEl && !sRemarkEl.dataset.ketBound) {
    sRemarkEl.dataset.ketBound = 'true';
    sRemarkEl.addEventListener('change', () => {
      // Jika operator memilih opsi kosong pada Problem Remark, arahkan fokus ke Keterangan
      if (!sRemarkEl.value && sKetEl) {
        sKetEl.focus();
      }
      window.updateKeteranganRequirement();
    });
  }

  // Saat diketik keterangan manual, Problem Remark otomatis dikosongkan
  if (sKetEl && !sKetEl.dataset.autoClearBound) {
    sKetEl.dataset.autoClearBound = 'true';
    sKetEl.addEventListener('input', () => {
      if (sKetEl.value.trim() !== '') {
        if (sRemarkEl && sRemarkEl.value !== '') {
          sRemarkEl.value = '';
          window.updateKeteranganRequirement();
        }
      }
    });
  }

  updateDedSwapScheduleTarget();
  window.updateDedicatedChargingTime();
  window.updateKeteranganRequirement();

  if (form && !form.dataset.bound) {
    form.dataset.bound = 'true';
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const rawUnit = document.getElementById('dedSwapUnit').value.trim();
      const matchDigit = rawUnit.match(/\b\d{4}\b/) || rawUnit.match(/\d+/);
      const selectedUnit = matchDigit ? matchDigit[0] : rawUnit.replace(/^DT[- ]?/i, '').trim();
      if (!selectedUnit) {
        showToast('Silakan pilih atau ketik Kode Unit Armada terlebih dahulu!', 'danger');
        document.getElementById('dedSwapUnit').focus();
        return;
      }

      const activeShiftVal = document.getElementById('dedSwapShift')?.value || currentAuthUser?.shift || '1';
      const formattedBatIn = formatBatteryPercentage(document.getElementById('dedSwapBatIn').value || '-');
      const formattedBatOut = formatBatteryPercentage(document.getElementById('dedSwapBatOut').value || '100%');

      // Cek apakah status Out Off Time dan validasi Problem Remark & Keterangan
      const statusEl = document.getElementById('dedSwapStatus');
      const remarkEl = document.getElementById('dedSwapRemark2');
      const ketInput = document.getElementById('dedSwapKeterangan');
      const statusVal = statusEl ? statusEl.value : 'On Time';
      const remarkVal = remarkEl ? remarkEl.value : '';
      const ketVal = ketInput ? ketInput.value.trim() : '';

      if (statusVal === 'Out Off Time') {
        const hasSpecificProblem = remarkVal && remarkVal !== '13.NO PROBLEM';
        if (!hasSpecificProblem && !ketVal) {
          showToast('Karena status "Out Off Time", silakan pilih Problem Remark atau ketik manual alasan pada kolom Keterangan!', 'warning');
          if (ketInput) {
            ketInput.focus();
            ketInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }
      }

      // Hitung Durasi Charging (Charging Time)
      const calcDur = parseFloat(document.getElementById('dedSwapDurationMin')?.value) || 0;
      const durationMinVal = calcDur > 0 ? calcDur : 6;

      const newId = generateNextSwapId();
      const activeCategoryVal = document.getElementById('dedSwapCategory')?.value || currentAuthUser?.category || 'CHARGING SWAP';
      const newRec = {
        id: newId,
        date: formatDateDisplay(document.getElementById('dedSwapDate').value),
        shift: activeShiftVal,
        category: activeCategoryVal,
        location: document.getElementById('dedSwapLoc').value,
        unit: selectedUnit,
        hm: document.getElementById('dedSwapHM').value || '-',
        batteryBefore: formattedBatIn,
        jamIn: document.getElementById('dedSwapJamIn').value,
        batteryAfter: formattedBatOut,
        jamOut: document.getElementById('dedSwapJamOut').value,
        durationMin: durationMinVal,
        energyKwh: parseFloat(document.getElementById('dedSwapEnergy').value) || 0,
        statusRemark: statusVal,
        problemRemark: remarkVal ? remarkVal : (statusVal === 'On Time' ? '13.NO PROBLEM' : '-'),
        keterangan: ketVal || '-',
        operator: currentAuthUser ? currentAuthUser.name : 'ZAKARIYA ABIDIN',
        operatorNik: currentAuthUser ? currentAuthUser.nik : '81230529',
        timeSch: '-'
      };

      swapsData.unshift(newRec);
      persistData();
      renderMainTable();
      updateSummaryCard();

      // Push ke Google Sheets (jika di GAS environment)
      gasSync.pushTransaction(newRec);

      // Notifikasi sukses yang informatif
      showToast(`✅ Data ${newId} (DT ${newRec.unit}) berhasil disimpan! Charging Time: ${durationMinVal} Menit`, 'success');

      // TETAP DI FORM INPUT & RESET FIELD MENJADI BERSIH/KOSONG
      if (dedUnitSel) dedUnitSel.value = '';
      if (hmInput) hmInput.value = '';
      if (batIn) batIn.value = '';
      if (batOut) batOut.value = '';
      if (energyInput) energyInput.value = '';
      if (jamInInput) jamInInput.value = '';
      if (jamOutInput) jamOutInput.value = '';
      if (timeSchInput) timeSchInput.value = '';

      const timeDisplay = document.getElementById('dedSwapChargingTime');
      const hiddenDur = document.getElementById('dedSwapDurationMin');
      if (timeDisplay) timeDisplay.value = '-- Menit';
      if (hiddenDur) hiddenDur.value = '0';

      if (statusEl) statusEl.value = 'On Time';
      if (remarkEl) remarkEl.value = '13.NO PROBLEM';
      if (ketInput) ketInput.value = '';
      window.updateKeteranganRequirement();

      // Pastikan tanggal, lokasi, dan shift tetap sesuai sesi operator aktif
      const sessionDate = currentAuthUser?.date || localStorage.getItem('voltswap_date') || today;
      if (dateInput) {
        dateInput.value = sessionDate;
        dateInput.readOnly = true;
      }
      if (locInput) locInput.value = (activeLocation === 'SUPERVISOR') ? 'ROOM A1' : activeLocation;
      if (shiftInput) shiftInput.value = activeShiftVal;
      if (shiftDisplay) shiftDisplay.value = `Shift ${activeShiftVal}`;

      const activeCat = currentAuthUser?.category || localStorage.getItem('voltswap_category') || 'CHARGING SWAP';
      const dedCatDisplay = document.getElementById('dedSwapCategoryDisplay');
      const dedCatInput = document.getElementById('dedSwapCategory');
      if (dedCatDisplay) dedCatDisplay.value = activeCat;
      if (dedCatInput) dedCatInput.value = activeCat;

      // Fokuskan kembali kursor ke pemilihan Unit armada
      const unitEl = document.getElementById('dedSwapUnit');
      if (unitEl) unitEl.focus();

      // Scroll halus ke atas form agar operator melihat feedback sukses
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}

window.setNowField = function(fieldId) {
  const el = document.getElementById(fieldId);
  if (el) {
    el.value = new Date().toTimeString().split(' ')[0].substring(0, 5);
    if (typeof window.updateDedicatedChargingTime === 'function') {
      window.updateDedicatedChargingTime();
    }
    if (typeof updateDedSwapScheduleTarget === 'function') {
      updateDedSwapScheduleTarget();
    }
  }
};

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const p = dateStr.split('-');
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
  return dateStr;
}

window.openModal = function(id) {
  const m = document.getElementById(id);
  if (m) {
    m.classList.add('active');
    if (id === 'modalAddSwap') {
      const shiftEl = document.getElementById('newSwapShift');
      if (shiftEl && currentAuthUser?.shift) shiftEl.value = currentAuthUser.shift;
      const locEl = document.getElementById('newSwapLoc');
      if (locEl && activeLocation && activeLocation !== 'SUPERVISOR') locEl.value = activeLocation;
    } else if (id === 'modalAddProblem') {
      const shiftEl = document.getElementById('addProbShift');
      if (shiftEl && currentAuthUser?.shift) shiftEl.value = currentAuthUser.shift;
    }
  }
};

window.closeModal = function(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
};

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const t = document.createElement('div');
  t.className = `toast-ent ${type}`;
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'warning') icon = '⚠️';
  if (type === 'danger') icon = '❌';

  t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  container.appendChild(t);

  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.3s';
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

// =============================================================================
// 10. ALTERNATE VIEWS: PROBLEM LOG & ANALYTICS CHARTS
// =============================================================================

let probCurrentPage = 1;
let probPerPage = 10;
let probSearchQuery = '';
let probSortColumn = 'no';
let probSortDirection = 'asc';
let probMobileViewMode = 'cards';
let probControlsInitialized = false;
let problemToDeleteId = null;

// Time & Duration Parsing Helpers
function parseTimeToSeconds(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const s = parts[2] ? (parseInt(parts[2], 10) || 0) : 0;
  return h * 3600 + m * 60 + s;
}

function formatHmsFromSeconds(sec) {
  if (isNaN(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function computeDurationBetween(openStr, closeStr) {
  const openSec = parseTimeToSeconds(openStr);
  const closeSec = parseTimeToSeconds(closeStr);
  if (openSec === null || closeSec === null) return '0:00:00';
  let diff = closeSec - openSec;
  if (diff < 0) diff += 86400; // crossed midnight
  return formatHmsFromSeconds(diff);
}

function getRealProblemDuration(p) {
  if (p.duration && p.duration !== '0:00:00' && p.duration !== '-' && p.duration.trim() !== '') {
    return p.duration;
  }
  if (p.timeOpen && p.timeClose && p.timeOpen !== p.timeClose) {
    return computeDurationBetween(p.timeOpen, p.timeClose);
  }
  return p.duration || '0:00:00';
}

function parseDateForSort(dStr) {
  if (!dStr) return 0;
  if (dStr.includes('-')) {
    return new Date(dStr).getTime() || 0;
  }
  const parts = dStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    return new Date(year, month - 1, day).getTime() || 0;
  }
  return 0;
}

function initProblemLogControls() {
  if (probControlsInitialized) return;
  probControlsInitialized = true;

  // 1. Search Input
  const searchInput = document.getElementById('inputProbSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      probSearchQuery = (e.target.value || '').trim().toLowerCase();
      probCurrentPage = 1;
      renderProblemTable();
    });
  }

  // 2. Entries Per Page
  const perPageSelect = document.getElementById('selectProbPerPage');
  if (perPageSelect) {
    perPageSelect.addEventListener('change', (e) => {
      probPerPage = parseInt(e.target.value, 10) || 10;
      probCurrentPage = 1;
      renderProblemTable();
    });
  }

  // 3. Export Excel Button
  const btnExport = document.getElementById('btnExportProblemExcel');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      exportProblemsToCSV();
    });
  }

  // 4. Open Add Problem Modal Button
  const btnAdd = document.getElementById('btnOpenAddProblemModal');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      openAddProblemModal();
    });
  }

  // 5. Live Duration in Add Modal
  const addTimeOpen = document.getElementById('addProbTimeOpen');
  const addTimeClose = document.getElementById('addProbTimeClose');
  const updateAddDur = () => {
    const o = addTimeOpen?.value;
    const c = addTimeClose?.value;
    const durEl = document.getElementById('addProbDuration');
    if (durEl) durEl.value = computeDurationBetween(o, c);
  };
  addTimeOpen?.addEventListener('input', updateAddDur);
  addTimeClose?.addEventListener('input', updateAddDur);

  // 6. Live Duration in Edit Modal
  const editTimeOpen = document.getElementById('editProbTimeOpen');
  const editTimeClose = document.getElementById('editProbTimeClose');
  const updateEditDur = () => {
    const o = editTimeOpen?.value;
    const c = editTimeClose?.value;
    const durEl = document.getElementById('editProbDuration');
    if (durEl) durEl.value = computeDurationBetween(o, c);
  };
  editTimeOpen?.addEventListener('input', updateEditDur);
  editTimeClose?.addEventListener('input', updateEditDur);

  // 7. Form Submit Add Problem
  const formAdd = document.getElementById('formNewProblem');
  if (formAdd) {
    formAdd.addEventListener('submit', (e) => {
      e.preventDefault();
      const rawDate = document.getElementById('addProbDate')?.value;
      const shift = document.getElementById('addProbShift')?.value || '1';
      const customUnit = document.getElementById('addProbUnitCustom')?.value?.trim();
      const selUnit = document.getElementById('addProbUnitSelect')?.value;
      const unit = customUnit || selUnit || '1601';
      const desc = document.getElementById('addProbDesc')?.value?.trim();
      const timeOpen = document.getElementById('addProbTimeOpen')?.value || '';
      const timeClose = document.getElementById('addProbTimeClose')?.value || '';
      const duration = document.getElementById('addProbDuration')?.value || computeDurationBetween(timeOpen, timeClose);

      if (!desc) {
        showToast('Harap isi deskripsi masalah / gangguan', 'warning');
        return;
      }

      // Format date to DD/MM/YYYY
      let dateDisplay = rawDate;
      if (rawDate && rawDate.includes('-')) {
        const dp = rawDate.split('-');
        dateDisplay = `${dp[2]}/${dp[1]}/${dp[0]}`;
      }

      const newId = `PRB-${String(Date.now()).slice(-5)}`;
      const newProblem = {
        id: newId,
        no: String(problemsData.length + 1),
        date: dateDisplay,
        shift: shift,
        unit: unit,
        problem: desc,
        timeOpen: timeOpen,
        timeClose: timeClose,
        duration: duration
      };

      // Add to front of list
      problemsData.unshift(newProblem);
      // Re-index sequential numbering
      problemsData.forEach((p, idx) => {
        p.no = String(idx + 1);
      });

      persistData();
      // Push ke Google Sheets
      gasSync.pushProblem(newProblem);
      closeModal('modalAddProblem');
      formAdd.reset();
      showToast(`Laporan gangguan unit ${unit} berhasil dicatat!`, 'success');
      probCurrentPage = 1;
      renderProblemTable();
    });
  }

  // 8. Form Submit Edit Problem
  const formEdit = document.getElementById('formEditProblem');
  if (formEdit) {
    formEdit.addEventListener('submit', (e) => {
      e.preventDefault();
      const editId = document.getElementById('editProbId')?.value;
      const item = problemsData.find(p => p.id === editId);
      if (!item) return;

      const rawDate = document.getElementById('editProbDate')?.value;
      const shift = document.getElementById('editProbShift')?.value || '1';
      const unit = document.getElementById('editProbUnit')?.value?.trim() || item.unit;
      const desc = document.getElementById('editProbDesc')?.value?.trim() || item.problem;
      const timeOpen = document.getElementById('editProbTimeOpen')?.value || '';
      const timeClose = document.getElementById('editProbTimeClose')?.value || '';
      const duration = document.getElementById('editProbDuration')?.value || computeDurationBetween(timeOpen, timeClose);

      let dateDisplay = rawDate;
      if (rawDate && rawDate.includes('-')) {
        const dp = rawDate.split('-');
        dateDisplay = `${dp[2]}/${dp[1]}/${dp[0]}`;
      }

      item.date = dateDisplay;
      item.shift = shift;
      item.unit = unit;
      item.problem = desc;
      item.timeOpen = timeOpen;
      item.timeClose = timeClose;
      item.duration = duration;

      persistData();
      closeModal('modalEditProblem');
      showToast(`Perubahan catatan gangguan ${unit} berhasil disimpan!`, 'success');
      renderProblemTable();
    });
  }

  // 9. Confirm Delete Modal Action
  const btnDoDelete = document.getElementById('btnDoDeleteProblem');
  if (btnDoDelete) {
    btnDoDelete.addEventListener('click', () => {
      if (!problemToDeleteId) return;
      problemsData = problemsData.filter(p => p.id !== problemToDeleteId);
      problemsData.forEach((p, idx) => {
        p.no = String(idx + 1);
      });
      persistData();
      closeModal('modalDeleteProblem');
      showToast('Catatan kendala telah dihapus.', 'warning');
      problemToDeleteId = null;
      renderProblemTable();
    });
  }

  // 10. Table Column Header Sorting
  const headers = document.querySelectorAll('#mainProblemTable th[data-sort]');
  headers.forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort');
      if (probSortColumn === col) {
        probSortDirection = (probSortDirection === 'asc') ? 'desc' : 'asc';
      } else {
        probSortColumn = col;
        probSortDirection = 'asc';
      }
      renderProblemTable();
    });
  });

  // 11. Mobile Cards vs Table Toggle
  const btnToggleCards = document.getElementById('btnToggleProbCards');
  const btnToggleTable = document.getElementById('btnToggleProbTable');
  const cardsContainer = document.getElementById('probMobileCardsContainer');
  const tableContainer = document.getElementById('tableResponsiveBoxProb');

  if (btnToggleCards && btnToggleTable && cardsContainer && tableContainer) {
    btnToggleCards.addEventListener('click', () => {
      probMobileViewMode = 'cards';
      btnToggleCards.classList.add('active');
      btnToggleTable.classList.remove('active');
      cardsContainer.classList.remove('hide-mobile-cards');
      tableContainer.classList.remove('force-table-show');
    });

    btnToggleTable.addEventListener('click', () => {
      probMobileViewMode = 'table';
      btnToggleTable.classList.add('active');
      btnToggleCards.classList.remove('active');
      cardsContainer.classList.add('hide-mobile-cards');
      tableContainer.classList.add('force-table-show');
    });
  }
}

function openAddProblemModal() {
  const dateInput = document.getElementById('addProbDate');
  const shiftSelect = document.getElementById('addProbShift');
  const unitSelect = document.getElementById('addProbUnitSelect');
  const customUnitInput = document.getElementById('addProbUnitCustom');
  const descInput = document.getElementById('addProbDesc');
  const timeOpen = document.getElementById('addProbTimeOpen');
  const timeClose = document.getElementById('addProbTimeClose');
  const durInput = document.getElementById('addProbDuration');

  // Default date to today
  const today = new Date().toISOString().split('T')[0];
  if (dateInput) dateInput.value = today;
  if (shiftSelect) shiftSelect.value = '1';
  if (customUnitInput) customUnitInput.value = '';
  if (descInput) descInput.value = '';

  // Set default current time for open and close
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timeNowStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
  if (timeOpen) timeOpen.value = timeNowStr;
  if (timeClose) timeClose.value = timeNowStr;
  if (durInput) durInput.value = '0:00:00';

  // Populate unit select
  if (unitSelect) {
    const populasi = (window.INITIAL_DATA && window.INITIAL_DATA.populasi) ? window.INITIAL_DATA.populasi : [];
    let opts = '<option value="">-- Pilih Unit Armada DT --</option>';
    populasi.forEach(u => {
      opts += `<option value="${u}">DT ${u}</option>`;
    });
    opts += `
      <optgroup label="Fasilitas & Sistem">
        <option value="CRANE OHC">CRANE OHC (Overhead Crane)</option>
        <option value="CHARGER BAY 1">CHARGER BAY 1 (Rak Pengisian 1)</option>
        <option value="CHARGER BAY 2">CHARGER BAY 2 (Rak Pengisian 2)</option>
        <option value="SWAP SYSTEM">SWAP SYSTEM (Meja Hidrolik)</option>
        <option value="OHC HOIST">OHC HOIST CABLE</option>
        <option value="POWER SUPPLY">MAIN POWER / GENSET</option>
        <option value="KOMUNIKASI/SINYAL">JARINGAN & SINYAL</option>
      </optgroup>
    `;
    unitSelect.innerHTML = opts;
  }

  openModal('modalAddProblem');
}

window.editProblemItem = function(id) {
  const item = problemsData.find(p => p.id === id);
  if (!item) return;

  const editId = document.getElementById('editProbId');
  const dateInput = document.getElementById('editProbDate');
  const shiftSelect = document.getElementById('editProbShift');
  const unitInput = document.getElementById('editProbUnit');
  const descInput = document.getElementById('editProbDesc');
  const timeOpen = document.getElementById('editProbTimeOpen');
  const timeClose = document.getElementById('editProbTimeClose');
  const durInput = document.getElementById('editProbDuration');

  if (editId) editId.value = item.id;
  if (shiftSelect) shiftSelect.value = item.shift || '1';
  if (unitInput) unitInput.value = item.unit || '';
  if (descInput) descInput.value = item.problem || '';
  if (timeOpen) timeOpen.value = item.timeOpen || '';
  if (timeClose) timeClose.value = item.timeClose || '';
  if (durInput) durInput.value = getRealProblemDuration(item);

  // Convert date to YYYY-MM-DD for datepicker
  if (dateInput) {
    if (item.date && item.date.includes('/')) {
      const parts = item.date.split('/');
      if (parts.length === 3) {
        const y = parts[2].length === 4 ? parts[2] : `20${parts[2]}`;
        const m = String(parts[1]).padStart(2, '0');
        const d = String(parts[0]).padStart(2, '0');
        dateInput.value = `${y}-${m}-${d}`;
      } else {
        dateInput.value = item.date;
      }
    } else {
      dateInput.value = item.date || '';
    }
  }

  openModal('modalEditProblem');
};

window.deleteProblemItem = function(id) {
  const item = problemsData.find(p => p.id === id);
  if (!item) return;

  problemToDeleteId = id;
  const unitText = document.getElementById('delProbUnitText');
  const preview = document.getElementById('delProbDescPreview');

  if (unitText) unitText.textContent = item.unit || 'Fasilitas';
  if (preview) preview.textContent = `"${item.problem || 'Tanpa keterangan'}" (Durasi: ${getRealProblemDuration(item)})`;

  openModal('modalDeleteProblem');
};

function exportProblemsToCSV() {
  if (!problemsData || problemsData.length === 0) {
    showToast('Tidak ada data gangguan untuk diekspor', 'warning');
    return;
  }

  let csvContent = '\uFEFF'; // UTF-8 BOM for Excel
  csvContent += 'No,Tanggal,Shift,Unit / Fasilitas,Deskripsi Masalah,Jam Mulai (Open),Jam Selesai (Close),Durasi Downtime\n';

  problemsData.forEach((p, idx) => {
    const dur = getRealProblemDuration(p);
    const cleanDesc = (p.problem || '').replace(/"/g, '""');
    csvContent += `"${idx + 1}","${p.date || ''}","Shift ${p.shift || ''}","${p.unit || ''}","${cleanDesc}","${p.timeOpen || ''}","${p.timeClose || ''}","${dur}"\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Problem_Downtime_Incident_Log_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Data log gangguan berhasil diekspor ke Excel!', 'success');
}

function renderProblemPagination(totalPages) {
  const container = document.getElementById('probPaginationContainer');
  if (!container) return;
  container.innerHTML = '';

  if (totalPages <= 1) return;

  // Previous button
  const prevBtn = document.createElement('button');
  prevBtn.className = `page-item-btn btn-page btn-nav-prev ${probCurrentPage === 1 ? 'disabled' : ''}`;
  prevBtn.innerHTML = '<span>‹</span> Prev';
  prevBtn.title = 'Halaman Sebelumnya';
  prevBtn.disabled = (probCurrentPage === 1);
  prevBtn.onclick = () => {
    if (probCurrentPage > 1) {
      probCurrentPage--;
      renderProblemTable();
    }
  };
  container.appendChild(prevBtn);

  // Page Numbers with Intelligent Windowing
  let startPage = Math.max(1, probCurrentPage - 2);
  let endPage = Math.min(totalPages, probCurrentPage + 2);

  if (probCurrentPage <= 3) {
    endPage = Math.min(totalPages, 5);
  }
  if (probCurrentPage > totalPages - 3) {
    startPage = Math.max(1, totalPages - 4);
  }

  if (startPage > 1) {
    const firstBtn = document.createElement('button');
    firstBtn.className = 'page-item-btn btn-page';
    firstBtn.textContent = '1';
    firstBtn.onclick = () => { probCurrentPage = 1; renderProblemTable(); };
    container.appendChild(firstBtn);

    if (startPage > 2) {
      const dots = document.createElement('span');
      dots.className = 'pagination-ellipsis';
      dots.textContent = '...';
      container.appendChild(dots);
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.className = `page-item-btn btn-page ${probCurrentPage === i ? 'active' : ''}`;
    pageBtn.textContent = i;
    pageBtn.onclick = () => {
      probCurrentPage = i;
      renderProblemTable();
    };
    container.appendChild(pageBtn);
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      const dots = document.createElement('span');
      dots.className = 'pagination-ellipsis';
      dots.textContent = '...';
      container.appendChild(dots);
    }
    const lastBtn = document.createElement('button');
    lastBtn.className = 'page-item-btn btn-page';
    lastBtn.textContent = totalPages;
    lastBtn.onclick = () => { probCurrentPage = totalPages; renderProblemTable(); };
    container.appendChild(lastBtn);
  }

  // Next button
  const nextBtn = document.createElement('button');
  nextBtn.className = `page-item-btn btn-page btn-nav-next ${probCurrentPage === totalPages ? 'disabled' : ''}`;
  nextBtn.innerHTML = 'Next <span>›</span>';
  nextBtn.title = 'Halaman Berikutnya';
  nextBtn.disabled = (probCurrentPage === totalPages);
  nextBtn.onclick = () => {
    if (probCurrentPage < totalPages) {
      probCurrentPage++;
      renderProblemTable();
    }
  };
  container.appendChild(nextBtn);
}

function renderProblemTable() {
  initProblemLogControls();

  const tbody = document.getElementById('problemTableBody');
  const infoEl = document.getElementById('probRecordInfo');
  const titleEl = document.getElementById('probPanelTitle');
  const cardsGrid = document.getElementById('probMobileCardsContainer');

  if (!tbody) return;

  // 1. Filter Data
  let filtered = problemsData.filter(p => {
    if (!probSearchQuery) return true;
    const dur = getRealProblemDuration(p);
    const haystack = `${p.no || ''} ${p.date || ''} ${p.shift || ''} ${p.unit || ''} ${p.problem || ''} ${p.timeOpen || ''} ${p.timeClose || ''} ${dur}`.toLowerCase();
    return haystack.includes(probSearchQuery);
  });

  // 2. Sort Data
  filtered.sort((a, b) => {
    let valA, valB;
    switch (probSortColumn) {
      case 'no':
        valA = parseInt(a.no, 10) || 0;
        valB = parseInt(b.no, 10) || 0;
        break;
      case 'date':
        valA = parseDateForSort(a.date);
        valB = parseDateForSort(b.date);
        break;
      case 'shift':
        valA = parseInt(a.shift, 10) || 0;
        valB = parseInt(b.shift, 10) || 0;
        break;
      case 'unit':
        valA = String(a.unit || '').toLowerCase();
        valB = String(b.unit || '').toLowerCase();
        break;
      case 'problem':
        valA = String(a.problem || '').toLowerCase();
        valB = String(b.problem || '').toLowerCase();
        break;
      case 'timeOpen':
        valA = parseTimeToSeconds(a.timeOpen) || 0;
        valB = parseTimeToSeconds(b.timeOpen) || 0;
        break;
      case 'timeClose':
        valA = parseTimeToSeconds(a.timeClose) || 0;
        valB = parseTimeToSeconds(b.timeClose) || 0;
        break;
      case 'duration':
        valA = parseTimeToSeconds(getRealProblemDuration(a)) || 0;
        valB = parseTimeToSeconds(getRealProblemDuration(b)) || 0;
        break;
      default:
        valA = parseInt(a.no, 10) || 0;
        valB = parseInt(b.no, 10) || 0;
    }

    if (valA < valB) return probSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return probSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Update Sort Icon Indicators
  const sortMap = {
    no: 'sortIconProbNo',
    date: 'sortIconProbDate',
    shift: 'sortIconProbShift',
    unit: 'sortIconProbUnit',
    problem: 'sortIconProbDesc',
    timeOpen: 'sortIconProbOpen',
    timeClose: 'sortIconProbClose',
    duration: 'sortIconProbDur'
  };
  Object.keys(sortMap).forEach(k => {
    const el = document.getElementById(sortMap[k]);
    if (el) {
      if (k === probSortColumn) {
        el.textContent = probSortDirection === 'asc' ? '▲' : '▼';
        el.style.color = '#0b5394';
      } else {
        el.textContent = '⇅';
        el.style.color = '#999';
      }
    }
  });

  // 3. Pagination Slicing
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / probPerPage));
  if (probCurrentPage > totalPages) probCurrentPage = totalPages;

  const startIdx = (probCurrentPage - 1) * probPerPage;
  const endIdx = Math.min(startIdx + probPerPage, total);
  const pageItems = filtered.slice(startIdx, endIdx);

  // Update Header Title & Record Counter
  if (titleEl) {
    titleEl.textContent = `Problem & Downtime Incident Log (${total} Catatan)`;
  }
  if (infoEl) {
    infoEl.textContent = total > 0
      ? `Showing ${startIdx + 1} to ${endIdx} of ${total} entries`
      : 'Showing 0 to 0 of 0 entries';
  }

  // 4. Render Desktop Table Rows
  tbody.innerHTML = '';
  if (pageItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 28px; color: #888;">
          <div style="font-size: 24px; margin-bottom: 6px;">🔍</div>
          <div>Tidak ada catatan gangguan yang cocok dengan kata kunci pencarian.</div>
        </td>
      </tr>
    `;
  } else {
    pageItems.forEach(p => {
      const realDuration = getRealProblemDuration(p);
      const isDowntimeLong = (parseTimeToSeconds(realDuration) || 0) >= 1800; // >= 30m
      const durColor = isDowntimeLong ? '#b91c1c' : '#d97706';
      const shiftBadge = p.shift === '2' 
        ? '<span style="background:#fef3c7; color:#92400e; padding:2px 7px; border-radius:4px; font-weight:700; font-size:11px;">Shift 2</span>'
        : '<span style="background:#e0f2fe; color:#0369a1; padding:2px 7px; border-radius:4px; font-weight:700; font-size:11px;">Shift 1</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: var(--font-mono); font-weight: 600; text-align: center;">${p.no}</td>
        <td style="white-space: nowrap;">${p.date}</td>
        <td style="text-align: center;">${shiftBadge}</td>
        <td><strong style="color: #0b5394; font-size: 12.5px;">${p.unit.startsWith('DT') ? p.unit : 'DT ' + p.unit}</strong></td>
        <td>
          <div style="font-weight: 500; color: #1e293b; max-width: 320px; line-height: 1.35;">
            ${p.problem ? p.problem : '<span style="color:#94a3b8; font-style:italic;">(Tidak ada deskripsi rinci)</span>'}
          </div>
        </td>
        <td style="font-family: var(--font-mono); font-size: 11px; white-space: nowrap;">${p.timeOpen || '-'}</td>
        <td style="font-family: var(--font-mono); font-size: 11px; white-space: nowrap;">${p.timeClose || '-'}</td>
        <td style="color: ${durColor}; font-weight: 700; font-family: var(--font-mono); white-space: nowrap;">
          ${realDuration}
        </td>
        <td style="text-align: center;">
          <div class="table-actions-cell">
            <button type="button" class="btn-tbl-action edit" title="Edit Catatan" onclick="editProblemItem('${p.id}')">✏️</button>
            <button type="button" class="btn-tbl-action del" title="Hapus Catatan" onclick="deleteProblemItem('${p.id}')">🗑️</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // 5. Render Mobile Cards
  if (cardsGrid) {
    cardsGrid.innerHTML = '';
    if (pageItems.length === 0) {
      cardsGrid.innerHTML = `
        <div style="text-align: center; padding: 24px; color: #888; background: #fff; border-radius: 8px; border: 1px solid #e2e8f0;">
          Tidak ada data gangguan yang cocok.
        </div>
      `;
    } else {
      pageItems.forEach(p => {
        const realDuration = getRealProblemDuration(p);
        const isDowntimeLong = (parseTimeToSeconds(realDuration) || 0) >= 1800;
        const durColor = isDowntimeLong ? '#b91c1c' : '#d97706';

        const card = document.createElement('div');
        card.className = 'mobile-swap-card';
        card.innerHTML = `
          <div class="m-card-header">
            <div class="m-card-unit">
              <span class="m-unit-icon">🚨</span>
              <div>
                <div class="m-unit-title">${p.unit.startsWith('DT') ? p.unit : 'DT ' + p.unit}</div>
                <div style="font-size: 10.5px; color: #64748b;">No: #${p.no} • Shift ${p.shift} • ${p.date}</div>
              </div>
            </div>
            <span class="m-loc-pill" style="color: ${durColor}; font-weight: 700;">
              ⏳ ${realDuration}
            </span>
          </div>

          <div style="background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; font-size: 12px; color: #1e293b;">
            <strong>Kendala:</strong> ${p.problem || '<span style="color:#94a3b8;">-</span>'}
          </div>

          <div class="m-card-body-grid" style="grid-template-columns: 1fr 1fr; margin-bottom: 8px;">
            <div class="m-stat-row">
              <span class="m-stat-label">Jam Mulai (Open)</span>
              <span class="m-stat-val" style="font-family: var(--font-mono); font-size: 11px;">${p.timeOpen || '-'}</span>
            </div>
            <div class="m-stat-row">
              <span class="m-stat-label">Jam Selesai (Close)</span>
              <span class="m-stat-val" style="font-family: var(--font-mono); font-size: 11px;">${p.timeClose || '-'}</span>
            </div>
          </div>

          <div class="m-card-actions" style="display: flex; gap: 8px; justify-content: flex-end;">
            <button type="button" class="btn-m-action" onclick="editProblemItem('${p.id}')" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:5px 10px; border-radius:4px; font-size:11px; font-weight:600; cursor:pointer;">
              ✏️ Edit
            </button>
            <button type="button" class="btn-m-action" onclick="deleteProblemItem('${p.id}')" style="background:#fee2e2; color:#991b1b; border:1px solid #fecaca; padding:5px 10px; border-radius:4px; font-size:11px; font-weight:600; cursor:pointer;">
              🗑️ Hapus
            </button>
          </div>
        `;
        cardsGrid.appendChild(card);
      });
    }

    // Responsive toggle state for mobile
    const tableBox = document.getElementById('tableResponsiveBoxProb');
    if (cardsGrid && tableBox) {
      if (probMobileViewMode === 'cards') {
        cardsGrid.classList.remove('hide-mobile-cards');
        tableBox.classList.remove('force-table-show');
      } else {
        cardsGrid.classList.add('hide-mobile-cards');
        tableBox.classList.add('force-table-show');
      }
    }
  }

  // 6. Render Pagination Controls
  renderProblemPagination(totalPages);
}

// =============================================================================
// 10. PPA EXECUTIVE DASHBOARD (REPLICA: DASHBOARD MONITORING KETEPATAN SCH SWAB)
// =============================================================================

let chartPpaKetepatan = null;
let chartPpaFreqDaily = null;
let chartPpaFreqWeekly = null;
let chartPpaFreqMonthly = null;
let chartPpaRoomCompare = null;
let chartPpaEnergyUnit = null;
let chartPpaEnergyDaily = null;
let chartPpaProblemBreakdown = null;

let ppaExecPage = 1;
const ppaExecPerPage = 10;
let ppaFilteredSwaps = [];
let ppaDashboardInitialized = false;

// Custom Chart.js Plugin: Badges on Bars
const ppaBadgePlugin = {
  id: 'ppaBadgePlugin',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;
      meta.data.forEach((bar, index) => {
        const val = dataset.data[index];
        if (val === undefined || val === null) return;
        
        const badgeColor = dataset.badgeColors ? dataset.badgeColors[index] : (dataset.badgeColor || '#d32f2f');
        const badgeTextColor = dataset.badgeTextColor || '#ffffff';
        let text = dataset.badgeLabels ? dataset.badgeLabels[index] : String(val);

        ctx.save();
        ctx.font = 'bold 9.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const textWidth = ctx.measureText(text).width;
        const padX = 5;
        const bWidth = Math.max(textWidth + padX * 2, 18);
        const bHeight = 14;

        let x, y;
        if (chart.options.indexAxis === 'y') {
          x = Math.min(bar.x + 4, chart.chartArea.right - bWidth - 2);
          y = bar.y - bHeight / 2;
        } else {
          x = bar.x - bWidth / 2;
          y = Math.max(bar.y - bHeight - 2, chart.chartArea.top + 2);
        }

        ctx.fillStyle = badgeColor;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, bWidth, bHeight, 2);
        } else {
          ctx.rect(x, y, bWidth, bHeight);
        }
        ctx.fill();

        ctx.fillStyle = badgeTextColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + bWidth / 2, y + bHeight / 2);
        ctx.restore();
      });
    });
  }
};

// Custom Chart.js Plugin: Center Text for Donut Chart
const ppaDonutCenterPlugin = {
  id: 'ppaDonutCenterPlugin',
  beforeDraw(chart) {
    if (chart.config.type !== 'doughnut') return;
    const { width, height, ctx } = chart;
    ctx.save();
    const centerVal = chart.config.options?.plugins?.centerValue || '100%';
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#0b5394';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(centerVal, width / 2, height / 2 - 4);
    ctx.restore();
  }
};

function initPpaDashboardControls() {
  if (ppaDashboardInitialized) return;
  ppaDashboardInitialized = true;

  // Populate Unit Dropdown
  const unitSelect = document.getElementById('ppaFilterUnit');
  if (unitSelect) {
    const prev = unitSelect.value;
    unitSelect.innerHTML = '<option value="ALL">Semua Unit</option>';
    fleetUnits.forEach(u => {
      const code = typeof u === 'object' ? u.code : u;
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = `DT ${code}`;
      unitSelect.appendChild(opt);
    });
    if (prev) unitSelect.value = prev;
  }

  // Bind change listeners to all filter controls
  ['ppaFilterShift', 'ppaFilterLocation', 'ppaFilterUnit', 'ppaFilterStatus', 'ppaFilterProblem', 'ppaFilterDate', 'ppaFilterWeek'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        ppaExecPage = 1;
        updatePpaExecutiveDashboard();
      });
      if (el.tagName === 'INPUT') {
        el.addEventListener('input', () => {
          ppaExecPage = 1;
          updatePpaExecutiveDashboard();
        });
      }
    }
  });

  // Table pagination buttons
  const btnPrev = document.getElementById('ppaTablePrev');
  const btnNext = document.getElementById('ppaTableNext');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (ppaExecPage > 1) {
        ppaExecPage--;
        renderPpaExecTable();
      }
    });
  }
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const totalPages = Math.ceil(ppaFilteredSwaps.length / ppaExecPerPage);
      if (ppaExecPage < totalPages) {
        ppaExecPage++;
        renderPpaExecTable();
      }
    });
  }
}

function renderPpaExecutiveDashboard() {
  initPpaDashboardControls();
  updatePpaExecutiveDashboard();
}

function updatePpaExecutiveDashboard() {
  // Read Filter Values
  const shiftVal = document.getElementById('ppaFilterShift')?.value || 'ALL';
  const locVal = document.getElementById('ppaFilterLocation')?.value || 'ALL';
  const unitVal = document.getElementById('ppaFilterUnit')?.value || 'ALL';
  const statusVal = document.getElementById('ppaFilterStatus')?.value || 'ALL';
  const probVal = document.getElementById('ppaFilterProblem')?.value || 'ALL';
  const dateVal = document.getElementById('ppaFilterDate')?.value || 'ALL';

  // Filter Data
  ppaFilteredSwaps = swapsData.filter(s => {
    if (shiftVal !== 'ALL' && String(s.shift) !== String(shiftVal)) return false;
    if (locVal !== 'ALL' && s.location !== locVal) return false;
    if (unitVal !== 'ALL' && String(s.unit) !== String(unitVal)) return false;
    if (statusVal !== 'ALL') {
      const sStat = (s.statusRemark || 'On Time').trim().toLowerCase();
      if (sStat !== statusVal.trim().toLowerCase()) return false;
    }
    if (probVal !== 'ALL') {
      const sProb = (s.problemRemark || '13.NO PROBLEM').trim().toLowerCase();
      if (!sProb.includes(probVal.trim().toLowerCase())) return false;
    }
    if (dateVal !== 'ALL') {
      const sDate = (s.date || '').trim();
      if (sDate !== dateVal.trim()) return false;
    }
    return true;
  });

  // Calculate KPIs
  const distinctUnits = new Set(ppaFilteredSwaps.map(s => s.unit)).size || (fleetUnits.length || 55);
  const totalSwaps = ppaFilteredSwaps.length;
  const totalEnergy = ppaFilteredSwaps.reduce((acc, s) => acc + (parseFloat(s.energyKwh) || 0), 0);
  const avgUsage = totalSwaps > 0 ? (totalEnergy / totalSwaps).toFixed(2) : '306.45';
  const avgChargingTime = totalSwaps > 0 ? (ppaFilteredSwaps.reduce((acc, s) => acc + (parseFloat(s.durationMin) || 6.57), 0) / totalSwaps).toFixed(2) : '6.57';

  // Update KPI Cards DOM
  const kpiUnit = document.getElementById('ppaKpiTotalUnit');
  const kpiFreq = document.getElementById('ppaKpiFreqSwab');
  const kpiEnergy = document.getElementById('ppaKpiTotalEnergy');
  const kpiAvg = document.getElementById('ppaKpiAvgUsage');
  const kpiTime = document.getElementById('ppaKpiChargingTime');

  if (kpiUnit) kpiUnit.textContent = distinctUnits;
  if (kpiFreq) kpiFreq.textContent = totalSwaps.toLocaleString('id-ID');
  if (kpiEnergy) kpiEnergy.textContent = totalEnergy.toLocaleString('id-ID');
  if (kpiAvg) kpiAvg.textContent = avgUsage;
  if (kpiTime) kpiTime.textContent = avgChargingTime;

  // Render 8 Charts
  renderChartKetepatan();
  renderChartFreqDaily();
  renderChartFreqWeekly();
  renderChartFreqMonthly();
  renderChartRoomCompare();
  renderChartEnergyUnit();
  renderChartEnergyDaily();
  renderChartProblemBreakdown();

  // Render Table
  renderPpaExecTable();
}

// -----------------------------------------------------------------------------
// CHARTS RENDERING (MATCHING USER SCREENSHOT)
// -----------------------------------------------------------------------------

// 1. Ach Ketepatan Sch Swab (Donut 100%)
function renderChartKetepatan() {
  const canvas = document.getElementById('ppaChartKetepatan');
  if (!canvas) return;
  if (chartPpaKetepatan) chartPpaKetepatan.destroy();

  const onTimeCount = ppaFilteredSwaps.filter(s => (s.statusRemark || 'On Time') === 'On Time').length;
  const total = ppaFilteredSwaps.length || 1;
  const pct = Math.round((onTimeCount / total) * 100);

  chartPpaKetepatan = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['ON SCHEDULE', 'OUT OFF SCHEDULE'],
      datasets: [{
        data: [onTimeCount || 1, total - onTimeCount],
        backgroundColor: ['#2979ff', '#e0e0e0'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 8,
            boxHeight: 8,
            font: { size: 9.5, weight: 'bold' },
            generateLabels: () => [{
              text: 'ON SCHEDULE',
              fillStyle: '#2979ff',
              strokeStyle: '#2979ff',
              lineWidth: 0,
              pointStyle: 'circle'
            }]
          }
        },
        centerValue: `${pct}%`,
        tooltip: { enabled: true }
      }
    },
    plugins: [ppaDonutCenterPlugin]
  });
}

// 2. Trend Frekuensi Swab Daily (9 Sept: 81, 10 Sept: 84, 11 Sept: 77)
function renderChartFreqDaily() {
  const canvas = document.getElementById('ppaChartFreqDaily');
  if (!canvas) return;
  if (chartPpaFreqDaily) chartPpaFreqDaily.destroy();

  // Aggregate by 9 Sept, 10 Sept, 11 Sept
  let c9 = 0, c10 = 0, c11 = 0;
  ppaFilteredSwaps.forEach(s => {
    const d = s.dateDisplay || s.date || '';
    if (d.includes('9 Sept') || d.includes('09/09')) c9++;
    else if (d.includes('10 Sept') || d.includes('10/09')) c10++;
    else if (d.includes('11 Sept') || d.includes('11/09')) c11++;
    else c11++;
  });

  chartPpaFreqDaily = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['9 Sept', '10 Sept', '11 Sept'],
      datasets: [{
        label: 'Frekuensi',
        data: [c9, c10, c11],
        backgroundColor: '#3b82f6',
        borderRadius: 2,
        barPercentage: 0.65,
        badgeColor: '#d32f2f'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { display: false, max: Math.max(c9, c10, c11, 10) * 1.25 },
        x: {
          grid: { display: false },
          ticks: { font: { size: 9.5, weight: '600' }, color: '#555' }
        }
      }
    },
    plugins: [ppaBadgePlugin]
  });
}

// 3. Trend Ach Frekuensi Swab Weekly (W37: 242)
function renderChartFreqWeekly() {
  const canvas = document.getElementById('ppaChartFreqWeekly');
  if (!canvas) return;
  if (chartPpaFreqWeekly) chartPpaFreqWeekly.destroy();

  const total = ppaFilteredSwaps.length;

  chartPpaFreqWeekly = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['W37'],
      datasets: [{
        label: 'ON SCHEDULE',
        data: [total],
        backgroundColor: '#3b82f6',
        borderRadius: 2,
        barPercentage: 0.45,
        badgeColor: '#f59e0b'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'center',
          labels: {
            boxWidth: 8,
            boxHeight: 8,
            font: { size: 9, weight: 'bold' }
          }
        }
      },
      scales: {
        y: { display: false, max: Math.max(total, 10) * 1.25 },
        x: {
          grid: { display: false },
          ticks: { font: { size: 9.5, weight: '600' }, color: '#555' }
        }
      }
    },
    plugins: [ppaBadgePlugin]
  });
}

// 4. Trend Ach Frekuensi Swab Monthly (September: 242)
function renderChartFreqMonthly() {
  const canvas = document.getElementById('ppaChartFreqMonthly');
  if (!canvas) return;
  if (chartPpaFreqMonthly) chartPpaFreqMonthly.destroy();

  const total = ppaFilteredSwaps.length;

  chartPpaFreqMonthly = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['September'],
      datasets: [{
        label: 'Record Count',
        data: [total],
        backgroundColor: '#3b82f6',
        borderRadius: 2,
        barPercentage: 0.45,
        badgeColor: 'transparent',
        badgeTextColor: '#333333'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'center',
          labels: {
            boxWidth: 8,
            boxHeight: 8,
            font: { size: 9, weight: 'bold' }
          }
        }
      },
      scales: {
        y: { display: false, max: Math.max(total, 10) * 1.25 },
        x: {
          grid: { display: false },
          ticks: { font: { size: 9.5, weight: '600' }, color: '#555' }
        }
      }
    },
    plugins: [ppaBadgePlugin]
  });
}

// 5. Swab ROM A1 VS ROM A2 (ROOM A2: 135, ROOM A1: 107 in red bars with blue badges)
function renderChartRoomCompare() {
  const canvas = document.getElementById('ppaChartRoomCompare');
  if (!canvas) return;
  if (chartPpaRoomCompare) chartPpaRoomCompare.destroy();

  let a1 = 0, a2 = 0;
  ppaFilteredSwaps.forEach(s => {
    if (s.location === 'ROOM A1') a1++;
    else if (s.location === 'ROOM A2') a2++;
  });

  chartPpaRoomCompare = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['ROOM A2', 'ROOM A1'],
      datasets: [{
        label: 'Swab Count',
        data: [a2, a1],
        backgroundColor: '#b71c1c',
        borderRadius: 2,
        barPercentage: 0.55,
        badgeColor: '#1976d2'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { display: false, max: Math.max(a1, a2, 10) * 1.25 },
        x: {
          grid: { display: false },
          ticks: { font: { size: 9.5, weight: '700' }, color: '#333' }
        }
      }
    },
    plugins: [ppaBadgePlugin]
  });
}

// 6. Trend Energi Per Unit (Top kWh)
function renderChartEnergyUnit() {
  const canvas = document.getElementById('ppaChartEnergyUnit');
  if (!canvas) return;
  if (chartPpaEnergyUnit) chartPpaEnergyUnit.destroy();

  // Aggregate energy by unit
  const unitEnergyMap = {};
  ppaFilteredSwaps.forEach(s => {
    unitEnergyMap[s.unit] = (unitEnergyMap[s.unit] || 0) + (parseFloat(s.energyKwh) || 0);
  });

  // Pick top 16 units or sequential units matching screenshot
  const sortedUnits = Object.keys(unitEnergyMap).sort((a, b) => parseInt(a) - parseInt(b)).slice(0, 16);
  const labels = sortedUnits.length > 0 ? sortedUnits : ['1601', '1604', '1607', '1610', '1613', '1616', '1619', '1623', '1626', '1629'];
  const values = labels.map(u => unitEnergyMap[u] || Math.round(1000 + Math.random() * 1500));

  chartPpaEnergyUnit = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Energy (kWh)',
        data: values,
        backgroundColor: '#3b82f6',
        borderRadius: 1,
        barPercentage: 0.7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          ticks: {
            font: { size: 8.5 },
            callback: (v) => v >= 1000 ? `${v / 1000}k` : v
          },
          grid: { color: '#f0f0f0' },
          max: 3000
        },
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 7.5 },
            maxRotation: 45,
            minRotation: 45
          }
        }
      }
    }
  });
}

// 7. Trend Energi Per Hari (Daily) (9 Sept: 25k, 10 Sept: 26k, 11 Sept: 24k)
function renderChartEnergyDaily() {
  const canvas = document.getElementById('ppaChartEnergyDaily');
  if (!canvas) return;
  if (chartPpaEnergyDaily) chartPpaEnergyDaily.destroy();

  let e9 = 0, e10 = 0, e11 = 0;
  ppaFilteredSwaps.forEach(s => {
    const d = s.dateDisplay || s.date || '';
    const nrg = parseFloat(s.energyKwh) || 0;
    if (d.includes('9 Sept') || d.includes('09/09')) e9 += nrg;
    else if (d.includes('10 Sept') || d.includes('10/09')) e10 += nrg;
    else if (d.includes('11 Sept') || d.includes('11/09')) e11 += nrg;
    else e11 += nrg;
  });

  const bLabels = [
    `${Math.round(e9 / 1000)}k`,
    `${Math.round(e10 / 1000)}k`,
    `${Math.round(e11 / 1000)}k`
  ];

  chartPpaEnergyDaily = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['9 Sept 2026', '10 Sept 2026', '11 Sept 2026'],
      datasets: [{
        label: 'Total Energy (kWh)',
        data: [e9, e10, e11],
        backgroundColor: '#3b82f6',
        borderRadius: 2,
        barPercentage: 0.65,
        badgeColor: '#d32f2f',
        badgeLabels: bLabels
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          ticks: {
            font: { size: 8.5 },
            callback: (v) => v >= 1000 ? `${v / 1000}k` : v
          },
          grid: { color: '#f0f0f0' },
          max: 30000
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 8.5, weight: '600' } }
        }
      }
    },
    plugins: [ppaBadgePlugin]
  });
}

// 8. Frekuensi Problem Breakdown (Horizontal Bar: 13.NO PROBLEM: 239, 15.BATTERY LOW POWER: 2, 03.SWAP STATION ERROR: 1)
function renderChartProblemBreakdown() {
  const canvas = document.getElementById('ppaChartProblemBreakdown');
  if (!canvas) return;
  if (chartPpaProblemBreakdown) chartPpaProblemBreakdown.destroy();

  const probCountMap = {};
  ppaFilteredSwaps.forEach(s => {
    const p = s.problemRemark || '13.NO PROBLEM';
    probCountMap[p] = (probCountMap[p] || 0) + 1;
  });

  const sortedProblems = Object.keys(probCountMap).sort((a, b) => probCountMap[b] - probCountMap[a]);
  const labels = sortedProblems.length > 0 ? sortedProblems : ['13.NO PROBLEM', '15.BATTERY LOW POWER', '03.SWAP STATION ERROR'];
  const values = labels.map(l => probCountMap[l] || 0);

  chartPpaProblemBreakdown = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Frekuensi',
        data: values,
        backgroundColor: '#3b82f6',
        borderRadius: 2,
        barPercentage: 0.45,
        badgeColor: '#d32f2f'
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { color: '#f0f0f0' },
          ticks: { font: { size: 8.5 } },
          max: Math.max(...values, 10) * 1.15
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 8.5, weight: '700' }, color: '#333' }
        }
      }
    },
    plugins: [ppaBadgePlugin]
  });
}

// -----------------------------------------------------------------------------
// EXECUTIVE DATA TABLE (MATCHING USER SCREENSHOT)
// -----------------------------------------------------------------------------
function renderPpaExecTable() {
  const tbody = document.getElementById('ppaExecTableBody');
  const rangeText = document.getElementById('ppaTableRangeText');
  if (!tbody) return;

  tbody.innerHTML = '';
  const total = ppaFilteredSwaps.length;

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 20px; color: #888;">Tidak ada data swap sesuai filter yang dipilih.</td></tr>`;
    if (rangeText) rangeText.textContent = '0 - 0 / 0';
    return;
  }

  const startIdx = (ppaExecPage - 1) * ppaExecPerPage;
  const endIdx = Math.min(startIdx + ppaExecPerPage, total);
  const pageItems = ppaFilteredSwaps.slice(startIdx, endIdx);

  pageItems.forEach((s, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.dateDisplay || s.date}</td>
      <td style="text-align: center;">${s.shift}</td>
      <td>${s.category || 'CHARGING SWAP'}</td>
      <td style="font-weight: 700; color: #0b5394;">${s.unit}</td>
      <td style="color: #888; font-style: italic;">null</td>
      <td style="font-family: var(--font-mono);">${s.jamIn ? s.jamIn.substring(0, 5) : '20:00'}</td>
      <td style="font-weight: 600; color: #2e7d32;">ON SCHEDULE</td>
      <td>${s.problemRemark || '13.NO PROBLEM'}</td>
      <td style="text-align: right; font-weight: 700; font-family: var(--font-mono);">${s.energyKwh}</td>
    `;
    tbody.appendChild(tr);
  });

  if (rangeText) {
    rangeText.textContent = `${startIdx + 1} - ${endIdx} / ${total}`;
  }
}

// =============================================================================
// 10.5. HISTORY DAILY (GROUPED BY UNIT & FREQUENCY ACCORDION)
// =============================================================================
let dailyCurrentPage = 1;
let dailyEntriesPerPage = 25;
let dailyGroupedList = [];
let dailyExpandedUnit = null; // Only one unit can be expanded at a time
let dailyControlsInitialized = false;

function initDailyHistoryControls() {
  if (dailyControlsInitialized) return;
  dailyControlsInitialized = true;

  const btnApply = document.getElementById('btnApplyDailyFilter');
  if (btnApply) {
    btnApply.addEventListener('click', () => {
      dailyCurrentPage = 1;
      renderHistoryDaily();
    });
  }

  ['dailyFilterDate', 'dailyFilterShift', 'dailyFilterLoc', 'dailyFilterFreq'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        dailyCurrentPage = 1;
        renderHistoryDaily();
      });
    }
  });

  const searchInput = document.getElementById('dailySearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      dailyCurrentPage = 1;
      renderDailyTable();
    });
  }

  const entriesSelect = document.getElementById('dailyEntriesSelect');
  if (entriesSelect) {
    entriesSelect.addEventListener('change', (e) => {
      dailyEntriesPerPage = parseInt(e.target.value) || 25;
      dailyCurrentPage = 1;
      renderDailyTable();
    });
  }

  const btnExport = document.getElementById('btnExportDailyExcel');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      exportDailyToCSV();
    });
  }
}

function renderHistoryDaily() {
  initDailyHistoryControls();
  
  const selDate = document.getElementById('dailyFilterDate')?.value || 'ALL';
  const selShift = document.getElementById('dailyFilterShift')?.value || 'ALL';
  const selLoc = document.getElementById('dailyFilterLoc')?.value || 'ALL';
  const selFreq = document.getElementById('dailyFilterFreq')?.value || 'ALL';

  // Update badge title
  const dateBadge = document.getElementById('dailyDateTitleBadge');
  if (dateBadge) {
    if (selDate === 'ALL') dateBadge.textContent = 'Semua Tanggal';
    else dateBadge.textContent = formatDateLabel(selDate);
  }

  // Filter raw swaps
  const filteredSwaps = swapsData.filter(s => {
    if (selDate !== 'ALL' && s.date !== selDate) return false;
    if (selShift !== 'ALL' && s.shift !== selShift) return false;
    if (selLoc !== 'ALL' && s.location !== selLoc) return false;
    return true;
  });

  // Group by unit
  const unitMap = {};
  filteredSwaps.forEach(s => {
    if (!unitMap[s.unit]) {
      unitMap[s.unit] = {
        unit: s.unit,
        swaps: [],
        totalEnergy: 0,
        totalDuration: 0
      };
    }
    unitMap[s.unit].swaps.push(s);
    unitMap[s.unit].totalEnergy += (parseFloat(s.energyKwh) || 0);
    unitMap[s.unit].totalDuration += (parseFloat(s.durationMin) || 6);
  });

  let groups = Object.values(unitMap);

  // Sort swaps chronologically inside each unit
  groups.forEach(g => {
    g.swaps.sort((a, b) => (a.jamIn || '').localeCompare(b.jamIn || ''));
    g.frequency = g.swaps.length;
  });

  // Apply frequency filter
  if (selFreq === '3+') {
    groups = groups.filter(g => g.frequency >= 3);
  } else if (selFreq === '2') {
    groups = groups.filter(g => g.frequency === 2);
  } else if (selFreq === '1') {
    groups = groups.filter(g => g.frequency === 1);
  }

  // Sort units: most swaps first, then unit code ascending
  groups.sort((a, b) => {
    if (b.frequency !== a.frequency) return b.frequency - a.frequency;
    return parseInt(a.unit) - parseInt(b.unit);
  });

  dailyGroupedList = groups;

  // Update Mini Stat Chips
  const activeUnits = groups.length;
  const totalSwapsCount = groups.reduce((acc, g) => acc + g.frequency, 0);
  const totalEnergySum = groups.reduce((acc, g) => acc + g.totalEnergy, 0);
  const topUnitObj = groups[0];
  const topUnitText = topUnitObj ? `DT ${topUnitObj.unit} (${topUnitObj.frequency}x Swap)` : '-';

  const statUnits = document.getElementById('dailyStatActiveUnits');
  const statSwaps = document.getElementById('dailyStatTotalSwaps');
  const statEnergy = document.getElementById('dailyStatTotalEnergy');
  const statTop = document.getElementById('dailyStatTopUnit');

  if (statUnits) statUnits.textContent = `${activeUnits} Unit`;
  if (statSwaps) statSwaps.textContent = `${totalSwapsCount} Kali`;
  if (statEnergy) statEnergy.textContent = `${totalEnergySum.toLocaleString('id-ID')} kWh`;
  if (statTop) statTop.textContent = topUnitText;

  renderDailyTable();
}

function renderDailyTable() {
  const tbody = document.getElementById('dailyTableBody');
  const recordInfo = document.getElementById('dailyRecordInfo');
  const pagination = document.getElementById('dailyPaginationContainer');
  if (!tbody) return;

  tbody.innerHTML = '';

  const searchKeyword = document.getElementById('dailySearchInput')?.value?.trim().toLowerCase() || '';
  let filtered = dailyGroupedList;
  if (searchKeyword) {
    filtered = filtered.filter(g => g.unit.toLowerCase().includes(searchKeyword));
  }

  const total = filtered.length;
  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 25px; color: #888;">Tidak ada unit yang melakukan swap pada tanggal & filter ini.</td></tr>`;
    if (recordInfo) recordInfo.textContent = 'Showing 0 to 0 of 0 entries';
    if (pagination) pagination.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(total / dailyEntriesPerPage);
  if (dailyCurrentPage > totalPages) dailyCurrentPage = totalPages;
  const startIdx = (dailyCurrentPage - 1) * dailyEntriesPerPage;
  const endIdx = Math.min(startIdx + dailyEntriesPerPage, total);
  const pageItems = filtered.slice(startIdx, endIdx);

  pageItems.forEach((item, idx) => {
    const isExpanded = (dailyExpandedUnit === item.unit);
    const rowNum = startIdx + idx + 1;

    // Frequency badge styling
    let badgeClass = 'badge-freq-1';
    let badgeLabel = `${item.frequency}x SWAP`;
    if (item.frequency === 2) {
      badgeClass = 'badge-freq-2';
    } else if (item.frequency === 3) {
      badgeClass = 'badge-freq-3';
      badgeLabel = `⭐ 3x SWAP`;
    } else if (item.frequency >= 4) {
      badgeClass = 'badge-freq-4';
      badgeLabel = `🔥 ${item.frequency}x SWAP`;
    }

    // Timeline Pills
    const timelineHtml = item.swaps.map(s => {
      const roomClass = s.location === 'ROOM A1' ? 'room-a1' : 'room-a2';
      const timeStr = s.jamIn ? s.jamIn.substring(0, 5) : '-';
      const roomShort = s.location === 'ROOM A1' ? 'R1' : 'R2';
      return `<span class="timeline-pill ${roomClass}" title="${s.id} | ${s.location} | Shift ${s.shift} | ${s.energyKwh} kWh">${timeStr} <span class="pill-shift">S${s.shift} · ${roomShort}</span></span>`;
    }).join(' ');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align: center; font-family: var(--font-mono);">${rowNum}</td>
      <td>
        <strong style="color: #0b5394; font-size: 12.5px; display: inline-flex; align-items: center; gap: 4px;">
          <span>🚜</span> DT ${item.unit}
        </strong>
      </td>
      <td style="text-align: center;">
        <span class="badge-freq-pill ${badgeClass}">${badgeLabel}</span>
      </td>
      <td style="text-align: right; font-weight: 700; font-family: var(--font-mono); color: #1e293b;">
        ${item.totalEnergy.toLocaleString('id-ID')}
      </td>
      <td style="text-align: center; color: #555;">
        ${item.totalDuration} Menit
      </td>
      <td>
        <div class="daily-timeline-wrap">
          ${timelineHtml}
        </div>
      </td>
      <td style="text-align: center;">
        <button class="btn-toggle-detail ${isExpanded ? 'active' : ''}" onclick="toggleDailyUnitDetail('${item.unit}')">
          <span>${isExpanded ? '▴ Tutup' : '▾ Rincian'}</span>
        </button>
      </td>
    `;
    tbody.appendChild(tr);

    // If expanded, render sub-row
    if (isExpanded) {
      const subTr = document.createElement('tr');
      subTr.className = 'daily-expand-row';

      let nestedRows = item.swaps.map((s, sIdx) => `
        <tr>
          <td style="font-weight: 700; color: #0b5394;">Swap #${sIdx + 1}</td>
          <td style="font-family: var(--font-mono);">${s.id}</td>
          <td style="font-family: var(--font-mono); font-weight: 600;">${s.jamIn ? s.jamIn.substring(0, 5) : '-'} - ${s.jamOut ? s.jamOut.substring(0, 5) : '-'}</td>
          <td><span style="font-weight: 600; color: ${s.location === 'ROOM A1' ? '#0b5394' : '#00a65a'};">${s.location}</span> (Shift ${s.shift})</td>
          <td style="white-space: nowrap; font-size: 11px;">
            <span style="font-weight: 600; color: #1e293b;">${s.operator || 'ZAKARIYA ABIDIN'}</span>
          </td>
          <td style="font-family: var(--font-mono);">${s.hm || '-'}</td>
          <td style="font-weight: 600;">${formatBatteryPercentage(s.batteryBefore)} ➔ <span style="color: #00a65a;">${formatBatteryPercentage(s.batteryAfter)}</span></td>
          <td style="font-weight: 700; font-family: var(--font-mono);">${s.energyKwh} kWh</td>
          <td>${s.durationMin || 6} Menit</td>
          <td><span class="status-tag ontime">${s.statusRemark || 'On Time'}</span></td>
          <td style="color: #666;">${s.problemRemark || '13.NO PROBLEM'}</td>
          <td style="text-align: center;">
            <button class="btn-tbl-action view" title="Preview Transaksi" onclick="previewRecord('${s.id}')">👁️</button>
          </td>
        </tr>
      `).join('');

      subTr.innerHTML = `
        <td colspan="7" style="padding: 0;">
          <div class="daily-nested-container">
            <div class="daily-nested-title">
              <span>📋 Rincian Transaksi Swap Harian: <strong>DT ${item.unit}</strong> (${item.frequency}x Transaksi)</span>
              <span style="color: #64748b; font-size: 11px;">Total Konsumsi: <strong>${item.totalEnergy} kWh</strong> | Total Waktu: <strong>${item.totalDuration} Menit</strong></span>
            </div>
            <div style="overflow-x: auto;">
              <table class="daily-nested-table">
                <thead>
                  <tr>
                    <th>Urutan</th>
                    <th>ID Transaksi</th>
                    <th>Jam Swap</th>
                    <th>Fasilitas</th>
                    <th>Manpower</th>
                    <th>HM</th>
                    <th>Baterai SOC</th>
                    <th>Energi</th>
                    <th>Durasi</th>
                    <th>Ketepatan</th>
                    <th>Problem Remark</th>
                    <th style="text-align: center;">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  ${nestedRows}
                </tbody>
              </table>
            </div>
          </div>
        </td>
      `;
      tbody.appendChild(subTr);
    }
  });

  if (recordInfo) {
    recordInfo.textContent = `Showing ${startIdx + 1} to ${endIdx} of ${total} entries`;
  }

  // Render pagination
  renderDailyPagination(totalPages);
}

window.toggleDailyUnitDetail = function(unitCode) {
  if (dailyExpandedUnit === unitCode) {
    dailyExpandedUnit = null;
  } else {
    dailyExpandedUnit = unitCode;
  }
  renderDailyTable();
};

function renderDailyPagination(totalPages) {
  const container = document.getElementById('dailyPaginationContainer');
  if (!container) return;
  container.innerHTML = '';

  if (totalPages <= 1) return;

  const prevBtn = document.createElement('button');
  prevBtn.className = `page-item-btn btn-page btn-nav-prev ${dailyCurrentPage === 1 ? 'disabled' : ''}`;
  prevBtn.innerHTML = '<span>‹</span> Prev';
  prevBtn.title = 'Halaman Sebelumnya';
  prevBtn.disabled = (dailyCurrentPage === 1);
  prevBtn.onclick = () => {
    if (dailyCurrentPage > 1) {
      dailyCurrentPage--;
      renderDailyTable();
    }
  };
  container.appendChild(prevBtn);

  for (let i = 1; i <= totalPages; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.className = `page-item-btn btn-page ${dailyCurrentPage === i ? 'active' : ''}`;
    pageBtn.textContent = i;
    pageBtn.onclick = () => {
      dailyCurrentPage = i;
      renderDailyTable();
    };
    container.appendChild(pageBtn);
  }

  const nextBtn = document.createElement('button');
  nextBtn.className = `page-item-btn btn-page btn-nav-next ${dailyCurrentPage === totalPages ? 'disabled' : ''}`;
  nextBtn.innerHTML = 'Next <span>›</span>';
  nextBtn.title = 'Halaman Berikutnya';
  nextBtn.disabled = (dailyCurrentPage === totalPages);
  nextBtn.onclick = () => {
    if (dailyCurrentPage < totalPages) {
      dailyCurrentPage++;
      renderDailyTable();
    }
  };
  container.appendChild(nextBtn);
}

function exportDailyToCSV() {
  if (!dailyGroupedList || dailyGroupedList.length === 0) {
    showToast("Tidak ada data untuk diekspor", "warning");
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "No,Kode Unit,Frekuensi Swap,Total Energi (kWh),Total Durasi (Menit),Jam Swap Breakdown\n";

  dailyGroupedList.forEach((g, idx) => {
    const breakdown = g.swaps.map(s => `${s.jamIn ? s.jamIn.substring(0,5) : ''} (${s.location}-S${s.shift})`).join('; ');
    csvContent += `"${idx + 1}","DT ${g.unit}","${g.frequency}","${g.totalEnergy}","${g.totalDuration}","${breakdown}"\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `History_Daily_Swap_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("File Rekap Harian berhasil diunduh!", "success");
}

// =============================================================================
// 11. INITIALIZATION ENTRY POINT
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initDataState();
  
  const isLoggedIn = (localStorage.getItem('voltswap_is_logged_in') === 'true');
  if (isLoggedIn) {
    document.documentElement.classList.remove('needs-login');
    currentAuthUser = getSavedAuthUser();
    applyAuthUserSession(currentAuthUser);
  } else {
    document.documentElement.classList.add('needs-login');
  }

  initOperatorAuthModal();
  initSplitCardLogin();
  initNavigation();
  initTableControls();
  initPopulasiUnitControls();
  populateUnitSelects();
  populateDateFilters();
  renderMainTable();
  updateSummaryCard();

  // Auto-load data terbaru dari Google Sheets (jika berjalan di GAS)
  if (isLoggedIn) {
    gasSync.loadAll(function(loaded) {
      if (loaded) {
        populateUnitSelects();
        renderMainTable();
        updateSummaryCard();
      }
    });
  }

  // Register PWA Service Worker (hanya di lokal, bukan di GAS)
  if ('serviceWorker' in navigator && window.self === window.top && !location.hostname.includes('google') && !IS_GAS_ENV) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        console.log('⚡ PWA ServiceWorker aktif dengan scope:', reg.scope);
      }).catch((err) => {
        console.warn('PWA ServiceWorker notice:', err);
      });
    });
  }
});

// =============================================================================
// SCHEDULE MODE & QUEUE MANAGEMENT LOGIC
// =============================================================================

function calculateMinutesDifference(timeA, timeB) {
  if (!timeA || !timeB) return 0;
  const parse = (t) => {
    const parts = t.split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  };
  return parse(timeA) - parse(timeB);
}

function updateDedSwapScheduleTarget() {
  const isScheduleOn = (localStorage.getItem('voltswap_schedule_mode') === 'ON');
  const groupSch = document.getElementById('groupDedSwapSchedule');
  const schInput = document.getElementById('dedSwapTimeSch');
  const schNotice = document.getElementById('dedSwapSchNotice');
  const statusSelect = document.getElementById('dedSwapStatus');
  const remarkSelect = document.getElementById('dedSwapRemark2');
  const unitSelect = document.getElementById('dedSwapUnit');
  const shiftSelect = document.getElementById('dedSwapShift');
  const jamInInput = document.getElementById('dedSwapJamIn');

  if (!isScheduleOn) {
    if (groupSch) groupSch.style.display = 'none';
    if (statusSelect && !statusSelect.value) {
      statusSelect.value = 'On Time';
    }
    if (statusSelect && statusSelect.value === 'On Time' && remarkSelect && !remarkSelect.value) {
      remarkSelect.value = '13.NO PROBLEM';
    }
    if (typeof window.updateKeteranganRequirement === 'function') {
      window.updateKeteranganRequirement();
    }
    return;
  }

  if (groupSch) groupSch.style.display = 'block';

  const rawUnit = unitSelect ? unitSelect.value.trim() : '';
  const matchDigit = rawUnit.match(/\b\d{4}\b/) || rawUnit.match(/\d+/);
  const unitVal = matchDigit ? matchDigit[0] : rawUnit.replace(/^DT[- ]?/i, '').trim();
  const shiftVal = shiftSelect ? shiftSelect.value.trim() : '1';

  // Search in schedulesData
  const match = schedulesData.find(s => s.unit === unitVal && String(s.shift) === String(shiftVal));
  if (match) {
    if (schInput) schInput.value = match.timeSch;
    if (schNotice) {
      schNotice.innerHTML = `🎯 Target: <strong>${match.timeSch}</strong>`;
      schNotice.style.color = '#0284c7';
    }

    if (jamInInput && jamInInput.value) {
      const jamInTime = jamInInput.value.trim();
      const diffMins = calculateMinutesDifference(jamInTime, match.timeSch);
      if (Math.abs(diffMins) <= 15) {
        if (statusSelect) statusSelect.value = 'On Time';
        if (remarkSelect) remarkSelect.value = '13.NO PROBLEM';
        if (schNotice) schNotice.innerHTML = `🟢 On Schedule (${diffMins >= 0 ? '+' : ''}${diffMins}m)`;
      } else {
        if (statusSelect) statusSelect.value = 'Out Off Time';
        if (schNotice) schNotice.innerHTML = `🔴 Out Off Schedule (${diffMins >= 0 ? '+' : ''}${diffMins}m)`;
      }
    }
  } else {
    if (schInput) schInput.value = '-';
    if (schNotice) {
      schNotice.innerHTML = 'ℹ️ Tidak ada target jadwal unit ini';
      schNotice.style.color = '#64748b';
    }
    if (statusSelect && !statusSelect.value) {
      statusSelect.value = 'On Time';
    }
  }

  if (typeof window.updateKeteranganRequirement === 'function') {
    window.updateKeteranganRequirement();
  }
}

function initHeaderScheduleToggle() {
  const btn = document.getElementById('btnToggleHeaderScheduleMode');
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = 'true';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const current = localStorage.getItem('voltswap_schedule_mode') || 'OFF';
      const next = current === 'ON' ? 'OFF' : 'ON';
      localStorage.setItem('voltswap_schedule_mode', next);
      if (currentAuthUser) {
        currentAuthUser.scheduleMode = next;
        applyAuthUserSession(currentAuthUser);
      }
      if (next === 'ON') {
        showToast('⏱️ Mode Schedule Diaktifkan: Komparasi waktu jadwal aktif!', 'success');
      } else {
        showToast('⚡ Mode On-Demand Diaktifkan: Input langsung tanpa beban jadwal.', 'info');
      }
      updateDedSwapScheduleTarget();
      renderScheduleTable();
    });
  }
}

// Schedule Table View Controller
let scheduleSearchQuery = '';
let scheduleFilterShift = 'ALL';
let scheduleCurrentPage = 1;
let schedulePerPage = 15;

function updateScheduleSummaryMetrics() {
  const totalEl = document.getElementById('metricTotalSchedule');
  const totalSubEl = document.getElementById('metricTotalSub');
  const shift1El = document.getElementById('metricShift1Schedule');
  const shift1SubEl = document.getElementById('metricShift1Sub');
  const shift2El = document.getElementById('metricShift2Schedule');
  const shift2SubEl = document.getElementById('metricShift2Sub');
  const modeEl = document.getElementById('metricActiveScheduleMode');
  const modeIconEl = document.getElementById('metricModeIcon');
  const modeSubEl = document.getElementById('metricModeSub');
  const cardMode = document.getElementById('cardScheduleModeToggle');

  const total = schedulesData.length;
  const shift1 = schedulesData.filter(s => String(s.shift) === '1').length;
  const shift2 = schedulesData.filter(s => String(s.shift) === '2').length;

  // Swapped realization
  const swappedCount = schedulesData.filter(s => swapsData.some(sw => sw.unit === s.unit && String(sw.shift) === String(s.shift))).length;
  const swappedShift1 = schedulesData.filter(s => String(s.shift) === '1' && swapsData.some(sw => sw.unit === s.unit && String(sw.shift) === '1')).length;
  const swappedShift2 = schedulesData.filter(s => String(s.shift) === '2' && swapsData.some(sw => sw.unit === s.unit && String(sw.shift) === '2')).length;
  const pctRealized = total > 0 ? Math.round((swappedCount / total) * 100) : 0;

  if (totalEl) totalEl.textContent = `${total} Unit`;
  if (totalSubEl) {
    totalSubEl.innerHTML = `<span class="sch-sub-bullet" style="color: #0284c7;">●</span><span>Realisasi: ${swappedCount}/${total} (${pctRealized}%)</span>`;
  }

  if (shift1El) shift1El.textContent = `${shift1} Unit`;
  if (shift1SubEl) {
    shift1SubEl.innerHTML = `<span class="sch-sub-bullet" style="color: #f59e0b;">●</span><span>Sudah: ${swappedShift1}/${shift1} (07:00-18:00)</span>`;
  }

  if (shift2El) shift2El.textContent = `${shift2} Unit`;
  if (shift2SubEl) {
    shift2SubEl.innerHTML = `<span class="sch-sub-bullet" style="color: #7c3aed;">●</span><span>Sudah: ${swappedShift2}/${shift2} (19:00-06:00)</span>`;
  }

  const isScheduleOn = (localStorage.getItem('voltswap_schedule_mode') === 'ON');
  if (modeEl) {
    modeEl.textContent = isScheduleOn ? '⏱️ SCHEDULE ON' : '⚡ ON-DEMAND';
  }
  if (modeIconEl) {
    modeIconEl.textContent = isScheduleOn ? '⏱️' : '⚡';
  }
  if (modeSubEl) {
    modeSubEl.innerHTML = `<span class="sch-sub-bullet" style="color: ${isScheduleOn ? '#ef4444' : '#10b981'};">●</span><span>${isScheduleOn ? 'Komparasi Jadwal Aktif' : 'Input Bebas Tanpa Beban'}</span>`;
  }
  if (cardMode) {
    if (isScheduleOn) {
      cardMode.classList.add('mode-active-schedule');
    } else {
      cardMode.classList.remove('mode-active-schedule');
    }
  }
}

function initScheduleModule() {
  const selectPerPage = document.getElementById('selectSchedulePerPage');
  const selectShift = document.getElementById('filterScheduleShift');
  const inputSearch = document.getElementById('inputScheduleSearch');
  const btnExport = document.getElementById('btnExportScheduleExcel');
  const cardModeToggle = document.getElementById('cardScheduleModeToggle');

  if (cardModeToggle && !cardModeToggle.dataset.bound) {
    cardModeToggle.dataset.bound = 'true';
    cardModeToggle.addEventListener('click', () => {
      document.getElementById('btnToggleHeaderScheduleMode')?.click();
    });
  }

  if (selectPerPage && !selectPerPage.dataset.bound) {
    selectPerPage.dataset.bound = 'true';
    selectPerPage.addEventListener('change', (e) => {
      schedulePerPage = parseInt(e.target.value) || 15;
      scheduleCurrentPage = 1;
      renderScheduleTable();
    });
  }

  if (selectShift && !selectShift.dataset.bound) {
    selectShift.dataset.bound = 'true';
    selectShift.addEventListener('change', (e) => {
      scheduleFilterShift = e.target.value;
      scheduleCurrentPage = 1;
      renderScheduleTable();
    });
  }

  if (inputSearch && !inputSearch.dataset.bound) {
    inputSearch.dataset.bound = 'true';
    inputSearch.addEventListener('input', (e) => {
      scheduleSearchQuery = (e.target.value || '').trim();
      scheduleCurrentPage = 1;
      renderScheduleTable();
    });
  }

  const btnTemplate = document.getElementById('btnDownloadScheduleTemplate');
  if (btnTemplate && !btnTemplate.dataset.bound) {
    btnTemplate.dataset.bound = 'true';
    btnTemplate.addEventListener('click', downloadScheduleTemplateExcel);
  }

  const btnUpload = document.getElementById('btnUploadScheduleExcel');
  if (btnUpload && !btnUpload.dataset.bound) {
    btnUpload.dataset.bound = 'true';
    btnUpload.addEventListener('click', () => {
      openModal('modalUploadScheduleExcel');
    });
  }

  initScheduleUploadModalEvents();

  if (btnExport && !btnExport.dataset.bound) {
    btnExport.dataset.bound = 'true';
    btnExport.addEventListener('click', exportScheduleToExcel);
  }

  updateScheduleSummaryMetrics();
  renderScheduleTable();
}

function renderScheduleTable() {
  const tbody = document.getElementById('scheduleTableBody');
  const recordInfo = document.getElementById('scheduleRecordInfo');
  const paginationContainer = document.getElementById('schedulePaginationContainer');
  const panelTitle = document.getElementById('schedulePanelTitle');
  if (!tbody) return;

  updateScheduleSummaryMetrics();

  let filtered = schedulesData.filter(item => {
    if (scheduleFilterShift !== 'ALL' && String(item.shift) !== String(scheduleFilterShift)) {
      return false;
    }
    if (scheduleSearchQuery) {
      const q = scheduleSearchQuery.toLowerCase();
      const inUnit = item.unit.toLowerCase().includes(q);
      const inTime = item.timeSch.toLowerCase().includes(q);
      const inDate = (item.tanggal || '').toLowerCase().includes(q);
      return inUnit || inTime || inDate;
    }
    return true;
  });

  const totalEntries = filtered.length;
  const totalPages = Math.ceil(totalEntries / schedulePerPage) || 1;
  if (scheduleCurrentPage > totalPages) scheduleCurrentPage = totalPages;
  if (scheduleCurrentPage < 1) scheduleCurrentPage = 1;

  const startIdx = (scheduleCurrentPage - 1) * schedulePerPage;
  const pageItems = filtered.slice(startIdx, startIdx + schedulePerPage);

  if (pageItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 25px; color: #64748b;">Tidak ada data jadwal yang sesuai.</td></tr>';
  } else {
    tbody.innerHTML = pageItems.map((item, idx) => {
      const globalNo = startIdx + idx + 1;
      const isSwapped = swapsData.some(s => s.unit === item.unit && String(s.shift) === String(item.shift));
      const statusBadge = isSwapped 
        ? '<span class="status-pill green">✅ Sudah Swap</span>' 
        : '<span class="status-pill blue">⏳ Menunggu Antrean</span>';

      return `
        <tr>
          <td style="text-align: center; font-weight: 700; color: #64748b;">${globalNo}</td>
          <td>${item.tanggal || '11/09/2026'}</td>
          <td style="text-align: center;"><span class="status-pill ${item.shift === '2' ? 'amber' : 'purple'}">SHIFT ${item.shift}</span></td>
          <td style="font-weight: 700; color: #1e293b;"><span style="color: #d32f2f;">●</span> DT-${item.unit}</td>
          <td style="font-family: var(--font-mono); font-weight: 700; color: #0284c7;">${item.timeSch}</td>
          <td>${statusBadge}</td>
          <td style="text-align: center;">
            <button type="button" class="btn-action-view" onclick="quickInputSwapForUnit('${item.unit}', '${item.shift}')" title="Input transaksi swap untuk unit ini" style="font-size: 11px; padding: 4px 8px;">
              ➕ Input Swap
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  if (panelTitle) {
    const shiftText = scheduleFilterShift === '1' ? ' - Shift 1 (Siang)' : scheduleFilterShift === '2' ? ' - Shift 2 (Malam)' : '';
    panelTitle.textContent = `Daftar Rencana Jadwal Swap Unit DT EV (${totalEntries} Data Terdaftar${shiftText})`;
  }

  if (recordInfo) {
    const endIdx = Math.min(startIdx + schedulePerPage, totalEntries);
    recordInfo.textContent = `Showing ${totalEntries > 0 ? startIdx + 1 : 0} to ${endIdx} of ${totalEntries} entries`;
  }

  if (paginationContainer) {
    renderSchedulePagination(totalPages, paginationContainer);
  }
}

function renderSchedulePagination(totalPages, container) {
  container.innerHTML = '';
  if (totalPages <= 1) return;

  const btnPrev = document.createElement('button');
  btnPrev.type = 'button';
  btnPrev.className = 'page-item-btn';
  btnPrev.innerHTML = '&laquo; Prev';
  btnPrev.disabled = (scheduleCurrentPage === 1);
  btnPrev.onclick = () => { scheduleCurrentPage--; renderScheduleTable(); };
  container.appendChild(btnPrev);

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= scheduleCurrentPage - 2 && i <= scheduleCurrentPage + 2)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `page-item-btn ${i === scheduleCurrentPage ? 'active' : ''}`;
      btn.textContent = i;
      btn.onclick = () => { scheduleCurrentPage = i; renderScheduleTable(); };
      container.appendChild(btn);
    } else if (i === scheduleCurrentPage - 3 || i === scheduleCurrentPage + 3) {
      const span = document.createElement('span');
      span.textContent = '...';
      span.style.padding = '0 5px';
      container.appendChild(span);
    }
  }

  const btnNext = document.createElement('button');
  btnNext.type = 'button';
  btnNext.className = 'page-item-btn';
  btnNext.innerHTML = 'Next &raquo;';
  btnNext.disabled = (scheduleCurrentPage === totalPages);
  btnNext.onclick = () => { scheduleCurrentPage++; renderScheduleTable(); };
  container.appendChild(btnNext);
}

// =============================================================================
// EXPORT EXCEL (.XLSX), TEMPLATE DOWNLOAD & BULK UPLOAD JADWAL SWAP
// =============================================================================

function exportScheduleToExcel() {
  if (!schedulesData || schedulesData.length === 0) {
    showToast('Tidak ada data jadwal untuk diekspor!', 'warning');
    return;
  }

  const aoa = [
    ['No', 'Tanggal', 'Shift', 'Kode Unit DT', 'Target Jam (Time Sch)', 'Status Realisasi']
  ];

  schedulesData.forEach((item, idx) => {
    const isSwapped = (swapsData || []).some(s => String(s.unit).replace(/^DT\s*/i, '') === String(item.unit).replace(/^DT\s*/i, '') && String(s.shift) === String(item.shift));
    aoa.push([
      idx + 1,
      item.tanggal || '',
      `Shift ${item.shift || '1'}`,
      `DT-${item.unit}`,
      item.timeSch || '',
      isSwapped ? 'Sudah Swap' : 'Menunggu Antrean'
    ]);
  });

  if (typeof XLSX !== 'undefined') {
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(aoa);

      // Auto-fit column widths
      ws['!cols'] = [
        { wch: 6 },  // No
        { wch: 14 }, // Tanggal
        { wch: 12 }, // Shift
        { wch: 16 }, // Unit
        { wch: 22 }, // Target Jam
        { wch: 18 }  // Status
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Jadwal Swap EV');
      const todayStr = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `Rencana_Jadwal_Swap_EV_${todayStr}.xlsx`);
      showToast('📊 Berkas Microsoft Excel (.xlsx) berhasil diunduh!', 'success');
      return;
    } catch (e) {
      console.warn('SheetJS error, fallback ke CSV:', e);
    }
  }

  // Fallback if SheetJS is unavailable
  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + 
    aoa.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')).join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', 'Rencana_Jadwal_Swap_EV.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('📊 Berkas jadwal berhasil diunduh!', 'success');
}

window.downloadScheduleTemplateExcel = function() {
  const aoa = [
    ['Tanggal', 'Shift', 'Kode Unit', 'Target Jam (Time Sch)'],
    ['11/09/2026', '1', '1601', '07:00:00'],
    ['11/09/2026', '1', '1618', '07:00:00'],
    ['11/09/2026', '1', '1615', '07:15:00'],
    ['11/09/2026', '2', '1605', '19:00:00'],
    ['11/09/2026', '2', '1616', '19:15:00'],
    ['11/09/2026', '2', '1617', '19:30:00']
  ];

  if (typeof XLSX !== 'undefined') {
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [
        { wch: 14 },
        { wch: 10 },
        { wch: 14 },
        { wch: 22 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Template Jadwal');
      XLSX.writeFile(wb, 'Template_Import_Jadwal_Swap.xlsx');
      showToast('📥 Template Excel (.xlsx) berhasil diunduh! Silakan isi lalu upload.', 'success');
      return;
    } catch (e) {
      console.warn('SheetJS error, fallback CSV:', e);
    }
  }

  // Fallback CSV template
  let csv = 'Tanggal,Shift,Kode Unit,Target Jam (Time Sch)\n';
  csv += '11/09/2026,1,1601,07:00:00\n';
  csv += '11/09/2026,1,1618,07:00:00\n';
  csv += '11/09/2026,2,1605,19:00:00\n';
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Template_Import_Jadwal_Swap.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📥 Template CSV berhasil diunduh!', 'success');
};

let tempParsedScheduleList = [];

function initScheduleUploadModalEvents() {
  const dropZone = document.getElementById('dropZoneScheduleExcel');
  const fileInput = document.getElementById('inputScheduleExcelFile');
  const btnApply = document.getElementById('btnApplyScheduleImport');

  if (dropZone && !dropZone.dataset.bound) {
    dropZone.dataset.bound = 'true';
    dropZone.addEventListener('click', () => {
      if (fileInput) fileInput.click();
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#1d4ed8';
      dropZone.style.background = '#eff6ff';
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = '#3b82f6';
      dropZone.style.background = '#f8fafc';
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#3b82f6';
      dropZone.style.background = '#f8fafc';
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        parseScheduleFile(files[0]);
      }
    });
  }

  if (fileInput && !fileInput.dataset.bound) {
    fileInput.dataset.bound = 'true';
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        parseScheduleFile(e.target.files[0]);
      }
    });
  }

  if (btnApply && !btnApply.dataset.bound) {
    btnApply.dataset.bound = 'true';
    btnApply.addEventListener('click', applyParsedScheduleToApp);
  }
}

function parseScheduleFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      let rows = [];
      if (typeof XLSX !== 'undefined') {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
      } else {
        const text = new TextDecoder().decode(e.target.result);
        rows = text.split(/\r?\n/).map(line => line.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
      }

      if (!rows || rows.length < 2) {
        showToast('Berkas Excel tidak memiliki baris data!', 'warning');
        return;
      }

      // Deteksi index kolom
      const headers = rows[0].map(h => String(h || '').toLowerCase().trim());
      let colDate = headers.findIndex(h => h.includes('tanggal') || h.includes('date'));
      let colShift = headers.findIndex(h => h.includes('shift'));
      let colUnit = headers.findIndex(h => h.includes('unit') || h.includes('dt') || h.includes('kode') || h.includes('armada'));
      let colTime = headers.findIndex(h => h.includes('time') || h.includes('jam') || h.includes('sch') || h.includes('target') || h.includes('waktu'));

      // Fallback jika header tidak bernama
      if (colDate === -1) colDate = 0;
      if (colShift === -1) colShift = 1;
      if (colUnit === -1) colUnit = 2;
      if (colTime === -1) colTime = 3;

      tempParsedScheduleList = [];
      const now = new Date();
      const defaultDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length === 0) continue;
        const rawUnit = String(r[colUnit] || '').trim();
        if (!rawUnit) continue;

        const cleanUnit = rawUnit.replace(/^DT[\s\-_]*/i, '').trim();
        let rawDate = String(r[colDate] || '').trim();
        let rawShift = String(r[colShift] || '1').trim().replace(/[^0-9]/g, '') || '1';
        let rawTime = String(r[colTime] || '07:00:00').trim();

        if (!rawDate || rawDate.length < 5) rawDate = defaultDate;

        // Normalize time if format is H:M
        if (rawTime.length === 4 || rawTime.length === 5) {
          if (rawTime.indexOf(':') !== -1 && rawTime.split(':').length === 2) {
            rawTime += ':00';
          }
        }

        tempParsedScheduleList.push({
          tanggal: rawDate,
          shift: rawShift,
          unit: cleanUnit,
          timeSch: rawTime
        });
      }

      if (tempParsedScheduleList.length === 0) {
        showToast('Tidak ada baris jadwal yang valid dalam berkas!', 'warning');
        return;
      }

      // Update UI preview
      const statusBox = document.getElementById('uploadScheduleStatusBox');
      const fileNameEl = document.getElementById('uploadScheduleFileName');
      const rowCountEl = document.getElementById('uploadScheduleRowCount');
      const previewBox = document.getElementById('uploadSchedulePreviewBox');
      const previewBody = document.getElementById('uploadSchedulePreviewBody');
      const btnApply = document.getElementById('btnApplyScheduleImport');

      if (statusBox) statusBox.style.display = 'block';
      if (fileNameEl) fileNameEl.innerHTML = `📄 <strong>${file.name}</strong> (${(file.size / 1024).toFixed(1)} KB)`;
      if (rowCountEl) rowCountEl.textContent = `${tempParsedScheduleList.length} Jadwal Siap Diimpor`;

      if (previewBox) previewBox.style.display = 'block';
      if (previewBody) {
        const preview5 = tempParsedScheduleList.slice(0, 5);
        previewBody.innerHTML = preview5.map(p => `
          <tr>
            <td style="padding: 6px 10px;">${p.tanggal}</td>
            <td style="padding: 6px 10px;"><span class="status-pill ${p.shift === '2' ? 'amber' : 'purple'}" style="font-size: 10px;">Shift ${p.shift}</span></td>
            <td style="padding: 6px 10px;"><strong>DT-${p.unit}</strong></td>
            <td style="padding: 6px 10px; font-family: var(--font-mono); color: #0284c7; font-weight: 700;">${p.timeSch}</td>
          </tr>
        `).join('');
      }

      if (btnApply) {
        btnApply.disabled = false;
        btnApply.style.opacity = '1';
        btnApply.style.cursor = 'pointer';
      }

      showToast(`📊 Berhasil membaca ${tempParsedScheduleList.length} jadwal dari file Excel!`, 'success');
    } catch (err) {
      showToast('Gagal memproses file Excel: ' + err.message, 'danger');
    }
  };

  reader.readAsArrayBuffer(file);
}

function applyParsedScheduleToApp() {
  if (!tempParsedScheduleList || tempParsedScheduleList.length === 0) {
    showToast('Belum ada data jadwal yang dipilih untuk diimpor!', 'warning');
    return;
  }

  const modeRad = document.querySelector('input[name="radScheduleImportMode"]:checked');
  const importMode = modeRad ? modeRad.value : 'overwrite';

  if (importMode === 'overwrite') {
    schedulesData = [...tempParsedScheduleList];
  } else {
    schedulesData = (schedulesData || []).concat(tempParsedScheduleList);
  }

  localStorage.setItem('voltswap_schedules', JSON.stringify(schedulesData));
  closeModal('modalUploadScheduleExcel');

  scheduleCurrentPage = 1;
  updateScheduleSummaryMetrics();
  renderScheduleTable();

  // Reset temp
  tempParsedScheduleList = [];
  const statusBox = document.getElementById('uploadScheduleStatusBox');
  const previewBox = document.getElementById('uploadSchedulePreviewBox');
  const btnApply = document.getElementById('btnApplyScheduleImport');
  if (statusBox) statusBox.style.display = 'none';
  if (previewBox) previewBox.style.display = 'none';
  if (btnApply) {
    btnApply.disabled = true;
    btnApply.style.opacity = '0.6';
    btnApply.style.cursor = 'not-allowed';
  }

  showToast(`🎉 Berhasil menerapkan ${schedulesData.length} total jadwal swap operasional!`, 'success');
}

window.quickInputSwapForUnit = function(unit, shift) {
  const menuInput = document.getElementById('menuInputData');
  if (menuInput) menuInput.click();
  setTimeout(() => {
    const uSelect = document.getElementById('dedSwapUnit');
    const sSelect = document.getElementById('dedSwapShift');
    if (uSelect) {
      uSelect.value = `DT ${unit}`;
      uSelect.dataset.unitCode = unit;
    }
    if (sSelect) sSelect.value = shift;
    updateDedSwapScheduleTarget();
    showToast(`Mempersiapkan transaksi untuk unit DT-${unit} (Shift ${shift})`, 'info');
  }, 100);
};

// =============================================================================
// 14. DUAL-MODE TIME PICKER ENGINE (ANALOG CLOCK & DIGITAL SCROLL WHEEL)
// =============================================================================

let tpTargetFieldId = null;
let tpCurrentHour = 8;
let tpCurrentMinute = 0;
let tpActiveMode = 'digital'; // 'digital' | 'analog'
let tpActiveFocusPart = 'hour'; // 'hour' | 'minute'
let tpAnalogSubMode = 'hour'; // 'hour' | 'minute'
let tpInitialized = false;

window.openTimePickerModal = function(targetFieldId, fieldLabel) {
  tpTargetFieldId = targetFieldId;
  const targetInput = document.getElementById(targetFieldId);
  const subtitleEl = document.getElementById('tpFieldSubtitle');
  if (subtitleEl) {
    subtitleEl.textContent = `Mengatur ${fieldLabel || 'Jam'}`;
  }

  // Ambil nilai saat ini dari field atau gunakan jam sekarang
  const currentVal = targetInput ? targetInput.value.trim() : '';
  if (currentVal && currentVal.includes(':') && currentVal !== '--:--') {
    const parts = currentVal.split(':').map(Number);
    tpCurrentHour = isNaN(parts[0]) ? 8 : parts[0];
    tpCurrentMinute = isNaN(parts[1]) ? 0 : parts[1];
  } else {
    const now = new Date();
    tpCurrentHour = now.getHours();
    tpCurrentMinute = now.getMinutes();
  }

  initTimePickerUI();
  updateTimePickerDisplay();
  openModal('modalTimePicker');

  // Auto scroll roda ke posisi yang terpilih setelah modal terbuka
  setTimeout(() => {
    scrollToTimeWheelItem('hour', tpCurrentHour);
    scrollToTimeWheelItem('minute', tpCurrentMinute);
  }, 80);
};

function initTimePickerUI() {
  if (tpInitialized) return;
  tpInitialized = true;

  // Render Hour Scroll (00 - 23)
  const hourScroll = document.getElementById('tpHourScroll');
  if (hourScroll) {
    hourScroll.innerHTML = '';
    for (let h = 0; h < 24; h++) {
      const item = document.createElement('div');
      item.className = `tp-wheel-item ${h === tpCurrentHour ? 'selected' : ''}`;
      item.dataset.value = h;
      item.textContent = String(h).padStart(2, '0');
      item.onclick = () => {
        tpCurrentHour = h;
        updateTimePickerDisplay();
        scrollToTimeWheelItem('hour', h);
      };
      hourScroll.appendChild(item);
    }

    // Touch scroll snap detection
    let hourScrollTimer;
    hourScroll.addEventListener('scroll', () => {
      clearTimeout(hourScrollTimer);
      hourScrollTimer = setTimeout(() => {
        const itemHeight = 38;
        const index = Math.round(hourScroll.scrollTop / itemHeight);
        const clamped = Math.max(0, Math.min(23, index));
        if (clamped !== tpCurrentHour) {
          tpCurrentHour = clamped;
          updateTimePickerDisplay();
        }
      }, 100);
    });
  }

  // Render Minute Scroll (00 - 59)
  const minuteScroll = document.getElementById('tpMinuteScroll');
  if (minuteScroll) {
    minuteScroll.innerHTML = '';
    for (let m = 0; m < 60; m++) {
      const item = document.createElement('div');
      item.className = `tp-wheel-item ${m === tpCurrentMinute ? 'selected' : ''}`;
      item.dataset.value = m;
      item.textContent = String(m).padStart(2, '0');
      item.onclick = () => {
        tpCurrentMinute = m;
        updateTimePickerDisplay();
        scrollToTimeWheelItem('minute', m);
      };
      minuteScroll.appendChild(item);
    }

    // Touch scroll snap detection
    let minScrollTimer;
    minuteScroll.addEventListener('scroll', () => {
      clearTimeout(minScrollTimer);
      minScrollTimer = setTimeout(() => {
        const itemHeight = 38;
        const index = Math.round(minuteScroll.scrollTop / itemHeight);
        const clamped = Math.max(0, Math.min(59, index));
        if (clamped !== tpCurrentMinute) {
          tpCurrentMinute = clamped;
          updateTimePickerDisplay();
        }
      }, 100);
    });
  }
}

function scrollToTimeWheelItem(part, val) {
  const container = (part === 'hour') ? document.getElementById('tpHourScroll') : document.getElementById('tpMinuteScroll');
  if (!container) return;
  const itemHeight = 38;
  container.scrollTo({
    top: val * itemHeight,
    behavior: 'smooth'
  });
}

function updateTimePickerDisplay() {
  const hourBox = document.getElementById('tpDisplayHour');
  const minBox = document.getElementById('tpDisplayMinute');
  const periodBox = document.getElementById('tpDisplayPeriod');

  if (hourBox) hourBox.textContent = String(tpCurrentHour).padStart(2, '0');
  if (minBox) minBox.textContent = String(tpCurrentMinute).padStart(2, '0');

  if (periodBox) {
    if (tpCurrentHour >= 0 && tpCurrentHour < 11) periodBox.textContent = 'PAGI';
    else if (tpCurrentHour >= 11 && tpCurrentHour < 15) periodBox.textContent = 'SIANG';
    else if (tpCurrentHour >= 15 && tpCurrentHour < 18) periodBox.textContent = 'SORE';
    else periodBox.textContent = 'MALAM';
  }

  // Update selected classes in Digital Wheel
  document.querySelectorAll('#tpHourScroll .tp-wheel-item').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.value, 10) === tpCurrentHour);
  });
  document.querySelectorAll('#tpMinuteScroll .tp-wheel-item').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.value, 10) === tpCurrentMinute);
  });

  // Update Minute Jump Chips active class
  document.querySelectorAll('.tp-minute-chips-grid .tp-min-chip').forEach(btn => {
    const textVal = parseInt(btn.textContent.replace(':', ''), 10);
    btn.classList.toggle('active', textVal === tpCurrentMinute);
  });

  // Update Analog Clock view
  renderAnalogClock();
}

window.switchTimePickerMode = function(mode) {
  tpActiveMode = mode;
  document.getElementById('tpTabDigital')?.classList.toggle('active', mode === 'digital');
  document.getElementById('tpTabAnalog')?.classList.toggle('active', mode === 'analog');

  const viewDigital = document.getElementById('tpViewDigital');
  const viewAnalog = document.getElementById('tpViewAnalog');

  if (viewDigital) viewDigital.style.display = (mode === 'digital') ? 'block' : 'none';
  if (viewAnalog) viewAnalog.style.display = (mode === 'analog') ? 'block' : 'none';

  if (mode === 'digital') {
    setTimeout(() => {
      scrollToTimeWheelItem('hour', tpCurrentHour);
      scrollToTimeWheelItem('minute', tpCurrentMinute);
    }, 50);
  } else {
    renderAnalogClock();
  }
};

window.focusTimePart = function(part) {
  if (tpActiveFocusPart === part && tpAnalogSubMode === part) return;
  tpActiveFocusPart = part;
  document.getElementById('tpDisplayHour')?.classList.toggle('tp-active-part', part === 'hour');
  document.getElementById('tpDisplayMinute')?.classList.toggle('tp-active-part', part === 'minute');

  if (tpActiveMode === 'analog' && tpAnalogSubMode !== part) {
    switchAnalogSubMode(part);
  }
};

window.stepTimeValue = function(part, delta) {
  if (part === 'hour') {
    tpCurrentHour = (tpCurrentHour + delta + 24) % 24;
    scrollToTimeWheelItem('hour', tpCurrentHour);
  } else {
    tpCurrentMinute = (tpCurrentMinute + delta + 60) % 60;
    scrollToTimeWheelItem('minute', tpCurrentMinute);
  }
  updateTimePickerDisplay();
};

window.setTimeMinuteValue = function(minVal) {
  tpCurrentMinute = parseInt(minVal, 10) || 0;
  scrollToTimeWheelItem('minute', tpCurrentMinute);
  updateTimePickerDisplay();
};

window.switchAnalogSubMode = function(subMode) {
  if (tpAnalogSubMode === subMode) return;
  tpAnalogSubMode = subMode;
  document.getElementById('tpAnalogSubHour')?.classList.toggle('active', subMode === 'hour');
  document.getElementById('tpAnalogSubMinute')?.classList.toggle('active', subMode === 'minute');
  tpActiveFocusPart = subMode;
  document.getElementById('tpDisplayHour')?.classList.toggle('tp-active-part', subMode === 'hour');
  document.getElementById('tpDisplayMinute')?.classList.toggle('tp-active-part', subMode === 'minute');
  renderAnalogClock();
};

function renderAnalogClock() {
  const container = document.getElementById('tpClockNumbers');
  const hand = document.getElementById('tpClockHand');
  if (!container || !hand) return;

  container.innerHTML = '';
  const radius = 70; // Radius lingkaran jam (px)
  const center = 95; // Titik tengah (190px / 2)

  if (tpAnalogSubMode === 'hour') {
    // Tampilkan 12 angka jam (1-12)
    for (let i = 1; i <= 12; i++) {
      const angle = (i * 30 - 90) * (Math.PI / 180);
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);

      const numEl = document.createElement('div');
      numEl.className = 'tp-clock-num';
      numEl.style.left = `${x}px`;
      numEl.style.top = `${y}px`;
      numEl.textContent = i;

      // Cek apakah terpilih (konversi jam 24 ke 12)
      const current12 = (tpCurrentHour % 12 === 0) ? 12 : (tpCurrentHour % 12);
      if (current12 === i) {
        numEl.classList.add('selected');
      }

      numEl.onclick = () => {
        // Pertahankan status PM/AM
        const isPm = tpCurrentHour >= 12;
        if (i === 12) {
          tpCurrentHour = isPm ? 12 : 0;
        } else {
          tpCurrentHour = isPm ? (i + 12) : i;
        }
        updateTimePickerDisplay();
        // Otomatis pindah ke menit setelah memilih jam
        setTimeout(() => switchAnalogSubMode('minute'), 200);
      };
      container.appendChild(numEl);
    }

    // Sudut jarum jam
    const hourAngle = ((tpCurrentHour % 12) * 30) + (tpCurrentMinute * 0.5);
    hand.style.transform = `translateX(-50%) rotate(${hourAngle}deg)`;
  } else {
    // Tampilkan 12 angka menit kelipatan 5 (:00, :05, :10 ... :55)
    for (let i = 0; i < 12; i++) {
      const minuteVal = i * 5;
      const angle = (i * 30 - 90) * (Math.PI / 180);
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);

      const numEl = document.createElement('div');
      numEl.className = 'tp-clock-num';
      numEl.style.left = `${x}px`;
      numEl.style.top = `${y}px`;
      numEl.textContent = String(minuteVal).padStart(2, '0');

      if (Math.abs(tpCurrentMinute - minuteVal) < 2.5) {
        numEl.classList.add('selected');
      }

      numEl.onclick = () => {
        tpCurrentMinute = minuteVal;
        updateTimePickerDisplay();
      };
      container.appendChild(numEl);
    }

    // Sudut jarum menit
    const minuteAngle = tpCurrentMinute * 6;
    hand.style.transform = `translateX(-50%) rotate(${minuteAngle}deg)`;
  }
}

window.tpSetCurrentTime = function() {
  const now = new Date();
  tpCurrentHour = now.getHours();
  tpCurrentMinute = now.getMinutes();
  updateTimePickerDisplay();
  scrollToTimeWheelItem('hour', tpCurrentHour);
  scrollToTimeWheelItem('minute', tpCurrentMinute);
  showToast('🕒 Waktu disetel ke jam saat ini!', 'info');
};

window.confirmTimePickerSelection = function() {
  if (!tpTargetFieldId) {
    closeModal('modalTimePicker');
    return;
  }

  const timeStr = `${String(tpCurrentHour).padStart(2, '0')}:${String(tpCurrentMinute).padStart(2, '0')}`;
  const targetInput = document.getElementById(tpTargetFieldId);
  if (targetInput) {
    targetInput.value = timeStr;
  }

  if (typeof window.updateDedicatedChargingTime === 'function') {
    window.updateDedicatedChargingTime();
  }
  if (typeof updateDedSwapScheduleTarget === 'function') {
    updateDedSwapScheduleTarget();
  }

  closeModal('modalTimePicker');
};

// Quick Duration Presets (+5m, +6m, +7m, +8m, +10m)
window.applyQuickDurationPreset = function(minutes) {
  const jamInEl = document.getElementById('dedSwapJamIn');
  const jamOutEl = document.getElementById('dedSwapJamOut');
  if (!jamInEl || !jamOutEl) return;

  // Jika Jam Masuk belum terisi, otomatis isi Jam Masuk dengan jam saat ini
  if (!jamInEl.value || jamInEl.value === '--:--') {
    const now = new Date();
    jamInEl.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  const inParts = jamInEl.value.split(':').map(Number);
  if (inParts.length < 2) return;

  let totalMinutes = inParts[0] * 60 + inParts[1] + minutes;
  totalMinutes = (totalMinutes + 24 * 60) % (24 * 60);

  const outH = Math.floor(totalMinutes / 60);
  const outM = totalMinutes % 60;
  jamOutEl.value = `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`;

  if (typeof window.updateDedicatedChargingTime === 'function') {
    window.updateDedicatedChargingTime();
  }

  showToast(`⚡ Jam Keluar diatur: ${jamOutEl.value} (+${minutes} mnt)`, 'success');
};

// =============================================================================
// 15. DATABASE MANAGEMENT CENTER ENGINE (CRUD, USER ADMIN, BACKUP & FIREBASE PREP)
// =============================================================================

let dbActiveTab = 'users';
let dbSwapCurrentPage = 1;
const dbSwapPerPage = 10;
let dbScheduleCurrentPage = 1;
const dbSchedulePerPage = 10;
let dbPendingDeleteAction = null;

window.initDatabaseManagerModule = function() {
  bindDbTabs();
  bindDbStatCardClicks();
  bindDbUserEvents();
  bindDbSwapEvents();
  bindDbProblemEvents();
  bindDbScheduleEvents();
  bindDbUnitEvents();
  bindDbBackupEvents();

  updateDbSummaryMetrics();
  renderDbTabContent(dbActiveTab);
};

// Tab switcher
function bindDbTabs() {
  const tabsNav = document.getElementById('dbTabsNav');
  if (!tabsNav || tabsNav.dataset.bound) return;
  tabsNav.dataset.bound = 'true';

  tabsNav.querySelectorAll('.db-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      switchDbTab(target);
    });
  });
}

function switchDbTab(tabName) {
  dbActiveTab = tabName;
  document.querySelectorAll('#dbTabsNav .db-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  document.querySelectorAll('.db-tab-pane').forEach(p => {
    p.classList.toggle('active', p.id === `dbPane${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
  });
  updateDbSummaryMetrics();
  renderDbTabContent(tabName);
}

function bindDbStatCardClicks() {
  document.querySelectorAll('.db-stat-card[data-tab-target]').forEach(card => {
    if (card.dataset.bound) return;
    card.dataset.bound = 'true';
    card.addEventListener('click', () => {
      const tabTarget = card.dataset.tabTarget;
      if (tabTarget) switchDbTab(tabTarget);
    });
  });
}

function updateDbSummaryMetrics() {
  const users = (typeof window.getAppUsers === 'function') ? window.getAppUsers() : OPERATOR_USERS;
  const opCount = users.filter(u => u.role === 'OPERATOR').length;
  const spvCount = users.filter(u => u.role === 'SUPERVISOR').length;

  const elUsers = document.getElementById('dbStatUsers');
  const elUsersDetail = document.getElementById('dbStatUsersDetail');
  if (elUsers) elUsers.textContent = users.length;
  if (elUsersDetail) elUsersDetail.textContent = `${opCount} Operator • ${spvCount} Spv`;

  const elSwaps = document.getElementById('dbStatSwaps');
  if (elSwaps) elSwaps.textContent = swapsData ? swapsData.length : 0;

  const elProblems = document.getElementById('dbStatProblems');
  if (elProblems) elProblems.textContent = problemsData ? problemsData.length : 0;

  const elSchedules = document.getElementById('dbStatSchedules');
  if (elSchedules) elSchedules.textContent = schedulesData ? schedulesData.length : 0;

  const elUnits = document.getElementById('dbStatUnits');
  if (elUnits) elUnits.textContent = fleetUnits ? fleetUnits.length : 0;
}

function renderDbTabContent(tab) {
  switch (tab) {
    case 'users':
      renderDbUsersTable();
      break;
    case 'swaps':
      renderDbSwapsTable();
      break;
    case 'problems':
      renderDbProblemsTable();
      break;
    case 'schedules':
      renderDbSchedulesTable();
      break;
    case 'units':
      renderDbUnitsTable();
      break;
    case 'backup':
      if (typeof updateLastSheetsBackupDisplay === 'function') updateLastSheetsBackupDisplay();
      break;
  }
}

// -----------------------------------------------------------------------------
// 15.1 USER & CREDENTIALS CRUD
// -----------------------------------------------------------------------------
function bindDbUserEvents() {
  const searchInput = document.getElementById('dbUserSearch');
  const roleFilter = document.getElementById('dbUserRoleFilter');
  const btnAddUser = document.getElementById('btnDbAddUser');
  const formUser = document.getElementById('formDbUser');

  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = 'true';
    searchInput.addEventListener('input', () => renderDbUsersTable());
  }
  if (roleFilter && !roleFilter.dataset.bound) {
    roleFilter.dataset.bound = 'true';
    roleFilter.addEventListener('change', () => renderDbUsersTable());
  }
  if (btnAddUser && !btnAddUser.dataset.bound) {
    btnAddUser.dataset.bound = 'true';
    btnAddUser.addEventListener('click', () => openDbUserModal('add'));
  }
  if (formUser && !formUser.dataset.bound) {
    formUser.dataset.bound = 'true';
    formUser.addEventListener('submit', handleDbUserFormSubmit);
  }
}

function renderDbUsersTable() {
  const tbody = document.getElementById('dbUsersTableBody');
  const countInfo = document.getElementById('dbUsersCountInfo');
  if (!tbody) return;

  const users = (typeof window.getAppUsers === 'function') ? window.getAppUsers() : OPERATOR_USERS;
  const searchTerm = (document.getElementById('dbUserSearch')?.value || '').toLowerCase().trim();
  const roleFilter = document.getElementById('dbUserRoleFilter')?.value || '';

  const filtered = users.filter(u => {
    const mRole = !roleFilter || u.role === roleFilter;
    const mSearch = !searchTerm ||
      String(u.nik).toLowerCase().includes(searchTerm) ||
      String(u.name).toLowerCase().includes(searchTerm) ||
      String(u.title || '').toLowerCase().includes(searchTerm);
    return mRole && mSearch;
  });

  if (countInfo) {
    countInfo.textContent = `Menampilkan ${filtered.length} dari ${users.length} pengguna terdaftar`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 24px;">Tidak ada data pengguna yang sesuai pencarian.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((u, idx) => {
    const isSpv = u.role === 'SUPERVISOR';
    const pwdMask = u.password ? '••••••' : String(u.nik);
    return `
      <tr>
        <td style="text-align: center; color: #64748b;">${idx + 1}</td>
        <td><strong style="font-family: var(--font-mono); color: #0f172a;">${u.nik}</strong></td>
        <td><strong style="color: #1e293b;">${u.name}</strong></td>
        <td><span style="font-size: 11.5px; color: #475569;">${u.title || 'CHARGING MAN'}</span></td>
        <td>
          <span class="role-badge-pill ${isSpv ? 'spv' : 'op'}">
            ${isSpv ? '👑 SUPERVISOR' : '⚡ OPERATOR'}
          </span>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-family: var(--font-mono); font-size: 12px; color: #64748b;" id="pwdDisp_${u.nik}">${pwdMask}</span>
            <button type="button" class="btn-db-table-icon key" title="Lihat / Sembunyikan Password" onclick="toggleViewUserPassword('${u.nik}')">👁️</button>
          </div>
        </td>
        <td style="text-align: center;">
          <div class="db-table-actions">
            <button type="button" class="btn-db-table-icon edit" title="Edit Data Pengguna" onclick="openDbUserModal('edit', '${u.nik}')">✏️</button>
            <button type="button" class="btn-db-table-icon delete" title="Hapus Pengguna" onclick="confirmDeleteDbUser('${u.nik}', '${u.name.replace(/'/g, "\\'")}')">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.toggleViewUserPassword = function(nik) {
  const users = (typeof window.getAppUsers === 'function') ? window.getAppUsers() : OPERATOR_USERS;
  const u = users.find(x => String(x.nik).trim() === String(nik).trim());
  const span = document.getElementById(`pwdDisp_${nik}`);
  if (!u || !span) return;
  if (span.textContent.includes('•')) {
    span.textContent = u.password || u.nik;
  } else {
    span.textContent = '••••••';
  }
};

window.openDbUserModal = function(mode, nik) {
  const modal = document.getElementById('modalDbUser');
  const title = document.getElementById('modalDbUserTitle');
  const inpMode = document.getElementById('dbUserMode');
  const inpOrigNik = document.getElementById('dbUserOriginalNik');
  const inpNik = document.getElementById('dbUserNik');
  const inpName = document.getElementById('dbUserName');
  const inpTitle = document.getElementById('dbUserTitle');
  const inpRole = document.getElementById('dbUserRole');
  const inpPwd = document.getElementById('dbUserPassword');

  if (!modal) return;
  inpMode.value = mode;

  if (mode === 'edit' && nik) {
    const users = (typeof window.getAppUsers === 'function') ? window.getAppUsers() : OPERATOR_USERS;
    const u = users.find(x => String(x.nik).trim() === String(nik).trim());
    if (u) {
      title.innerHTML = `<span>✏️</span> Edit Data Pengguna: <strong>${u.name}</strong>`;
      inpOrigNik.value = u.nik;
      inpNik.value = u.nik;
      inpName.value = u.name;
      inpTitle.value = u.title || 'CHARGING MAN';
      inpRole.value = u.role || 'OPERATOR';
      inpPwd.value = u.password || u.nik;
    }
  } else {
    title.innerHTML = `<span>👥</span> Tambah Pengguna Baru`;
    inpOrigNik.value = '';
    inpNik.value = '';
    inpName.value = '';
    inpTitle.value = 'CHARGING MAN';
    inpRole.value = 'OPERATOR';
    inpPwd.value = '';
  }

  openModal('modalDbUser');
  setTimeout(() => { if (inpNik) inpNik.focus(); }, 150);
};

function handleDbUserFormSubmit(e) {
  e.preventDefault();
  const mode = document.getElementById('dbUserMode').value;
  const origNik = document.getElementById('dbUserOriginalNik').value.trim();
  const nik = document.getElementById('dbUserNik').value.trim();
  const name = document.getElementById('dbUserName').value.trim().toUpperCase();
  const title = document.getElementById('dbUserTitle').value.trim().toUpperCase() || 'CHARGING MAN';
  const role = document.getElementById('dbUserRole').value;
  let password = document.getElementById('dbUserPassword').value.trim();

  if (!nik || !name) {
    showToast('NIK dan Nama Lengkap wajib diisi!', 'warning');
    return;
  }
  if (!password) password = nik;

  let users = (typeof window.getAppUsers === 'function') ? window.getAppUsers() : [...OPERATOR_USERS];

  if (mode === 'add') {
    if (users.some(u => String(u.nik).trim() === nik)) {
      showToast(`NIK ${nik} sudah terdaftar dalam sistem!`, 'warning');
      return;
    }
    users.push({
      nik: nik,
      name: name,
      title: title,
      role: role,
      password: password,
      dept: role === 'SUPERVISOR' ? 'Operations Supervision' : 'Charging Operations'
    });
    showToast(`Pengguna baru ${name} (${nik}) berhasil ditambahkan!`, 'success');
  } else {
    // Mode edit
    const idx = users.findIndex(u => String(u.nik).trim() === origNik);
    if (idx !== -1) {
      // Jika NIK diubah, pastikan tidak bentrok
      if (nik !== origNik && users.some(u => String(u.nik).trim() === nik)) {
        showToast(`NIK baru ${nik} sudah digunakan oleh pengguna lain!`, 'warning');
        return;
      }
      users[idx] = {
        ...users[idx],
        nik: nik,
        name: name,
        title: title,
        role: role,
        password: password,
        dept: role === 'SUPERVISOR' ? 'Operations Supervision' : 'Charging Operations'
      };
      // Jika user yang diedit sedang login, update sesi
      if (currentAuthUser && currentAuthUser.nik === origNik) {
        currentAuthUser.nik = nik;
        currentAuthUser.name = name;
        currentAuthUser.role = role;
        localStorage.setItem('voltswap_auth_user', JSON.stringify(currentAuthUser));
        applyAuthUserSession(currentAuthUser);
      }
      showToast(`Data pengguna ${name} berhasil diperbarui!`, 'success');
    }
  }

  window.saveAppUsers(users);
  closeModal('modalDbUser');
  updateDbSummaryMetrics();
  renderDbUsersTable();
}

window.confirmDeleteDbUser = function(nik, name) {
  openDbConfirmModal(
    `Hapus Pengguna: ${name}?`,
    `Pengguna dengan NIK <strong>${nik}</strong> (${name}) akan dihapus dari sistem dan tidak bisa login lagi.`,
    () => {
      let users = (typeof window.getAppUsers === 'function') ? window.getAppUsers() : [...OPERATOR_USERS];
      users = users.filter(u => String(u.nik).trim() !== String(nik).trim());
      window.saveAppUsers(users);
      showToast(`Pengguna ${name} berhasil dihapus dari sistem.`, 'success');
      updateDbSummaryMetrics();
      renderDbUsersTable();
    }
  );
};

// -----------------------------------------------------------------------------
// 15.2 TRANSACTIONS (SWAPS) CRUD
// -----------------------------------------------------------------------------
function bindDbSwapEvents() {
  const searchInput = document.getElementById('dbSwapSearch');
  const shiftFilter = document.getElementById('dbSwapShiftFilter');
  const dateFilter = document.getElementById('dbSwapDateFilter');
  const btnReset = document.getElementById('btnDbResetSwapFilter');
  const btnExportCsv = document.getElementById('btnDbExportSwapsCsv');
  const formEdit = document.getElementById('formDbEditSwap');

  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = 'true';
    searchInput.addEventListener('input', () => { dbSwapCurrentPage = 1; renderDbSwapsTable(); });
  }
  if (shiftFilter && !shiftFilter.dataset.bound) {
    shiftFilter.dataset.bound = 'true';
    shiftFilter.addEventListener('change', () => { dbSwapCurrentPage = 1; renderDbSwapsTable(); });
  }
  if (dateFilter && !dateFilter.dataset.bound) {
    dateFilter.dataset.bound = 'true';
    dateFilter.addEventListener('change', () => { dbSwapCurrentPage = 1; renderDbSwapsTable(); });
  }
  if (btnReset && !btnReset.dataset.bound) {
    btnReset.dataset.bound = 'true';
    btnReset.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (shiftFilter) shiftFilter.value = '';
      if (dateFilter) dateFilter.value = '';
      dbSwapCurrentPage = 1;
      renderDbSwapsTable();
    });
  }
  if (btnExportCsv && !btnExportCsv.dataset.bound) {
    btnExportCsv.dataset.bound = 'true';
    btnExportCsv.addEventListener('click', () => exportSwapsCSV());
  }
  if (formEdit && !formEdit.dataset.bound) {
    formEdit.dataset.bound = 'true';
    formEdit.addEventListener('submit', handleDbEditSwapSubmit);
  }
}

function renderDbSwapsTable() {
  const tbody = document.getElementById('dbSwapsTableBody');
  const recordInfo = document.getElementById('dbSwapRecordInfo');
  const pagination = document.getElementById('dbSwapPaginationContainer');
  if (!tbody) return;

  const search = (document.getElementById('dbSwapSearch')?.value || '').toLowerCase().trim();
  const shift = document.getElementById('dbSwapShiftFilter')?.value || '';
  const dateVal = document.getElementById('dbSwapDateFilter')?.value || '';

  const list = (swapsData || []).filter(s => {
    const mShift = !shift || String(s.shift) === shift;
    let mDate = true;
    if (dateVal) {
      // dateVal is YYYY-MM-DD
      const parts = dateVal.split('-');
      const formatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
      mDate = s.date === formatted || s.date === dateVal;
    }
    const mSearch = !search ||
      String(s.id).toLowerCase().includes(search) ||
      String(s.unit).toLowerCase().includes(search) ||
      String(s.operator).toLowerCase().includes(search) ||
      String(s.statusRemark || '').toLowerCase().includes(search) ||
      String(s.keterangan || '').toLowerCase().includes(search);
    return mShift && mDate && mSearch;
  });

  const total = list.length;
  const totalPages = Math.ceil(total / dbSwapPerPage) || 1;
  if (dbSwapCurrentPage > totalPages) dbSwapCurrentPage = totalPages;

  const startIdx = (dbSwapCurrentPage - 1) * dbSwapPerPage;
  const pageItems = list.slice(startIdx, startIdx + dbSwapPerPage);

  if (recordInfo) {
    recordInfo.textContent = total > 0
      ? `Menampilkan ${startIdx + 1} - ${Math.min(startIdx + dbSwapPerPage, total)} dari ${total} transaksi`
      : 'Menampilkan 0 transaksi';
  }

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: #94a3b8; padding: 24px;">Tidak ada transaksi yang cocok dengan filter.</td></tr>`;
    if (pagination) pagination.innerHTML = '';
    return;
  }

  tbody.innerHTML = pageItems.map((s, idx) => {
    return `
      <tr>
        <td style="text-align: center; color: #64748b;">${startIdx + idx + 1}</td>
        <td><strong style="font-family: var(--font-mono); font-size: 11px; color: #0284c7;">${s.id}</strong></td>
        <td>${s.date}</td>
        <td>Shift ${s.shift}</td>
        <td><strong style="color: #0f172a;">${s.unit}</strong></td>
        <td>${s.hm || '-'}</td>
        <td><span style="color: #dc2626;">${formatBatteryPercentage(s.batteryBefore)}</span> ➔ <span style="color: #16a34a;">${formatBatteryPercentage(s.batteryAfter)}</span></td>
        <td style="font-family: var(--font-mono); font-size: 11px;">${s.jamIn || '-'} - ${s.jamOut || '-'}</td>
        <td>${s.durationMin || 6} mnt</td>
        <td><span style="font-size: 11px;">${s.operator || '-'}</span></td>
        <td><span style="font-size: 10.5px; padding: 2px 6px; border-radius: 4px; background: #f1f5f9;">${s.statusRemark || 'On Time'}</span></td>
        <td style="text-align: center;">
          <div class="db-table-actions">
            <button type="button" class="btn-db-table-icon edit" title="Edit Transaksi" onclick="openDbEditSwapModal('${s.id}')">✏️</button>
            <button type="button" class="btn-db-table-icon delete" title="Hapus Transaksi" onclick="confirmDeleteDbSwap('${s.id}')">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Render pagination
  if (pagination) {
    pagination.innerHTML = `
      <button type="button" class="page-btn" ${dbSwapCurrentPage <= 1 ? 'disabled' : ''} onclick="changeDbSwapPage(${dbSwapCurrentPage - 1})">‹ Prev</button>
      <span style="font-size: 12px; font-weight: 700; color: #475569; padding: 0 8px;">Hal ${dbSwapCurrentPage} / ${totalPages}</span>
      <button type="button" class="page-btn" ${dbSwapCurrentPage >= totalPages ? 'disabled' : ''} onclick="changeDbSwapPage(${dbSwapCurrentPage + 1})">Next ›</button>
    `;
  }
}

window.changeDbSwapPage = function(p) {
  dbSwapCurrentPage = p;
  renderDbSwapsTable();
};

window.openDbEditSwapModal = function(id) {
  const rec = (swapsData || []).find(x => String(x.id).trim() === String(id).trim());
  if (!rec) {
    showToast('Data transaksi tidak ditemukan!', 'warning');
    return;
  }

  document.getElementById('dbEditSwapId').value = rec.id;
  document.getElementById('dbEditSwapIdDisplay').value = rec.id;
  document.getElementById('dbEditSwapDate').value = rec.date || '';
  document.getElementById('dbEditSwapShift').value = rec.shift || '1';
  document.getElementById('dbEditSwapUnit').value = rec.unit || '';
  document.getElementById('dbEditSwapLocation').value = rec.location || 'ROOM A1';
  document.getElementById('dbEditSwapHm').value = rec.hm || '';
  document.getElementById('dbEditSwapBatBefore').value = formatBatteryPercentage(rec.batteryBefore);
  document.getElementById('dbEditSwapJamIn').value = rec.jamIn || '';
  document.getElementById('dbEditSwapBatAfter').value = formatBatteryPercentage(rec.batteryAfter);
  document.getElementById('dbEditSwapJamOut').value = rec.jamOut || '';
  document.getElementById('dbEditSwapRemark').value = rec.statusRemark || 'On Time';
  document.getElementById('dbEditSwapProblem').value = rec.problemRemark || '13.NO PROBLEM';
  document.getElementById('dbEditSwapOperator').value = rec.operator || '';
  document.getElementById('dbEditSwapNik').value = rec.operatorNik || '';
  document.getElementById('dbEditSwapKeterangan').value = rec.keterangan || '-';

  openModal('modalDbEditSwap');
};

function handleDbEditSwapSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('dbEditSwapId').value;
  const idx = (swapsData || []).findIndex(x => String(x.id).trim() === String(id).trim());
  if (idx === -1) {
    showToast('Transaksi tidak ditemukan!', 'warning');
    return;
  }

  const updated = {
    ...swapsData[idx],
    date:          document.getElementById('dbEditSwapDate').value.trim(),
    shift:         document.getElementById('dbEditSwapShift').value,
    unit:          document.getElementById('dbEditSwapUnit').value.trim(),
    location:      document.getElementById('dbEditSwapLocation').value.trim(),
    hm:            document.getElementById('dbEditSwapHm').value.trim(),
    batteryBefore: formatBatteryPercentage(document.getElementById('dbEditSwapBatBefore').value.trim()),
    jamIn:         document.getElementById('dbEditSwapJamIn').value.trim(),
    batteryAfter:  formatBatteryPercentage(document.getElementById('dbEditSwapBatAfter').value.trim()),
    jamOut:        document.getElementById('dbEditSwapJamOut').value.trim(),
    statusRemark:  document.getElementById('dbEditSwapRemark').value.trim(),
    problemRemark: document.getElementById('dbEditSwapProblem').value.trim(),
    operator:      document.getElementById('dbEditSwapOperator').value.trim(),
    operatorNik:   document.getElementById('dbEditSwapNik').value.trim(),
    keterangan:    document.getElementById('dbEditSwapKeterangan').value.trim()
  };

  swapsData[idx] = updated;
  localStorage.setItem('voltswap_swaps', JSON.stringify(swapsData));

  closeModal('modalDbEditSwap');
  showToast(`Transaksi ${id} berhasil dikoreksi & diperbarui!`, 'success');

  renderDbSwapsTable();
  if (typeof renderMainTable === 'function') renderMainTable();
  if (typeof updateSummaryCard === 'function') updateSummaryCard();
  if (typeof renderHistoryDaily === 'function') renderHistoryDaily();
}

window.confirmDeleteDbSwap = function(id) {
  openDbConfirmModal(
    `Hapus Transaksi ${id}?`,
    `Transaksi <strong>${id}</strong> akan dihapus permanen dari sistem dan Google Sheets jika terhubung.`,
    () => {
      swapsData = (swapsData || []).filter(s => String(s.id).trim() !== String(id).trim());
      localStorage.setItem('voltswap_swaps', JSON.stringify(swapsData));

      if (typeof gasSync !== 'undefined' && typeof gasSync.deleteTransaction === 'function') {
        gasSync.deleteTransaction(id);
      }

      showToast(`Transaksi ${id} berhasil dihapus.`, 'success');
      updateDbSummaryMetrics();
      renderDbSwapsTable();
      if (typeof renderMainTable === 'function') renderMainTable();
      if (typeof updateSummaryCard === 'function') updateSummaryCard();
    }
  );
};

// -----------------------------------------------------------------------------
// 15.3 PROBLEMS CRUD
// -----------------------------------------------------------------------------
function bindDbProblemEvents() {
  const search = document.getElementById('dbProblemSearch');
  const btnAdd = document.getElementById('btnDbAddProblem');

  if (search && !search.dataset.bound) {
    search.dataset.bound = 'true';
    search.addEventListener('input', () => renderDbProblemsTable());
  }
  if (btnAdd && !btnAdd.dataset.bound) {
    btnAdd.dataset.bound = 'true';
    btnAdd.addEventListener('click', () => {
      if (typeof openAddProblemModal === 'function') {
        openAddProblemModal();
      } else {
        openModal('modalAddProblem');
      }
    });
  }
}

function renderDbProblemsTable() {
  const tbody = document.getElementById('dbProblemsTableBody');
  const countInfo = document.getElementById('dbProblemsCountInfo');
  if (!tbody) return;

  const search = (document.getElementById('dbProblemSearch')?.value || '').toLowerCase().trim();
  const filtered = (problemsData || []).filter(p => {
    if (!search) return true;
    return String(p.id || '').toLowerCase().includes(search) ||
      String(p.unit || '').toLowerCase().includes(search) ||
      String(p.problem || '').toLowerCase().includes(search);
  });

  if (countInfo) {
    countInfo.textContent = `Menampilkan ${filtered.length} dari ${(problemsData || []).length} log problem`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #94a3b8; padding: 24px;">Tidak ada log problem.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((p, idx) => {
    return `
      <tr>
        <td style="text-align: center; color: #64748b;">${idx + 1}</td>
        <td><strong style="font-family: var(--font-mono); font-size: 11px; color: #dc2626;">${p.id || `PRB-${idx+1}`}</strong></td>
        <td>${p.date || '-'}</td>
        <td>Shift ${p.shift || '1'}</td>
        <td><strong>${p.unit || '-'}</strong></td>
        <td style="max-width: 320px;"><span style="font-size: 12px; color: #334155;">${p.problem || '-'}</span></td>
        <td style="font-family: var(--font-mono); font-size: 11px;">${p.timeOpen || '-'}</td>
        <td style="font-family: var(--font-mono); font-size: 11px;">${p.timeClose || '-'}</td>
        <td><span style="font-weight: 700; color: #b45309;">${p.duration || '0'}</span></td>
        <td style="text-align: center;">
          <div class="db-table-actions">
            <button type="button" class="btn-db-table-icon delete" title="Hapus Log Masalah" onclick="confirmDeleteDbProblem('${p.id || idx}')">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.confirmDeleteDbProblem = function(idOrIdx) {
  openDbConfirmModal(
    `Hapus Log Masalah?`,
    `Log masalah ini akan dihapus permanen dari sistem.`,
    () => {
      problemsData = (problemsData || []).filter((p, i) => String(p.id) !== String(idOrIdx) && String(i) !== String(idOrIdx));
      localStorage.setItem('voltswap_problems', JSON.stringify(problemsData));
      showToast('Log problem berhasil dihapus.', 'success');
      updateDbSummaryMetrics();
      renderDbProblemsTable();
      if (typeof renderProblemTable === 'function') renderProblemTable();
    }
  );
};

// -----------------------------------------------------------------------------
// 15.4 SCHEDULES CRUD
// -----------------------------------------------------------------------------
function bindDbScheduleEvents() {
  const search = document.getElementById('dbScheduleSearch');
  const shift = document.getElementById('dbScheduleShiftFilter');
  const btnAdd = document.getElementById('btnDbAddSchedule');
  const form = document.getElementById('formDbSchedule');

  if (search && !search.dataset.bound) {
    search.dataset.bound = 'true';
    search.addEventListener('input', () => { dbScheduleCurrentPage = 1; renderDbSchedulesTable(); });
  }
  if (shift && !shift.dataset.bound) {
    shift.dataset.bound = 'true';
    shift.addEventListener('change', () => { dbScheduleCurrentPage = 1; renderDbSchedulesTable(); });
  }
  if (btnAdd && !btnAdd.dataset.bound) {
    btnAdd.dataset.bound = 'true';
    btnAdd.addEventListener('click', () => openDbScheduleModal(-1));
  }
  if (form && !form.dataset.bound) {
    form.dataset.bound = 'true';
    form.addEventListener('submit', handleDbScheduleSubmit);
  }
}

function renderDbSchedulesTable() {
  const tbody = document.getElementById('dbSchedulesTableBody');
  const recordInfo = document.getElementById('dbScheduleRecordInfo');
  const pagination = document.getElementById('dbSchedulePaginationContainer');
  if (!tbody) return;

  const search = (document.getElementById('dbScheduleSearch')?.value || '').toLowerCase().trim();
  const shift = document.getElementById('dbScheduleShiftFilter')?.value || '';

  const list = (schedulesData || []).map((s, origIdx) => ({ ...s, origIdx })).filter(s => {
    const mShift = !shift || String(s.shift) === shift;
    const mSearch = !search ||
      String(s.unit).toLowerCase().includes(search) ||
      String(s.tanggal).toLowerCase().includes(search) ||
      String(s.timeSch).toLowerCase().includes(search);
    return mShift && mSearch;
  });

  const total = list.length;
  const totalPages = Math.ceil(total / dbSchedulePerPage) || 1;
  if (dbScheduleCurrentPage > totalPages) dbScheduleCurrentPage = totalPages;

  const startIdx = (dbScheduleCurrentPage - 1) * dbSchedulePerPage;
  const pageItems = list.slice(startIdx, startIdx + dbSchedulePerPage);

  if (recordInfo) {
    recordInfo.textContent = total > 0
      ? `Menampilkan ${startIdx + 1} - ${Math.min(startIdx + dbSchedulePerPage, total)} dari ${total} jadwal`
      : 'Menampilkan 0 jadwal';
  }

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 24px;">Tidak ada jadwal swap.</td></tr>`;
    if (pagination) pagination.innerHTML = '';
    return;
  }

  tbody.innerHTML = pageItems.map((s, idx) => {
    return `
      <tr>
        <td style="text-align: center; color: #64748b;">${startIdx + idx + 1}</td>
        <td>${s.tanggal}</td>
        <td>Shift ${s.shift}</td>
        <td><strong style="color: #0f172a;">DT ${s.unit}</strong></td>
        <td><span style="font-family: var(--font-mono); font-weight: 700; color: #0284c7;">${s.timeSch}</span></td>
        <td style="text-align: center;">
          <div class="db-table-actions">
            <button type="button" class="btn-db-table-icon edit" title="Edit Jadwal" onclick="openDbScheduleModal(${s.origIdx})">✏️</button>
            <button type="button" class="btn-db-table-icon delete" title="Hapus Jadwal" onclick="confirmDeleteDbSchedule(${s.origIdx})">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (pagination) {
    pagination.innerHTML = `
      <button type="button" class="page-btn" ${dbScheduleCurrentPage <= 1 ? 'disabled' : ''} onclick="changeDbSchedulePage(${dbScheduleCurrentPage - 1})">‹ Prev</button>
      <span style="font-size: 12px; font-weight: 700; color: #475569; padding: 0 8px;">Hal ${dbScheduleCurrentPage} / ${totalPages}</span>
      <button type="button" class="page-btn" ${dbScheduleCurrentPage >= totalPages ? 'disabled' : ''} onclick="changeDbSchedulePage(${dbScheduleCurrentPage + 1})">Next ›</button>
    `;
  }
}

window.changeDbSchedulePage = function(p) {
  dbScheduleCurrentPage = p;
  renderDbSchedulesTable();
};

window.openDbScheduleModal = function(idx) {
  const modal = document.getElementById('modalDbSchedule');
  const title = document.getElementById('modalDbScheduleTitle');
  const inpIdx = document.getElementById('dbScheduleEditIndex');
  const inpDate = document.getElementById('dbSchDate');
  const inpShift = document.getElementById('dbSchShift');
  const inpUnit = document.getElementById('dbSchUnit');
  const inpTime = document.getElementById('dbSchTime');

  if (!modal) return;
  inpIdx.value = idx;

  if (idx >= 0 && schedulesData && schedulesData[idx]) {
    const s = schedulesData[idx];
    title.innerHTML = `<span>✏️</span> Edit Jadwal Unit DT ${s.unit}`;
    inpDate.value = s.tanggal;
    inpShift.value = s.shift || '1';
    inpUnit.value = s.unit;
    inpTime.value = s.timeSch;
  } else {
    title.innerHTML = `<span>🎯</span> Tambah Jadwal Swap Baru`;
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    inpDate.value = `${d}/${m}/${y}`;
    inpShift.value = '1';
    inpUnit.value = '';
    inpTime.value = '07:00:00';
  }

  openModal('modalDbSchedule');
};

function handleDbScheduleSubmit(e) {
  e.preventDefault();
  const idx = parseInt(document.getElementById('dbScheduleEditIndex').value, 10);
  const tanggal = document.getElementById('dbSchDate').value.trim();
  const shift = document.getElementById('dbSchShift').value;
  const unit = document.getElementById('dbSchUnit').value.trim().replace(/^DT\s*/i, '');
  const timeSch = document.getElementById('dbSchTime').value.trim();

  if (!tanggal || !unit || !timeSch) {
    showToast('Seluruh field jadwal wajib diisi!', 'warning');
    return;
  }

  const item = { tanggal, shift, unit, timeSch };

  if (!schedulesData) schedulesData = [];

  if (idx >= 0 && idx < schedulesData.length) {
    schedulesData[idx] = item;
    showToast(`Jadwal unit DT ${unit} berhasil diperbarui!`, 'success');
  } else {
    schedulesData.push(item);
    showToast(`Jadwal baru unit DT ${unit} berhasil ditambahkan!`, 'success');
  }

  localStorage.setItem('voltswap_schedules', JSON.stringify(schedulesData));
  closeModal('modalDbSchedule');
  updateDbSummaryMetrics();
  renderDbSchedulesTable();
  if (typeof renderScheduleTable === 'function') renderScheduleTable();
}

window.confirmDeleteDbSchedule = function(idx) {
  if (idx < 0 || !schedulesData || !schedulesData[idx]) return;
  const unit = schedulesData[idx].unit;
  openDbConfirmModal(
    `Hapus Jadwal Unit DT ${unit}?`,
    `Jadwal swap untuk unit DT ${unit} akan dihapus dari antrean sistem.`,
    () => {
      schedulesData.splice(idx, 1);
      localStorage.setItem('voltswap_schedules', JSON.stringify(schedulesData));
      showToast(`Jadwal unit DT ${unit} berhasil dihapus.`, 'success');
      updateDbSummaryMetrics();
      renderDbSchedulesTable();
      if (typeof renderScheduleTable === 'function') renderScheduleTable();
    }
  );
};

// -----------------------------------------------------------------------------
// 15.5 FLEET UNITS CRUD
// -----------------------------------------------------------------------------
function bindDbUnitEvents() {
  const search = document.getElementById('dbUnitSearch');
  if (search && !search.dataset.bound) {
    search.dataset.bound = 'true';
    search.addEventListener('input', () => renderDbUnitsTable());
  }
}

function renderDbUnitsTable() {
  const tbody = document.getElementById('dbUnitsTableBody');
  const countInfo = document.getElementById('dbUnitsCountInfo');
  if (!tbody) return;

  const search = (document.getElementById('dbUnitSearch')?.value || '').toLowerCase().trim();
  const units = fleetUnits || [];

  const filtered = units.filter(u => {
    if (!search) return true;
    return String(u.code).toLowerCase().includes(search) ||
      String(u.type || '').toLowerCase().includes(search);
  });

  if (countInfo) {
    countInfo.textContent = `Menampilkan ${filtered.length} dari ${units.length} unit armada DT EV`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 24px;">Tidak ada armada unit yang sesuai.</td></tr>`;
    return;
  }

  // Hitung total swap per unit hari ini
  const swapCounts = {};
  (swapsData || []).forEach(s => {
    const code = String(s.unit || '').replace(/^DT\s*/i, '').trim();
    swapCounts[code] = (swapCounts[code] || 0) + 1;
  });

  tbody.innerHTML = filtered.map((u, idx) => {
    const count = swapCounts[u.code] || 0;
    return `
      <tr>
        <td style="text-align: center; color: #64748b;">${idx + 1}</td>
        <td><strong style="color: #0f172a; font-size: 13.5px;">DT ${u.code}</strong></td>
        <td><span style="font-size: 11.5px; color: #475569;">${u.type || 'EV Dump Truck 90T'}</span></td>
        <td><span style="font-size: 10.5px; font-weight: 700; color: #16a34a; background: #dcfce7; padding: 2px 7px; border-radius: 4px;">Aktif</span></td>
        <td style="text-align: right;"><strong style="color: #0284c7;">${count}</strong> kali swap</td>
        <td style="text-align: center;">
          <div class="db-table-actions">
            <button type="button" class="btn-db-table-icon delete" title="Hapus Unit" onclick="confirmDeleteDbUnit('${u.code}')">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.confirmDeleteDbUnit = function(code) {
  openDbConfirmModal(
    `Hapus Unit DT ${code}?`,
    `Unit DT <strong>${code}</strong> akan dihapus dari daftar populasi armada aktif.`,
    () => {
      if (typeof deleteFleetUnit === 'function') {
        deleteFleetUnit(code);
      } else {
        fleetUnits = (fleetUnits || []).filter(u => String(u.code) !== String(code));
        localStorage.setItem('voltswap_fleet_list', JSON.stringify(fleetUnits));
        if (typeof gasSync !== 'undefined' && typeof gasSync.deleteUnit === 'function') {
          gasSync.deleteUnit(code);
        }
      }
      showToast(`Unit DT ${code} berhasil dihapus.`, 'success');
      updateDbSummaryMetrics();
      renderDbUnitsTable();
    }
  );
};

// -----------------------------------------------------------------------------
// 15.6 BACKUP, RESTORE & MIGRATION EXPORT ENGINE
// -----------------------------------------------------------------------------
function bindDbBackupEvents() {
  const btnQuick = document.getElementById('btnDbHeaderQuickBackup');
  const btnAllJson = document.getElementById('btnDbExportAllJson');
  const btnTriggerImport = document.getElementById('btnDbTriggerImport');
  const fileInput = document.getElementById('dbImportFileInput');

  // Hero Cloud Sync to Google Sheets
  const btnBackupSheets = document.getElementById('btnDbBackupAllToSheets');
  if (btnBackupSheets && !btnBackupSheets.dataset.bound) {
    btnBackupSheets.dataset.bound = 'true';
    btnBackupSheets.addEventListener('click', backupAllDataToGoogleSheets);
  }

  // Master Excel Multi-Sheet Export
  const btnMasterExcel = document.getElementById('btnDbExportAllExcel');
  if (btnMasterExcel && !btnMasterExcel.dataset.bound) {
    btnMasterExcel.dataset.bound = 'true';
    btnMasterExcel.addEventListener('click', exportAllToExcelMultiSheet);
  }

  // JSON Quick & Full
  if (btnQuick && !btnQuick.dataset.bound) {
    btnQuick.dataset.bound = 'true';
    btnQuick.addEventListener('click', exportFullDatabaseJSON);
  }
  if (btnAllJson && !btnAllJson.dataset.bound) {
    btnAllJson.dataset.bound = 'true';
    btnAllJson.addEventListener('click', exportFullDatabaseJSON);
  }
  if (btnTriggerImport && !btnTriggerImport.dataset.bound) {
    btnTriggerImport.dataset.bound = 'true';
    btnTriggerImport.addEventListener('click', () => {
      if (fileInput) fileInput.click();
    });
  }
  if (fileInput && !fileInput.dataset.bound) {
    fileInput.dataset.bound = 'true';
    fileInput.addEventListener('change', handleDbImportFile);
  }

  // Excel Per Table Buttons
  const bUsersExcel = document.getElementById('btnDbExportUsersExcel');
  const bSwapsExcel = document.getElementById('btnDbExportSwapsExcel');
  const bProbExcel = document.getElementById('btnDbExportProblemsExcel');
  const bSchExcel = document.getElementById('btnDbExportSchedulesExcel');
  const bUnitsExcel = document.getElementById('btnDbExportUnitsExcel');

  if (bUsersExcel && !bUsersExcel.dataset.bound) {
    bUsersExcel.dataset.bound = 'true';
    bUsersExcel.addEventListener('click', exportUsersExcel);
  }
  if (bSwapsExcel && !bSwapsExcel.dataset.bound) {
    bSwapsExcel.dataset.bound = 'true';
    bSwapsExcel.addEventListener('click', exportSwapsExcel);
  }
  if (bProbExcel && !bProbExcel.dataset.bound) {
    bProbExcel.dataset.bound = 'true';
    bProbExcel.addEventListener('click', exportProblemsExcel);
  }
  if (bSchExcel && !bSchExcel.dataset.bound) {
    bSchExcel.dataset.bound = 'true';
    bSchExcel.addEventListener('click', exportSchedulesExcel);
  }
  if (bUnitsExcel && !bUnitsExcel.dataset.bound) {
    bUnitsExcel.dataset.bound = 'true';
    bUnitsExcel.addEventListener('click', exportUnitsExcel);
  }

  // Quick Table Selection Buttons
  const btnSelectDaily = document.getElementById('btnSelectDailyOnly');
  const btnSelectAll = document.getElementById('btnSelectAllTables');
  if (btnSelectDaily && !btnSelectDaily.dataset.bound) {
    btnSelectDaily.dataset.bound = 'true';
    btnSelectDaily.addEventListener('click', () => {
      const cSwaps = document.getElementById('chkBackupSwaps');
      const cProb = document.getElementById('chkBackupProblems');
      const cSch = document.getElementById('chkBackupSchedules');
      const cUnits = document.getElementById('chkBackupUnits');
      const cUsers = document.getElementById('chkBackupUsers');
      if (cSwaps) cSwaps.checked = true;
      if (cProb) cProb.checked = true;
      if (cSch) cSch.checked = true;
      if (cUnits) cUnits.checked = false;
      if (cUsers) cUsers.checked = false;
      recalculateBackupDataPreview();
    });
  }
  if (btnSelectAll && !btnSelectAll.dataset.bound) {
    btnSelectAll.dataset.bound = 'true';
    btnSelectAll.addEventListener('click', () => {
      const cSwaps = document.getElementById('chkBackupSwaps');
      const cProb = document.getElementById('chkBackupProblems');
      const cSch = document.getElementById('chkBackupSchedules');
      const cUnits = document.getElementById('chkBackupUnits');
      const cUsers = document.getElementById('chkBackupUsers');
      if (cSwaps) cSwaps.checked = true;
      if (cProb) cProb.checked = true;
      if (cSch) cSch.checked = true;
      if (cUnits) cUnits.checked = true;
      if (cUsers) cUsers.checked = true;
      recalculateBackupDataPreview();
    });
  }

  // Listeners for Table Checkboxes & Date Strategy Radios
  ['chkBackupSwaps', 'chkBackupProblems', 'chkBackupSchedules', 'chkBackupUnits', 'chkBackupUsers'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.bound) {
      el.dataset.bound = 'true';
      el.addEventListener('change', recalculateBackupDataPreview);
    }
  });

  document.querySelectorAll('input[name="dbDateStrategy"]').forEach(radio => {
    if (!radio.dataset.bound) {
      radio.dataset.bound = 'true';
      radio.addEventListener('change', () => {
        const wrapRange = document.getElementById('wrapCustomDateInputs');
        if (wrapRange) {
          wrapRange.style.display = radio.value === 'range' ? 'flex' : 'none';
        }
        recalculateBackupDataPreview();
      });
    }
  });

  // Date inputs default setup
  const inpStart = document.getElementById('inpBackupStartDate');
  const inpEnd = document.getElementById('inpBackupEndDate');
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  if (inpStart && !inpStart.value) inpStart.value = `${yyyy}-${mm}-01`;
  if (inpEnd && !inpEnd.value) inpEnd.value = `${yyyy}-${mm}-${dd}`;

  if (inpStart && !inpStart.dataset.bound) {
    inpStart.dataset.bound = 'true';
    inpStart.addEventListener('change', recalculateBackupDataPreview);
  }
  if (inpEnd && !inpEnd.dataset.bound) {
    inpEnd.dataset.bound = 'true';
    inpEnd.addEventListener('change', recalculateBackupDataPreview);
  }

  // Inisialisasi tampilan status terakhir backup & preview data
  updateLastSheetsBackupDisplay();
  recalculateBackupDataPreview();
}

/**
 * Helper: parsing format tanggal DD/MM/YYYY atau YYYY-MM-DD ke timestamp angka
 */
function parseDateStringToTime(dStr) {
  if (!dStr) return 0;
  if (dStr instanceof Date) return new Date(dStr.getFullYear(), dStr.getMonth(), dStr.getDate()).getTime();
  const s = String(dStr).trim();
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[2], 10);
      return new Date(y, m, d).getTime();
    }
  } else if (s.includes('-')) {
    const parts = s.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      return new Date(y, m, d).getTime();
    }
  }
  return 0;
}

/**
 * Memperbarui tampilan info riwayat backup terakhir ke Google Sheets
 */
function updateLastSheetsBackupDisplay(hist) {
  const timeEl = document.getElementById('txtLastSheetsBackupTime');
  const userEl = document.getElementById('txtLastSheetsBackupUser');
  const cutoffInfo = document.getElementById('lblCutoffDateInfo');

  if (!hist) {
    try {
      const saved = localStorage.getItem('voltswap_last_sheets_backup');
      if (saved) hist = JSON.parse(saved);
    } catch (e) {}
  }
  if (hist && hist.time) {
    if (timeEl) timeEl.textContent = hist.time;
    if (userEl) userEl.textContent = `Oleh: ${hist.user || 'SUPERVISOR'} [Cutoff: ${hist.cutoffDate || '-'}]`;
    if (cutoffInfo) cutoffInfo.textContent = hist.cutoffDate || '-';
  } else {
    if (cutoffInfo) cutoffInfo.textContent = 'Belum pernah dibackup';
  }
}

/**
 * Menghitung dan menampilkan preview jumlah data yang siap dikirim
 */
function recalculateBackupDataPreview() {
  const cSwaps = document.getElementById('chkBackupSwaps')?.checked ?? true;
  const cProb = document.getElementById('chkBackupProblems')?.checked ?? true;
  const cSch = document.getElementById('chkBackupSchedules')?.checked ?? true;
  const cUnits = document.getElementById('chkBackupUnits')?.checked ?? false;
  const cUsers = document.getElementById('chkBackupUsers')?.checked ?? false;

  const strategyEl = document.querySelector('input[name="dbDateStrategy"]:checked');
  const strategy = strategyEl ? strategyEl.value : 'auto';

  let lastCutoffTime = 0;
  let lastCutoffStr = '';
  try {
    const saved = localStorage.getItem('voltswap_last_sheets_backup');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.cutoffDate) {
        lastCutoffStr = parsed.cutoffDate;
        lastCutoffTime = parseDateStringToTime(parsed.cutoffDate);
      }
    }
  } catch (e) {}

  const cutoffLabel = document.getElementById('lblCutoffDateInfo');
  if (cutoffLabel) {
    cutoffLabel.textContent = lastCutoffStr ? lastCutoffStr : 'Belum pernah dibackup (akan mencadangkan seluruh data)';
  }

  const inpStart = document.getElementById('inpBackupStartDate');
  const inpEnd = document.getElementById('inpBackupEndDate');
  const startTime = (strategy === 'range' && inpStart?.value) ? parseDateStringToTime(inpStart.value) : 0;
  const endTime = (strategy === 'range' && inpEnd?.value) ? parseDateStringToTime(inpEnd.value) + 86399000 : Infinity;

  // Filter Swaps
  let filteredSwaps = [];
  if (cSwaps && Array.isArray(swapsData)) {
    filteredSwaps = swapsData.filter(s => {
      if (strategy === 'all') return true;
      const t = parseDateStringToTime(s.date);
      if (strategy === 'auto') {
        return lastCutoffTime > 0 ? t > lastCutoffTime : true;
      }
      if (strategy === 'range') {
        return t >= startTime && t <= endTime;
      }
      return true;
    });
  }

  // Filter Problems
  let filteredProblems = [];
  if (cProb && Array.isArray(problemsData)) {
    filteredProblems = problemsData.filter(p => {
      if (strategy === 'all') return true;
      const t = parseDateStringToTime(p.date);
      if (strategy === 'auto') {
        return lastCutoffTime > 0 ? t > lastCutoffTime : true;
      }
      if (strategy === 'range') {
        return t >= startTime && t <= endTime;
      }
      return true;
    });
  }

  // Filter Schedules
  let filteredSchedules = [];
  if (cSch && Array.isArray(schedulesData)) {
    filteredSchedules = schedulesData.filter(s => {
      if (strategy === 'all') return true;
      const t = parseDateStringToTime(s.tanggal);
      if (strategy === 'auto') {
        return lastCutoffTime > 0 ? t > lastCutoffTime : true;
      }
      if (strategy === 'range') {
        return t >= startTime && t <= endTime;
      }
      return true;
    });
  }

  const unitsCount = cUnits ? (fleetUnits || []).length : 0;
  const users = (typeof window.getAppUsers === 'function') ? window.getAppUsers() : OPERATOR_USERS;
  const usersCount = cUsers ? users.length : 0;

  const previewEl = document.getElementById('txtBackupCountPreview');
  if (previewEl) {
    const parts = [];
    if (cSwaps) parts.push(`⚡ ${filteredSwaps.length} Transaksi Swap`);
    if (cProb) parts.push(`⚠️ ${filteredProblems.length} Log Masalah`);
    if (cSch) parts.push(`🎯 ${filteredSchedules.length} Jadwal`);
    if (cUnits) parts.push(`🚜 ${unitsCount} Armada DT`);
    if (cUsers) parts.push(`👥 ${usersCount} Akun`);

    if (parts.length === 0) {
      previewEl.innerHTML = '<span style="color: #dc2626;">Pilih minimal 1 tabel untuk dicadangkan!</span>';
    } else {
      previewEl.innerHTML = parts.join(' &nbsp;•&nbsp; ');
    }
  }

  return {
    filteredSwaps,
    filteredProblems,
    filteredSchedules,
    unitsCount,
    usersCount,
    cSwaps,
    cProb,
    cSch,
    cUnits,
    cUsers,
    strategy
  };
}

/**
 * Melakukan Sinkronisasi / Backup Data Terpilih ke Google Spreadsheet Master
 */
function backupAllDataToGoogleSheets() {
  const btn = document.getElementById('btnDbBackupAllToSheets');
  const progressBox = document.getElementById('dbBackupSyncProgress');
  const progressBar = document.getElementById('dbBackupProgressBar');
  const progressText = document.getElementById('dbBackupProgressText');

  const preview = recalculateBackupDataPreview();
  if (!preview.cSwaps && !preview.cProb && !preview.cSch && !preview.cUnits && !preview.cUsers) {
    showToast('Silakan pilih minimal 1 tabel yang ingin dicadangkan!', 'warning');
    return;
  }

  if (btn) btn.disabled = true;
  if (progressBox) progressBox.style.display = 'block';
  if (progressBar) progressBar.style.width = '20%';
  if (progressText) progressText.textContent = `Mengumpulkan data (${preview.strategy === 'auto' ? 'Auto-Resume Tanggal' : preview.strategy === 'range' ? 'Rentang Tanggal' : 'Semua Tanggal'})...`;

  const users = (typeof window.getAppUsers === 'function') ? window.getAppUsers() : OPERATOR_USERS;
  const payload = {
    mode: 'incremental',
    strategy: preview.strategy,
    swaps: preview.cSwaps ? preview.filteredSwaps : [],
    problems: preview.cProb ? preview.filteredProblems : [],
    schedules: preview.cSch ? preview.filteredSchedules : [],
    units: preview.cUnits ? (fleetUnits || []).map(u => (typeof u === 'string' ? u : u.code)) : [],
    users: preview.cUsers ? users : []
  };

  // Cari tanggal terbaru dari data yang dikirim untuk dijadikan cutoff date baru
  let maxTime = 0;
  let maxDateStr = '';
  [...payload.swaps, ...payload.problems, ...payload.schedules].forEach(item => {
    const dStr = item.date || item.tanggal;
    const t = parseDateStringToTime(dStr);
    if (t > maxTime) {
      maxTime = t;
      maxDateStr = dStr;
    }
  });

  if (!maxDateStr) {
    const now = new Date();
    maxDateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  }

  const finalizeSuccess = function(msg) {
    if (progressBar) progressBar.style.width = '100%';
    if (progressText) progressText.textContent = '✅ ' + (msg || 'Backup ke Google Sheets berhasil!');

    const now = new Date();
    const dStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const opName = (currentAuthUser && currentAuthUser.name) ? currentAuthUser.name : 'SRIYANTO';
    const roleName = (currentAuthUser && currentAuthUser.role) ? currentAuthUser.role : 'SUPERVISOR';

    const hist = {
      time: dStr,
      user: `${opName} (${roleName})`,
      cutoffDate: maxDateStr,
      mode: preview.strategy
    };
    localStorage.setItem('voltswap_last_sheets_backup', JSON.stringify(hist));
    updateLastSheetsBackupDisplay(hist);
    recalculateBackupDataPreview();

    showToast('☁️ ' + (msg || 'Semua data terpilih berhasil dibackup ke Google Sheets!'), 'success');

    setTimeout(() => {
      if (btn) btn.disabled = false;
      if (progressBox) progressBox.style.display = 'none';
      if (progressBar) progressBar.style.width = '0%';
    }, 2800);
  };

  const finalizeFailure = function(errMsg) {
    if (progressBar) progressBar.style.width = '100%';
    if (progressText) progressText.textContent = '❌ Gagal: ' + errMsg;
    showToast('Gagal backup ke Google Sheets: ' + errMsg, 'danger');
    setTimeout(() => {
      if (btn) btn.disabled = false;
    }, 3500);
  };

  if (IS_GAS_ENV) {
    if (progressBar) progressBar.style.width = '50%';
    if (progressText) progressText.textContent = 'Mengirim data ke Google Spreadsheet Master...';

    google.script.run
      .withSuccessHandler(function(res) {
        if (res && res.status === 'success') {
          finalizeSuccess(res.message);
        } else {
          finalizeFailure(res ? res.message : 'Terjadi kendala pada server Google Apps Script');
        }
      })
      .withFailureHandler(function(err) {
        finalizeFailure(String(err));
      })
      .apiBackupAllToSheets(payload);
  } else {
    // Simulasi responsif pada pengujian lokal browser
    if (progressBar) progressBar.style.width = '65%';
    if (progressText) progressText.textContent = 'Menghubungkan ke Google Spreadsheet API...';
    setTimeout(() => {
      finalizeSuccess(`Backup Selesai (${preview.strategy === 'auto' ? 'Auto-Resume' : preview.strategy}): Data terpilih s/d ${maxDateStr} aman tersimpan di Google Sheets!`);
    }, 1200);
  }
}

/**
 * Ekspor Master Excel (.xlsx All-in-One Multi-Sheet)
 */
function exportAllToExcelMultiSheet() {
  if (typeof XLSX === 'undefined') {
    showToast('Pustaka SheetJS (XLSX) sedang dimuat...', 'warning');
    return;
  }
  const wb = XLSX.utils.book_new();

  // 1. Sheet USERS
  const users = (typeof window.getAppUsers === 'function') ? window.getAppUsers() : OPERATOR_USERS;
  const userRows = [
    ['NO', 'NIK', 'NAMA LENGKAP', 'JABATAN', 'ROLE', 'PASSWORD LOGIN', 'DEPARTEMEN']
  ];
  users.forEach((u, i) => {
    userRows.push([i + 1, u.nik, u.name, u.title || '', u.role, u.password || u.nik, u.dept || 'Charging Operations']);
  });
  const wsUsers = XLSX.utils.aoa_to_sheet(userRows);
  wsUsers['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 26 }, { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsUsers, 'USERS');

  // 2. Sheet TRANSAKSI_SWAP
  const swapRows = [
    ['NO', 'TRANSACTION ID', 'DATE', 'SHIFT', 'CATEGORY', 'LOCATION', 'KODE UNIT', 'HM', 'BATTERY BEFORE', 'JAM IN', 'BATTERY AFTER', 'JAM OUT', 'DURATION (MIN)', 'ENERGY (KWH)', 'STATUS REMARK', 'PROBLEM REMARK', 'OPERATOR', 'OPERATOR NIK', 'KETERANGAN']
  ];
  (swapsData || []).forEach((s, i) => {
    swapRows.push([
      i + 1, s.id, s.date, s.shift, s.category || 'CHARGING SWAP', s.location || 'ROOM A1',
      s.unit, s.hm || '', formatBatteryPercentage(s.batteryBefore), s.jamIn, formatBatteryPercentage(s.batteryAfter), s.jamOut,
      s.durationMin || 6, s.energyKwh || 0, s.statusRemark || 'On Time',
      s.problemRemark || '13.NO PROBLEM', s.operator || '', s.operatorNik || '', s.keterangan || '-'
    ]);
  });
  const wsSwaps = XLSX.utils.aoa_to_sheet(swapRows);
  wsSwaps['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsSwaps, 'TRANSAKSI_SWAP');

  // 3. Sheet PROBLEM_LOG
  const probRows = [
    ['NO', 'PROBLEM ID', 'DATE', 'SHIFT', 'KODE UNIT', 'PROBLEM DESCRIPTION', 'TIME OPEN', 'TIME CLOSE', 'DURATION']
  ];
  (problemsData || []).forEach((p, i) => {
    probRows.push([
      i + 1, p.id || `PRB-${i+1}`, p.date || '', p.shift || '1', p.unit || '',
      p.problem || '', p.timeOpen || '', p.timeClose || '', p.duration || ''
    ]);
  });
  const wsProblems = XLSX.utils.aoa_to_sheet(probRows);
  wsProblems['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 35 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsProblems, 'PROBLEM_LOG');

  // 4. Sheet SCHEDULES
  const schRows = [
    ['NO', 'TANGGAL', 'SHIFT', 'KODE UNIT DT', 'TARGET JAM (TIME SCH)']
  ];
  (schedulesData || []).forEach((s, i) => {
    schRows.push([i + 1, s.tanggal, `Shift ${s.shift}`, `DT ${s.unit}`, s.timeSch]);
  });
  const wsSchedules = XLSX.utils.aoa_to_sheet(schRows);
  wsSchedules['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsSchedules, 'SCHEDULES');

  // 5. Sheet POPULASI_UNIT
  const unitRows = [
    ['NO', 'KODE UNIT DT', 'MODEL / TIPE', 'STATUS ARMADA', 'CATATAN']
  ];
  (fleetUnits || []).forEach((u, i) => {
    unitRows.push([i + 1, `DT ${u.code}`, u.type || 'EV Dump Truck 90T', u.status || 'Aktif', u.note || 'Operasional Normal']);
  });
  const wsUnits = XLSX.utils.aoa_to_sheet(unitRows);
  wsUnits['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, wsUnits, 'POPULASI_UNIT');

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
  XLSX.writeFile(wb, `PPA_VoltSwap_Master_Database_${dateStr}.xlsx`);
  showToast('📊 Master Excel (.xlsx All-in-One) 5-Sheet berhasil diunduh!', 'success');
}

/**
 * Ekspor Excel per Tabel
 */
function exportUsersExcel() {
  if (typeof XLSX === 'undefined') return exportUsersCSV();
  const wb = XLSX.utils.book_new();
  const users = (typeof window.getAppUsers === 'function') ? window.getAppUsers() : OPERATOR_USERS;
  const rows = [['NO', 'NIK', 'NAMA LENGKAP', 'JABATAN', 'ROLE', 'PASSWORD LOGIN', 'DEPARTEMEN']];
  users.forEach((u, i) => rows.push([i + 1, u.nik, u.name, u.title || '', u.role, u.password || u.nik, u.dept || 'Charging Operations']));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 26 }, { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws, 'USERS');
  XLSX.writeFile(wb, 'voltswap_users.xlsx');
  showToast('📊 Excel Pengguna (.xlsx) berhasil diunduh!', 'success');
}

function exportSwapsExcel() {
  if (typeof XLSX === 'undefined') return exportSwapsCSV();
  const wb = XLSX.utils.book_new();
  const rows = [['NO', 'TRANSACTION ID', 'DATE', 'SHIFT', 'CATEGORY', 'LOCATION', 'KODE UNIT', 'HM', 'BATTERY BEFORE', 'JAM IN', 'BATTERY AFTER', 'JAM OUT', 'DURATION (MIN)', 'ENERGY (KWH)', 'STATUS REMARK', 'PROBLEM REMARK', 'OPERATOR', 'OPERATOR NIK', 'KETERANGAN']];
  (swapsData || []).forEach((s, i) => {
    rows.push([
      i + 1, s.id, s.date, s.shift, s.category || 'CHARGING SWAP', s.location || 'ROOM A1',
      s.unit, s.hm || '', formatBatteryPercentage(s.batteryBefore), s.jamIn, formatBatteryPercentage(s.batteryAfter), s.jamOut,
      s.durationMin || 6, s.energyKwh || 0, s.statusRemark || 'On Time',
      s.problemRemark || '13.NO PROBLEM', s.operator || '', s.operatorNik || '', s.keterangan || '-'
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws, 'TRANSAKSI');
  XLSX.writeFile(wb, 'voltswap_transactions.xlsx');
  showToast('📊 Excel Transaksi (.xlsx) berhasil diunduh!', 'success');
}

function exportProblemsExcel() {
  if (typeof XLSX === 'undefined') return exportProblemsCSV();
  const wb = XLSX.utils.book_new();
  const rows = [['NO', 'PROBLEM ID', 'DATE', 'SHIFT', 'KODE UNIT', 'PROBLEM DESCRIPTION', 'TIME OPEN', 'TIME CLOSE', 'DURATION']];
  (problemsData || []).forEach((p, i) => {
    rows.push([i + 1, p.id || `PRB-${i+1}`, p.date || '', p.shift || '1', p.unit || '', p.problem || '', p.timeOpen || '', p.timeClose || '', p.duration || '']);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 35 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'PROBLEM_LOG');
  XLSX.writeFile(wb, 'voltswap_problems.xlsx');
  showToast('📊 Excel Log Masalah (.xlsx) berhasil diunduh!', 'success');
}

function exportSchedulesExcel() {
  if (typeof XLSX === 'undefined') return exportSchedulesCSV();
  const wb = XLSX.utils.book_new();
  const rows = [['NO', 'TANGGAL', 'SHIFT', 'KODE UNIT DT', 'TARGET JAM (TIME SCH)']];
  (schedulesData || []).forEach((s, i) => {
    rows.push([i + 1, s.tanggal, `Shift ${s.shift}`, `DT ${s.unit}`, s.timeSch]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws, 'SCHEDULES');
  XLSX.writeFile(wb, 'voltswap_schedules.xlsx');
  showToast('📊 Excel Jadwal (.xlsx) berhasil diunduh!', 'success');
}

function exportUnitsExcel() {
  if (typeof XLSX === 'undefined') return exportUnitsCSV();
  const wb = XLSX.utils.book_new();
  const rows = [['NO', 'KODE UNIT DT', 'MODEL / TIPE', 'STATUS ARMADA', 'CATATAN']];
  (fleetUnits || []).forEach((u, i) => {
    rows.push([i + 1, `DT ${u.code}`, u.type || 'EV Dump Truck 90T', u.status || 'Aktif', u.note || 'Operasional Normal']);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, ws, 'POPULASI_UNIT');
  XLSX.writeFile(wb, 'voltswap_units.xlsx');
  showToast('📊 Excel Populasi DT (.xlsx) berhasil diunduh!', 'success');
}

// Full Database JSON Export
function exportFullDatabaseJSON() {
  const users = (typeof window.getAppUsers === 'function') ? window.getAppUsers() : OPERATOR_USERS;
  const fullBackup = {
    appName: "PPA Safe & Strong - Charging & Battery Swap System",
    version: "2.0",
    schemaVersion: "firestore-ready-v1",
    exportedAt: new Date().toISOString(),
    stats: {
      totalUsers: users.length,
      totalSwaps: (swapsData || []).length,
      totalProblems: (problemsData || []).length,
      totalSchedules: (schedulesData || []).length,
      totalUnits: (fleetUnits || []).length
    },
    collections: {
      users: users,
      swaps: swapsData || [],
      problems: problemsData || [],
      schedules: schedulesData || [],
      units: (fleetUnits || []).map(u => ({ code: u.code, type: u.type || 'EV Dump Truck 90T' }))
    }
  };

  const jsonStr = JSON.stringify(fullBackup, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;

  a.href = url;
  a.download = `voltswap_full_backup_${timestamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('💾 Cadangan database lengkap berhasil diunduh (JSON)!', 'success');
}

// Restore Database JSON
function handleDbImportFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = JSON.parse(evt.target.result);
      const cols = data.collections || data;

      if (!cols || (!cols.users && !cols.swaps && !cols.problems)) {
        showToast('Berkas JSON tidak memiliki skema koleksi database yang valid!', 'danger');
        return;
      }

      const uCount = cols.users ? cols.users.length : 0;
      const sCount = cols.swaps ? cols.swaps.length : 0;
      const pCount = cols.problems ? cols.problems.length : 0;
      const schCount = cols.schedules ? cols.schedules.length : 0;
      const unitCount = cols.units ? cols.units.length : 0;

      openDbConfirmModal(
        'Pulihkan Seluruh Database?',
        `Berkas valid ditemukan:<br>• ${uCount} Users<br>• ${sCount} Transaksi<br>• ${pCount} Problem Log<br>• ${schCount} Jadwal<br>• ${unitCount} Armada DT<br><br>Apakah Anda yakin ingin menerapkan cadangan ini ke database lokal?`,
        () => {
          if (cols.users && cols.users.length > 0) {
            window.saveAppUsers(cols.users);
          }
          if (cols.swaps) {
            swapsData = cols.swaps;
            localStorage.setItem('voltswap_swaps', JSON.stringify(swapsData));
          }
          if (cols.problems) {
            problemsData = cols.problems;
            localStorage.setItem('voltswap_problems', JSON.stringify(problemsData));
          }
          if (cols.schedules) {
            schedulesData = cols.schedules;
            localStorage.setItem('voltswap_schedules', JSON.stringify(schedulesData));
          }
          if (cols.units) {
            fleetUnits = cols.units.map(u => ({
              code: typeof u === 'string' ? u : u.code,
              type: (typeof u === 'object' && u.type) ? u.type : 'EV Dump Truck 90T',
              status: 'Aktif',
              note: 'Operasional Normal'
            }));
            localStorage.setItem('voltswap_fleet_list', JSON.stringify(fleetUnits));
          }

          showToast('✅ Seluruh database berhasil dipulihkan dari cadangan!', 'success');
          updateDbSummaryMetrics();
          renderDbTabContent(dbActiveTab);

          if (typeof renderMainTable === 'function') renderMainTable();
          if (typeof updateSummaryCard === 'function') updateSummaryCard();
          if (typeof renderHistoryDaily === 'function') renderHistoryDaily();
          if (typeof renderScheduleTable === 'function') renderScheduleTable();
          if (typeof renderProblemTable === 'function') renderProblemTable();
          if (typeof renderUnitTable === 'function') renderUnitTable();
        }
      );
    } catch (err) {
      showToast('Gagal membaca berkas JSON: ' + err.message, 'danger');
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // Reset file input
}

// CSV Export Helpers
function downloadCsvFile(csvContent, filename) {
  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportUsersCSV() {
  const users = (typeof window.getAppUsers === 'function') ? window.getAppUsers() : OPERATOR_USERS;
  let csv = 'No,NIK,Nama Lengkap,Jabatan,Role,Password,Departemen\n';
  users.forEach((u, i) => {
    csv += `${i + 1},"${u.nik}","${u.name}","${u.title || ''}","${u.role}","${u.password || u.nik}","${u.dept || ''}"\n`;
  });
  downloadCsvFile(csv, 'voltswap_users.csv');
  showToast('📊 CSV Pengguna berhasil diunduh!', 'success');
}

function exportSwapsCSV() {
  const list = swapsData || [];
  let csv = 'No,Transaction ID,Date,Shift,Category,Location,Unit,HM,Battery Before,Jam In,Battery After,Jam Out,Duration Min,Energy KWh,Status Remark,Problem Remark,Operator,Operator NIK,Keterangan\n';
  list.forEach((s, i) => {
    csv += `${i + 1},"${s.id}","${s.date}","${s.shift}","${s.category || ''}","${s.location || ''}","${s.unit}","${s.hm || ''}","${formatBatteryPercentage(s.batteryBefore)}","${s.jamIn}","${formatBatteryPercentage(s.batteryAfter)}","${s.jamOut}","${s.durationMin || 6}","${s.energyKwh || 0}","${s.statusRemark || ''}","${s.problemRemark || ''}","${s.operator || ''}","${s.operatorNik || ''}","${s.keterangan || ''}"\n`;
  });
  downloadCsvFile(csv, 'voltswap_transactions.csv');
  showToast('📊 CSV Transaksi berhasil diunduh!', 'success');
}

function exportProblemsCSV() {
  const list = problemsData || [];
  let csv = 'No,Problem ID,Date,Shift,Unit,Problem Description,Time Open,Time Close,Duration\n';
  list.forEach((p, i) => {
    csv += `${i + 1},"${p.id || ''}","${p.date || ''}","${p.shift || '1'}","${p.unit || ''}","${(p.problem || '').replace(/"/g, '""')}","${p.timeOpen || ''}","${p.timeClose || ''}","${p.duration || ''}"\n`;
  });
  downloadCsvFile(csv, 'voltswap_problems.csv');
  showToast('📊 CSV Log Masalah berhasil diunduh!', 'success');
}

function exportSchedulesCSV() {
  const list = schedulesData || [];
  let csv = 'No,Tanggal,Shift,Unit,Time Schedule\n';
  list.forEach((s, i) => {
    csv += `${i + 1},"${s.tanggal}","${s.shift}","${s.unit}","${s.timeSch}"\n`;
  });
  downloadCsvFile(csv, 'voltswap_schedules.csv');
  showToast('📊 CSV Jadwal berhasil diunduh!', 'success');
}

function exportUnitsCSV() {
  const list = fleetUnits || [];
  let csv = 'No,Kode Unit,Tipe Armada,Status,Catatan\n';
  list.forEach((u, i) => {
    csv += `${i + 1},"${u.code}","${u.type || 'EV Dump Truck 90T'}","${u.status || 'Aktif'}","${u.note || ''}"\n`;
  });
  downloadCsvFile(csv, 'voltswap_units.csv');
  showToast('📊 CSV Populasi DT berhasil diunduh!', 'success');
}

// Generic Confirmation Modal Helper
function openDbConfirmModal(heading, message, onConfirm) {
  const modal = document.getElementById('modalDbConfirmDelete');
  const hEl = document.getElementById('modalDbDeleteHeading');
  const mEl = document.getElementById('modalDbDeleteMsg');
  const btnAction = document.getElementById('btnDbConfirmDeleteAction');

  if (!modal || !btnAction) {
    if (confirm(heading + '\n\n' + message.replace(/<[^>]*>/g, ''))) {
      if (typeof onConfirm === 'function') onConfirm();
    }
    return;
  }

  if (hEl) hEl.textContent = heading;
  if (mEl) mEl.innerHTML = message;

  dbPendingDeleteAction = onConfirm;

  if (!btnAction.dataset.bound) {
    btnAction.dataset.bound = 'true';
    btnAction.addEventListener('click', () => {
      closeModal('modalDbConfirmDelete');
      if (typeof dbPendingDeleteAction === 'function') {
        dbPendingDeleteAction();
        dbPendingDeleteAction = null;
      }
    });
  }

  openModal('modalDbConfirmDelete');
}

