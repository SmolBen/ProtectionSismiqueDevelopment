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

// Initialize Custom Pages system
function initializeCustomPages() {
    console.log('🎨 Initializing Custom Pages system...');
    
    const addButton = document.getElementById('addCustomPageButton');
    if (addButton) {
        addButton.addEventListener('click', showCustomPageBuilder);
    }
    
    setupCustomPagePalette();
    
    console.log('✅ Custom Pages initialized');
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
        canvas.classList.remove('drag-over');
        
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
        element.innerHTML = controls + '<div class="canvas-heading-element" contenteditable="true">New Heading</div>';
    } else if (type === 'text') {
        element.innerHTML = controls + '<div class="canvas-text-element" contenteditable="true">Click to edit text.</div>';
    } else if (type === 'image') {
        element.innerHTML = controls + '<div class="canvas-image-element" onclick="uploadCanvasImage(this)"><i class="fas fa-upload"></i><br>Click to upload image</div>';
    }
    
    element.addEventListener('click', (e) => {
        if (!e.target.closest('.element-controls') && 
            !e.target.closest('.drag-handle') &&
            !e.target.closest('[contenteditable]')) {
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

// Show element properties
function showCanvasElementProperties(element) {
    const content = document.getElementById('customPageProperties');
    const hasText = element.querySelector('.canvas-text-element, .canvas-heading-element');
    
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
            ${hasText ? `
            <div class="property-group">
                <label>Font Size</label>
                <select onchange="updateCanvasElementFontSize(this.value)">
                    <option value="14px">Small</option>
                    <option value="16px" selected>Medium</option>
                    <option value="20px">Large</option>
                    <option value="24px">X-Large</option>
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
            ` : ''}
        </div>
    `;
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
    const element = document.querySelector(`[data-id="${id}"]`);
    if (element && confirm('Delete this element?')) {
        element.remove();
        
        const canvas = document.getElementById('customPageCanvas');
        if (!canvas.querySelector('.canvas-element')) {
            canvas.innerHTML = '<div class="canvas-empty-state"><i class="fas fa-mouse-pointer"></i><p>Drag elements anywhere to build your custom page</p></div>';
        }
    }
}

// Upload image to canvas element
async function uploadCanvasImage(element) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            // Upload to S3 (uses the uploadImageToS3 function from main file)
            try {
                // Access currentProjectId from main file
                const imageUrl = await uploadImageToS3(file, currentProjectId);
                element.innerHTML = `<img src="${imageUrl}" alt="Custom page image">`;
            } catch (error) {
                console.error('Error uploading image:', error);
                alert('Error uploading image: ' + error.message);
            }
        }
    };
    
    input.click();
}

// Save custom page
async function saveCustomPage() {
    const title = document.getElementById('customPageTitle').value.trim();
    
    if (!title) {
        alert('Please enter a page title');
        return;
    }
    
    // Collect all elements from canvas
    const canvas = document.getElementById('customPageCanvas');
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
        
        // Get content based on type
        if (el.dataset.type === 'heading' || el.dataset.type === 'text') {
            const contentEl = el.querySelector('[contenteditable]');
            elementData.content = contentEl.innerHTML;
            elementData.fontSize = contentEl.style.fontSize || '16px';
            elementData.textAlign = contentEl.style.textAlign || 'left';
        } else if (el.dataset.type === 'image') {
            const img = el.querySelector('img');
            if (img) {
                elementData.imageUrl = img.src;
            }
        }
        
        elements.push(elementData);
    });
    
    currentCustomPage.title = title;
    currentCustomPage.elements = elements;
    currentCustomPage.lastModified = new Date().toISOString();
    
    // Add or update in array
    if (isEditingCustomPage) {
        const index = projectCustomPages.findIndex(p => p.id === currentCustomPage.id);
        if (index !== -1) {
            projectCustomPages[index] = currentCustomPage;
        }
    } else {
        projectCustomPages.push(currentCustomPage);
    }
    
    // Save to database
    await saveCustomPagesToDatabase();
    
    // Return to list view
    cancelCustomPageEdit();
    renderCustomPagesList();
    
    alert('Custom page saved successfully!');
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

// Clear canvas
function clearCustomPageCanvas() {
    const canvas = document.getElementById('customPageCanvas');
    canvas.innerHTML = '<div class="canvas-empty-state"><i class="fas fa-mouse-pointer"></i><p>Drag elements anywhere to build your custom page</p></div>';
    customPageElementCounter = 0;
}

// Load custom page elements onto canvas
function loadCustomPageElements(elements) {
    const canvas = document.getElementById('customPageCanvas');
    clearCustomPageCanvas();
    
    if (!elements || elements.length === 0) return;
    
    // Remove empty state
    const emptyState = canvas.querySelector('.canvas-empty-state');
    if (emptyState) emptyState.remove();
    
    elements.forEach(elementData => {
        customPageElementCounter++;
        const element = document.createElement('div');
        element.className = 'canvas-element';
        element.dataset.id = customPageElementCounter;
        element.dataset.type = elementData.type;
        
        element.style.left = elementData.position.x + 'px';
        element.style.top = elementData.position.y + 'px';
        element.style.width = elementData.size.width + 'px';
        element.style.height = elementData.size.height + 'px';
        
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
        
        if (elementData.type === 'heading') {
            element.innerHTML = controls + `<div class="canvas-heading-element" contenteditable="true" style="font-size: ${elementData.fontSize}; text-align: ${elementData.textAlign}">${elementData.content}</div>`;
        } else if (elementData.type === 'text') {
            element.innerHTML = controls + `<div class="canvas-text-element" contenteditable="true" style="font-size: ${elementData.fontSize}; text-align: ${elementData.textAlign}">${elementData.content}</div>`;
        } else if (elementData.type === 'image' && elementData.imageUrl) {
            element.innerHTML = controls + `<div class="canvas-image-element" onclick="uploadCanvasImage(this)"><img src="${elementData.imageUrl}"></div>`;
        }
        
        element.addEventListener('click', (e) => {
            if (!e.target.closest('.element-controls') && 
                !e.target.closest('.drag-handle') &&
                !e.target.closest('[contenteditable]')) {
                selectCanvasElement(element);
            }
        });
        
        setupCanvasElementDragging(element);
        setupCanvasElementResizing(element);
        
        canvas.appendChild(element);
    });
}

// Render custom pages list
function renderCustomPagesList() {
    const container = document.getElementById('customPagesList');
    
    if (projectCustomPages.length === 0) {
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
        await firebase.firestore().collection('projects').doc(currentProjectId).update({
            customPages: projectCustomPages,
            lastModified: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('Custom pages saved to database');
    } catch (error) {
        console.error('Error saving custom pages:', error);
        throw error;
    }
}

// Load custom pages from project
function loadCustomPagesFromProject() {
    // Access currentProject from main file
    if (currentProject && currentProject.customPages) {
        projectCustomPages = currentProject.customPages;
        renderCustomPagesList();
    } else {
        projectCustomPages = [];
        renderCustomPagesList();
    }
}

// Make functions globally available
window.showCustomPageBuilder = showCustomPageBuilder;
window.saveCustomPage = saveCustomPage;
window.cancelCustomPageEdit = cancelCustomPageEdit;
window.editCanvasElement = editCanvasElement;
window.deleteCanvasElement = deleteCanvasElement;
window.uploadCanvasImage = uploadCanvasImage;
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