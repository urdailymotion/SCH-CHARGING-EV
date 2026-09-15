/**
 * PPA Safe & Strong - Charging & Battery Swap Management System
 * Google Apps Script Backend (Code.gs)
 * Spreadsheet ID: 1wLWDdDo61Of6oL0viw1LW2FYSFQnKDrnt6UcmUTZW-Q
 *
 * Sheet mapping (nama sheet di Spreadsheet):
 *  - DATA INPUT   : Transaksi swap (19 kolom)
 *  - USER         : Data pengguna / operator
 *  - SCEDHULE     : Jadwal swap unit
 *  - DATA PROBLEM : Log gangguan / downtime
 *  - POPULASI UNIT: Daftar kode unit armada
 */

const SPREADSHEET_ID = '1wLWDdDo61Of6oL0viw1LW2FYSFQnKDrnt6UcmUTZW-Q';

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('PPA Safe & Strong - Charging & Battery Swap')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=5.0');
}

function doPost(e) {
  try {
    let payload = null;
    if (e && e.postData && e.postData.contents) {
      try {
        const body = JSON.parse(e.postData.contents);
        payload = body.payload || body;
      } catch (err) {
        payload = null;
      }
    }
    if (payload) {
      const result = apiBackupAllToSheets(payload);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Payload kosong' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

// =============================================================================
// 1. FETCH ALL SHEETS DATA (Users, Schedules, Problems, Fleet, Transactions)
// =============================================================================
function apiGetAllSheetsData() {
  try {
    const ss = getSpreadsheet();

    // ---- 1. Sheet USER ----
    const userSheet = ss.getSheetByName('USER');
    const users = [];
    if (userSheet) {
      const userRows = userSheet.getDataRange().getValues();
      for (let i = 1; i < userRows.length; i++) {
        const r = userRows[i];
        if (!r[1]) continue; // NRP kosong
        const roleRaw = String(r[4] || '').toUpperCase();
        const isSpv = roleRaw.includes('LEADER') || roleRaw.includes('SUPERVISOR') || roleRaw.includes('ADMIN');
        users.push({
          no:       r[0],
          nik:      String(r[1]).trim(),
          name:     String(r[2]).trim(),
          title:    String(r[3]).trim(),
          role:     isSpv ? 'SUPERVISOR' : 'OPERATOR',
          password: String(r[5] || r[1]).trim(), // password di kolom F, fallback ke NIK
          dept:     'Charging Operations'
        });
      }
    }

    // ---- 2. Sheet SCEDHULE ----
    const schSheet = ss.getSheetByName('SCEDHULE');
    const schedules = [];
    if (schSheet) {
      const schRows = schSheet.getDataRange().getValues();
      for (let i = 1; i < schRows.length; i++) {
        const r = schRows[i];
        if (!r[2]) continue;
        schedules.push({
          tanggal: formatDateCell(r[0]),
          shift:   String(r[1]).trim(),
          unit:    String(r[2]).trim(),
          timeSch: formatTimeCell(r[3])
        });
      }
    }

    // ---- 3. Sheet DATA PROBLEM ----
    const probSheet = ss.getSheetByName('DATA PROBLEM');
    const problems = [];
    if (probSheet) {
      const probRows = probSheet.getDataRange().getValues();
      for (let i = 1; i < probRows.length; i++) {
        const r = probRows[i];
        if (r[0] === '' && r[3] === '') continue;
        const probId = r[0] ? String(r[0]) : `PRB-${i}`;
        problems.push({
          id:        probId,
          no:        String(i),
          date:      formatDateCell(r[1]),
          shift:     String(r[2] || '1'),
          unit:      String(r[3] || '-'),
          problem:   String(r[4] || '-'),
          timeOpen:  formatTimeCell(r[5]),
          timeClose: formatTimeCell(r[6]),
          duration:  formatTimeCell(r[7])
        });
      }
    }

    // ---- 4. Sheet POPULASI UNIT ----
    const popSheet = ss.getSheetByName('POPULASI UNIT');
    const populasi = [];
    if (popSheet) {
      const popRows = popSheet.getDataRange().getValues();
      for (let i = 1; i < popRows.length; i++) {
        if (popRows[i][0]) populasi.push(String(popRows[i][0]).trim());
      }
    }

    // ---- 5. Sheet DATA INPUT (Transaksi) ----
    const swaps = apiReadTransactions_(ss);

    return {
      status:    'success',
      users:     users,
      schedules: schedules,
      problems:  problems,
      populasi:  populasi,
      swaps:     swaps
    };

  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

// =============================================================================
// 2. READ TRANSACTIONS FROM DATA INPUT
// =============================================================================
function apiGetTransactionData() {
  try {
    const ss = getSpreadsheet();
    const swaps = apiReadTransactions_(ss);
    return { status: 'success', swaps: swaps };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * Internal helper: baca semua baris dari sheet DATA INPUT
 * Kolom (0-indexed):
 *  0  TRANSACTION ID
 *  1  DATE (DD/MM/YYYY)
 *  2  SHIFT
 *  3  CATEGORY
 *  4  LOCATION
 *  5  KODE UNIT
 *  6  HM
 *  7  BATTERY BEFORE
 *  8  JAM IN SWAP
 *  9  BATTERY AFTER
 *  10 JAM OUT SWAP
 *  11 CHARGING TIME (MENIT)
 *  12 ENERGY (KWH)
 *  13 REMARK (statusRemark)
 *  14 REMARK (problemRemark)
 *  15 MANPOWER
 *  16 NIK
 *  17 KETERANGAN / TIME SCH
 *  18 (reserved)
 */
function apiReadTransactions_(ss) {
  const sheet = ss.getSheetByName('DATA INPUT');
  const swaps = [];
  if (!sheet) return swaps;

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue; // skip baris kosong
    swaps.push({
      id:            String(r[0]).trim(),
      date:          formatDateCell(r[1]),
      shift:         String(r[2] || '1').trim(),
      category:      String(r[3] || 'CHARGING SWAP').trim(),
      location:      String(r[4] || 'ROOM A1').trim(),
      unit:          String(r[5] || '').trim(),
      hm:            String(r[6] || '-').trim(),
      batteryBefore: String(r[7] || '-').trim(),
      jamIn:         formatTimeHHMM(r[8]),
      batteryAfter:  String(r[9] || '-').trim(),
      jamOut:        formatTimeHHMM(r[10]),
      durationMin:   parseFloat(r[11]) || 6,
      energyKwh:     parseFloat(r[12]) || 0,
      statusRemark:  String(r[13] || 'On Time').trim(),
      problemRemark: String(r[14] || '13.NO PROBLEM').trim(),
      operator:      String(r[15] || '-').trim(),
      operatorNik:   String(r[16] || '-').trim(),
      keterangan:    String(r[17] || '-').trim(),
      timeSch:       '-'
    });
  }
  return swaps;
}

// =============================================================================
// 3. SAVE NEW TRANSACTION → Sheet DATA INPUT
// =============================================================================
function apiSaveSwapTransaction(rec) {
  try {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('DATA INPUT');
    if (!sheet) sheet = ss.getSheets()[0];

    const row = [
      rec.id            || '',
      rec.date          || '',
      rec.shift         || '1',
      rec.category      || 'CHARGING SWAP',
      rec.location      || 'ROOM A1',
      rec.unit          || '',
      rec.hm            || '',
      rec.batteryBefore || '',
      rec.jamIn         || '',
      rec.batteryAfter  || '',
      rec.jamOut        || '',
      rec.durationMin   || 6,
      rec.energyKwh     || 0,
      rec.statusRemark  || 'On Time',
      rec.problemRemark || '13.NO PROBLEM',
      rec.operator      || '',
      rec.operatorNik   || '',
      rec.keterangan    || '-',
      rec.timeSch       || '-'
    ];

    sheet.appendRow(row);
    return { status: 'success', message: 'Transaksi berhasil disimpan ke Google Sheets' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

// =============================================================================
// 4. SAVE PROBLEM LOG → Sheet DATA PROBLEM
// =============================================================================
function apiSaveProblemLog(prob) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('DATA PROBLEM');
    if (!sheet) throw new Error('Sheet DATA PROBLEM tidak ditemukan');

    const nextNo = sheet.getLastRow();
    const row = [
      `PRB-${nextNo}`,
      prob.date      || '',
      prob.shift     || '1',
      prob.unit      || '',
      prob.problem   || '',
      prob.timeOpen  || '',
      prob.timeClose || '',
      prob.duration  || '0:00:00'
    ];

    sheet.appendRow(row);
    return { status: 'success', no: nextNo };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

// =============================================================================
// 5. DELETE TRANSACTION FROM Sheet DATA INPUT
// =============================================================================
function apiDeleteTransaction(txId) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('DATA INPUT');
    if (!sheet) return { status: 'error', message: 'Sheet DATA INPUT tidak ditemukan' };

    const cleanId = String(txId).trim();
    const rows = sheet.getDataRange().getValues();
    let deleted = false;

    for (let i = rows.length - 1; i >= 1; i--) {
      const rowId = String(rows[i][0]).trim();
      if (rowId === cleanId) {
        sheet.deleteRow(i + 1);
        deleted = true;
      }
    }

    if (deleted) {
      return { status: 'success', message: `Transaksi ${cleanId} berhasil dihapus dari Google Sheets` };
    } else {
      return { status: 'error', message: `Transaksi ${cleanId} tidak ditemukan di Google Sheets` };
    }
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

// =============================================================================
// 6. POPULASI UNIT MANAGEMENT (Sheet POPULASI UNIT)
// =============================================================================
function apiDeleteUnit(unitCode) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('POPULASI UNIT');
    if (!sheet) return { status: 'error', message: 'Sheet POPULASI UNIT tidak ditemukan' };

    const cleanCode = String(unitCode).trim();
    const rows = sheet.getDataRange().getValues();
    let deleted = false;

    for (let i = rows.length - 1; i >= 1; i--) {
      const cellVal = String(rows[i][0]).trim();
      if (cellVal === cleanCode) {
        sheet.deleteRow(i + 1);
        deleted = true;
      }
    }

    if (deleted) {
      return { status: 'success', message: `Unit DT ${cleanCode} berhasil dihapus dari Google Sheets` };
    } else {
      return { status: 'error', message: `Unit DT ${cleanCode} tidak ditemukan di sheet POPULASI UNIT` };
    }
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function apiAddUnit(unitCode) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('POPULASI UNIT');
    if (!sheet) return { status: 'error', message: 'Sheet POPULASI UNIT tidak ditemukan' };

    const cleanCode = String(unitCode).trim();
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === cleanCode) {
        return { status: 'success', message: `Unit DT ${cleanCode} sudah ada di database` };
      }
    }

    sheet.appendRow([cleanCode]);
    return { status: 'success', message: `Unit DT ${cleanCode} berhasil ditambahkan ke Google Sheets` };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function apiSyncAllUnits(unitCodesList) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('POPULASI UNIT');
    if (!sheet) return { status: 'error', message: 'Sheet POPULASI UNIT tidak ditemukan' };

    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 1).clearContent();
    }

    if (Array.isArray(unitCodesList) && unitCodesList.length > 0) {
      const data = unitCodesList.map(c => [String(c).trim()]);
      sheet.getRange(2, 1, data.length, 1).setValues(data);
    }
    return { status: 'success', message: 'Seluruh populasi unit berhasil disinkronkan' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

// =============================================================================
// 7. VALIDATE USER LOGIN
// =============================================================================
function apiValidateLogin(nik, password) {
  try {
    const ss = getSpreadsheet();
    const userSheet = ss.getSheetByName('USER');
    if (!userSheet) return { status: 'error', message: 'Sheet USER tidak ditemukan' };

    const rows = userSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const rowNik = String(r[1] || '').trim();
      const rowPwd = String(r[5] || r[1] || '').trim();
      if (rowNik === String(nik).trim()) {
        if (rowPwd === String(password).trim()) {
          const roleRaw = String(r[4] || '').toUpperCase();
          const isSpv = roleRaw.includes('LEADER') || roleRaw.includes('SUPERVISOR') || roleRaw.includes('ADMIN');
          return {
            status: 'success',
            user: {
              nik:   rowNik,
              name:  String(r[2] || '').trim(),
              title: String(r[3] || '').trim(),
              role:  isSpv ? 'SUPERVISOR' : 'OPERATOR'
            }
          };
        } else {
          return { status: 'error', message: 'Password salah' };
        }
      }
    }
    return { status: 'error', message: 'NIK tidak terdaftar' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

// =============================================================================
// 8. BACKUP ALL DATA TO GOOGLE SHEETS (Hybrid Sync from Firebase / Local)
// =============================================================================
function apiBackupAllToSheets(payload) {
  try {
    const ss = getSpreadsheet();
    const mode = (payload && payload.mode) || 'incremental';
    let addedSwaps = 0;
    let addedProblems = 0;

    // 1. BACKUP DATA INPUT (Transaksi Swap)
    if (payload && Array.isArray(payload.swaps) && payload.swaps.length > 0) {
      let swapSheet = ss.getSheetByName('DATA INPUT');
      if (!swapSheet) swapSheet = ss.getSheets()[0];

      if (mode === 'full') {
        const lastRow = swapSheet.getLastRow();
        if (lastRow > 1) {
          swapSheet.getRange(2, 1, lastRow - 1, 19).clearContent();
        }
        const rows = payload.swaps.map(rec => [
          rec.id            || '',
          rec.date          || '',
          rec.shift         || '1',
          rec.category      || 'CHARGING SWAP',
          rec.location      || 'ROOM A1',
          rec.unit          || '',
          rec.hm            || '',
          rec.batteryBefore || '',
          rec.jamIn         || '',
          rec.batteryAfter  || '',
          rec.jamOut        || '',
          rec.durationMin   || 6,
          rec.energyKwh     || 0,
          rec.statusRemark  || 'On Time',
          rec.problemRemark || '13.NO PROBLEM',
          rec.operator      || '',
          rec.operatorNik   || '',
          rec.keterangan    || '-',
          rec.timeSch       || '-'
        ]);
        if (rows.length > 0) {
          swapSheet.getRange(2, 1, rows.length, 19).setValues(rows);
          addedSwaps = rows.length;
        }
      } else {
        // Incremental: Cek ID yang sudah ada
        const existingData = swapSheet.getDataRange().getValues();
        const existingIds = new Set();
        for (let i = 1; i < existingData.length; i++) {
          if (existingData[i][0]) existingIds.add(String(existingData[i][0]).trim());
        }

        const newRows = [];
        payload.swaps.forEach(rec => {
          const sid = String(rec.id || '').trim();
          if (sid && !existingIds.has(sid)) {
            newRows.push([
              rec.id            || '',
              rec.date          || '',
              rec.shift         || '1',
              rec.category      || 'CHARGING SWAP',
              rec.location      || 'ROOM A1',
              rec.unit          || '',
              rec.hm            || '',
              rec.batteryBefore || '',
              rec.jamIn         || '',
              rec.batteryAfter  || '',
              rec.jamOut        || '',
              rec.durationMin   || 6,
              rec.energyKwh     || 0,
              rec.statusRemark  || 'On Time',
              rec.problemRemark || '13.NO PROBLEM',
              rec.operator      || '',
              rec.operatorNik   || '',
              rec.keterangan    || '-',
              rec.timeSch       || '-'
            ]);
            existingIds.add(sid);
          }
        });

        if (newRows.length > 0) {
          const startR = swapSheet.getLastRow() + 1;
          swapSheet.getRange(startR, 1, newRows.length, 19).setValues(newRows);
          addedSwaps = newRows.length;
        }
      }
    }

    // 2. BACKUP DATA PROBLEM (Log Gangguan)
    if (payload && Array.isArray(payload.problems) && payload.problems.length > 0) {
      const probSheet = ss.getSheetByName('DATA PROBLEM');
      if (probSheet) {
        if (mode === 'full') {
          const lastR = probSheet.getLastRow();
          if (lastR > 1) {
            probSheet.getRange(2, 1, lastR - 1, 8).clearContent();
          }
          const pRows = payload.problems.map((p, idx) => [
            p.id        || `PRB-${idx + 1}`,
            p.date      || '',
            p.shift     || '1',
            p.unit      || '',
            p.problem   || '',
            p.timeOpen  || '',
            p.timeClose || '',
            p.duration  || '0:00:00'
          ]);
          if (pRows.length > 0) {
            probSheet.getRange(2, 1, pRows.length, 8).setValues(pRows);
            addedProblems = pRows.length;
          }
        } else {
          const existingProbData = probSheet.getDataRange().getValues();
          const existingProbIds = new Set();
          for (let i = 1; i < existingProbData.length; i++) {
            if (existingProbData[i][0]) existingProbIds.add(String(existingProbData[i][0]).trim());
          }

          const newPRows = [];
          payload.problems.forEach((p, idx) => {
            const pid = String(p.id || '').trim();
            if (pid && !existingProbIds.has(pid)) {
              newPRows.push([
                p.id        || `PRB-${idx + 1}`,
                p.date      || '',
                p.shift     || '1',
                p.unit      || '',
                p.problem   || '',
                p.timeOpen  || '',
                p.timeClose || '',
                p.duration  || '0:00:00'
              ]);
              existingProbIds.add(pid);
            }
          });

          if (newPRows.length > 0) {
            const startPR = probSheet.getLastRow() + 1;
            probSheet.getRange(startPR, 1, newPRows.length, 8).setValues(newPRows);
            addedProblems = newPRows.length;
          }
        }
      }
    }

    let addedSchedules = 0;
    let addedUnits = 0;

    // 3. BACKUP SCEDHULE (Jadwal Swap Unit)
    if (payload && Array.isArray(payload.schedules) && payload.schedules.length > 0) {
      const schSheet = ss.getSheetByName('SCEDHULE');
      if (schSheet) {
        if (mode === 'full') {
          const lR = schSheet.getLastRow();
          if (lR > 1) schSheet.getRange(2, 1, lR - 1, 4).clearContent();
          const schRows = payload.schedules.map(s => [
            s.tanggal || '',
            s.shift   || '1',
            s.unit    || '',
            s.timeSch || '07:00:00'
          ]);
          schSheet.getRange(2, 1, schRows.length, 4).setValues(schRows);
          addedSchedules = schRows.length;
        } else {
          // Incremental: Cek jadwal unik (tanggal + shift + unit)
          const existingSch = schSheet.getDataRange().getValues();
          const existingSchKeys = new Set();
          for (let i = 1; i < existingSch.length; i++) {
            const k = `${formatDateCell(existingSch[i][0])}_${String(existingSch[i][1]).trim()}_${String(existingSch[i][2]).trim()}`;
            existingSchKeys.add(k);
          }
          const newSchRows = [];
          payload.schedules.forEach(s => {
            const k = `${s.tanggal}_${String(s.shift).trim()}_${String(s.unit).trim()}`;
            if (!existingSchKeys.has(k)) {
              newSchRows.push([
                s.tanggal || '',
                s.shift   || '1',
                s.unit    || '',
                s.timeSch || '07:00:00'
              ]);
              existingSchKeys.add(k);
            }
          });
          if (newSchRows.length > 0) {
            const startSR = schSheet.getLastRow() + 1;
            schSheet.getRange(startSR, 1, newSchRows.length, 4).setValues(newSchRows);
            addedSchedules = newSchRows.length;
          }
        }
      }
    }

    // 4. BACKUP POPULASI UNIT
    if (payload && Array.isArray(payload.units) && payload.units.length > 0) {
      const popSheet = ss.getSheetByName('POPULASI UNIT');
      if (popSheet) {
        if (mode === 'full') {
          const lR = popSheet.getLastRow();
          if (lR > 1) popSheet.getRange(2, 1, lR - 1, 1).clearContent();
          const uRows = payload.units.map(u => [typeof u === 'string' ? u : (u.code || '')]);
          popSheet.getRange(2, 1, uRows.length, 1).setValues(uRows);
          addedUnits = uRows.length;
        } else {
          const existingPop = popSheet.getDataRange().getValues();
          const existingCodes = new Set();
          for (let i = 1; i < existingPop.length; i++) {
            if (existingPop[i][0]) existingCodes.add(String(existingPop[i][0]).trim());
          }
          const newURows = [];
          payload.units.forEach(u => {
            const code = String(typeof u === 'string' ? u : (u.code || '')).trim();
            if (code && !existingCodes.has(code)) {
              newURows.push([code]);
              existingCodes.add(code);
            }
          });
          if (newURows.length > 0) {
            const startUR = popSheet.getLastRow() + 1;
            popSheet.getRange(startUR, 1, newURows.length, 1).setValues(newURows);
            addedUnits = newURows.length;
          }
        }
      }
    }

    // Buat pesan ringkasan yang informatif
    const summaryParts = [];
    if (addedSwaps > 0) summaryParts.push(`${addedSwaps} transaksi swap`);
    if (addedProblems > 0) summaryParts.push(`${addedProblems} log gangguan`);
    if (addedSchedules > 0) summaryParts.push(`${addedSchedules} jadwal`);
    if (addedUnits > 0) summaryParts.push(`${addedUnits} armada`);

    const summaryText = summaryParts.length > 0
      ? summaryParts.join(', ') + ' berhasil ditambahkan ke Google Sheets'
      : 'Data sudah mutakhir (tidak ada data baru yang perlu disinkronkan)';

    return {
      status: 'success',
      message: `Backup Selesai: ${summaryText}!`,
      addedSwaps: addedSwaps,
      addedProblems: addedProblems,
      addedSchedules: addedSchedules,
      addedUnits: addedUnits,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================
function formatDateCell(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const d = String(val.getDate()).padStart(2, '0');
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const y = val.getFullYear();
    return `${d}/${m}/${y}`;
  }
  return String(val).trim();
}

function formatTimeCell(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const h = String(val.getHours()).padStart(2, '0');
    const m = String(val.getMinutes()).padStart(2, '0');
    const s = String(val.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }
  return String(val).trim();
}

function formatTimeHHMM(val) {
  const full = formatTimeCell(val);
  if (!full) return '';
  // Return HH:MM only (strip seconds)
  return full.substring(0, 5);
}
