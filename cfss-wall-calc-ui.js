// Exterior Wall Calculator UI Component - V2
// Uses colombageData for track pairings and auto-fill

/**
 * Initialize the exterior wall calculator
 * Call this in your main initialization function
 */
function initExteriorWallCalculator() {
    // Populate dropdowns
    populateStudDropdown();

    // Setup button handler
    setupWallCalcButton();

    // Setup form handlers
    setupWallCalcForm();
    
    // Setup auto-fill when stud is selected
    setupStudAutoFill();
}

/**
 * Populate stud selection dropdown using colombageData keys
 */
function populateStudDropdown() {
    const steelStudSelect = document.getElementById('wallSteelStud');
    if (!steelStudSelect) return;
    
    if (typeof colombageData === 'undefined') {
        console.error('colombageData not found - cannot populate stud dropdown');
        return;
    }

    // Get all stud designations from colombageData and sort them
    const studDesignations = Object.keys(colombageData).sort();
    
    studDesignations.forEach(stud => {
        const option = document.createElement('option');
        option.value = stud;
        option.textContent = stud;
        steelStudSelect.appendChild(option);
    });
    
    console.log(`Populated ${studDesignations.length} steel stud options`);
}

/**
 * Setup auto-fill for tracks when stud is selected
 */
function setupStudAutoFill() {
    const studSelect = document.getElementById('wallSteelStud');
    const bottomTrackInput = document.getElementById('wallBottomTrack');
    const deflectionTrackInput = document.getElementById('wallDeflectionTrack');
    
    if (!studSelect || !bottomTrackInput || !deflectionTrackInput) return;
    
    studSelect.addEventListener('change', function() {
        const selectedStud = this.value;
        
        if (!selectedStud || typeof colombageData === 'undefined') {
            bottomTrackInput.value = '';
            deflectionTrackInput.value = '';
            return;
        }
        
        const trackData = colombageData[selectedStud];
        if (trackData) {
            // Clear existing options (except the placeholder)
            bottomTrackInput.innerHTML = '<option value="">Select Bottom Track...</option>';
            deflectionTrackInput.innerHTML = '<option value="">Select Deflection Track...</option>';
            
            // Add and select bottom track option
            if (trackData.lisseInferieure) {
                const bottomOption = document.createElement('option');
                bottomOption.value = trackData.lisseInferieure;
                bottomOption.textContent = trackData.lisseInferieure;
                bottomOption.selected = true;
                bottomTrackInput.appendChild(bottomOption);
            }
            
            // Add and select deflection track option
            if (trackData.lisseSuperieur) {
                const deflectionOption = document.createElement('option');
                deflectionOption.value = trackData.lisseSuperieur;
                deflectionOption.textContent = trackData.lisseSuperieur;
                deflectionOption.selected = true;
                deflectionTrackInput.appendChild(deflectionOption);
            }
        }
    });
}

/**
 * Setup button click handler
 */
function setupWallCalcButton() {
    const button = document.getElementById('exteriorWallCalcButton');
    const form = document.getElementById('exteriorWallForm');
    
    if (!button || !form) return;

    button.addEventListener('click', function() {
        const isCurrentlyVisible = form.classList.contains('show');
        
        if (isCurrentlyVisible) {
            form.classList.remove('show');
            this.innerHTML = '<i class="fas fa-calculator"></i> Exterior Wall Calculation';
        } else {
            // Hide other forms (if you have a hideAllForms function)
            if (typeof hideAllForms === 'function') {
                hideAllForms();
            }
            form.classList.add('show');
            this.innerHTML = '<i class="fas fa-times"></i> Hide Form';
            
            // Clear previous results
            const resultsDiv = document.getElementById('wallCalcResults');
            if (resultsDiv) {
                resultsDiv.style.display = 'none';
            }
        }
    });
}

/**
 * Setup form submission handler
 */
function setupWallCalcForm() {
    const form = document.getElementById('exteriorWallDataForm');
    const cancelButton = document.getElementById('cancelWallCalc');
    
    if (form) {
        form.addEventListener('submit', handleWallCalcSubmit);
    }
    
    if (cancelButton) {
        cancelButton.addEventListener('click', function() {
            const wallForm = document.getElementById('exteriorWallForm');
            if (wallForm) {
                wallForm.classList.remove('show');
            }
            const button = document.getElementById('exteriorWallCalcButton');
            if (button) {
                button.innerHTML = '<i class="fas fa-calculator"></i> Exterior Wall Calculation';
            }
        });
    }
}

/**
 * Handle form submission and display results
 */
function handleWallCalcSubmit(event) {
    event.preventDefault();
    
    // Gather input values
    const isDosADos = document.getElementById('wallDosADos').checked;
    const selectedStud = document.getElementById('wallSteelStud').value;
    const studForCalculation = isDosADos ? '2x' + selectedStud : selectedStud;

    const inputs = {
        windloadULS: parseFloat(document.getElementById('wallWindloadULS').value),
        spacing: parseFloat(document.getElementById('wallSpacing').value),
        bridgingSpacing: parseFloat(document.getElementById('wallBridging').value),
        deflectionLimit: parseInt(document.getElementById('wallDeflectionLimit').value),
        heightFt: parseFloat(document.getElementById('wallHeightFt').value),
        heightIn: parseFloat(document.getElementById('wallHeightIn').value),
        bearingLength: parseFloat(document.getElementById('wallBearingLength').value),
        fastenerType: document.getElementById('wallFastenerType').value,
        steelStud: studForCalculation,
        bottomTrack: document.getElementById('wallBottomTrack').value,
        deflectionTrack: document.getElementById('wallDeflectionTrack').value
    };

    // Validate inputs
    if (!inputs.steelStud) {
        alert('Please select a steel stud');
        return;
    }
    if (!inputs.bottomTrack) {
        alert('Please enter bottom track designation');
        return;
    }
    if (!inputs.deflectionTrack) {
        alert('Please enter deflection track designation');
        return;
    }

    // Perform calculation
    try {
        const results = calculateExteriorWall(inputs);
        
        if (results.error) {
            alert(results.error);
            return;
        }
        
        // Display results
        displayResults(results);
    } catch (error) {
        alert('Calculation error: ' + error.message);
        console.error(error);
    }
}

/**
 * Display calculation results in a table format
 */
function displayResults(results) {
    const resultsDiv = document.getElementById('wallCalcResultsContent');
    const resultsSection = document.getElementById('wallCalcResults');
    
    if (!resultsDiv || !resultsSection) return;
    
    const { checks, inputs } = results;
    
    const html = `
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                <thead>
                    <tr style="background-color: #f5f5f5;">
                        <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Component</th>
                        <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Designation</th>
                        <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Check</th>
                        <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Status</th>
                        <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Ratio (%)</th>
                    </tr>
                </thead>
                <tbody>
                    <!-- Steel Stud Checks -->
                    <tr>
                        <td rowspan="5" style="padding: 12px; border: 1px solid #ddd; font-weight: 600; vertical-align: middle;">Steel Stud</td>
                        <td rowspan="5" style="padding: 12px; border: 1px solid #ddd; font-weight: 600; vertical-align: middle;">${inputs.steelStud}</td>
                        <td style="padding: 12px; border: 1px solid #ddd;">M check</td>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: center; font-weight: 600; color: ${checks.moment.status === 'PASS' ? 'green' : 'red'};">${checks.moment.status}</td>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: center;">${checks.moment.ratio}%</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; border: 1px solid #ddd;">Shear check</td>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: center; font-weight: 600; color: ${checks.shear.status === 'PASS' ? 'green' : 'red'};">${checks.shear.status}</td>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: center;">${checks.shear.ratio}%</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; border: 1px solid #ddd;">Combination</td>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: center; font-weight: 600; color: ${checks.combined.status === 'PASS' ? 'green' : 'red'};">${checks.combined.status}</td>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: center;">${checks.combined.ratio}%</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; border: 1px solid #ddd;">Deflection check</td>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: center; font-weight: 600; color: ${checks.deflection.status === 'PASS' ? 'green' : 'red'};">${checks.deflection.status}</td>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: center;">${checks.deflection.ratio}%</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; border: 1px solid #ddd;">Web crippling</td>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: center; font-weight: 600;">${checks.webCrippling.stiffener} STIFFENER</td>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: center;">${checks.webCrippling.ratio}%</td>
                    </tr>

                    <!-- Deflection Track -->
                    <tr>
                        <td style="padding: 12px; border: 1px solid #ddd; font-weight: 600;">Deflection track</td>
                        <td style="padding: 12px; border: 1px solid #ddd; font-weight: 600;">${inputs.deflectionTrack}</td>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: center;">-</td>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: center; font-weight: 600; color: ${checks.deflectionTrack.status === 'PASS' ? 'green' : 'red'};">${checks.deflectionTrack.status}</td>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: center;">${checks.deflectionTrack.ratio}%</td>
                    </tr>

                    <!-- Bottom Track -->
                    <tr>
                        <td style="padding: 12px; border: 1px solid #ddd; font-weight: 600;">Bottom track</td>
                        <td style="padding: 12px; border: 1px solid #ddd; font-weight: 600;">${inputs.bottomTrack}</td>
                        <td colspan="3" style="padding: 12px; border: 1px solid #ddd; text-align: center;">-</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Detailed Results -->
        <div style="margin-top: 30px; padding: 20px; background-color: #f9f9f9; border-radius: 4px;">
            <h4 style="margin-top: 0;">Detailed Results</h4>
            
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                <div>
                    <h5>Moment Check</h5>
                    <p>Required: ${checks.moment.required} kip·in<br>
                    Allowable: ${checks.moment.allowable} kip·in</p>
                </div>
                
                <div>
                    <h5>Shear Check</h5>
                    <p>Required: ${checks.shear.required} kip<br>
                    Allowable: ${checks.shear.allowable} kip</p>
                </div>
                
                <div>
                    <h5>Deflection Check</h5>
                    <p>Required: ${checks.deflection.required} in (${checks.deflection.requiredLimit})<br>
                    Allowable: ${checks.deflection.allowable} in (${checks.deflection.allowableLimit})</p>
                </div>
                
                <div>
                    <h5>Web Crippling</h5>
                    <p>Reaction: ${checks.webCrippling.reaction} lb<br>
                    Capacity: ${checks.webCrippling.capacity} lb</p>
                </div>
                
                <div>
                    <h5>Deflection Track</h5>
                    <p>Load: ${checks.deflectionTrack.load} lb<br>
                    Capacity: ${checks.deflectionTrack.capacity} lb</p>
                </div>
            </div>
        </div>
    `;
    
    resultsDiv.innerHTML = html;
    resultsSection.style.display = 'block';
    
    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}