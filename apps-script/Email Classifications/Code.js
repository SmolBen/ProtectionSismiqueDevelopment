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

function jsonResponse(data, code) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}