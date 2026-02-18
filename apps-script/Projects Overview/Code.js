function folderCreate() {

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh2 = ss.getSheetByName('Sheet2');  
  var sh1 = ss.getSheetByName('Sheet1');
  var sh3 = ss.getSheetByName('Data Entry');  
  
  //*** Look for the data in the top row A2, B2, C2 and combine all information. This combined info will be used as name of new Folder
  var firstRow=2;
  var projectNo=sh1.getRange(firstRow,1).getValue();
  var Company=sh1.getRange(firstRow,2).getValue();
  var projectName=sh1.getRange(firstRow,3).getValue();
  var companyDivision = sh3.getRange(6,12).getValue();

  
  var projectCombine=projectNo+'-'+Company+'-'+projectName;  //projectCombine is the name of new folder
  sh2.getRange('A1').setValue(projectCombine);

  var newProjectFolder

  if (companyDivision == "Protection Sismique")
    { newProjectFolder = projectCombine;}

  else if (companyDivision == "YUL Structure")

    { newProjectFolder = projectNo+'-YUL'+'-'+Company+'-'+projectName; }
 
  
  //*** Create new folder in the project folder
  
    //var FOLDER_NAME = "2026-2027 Projects 10149-"; // Look for this folder of where to put new folder
    var folderID = '1VO_C2kVqc3wdLJUVBVI39IGVSmf9Dhf9' //ID of folder 2026-2027 Projects
    var folder = DriveApp.getFolderById(folderID);  //get the directory of the folder where to put new folder 
    var newfolder =folder.createFolder(newProjectFolder); //Create new folder inside that folder     
    var newfolderID = newfolder.getId();
    var subfolder =DriveApp.getFolderById(newfolderID);
  
  //Create Sharefolder to share with others 
    var SharedSubfolder


  // Create Sharefolder name based on company division (Protection Sismique --> 1111-Shared/ YUL Structure --> 1111-YUL-Shared)
    if (companyDivision == "Protection Sismique")
    { SharedSubfolder = subfolder.createFolder(projectNo+'-Shared');}

     else if (companyDivision == "YUL Structure")

    { SharedSubfolder =subfolder.createFolder(projectNo+'-YUL-Shared'); }
    

    var SharedSubfolderID = SharedSubfolder.getId();
    var SecondSubfolder=DriveApp.getFolderById(SharedSubfolderID);
  
    var PhotosClientFolder =SecondSubfolder.createFolder("Photos by Client");
    var PhotosInspectionFolder =SecondSubfolder.createFolder("Photos Inspection");
    var DAFolder =SecondSubfolder.createFolder("Plans and DA");
    var CommentClient = SecondSubfolder.createFolder("Comment by client");
  
 
}


function CertificateCreate() {
//This function will look for a specific project and create a new word file in the folder  
  
  // Create a prompt box to enter the Project Number
  var ui = SpreadsheetApp.getUi();
  var input= ui.prompt("Project Number:");
  var projectNumber = input.getResponseText();
  
  // Look for that project Number in the Contract Number column
  var sh = SpreadsheetApp.getActiveSheet();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh1 = ss.getSheetByName('Sheet2');  
  
  var last=ss.getLastRow();
 
  var data=sh.getRange(2,1,last,3).getValues();// create an array of data from columns 1 and 3
    for(nn=0;nn<data.length;++nn){
    if (data[nn][0]==projectNumber){break} ;// if find the project number, break the loop
      }
  
  var projectCombine=data[nn][0]+'-'+data[nn][1];  //
  sh1.getRange('B2').setValue(data[nn][0]);
  sh1.getRange('B3').setValue(data[nn][1]);
  sh1.getRange('B4').setValue(data[nn][2]);
  sh1.getRange('B1').setValue(projectCombine);
  sh1.getRange('B5').setValue('Ready');
  sh1.getRange('B6').setValue(Math.random());
  sh1.getRange('B7').setValue(Math.random());
}


function projectCreate2() 
{
  // Get sheet 1 and  first Row
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh1 = ss.getSheetByName('Sheet1');  
  var firstRow = 2;
  
  // Insert 1 row before first row
  sh1.insertRowBefore(firstRow);
  

  
  // Get sheet "Data Entry and information
  var sh3 = ss.getSheetByName('Data Entry');
  var client = sh3.getRange(6,6).getValue();
  var projectName = sh3.getRange(8,6).getValue();
  var projectAddress = sh3.getRange(10,6).getValue();
  var projectField = sh3.getRange(27,6).getValue();
  var projectEntrepreneur = sh3.getRange(29,6).getValue();
  var projectOpeningDate = sh3.getRange(20,6).getValue();
  var projectZoneDistance = sh3.getRange(14,8,5).getValues();
  var projectContactEmail = sh3.getRange(7,6).getValues();
  var projectEstimation = sh3.getRange(30,12).getValues(); 
  var projectPromoCode = sh3.getRange(32,12).getValues(); 
  
  
  // Insert value for 1 row
  var currentProjectNo=sh1.getRange(firstRow+1,1).getValue(); 
  var newProjectNo = currentProjectNo + 1;
  sh1.getRange(firstRow,1).setValue(newProjectNo);
  sh1.getRange(firstRow,2).setValue(client);
  sh1.getRange(firstRow,3).setValue(projectName);
  sh1.getRange(firstRow,4).setValue(projectAddress);
  sh1.getRange(firstRow,5).setValue(projectOpeningDate);
  sh1.getRange(firstRow,13).setValue(projectContactEmail);
  sh1.getRange(firstRow,14).setValue(projectContactEmail);

  //sh1.getRange(firstRow,9).setValue(projectZoneDistance);

// Put information about Zone Distance to Sheet1
if (projectZoneDistance[0][0] == true)
   {sh1.getRange(firstRow,10).setValue(1)}

  else if (projectZoneDistance[1][0] == true)
       {sh1.getRange(firstRow,10).setValue(2)}
  
   else if (projectZoneDistance[2][0] == true)
       {sh1.getRange(firstRow,10).setValue(3)}
  
   else if (projectZoneDistance[3][0] == true)
       {sh1.getRange(firstRow,10).setValue(4)}
  
   else if (projectZoneDistance[4][0] == true)
       {sh1.getRange(firstRow,10).setValue(5)}
  
  // Set Project Field 01. Résidentiel,02. Condo,03. Commercial,04. École,05. Bureau,06. Gouvernemental
  if (projectField =='01. Résidentiel')
           {sh1.getRange(firstRow,11).setValue(1);}
  
  else if (projectField =='02. Condo')
           {sh1.getRange(firstRow,11).setValue(2);}
  
  else if (projectField =='03. Commercial')
           {sh1.getRange(firstRow,11).setValue(3);}
 
  else if (projectField =='04. École')
           {sh1.getRange(firstRow,11).setValue(4);}
  
  else if (projectField =='05. Bureau')
           {sh1.getRange(firstRow,11).setValue(5);}  
  
  else if (projectField =='06. Gouvernemental')
           {sh1.getRange(firstRow,11).setValue(6);}  
  
  
  // Set Project Entrepreneur
  if (projectEntrepreneur =='01. Électricité')
           {sh1.getRange(firstRow,12).setValue(1);}
  
  else if (projectEntrepreneur =='02. Plomberie')
           {sh1.getRange(firstRow,12).setValue(2);}
  
  else if (projectEntrepreneur =='03. Ventilation')
           {sh1.getRange(firstRow,12).setValue(3);}
 
  else if (projectEntrepreneur =='04. Système intérieur')
           {sh1.getRange(firstRow,12).setValue(4);}
  
  else if (projectEntrepreneur =='05. Gicleur')
           {sh1.getRange(firstRow,12).setValue(5);}  
  
  else if (projectEntrepreneur =='06. Entrepreuneur Général')
           {sh1.getRange(firstRow,12).setValue(6);}  
  
  else if (projectEntrepreneur =='07.Propriétaire')
           {sh1.getRange(firstRow,12).setValue(7);} 


 var sh4 = ss.getSheetByName('Sale Estimation');
 var projectDate = new Date(sh3.getRange(20,6).getValue());
 var projectOpeningMonth = projectDate.getMonth();
 var sh4Col = projectOpeningMonth*2+1;

 var sh4LastRow = getFirstEmptyRowByColumnArray(sh4Col,'Sale Estimation');

 sh4.getRange(sh4LastRow+4,sh4Col).setValue(newProjectNo);
 sh4.getRange(sh4LastRow+4,sh4Col+1).setValue(projectEstimation);

folderCreate()
  
  
UrlFetchApp.fetch("https://hook.integromat.com/v2a9uc5s7eo84zqu1h6r1rklfeqkxyst");  //Run create project scencario in integromat
  
  
}

var CHECKBOX_CELLS = ["H14", "H15", "H16", "H17", "H18"];

function onEdit(e) {
  var range = e.range;

  var checkboxIndex = CHECKBOX_CELLS.indexOf(range.getA1Notation());

  if (checkboxIndex > -1 && range.getValue() == true) {
    var sheet = range.getSheet();

    for (var i=0; i<CHECKBOX_CELLS.length; i++) {
      if (i==checkboxIndex) continue;

      sheet.getRange(CHECKBOX_CELLS[i]).setValue(false);
    }
  }
 
    
}


function clear() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Data Entry');
  var rangesToClear = ['F6', "F8", "F10", "F12", "F20", "F30", "F32", "H15","L22:L27", "H22:H28"];
  for (var i=0; i<rangesToClear.length; i++) { 
    sheet.getRange(rangesToClear[i]).clearContent();
    var getCar = sheet.getRange("D6").getValue();
    sheet.getRange("F6").setValue("");
  }
}


function createInvoice() {
UrlFetchApp.fetch("https://hook.integromat.com/wfyt3jva7we7dxn097jjne01ftl3dhva");  //Run create project scencario in integromat

// Get to sheet 'Promotion Code'
var ss = SpreadsheetApp.getActiveSpreadsheet();

var sh5 = ss.getSheetByName('Promotion Code');
var sh6 = ss.getSheetByName('Invoice');

// Look for Client name

var clientName = sh6.getRange(11,6).getValue();

}

function clear_invoiceform() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Invoice');
  var rangesToClear = ["F6:F8", "F11", "I7:I12", "K7:K12"];
  for (var i=0; i<rangesToClear.length; i++) { 
    sheet.getRange(rangesToClear[i]).clearContent();
    //var getCar = sheet.getRange("D6").getValue();
    //sheet.getRange("F6").setValue("");
  }
}

function getFirstEmptyRowByColumnArray(InputCol,InputSheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh4= ss.getSheetByName(InputSheetName);
  var column = sh4.getRange(5,InputCol,200,1);
  var values = column.getValues(); // get all data in one call
  var ct = 0;
  while ( values[ct] && values[ct][0] != "" ) {
    ct++;
  }
  return (ct+1);
}

function AddInvoiceTodo() 
{
  // Get sheet 1 and  first Row
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh1 = ss.getSheetByName('Invoice to do');  
  var firstRow = 8;
  var now = new Date();
  // Insert 1 row before first row
  sh1.insertRowBefore(firstRow);
  

  
  // Get information from the table in the same sheet
  var projecNo = sh1.getRange(1,8).getValue();
  var description = sh1.getRange(2,8).getValue();
  var amount = sh1.getRange(3,8).getValue();
  var projectPromotion = sh1.getRange(4,8).getValue();
   
  // Insert value for 1 row
  sh1.getRange(firstRow,1).setValue(projecNo);
  sh1.getRange(firstRow,2).setValue(description);
  sh1.getRange(firstRow,3).setValue(amount);
  sh1.getRange(firstRow,4).setValue(projectPromotion);
   sh1.getRange(firstRow,5).setValue(now);
}

function clearInvoicetodo() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Invoice to do');
  var rangesToClear = ['H1', "H2", "H3", "H4", "H5"];
  for (var i=0; i<rangesToClear.length; i++) { 
    sheet.getRange(rangesToClear[i]).clearContent();

  }
}


// ===================== NEW: Web App Handlers =====================

function doGet(e) {
  return handleWebRequest(e);
}

function doPost(e) {
  return handleWebRequest(e);
}

function handleWebRequest(e) {
  var action = e.parameter.action;

  try {
    if (action === 'createProject') {
      return createProjectFromWeb(e.parameter);
    } else if (action === 'getNextProjectNo') {
      return getNextProjectNo();
    } else if (action === 'getClientList') {
      return getClientList();
    } else if (action === 'getData') {
      var sheetName = e.parameter.sheet || 'Sheet1';
      var year = e.parameter.year || '';
      return jsonResponse(getSheetData(sheetName, year));
    } else {
      return jsonResponse({ error: 'Invalid action' }, 400);
    }
  } catch (error) {
    return jsonResponse({ error: error.toString() }, 500);
  }
}

function getNextProjectNo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh1 = ss.getSheetByName('Sheet1');
  var currentProjectNo = sh1.getRange(2, 1).getValue();
  return jsonResponse({ nextProjectNo: currentProjectNo + 1 });
}

function getClientList() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Client List');
  var lastRow = sh.getLastRow();
  if (lastRow < 1) return jsonResponse({ clients: [] });

  var data = sh.getRange(1, 1, lastRow, 2).getValues();
  var clients = [];
  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) {
      clients.push({ name: data[i][0].toString().trim(), code: (data[i][1] || '').toString().trim() });
    }
  }
  return jsonResponse({ clients: clients });
}

function createProjectFromWeb(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh1 = ss.getSheetByName('Sheet1');
  var sh2 = ss.getSheetByName('Sheet2');
  var sh4 = ss.getSheetByName('Sale Estimation');
  var firstRow = 2;

  var client = params.client || '';
  var contactEmail = params.contactEmail || '';
  var projectName = params.projectName || '';
  var projectAddress = params.projectAddress || '';
  var companyDivision = params.companyDivision || 'Protection Sismique';
  var openingDate = params.openingDate || '';
  var contractType = params.contractType || '';
  var sousCategorie = params.sousCategorie || '';
  var zoneDistance = parseInt(params.zoneDistance) || 0;
  var projectField = parseInt(params.projectField) || 0;
  var entrepreneur = parseInt(params.entrepreneur) || 0;
  var estimation = parseFloat(params.estimation) || 0;
  var promoCode = params.promoCode || '';

  if (!client || !projectName) {
    return jsonResponse({ error: 'Client and Project Name are required' }, 400);
  }

  sh1.insertRowBefore(firstRow);

  var currentProjectNo = sh1.getRange(firstRow + 1, 1).getValue();
  var newProjectNo = currentProjectNo + 1;

  sh1.getRange(firstRow, 1).setValue(newProjectNo);
  sh1.getRange(firstRow, 2).setValue(client);
  sh1.getRange(firstRow, 3).setValue(projectName);
  sh1.getRange(firstRow, 4).setValue(projectAddress);
  if (openingDate) {
    sh1.getRange(firstRow, 5).setValue(new Date(openingDate));
  }
  sh1.getRange(firstRow, 6).setValue(contractType);
  sh1.getRange(firstRow, 7).setValue(sousCategorie);
  if (zoneDistance > 0) {
    sh1.getRange(firstRow, 10).setValue(zoneDistance);
  }
  if (projectField > 0) {
    sh1.getRange(firstRow, 11).setValue(projectField);
  }
  if (entrepreneur > 0) {
    sh1.getRange(firstRow, 12).setValue(entrepreneur);
  }
  sh1.getRange(firstRow, 13).setValue(contactEmail);
  sh1.getRange(firstRow, 14).setValue(contactEmail);

  if (openingDate && estimation > 0) {
    var projectDate = new Date(openingDate);
    var projectOpeningMonth = projectDate.getMonth();
    var sh4Col = projectOpeningMonth * 2 + 1;
    var sh4LastRow = getFirstEmptyRowByColumnArray(sh4Col, 'Sale Estimation');
    sh4.getRange(sh4LastRow + 4, sh4Col).setValue(newProjectNo);
    sh4.getRange(sh4LastRow + 4, sh4Col + 1).setValue(estimation);
  }

  var projectCombine = newProjectNo + '-' + client + '-' + projectName;
  sh2.getRange('A1').setValue(projectCombine);

  var newProjectFolder;
  if (companyDivision == 'YUL Structure') {
    newProjectFolder = newProjectNo + '-YUL-' + client + '-' + projectName;
  } else {
    newProjectFolder = projectCombine;
  }

  var folderID = '1VO_C2kVqc3wdLJUVBVI39IGVSmf9Dhf9';
  var folder = DriveApp.getFolderById(folderID);
  var newfolder = folder.createFolder(newProjectFolder);
  var newfolderID = newfolder.getId();
  var subfolder = DriveApp.getFolderById(newfolderID);

  var SharedSubfolder;
  if (companyDivision == 'YUL Structure') {
    SharedSubfolder = subfolder.createFolder(newProjectNo + '-YUL-Shared');
  } else {
    SharedSubfolder = subfolder.createFolder(newProjectNo + '-Shared');
  }

  var SharedSubfolderID = SharedSubfolder.getId();
  var SecondSubfolder = DriveApp.getFolderById(SharedSubfolderID);

  SecondSubfolder.createFolder('Photos by Client');
  SecondSubfolder.createFolder('Photos Inspection');
  SecondSubfolder.createFolder('Plans and DA');
  SecondSubfolder.createFolder('Comment by client');

  try {
    UrlFetchApp.fetch('https://hook.integromat.com/v2a9uc5s7eo84zqu1h6r1rklfeqkxyst');
  } catch (webhookError) {
    Logger.log('Integromat webhook failed: ' + webhookError.toString());
  }

  return jsonResponse({
    success: true,
    projectNo: newProjectNo,
    folderName: newProjectFolder,
    folderId: newfolderID
  });
}

function getSheetData(sheetName, year) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName || 'Sheet1');
  if (!sheet) {
    return { error: 'Sheet not found: ' + sheetName };
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) {
    return { headers: [], rows: [] };
  }

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return h.toString().trim();
  });

  // Find date column index for year filtering
  var dateColIndex = -1;
  if (year) {
    for (var c = 0; c < headers.length; c++) {
      var h = headers[c].toLowerCase();
      if (h.indexOf('date') > -1) {
        dateColIndex = c;
        break;
      }
    }
  }

  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var targetYear = year ? parseInt(year) : 0;

  var rows = [];
  for (var i = 0; i < data.length; i++) {
    // Year filter: skip rows that don't match the target year
    if (targetYear && dateColIndex > -1) {
      var dateVal = data[i][dateColIndex];
      var rowYear = 0;
      if (dateVal instanceof Date) {
        rowYear = dateVal.getFullYear();
      } else if (dateVal) {
        var parsed = new Date(dateVal);
        if (!isNaN(parsed)) rowYear = parsed.getFullYear();
      }
      if (rowYear !== targetYear) continue;
    }

    var row = { _rowIndex: i + 2 };
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      row[headers[j]] = val !== null && val !== undefined ? val.toString() : '';
    }
    rows.push(row);
  }

  return { headers: headers, rows: rows };
}

function jsonResponse(data, code) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}