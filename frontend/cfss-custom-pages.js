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
    console.log('[INIT] Initializing Custom Pages system...');
    setBlankCFSSBackground();
    
    const addButton = document.getElementById('addCustomPageButton');
    if (addButton) {
        // FIXED: Don't pass the event as an argument
        addButton.addEventListener('click', () => showCustomPageBuilder());
    }
    
    setupCustomPagePalette();
    
    console.log('[SUCCESS] Custom Pages initialized');
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

    console.log('[CANVAS] Canvas fitted to template (no stretch)', {
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
    setupCanvasResizeHandler();
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
            console.log('[WARNING] Drop already in progress, ignoring duplicate');
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
    
    // Keyboard delete for selected element
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCanvasElement) {
            // Don't delete if user is editing text
            if (document.activeElement.closest('[contenteditable]')) return;
            e.preventDefault();
            const id = selectedCanvasElement.dataset.id;
            deleteCanvasElement(id);
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
    let height = 60;
    
    if (type === 'image') {
        width = 400;
        height = 300;
    } else if (type === 'heading') {
        height = 72;
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
    
    // Set default font size to 24px
    const headingEl = element.querySelector('.canvas-heading-element');
    headingEl.style.fontSize = '24px';
    
    // Clear default text on first focus
    headingEl.addEventListener('focus', function clearDefaultOnce() {
        if (this.getAttribute('data-default') === 'true') {
            this.textContent = '';
            this.removeAttribute('data-default');
        }
        headingEl.removeEventListener('focus', clearDefaultOnce);
    });
}    else if (type === 'text') {
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
    console.log('[DRAG SETUP] Setting up dragging for element:', element.dataset.id, element.dataset.type);
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;
    
    function startDrag(e) {
        console.log('[DRAG] startDrag called, target:', e.target.className);
        if (e.target.closest('.element-controls') || 
            e.target.closest('.resize-handle') ||
            e.target.closest('[contenteditable]')) {
            console.log('[DRAG] Ignoring drag - clicked on controls/resize/editable');
            return;
        }
        
        isDragging = true;
        element.classList.add('dragging');
        
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = element.offsetLeft;
        initialTop = element.offsetTop;
        
        console.log('[DRAG] Drag started - startX:', startX, 'startY:', startY, 'initialLeft:', initialLeft, 'initialTop:', initialTop);
        
        e.preventDefault();
    }
    
    function onDrag(e) {
        if (!isDragging) return;
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        let newLeft = initialLeft + deltaX;
        let newTop = initialTop + deltaY;
        
        const canvas = element.closest('.custom-page-canvas');
        console.log('[DRAG] onDrag - canvas found:', !!canvas, canvas?.id);
        if (canvas) {
            newLeft = Math.max(0, Math.min(newLeft, canvas.offsetWidth - element.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, canvas.offsetHeight - element.offsetHeight));
        }
        
        element.style.left = newLeft + 'px';
        element.style.top = newTop + 'px';
        console.log('[DRAG] Moving to:', newLeft, newTop);
    }
    
    function stopDrag() {
        if (isDragging) {
            console.log('[DRAG] Drag stopped');
            isDragging = false;
            element.classList.remove('dragging');
        }
    }
    
    element.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    console.log('[DRAG SETUP] Event listeners attached for element:', element.dataset.id);
}

// Setup element resizing
function setupCanvasElementResizing(element) {
    const resizeHandles = element.querySelectorAll('.resize-handle');
    const isImage = element.dataset.type === 'image';
    
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
            
            // Get aspect ratio for images
            const aspectRatio = isImage ? parseFloat(element.dataset.aspectRatio) || (startWidth / startHeight) : null;
            
            element.classList.add('resizing');
            
            function onMouseMove(e) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                
                let newWidth = startWidth;
                let newHeight = startHeight;
                let newLeft = startLeft;
                let newTop = startTop;
                
                if (isImage && aspectRatio) {
                    // For images, maintain aspect ratio
                    // Use the dimension that changed more as the driver
                    const widthChange = Math.abs(deltaX);
                    const heightChange = Math.abs(deltaY);
                    
                    if (direction.includes('e') || direction.includes('w')) {
                        // Horizontal resize - width drives height
                        if (direction.includes('e')) {
                            newWidth = Math.max(100, startWidth + deltaX);
                        } else {
                            newWidth = Math.max(100, startWidth - deltaX);
                            if (newWidth > 100) {
                                newLeft = startLeft + deltaX;
                            }
                        }
                        newHeight = newWidth / aspectRatio;
                    } else if (direction.includes('n') || direction.includes('s')) {
                        // Vertical resize - height drives width
                        if (direction.includes('s')) {
                            newHeight = Math.max(50, startHeight + deltaY);
                        } else {
                            newHeight = Math.max(50, startHeight - deltaY);
                            if (newHeight > 50) {
                                newTop = startTop + deltaY;
                            }
                        }
                        newWidth = newHeight * aspectRatio;
                    } else {
                        // Corner resize - use the larger change
                        if (widthChange > heightChange) {
                            // Width-driven
                            if (direction.includes('e')) {
                                newWidth = Math.max(100, startWidth + deltaX);
                            } else {
                                newWidth = Math.max(100, startWidth - deltaX);
                                if (newWidth > 100) {
                                    newLeft = startLeft + deltaX;
                                }
                            }
                            newHeight = newWidth / aspectRatio;
                            
                            // Adjust top for north corners
                            if (direction.includes('n')) {
                                newTop = startTop + startHeight - newHeight;
                            }
                        } else {
                            // Height-driven
                            if (direction.includes('s')) {
                                newHeight = Math.max(50, startHeight + deltaY);
                            } else {
                                newHeight = Math.max(50, startHeight - deltaY);
                                if (newHeight > 50) {
                                    newTop = startTop + deltaY;
                                }
                            }
                            newWidth = newHeight * aspectRatio;
                            
                            // Adjust left for west corners
                            if (direction.includes('w')) {
                                newLeft = startLeft + startWidth - newWidth;
                            }
                        }
                    }
                } else {
                    // Non-image elements - free resize (existing logic)
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

// In cfss-custom-pages.js, find the showCanvasElementProperties function
// Replace the section where it shows text/heading properties with this updated version:

function showCanvasElementProperties(element) {
    const content = document.getElementById('customPageProperties');
    const hasText = element.querySelector('.canvas-text-element, .canvas-heading-element');
    
    if (hasText) {
        // Text/Heading elements: show font, typeface styling, and color
        const textEl = element.querySelector('.canvas-text-element, .canvas-heading-element');
        const currentFont = textEl.style.fontFamily || 'Arial, sans-serif';
        const currentColor = textEl.style.color || '#000000';
        const currentFontSize = textEl.style.fontSize || '16px';  // Get current font size
        const currentAlignment = textEl.style.textAlign || 'left';  // Get current alignment
        const isBold = textEl.style.fontWeight === 'bold';
        const isItalic = textEl.style.fontStyle === 'italic';
        const isUnderline = textEl.style.textDecoration === 'underline';
        
        content.innerHTML = `
            <div class="property-row" style="display: flex; gap: 10px; margin-bottom: 12px;">
                <div class="property-group" style="flex: 1;">
                    <label>Font</label>
                    <select onchange="updateCanvasElementFont(this.value)" style="width: 100%;">
                        <option value="Arial, sans-serif" ${currentFont.includes('Arial') || currentFont.includes('Helvetica') ? 'selected' : ''}>Arial</option>
                        <option value="'Times New Roman', serif" ${currentFont.includes('Times') ? 'selected' : ''}>Times New Roman</option>
                        <option value="'Courier New', monospace" ${currentFont.includes('Courier') ? 'selected' : ''}>Courier New</option>
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
                        <option value="12px" ${currentFontSize === '12px' ? 'selected' : ''}>12px</option>
                        <option value="14px" ${currentFontSize === '14px' ? 'selected' : ''}>14px</option>
                        <option value="16px" ${currentFontSize === '16px' ? 'selected' : ''}>16px</option>
                        <option value="18px" ${currentFontSize === '18px' ? 'selected' : ''}>18px</option>
                        <option value="20px" ${currentFontSize === '20px' ? 'selected' : ''}>20px</option>
                        <option value="24px" ${currentFontSize === '24px' ? 'selected' : ''}>24px</option>
                        <option value="28px" ${currentFontSize === '28px' ? 'selected' : ''}>28px</option>
                        <option value="32px" ${currentFontSize === '32px' ? 'selected' : ''}>32px</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>Alignment</label>
                    <select onchange="updateCanvasElementAlignment(this.value)">
                        <option value="left" ${currentAlignment === 'left' ? 'selected' : ''}>Left</option>
                        <option value="center" ${currentAlignment === 'center' ? 'selected' : ''}>Center</option>
                        <option value="right" ${currentAlignment === 'right' ? 'selected' : ''}>Right</option>
                    </select>
                </div>
            </div>
        `;
    } else {
        // Image elements: show position, dimensions, and locked aspect ratio
        const aspectRatio = parseFloat(element.dataset.aspectRatio);
        const ratioText = aspectRatio ? ` (Aspect ratio locked: ${aspectRatio.toFixed(2)}:1)` : '';
        
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
            
            <div style="margin-top: 8px; padding: 8px; background: #f8f9fa; border-radius: 4px; font-size: 12px; color: #6c757d;">
                <i class="fas fa-lock"></i> ${ratioText || 'Aspect ratio will be preserved'}
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
        const isImage = selectedCanvasElement.dataset.type === 'image';
        const aspectRatio = parseFloat(selectedCanvasElement.dataset.aspectRatio);
        
        selectedCanvasElement.style.width = value + 'px';
        
        if (isImage && aspectRatio) {
            // Maintain aspect ratio
            const newHeight = value / aspectRatio;
            selectedCanvasElement.style.height = newHeight + 'px';
            // Refresh properties panel to show updated height
            showCanvasElementProperties(selectedCanvasElement);
        }
    }
}

function updateCanvasElementHeight(value) {
    if (selectedCanvasElement) {
        const isImage = selectedCanvasElement.dataset.type === 'image';
        const aspectRatio = parseFloat(selectedCanvasElement.dataset.aspectRatio);
        
        selectedCanvasElement.style.height = value + 'px';
        
        if (isImage && aspectRatio) {
            // Maintain aspect ratio
            const newWidth = value * aspectRatio;
            selectedCanvasElement.style.width = newWidth + 'px';
            // Refresh properties panel to show updated width
            showCanvasElementProperties(selectedCanvasElement);
        }
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
    console.log('[DELETE] Deleting element:', id);
    const element = document.querySelector(`[data-id="${id}"]`);
    
    if (element) {
        element.remove();
        
        const canvas = document.getElementById('customPageCanvas');
        
        // Deselect if this was the selected element
        if (selectedCanvasElement === element) {
            deselectAllCanvasElements();
        }
        
        console.log('[SUCCESS] Element deleted');
    } else {
        console.error('[ERROR] Element not found:', id);
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

function storeImageAspectRatio(element, img) {
    const aspectRatio = img.naturalWidth / img.naturalHeight;
    element.dataset.aspectRatio = aspectRatio;
    console.log(`[ASPECT] Stored aspect ratio: ${aspectRatio} (${img.naturalWidth}x${img.naturalHeight})`);
}

// Process uploaded files
async function processCanvasImageFiles(files, element) {
    const validFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (validFiles.length === 0) {
        alert('Please select a valid image file.');
        return;
    }

    const file = validFiles[0];

    const dropZone = element.querySelector('.canvas-drop-zone');
    if (dropZone) {
        dropZone.placeholder = 'Uploading...';
    }

    try {
        // Upload to S3
        const uploaded = await uploadImageToS3(file);

        // Get signed URL for preview
        const signResp = await fetch(
            `https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/images/sign?key=${encodeURIComponent(uploaded.key)}`,
            { headers: getAuthHeaders() }
        );
        if (!signResp.ok) throw new Error('Failed to sign image preview URL');
        const { url } = await signResp.json();

        // Create image and wait for it to load to get dimensions
        const img = new Image();
        img.onload = function() {
            // Get the parent canvas element
            const canvasElement = element.closest('.canvas-element');
            if (canvasElement) {
                // Store aspect ratio
                storeImageAspectRatio(canvasElement, img);
                
                // Resize container to match image aspect ratio
                // Keep the current width, adjust height to maintain aspect ratio
                const currentWidth = canvasElement.offsetWidth;
                const aspectRatio = img.naturalWidth / img.naturalHeight;
                const newHeight = currentWidth / aspectRatio;
                
                canvasElement.style.height = newHeight + 'px';
                
                console.log(`[RESIZE] Adjusted container: ${currentWidth}x${newHeight} (AR: ${aspectRatio.toFixed(2)})`);
            }
        };
        img.src = url;

        // Replace upload UI with image
        element.innerHTML = `<img data-s3-key="${uploaded.key}" src="${url}" alt="Custom page image">`;
        
        console.log('[SUCCESS] Canvas image uploaded successfully');
        
    } catch (err) {
        console.error('Error uploading canvas image:', err);
        alert('Error uploading image: ' + err.message);
        
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
    
    // Use different defaults for heading vs text
    const defaultFontSize = el.dataset.type === 'heading' ? '24px' : '16px';
    
    elementData.fontSize = contentEl.style.fontSize || defaultFontSize;
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
    
    console.log('Updated currentCustomPage:', currentCustomPage);
    
    // Add or update in array
    if (isEditingCustomPage) {
        console.log('EDITING mode');
        const index = projectCustomPages.findIndex(p => p.id === currentCustomPage.id);
        console.log('Found at index:', index);
        if (index !== -1) {
            projectCustomPages[index] = currentCustomPage;
        } else {
            console.log('WARNING: Editing but page not found, adding instead');
            projectCustomPages.push(currentCustomPage);
        }
    } else {
        console.log('DEBUG: NEW page mode - pushing to array');
        projectCustomPages.push(currentCustomPage);
    }
    
    console.log('DEBUG: projectCustomPages AFTER adding:', projectCustomPages.length, projectCustomPages);
    console.log('[SAVE] Saving custom pages:', projectCustomPages.length);
    
    try {
        // Save to database
        await saveCustomPagesToDatabase();
        
        console.log('[DEBUG] After saveCustomPagesToDatabase, projectCustomPages:', projectCustomPages.length);
        
        // Return to list view
        cancelCustomPageEdit();
        
        console.log('[DEBUG] After cancelCustomPageEdit, projectCustomPages:', projectCustomPages.length);
        
        // Render the updated list
        renderCustomPagesList();
        updateCustomPagesSummary();
        
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
  canvas.innerHTML = '';

  if (!elements || elements.length === 0) return;

  // Calculate scale factors based on saved canvas size vs current size
  const savedWidth = currentCustomPage.canvasWidth || 816;
  const savedHeight = currentCustomPage.canvasHeight || 1056;
  const currentWidth = canvas.clientWidth;
  const currentHeight = canvas.clientHeight;
  
  const scaleX = currentWidth / savedWidth;
  const scaleY = currentHeight / savedHeight;
  
  console.log('[SCALE] Canvas scaling:', {
    saved: { w: savedWidth, h: savedHeight },
    current: { w: currentWidth, h: currentHeight },
    scale: { x: scaleX, y: scaleY }
  });

  for (const elementData of elements) {
    customPageElementCounter++;

    const element = document.createElement('div');
    element.className = 'canvas-element';
    element.dataset.id = customPageElementCounter;
    element.dataset.type = elementData.type;

    // Apply scaling to position and size
    const scaledX = Math.round(elementData.position.x * scaleX);
    const scaledY = Math.round(elementData.position.y * scaleY);
    const scaledWidth = Math.round(elementData.size.width * scaleX);
    const scaledHeight = Math.round(elementData.size.height * scaleY);

    element.style.left = scaledX + 'px';
    element.style.top = scaledY + 'px';
    element.style.width = scaledWidth + 'px';
    element.style.height = scaledHeight + 'px';

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
      element.innerHTML = controls + `<div class="canvas-heading-element" contenteditable="true">${elementData.content}</div>`;
      
      const headingEl = element.querySelector('.canvas-heading-element');
      
      // Scale font size
      const originalFontSize = parseFloat(elementData.fontSize) || 24;
      const scaledFontSize = Math.round(originalFontSize * ((scaleX + scaleY) / 2));
      
      headingEl.style.fontSize = scaledFontSize + 'px';
      headingEl.style.textAlign = elementData.textAlign || 'left';
      headingEl.style.fontFamily = elementData.fontFamily || 'Arial, sans-serif';
      headingEl.style.color = elementData.color || '#000000';
      headingEl.style.fontWeight = elementData.fontWeight || 'normal';
      headingEl.style.fontStyle = elementData.fontStyle || 'normal';
      headingEl.style.textDecoration = elementData.textDecoration || 'none';
      
    } else if (elementData.type === 'text') {
      element.innerHTML = controls + `<div class="canvas-text-element" contenteditable="true">${elementData.content}</div>`;
      
      const textEl = element.querySelector('.canvas-text-element');
      
      // Scale font size
      const originalFontSize = parseFloat(elementData.fontSize) || 16;
      const scaledFontSize = Math.round(originalFontSize * ((scaleX + scaleY) / 2));
      
      textEl.style.fontSize = scaledFontSize + 'px';
      textEl.style.textAlign = elementData.textAlign || 'left';
      textEl.style.fontFamily = elementData.fontFamily || 'Arial, sans-serif';
      textEl.style.color = elementData.color || '#000000';
      textEl.style.fontWeight = elementData.fontWeight || 'normal';
      textEl.style.fontStyle = elementData.fontStyle || 'normal';
      textEl.style.textDecoration = elementData.textDecoration || 'none';
      
    } else if (elementData.type === 'image') {
      const key = elementData.imageKey || null;
      let src = elementData.imageUrl || null;

      if (key) {
        const fresh = await signImageForPreview(key).catch(() => null);
        if (fresh) src = fresh;
      }

      if (key && src) {
        const keyAttr = `data-s3-key="${key}"`;
        element.innerHTML = controls +
          `<div class="canvas-image-element">
             <img ${keyAttr} src="${src}" alt="Custom page image">
           </div>`;
        
        const img = element.querySelector('img');
        if (img) {
            img.onload = function() {
                storeImageAspectRatio(element, img);
            };
            if (img.complete) {
                storeImageAspectRatio(element, img);
            }
        }
      } else {
        const uploadId = 'canvasImageUpload_' + customPageElementCounter;
        element.innerHTML = controls +
          `<div class="canvas-image-element">
              <div class="canvas-image-upload-container">
                  <div class="upload-controls" style="display: flex; gap: 10px; margin-bottom: 10px;">
                      <button type="button" class="canvas-camera-btn" id="cameraBtn_${uploadId}">
                          <i class="fas fa-camera"></i> Browse
                      </button>
                      <input class="canvas-drop-zone" id="dropZone_${uploadId}" 
                          placeholder="Drop or paste here (Ctrl+V)" readonly tabindex="0">
                  </div>
                  <input type="file" id="fileInput_${uploadId}" accept="image/*" style="display: none;">
              </div>
           </div>`;
        
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

let resizeTimeout;
function setupCanvasResizeHandler() {
    window.addEventListener('resize', () => {
        // Debounce resize events
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const canvas = document.getElementById('customPageCanvas');
            if (!canvas || !currentCustomPage || !currentCustomPage.elements) return;
            
            // Reload elements with new scaling
            loadCustomPageElements(currentCustomPage.elements);
        }, 250);
    });
}

// Render custom pages list
function renderCustomPagesList() {
    const container = document.getElementById('customPagesList');
    
    console.log('[RENDER] Rendering custom pages list. Count:', projectCustomPages.length);
    
    if (!container) {
        console.error('[ERROR] customPagesList container not found!');
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
    
    console.log('[SUCCESS] Rendered', projectCustomPages.length, 'custom pages');
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
    updateCustomPagesSummary();
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

        console.log('[SUCCESS] Custom pages saved to database');
    } catch (error) {
        console.error('[ERROR] Error saving custom pages:', error);
        throw error;
    }
}

// Load custom pages from project
function loadCustomPagesFromProject(project) {
    console.log('[LOAD] Loading custom pages from project...');
    
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
                console.warn('[WARNING] Filtering out invalid page:', page);
            }
            return isValid;
        });
        
        console.log(`[SUCCESS] Loaded ${projectCustomPages.length} valid custom pages`);
    } else {
        projectCustomPages = [];
        console.log('[INFO] No custom pages found in project');
    }
    
    renderCustomPagesList();
    updateCustomPagesSummary();
}

// ==============================================
// SOFFITES CUSTOM PAGES FUNCTIONALITY (Multiple Pages)
// ==============================================

let soffitesCustomPages = [];
let currentSoffitesPage = null;
let isEditingSoffitesPage = false;
let soffitesPageElementCounter = 0;
let selectedSoffitesCanvasElement = null;
let isSoffitesDropping = false;
let soffitesResizeTimeout;

// Initialize Soffites Page system
function initializeSoffitesPage() {
    console.log('[INIT] Initializing Soffites Pages system...');
    setupSoffitesPagePalette();
    console.log('[SUCCESS] Soffites Pages initialized');
}

// Toggle between Soffites List and Soffites Pages views
function toggleSoffitesView() {
    const listView = document.getElementById('soffitesListView');
    const pagesView = document.getElementById('soffitesPagesView');
    
    if (listView.style.display === 'none') {
        // Show Soffites List
        listView.style.display = 'block';
        pagesView.style.display = 'none';
    } else {
        // Show Soffites Pages
        listView.style.display = 'none';
        pagesView.style.display = 'block';
        renderSoffitesPagesList();
    }
}

// Render soffites pages list
function renderSoffitesPagesList() {
    const container = document.getElementById('soffitesPagesList');
    if (!container) return;
    
    if (!soffitesCustomPages || soffitesCustomPages.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #6c757d;">
                <i class="fas fa-file-alt" style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;"></i>
                <p>No soffites pages yet. Click "Add Soffites Page" to create one.</p>
            </div>
        `;
        updateSoffitesPagesSummary();
        return;
    }
    
    container.innerHTML = soffitesCustomPages.map(page => `
        <div class="custom-page-card" data-page-id="${page.id}">
            <div>
                <h3>${page.title || 'Untitled Page'}</h3>
                <p>${page.elements?.length || 0} element${page.elements?.length !== 1 ? 's' : ''} • Last modified: ${page.lastModified ? new Date(page.lastModified).toLocaleDateString() : 'N/A'}</p>
            </div>
            <div class="custom-page-actions">
                <button class="button primary" onclick="editSoffitesPage('${page.id}')">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="button secondary" onclick="deleteSoffitesPage('${page.id}')" style="background: #6c757d;">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    `).join('');
    
    updateSoffitesPagesSummary();
}

// Update soffites pages summary
function updateSoffitesPagesSummary() {
    const el = document.getElementById('soffitesPagesSelectionSummary');
    if (!el) return;
    
    const count = soffitesCustomPages?.length || 0;
    el.innerHTML = `<i class="fas fa-file-alt"></i> ${count} soffites page${count !== 1 ? 's' : ''} added`;
}

// Edit existing soffites page
function editSoffitesPage(pageId) {
    const page = soffitesCustomPages.find(p => p.id === pageId || p.id === parseInt(pageId));
    if (!page) {
        console.error('[ERROR] Soffites page not found:', pageId);
        return;
    }
    
    currentSoffitesPage = page;
    isEditingSoffitesPage = true;
    showSoffitesPageBuilder(page);
}

// Delete soffites page
async function deleteSoffitesPage(pageId) {
    if (!confirm('Are you sure you want to delete this soffites page?')) return;
    
    const index = soffitesCustomPages.findIndex(p => p.id === pageId || p.id === parseInt(pageId));
    if (index === -1) {
        console.error('[ERROR] Soffites page not found:', pageId);
        return;
    }
    
    soffitesCustomPages.splice(index, 1);
    
    try {
        await saveSoffitesPagesToDatabase();
        renderSoffitesPagesList();
        console.log('[SUCCESS] Soffites page deleted');
    } catch (error) {
        console.error('[ERROR] Failed to delete soffites page:', error);
        alert('Error deleting soffites page: ' + error.message);
    }
}

// Setup palette drag events for soffites
function setupSoffitesPagePalette() {
    document.querySelectorAll('.soffites-palette-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('soffitesElementType', item.dataset.type);
            e.dataTransfer.effectAllowed = 'copy';
        });
    });
}

// Set blank CFSS background for soffites canvas
async function setSoffitesBlankCFSSBackground() {
    try {
        const key = 'report/blank-cfss-page.png';
        const signResp = await fetch(
            `https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/templates/sign?key=${encodeURIComponent(key)}`,
            { headers: getAuthHeaders() }
        );
        if (!signResp.ok) throw new Error(`Signer failed: HTTP ${signResp.status}`);
        const { url } = await signResp.json();

        const canvasEl = document.getElementById('soffitesPageCanvas');
        if (!canvasEl) return;

        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error('PNG failed to load'));
            i.src = url;
        });

        canvasEl.style.backgroundImage = `url("${url}")`;
        canvasEl.style.backgroundRepeat = 'no-repeat';
        canvasEl.style.backgroundPosition = 'left top';
        canvasEl.style.backgroundSize = 'contain';
        canvasEl.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
        canvasEl.style.width = '100%';
        canvasEl.style.maxWidth = `${img.naturalWidth}px`;
        canvasEl.style.height = 'auto';
        canvasEl.style.margin = '0';
        canvasEl.style.boxShadow = 'none';
        canvasEl.style.borderRadius = '0';
        canvasEl.style.backgroundColor = 'transparent';

        console.log('[SOFFITES CANVAS] Canvas fitted to template');
    } catch (e) {
        console.warn('Could not set soffites blank CFSS background:', e);
    }
}

// Show soffites page builder
function showSoffitesPageBuilder(pageToEdit = null) {
    console.log('[SOFFITES BUILDER] Showing soffites page builder...');
    const builder = document.getElementById('soffitesPageBuilder');
    const listView = document.getElementById('soffitesListView');
    const pagesView = document.getElementById('soffitesPagesView');
    
    if (listView) listView.style.display = 'none';
    if (pagesView) pagesView.style.display = 'none';
    builder.style.display = 'block';
    
    setSoffitesBlankCFSSBackground();
    
    // IMPORTANT: Setup canvas events FIRST before loading any elements
    setupSoffitesCanvasEvents();
    
    if (pageToEdit) {
        // Editing existing page
        console.log('[SOFFITES BUILDER] Editing existing page with', pageToEdit.elements?.length || 0, 'elements');
        isEditingSoffitesPage = true;
        currentSoffitesPage = pageToEdit;
        document.getElementById('soffitesPageTitle').value = pageToEdit.title || '';
        if (pageToEdit.elements && pageToEdit.elements.length > 0) {
            loadSoffitesPageElements(pageToEdit.elements);
        }
    } else {
        // Creating new page
        console.log('[SOFFITES BUILDER] Creating new page');
        isEditingSoffitesPage = false;
        currentSoffitesPage = {
            id: Date.now(),
            title: '',
            elements: [],
            createdAt: new Date().toISOString()
        };
        document.getElementById('soffitesPageTitle').value = '';
        clearSoffitesPageCanvas();
    }
    
    setupSoffitesCanvasResizeHandler();
}

// Setup canvas events for soffites page
function setupSoffitesCanvasEvents() {
    console.log('[SOFFITES CANVAS] Setting up canvas events...');
    const canvas = document.getElementById('soffitesPageCanvas');
    if (!canvas) {
        console.error('[SOFFITES CANVAS] Canvas not found!');
        return;
    }
    
    // Remove existing listeners by cloning
    const newCanvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(newCanvas, canvas);
    
    newCanvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        newCanvas.classList.add('drag-over');
    });
    
    newCanvas.addEventListener('dragleave', (e) => {
        if (e.target === newCanvas) {
            newCanvas.classList.remove('drag-over');
        }
    });
    
    newCanvas.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        newCanvas.classList.remove('drag-over');
        
        if (isSoffitesDropping) return;
        isSoffitesDropping = true;
        
        const type = e.dataTransfer.getData('soffitesElementType');
        if (type) {
            const canvasRect = newCanvas.getBoundingClientRect();
            const x = e.clientX - canvasRect.left;
            const y = e.clientY - canvasRect.top;
            createSoffitesCanvasElement(type, x, y);
        }
        
        setTimeout(() => { isSoffitesDropping = false; }, 100);
    });
    
    newCanvas.addEventListener('click', (e) => {
        if (e.target === newCanvas) {
            deselectAllSoffitesCanvasElements();
        }
    });
    
    // Keyboard delete for selected element
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSoffitesCanvasElement) {
            // Don't delete if user is editing text
            if (document.activeElement.closest('[contenteditable]')) return;
            e.preventDefault();
            const id = selectedSoffitesCanvasElement.dataset.id;
            deleteSoffitesCanvasElement(id);
        }
    });
}

// Create canvas element for soffites page
function createSoffitesCanvasElement(type, x, y) {
    soffitesPageElementCounter++;
    const canvas = document.getElementById('soffitesPageCanvas');
    const element = document.createElement('div');
    element.className = 'canvas-element';
    element.dataset.id = soffitesPageElementCounter;
    element.dataset.type = type;
    
    let width = 300;
    let height = 60;
    
    if (type === 'image') {
        width = 400;
        height = 300;
    } else if (type === 'heading') {
        height = 72;
    }
    
    element.style.left = x + 'px';
    element.style.top = y + 'px';
    element.style.width = width + 'px';
    element.style.height = height + 'px';
    
    const controls = `
        <div class="drag-handle"><i class="fas fa-grip-vertical"></i></div>
        <div class="element-controls">
            <button class="control-btn" onclick="editSoffitesCanvasElement(${soffitesPageElementCounter})">Edit</button>
            <button class="control-btn delete" onclick="deleteSoffitesCanvasElement(${soffitesPageElementCounter})">Delete</button>
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
        const headingEl = element.querySelector('.canvas-heading-element');
        headingEl.style.fontSize = '24px';
        headingEl.addEventListener('focus', function clearDefaultOnce() {
            if (this.getAttribute('data-default') === 'true') {
                this.textContent = '';
                this.removeAttribute('data-default');
            }
            headingEl.removeEventListener('focus', clearDefaultOnce);
        });
    } else if (type === 'text') {
        element.innerHTML = controls + '<div class="canvas-text-element" contenteditable="true" data-default="true">Click to edit text.</div>';
        const textEl = element.querySelector('.canvas-text-element');
        textEl.addEventListener('focus', function clearDefaultOnce() {
            if (this.getAttribute('data-default') === 'true') {
                this.textContent = '';
                this.removeAttribute('data-default');
            }
            textEl.removeEventListener('focus', clearDefaultOnce);
        });
    } else if (type === 'image') {
        const uploadId = 'soffitesCanvasImageUpload_' + soffitesPageElementCounter;
        element.innerHTML = controls + `
            <div class="canvas-image-element">
                <div class="canvas-image-upload-container">
                    <div class="upload-controls" style="display: flex; gap: 10px; margin-bottom: 10px;">
                        <button type="button" class="canvas-camera-btn" id="cameraBtn_${uploadId}" 
                                style="display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
                            <i class="fas fa-camera"></i> Browse
                        </button>
                        <input class="canvas-drop-zone" id="dropZone_${uploadId}" 
                            placeholder="Drop or paste here (Ctrl+V)" readonly tabindex="0"
                            style="flex: 1; padding: 10px; border: 2px dashed #ccc; border-radius: 4px; background: white; cursor: pointer; font-size: 14px;">
                    </div>
                    <input type="file" id="fileInput_${uploadId}" accept="image/*" style="display: none;">
                </div>
            </div>
        `;
        setTimeout(() => {
            const imageElement = element.querySelector('.canvas-image-element');
            if (imageElement) {
                setupCanvasImageUploadHandlers(imageElement, uploadId);
            }
        }, 0);
    }
    
    element.addEventListener('click', (e) => {
        if (!e.target.closest('.element-controls') && !e.target.closest('.drag-handle')) {
            selectSoffitesCanvasElement(element);
        }
    });
    
    setupCanvasElementDragging(element);
    setupCanvasElementResizing(element);
    
    canvas.appendChild(element);
    selectSoffitesCanvasElement(element);
}

function selectSoffitesCanvasElement(element) {
    deselectAllSoffitesCanvasElements();
    element.classList.add('selected');
    selectedSoffitesCanvasElement = element;
    showSoffitesElementProperties(element);
}

function deselectAllSoffitesCanvasElements() {
    document.querySelectorAll('#soffitesPageCanvas .canvas-element').forEach(el => {
        el.classList.remove('selected');
    });
    selectedSoffitesCanvasElement = null;
    clearSoffitesElementProperties();
}

function showSoffitesElementProperties(element) {
    const props = document.getElementById('soffitesPageProperties');
    if (!props) return;
    
    const type = element.dataset.type;
    const id = element.dataset.id;
    
    let html = `<div class="property-group">
        <label>Position</label>
        <div style="display: flex; gap: 10px;">
            <input type="number" value="${parseInt(element.style.left)}" 
                   onchange="updateSoffitesElementPositionX(${id}, this.value)" 
                   style="width: 70px; padding: 5px;">
            <input type="number" value="${parseInt(element.style.top)}" 
                   onchange="updateSoffitesElementPositionY(${id}, this.value)" 
                   style="width: 70px; padding: 5px;">
        </div>
    </div>
    <div class="property-group">
        <label>Size</label>
        <div style="display: flex; gap: 10px;">
            <input type="number" value="${element.offsetWidth}" 
                   onchange="updateSoffitesElementWidth(${id}, this.value)" 
                   style="width: 70px; padding: 5px;">
            <input type="number" value="${element.offsetHeight}" 
                   onchange="updateSoffitesElementHeight(${id}, this.value)" 
                   style="width: 70px; padding: 5px;">
        </div>
    </div>`;
    
    if (type === 'heading' || type === 'text') {
        const contentEl = element.querySelector('[contenteditable]');
        const fontSize = parseInt(contentEl?.style.fontSize) || (type === 'heading' ? 24 : 16);
        html += `<div class="property-group">
            <label>Font Size</label>
            <input type="number" value="${fontSize}" 
                   onchange="updateSoffitesElementFontSize(${id}, this.value)" 
                   style="width: 70px; padding: 5px;">
        </div>`;
    }
    
    props.innerHTML = html;
}

function clearSoffitesElementProperties() {
    const props = document.getElementById('soffitesPageProperties');
    if (props) {
        props.innerHTML = '<p style="color: #6c757d; font-size: 13px; text-align: center; padding: 20px 10px;">Select an element to edit its properties</p>';
    }
}

window.updateSoffitesElementPositionX = function(id, value) {
    const el = document.querySelector(`#soffitesPageCanvas .canvas-element[data-id="${id}"]`);
    if (el) el.style.left = value + 'px';
};

window.updateSoffitesElementPositionY = function(id, value) {
    const el = document.querySelector(`#soffitesPageCanvas .canvas-element[data-id="${id}"]`);
    if (el) el.style.top = value + 'px';
};

window.updateSoffitesElementWidth = function(id, value) {
    const el = document.querySelector(`#soffitesPageCanvas .canvas-element[data-id="${id}"]`);
    if (el) el.style.width = value + 'px';
};

window.updateSoffitesElementHeight = function(id, value) {
    const el = document.querySelector(`#soffitesPageCanvas .canvas-element[data-id="${id}"]`);
    if (el) el.style.height = value + 'px';
};

window.updateSoffitesElementFontSize = function(id, value) {
    const el = document.querySelector(`#soffitesPageCanvas .canvas-element[data-id="${id}"]`);
    if (el) {
        const contentEl = el.querySelector('[contenteditable]');
        if (contentEl) contentEl.style.fontSize = value + 'px';
    }
};

window.editSoffitesCanvasElement = function(id) {
    const el = document.querySelector(`#soffitesPageCanvas .canvas-element[data-id="${id}"]`);
    if (el) selectSoffitesCanvasElement(el);
};

window.deleteSoffitesCanvasElement = function(id) {
    const el = document.querySelector(`#soffitesPageCanvas .canvas-element[data-id="${id}"]`);
    if (el) {
        el.remove();
        deselectAllSoffitesCanvasElements();
    }
};

function clearSoffitesPageCanvas() {
    const canvas = document.getElementById('soffitesPageCanvas');
    if (canvas) {
        canvas.querySelectorAll('.canvas-element').forEach(el => el.remove());
    }
}

// Setup canvas resize handler for soffites
function setupSoffitesCanvasResizeHandler() {
    window.addEventListener('resize', () => {
        clearTimeout(soffitesResizeTimeout);
        soffitesResizeTimeout = setTimeout(() => {
            const canvas = document.getElementById('soffitesPageCanvas');
            if (!canvas || !currentSoffitesPage || !currentSoffitesPage.elements) return;
            
            // Reload elements with new scaling
            loadSoffitesPageElements(currentSoffitesPage.elements);
        }, 250);
    });
}

async function loadSoffitesPageElements(elements) {
    clearSoffitesPageCanvas();
    const canvas = document.getElementById('soffitesPageCanvas');
    if (!canvas || !elements) return;
    
    // Calculate scale factors based on saved canvas size vs current size
    const savedWidth = currentSoffitesPage?.canvasWidth || canvas.clientWidth;
    const savedHeight = currentSoffitesPage?.canvasHeight || canvas.clientHeight;
    const currentWidth = canvas.clientWidth;
    const currentHeight = canvas.clientHeight;
    
    // Use uniform scaling to preserve aspect ratios
    const scaleX = currentWidth / savedWidth;
    const scaleY = currentHeight / savedHeight;
    const uniformScale = Math.min(scaleX, scaleY);
    
    for (const elData of elements) {
        soffitesPageElementCounter++;
        const element = document.createElement('div');
        element.className = 'canvas-element';
        element.dataset.id = soffitesPageElementCounter;
        element.dataset.type = elData.type;
        
        // Apply uniform scaling to position and size to preserve aspect ratios
        const scaledX = Math.round(elData.position.x * uniformScale);
        const scaledY = Math.round(elData.position.y * uniformScale);
        const scaledWidth = Math.round(elData.size.width * uniformScale);
        const scaledHeight = Math.round(elData.size.height * uniformScale);
        
        element.style.left = scaledX + 'px';
        element.style.top = scaledY + 'px';
        element.style.width = scaledWidth + 'px';
        element.style.height = scaledHeight + 'px';
        
        const controls = `
            <div class="drag-handle"><i class="fas fa-grip-vertical"></i></div>
            <div class="element-controls">
                <button class="control-btn" onclick="editSoffitesCanvasElement(${soffitesPageElementCounter})">Edit</button>
                <button class="control-btn delete" onclick="deleteSoffitesCanvasElement(${soffitesPageElementCounter})">Delete</button>
            </div>
            <div class="resize-handles">
                <div class="resize-handle corner top-left"></div>
                <div class="resize-handle corner top-right"></div>
                <div class="resize-handle corner bottom-left"></div>
                <div class="resize-handle corner bottom-right"></div>
            </div>
        `;
        
        if (elData.type === 'heading' || elData.type === 'text') {
            const className = elData.type === 'heading' ? 'canvas-heading-element' : 'canvas-text-element';
            element.innerHTML = controls + `<div class="${className}" contenteditable="true">${elData.content || ''}</div>`;
            const contentEl = element.querySelector('[contenteditable]');
            if (contentEl) {
                // Scale font size
                const originalFontSize = parseFloat(elData.fontSize) || (elData.type === 'heading' ? 24 : 16);
                const scaledFontSize = Math.round(originalFontSize * uniformScale);
                contentEl.style.fontSize = scaledFontSize + 'px';
                contentEl.style.textAlign = elData.textAlign || 'left';
                if (elData.fontFamily) contentEl.style.fontFamily = elData.fontFamily;
                if (elData.color) contentEl.style.color = elData.color;
                if (elData.fontWeight) contentEl.style.fontWeight = elData.fontWeight;
                if (elData.fontStyle) contentEl.style.fontStyle = elData.fontStyle;
                if (elData.textDecoration) contentEl.style.textDecoration = elData.textDecoration;
            }
        } else if (elData.type === 'image' && elData.imageKey) {
            const key = elData.imageKey;
            let src = elData.imageUrl || '';
            
            // Re-sign the image URL
            const fresh = await signImageForPreview(key).catch(() => null);
            if (fresh) src = fresh;
            
            element.innerHTML = controls + `
                <div class="canvas-image-element">
                    <img data-s3-key="${key}" src="${src}" alt="Custom page image">
                </div>
            `;
        }
        
        element.addEventListener('click', (e) => {
            if (!e.target.closest('.element-controls') && !e.target.closest('.drag-handle')) {
                selectSoffitesCanvasElement(element);
            }
        });
        
        setupCanvasElementDragging(element);
        setupCanvasElementResizing(element);
        
        canvas.appendChild(element);
    }
}

// Save soffites page
async function saveSoffitesPage() {
    const title = document.getElementById('soffitesPageTitle').value.trim();
    if (!title) { alert('Please enter a page title'); return; }

    const canvas = document.getElementById('soffitesPageCanvas');
    
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
            const defaultFontSize = el.dataset.type === 'heading' ? '24px' : '16px';
            elementData.fontSize = contentEl.style.fontSize || defaultFontSize;
            elementData.textAlign = contentEl.style.textAlign || 'left';
            elementData.fontFamily = contentEl.style.fontFamily || 'Arial, sans-serif';
            elementData.color = contentEl.style.color || '#000000';
            elementData.fontWeight = contentEl.style.fontWeight || 'normal';
            elementData.fontStyle = contentEl.style.fontStyle || 'normal';
            elementData.textDecoration = contentEl.style.textDecoration || 'none';
        } else if (el.dataset.type === 'image') {
            const img = el.querySelector('img');
            if (img) {
                elementData.imageKey = img.dataset.s3Key || null;
                elementData.imageUrl = img.src || null;
            }
        }

        elements.push(elementData);
    });

    // Update or create page
    currentSoffitesPage.title = title;
    currentSoffitesPage.elements = elements;
    currentSoffitesPage.canvasWidth = canvas.clientWidth;
    currentSoffitesPage.canvasHeight = canvas.clientHeight;
    currentSoffitesPage.lastModified = new Date().toISOString();

    if (isEditingSoffitesPage) {
        // Update existing page in array
        const index = soffitesCustomPages.findIndex(p => p.id === currentSoffitesPage.id);
        if (index !== -1) {
            soffitesCustomPages[index] = currentSoffitesPage;
        }
    } else {
        // Add new page to array
        soffitesCustomPages.push(currentSoffitesPage);
    }

    try {
        await saveSoffitesPagesToDatabase();
        cancelSoffitesPageEdit();
        alert('Soffites page saved successfully!');
    } catch (error) {
        console.error('Error saving soffites page:', error);
        alert('Error saving soffites page: ' + error.message);
    }
}

// Save soffites pages to database
async function saveSoffitesPagesToDatabase() {
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
                soffitesCustomPages: soffitesCustomPages
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        if (window.projectData) {
            window.projectData.soffitesCustomPages = soffitesCustomPages;
        }

        console.log('[SUCCESS] Soffites pages saved to database');
    } catch (error) {
        console.error('[ERROR] Error saving soffites pages:', error);
        throw error;
    }
}

// Cancel soffites page edit
function cancelSoffitesPageEdit() {
    const builder = document.getElementById('soffitesPageBuilder');
    const pagesView = document.getElementById('soffitesPagesView');
    
    builder.style.display = 'none';
    if (pagesView) pagesView.style.display = 'block';
    
    clearSoffitesPageCanvas();
    currentSoffitesPage = null;
    isEditingSoffitesPage = false;
    
    renderSoffitesPagesList();
}

// Load soffites pages from project
function loadSoffitesPageFromProject(project) {
    console.log('[LOAD] Loading soffites pages from project...');
    
    // Support both old single page format and new multi-page format
    if (project && project.soffitesCustomPages && Array.isArray(project.soffitesCustomPages)) {
        soffitesCustomPages = project.soffitesCustomPages;
        console.log('[SUCCESS] Loaded', soffitesCustomPages.length, 'soffites pages');
    } else if (project && project.soffitesCustomPage && typeof project.soffitesCustomPage === 'object') {
        // Migrate old single page to array format
        soffitesCustomPages = [project.soffitesCustomPage];
        console.log('[SUCCESS] Migrated single soffites page to array format');
    } else {
        soffitesCustomPages = [];
        console.log('[INFO] No soffites pages found in project');
    }
    
    updateSoffitesPagesSummary();
}

// Make soffites page functions globally available
window.saveSoffitesPage = saveSoffitesPage;
window.cancelSoffitesPageEdit = cancelSoffitesPageEdit;
window.initializeSoffitesPage = initializeSoffitesPage;
window.loadSoffitesPageFromProject = loadSoffitesPageFromProject;
window.showSoffitesPageBuilder = showSoffitesPageBuilder;
window.toggleSoffitesView = toggleSoffitesView;
window.editSoffitesPage = editSoffitesPage;
window.deleteSoffitesPage = deleteSoffitesPage;

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