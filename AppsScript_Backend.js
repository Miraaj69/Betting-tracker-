// ═══════════════════════════════════════════════════════════════
// STAKE LOG — Google Apps Script Backend
// Paste this in Extensions → Apps Script → Replace all code
// ═══════════════════════════════════════════════════════════════

const SHEET_NAME = "Bets";
const SETTINGS_SHEET = "Settings";

// Column order in sheet
const COLUMNS = [
  "id", "date", "event", "bet", "bookie", "sport",
  "odds", "stake", "status", "pnl", "ev",
  "tags", "tipster", "notes", "matchTime", "bankrollId", "createdAt"
];

// ── CORS Headers ─────────────────────────────────────────────────
function setCORSHeaders(output) {
  return output
    .setHeader("Access-Control-Allow-Origin", "*")
    .setHeader("Access-Control-Allow-Methods", "GET, POST")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ── OPTIONS preflight ─────────────────────────────────────────────
function doOptions() {
  return setCORSHeaders(
    ContentService.createTextOutput("")
  );
}

// ── GET — fetch all data ──────────────────────────────────────────
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheets(ss);

    const action = e?.parameter?.action || "getBets";

    if (action === "getBets") {
      const sheet = ss.getSheetByName(SHEET_NAME);
      const data = sheet.getDataRange().getValues();

      if (data.length <= 1) {
        // Only header row or empty
        return respond({ success: true, bets: [], settings: getSettings(ss) });
      }

      const bets = data.slice(1).map(row => {
        const bet = {};
        COLUMNS.forEach((col, i) => { bet[col] = row[i] ?? ""; });
        // Parse tags back from string
        if (typeof bet.tags === "string" && bet.tags) {
          bet.tags = bet.tags.split("|").filter(Boolean);
        } else {
          bet.tags = [];
        }
        return bet;
      }).filter(b => b.id); // skip empty rows

      const settings = getSettings(ss);
      return respond({ success: true, bets, settings });
    }

    if (action === "getSettings") {
      return respond({ success: true, settings: getSettings(ss) });
    }

    return respond({ success: false, error: "Unknown action" });

  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

// ── POST — write data ─────────────────────────────────────────────
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheets(ss);

    const { action } = body;

    if (action === "addBet") {
      addBetToSheet(ss, body.bet);
      return respond({ success: true });
    }

    if (action === "updateBet") {
      updateBetInSheet(ss, body.bet);
      return respond({ success: true });
    }

    if (action === "deleteBet") {
      deleteBetFromSheet(ss, body.id);
      return respond({ success: true });
    }

    if (action === "bulkUpdate") {
      // body.bets = array of bet objects to update
      body.bets.forEach(bet => updateBetInSheet(ss, bet));
      return respond({ success: true });
    }

    if (action === "bulkDelete") {
      // body.ids = array of ids to delete
      body.ids.forEach(id => deleteBetFromSheet(ss, id));
      return respond({ success: true });
    }

    if (action === "saveSettings") {
      saveSettings(ss, body.settings);
      return respond({ success: true });
    }

    if (action === "syncAll") {
      // Full sync — replace all bets
      const sheet = ss.getSheetByName(SHEET_NAME);
      // Clear data rows (keep header)
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
      // Re-add all
      body.bets.forEach(bet => addBetToSheet(ss, bet));
      return respond({ success: true });
    }

    return respond({ success: false, error: "Unknown action" });

  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

// ── Sheet helpers ─────────────────────────────────────────────────
function ensureSheets(ss) {
  // Bets sheet
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    sheet.getRange(1, 1, 1, COLUMNS.length)
      .setBackground("#E50914")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, COLUMNS.length, 140);
  }

  // Settings sheet
  let sSheet = ss.getSheetByName(SETTINGS_SHEET);
  if (!sSheet) {
    sSheet = ss.insertSheet(SETTINGS_SHEET);
    sSheet.getRange("A1").setValue("key");
    sSheet.getRange("B1").setValue("value");
    sSheet.getRange(1,1,1,2).setBackground("#E50914").setFontColor("#ffffff").setFontWeight("bold");
  }
}

function addBetToSheet(ss, bet) {
  const sheet = ss.getSheetByName(SHEET_NAME);
  const pnl = calcPnL(bet);
  const row = COLUMNS.map(col => {
    if (col === "pnl") return pnl;
    if (col === "tags") return (bet.tags || []).join("|");
    if (col === "createdAt") return bet.createdAt || new Date().toISOString();
    return bet[col] ?? "";
  });
  sheet.appendRow(row);
}

function updateBetInSheet(ss, bet) {
  const sheet = ss.getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(bet.id)) {
      const pnl = calcPnL(bet);
      const row = COLUMNS.map(col => {
        if (col === "pnl") return pnl;
        if (col === "tags") return (bet.tags || []).join("|");
        return bet[col] ?? "";
      });
      sheet.getRange(i + 1, 1, 1, COLUMNS.length).setValues([row]);

      // Color the row based on status
      const statusColors = {
        Won: "#E8F5E9",
        Lost: "#FFEBEE",
        Pending: "#FFF3E0",
        Void: "#EFEBE9"
      };
      const bg = statusColors[bet.status] || "#ffffff";
      sheet.getRange(i + 1, 1, 1, COLUMNS.length).setBackground(bg);
      return;
    }
  }
  // If not found, add it
  addBetToSheet(ss, bet);
}

function deleteBetFromSheet(ss, id) {
  const sheet = ss.getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

function getSettings(ss) {
  const sheet = ss.getSheetByName(SETTINGS_SHEET);
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const settings = {};
  data.slice(1).forEach(row => {
    if (row[0]) {
      try { settings[row[0]] = JSON.parse(row[1]); }
      catch { settings[row[0]] = row[1]; }
    }
  });
  return settings;
}

function saveSettings(ss, settings) {
  const sheet = ss.getSheetByName(SETTINGS_SHEET);
  // Clear existing
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
  // Write new
  Object.entries(settings).forEach(([k, v]) => {
    sheet.appendRow([k, JSON.stringify(v)]);
  });
}

function calcPnL(bet) {
  const stake = parseFloat(bet.stake) || 0;
  const odds = parseFloat(bet.odds) || 1;
  if (bet.status === "Won") return stake * (odds - 1);
  if (bet.status === "Lost") return -stake;
  return 0;
}

function respond(data) {
  return setCORSHeaders(
    ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON)
  );
}
