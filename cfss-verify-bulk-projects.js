/* cfss-verify-bulk-projects.js */

const BULK_VERIFY_API_BASE =
  'https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/bulk-verify';

// Toggle this ON if you also want to re-upload flattened PDFs to S3 after verify
const REUPLOAD_FLATTENED_TO_S3 = true;

const N8N_WEBHOOK_URL = 'https://protectionsismique.app.n8n.cloud/webhook/cda3660d-ddda-4331-a206-16557bdc060f';

const bulkVerifyState = {
  authHelper: null,
  userData: null,
  entries: [],
  isUploading: false,
  isVerifying: false,
};

const bulkElements = {};

/* --------------------------- Flattening helpers --------------------------- */

// Render each page to canvas (PDF.js) and rebuild a PDF (pdf-lib).
// Pages are created at original PDF-point size and rotation so server-side
// signing coordinates remain correct.
async function flattenPdfInBrowser(file, scale = 1.75) {
  // Ensure libs exist (defensive in case of script-order issues)
  if (!window.pdfjsLib) throw new Error('pdfjs-dist not loaded');
  if (!window.PDFLib?.PDFDocument) throw new Error('pdf-lib not loaded');

  const { PDFDocument, degrees } = window.PDFLib;

  const arrayBuf = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuf });
  const src = await loadingTask.promise;

  const out = await PDFDocument.create();

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });

  for (let i = 1; i <= src.numPages; i++) {
    const page = await src.getPage(i);
    const rotation = page.rotate || 0;

    const baseViewport = page.getViewport({ scale: 1, rotation: 0 });
    const renderViewport = page.getViewport({ scale, rotation });

    const CSS_TO_PT = 72 / 96;
    const widthPts = Math.round(baseViewport.width * CSS_TO_PT);
    const heightPts = Math.round(baseViewport.height * CSS_TO_PT);

    canvas.width = Math.ceil(renderViewport.width);
    canvas.height = Math.ceil(renderViewport.height);
    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;

    const dataUrl = canvas.toDataURL('image/png');
    const pngBytes = await (await fetch(dataUrl)).arrayBuffer();

    const img = await out.embedPng(pngBytes);
    const outPage = out.addPage([widthPts, heightPts]);
    if (rotation) outPage.setRotation(degrees(rotation));
    outPage.drawImage(img, { x: 0, y: 0, width: widthPts, height: heightPts });

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  const outBytes = await out.save();
  return new File(
    [outBytes],
    file.name.replace(/\.pdf$/i, '') + '-flattened.pdf',
    { type: 'application/pdf', lastModified: Date.now() }
  );
}

// Download a URL to a File object (for post-verify flatten)
async function fetchAsFile(url, filename = 'signed.pdf') {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`Fetch ${url} failed (${res.status})`);
  const blob = await res.blob();
  return new File([blob], filename, {
    type: 'application/pdf',
    lastModified: Date.now(),
  });
}

// Create a blob URL for user download
function makeBlobDownloadUrl(file) {
  return URL.createObjectURL(file);
}

/* ------------------------------ Page wiring ------------------------------ */

function initializeBulkVerifyPage({ authHelper, userData }) {
  bulkVerifyState.authHelper = authHelper;
  bulkVerifyState.userData = userData;

  cacheDomElements();
  bindEventListeners();
  renderFileList();
  renderProcessedList();
  updateButtonStates();
}

function cacheDomElements() {
  bulkElements.dropzone = document.getElementById('bulkDropzone');
  bulkElements.fileInput = document.getElementById('bulkFileInput');
  bulkElements.clearBtn = document.getElementById('bulkClearBtn');
  bulkElements.uploadBtn = document.getElementById('bulkUploadBtn');
  bulkElements.verifyBtn = document.getElementById('bulkVerifyBtn');
  bulkElements.downloadAllBtn = document.getElementById('bulkDownloadAllBtn');
  bulkElements.downloadDriveBtn = document.getElementById('bulkDownloadDriveBtn');
  bulkElements.fileList = document.getElementById('bulkFileList');
  bulkElements.processedList = document.getElementById('bulkProcessedList');
  bulkElements.statusMessage = document.getElementById('bulkStatusMessage');
}

function bindEventListeners() {
  if (!bulkElements.fileInput) return;

  bulkElements.fileInput.addEventListener('change', handleFileSelection);

  ['dragenter', 'dragover'].forEach((eventName) => {
    bulkElements.dropzone.addEventListener(eventName, handleDragOver, false);
  });
  ['dragleave', 'drop'].forEach((eventName) => {
    bulkElements.dropzone.addEventListener(eventName, handleDragLeave, false);
  });
  bulkElements.dropzone.addEventListener('drop', handleFileDrop, false);

  bulkElements.clearBtn.addEventListener('click', handleClearList);
  bulkElements.uploadBtn.addEventListener('click', handleUploadSelected);
  bulkElements.verifyBtn.addEventListener('click', handleVerifyFiles);
  bulkElements.downloadAllBtn.addEventListener('click', handleDownloadAll);
    if (bulkElements.downloadDriveBtn) {
    bulkElements.downloadDriveBtn.addEventListener('click', handleDownloadToDrive); 
  }
}

/* ------------------------------- UI events ------------------------------- */

function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  bulkElements.dropzone.classList.add('dragover');
}

function handleDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  bulkElements.dropzone.classList.remove('dragover');
}

function handleFileDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  bulkElements.dropzone.classList.remove('dragover');

  const files = Array.from(event.dataTransfer.files || []).filter(
    (file) => file.type === 'application/pdf'
  );
  addFilesToQueue(files);
}

function handleFileSelection(event) {
  const files = Array.from(event.target.files || []).filter(
    (file) => file.type === 'application/pdf'
  );
  addFilesToQueue(files);
  event.target.value = ''; // allow re-selecting same files
}

function addFilesToQueue(files) {
  if (!files.length) {
    updateStatusMessage('Only PDF files are allowed for bulk verification.', 'error');
    return;
  }

  const now = Date.now();
  files.forEach((file, idx) => {
    const entry = {
      id: `bulk_${now}_${idx}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      status: 'pending',
      size: file.size,
      uploadedAt: null,
      verifiedAt: null,
      s3Key: null,
      processedKey: null,
      downloadUrl: null,           // signed (server) url after verify
      flattenedBlobUrl: null,      // browser-generated url (no backend)
      flattenedFile: null,         // File object for flattened version
      flattenedS3Key: null,        // optional re-uploaded key
      flattenedDownloadUrl: null,  // optional S3 presigned link for flattened
      error: null,
    };
    bulkVerifyState.entries.push(entry);
  });

  updateStatusMessage(
    `${files.length} file${files.length > 1 ? 's' : ''} added to the queue.`,
    'success'
  );
  renderFileList();
  updateButtonStates();
}

function handleClearList() {
  if (bulkVerifyState.isUploading || bulkVerifyState.isVerifying) {
    updateStatusMessage(
      'Please wait for the current operation to finish before clearing the list.',
      'error'
    );
    return;
  }
  bulkVerifyState.entries = [];
  renderFileList();
  renderProcessedList();
  updateButtonStates();
  updateStatusMessage('Cleared all queued files.', 'success');
}

function handleUploadSelected() {
  const pendingEntries = bulkVerifyState.entries.filter(
    (entry) => entry.status === 'pending'
  );
  if (!pendingEntries.length) {
    updateStatusMessage('There are no new files to upload.', 'error');
    return;
  }

  bulkVerifyState.isUploading = true;
  updateButtonStates();
  uploadPendingEntries(pendingEntries)
    .then((result) => {
      if (result.uploadedCount) {
        updateStatusMessage(
          `Uploaded ${result.uploadedCount} file${result.uploadedCount > 1 ? 's' : ''}.`,
          'success'
        );
      }
      if (result.failed.length) {
        updateStatusMessage(
          `Failed to upload ${result.failed.length} file${result.failed.length > 1 ? 's' : ''}.`,
          'error'
        );
      }
      renderFileList();
      updateButtonStates();
    })
    .catch((error) => {
      console.error('Bulk upload error:', error);
      updateStatusMessage(error.message || 'Failed to upload files.', 'error');
    })
    .finally(() => {
      bulkVerifyState.isUploading = false;
      updateButtonStates();
    });
}

/* ------------------------------ Networking ------------------------------- */

async function uploadPendingEntries(entries) {
  try {
    const authHeaders = bulkVerifyState.authHelper.getAuthHeaders();

    // Build request for presigned URLs (original files, no client-side flatten)
    const payload = {
      files: entries.map((entry) => ({
        clientId: entry.id,
        filename: entry.file.name,
        contentType: entry.file.type || 'application/pdf',
        size: entry.file.size,
      })),
    };

    const response = await fetch(`${BULK_VERIFY_API_BASE}/upload-url`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to request upload URLs (HTTP ${response.status})`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to request upload URLs.');
    }

    const uploadsById = new Map();
    (data.uploads || []).forEach((u) => uploadsById.set(u.clientId, u));

    let uploadedCount = 0;
    const failed = [];

    for (const entry of entries) {
      const uploadInfo = uploadsById.get(entry.id);
      if (!uploadInfo) {
        entry.status = 'error';
        entry.error = 'No upload URL returned';
        failed.push(entry);
        continue;
      }

      entry.status = 'uploading';
      renderFileList();

      try {
        const put = await fetch(uploadInfo.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': entry.file.type || 'application/pdf' },
          body: entry.file,
        });
        if (!put.ok) throw new Error(`Upload failed (${put.status})`);

        entry.status = 'uploaded';
        entry.s3Key = uploadInfo.key;
        entry.uploadedAt = new Date().toISOString();
        entry.error = null;
        uploadedCount += 1;
      } catch (e) {
        console.error(`Upload failed for ${entry.file.name}:`, e);
        entry.status = 'error';
        entry.error = e.message || 'Upload failed';
        failed.push(entry);
      }

      renderFileList();
    }

    return { uploadedCount, failed };
  } catch (error) {
    entries.forEach((entry) => {
      if (['pending', 'uploading'].includes(entry.status)) {
        entry.status = 'error';
        entry.error = error.message || 'Upload failed';
      }
    });
    renderFileList();
    throw error;
  }
}

function handleVerifyFiles() {
  const candidates = bulkVerifyState.entries.filter((e) => e.status === 'uploaded');
  if (!candidates.length) {
    updateStatusMessage('Upload files before running bulk verification.', 'error');
    return;
  }

  bulkVerifyState.isVerifying = true;
  candidates.forEach((e) => (e.status = 'verifying'));
  renderFileList();
  updateButtonStates();

  runBulkVerification(candidates)
    .then(({ processed, errors }) => {
      if (processed.length) {
        updateStatusMessage(
          `Successfully processed ${processed.length} file${processed.length > 1 ? 's' : ''}.`,
          'success'
        );
      }
      if (errors.length) {
        updateStatusMessage(
          `Failed to process ${errors.length} file${errors.length > 1 ? 's' : ''}.`,
          'error'
        );
      }
      renderFileList();
      renderProcessedList();
      updateButtonStates();
    })
    .catch((err) => {
      console.error('Bulk verification error:', err);
      updateStatusMessage(err.message || 'Failed to verify files.', 'error');
      renderFileList();
    })
    .finally(() => {
      bulkVerifyState.isVerifying = false;
      updateButtonStates();
    });
}

async function runBulkVerification(entries) {
  try {
    const authHeaders = bulkVerifyState.authHelper.getAuthHeaders();
    const payload = {
      files: entries.map((e) => ({
        clientId: e.id,
        key: e.s3Key,
        originalName: e.file.name,
      })),
    };

    const response = await fetch(`${BULK_VERIFY_API_BASE}/verify`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`Verification failed (HTTP ${response.status})`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Verification failed.');

    const processed = data.processed || [];
    const errors = data.errors || [];

    // Map server results → entries (signed URLs)
    processed.forEach((item) => {
      const entry = bulkVerifyState.entries.find((e) => e.id === item.clientId);
      if (!entry) return;
      entry.status = 'verified';
      entry.verifiedAt = new Date().toISOString();
      entry.processedKey = item.processedKey;
      entry.downloadUrl = item.downloadUrl; // signed (server) output
      entry.error = null;
    });
    errors.forEach((item) => {
      const entry = bulkVerifyState.entries.find((e) => e.id === item.clientId);
      if (!entry) return;
      entry.status = 'error';
      entry.error = item.message || 'Failed to verify';
    });

    // -------- NEW: post-verify flatten pass (browser) ----------
    // For each verified item: download signed → flatten → (A) blob link, (B) optional S3 re-upload.
    for (const item of processed) {
      const entry = bulkVerifyState.entries.find((e) => e.id === item.clientId);
      if (!entry || !entry.downloadUrl) continue;

      try {
        // A) download the SIGNED PDF returned by server
        const signedFile = await fetchAsFile(
          entry.downloadUrl,
          entry.file.name.replace(/\.pdf$/i, '') + '-signed.pdf'
        );

        // B) flatten it client-side
        const flatFile = await flattenPdfInBrowser(signedFile, 1.75); // tune scale if needed

        // C) Offer immediate client download
        entry.flattenedFile = flatFile;
        entry.flattenedBlobUrl = makeBlobDownloadUrl(flatFile);

        // D) (optional) also re-upload flattened to S3
        if (REUPLOAD_FLATTENED_TO_S3) {
          try {
            console.log(`[${entry.file.name}] Starting S3 re-upload of flattened file...`);
            const res = await fetch(`${BULK_VERIFY_API_BASE}/upload-url`, {
              method: 'POST',
              headers: { ...authHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                files: [
                  {
                    clientId: entry.id + ':flat',
                    filename:
                      flatFile.name.replace(/-signed/i, '').replace(/\.pdf$/i, '') +
                      '-final.pdf',
                    contentType: flatFile.type || 'application/pdf',
                    size: flatFile.size,
                  },
                ],
              }),
            });
            if (!res.ok) {
              const errText = await res.text();
              throw new Error(`Upload-URL request failed (${res.status}): ${errText}`);
            }
            const { success, uploads } = await res.json();
            if (!success || !uploads?.length) throw new Error('No upload URL returned for flattened file');

            const { uploadUrl, key } = uploads[0];
            console.log(`[${entry.file.name}] Got upload URL, uploading to S3 key: ${key}`);
            
            const put = await fetch(uploadUrl, {
              method: 'PUT',
              headers: { 'Content-Type': flatFile.type || 'application/pdf' },
              body: flatFile,
            });
            if (!put.ok) {
              const errText = await put.text();
              throw new Error(`S3 PUT failed (${put.status}): ${errText}`);
            }

            console.log(`[${entry.file.name}] S3 upload successful, getting download URL...`);
            
            // Optional: get a presigned GET for the flattened file
            const dlRes = await fetch(
              `${BULK_VERIFY_API_BASE}/download?key=${encodeURIComponent(key)}`,
              { headers: authHeaders }
            );
            if (!dlRes.ok) {
              const errText = await dlRes.text();
              throw new Error(`Download URL request failed (${dlRes.status}): ${errText}`);
            }
            const dlData = await dlRes.json();
            if (dlData?.downloadUrl) {
              entry.flattenedS3Key = key;
              entry.flattenedDownloadUrl = dlData.downloadUrl;
              console.log(`[${entry.file.name}] ✓ Flattened file successfully uploaded to S3 with download URL`);
            } else {
              throw new Error('Download URL not returned in response');
            }
          } catch (uploadErr) {
            console.error(`[${entry.file.name}] S3 re-upload failed:`, uploadErr);
            // Don't overwrite existing errors, but log this specific failure
            if (!entry.error || !entry.error.includes('Flatten')) {
              entry.error = `S3 upload failed: ${uploadErr.message}. File can still be downloaded to PC.`;
            }
          }
        } else {
          console.log(`[${entry.file.name}] S3 re-upload skipped (REUPLOAD_FLATTENED_TO_S3 = false)`);
        }
      } catch (e) {
        console.error(`[${entry.file.name}] Post-verify flatten failed:`, e);
        entry.error =
          entry.error ||
          'Flatten after sign failed (you can still download the signed version).';
      }
    }
    // -----------------------------------------------------------

    return { processed, errors };
  } catch (error) {
    entries.forEach((e) => {
      if (e.status === 'verifying') {
        e.status = 'error';
        e.error = error.message || 'Verification failed';
      }
    });
    throw error;
  }
}

/* --------------------------------- UI ------------------------------------ */

function handleDownloadAll() {
  const ready = bulkVerifyState.entries.filter(
    (e) => e.status === 'verified' && (e.flattenedDownloadUrl || e.flattenedBlobUrl || e.downloadUrl)
  );
  if (!ready.length) {
    updateStatusMessage('There are no processed files to download yet.', 'error');
    return;
  }

  for (const e of ready) {
    const href = e.flattenedDownloadUrl || e.flattenedBlobUrl || e.downloadUrl;
    try {
      const a = document.createElement('a');
      a.href = href;
      if (e.flattenedBlobUrl) {
        a.download = (e.flattenedFile?.name) || 'flattened.pdf';
      }
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
    } catch (err) {
      console.error('Open download failed', err);
      window.open(href, '_blank');
    }
  }

  updateStatusMessage('Download links opened.', 'success');
}

function renderFileList() {
  if (!bulkElements.fileList) return;

  if (!bulkVerifyState.entries.length) {
    bulkElements.fileList.innerHTML = `
      <div class="file-row" style="justify-content:center; text-align:center;">
        <div class="file-name" style="color: var(--text-secondary); font-weight:400;">
          No files queued yet. Add PDF files to begin.
        </div>
      </div>`;
    return;
  }

  bulkElements.fileList.innerHTML = bulkVerifyState.entries
    .map((e) => {
      const sizeText = formatFileSize(e.size);
      const statusClass = `file-status ${e.status}`;
      const statusLabel = statusLabelFor(e.status);

      return `
        <div class="file-row" data-id="${e.id}">
          <div>
            <div class="file-name">${escapeHtml(e.file.name)}</div>
            <div class="file-meta">${sizeText}</div>
            ${e.error ? `<div class="file-meta" style="color:#d9534f;">${escapeHtml(e.error)}</div>` : ''}
          </div>
          <div class="${statusClass}">${statusLabel}</div>
          <div class="file-actions">
            <button class="link-button" type="button"
              ${bulkVerifyState.isUploading || bulkVerifyState.isVerifying ? 'disabled' : ''}
              data-action="remove" data-id="${e.id}">
              Remove
            </button>
          </div>
        </div>`;
    })
    .join('');

  bulkElements.fileList
    .querySelectorAll('button[data-action="remove"]')
    .forEach((btn) => btn.addEventListener('click', handleRemoveEntry));
}

function renderProcessedList() {
  if (!bulkElements.processedList) return;

  const processedEntries = bulkVerifyState.entries.filter(
    (e) => e.status === 'verified' && (e.flattenedDownloadUrl || e.flattenedBlobUrl || e.downloadUrl)
  );

  if (!processedEntries.length) {
    bulkElements.processedList.innerHTML = `
      <div class="processed-row" style="justify-content:center; text-align:center;">
        <div class="file-name" style="color: var(--text-secondary); font-weight:400;">
          Processed files will appear here after verification.
        </div>
      </div>`;
    return;
  }

  bulkElements.processedList.innerHTML = processedEntries
    .map(
      (e) => `
      <div class="processed-row">
        <div>
          <div class="file-name">${escapeHtml(e.file.name)}</div>
          <div class="file-meta">Signed ${formatRelativeTime(e.verifiedAt)}</div>
        </div>
        ${
          e.flattenedDownloadUrl
            ? `<a class="download-link" href="${e.flattenedDownloadUrl}" target="_blank" rel="noopener"><i class="fas fa-file-download"></i> Download</a>`
            : e.flattenedBlobUrl
            ? `<a class="download-link" href="${e.flattenedBlobUrl}" download="${escapeHtml(e.flattenedFile?.name || 'flattened.pdf')}"><i class="fas fa-file-download"></i> Download</a>`
            : e.downloadUrl
            ? `<a class="download-link" href="${e.downloadUrl}" target="_blank" rel="noopener"><i class="fas fa-file-download"></i> Download</a>`
            : ''
        }
      </div>`
    )
    .join('');
}

function handleRemoveEntry(event) {
  const { id } = event.currentTarget.dataset;
  const entry = bulkVerifyState.entries.find((x) => x.id === id);
  if (!entry) return;

  if (['uploading', 'verifying'].includes(entry.status)) {
    updateStatusMessage(
      'Please wait for the current operation to finish before removing this file.',
      'error'
    );
    return;
  }

  // Revoke blob URL if any
  if (entry.flattenedBlobUrl) {
    try { URL.revokeObjectURL(entry.flattenedBlobUrl); } catch {}
  }

  bulkVerifyState.entries = bulkVerifyState.entries.filter((x) => x.id !== id);
  renderFileList();
  renderProcessedList();
  updateButtonStates();
}

function updateButtonStates() {
  if (!bulkElements.uploadBtn || !bulkElements.verifyBtn) return;

  const hasPending = bulkVerifyState.entries.some((e) => e.status === 'pending');
  const hasUploaded = bulkVerifyState.entries.some((e) => e.status === 'uploaded');
  const hasVerified = bulkVerifyState.entries.some(
    (e) => e.status === 'verified' && (e.flattenedDownloadUrl || e.flattenedBlobUrl || e.downloadUrl)
  );
  bulkElements.downloadAllBtn.disabled = !hasVerified;
  if (bulkElements.downloadDriveBtn) bulkElements.downloadDriveBtn.disabled = !hasVerified;

  bulkElements.uploadBtn.disabled =
    bulkVerifyState.isUploading || bulkVerifyState.isVerifying || !hasPending;
  bulkElements.verifyBtn.disabled =
    bulkVerifyState.isUploading || bulkVerifyState.isVerifying || !hasUploaded;
  bulkElements.downloadAllBtn.disabled = !hasVerified;
}

function updateStatusMessage(message, type = '') {
  if (!bulkElements.statusMessage) return;
  bulkElements.statusMessage.textContent = message;
  bulkElements.statusMessage.className = `bulk-status ${type}`;
}

/* --------------------------------- utils --------------------------------- */

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  if (!bytes && bytes !== 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(size < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function statusLabelFor(status) {
  switch (status) {
    case 'pending': return 'Pending upload';
    case 'uploading': return 'Uploading…';
    case 'uploaded': return 'Uploaded';
    case 'verifying': return 'Verifying…';
    case 'verified': return 'Verified';
    case 'error': return 'Error';
    default: return status;
  }
}

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRelativeTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const ms = Date.now() - d.getTime();
  if (ms < 60 * 1000) return 'just now';
  if (ms < 60 * 60 * 1000) {
    const m = Math.floor(ms / (60 * 1000));
    return `${m} minute${m !== 1 ? 's' : ''} ago`;
  }
  if (ms < 24 * 60 * 60 * 1000) {
    const h = Math.floor(ms / (60 * 60 * 1000));
    return `${h} hour${h !== 1 ? 's' : ''} ago`;
  }
  return d.toLocaleString();
}

async function handleDownloadToDrive() {
  try {
    const verifiedEntries = bulkVerifyState.entries.filter(e => e.status === 'verified');
    const withFlattenedUrl = verifiedEntries.filter(e => !!e.flattenedDownloadUrl);
    const withBlobOnly = verifiedEntries.filter(e => e.flattenedBlobUrl && !e.flattenedDownloadUrl);

    // If some files only have blob URLs, they failed S3 re-upload
    if (withBlobOnly.length > 0) {
      const fileNames = withBlobOnly.map(e => e.file.name).join(', ');
      console.error('Files failed S3 re-upload:', withBlobOnly);
      updateStatusMessage(
        `${withBlobOnly.length} file(s) failed to upload to cloud storage (required for Google Drive transfer): ${fileNames}. Check the console for details.`,
        'error'
      );
      return;
    }

    // If no verified entries yet
    if (!verifiedEntries.length) {
      updateStatusMessage('No verified files to send to Google Drive yet.', 'error');
      return;
    }

    // If still processing (no blob or download URLs yet)
    const stillProcessing = verifiedEntries.filter(e => !e.flattenedDownloadUrl && !e.flattenedBlobUrl);
    if (stillProcessing.length > 0) {
      updateStatusMessage('Flattened versions are still processing. Try again once they finish.', 'error');
      return;
    }

    // Build payload; n8n must be able to GET the URL (skip blob:)
    const files = withFlattenedUrl.map(e => ({
      fileName: (e.file?.name || 'report').replace(/\.pdf$/i, '') + '-signed.pdf',
      sourceUrl: e.flattenedDownloadUrl
    }));

    if (!files.length) {
      updateStatusMessage('No files successfully uploaded to cloud storage for Google Drive transfer.', 'error');
      return;
    }

    const res = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // text/plain avoids preflight
      body: JSON.stringify({ files }),
    });

    if (!res.ok) throw new Error(`n8n webhook failed (HTTP ${res.status})`);
    updateStatusMessage(`Google Drive upload started for ${files.length} file(s). Files will appear in Drive shortly.`, 'success');
  } catch (err) {
    console.error('Drive upload error:', err);
    updateStatusMessage(err.message || 'Failed to send files to Google Drive.', 'error');
  } finally {
    updateButtonStates();
  }
}
window.initializeBulkVerifyPage = initializeBulkVerifyPage;