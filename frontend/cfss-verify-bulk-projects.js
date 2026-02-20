/* cfss-verify-bulk-projects.js */

const BULK_VERIFY_API_BASE =
  'https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/bulk-verify';

const N8N_WEBHOOK_URL = 'https://protectionsismique.app.n8n.cloud/webhook/cda3660d-ddda-4331-a206-16557bdc060f';

const bulkVerifyState = {
  authHelper: null,
  userData: null,
  entries: [],
  isUploading: false,
  isVerifying: false,
};

const bulkElements = {};

async function triggerDownload(info) {
  if (!info || !info.url) return;

  try {
    const response = await fetch(info.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    if (info.filename) link.download = info.filename;
    link.style.display = 'none';

    const parent = document.body || document.documentElement;
    parent.appendChild(link);
    link.click();
    setTimeout(() => {
      try { link.remove(); } catch (err) { /* ignore */ }
      try { URL.revokeObjectURL(blobUrl); } catch (err) { /* ignore */ }
    }, 100);
  } catch (err) {
    console.error('Download failed, falling back to window.open:', err);
    window.open(info.url, '_blank');
  }
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
  bulkElements.verifyBtn.addEventListener('click', handleVerifyFiles);
  bulkElements.downloadAllBtn.addEventListener('click', handleDownloadAll);
    if (bulkElements.downloadDriveBtn) {
    bulkElements.downloadDriveBtn.addEventListener('click', handleDownloadToDrive); 
  }
  if (bulkElements.processedList) {
    bulkElements.processedList.addEventListener('click', handleProcessedDownloadClick);
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
    updateStatusMessage(t('bulkVerify.onlyPdfAllowed'), 'error');
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
      downloadUrl: null,           // presigned S3 url after verify (flattened by PDF4me)
      error: null,
    };
    bulkVerifyState.entries.push(entry);
  });

  updateStatusMessage(
    t('bulkVerify.filesAddedToQueue', { count: files.length }),
    'success'
  );
  renderFileList();
  updateButtonStates();
}

function handleClearList() {
  if (bulkVerifyState.isUploading || bulkVerifyState.isVerifying) {
    updateStatusMessage(
      t('bulkVerify.waitForCurrentOperation'),
      'error'
    );
    return;
  }
  bulkVerifyState.entries = [];
  renderFileList();
  renderProcessedList();
  updateButtonStates();
  updateStatusMessage(t('bulkVerify.clearedAllFiles'), 'success');
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
    const CONCURRENCY = 3;

    // Upload in parallel batches
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
      const batch = entries.slice(i, i + CONCURRENCY);

      // Mark batch as uploading
      for (const entry of batch) {
        const uploadInfo = uploadsById.get(entry.id);
        if (!uploadInfo) {
          entry.status = 'error';
          entry.error = 'No upload URL returned';
          failed.push(entry);
          continue;
        }
        entry.status = 'uploading';
        entry._uploadInfo = uploadInfo;
      }
      renderFileList();

      // Upload batch concurrently
      await Promise.all(
        batch
          .filter((entry) => entry.status === 'uploading')
          .map(async (entry) => {
            try {
              const put = await fetch(entry._uploadInfo.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': entry.file.type || 'application/pdf' },
                body: entry.file,
              });
              if (!put.ok) throw new Error(`Upload failed (${put.status})`);

              entry.status = 'uploaded';
              entry.s3Key = entry._uploadInfo.key;
              entry.uploadedAt = new Date().toISOString();
              entry.error = null;
              uploadedCount += 1;
            } catch (e) {
              console.error(`Upload failed for ${entry.file.name}:`, e);
              entry.status = 'error';
              entry.error = e.message || 'Upload failed';
              failed.push(entry);
            }
            delete entry._uploadInfo;
          })
      );
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

async function handleVerifyFiles() {
  const pendingEntries = bulkVerifyState.entries.filter((e) => e.status === 'pending');
  const alreadyUploaded = bulkVerifyState.entries.filter((e) => e.status === 'uploaded');

  if (!pendingEntries.length && !alreadyUploaded.length) {
    updateStatusMessage(t('bulkVerify.noFilesToProcess'), 'error');
    return;
  }

  bulkVerifyState.isVerifying = true;
  updateButtonStates();

  try {
    // Step 1: Upload any pending files first
    if (pendingEntries.length) {
      bulkVerifyState.isUploading = true;
      updateButtonStates();

      const uploadResult = await uploadPendingEntries(pendingEntries);

      bulkVerifyState.isUploading = false;

      if (uploadResult.failed.length) {
        updateStatusMessage(
          t('bulkVerify.failedToUpload', { count: uploadResult.failed.length }),
          'error'
        );
      }
      renderFileList();
    }

    // Step 2: Verify all uploaded files (including freshly uploaded ones)
    const candidates = bulkVerifyState.entries.filter((e) => e.status === 'uploaded');
    if (!candidates.length) {
      updateStatusMessage(t('bulkVerify.noFilesUploadedSuccessfully'), 'error');
      return;
    }

    candidates.forEach((e) => (e.status = 'verifying'));
    renderFileList();

    const { processed, errors } = await runBulkVerification(candidates);

    if (processed.length) {
      updateStatusMessage(
        t('bulkVerify.successfullyProcessed', { count: processed.length }),
        'success'
      );
    }
    if (errors.length) {
      updateStatusMessage(
        t('bulkVerify.failedToProcess', { count: errors.length }),
        'error'
      );
    }
    renderFileList();
    renderProcessedList();
    updateButtonStates();
  } catch (err) {
    console.error('Bulk verification error:', err);
    updateStatusMessage(err.message || t('bulkVerify.failedToVerifyFiles'), 'error');
    renderFileList();
  } finally {
    bulkVerifyState.isUploading = false;
    bulkVerifyState.isVerifying = false;
    updateButtonStates();
  }
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

async function handleDownloadAll() {
  const ready = bulkVerifyState.entries.filter(
    (e) => e.status === 'verified' && e.downloadUrl
  );
  if (!ready.length) {
    updateStatusMessage(t('bulkVerify.noProcessedFilesToDownload'), 'error');
    return;
  }

  let hadFailure = false;
  for (const entry of ready) {
    const info = getDownloadInfo(entry);
    if (!info) continue;
    try {
      await triggerDownload(info);
    } catch (err) {
      console.error('Download trigger failed', err);
      hadFailure = true;
    }
  }

  if (hadFailure) {
    updateStatusMessage(t('bulkVerify.unableToStartDownloads'), 'error');
  } else {
    updateStatusMessage(t('bulkVerify.downloadsStarted'), 'success');
  }
}

function renderFileList() {
  if (!bulkElements.fileList) return;

  if (!bulkVerifyState.entries.length) {
    bulkElements.fileList.innerHTML = `
      <div class="file-row" style="justify-content:center; text-align:center;">
        <div class="file-name" style="color: var(--text-secondary); font-weight:400;">
          ${t('bulkVerify.noFilesQueuedYet')}
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
              ${t('common.remove')}
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
    (e) => e.status === 'verified' && e.downloadUrl
  );

  if (!processedEntries.length) {
    bulkElements.processedList.innerHTML = `
      <div class="processed-row" style="justify-content:center; text-align:center;">
        <div class="file-name" style="color: var(--text-secondary); font-weight:400;">
          ${t('bulkVerify.processedFilesWillAppear')}
        </div>
      </div>`;
    return;
  }

  bulkElements.processedList.innerHTML = processedEntries
    .map((e) => {
      const info = getDownloadInfo(e);
      const hrefValue = info?.url ? escapeHtml(info.url) : '#';
      const downloadMarkup = info
        ? `<a class="download-link" href="${hrefValue}" data-action="download" data-id="${e.id}" download="${escapeHtml(info.filename)}"><i class="fas fa-file-download"></i> ${t('common.download')}</a>`
        : '';

      return `
      <div class="processed-row">
        <div>
          <div class="file-name">${escapeHtml(e.file.name)}</div>
          <div class="file-meta">${t('bulkVerify.signed')} ${formatRelativeTime(e.verifiedAt)}</div>
        </div>
        ${downloadMarkup}
      </div>`;
    })
    .join('');
}

async function handleProcessedDownloadClick(event) {
  const downloadTarget = event.target.closest('[data-action="download"]');
  if (!downloadTarget) return;

  event.preventDefault();
  const { id } = downloadTarget.dataset;
  const entry = bulkVerifyState.entries.find((e) => e.id === id);
  if (!entry) return;

  const info = getDownloadInfo(entry);
  if (!info) {
    updateStatusMessage(t('bulkVerify.fileNotReadyForDownload'), 'error');
    return;
  }

  try {
    await triggerDownload(info);
  } catch (err) {
    console.error('Download trigger failed', err);
    updateStatusMessage(t('bulkVerify.unableToStartDownload'), 'error');
  }
}

function handleRemoveEntry(event) {
  const { id } = event.currentTarget.dataset;
  const entry = bulkVerifyState.entries.find((x) => x.id === id);
  if (!entry) return;

  if (['uploading', 'verifying'].includes(entry.status)) {
    updateStatusMessage(
      t('bulkVerify.waitBeforeRemoving'),
      'error'
    );
    return;
  }

  bulkVerifyState.entries = bulkVerifyState.entries.filter((x) => x.id !== id);
  renderFileList();
  renderProcessedList();
  updateButtonStates();
}

function updateButtonStates() {
  if (!bulkElements.verifyBtn) return;

  const hasPending = bulkVerifyState.entries.some((e) => e.status === 'pending');
  const hasUploaded = bulkVerifyState.entries.some((e) => e.status === 'uploaded');
  const hasVerified = bulkVerifyState.entries.some(
    (e) => e.status === 'verified' && e.downloadUrl
  );

  bulkElements.verifyBtn.disabled =
    bulkVerifyState.isUploading || bulkVerifyState.isVerifying || (!hasPending && !hasUploaded);
  bulkElements.downloadAllBtn.disabled = !hasVerified;
  if (bulkElements.downloadDriveBtn) bulkElements.downloadDriveBtn.disabled = !hasVerified;
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
    case 'pending': return t('bulkVerify.statusPending');
    case 'uploading': return t('bulkVerify.statusUploading');
    case 'uploaded': return t('bulkVerify.statusUploaded');
    case 'verifying': return t('bulkVerify.statusVerifying');
    case 'verified': return t('bulkVerify.statusVerified');
    case 'error': return t('bulkVerify.statusError');
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
  if (ms < 60 * 1000) return t('bulkVerify.justNow');
  if (ms < 60 * 60 * 1000) {
    const m = Math.floor(ms / (60 * 1000));
    return t('bulkVerify.minutesAgo', { count: m });
  }
  if (ms < 24 * 60 * 60 * 1000) {
    const h = Math.floor(ms / (60 * 60 * 1000));
    return t('bulkVerify.hoursAgo', { count: h });
  }
  return d.toLocaleString();
}

function getDownloadInfo(entry) {
  if (!entry) return null;

  const originalName = entry.file?.name || 'report.pdf';
  const baseName = originalName.replace(/\.pdf$/i, '');

  if (entry.downloadUrl) {
    return {
      url: entry.downloadUrl,
      filename: `${baseName}-signed.pdf`,
    };
  }

  return null;
}

async function handleDownloadToDrive() {
  try {
    const verifiedEntries = bulkVerifyState.entries.filter(
      (e) => e.status === 'verified' && e.downloadUrl
    );

    if (!verifiedEntries.length) {
      updateStatusMessage(t('bulkVerify.noVerifiedFilesForDrive'), 'error');
      return;
    }

    const files = verifiedEntries.map((e) => ({
      fileName: (e.file?.name || 'report').replace(/\.pdf$/i, '') + '-signed.pdf',
      sourceUrl: e.downloadUrl,
    }));

    const res = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // text/plain avoids preflight
      body: JSON.stringify({ files }),
    });

    if (!res.ok) throw new Error(`n8n webhook failed (HTTP ${res.status})`);
    updateStatusMessage(t('bulkVerify.driveUploadStarted', { count: files.length }), 'success');
  } catch (err) {
    console.error('Drive upload error:', err);
    updateStatusMessage(err.message || t('bulkVerify.failedToSendToDrive'), 'error');
  } finally {
    updateButtonStates();
  }
}
window.initializeBulkVerifyPage = initializeBulkVerifyPage;
