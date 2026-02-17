function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var action = e.parameter.action;
  var sheetName = e.parameter.sheet || 'Review';
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  
  if (!sheet) {
    return jsonResponse({ error: 'Sheet not found: ' + sheetName }, 400);
  }
  
  try {
    if (action === 'getData') {
      return getData(sheet);
    } else if (action === 'deleteRow') {
      var rowIndex = parseInt(e.parameter.rowIndex);
      var emailLink = e.parameter.emailLink || '';
      var matchColumn = e.parameter.matchColumn || '';
      var matchValue = e.parameter.matchValue || '';
      return deleteRow(sheet, rowIndex, emailLink, matchColumn, matchValue);
    } else if (action === 'bulkDelete') {
      var raw = (e.postData && e.postData.contents) ? e.postData.contents : (e.parameter.payload || '{}');
      var payload = JSON.parse(raw);
      return bulkDelete(sheet, payload.emailLinks || [], payload.matchColumn || '', payload.matchValues || []);
    } else if (action === 'updateCell') {
      var rowIndex = parseInt(e.parameter.rowIndex);
      var column = e.parameter.column;
      var value = e.parameter.value || '';
      return updateCell(sheet, rowIndex, column, value);
    } else {
      return jsonResponse({ error: 'Invalid action' }, 400);
    }
  } catch (error) {
    return jsonResponse({ error: error.toString() }, 500);
  }
}

function getData(sheet) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rows = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = { _rowIndex: i + 1 }; // Store actual row number (1-indexed, +1 for header)
    for (var j = 0; j < headers.length; j++) {
      var value = data[i][j];
      // Format dates
      if (value instanceof Date) {
        value = Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      row[headers[j]] = value;
    }
    rows.push(row);
  }
  
  return jsonResponse({ headers: headers, rows: rows, totalRows: rows.length });
}

function deleteRow(sheet, rowIndex, emailLink, matchColumn, matchValue) {
  // If emailLink provided, find by Email Link column
  if (emailLink) {
    var data = sheet.getDataRange().getValues();
    var linkColIndex = data[0].indexOf('Email Link');
    
    if (linkColIndex === -1) {
      return jsonResponse({ error: 'Email Link column not found' }, 400);
    }
    
    for (var i = 1; i < data.length; i++) {
      if (data[i][linkColIndex] === emailLink) {
        sheet.deleteRow(i + 1);
        // Cascade: delete same email from all other sheets
        var deleteSet = {};
        deleteSet[emailLink] = true;
        cascadeDeleteByEmailLink(sheet.getName(), deleteSet);
        return jsonResponse({ success: true, deletedRow: i + 1 });
      }
    }

    return jsonResponse({ error: 'Row not found' }, 404);
  }
  
  // If matchColumn and matchValue provided, find by that column
  if (matchColumn && matchValue) {
    var data = sheet.getDataRange().getValues();
    var colIndex = data[0].indexOf(matchColumn);
    
    if (colIndex === -1) {
      return jsonResponse({ error: 'Column not found: ' + matchColumn }, 400);
    }
    
    for (var i = 1; i < data.length; i++) {
      if (data[i][colIndex] === matchValue) {
        sheet.deleteRow(i + 1);
        return jsonResponse({ success: true, deletedRow: i + 1 });
      }
    }
    
    return jsonResponse({ error: 'Row not found' }, 404);
  }
  
  // Fallback to row index
  if (rowIndex < 2) {
    return jsonResponse({ error: 'Cannot delete header row' }, 400);
  }
  
  var lastRow = sheet.getLastRow();
  if (rowIndex > lastRow) {
    return jsonResponse({ error: 'Row does not exist' }, 400);
  }
  
  sheet.deleteRow(rowIndex);
  return jsonResponse({ success: true, deletedRow: rowIndex });
}

function bulkDelete(sheet, emailLinks, matchColumn, matchValues) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  // Build a set of values to match against
  var deleteSet = {};
  var colIndex = -1;

  if (emailLinks.length > 0) {
    colIndex = headers.indexOf('Email Link');
    if (colIndex === -1) return jsonResponse({ error: 'Email Link column not found' }, 400);
    for (var i = 0; i < emailLinks.length; i++) deleteSet[emailLinks[i]] = true;
  } else if (matchColumn && matchValues.length > 0) {
    colIndex = headers.indexOf(matchColumn);
    if (colIndex === -1) return jsonResponse({ error: 'Column not found: ' + matchColumn }, 400);
    for (var i = 0; i < matchValues.length; i++) deleteSet[matchValues[i]] = true;
  } else {
    return jsonResponse({ error: 'No delete criteria provided' }, 400);
  }

  // Collect rows to keep (header + non-matching rows)
  var rowsToKeep = [headers];
  var deletedCount = 0;
  for (var i = 1; i < data.length; i++) {
    if (deleteSet[data[i][colIndex]]) {
      deletedCount++;
    } else {
      rowsToKeep.push(data[i]);
    }
  }

  // Clear and rewrite — much faster than deleting rows one by one
  sheet.clearContents();
  if (rowsToKeep.length > 0) {
    sheet.getRange(1, 1, rowsToKeep.length, rowsToKeep[0].length).setValues(rowsToKeep);
  }

  // Cascade: delete matching emails from all other email sheets
  if (emailLinks.length > 0 && deletedCount > 0) {
    cascadeDeleteByEmailLink(sheet.getName(), deleteSet);
  }

  return jsonResponse({ success: true, deletedCount: deletedCount });
}

function updateCell(sheet, rowIndex, column, value) {
  var colIndex = columnLetterToIndex(column);
  sheet.getRange(rowIndex, colIndex).setValue(value);
  return jsonResponse({ success: true, rowIndex: rowIndex, column: column, value: value });
}

function columnLetterToIndex(letter) {
  var index = 0;
  for (var i = 0; i < letter.length; i++) {
    index = index * 26 + letter.charCodeAt(i) - 64;
  }
  return index;
}

function cascadeDeleteByEmailLink(sourceSheetName, deleteSet) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var emailSheets = [
    'Review', 'Engineering - Existing Projects', 'Engineering - Unknown Projects',
    'New Projects', 'Price Requests', 'Existing Projects - Certificate Requests',
    'Other', 'Spam'
  ];

  for (var s = 0; s < emailSheets.length; s++) {
    if (emailSheets[s] === sourceSheetName) continue;
    var otherSheet = ss.getSheetByName(emailSheets[s]);
    if (!otherSheet || otherSheet.getLastRow() < 2) continue;

    var otherData = otherSheet.getDataRange().getValues();
    var otherLinkCol = otherData[0].indexOf('Email Link');
    if (otherLinkCol === -1) continue;

    var keep = [otherData[0]];
    var hadDeletions = false;
    for (var i = 1; i < otherData.length; i++) {
      if (deleteSet[otherData[i][otherLinkCol]]) {
        hadDeletions = true;
      } else {
        keep.push(otherData[i]);
      }
    }

    if (hadDeletions) {
      otherSheet.clearContents();
      if (keep.length > 0) {
        otherSheet.getRange(1, 1, keep.length, keep[0].length).setValues(keep);
      }
    }
  }
}

/**
 * One-time function: run from Apps Script editor to backfill Review
 * with any emails that exist in category tabs but not in Review.
 */
function backfillReview() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var reviewSheet = ss.getSheetByName('Review');
  if (!reviewSheet) { Logger.log('Review sheet not found'); return; }

  var reviewData = reviewSheet.getDataRange().getValues();
  var reviewHeaders = reviewData[0];

  // Build set of existing Email Links in Review
  var reviewLinkCol = reviewHeaders.indexOf('Email Link');
  if (reviewLinkCol === -1) { Logger.log('Email Link column not found in Review'); return; }

  var existingLinks = {};
  for (var i = 1; i < reviewData.length; i++) {
    var link = reviewData[i][reviewLinkCol];
    if (link) existingLinks[link] = true;
  }

  // Column indices in Review for mapping
  var reviewColMap = {};
  for (var j = 0; j < reviewHeaders.length; j++) {
    reviewColMap[reviewHeaders[j]] = j;
  }

  var categorySheets = [
    'Engineering - Existing Projects', 'Engineering - Unknown Projects',
    'New Projects', 'Price Requests', 'Existing Projects - Certificate Requests',
    'Other', 'Spam'
  ];

  var newRows = [];

  for (var s = 0; s < categorySheets.length; s++) {
    var catSheet = ss.getSheetByName(categorySheets[s]);
    if (!catSheet || catSheet.getLastRow() < 2) continue;

    var catData = catSheet.getDataRange().getValues();
    var catHeaders = catData[0];
    var catLinkCol = catHeaders.indexOf('Email Link');
    if (catLinkCol === -1) continue;

    for (var i = 1; i < catData.length; i++) {
      var emailLink = catData[i][catLinkCol];
      if (!emailLink || existingLinks[emailLink]) continue;

      // Build a new Review row
      var newRow = new Array(reviewHeaders.length).fill('');
      for (var c = 0; c < catHeaders.length; c++) {
        var headerName = catHeaders[c];
        if (reviewColMap[headerName] !== undefined) {
          newRow[reviewColMap[headerName]] = catData[i][c];
        }
      }
      // Set AI Category to the source sheet name
      if (reviewColMap['AI Category'] !== undefined) {
        newRow[reviewColMap['AI Category']] = categorySheets[s];
      }

      newRows.push(newRow);
      existingLinks[emailLink] = true; // prevent duplicates across sheets
    }
  }

  if (newRows.length > 0) {
    var startRow = reviewSheet.getLastRow() + 1;
    reviewSheet.getRange(startRow, 1, newRows.length, reviewHeaders.length).setValues(newRows);
    Logger.log('Backfilled ' + newRows.length + ' rows into Review');
  } else {
    Logger.log('No new rows to backfill — Review already has all emails');
  }
}

function jsonResponse(data, code) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}