// ==============================================
// cfss-custom-pages.js
// Custom Page Builder for CFSS Projects
// ==============================================

// Global variables for custom pages
let projectCustomPages = [];
let currentCustomPage = null;
let customPageElementCounter = 0;
let selectedCanvasElement = null;
let isEditingCustomPage = false;
let isDropping = false;

// Initialize Custom Pages system
function initializeCustomPages() {
    console.log('🎨 Initializing Custom Pages system...');
    setBlankCFSSBackground();
    
    const addButton = document.getElementById('addCustomPageButton');
    if (addButton) {
        // FIXED: Don't pass the event as an argument
        addButton.addEventListener('click', () => showCustomPageBuilder());
    }
    
    setupCustomPagePalette();
    
    console.log('✅ Custom Pages initialized');
}

// --- Custom Pages: load blank page background from S3 (PNG) ---
// Canvas matches the template's aspect; template never stretched
async function setBlankCFSSBackground() {
  try {
    const key = 'report/blank-cfss-page.png';
    const signResp = await fetch(
      `https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/templates/sign?key=${encodeURIComponent(key)}`,
      { headers: getAuthHeaders() }
    );
    if (!signResp.ok) throw new Error(`Signer failed: HTTP ${signResp.status}`);
    const { url } = await signResp.json();

    const canvasEl = document.getElementById('customPageCanvas');
    if (!canvasEl) return;

    // Preload to read natural size
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('PNG failed to load'));
      i.src = url;
    });

    // 1) Background = template (do NOT stretch it)
    canvasEl.style.backgroundImage = `url("${url}")`;
    canvasEl.style.backgroundRepeat = 'no-repeat';
    canvasEl.style.backgroundPosition = 'left top';
    canvasEl.style.backgroundSize = 'contain';      // <--- key: fit, don't stretch

    // 2) Canvas resizes to the template's aspect and shrinks to the container if needed
    canvasEl.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
    canvasEl.style.width = '100%';                  // fill container width
    canvasEl.style.maxWidth = `${img.naturalWidth}px`; // but never larger than template
    canvasEl.style.height = 'auto';

    // 3) Remove any chrome so canvas IS the template
    canvasEl.style.margin = '0';
    canvasEl.style.boxShadow = 'none';
    canvasEl.style.borderRadius = '0';
    canvasEl.style.backgroundColor = 'transparent';

    // 4) Persist the rendered size for 1:1 PDF mapping
    const updateSize = () => {
      if (typeof window.currentCustomPage !== 'object') window.currentCustomPage = {};
      window.currentCustomPage.canvasWidth  = Math.round(canvasEl.clientWidth);
      window.currentCustomPage.canvasHeight = Math.round(canvasEl.clientHeight);
    };
    updateSize();
    window.addEventListener('resize', updateSize);

    console.log('🖼️ Canvas fitted to template (no stretch)', {
      natural: { w: img.naturalWidth, h: img.naturalHeight },
      rendered: { w: canvasEl.clientWidth, h: canvasEl.clientHeight }
    });
  } catch (e) {
    console.warn('Could not set blank CFSS background:', e);
  }
}

// Setup palette drag events
function setupCustomPagePalette() {
    document.querySelectorAll('.palette-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('elementType', item.dataset.type);
            e.dataTransfer.effectAllowed = 'copy';
        });
    });
}

// Show custom page builder
function showCustomPageBuilder(pageToEdit = null) {
    const builder = document.getElementById('customPageBuilder');
    const list = document.getElementById('customPagesList');
    
    list.style.display = 'none';
    builder.style.display = 'block';
    
    if (pageToEdit) {
        // Editing existing page
        isEditingCustomPage = true;
        currentCustomPage = pageToEdit;
        document.getElementById('customPageTitle').value = pageToEdit.title;
        loadCustomPageElements(pageToEdit.elements);
    } else {
        // Creating new page
        isEditingCustomPage = false;
        currentCustomPage = {
            id: Date.now(),
            title: '',
            elements: [],
            createdAt: new Date().toISOString()
        };
        document.getElementById('customPageTitle').value = '';
        clearCustomPageCanvas();
    }
    
    setupCanvasEvents();
}

// Setup canvas drag and drop events
function setupCanvasEvents() {
    const canvas = document.getElementById('customPageCanvas');
    
    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        canvas.classList.add('drag-over');
    });
    
    canvas.addEventListener('dragleave', (e) => {
        if (e.target === canvas) {
            canvas.classList.remove('drag-over');
        }
    });
    
    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        canvas.classList.remove('drag-over');
        
        // Prevent duplicate drops
        if (isDropping) {
            console.log('⚠️ Drop already in progress, ignoring duplicate');
            return;
        }
        
        isDropping = true;
        
        const type = e.dataTransfer.getData('elementType');
        if (type) {
            // Remove empty state
            const emptyState = canvas.querySelector('.canvas-empty-state');
            if (emptyState) emptyState.remove();
            
            // Get drop position relative to canvas
            const canvasRect = canvas.getBoundingClientRect();
            const x = e.clientX - canvasRect.left;
            const y = e.clientY - canvasRect.top;
            
            createCanvasElement(type, x, y);
        }
        
        // Reset flag after a short delay
        setTimeout(() => {
            isDropping = false;
        }, 100);
    });
    
    // Click canvas to deselect
    canvas.addEventListener('click', (e) => {
        if (e.target === canvas) {
            deselectAllCanvasElements();
        }
    });
}

// Create canvas element
function createCanvasElement(type, x, y) {
    customPageElementCounter++;
    const canvas = document.getElementById('customPageCanvas');
    const element = document.createElement('div');
    element.className = 'canvas-element';
    element.dataset.id = customPageElementCounter;
    element.dataset.type = type;
    
    // Default sizes
    let width = 300;
    let height = 100;
    
    if (type === 'image') {
        width = 400;
        height = 300;
    } else if (type === 'heading') {
        height = 60;
    }
    
    element.style.left = x + 'px';
    element.style.top = y + 'px';
    element.style.width = width + 'px';
    element.style.height = height + 'px';
    
    const controls = `
        <div class="drag-handle">
            <i class="fas fa-grip-vertical"></i>
        </div>
        <div class="element-controls">
            <button class="control-btn" onclick="editCanvasElement(${customPageElementCounter})">Edit</button>
            <button class="control-btn delete" onclick="deleteCanvasElement(${customPageElementCounter})">Delete</button>
        </div>
        <div class="resize-handles">
            <div class="resize-handle corner top-left"></div>
            <div class="resize-handle corner top-right"></div>
            <div class="resize-handle corner bottom-left"></div>
            <div class="resize-handle corner bottom-right"></div>
            <div class="resize-handle edge top"></div>
            <div class="resize-handle edge bottom"></div>
            <div class="resize-handle edge left"></div>
            <div class="resize-handle edge right"></div>
        </div>
    `;
    
if (type === 'heading') {
    element.innerHTML = controls + '<div class="canvas-heading-element" contenteditable="true" data-default="true">New Heading</div>';
    
    // Clear default text on first focus
    const headingEl = element.querySelector('.canvas-heading-element');
    headingEl.addEventListener('focus', function clearDefaultOnce() {
        if (this.getAttribute('data-default') === 'true') {
            this.textContent = '';
            this.removeAttribute('data-default');
        }
        headingEl.removeEventListener('focus', clearDefaultOnce);
    });
} else if (type === 'text') {
    element.innerHTML = controls + '<div class="canvas-text-element" contenteditable="true" data-default="true">Click to edit text.</div>';
    
    // Clear default text on first focus
    const textEl = element.querySelector('.canvas-text-element');
    textEl.addEventListener('focus', function clearDefaultOnce() {
        if (this.getAttribute('data-default') === 'true') {
            this.textContent = '';
            this.removeAttribute('data-default');
        }
        textEl.removeEventListener('focus', clearDefaultOnce);
    });
} else if (type === 'image') {
    const uploadId = 'canvasImageUpload_' + customPageElementCounter;
    element.innerHTML = controls + `
        <div class="canvas-image-element">
            <div class="canvas-image-upload-container">
                <div class="upload-controls" style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <button type="button" class="canvas-camera-btn" id="cameraBtn_${uploadId}" 
                            style="display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
                        <i class="fas fa-camera"></i>
                        Browse
                    </button>
                    
                    <input 
                        class="canvas-drop-zone" 
                        id="dropZone_${uploadId}" 
                        placeholder="Drop or paste here (Ctrl+V)"
                        readonly
                        tabindex="0"
                        style="flex: 1; padding: 10px; border: 2px dashed #ccc; border-radius: 4px; background: white; cursor: pointer; font-size: 14px;">
                </div>
                
                <input type="file" id="fileInput_${uploadId}" accept="image/*" style="display: none;">
            </div>
        </div>
    `;
    
    // Setup upload handlers immediately
    setTimeout(() => {
        const imageElement = element.querySelector('.canvas-image-element');
        if (imageElement) {
            setupCanvasImageUploadHandlers(imageElement, uploadId);
        }
    }, 0);
}
    
    element.addEventListener('click', (e) => {
        if (!e.target.closest('.element-controls') && 
            !e.target.closest('.drag-handle')) {
            selectCanvasElement(element);
        }
    });
    
    setupCanvasElementDragging(element);
    setupCanvasElementResizing(element);
    
    canvas.appendChild(element);
    selectCanvasElement(element);
}

// Setup element dragging
function setupCanvasElementDragging(element) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;
    
    function startDrag(e) {
        if (e.target.closest('.element-controls') || 
            e.target.closest('.resize-handle') ||
            e.target.closest('[contenteditable]')) {
            return;
        }
        
        isDragging = true;
        element.classList.add('dragging');
        
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = element.offsetLeft;
        initialTop = element.offsetTop;
        
        e.preventDefault();
    }
    
    function onDrag(e) {
        if (!isDragging) return;
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        let newLeft = initialLeft + deltaX;
        let newTop = initialTop + deltaY;
        
        const canvas = document.getElementById('customPageCanvas');
        newLeft = Math.max(0, Math.min(newLeft, canvas.offsetWidth - element.offsetWidth));
        newTop = Math.max(0, Math.min(newTop, canvas.offsetHeight - element.offsetHeight));
        
        element.style.left = newLeft + 'px';
        element.style.top = newTop + 'px';
    }
    
    function stopDrag() {
        if (isDragging) {
            isDragging = false;
            element.classList.remove('dragging');
        }
    }
    
    element.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
}

// Setup element resizing
function setupCanvasElementResizing(element) {
    const resizeHandles = element.querySelectorAll('.resize-handle');
    
    resizeHandles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const direction = handle.classList.contains('top-left') ? 'nw' :
                            handle.classList.contains('top-right') ? 'ne' :
                            handle.classList.contains('bottom-left') ? 'sw' :
                            handle.classList.contains('bottom-right') ? 'se' :
                            handle.classList.contains('top') ? 'n' :
                            handle.classList.contains('bottom') ? 's' :
                            handle.classList.contains('left') ? 'w' : 'e';
            
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = element.offsetWidth;
            const startHeight = element.offsetHeight;
            const startLeft = element.offsetLeft;
            const startTop = element.offsetTop;
            
            element.classList.add('resizing');
            
            function onMouseMove(e) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                
                let newWidth = startWidth;
                let newHeight = startHeight;
                let newLeft = startLeft;
                let newTop = startTop;
                
                if (direction.includes('e')) {
                    newWidth = Math.max(100, startWidth + deltaX);
                }
                if (direction.includes('w')) {
                    newWidth = Math.max(100, startWidth - deltaX);
                    if (newWidth > 100) {
                        newLeft = startLeft + deltaX;
                    }
                }
                if (direction.includes('s')) {
                    newHeight = Math.max(50, startHeight + deltaY);
                }
                if (direction.includes('n')) {
                    newHeight = Math.max(50, startHeight - deltaY);
                    if (newHeight > 50) {
                        newTop = startTop + deltaY;
                    }
                }
                
                element.style.width = newWidth + 'px';
                element.style.height = newHeight + 'px';
                element.style.left = newLeft + 'px';
                element.style.top = newTop + 'px';
            }
            
            function onMouseUp() {
                element.classList.remove('resizing');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            }
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    });
}

// Select canvas element
function selectCanvasElement(element) {
    deselectAllCanvasElements();
    element.classList.add('selected');
    selectedCanvasElement = element;
    showCanvasElementProperties(element);
}

// Deselect all canvas elements
function deselectAllCanvasElements() {
    document.querySelectorAll('.canvas-element').forEach(el => {
        el.classList.remove('selected');
    });
    selectedCanvasElement = null;
    document.getElementById('customPageProperties').innerHTML = `
        <p style="color: #6c757d; font-size: 13px; text-align: center; padding: 30px 10px;">
            Select an element to edit its properties
        </p>
    `;
}

function showCanvasElementProperties(element) {
    const content = document.getElementById('customPageProperties');
    const hasText = element.querySelector('.canvas-text-element, .canvas-heading-element');
    
    if (hasText) {
        // Text/Heading elements: show font, typeface styling, and color
        const textEl = element.querySelector('.canvas-text-element, .canvas-heading-element');
        const currentFont = textEl.style.fontFamily || 'Arial, sans-serif';
        const currentColor = textEl.style.color || '#000000';
        const isBold = textEl.style.fontWeight === 'bold';
        const isItalic = textEl.style.fontStyle === 'italic';
        const isUnderline = textEl.style.textDecoration === 'underline';
        
        content.innerHTML = `
            <div class="property-row" style="display: flex; gap: 10px; margin-bottom: 12px;">
                <div class="property-group" style="flex: 1;">
                    <label>Font</label>
                    <select onchange="updateCanvasElementFont(this.value)" style="width: 100%;">
                        <option value="Arial, sans-serif" ${currentFont.includes('Arial') ? 'selected' : ''}>Arial</option>
                        <option value="'Times New Roman', serif" ${currentFont.includes('Times') ? 'selected' : ''}>Times New Roman</option>
                        <option value="'Courier New', monospace" ${currentFont.includes('Courier') ? 'selected' : ''}>Courier New</option>
                        <option value="Georgia, serif" ${currentFont.includes('Georgia') ? 'selected' : ''}>Georgia</option>
                        <option value="Verdana, sans-serif" ${currentFont.includes('Verdana') ? 'selected' : ''}>Verdana</option>
                        <option value="'Trebuchet MS', sans-serif" ${currentFont.includes('Trebuchet') ? 'selected' : ''}>Trebuchet MS</option>
                        <option value="Impact, sans-serif" ${currentFont.includes('Impact') ? 'selected' : ''}>Impact</option>
                    </select>
                </div>
                
                <div class="property-group" style="flex: 1;">
                    <label>Typeface</label>
                    <div style="display: flex; gap: 5px;">
                        <button type="button" onclick="toggleCanvasElementBold()" 
                                style="flex: 1; padding: 8px; border: 1px solid #dee2e6; border-radius: 4px; background: ${isBold ? '#007bff' : 'white'}; color: ${isBold ? 'white' : '#333'}; font-weight: bold; cursor: pointer;">
                            B
                        </button>
                        <button type="button" onclick="toggleCanvasElementItalic()" 
                                style="flex: 1; padding: 8px; border: 1px solid #dee2e6; border-radius: 4px; background: ${isItalic ? '#007bff' : 'white'}; color: ${isItalic ? 'white' : '#333'}; font-style: italic; cursor: pointer;">
                            I
                        </button>
                        <button type="button" onclick="toggleCanvasElementUnderline()" 
                                style="flex: 1; padding: 8px; border: 1px solid #dee2e6; border-radius: 4px; background: ${isUnderline ? '#007bff' : 'white'}; color: ${isUnderline ? 'white' : '#333'}; text-decoration: underline; cursor: pointer;">
                            U
                        </button>
                    </div>
                </div>
                
                <div class="property-group" style="flex: 0 0 80px;">
                    <label>Color</label>
                    <input type="color" value="${rgbToHex(currentColor)}" oninput="updateCanvasElementColor(this.value)" style="width: 100%; height: 32px; cursor: pointer; border: 1px solid #dee2e6; border-radius: 4px;">
                </div>
            </div>
            
            <div class="property-row">
                <div class="property-group">
                    <label>Font Size</label>
                    <select onchange="updateCanvasElementFontSize(this.value)">
                        <option value="12px">12px</option>
                        <option value="14px">14px</option>
                        <option value="16px" selected>16px</option>
                        <option value="18px">18px</option>
                        <option value="20px">20px</option>
                        <option value="24px">24px</option>
                        <option value="28px">28px</option>
                        <option value="32px">32px</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>Alignment</label>
                    <select onchange="updateCanvasElementAlignment(this.value)">
                        <option value="left" selected>Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                    </select>
                </div>
            </div>
        `;
    } else {
        // Image elements: show position and dimensions
        content.innerHTML = `
            <div class="property-row">
                <div class="property-group">
                    <label>Position X</label>
                    <input type="number" value="${parseInt(element.style.left)}" onchange="updateCanvasElementPositionX(this.value)">
                </div>
                <div class="property-group">
                    <label>Position Y</label>
                    <input type="number" value="${parseInt(element.style.top)}" onchange="updateCanvasElementPositionY(this.value)">
                </div>
            </div>
            
            <div class="property-row">
                <div class="property-group">
                    <label>Width</label>
                    <input type="number" value="${element.offsetWidth}" onchange="updateCanvasElementWidth(this.value)">
                </div>
                <div class="property-group">
                    <label>Height</label>
                    <input type="number" value="${element.offsetHeight}" onchange="updateCanvasElementHeight(this.value)">
                </div>
            </div>
        `;
    }
}

// Helper function to convert RGB to HEX
function rgbToHex(rgb) {
    // If already hex, return it
    if (rgb.startsWith('#')) return rgb;
    
    // Handle rgb() format
    if (rgb.startsWith('rgb')) {
        const values = rgb.match(/\d+/g);
        if (values && values.length >= 3) {
            const r = parseInt(values[0]).toString(16).padStart(2, '0');
            const g = parseInt(values[1]).toString(16).padStart(2, '0');
            const b = parseInt(values[2]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }
    }
    
    // Default to black
    return '#000000';
}

// Update font family
function updateCanvasElementFont(value) {
    if (selectedCanvasElement) {
        const contentEl = selectedCanvasElement.querySelector('.canvas-text-element, .canvas-heading-element');
        if (contentEl) {
            contentEl.style.fontFamily = value;
        }
    }
}

// Update color
function updateCanvasElementColor(value) {
    if (selectedCanvasElement) {
        const contentEl = selectedCanvasElement.querySelector('.canvas-text-element, .canvas-heading-element');
        if (contentEl) {
            contentEl.style.color = value;
        }
    }
}

// Toggle bold
function toggleCanvasElementBold() {
    if (selectedCanvasElement) {
        const contentEl = selectedCanvasElement.querySelector('.canvas-text-element, .canvas-heading-element');
        if (contentEl) {
            const isBold = contentEl.style.fontWeight === 'bold';
            contentEl.style.fontWeight = isBold ? 'normal' : 'bold';
            showCanvasElementProperties(selectedCanvasElement);
        }
    }
}

// Toggle italic
function toggleCanvasElementItalic() {
    if (selectedCanvasElement) {
        const contentEl = selectedCanvasElement.querySelector('.canvas-text-element, .canvas-heading-element');
        if (contentEl) {
            const isItalic = contentEl.style.fontStyle === 'italic';
            contentEl.style.fontStyle = isItalic ? 'normal' : 'italic';
            showCanvasElementProperties(selectedCanvasElement);
        }
    }
}

// Toggle underline
function toggleCanvasElementUnderline() {
    if (selectedCanvasElement) {
        const contentEl = selectedCanvasElement.querySelector('.canvas-text-element, .canvas-heading-element');
        if (contentEl) {
            const isUnderline = contentEl.style.textDecoration === 'underline';
            contentEl.style.textDecoration = isUnderline ? 'none' : 'underline';
            showCanvasElementProperties(selectedCanvasElement);
        }
    }
}

// Property update functions
function updateCanvasElementPositionX(value) {
    if (selectedCanvasElement) {
        selectedCanvasElement.style.left = value + 'px';
    }
}

function updateCanvasElementPositionY(value) {
    if (selectedCanvasElement) {
        selectedCanvasElement.style.top = value + 'px';
    }
}

function updateCanvasElementWidth(value) {
    if (selectedCanvasElement) {
        selectedCanvasElement.style.width = value + 'px';
    }
}

function updateCanvasElementHeight(value) {
    if (selectedCanvasElement) {
        selectedCanvasElement.style.height = value + 'px';
    }
}

function updateCanvasElementFontSize(value) {
    if (selectedCanvasElement) {
        const contentEl = selectedCanvasElement.querySelector('.canvas-text-element, .canvas-heading-element');
        if (contentEl) contentEl.style.fontSize = value;
    }
}

function updateCanvasElementAlignment(value) {
    if (selectedCanvasElement) {
        const contentEl = selectedCanvasElement.querySelector('.canvas-text-element, .canvas-heading-element');
        if (contentEl) contentEl.style.textAlign = value;
    }
}

// Edit and delete functions
function editCanvasElement(id) {
    const element = document.querySelector(`[data-id="${id}"]`);
    if (element) {
        const textEl = element.querySelector('[contenteditable]');
        if (textEl) {
            textEl.focus();
        }
    }
}

function deleteCanvasElement(id) {
    console.log('🗑️ Deleting element:', id);
    const element = document.querySelector(`[data-id="${id}"]`);
    
    if (element) {
        element.remove();
        
        const canvas = document.getElementById('customPageCanvas');
        
        // Deselect if this was the selected element
        if (selectedCanvasElement === element) {
            deselectAllCanvasElements();
        }
        
        console.log('✅ Element deleted');
    } else {
        console.error('❌ Element not found:', id);
    }
}

// New function to setup upload handlers for canvas images
function setupCanvasImageUploadHandlers(element, uploadId) {
    const cameraBtn = document.getElementById(`cameraBtn_${uploadId}`);
    const dropZone = document.getElementById(`dropZone_${uploadId}`);
    const fileInput = document.getElementById(`fileInput_${uploadId}`);

    if (!cameraBtn || !dropZone || !fileInput) {
        console.error('Canvas image upload elements not found');
        return;
    }

    // Browse button click
    cameraBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        handleCanvasImageFileSelect(e, element);
    });

    // Drop zone click
    dropZone.addEventListener('click', (e) => {
        e.stopPropagation();
        dropZone.focus();
    });

    // Paste event
    dropZone.addEventListener('paste', (e) => {
        handleCanvasImagePaste(e, element);
    });

    // Drag and drop events
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#007bff';
        dropZone.style.backgroundColor = '#f0f8ff';
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.stopPropagation();
        dropZone.style.borderColor = '#ccc';
        dropZone.style.backgroundColor = 'white';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#ccc';
        dropZone.style.backgroundColor = 'white';
        
        const files = Array.from(e.dataTransfer.files);
        processCanvasImageFiles(files, element);
    });

    // Focus/blur styling
    dropZone.addEventListener('focus', () => {
        dropZone.style.borderColor = '#007bff';
        dropZone.style.boxShadow = '0 0 0 2px rgba(0, 123, 255, 0.25)';
    });

    dropZone.addEventListener('blur', () => {
        dropZone.style.borderColor = '#ccc';
        dropZone.style.boxShadow = 'none';
    });
}

// Handle file selection
function handleCanvasImageFileSelect(event, element) {
    const files = Array.from(event.target.files);
    processCanvasImageFiles(files, element);
}

// Handle paste
function handleCanvasImagePaste(event, element) {
    const items = event.clipboardData.items;
    const files = [];
    
    for (let item of items) {
        if (item.type.indexOf('image') !== -1) {
            const file = item.getAsFile();
            if (file) files.push(file);
        }
    }
    
    if (files.length > 0) {
        event.preventDefault();
        processCanvasImageFiles(files, element);
        
        // Visual feedback
        const dropZone = element.querySelector('.canvas-drop-zone');
        if (dropZone) {
            dropZone.value = '';
            dropZone.placeholder = 'Image pasted successfully!';
            setTimeout(() => {
                dropZone.placeholder = 'Drop or paste here (Ctrl+V)';
            }, 2000);
        }
    }
}

// Process uploaded files
async function processCanvasImageFiles(files, element) {
    const validFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (validFiles.length === 0) {
        alert('Please select a valid image file.');
        return;
    }

    // Take only the first file (single image only)
    const file = validFiles[0];

    // Show loading state
    const dropZone = element.querySelector('.canvas-drop-zone');
    if (dropZone) {
        dropZone.placeholder = 'Uploading...';
    }

    try {
        // 1) Upload to S3
        const uploaded = await uploadImageToS3(file);

        // 2) Get signed URL for preview
        const signResp = await fetch(
            `https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/images/sign?key=${encodeURIComponent(uploaded.key)}`,
            { headers: getAuthHeaders() }
        );
        if (!signResp.ok) throw new Error('Failed to sign image preview URL');
        const { url } = await signResp.json();

        // 3) Replace upload UI with image
        element.innerHTML = `<img data-s3-key="${uploaded.key}" src="${url}" alt="Custom page image">`;
        
        console.log('✅ Canvas image uploaded successfully');
        
    } catch (err) {
        console.error('Error uploading canvas image:', err);
        alert('Error uploading image: ' + err.message);
        
        // Reset on error
        if (dropZone) {
            dropZone.placeholder = 'Drop or paste here (Ctrl+V)';
        }
    }
}

// Save custom page
async function saveCustomPage() {
    const title = document.getElementById('customPageTitle').value.trim();
    if (!title) { alert('Please enter a page title'); return; }

    const canvas = document.getElementById('customPageCanvas');
    currentCustomPage.canvasWidth  = canvas.clientWidth;   // 816
    currentCustomPage.canvasHeight = canvas.clientHeight;  // 1056

    const elements = [];
    canvas.querySelectorAll('.canvas-element').forEach(el => {
        const elementData = {
            id: el.dataset.id,
            type: el.dataset.type,
            position: {
                x: parseInt(el.style.left),
                y: parseInt(el.style.top)
            },
            size: {
                width: el.offsetWidth,
                height: el.offsetHeight
            }
        };

if (el.dataset.type === 'heading' || el.dataset.type === 'text') {
    const contentEl = el.querySelector('[contenteditable]');
    elementData.content = contentEl.innerHTML;
    elementData.fontSize = contentEl.style.fontSize || '16px';
    elementData.textAlign = contentEl.style.textAlign || 'left';
    elementData.fontFamily = contentEl.style.fontFamily || 'Arial, sans-serif';
    elementData.color = contentEl.style.color || '#000000';
    elementData.fontWeight = contentEl.style.fontWeight || 'normal';
    elementData.fontStyle = contentEl.style.fontStyle || 'normal';
    elementData.textDecoration = contentEl.style.textDecoration || 'none';
} else if (el.dataset.type === 'image') {
            const img = el.querySelector('img');
            if (img) {
            // 1) prefer the DOM's key
            let imageKey = img.dataset.s3Key || null;

            // 2) if missing, try to recover from the existing element model
            if (!imageKey && currentCustomPage?.elements?.length) {
                const old = currentCustomPage.elements.find(e => e.id == el.dataset.id);
                if (old?.imageKey) imageKey = old.imageKey;
            }
                elementData.imageKey = imageKey;                 // <-- critical for Lambda
                elementData.imageUrl = img.src || null;          // preview only
                }
        }

        elements.push(elementData);
    });

    // NEW: store canvas dimensions so backend can scale precisely to PDF
    currentCustomPage.canvasWidth  = canvas.clientWidth;
    currentCustomPage.canvasHeight = canvas.clientHeight;
    
    currentCustomPage.title = title;
    currentCustomPage.elements = elements;
    currentCustomPage.lastModified = new Date().toISOString();
    
    console.log('🔍 DEBUG: Updated currentCustomPage:', currentCustomPage);
    
    // Add or update in array
    if (isEditingCustomPage) {
        console.log('🔍 DEBUG: EDITING mode');
        const index = projectCustomPages.findIndex(p => p.id === currentCustomPage.id);
        console.log('🔍 DEBUG: Found at index:', index);
        if (index !== -1) {
            projectCustomPages[index] = currentCustomPage;
        } else {
            console.log('⚠️ WARNING: Editing but page not found, adding instead');
            projectCustomPages.push(currentCustomPage);
        }
    } else {
        console.log('🔍 DEBUG: NEW page mode - pushing to array');
        projectCustomPages.push(currentCustomPage);
    }
    
    console.log('🔍 DEBUG: projectCustomPages AFTER adding:', projectCustomPages.length, projectCustomPages);
    console.log('📄 Saving custom pages:', projectCustomPages.length);
    
    try {
        // Save to database
        await saveCustomPagesToDatabase();
        
        console.log('🔍 DEBUG: After saveCustomPagesToDatabase, projectCustomPages:', projectCustomPages.length);
        
        // Return to list view
        cancelCustomPageEdit();
        
        console.log('🔍 DEBUG: After cancelCustomPageEdit, projectCustomPages:', projectCustomPages.length);
        
        // Render the updated list
        renderCustomPagesList();
        
        alert('Custom page saved successfully!');
    } catch (error) {
        console.error('Error saving custom page:', error);
        alert('Error saving custom page: ' + error.message);
    }
}

// Cancel custom page edit
function cancelCustomPageEdit() {
    const builder = document.getElementById('customPageBuilder');
    const list = document.getElementById('customPagesList');
    
    builder.style.display = 'none';
    list.style.display = 'block';
    
    clearCustomPageCanvas();
    currentCustomPage = null;
    isEditingCustomPage = false;
}

// Show an empty-state hint when the canvas has no elements
function showCanvasEmptyState(msg = 'Drag and drop elements to customize this page') {
    const canvas = document.getElementById('customPageCanvas');
    if (!canvas || canvas.querySelector('.canvas-empty-state')) return;

    const hint = document.createElement('div');
    hint.className = 'canvas-empty-state';
    hint.innerHTML = `
    <i class="bi bi-hand-index-thumb"></i>
    <div>${msg}</div>
    `;
    canvas.appendChild(hint);
}

// Clear canvas
function clearCustomPageCanvas() {
    const canvas = document.getElementById('customPageCanvas');
    canvas.innerHTML = '';
    customPageElementCounter = 0;
    showCanvasEmptyState(); // <-- add the hint on a fresh/blank canvas
}

async function signImageForPreview(key) {
const resp = await fetch(
    `https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/images/sign?key=${encodeURIComponent(key)}`,
    { headers: getAuthHeaders() }
);
if (!resp.ok) return null;
const { url } = await resp.json();
return url || null;
}

// Load custom page elements onto canvas
async function loadCustomPageElements(elements) {
  const canvas = document.getElementById('customPageCanvas');
  clearCustomPageCanvas();            // clears and adds the empty-state

  // If nothing to load, leave the empty-state visible
  if (!elements || elements.length === 0) {
    showCanvasEmptyState();           
    return;
  }

  // We have elements: remove the empty-state before rendering
  const emptyState = canvas.querySelector('.canvas-empty-state');
  if (emptyState) emptyState.remove();

  for (const elementData of elements) {
    customPageElementCounter++;

    const element = document.createElement('div');
    element.className = 'canvas-element';
    element.dataset.id = customPageElementCounter;
    element.dataset.type = elementData.type;

    element.style.left   = elementData.position.x + 'px';
    element.style.top    = elementData.position.y + 'px';
    element.style.width  = elementData.size.width + 'px';
    element.style.height = elementData.size.height + 'px';

    const controls = `
      <div class="drag-handle"><i class="fas fa-grip-vertical"></i></div>
      <div class="element-controls">
        <button class="control-btn" onclick="editCanvasElement(${customPageElementCounter})">Edit</button>
        <button class="control-btn delete" onclick="deleteCanvasElement(${customPageElementCounter})">Delete</button>
      </div>
      <div class="resize-handles">
        <div class="resize-handle corner top-left"></div>
        <div class="resize-handle corner top-right"></div>
        <div class="resize-handle corner bottom-left"></div>
        <div class="resize-handle corner bottom-right"></div>
        <div class="resize-handle edge top"></div>
        <div class="resize-handle edge bottom"></div>
        <div class="resize-handle edge left"></div>
        <div class="resize-handle edge right"></div>
      </div>
    `;

if (elementData.type === 'heading') {
  element.innerHTML = controls +
    `<div class="canvas-heading-element" contenteditable="true"
         style="font-size:${elementData.fontSize || '16px'}; text-align:${elementData.textAlign || 'left'}; font-family:${elementData.fontFamily || 'Arial, sans-serif'}; color:${elementData.color || '#000000'}; font-weight:${elementData.fontWeight || 'normal'}; font-style:${elementData.fontStyle || 'normal'}; text-decoration:${elementData.textDecoration || 'none'}">
      ${elementData.content}
     </div>`;
} else if (elementData.type === 'text') {
  element.innerHTML = controls +
    `<div class="canvas-text-element" contenteditable="true"
         style="font-size:${elementData.fontSize || '16px'}; text-align:${elementData.textAlign || 'left'}; font-family:${elementData.fontFamily || 'Arial, sans-serif'}; color:${elementData.color || '#000000'}; font-weight:${elementData.fontWeight || 'normal'}; font-style:${elementData.fontStyle || 'normal'}; text-decoration:${elementData.textDecoration || 'none'}">
      ${elementData.content}
     </div>`;
} else if (elementData.type === 'image') {
      const key = elementData.imageKey || null;
      let src = elementData.imageUrl || null;

      // Prefer stable S3 key; re-sign for fresh preview
      if (key) {
        const fresh = await signImageForPreview(key).catch(() => null);
        if (fresh) src = fresh;
      }

      // If we have an image, render it; otherwise show upload UI immediately
      if (key && src) {
        const keyAttr = `data-s3-key="${key}"`;
        element.innerHTML = controls +
          `<div class="canvas-image-element">
             <img ${keyAttr} src="${src}" alt="Custom page image">
           </div>`;
      } else {
        // No image yet, show the upload UI immediately
        const uploadId = 'canvasImageUpload_' + customPageElementCounter;
        element.innerHTML = controls +
          `<div class="canvas-image-element">
              <div class="canvas-image-upload-container">
                  <div class="upload-controls" style="display: flex; gap: 10px; margin-bottom: 10px;">
                      <button type="button" class="canvas-camera-btn" id="cameraBtn_${uploadId}" 
                              style="display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
                          <i class="fas fa-camera"></i>
                          Browse
                      </button>
                      
                      <input 
                          class="canvas-drop-zone" 
                          id="dropZone_${uploadId}" 
                          placeholder="Drop or paste here (Ctrl+V)"
                          readonly
                          tabindex="0"
                          style="flex: 1; padding: 10px; border: 2px dashed #ccc; border-radius: 4px; background: white; cursor: pointer; font-size: 14px;">
                  </div>
                  
                  <input type="file" id="fileInput_${uploadId}" accept="image/*" style="display: none;">
              </div>
           </div>`;
        
        // Setup upload handlers
        setTimeout(() => {
            const imageElement = element.querySelector('.canvas-image-element');
            if (imageElement) {
                setupCanvasImageUploadHandlers(imageElement, uploadId);
            }
        }, 0);
      }
    }

    element.addEventListener('click', (e) => {
    if (!e.target.closest('.element-controls') &&
        !e.target.closest('.drag-handle')) {
        selectCanvasElement(element);
    }
    });

    setupCanvasElementDragging(element);
    setupCanvasElementResizing(element);

    canvas.appendChild(element);
  }
}

// Render custom pages list
function renderCustomPagesList() {
    const container = document.getElementById('customPagesList');
    
    console.log('🎨 Rendering custom pages list. Count:', projectCustomPages.length);
    
    if (!container) {
        console.error('❌ customPagesList container not found!');
        return;
    }
    
    if (!projectCustomPages || projectCustomPages.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #6c757d; padding: 60px 20px; background: white; border-radius: 8px;">
                <i class="fas fa-file-alt" style="font-size: 64px; color: #dee2e6; margin-bottom: 20px; display: block;"></i>
                <p style="font-size: 16px;">No custom pages yet. Click "Add Custom Page" to create one.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = projectCustomPages.map(page => `
        <div class="custom-page-card">
            <div>
                <h3>${page.title}</h3>
                <p>${page.elements.length} element${page.elements.length !== 1 ? 's' : ''} • Last modified: ${new Date(page.lastModified).toLocaleDateString()}</p>
            </div>
            <div class="custom-page-actions">
                <button class="button primary" onclick="editCustomPage('${page.id}')">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="button secondary" onclick="deleteCustomPage('${page.id}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    `).join('');
    
    console.log('✅ Rendered', projectCustomPages.length, 'custom pages');
}

// Edit custom page
function editCustomPage(pageId) {
    const page = projectCustomPages.find(p => p.id == pageId);
    if (page) {
        showCustomPageBuilder(page);
    }
}

// Delete custom page
async function deleteCustomPage(pageId) {
    if (!confirm('Are you sure you want to delete this custom page?')) {
        return;
    }
    
    projectCustomPages = projectCustomPages.filter(p => p.id != pageId);
    await saveCustomPagesToDatabase();
    renderCustomPagesList();
}

// Save custom pages to database
async function saveCustomPagesToDatabase() {
    if (!currentProjectId) {
        console.error('No project ID found');
        return;
    }
    
    try {
        const response = await fetch('https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects', {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id: currentProjectId,
                customPages: projectCustomPages
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // Update local project data
        if (window.projectData) {
            window.projectData.customPages = [...projectCustomPages];
        }

        console.log('✅ Custom pages saved to database');
    } catch (error) {
        console.error('❌ Error saving custom pages:', error);
        throw error;
    }
}

// Load custom pages from project
function loadCustomPagesFromProject(project) {
    console.log('📥 Loading custom pages from project...');
    
    if (project && project.customPages && Array.isArray(project.customPages)) {
        // Filter out any invalid/corrupted data
        projectCustomPages = project.customPages.filter(page => {
            const isValid = page && 
                typeof page === 'object' && 
                page.id && 
                page.title && 
                Array.isArray(page.elements) &&
                !page.isTrusted; // Filter out PointerEvents
            
            if (!isValid) {
                console.warn('⚠️ Filtering out invalid page:', page);
            }
            return isValid;
        });
        
        console.log(`✅ Loaded ${projectCustomPages.length} valid custom pages`);
    } else {
        projectCustomPages = [];
        console.log('ℹ️ No custom pages found in project');
    }
    
    renderCustomPagesList();
}

// Make functions globally available
window.showCustomPageBuilder = showCustomPageBuilder;
window.saveCustomPage = saveCustomPage;
window.cancelCustomPageEdit = cancelCustomPageEdit;
window.editCanvasElement = editCanvasElement;
window.deleteCanvasElement = deleteCanvasElement;
window.updateCanvasElementPositionX = updateCanvasElementPositionX;
window.updateCanvasElementPositionY = updateCanvasElementPositionY;
window.updateCanvasElementWidth = updateCanvasElementWidth;
window.updateCanvasElementHeight = updateCanvasElementHeight;
window.updateCanvasElementFontSize = updateCanvasElementFontSize;
window.updateCanvasElementAlignment = updateCanvasElementAlignment;
window.editCustomPage = editCustomPage;
window.deleteCustomPage = deleteCustomPage;
window.initializeCustomPages = initializeCustomPages;
window.loadCustomPagesFromProject = loadCustomPagesFromProject;
window.initializeCustomPagesWithData = initializeCustomPagesWithData;
window.updateCanvasElementTypeface = updateCanvasElementTypeface;
window.updateCanvasElementColor = updateCanvasElementColor;
window.updateCanvasElementFont = updateCanvasElementFont;
window.updateCanvasElementColor = updateCanvasElementColor;
window.toggleCanvasElementBold = toggleCanvasElementBold;
window.toggleCanvasElementItalic = toggleCanvasElementItalic;
window.toggleCanvasElementUnderline = toggleCanvasElementUnderline;