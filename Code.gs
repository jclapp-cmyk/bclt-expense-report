// ═══════════════════════════════════════════════════════════
//  BCLT EXPENSE REPORT — Google Apps Script Backend
//  Receives form data, saves to Drive, sends email
// ═══════════════════════════════════════════════════════════

// ── CONFIGURATION ─────────────────────────────────────────
var DRIVE_FOLDER_ID = "1RvDhHtdfzbgeZVGGhCucJ0-doADue7ra";
var NOTIFY_EMAIL = "pspringer@bolinaslandtrust.org,finance@bolinaslandtrust.org";

// ── Handle POST requests from the form ────────────────────
function doPost(e) {
  try {
    var json = JSON.parse(e.postData.contents);
    var data = json.report;
    var files = json.files || [];

    var dateStr = new Date().toISOString().slice(0, 10);
    var safeName = (data.submittedBy || "unknown").replace(/[^a-zA-Z0-9]/g, "_");
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);

    // Save text report to Drive
    var textContent = formatReport(data);
    folder.createFile("BCLT_Expense_" + safeName + "_" + dateStr + ".txt", textContent, MimeType.PLAIN_TEXT);

    // Save receipt files to Drive
    var attachments = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var decoded = Utilities.base64Decode(f.data);
      var blob = Utilities.newBlob(decoded, f.mimeType, f.name);
      folder.createFile(blob).setName("BCLT_Receipt_" + safeName + "_" + dateStr + "_" + f.name);
      attachments.push(blob);
    }

    // Send email notification to admin
    var subject = "Expense Report: " + data.submittedBy + " - $" + Number(data.total).toFixed(2);
    var htmlBody = buildEmailHtml(data, files.length);

    if (NOTIFY_EMAIL) {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        subject: subject,
        htmlBody: htmlBody,
        attachments: attachments
      });
    }

    // Send confirmation email to the submitter
    if (data.userEmail) {
      MailApp.sendEmail({
        to: data.userEmail,
        subject: "Confirmation: " + subject,
        htmlBody: "<p>Your expense report has been submitted successfully. A copy is below for your records.</p><hr style='border:none;border-top:1px solid #e2e8f0;margin:16px 0'>" + htmlBody,
        attachments: attachments
      });
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Handle GET requests (health check) ───────────────────
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Format plain text report ──────────────────────────────
function formatReport(data) {
  var div = "──────────────────────────────────────────────────";
  var lines = [
    "BCLT EXPENSE REPORT", div,
    "Submitted by: " + data.submittedBy,
    "Department:   " + (data.department || ""),
    "Grant:        " + (data.grant || ""),
    "Date range:   " + data.periodStart + " to " + data.periodEnd,
    "Purpose:      " + data.purpose,
    div, "", "LINE ITEMS", div
  ];

  lines.push(pad("Date", 13) + pad("Vendor/Store", 21) + pad("Property/Acct", 21) + pad("Category", 21) + pad("Description", 25) + lpad("Amount", 10) + "  " + pad("Payment Method", 24) + pad("Reimburse?", 10));
  lines.push("─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────");

  var items = data.lineItems || [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    lines.push(
      pad(it.date, 13) + pad(it.vendor || "", 21) + pad(it.account || "", 21) + pad(it.category, 21) + pad(it.description, 25) + lpad("$" + Number(it.amount).toFixed(2), 10) + "  " + pad(it.paymentMethod || "-", 24) + pad(it.reimburse || "No", 10)
    );
  }

  lines.push("─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────");
  lines.push(pad("", 103) + lpad("$" + Number(data.total).toFixed(2), 11));
  lines.push("");

  if (data.notes) {
    lines.push("NOTES", div, data.notes, "");
  }

  lines.push("Report generated: " + new Date().toISOString());
  return lines.join("\n");
}

// ── Build HTML email ──────────────────────────────────────
function buildEmailHtml(data, fileCount) {
  var items = data.lineItems || [];
  var rows = "";
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    rows += "<tr>" +
      "<td style='padding:6px 10px;border-bottom:1px solid #e2e8f0'>" + it.date + "</td>" +
      "<td style='padding:6px 10px;border-bottom:1px solid #e2e8f0'>" + (it.vendor || "-") + "</td>" +
      "<td style='padding:6px 10px;border-bottom:1px solid #e2e8f0'>" + (it.account || "-") + "</td>" +
      "<td style='padding:6px 10px;border-bottom:1px solid #e2e8f0'>" + it.category + "</td>" +
      "<td style='padding:6px 10px;border-bottom:1px solid #e2e8f0'>" + it.description + "</td>" +
      "<td style='padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right'>$" + Number(it.amount).toFixed(2) + "</td>" +
      "<td style='padding:6px 10px;border-bottom:1px solid #e2e8f0'>" + (it.paymentMethod || "-") + "</td>" +
      "<td style='padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center'>" + (it.reimburse || "No") + "</td>" +
      "</tr>";
  }

  return "<div style='font-family:sans-serif;max-width:700px;margin:0 auto'>" +
    "<h2 style='color:#1e293b'>BCLT Expense Report</h2>" +
    "<table style='margin-bottom:16px;font-size:14px'>" +
    "<tr><td><strong>Submitted by:</strong></td><td style='padding-left:12px'>" + data.submittedBy + "</td></tr>" +
    "<tr><td><strong>Department:</strong></td><td style='padding-left:12px'>" + (data.department || "-") + "</td></tr>" +
    "<tr><td><strong>Grant:</strong></td><td style='padding-left:12px'>" + (data.grant || "-") + "</td></tr>" +
    "<tr><td><strong>Period:</strong></td><td style='padding-left:12px'>" + data.periodStart + " to " + data.periodEnd + "</td></tr>" +
    "<tr><td><strong>Purpose:</strong></td><td style='padding-left:12px'>" + data.purpose + "</td></tr>" +
    "</table>" +
    "<table style='width:100%;border-collapse:collapse;font-size:14px'>" +
    "<thead><tr style='background:#f1f5f9'>" +
    "<th style='padding:8px 10px;text-align:left'>Date</th>" +
    "<th style='padding:8px 10px;text-align:left'>Vendor/Store</th>" +
    "<th style='padding:8px 10px;text-align:left'>Property/Account</th>" +
    "<th style='padding:8px 10px;text-align:left'>Category</th>" +
    "<th style='padding:8px 10px;text-align:left'>Description</th>" +
    "<th style='padding:8px 10px;text-align:right'>Amount</th>" +
    "<th style='padding:8px 10px;text-align:left'>Payment Method</th>" +
    "<th style='padding:8px 10px;text-align:center'>Reimburse?</th>" +
    "</tr></thead><tbody>" +
    rows +
    "</tbody></table>" +
    "<div style='text-align:right;padding:12px 10px;font-size:16px;font-weight:700;border-top:2px solid #e2e8f0'>" +
    "Total: $" + Number(data.total).toFixed(2) + "</div>" +
    (data.notes ? "<p style='margin-top:16px'><strong>Notes:</strong> " + data.notes + "</p>" : "") +
    (fileCount > 0 ? "<p style='margin-top:16px;font-size:13px;color:#475569'><strong>" + fileCount + " receipt(s) attached</strong></p>" : "") +
    "<p style='margin-top:16px;font-size:12px;color:#94a3b8'>Submitted " + new Date().toLocaleString() + " via BCLT Expense Report</p>" +
    "</div>";
}

// ── Helpers ───────────────────────────────────────────────
function pad(str, len) {
  str = String(str);
  while (str.length < len) str += " ";
  return str.substring(0, len);
}

function lpad(str, len) {
  str = String(str);
  while (str.length < len) str = " " + str;
  return str;
}

