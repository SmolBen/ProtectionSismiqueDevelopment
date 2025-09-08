
// === Lightbox: robust open/close (top of project-details.js) ===
window.openEquipLightbox = function (src) {
const box = document.getElementById('equipLightbox');
const img = document.getElementById('equipLightboxImg');

if (!box || !img) {
    console.warn('Lightbox elements not found');
    return;
}

// If the lightbox lives inside a scrollable container, move it to <body>
if (box.parentElement !== document.body) {
    document.body.appendChild(box);
}

img.src = src || '';
box.classList.add('open');
box.style.display = ''; // let CSS control display via the .open class

// Add escape-to-close once
document.addEventListener('keydown', window.escToClose);
setTimeout(() => {
    console.log('POST-toggle display:', getComputedStyle(box).display);
    console.log('Has .open:', box.classList.contains('open'));
}, 0);
};

window.closeEquipLightbox = function () {
const box = document.getElementById('equipLightbox');
const img = document.getElementById('equipLightboxImg');
if (!box || !img) return;
document.removeEventListener('keydown', window.escToClose);
box.classList.remove('open');
box.style.display = ''; // reset
img.src = '';
};

window.escToClose = function (e) {
if (e.key === 'Escape') window.closeEquipLightbox();
};

// Project Details Page JavaScript
let currentProjectId = null;
let projectEquipment = [];
// One-shot guard + debounced, silent persist for image cleanup
const staleThumbKeys = new Set();
const debounce = (fn, ms = 1500) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const debouncedPersistImagesCleanup = debounce(async () => {
try { await saveEquipmentToProject({ silent: true }); } catch {}
}, 2000);
let currentUser = null;
let isAdmin = false;
let projectData = null;

// Equipment options based on domain
const equipmentOptions = {
    'ventilation': ['Fan_1', 'Fan_2', 'VU_1', 'VU_2', 'VU_3', 'AHU_1', 'Pipe'],
    'plumbing': ['HUM_1', 'RF_1', 'TE_1', 'CE_1', 'CE_2', 'P_1', 'Pipe'],
    'electricity': ['Generator', 'Panel', 'Transformer', 'UPS', 'Controller', 'Battery', 'Pipe'],
    'sprinkler': ['Pipe'],
    'interior system': ['Pipe']
};

// Equipment-specific install methods mapping (Y = allowed, N = not allowed)
// Based on Excel: Fixed to slab | Fixed to Ceiling | Fixed to concrete wall | Fixed to Steel Structure | Fixed to Wooden sleeper
const equipmentInstallMethods = {
    'electricity': {
        'Generator': ['1', '3', '5'], // slab, structure, roof(wooden sleeper)
        'Transformer': ['1', '4', '2'], // slab, ceiling, wall(concrete wall)
        'Panel': ['2', '3'], // Add when Excel is updated
        'UPS': ['1', '3', '5'], // Add when Excel is updated
        'Controller': ['1', '3', '5'], // Add when Excel is updated
        'Battery': ['1', '3', '5'] // Add when Excel is updated
    }
    // Other domains (plumbing, ventilation, etc.) will be added as Excel is updated
};

const equipmentMappings = {
    'electricity': {
        domainCode: 'El',
        equipmentMap: {
            'Generator': 'GE',
            'Panel': 'PA', 
            'Transformer': 'TRA',
            'UPS': 'UPS',
            'Controller': 'CN',
            'Battery': 'BA',
            'Pipe': 'Pipe' // Special handling for pipes
        } 
    },
    'ventilation': {
        domainCode: 'Ve',
        equipmentMap: {
            'Fan_1': 'F1',
            'Fan_2': 'F2',
            'VU_1': 'VU1',
            'VU_2': 'VU2', 
            'VU_3': 'VU3',
            'AHU_1': 'AHU1',
            'Pipe': 'Pipe'
        }
    },
    'plumbing': {
        domainCode: 'Pl',
        equipmentMap: {
            'HUM_1': 'HUM1',
            'RF_1': 'RF1',
            'TE_1': 'TE1',
            'CE_1': 'CE1',
            'CE_2': 'CE2',
            'P_1': 'P1',
            'Pipe': 'Pipe'
        }
    },
    'sprinkler': {
        domainCode: 'Sp',
        equipmentMap: {
            'Pipe': 'Pipe'
        }
    },
    'interior system': {
        domainCode: 'In',
        equipmentMap: {
            'Pipe': 'Pipe'
        }
    }
};

const s3BaseUrl = 'https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com/';

// NBC Category data with Cp, Ar, Rp values
const nbcCategoryData = {
    '1': { Cp: 1.00, Ar: 1.00, Rp: 2.50, description: 'All exterior and interior walls except those in Category 2 or 3' },
    '2': { Cp: 1.00, Ar: 2.50, Rp: 2.50, description: 'Cantilever parapet and other cantilever walls except retaining walls' },
    '3': { Cp: 1.00, Ar: 2.50, Rp: 2.50, description: 'Exterior and interior ornamentations and appendages' },
    '5': { Cp: 1.00, Ar: 2.50, Rp: 2.50, description: 'Towers, chimneys, smokestacks and penthouses' },
    '6': { Cp: 1.00, Ar: 1.00, Rp: 2.50, description: 'Horizontally cantilevered floors, balconies, beams, etc.' },
    '7': { Cp: 1.00, Ar: 1.00, Rp: 2.50, description: 'Suspended ceilings, light fixtures and other attachments to ceilings' },
    '8': { Cp: 1.00, Ar: 1.00, Rp: 1.50, description: 'Masonry veneer connections' },
    '9': { Cp: 1.00, Ar: 1.00, Rp: 2.50, description: 'Access floors' },
    '10': { Cp: 1.00, Ar: 1.00, Rp: 2.50, description: 'Masonry or concrete fences more than 1.8 m tall' },
    '11-rigid': { Cp: 1.00, Ar: 1.00, Rp: 1.25, description: 'Machinery, fixtures, equipment and tanks (rigid and rigidly connected)' },
    '11-flexible': { Cp: 1.00, Ar: 2.50, Rp: 2.50, description: 'Machinery, fixtures, equipment and tanks (flexible or flexibly connected)' },
    '12-rigid': { Cp: 1.50, Ar: 1.00, Rp: 1.25, description: 'Machinery with toxic/explosive materials (rigid and rigidly connected)' },
    '12-flexible': { Cp: 1.50, Ar: 2.50, Rp: 2.50, description: 'Machinery with toxic/explosive materials (flexible or flexibly connected)' },
    '13': { Cp: 0.70, Ar: 1.00, Rp: 2.50, description: 'Flat bottom tanks attached directly to a floor at or below grade' },
    '14': { Cp: 1.00, Ar: 1.00, Rp: 2.50, description: 'Flat bottom tanks with toxic/explosive materials at or below grade' },
    '15': { Cp: 1.00, Ar: 1.00, Rp: 3.00, description: 'Pipes, ducts (including contents)' },
    '16': { Cp: 1.50, Ar: 1.00, Rp: 3.00, description: 'Pipes, ducts containing toxic or explosive materials' },
    '17': { Cp: 1.00, Ar: 2.50, Rp: 5.00, description: 'Electrical cable trays, bus ducts, conduits' },
    '18': { Cp: 1.00, Ar: 1.00, Rp: 2.50, description: 'Rigid components with ductile material and connections' },
    '19': { Cp: 1.00, Ar: 1.00, Rp: 1.00, description: 'Rigid components with non-ductile material or connections' },
    '20': { Cp: 1.00, Ar: 2.50, Rp: 2.50, description: 'Flexible components with ductile material and connections' },
    '21': { Cp: 1.00, Ar: 2.50, Rp: 1.00, description: 'Flexible components with non-ductile material or connections' },
    '22-machinery': { Cp: 1.00, Ar: 1.00, Rp: 1.25, description: 'Elevators and escalators (machinery and equipment)' },
    '22-rails': { Cp: 1.00, Ar: 1.00, Rp: 2.50, description: 'Elevators and escalators (elevator rails)' },
    '23': { Cp: 1.00, Ar: 2.50, Rp: 2.50, description: 'Floor-mounted steel pallet storage racks' },
    '24': { Cp: 1.50, Ar: 2.50, Rp: 2.50, description: 'Floor-mounted steel pallet storage racks with toxic/explosive materials' }
};

// Overturning calculation functions
function calculateOverturningForces(equipment, project) {
    // Get weight in the user's selected unit
    const weightValue = parseFloat(equipment.weight) || 0;
    const weightUnit = equipment.weightUnit || 'kg';
    
    // Convert to pounds if needed
    const weightLbs = weightUnit === 'lbs' ? weightValue : weightValue * 2.20462;
    
    // Get dimensions in inches
    const heightIn = parseFloat(equipment.height) || 0;
    const widthIn = parseFloat(equipment.width) || 0;
    const lengthIn = parseFloat(equipment.length) || 0;
    
    // Calculate h = 55% of equipment height (H dimension)
    const h = 0.55 * heightIn;
    
    // Get project's Sa(0.2) values
    const Sa_0_2 = parseFloat(project.maxSa0_2) || 0;
    
    // Calculate CFS using existing function
    const cfsResult = calculateCFS(project, equipment.level, equipment.totalLevels);
    const CFS = cfsResult.cfs;
    
    // Calculate forces:
    const Fph = CFS * weightLbs; // Horizontal seismic force
    const Fpv = 0.2 * Sa_0_2 * weightLbs; // Vertical seismic force
    
    // Get restraint configuration
    const N = parseInt(equipment.numberOfAnchors) || 4;
    const b1 = widthIn; // Distance between restraints along Y-Y
    const b2 = lengthIn; // Distance between restraints along X-X
    
    // Calculate moment of inertia values
    const Ixx = (N * (N + 2) * b1 * b1) / (12 * (N - 2));
    const Iyy = (N * b2 * b2) / 4;
    
    // Calculate worst angle theta
    const theta = Math.atan((Iyy * b1) / (Ixx * b2));
    
    // Calculate based on mounting type
    const mountingType = equipment.mountingType || 'no-isolators';
    
    let Pt, Pc, Ps; // Maximum tension, compression, and shear
    
    if (mountingType === 'no-isolators') {
        // No isolators (rigid equipment) - existing calculation
        const dmin = Math.min(heightIn, widthIn);
        const OTM = Fph * h; // Overturning Moment
        const RM = (weightLbs - Fpv) * (dmin / 2); // Resisting Moment
        const T = (OTM - RM) / dmin; // Total tension
        const V = Fph; // Total shear
        
        // Calculate bolt forces
        const Tbolt = T / (N / 2); // T / (n/2)
        const Vbolt = V / N; // V / n
        
        return {
            OTM: parseFloat(OTM.toFixed(2)),
            RM: parseFloat(RM.toFixed(2)),
            T: parseFloat(T.toFixed(2)),
            V: parseFloat(V.toFixed(2)),
            Tbolt: parseFloat(Tbolt.toFixed(2)),
            Vbolt: parseFloat(Vbolt.toFixed(2)),
            mountingType: 'no-isolators',
            formula: {
                Fph: parseFloat(Fph.toFixed(2)),
                Fpv: parseFloat(Fpv.toFixed(2)),
                weightLbs: parseFloat(weightLbs.toFixed(2)),
                weightValue,
                weightUnit,
                CFS,
                dmin,
                h: parseFloat(h.toFixed(2)),
                heightIn,
                numberOfAnchors: N
            }
        };
        
    } else if (mountingType === 'type-3-2') {
        // Type 3-2 vibration isolators (includes equipment weight)
        const term1_tension = (weightLbs - Fpv) / N;
        const term2 = (Fph * h * (b2 / 2) * Math.cos(theta)) / Iyy;
        const term3 = (Fph * h * (b1 / 2) * Math.sin(theta)) / Ixx;
        
        Pt = term1_tension - term2 - term3; // Maximum tension
        
        const term1_compression = (weightLbs + Fpv) / N;
        Pc = term1_compression + term2 + term3; // Maximum compression
        
        Ps = Fph / N; // Maximum shear
        
    } else if (['type-3-1', 'type-3-5a', 'type-3-5b', 'type-3-5c', 'type-3-5d', 'type-3-10', 'type-3-11'].includes(mountingType)) {
        // Type 3-1, 3-5A/B/C/D, 3-10, or 3-11 (does NOT include equipment weight)
        const term1_tension = -Fpv / N;
        const term2 = (Fph * h * (b2 / 2) * Math.cos(theta)) / Iyy;
        const term3 = (Fph * h * (b1 / 2) * Math.sin(theta)) / Ixx;
        
        Pt = term1_tension - term2 - term3; // Maximum tension
        
        const term1_compression = Fpv / N;
        Pc = term1_compression + term2 + term3; // Maximum compression
        
        Ps = Fph / N; // Maximum shear
        
    } else {
        return null; // Unknown mounting type
    }
    
    // Calculate bolt forces for vibration isolators
    const Tbolt = Pt / N; // Tension per bolt
    const Vbolt = Ps / N; // Shear per bolt
    
    return {
        Pt: parseFloat(Pt.toFixed(2)),
        Pc: parseFloat(Pc.toFixed(2)),
        Ps: parseFloat(Ps.toFixed(2)),
        Tbolt: parseFloat(Tbolt.toFixed(2)),
        Vbolt: parseFloat(Vbolt.toFixed(2)),
        mountingType: mountingType,
        formula: {
            Fph: parseFloat(Fph.toFixed(2)),
            Fpv: parseFloat(Fpv.toFixed(2)),
            weightLbs: parseFloat(weightLbs.toFixed(2)),
            weightValue,
            weightUnit,
            CFS,
            h: parseFloat(h.toFixed(2)),
            heightIn,
            widthIn,
            lengthIn,
            b1,
            b2,
            N,
            Ixx: parseFloat(Ixx.toFixed(2)),
            Iyy: parseFloat(Iyy.toFixed(2)),
            theta: parseFloat((theta * 180 / Math.PI).toFixed(2)) // Convert to degrees
        }
    };
}

function calculateASHRAEAnchorBolts(equipment, project) {
    const mountingType = equipment.mountingType || 'no-isolators';
    const n = parseInt(equipment.numberOfAnchors) || 4; // number of anchor bolts
    const N = parseInt(equipment.numberOfIsolators) || 4; // number of isolators/snubbers
    const B = parseFloat(equipment.isolatorWidth) || 0; // isolator width in inches
    const H = parseFloat(equipment.restraintHeight) || 0; // height to restraint in inches
    const a = parseFloat(equipment.edgeDistanceA) || 0; // edge distance a
    const b = parseFloat(equipment.edgeDistanceB) || 0; // edge distance b
    
    // Get existing force calculations
    const overturningResult = calculateOverturningForces(equipment, project);
    if (!overturningResult) return null;
    
    const Ps = overturningResult.formula?.Fph || 0; // Maximum shear force
    const Pt = overturningResult.Pt || 0; // Maximum tension for isolators
    const Tb = overturningResult.T || 0; // Total tension for rigid
    const Vb = overturningResult.V || 0; // Total shear for rigid
    const W = overturningResult.formula?.weightLbs || 0; // Equipment weight in lbs

    
    
    let Tbolt, Vbolt, formulaType;
    
    if (mountingType === 'no-isolators') {
        // A. Rigidly mounted equipment (ASHRAE 11-24, 11-25)
        Tbolt = Tb / (n / 2);
        Vbolt = Vb / n;
        formulaType = 'Rigidly Mounted';
        
    } else if (mountingType === 'type-3-1') {
        // B. Type 3-1 vibration isolators (ASHRAE 11-26, 11-27)
        Tbolt = Pt / n;
        Vbolt = Ps / n;
        formulaType = 'Type 3-1 Vibration Isolators';
        
    } else if (['type-3-2', 'type-3-5a'].includes(mountingType)) {
        // C. Type 3-2 or 3-5A vibration isolators (ASHRAE 11-28, 11-29) - TWO-BOLT arrangement
        if (B === 0) return null; // Need isolator width
        Tbolt = (Ps * H) / (n * (B / 2)) + (Ps / n);
        Vbolt = Ps / n;
        formulaType = mountingType === 'type-3-2' ? 'Type 3-2 Vibration Isolators' : 'Type 3-5A Vibration Isolators';
        
    } else if (['type-3-5b', 'type-3-5c', 'type-3-5d'].includes(mountingType)) {
    // D. Type 3-5B, 3-5C, or 3-5D vibration isolators (ASHRAE 11-30, 11-31) - FOUR-BOLT arrangement
        if (a === 0 || b === 0 || N === 0) return null; // Need edge distances and isolator count
        const denominator = (n / 2) * (a + b + (a * a) / (a + b));
        Tbolt = (Ps * H) / denominator + (Pt - W / N) / n;
        Vbolt = Ps / n;
        formulaType = `Type ${mountingType.toUpperCase().replace('TYPE-', '')} Vibration Isolators`;
        
    } else if (mountingType === 'type-3-10') {
        // E. Type 3-10A seismic snubbers (ASHRAE 11-32, 11-33)
        if (B === 0) return null; // Need snubber width
        Tbolt = (Ps * H + Pt * B) / (n * (B / 2));
        Vbolt = Ps / n;
        formulaType = 'Type 3-10 Seismic Snubbers';
        
    } else if (mountingType === 'type-3-11') {
        // F. Type 3-11 seismic snubbers (ASHRAE 11-34, 11-35)
        if (a === 0 || b === 0) return null; // Need edge distances
        const denominator = (n / 2) * (a + b + (a * a) / (a + b));
        Tbolt = (Ps * H) / denominator + (Pt / n);
        Vbolt = Ps / n;
        formulaType = 'Type 3-11 Seismic Snubbers';
        
    } else {
        return null; // Unknown mounting type
    }
    
    // Calculate concrete expansion anchor interaction formulas
    const concreteAnalysis = calculateConcreteExpansionAnchors(Tbolt, Vbolt);

    // Calculate minimum embedment depth
    const embedmentAnalysis = calculateMinimumEmbedment(equipment, Tbolt, Vbolt);
    
    return {
        Tbolt: parseFloat(Tbolt.toFixed(2)),
        Vbolt: parseFloat(Vbolt.toFixed(2)),
        formulaType,
        concreteAnalysis,
        embedmentAnalysis,
        parameters: {
            n, N, B, H, a, b, Ps, Pt, Tb, Vb, W
        }
    };
}

function calculateConcreteExpansionAnchors(Tbolt, Vbolt) {
    // For now using placeholder values as requested
    const Tallow = 1; // Allowable tension (placeholder)
    const Vallow = 1; // Allowable shear (placeholder)
    
    // Interaction Formula 1: (Tbolt/Tallow) + (Vbolt/Vallow) ≤ 1.0
    const formula1 = (Tbolt / Tallow) + (Vbolt / Vallow);
    const formula1Pass = formula1 <= 1.0;
    
    // Interaction Formula 2: (Tbolt/Tallow)^(5/3) + (Vbolt/Vallow)^(5/3) ≤ 1.0
    const formula2 = Math.pow(Tbolt / Tallow, 5/3) + Math.pow(Vbolt / Vallow, 5/3);
    const formula2Pass = formula2 <= 1.0;
    
    return {
        Tallow,
        Vallow,
        formula1: {
            value: parseFloat(formula1.toFixed(4)),
            pass: formula1Pass,
            limit: 1.0
        },
        formula2: {
            value: parseFloat(formula2.toFixed(4)),
            pass: formula2Pass,
            limit: 1.0
        },
        overallPass: formula1Pass && formula2Pass
    };
}

    // Table 19 - Concrete failure modes in cracked concrete (Tension values in lbs)
    const Table19_ConcreteFailure = {
        '1/4': {
            '1-1/2': { 2500: 300, 3000: 330, 4000: 380, 6000: 465 }
        },
        '3/8': {
            '1-1/2': { 2500: 1255, 3000: 1375, 4000: 1585, 6000: 1940 },
            '2': { 2500: 1930, 3000: 2115, 4000: 2440, 6000: 2990 },
            '2-1/2': { 2500: 2185, 3000: 2390, 4000: 2765, 6000: 3385 }
        },
        '1/2': {
            '2': { 2500: 1565, 3000: 1710, 4000: 1975, 6000: 2420 },
            '2-1/2': { 2500: 2700, 3000: 2955, 4000: 3415, 6000: 4180 },
            '3-1/4': { 2500: 3235, 3000: 3545, 4000: 4095, 6000: 5015 }
        },
        '5/8': {
            '2-3/4': { 2500: 3110, 3000: 3410, 4000: 3935, 6000: 4820 },
            '3-1/4': { 2500: 4000, 3000: 4380, 4000: 5060, 6000: 6195 },
            '4': { 2500: 4420, 3000: 4840, 4000: 5590, 6000: 6845 }
        },
        '3/4': {
            '3-1/4': { 2500: 4000, 3000: 4380, 4000: 5060, 6000: 6195 },
            '3-3/4': { 2500: 4955, 3000: 5430, 4000: 6270, 6000: 7680 },
            '4-3/4': { 2500: 5715, 3000: 6260, 4000: 7230, 6000: 8855 }
        },
        '1': {
            '4': { 2500: 6240, 3000: 6835, 4000: 7895, 6000: 9665 },
            '5-3/4': { 2500: 9410, 3000: 10310, 4000: 11905, 6000: 14580 }
        }
    };

    // Table 20 - Steel failure (Tensile and Seismic Shear values in lbs)
    const Table20_SteelFailure = {
        '1/4': {
            '1-1/2': { tensile: 2190, seismicShear: 720 }
        },
        '3/8': {
            '1-1/2': { tensile: 4635, seismicShear: 3000 },
            '2': { tensile: 4635, seismicShear: 3175 }
        },
        '1/2': {
            '2': { tensile: 8905, seismicShear: 5425 },
            '2-1/2': { tensile: 8905, seismicShear: 5425 },
            '3-1/4': { tensile: 8905, seismicShear: 5425 }
        },
        '5/8': {
            '2-3/4': { tensile: 14125, seismicShear: 8030 },
            '3-1/4': { tensile: 14125, seismicShear: 8030 },
            '4': { tensile: 14125, seismicShear: 8030 }
        },
        '3/4': {
            '3-1/4': { tensile: 18035, seismicShear: 8755 },
            '3-3/4': { tensile: 18035, seismicShear: 8755 },
            '4-3/4': { tensile: 18035, seismicShear: 8755 }
        },
        '1': {
            '4': { tensile: 35215, seismicShear: 8755 },
            '5-3/4': { tensile: 35215, seismicShear: 8755 }
        }
    };

    // Table 3 - Screw Anchor Concrete failure modes in cracked concrete (Tension values in lbs)
const Table3_ScrewConcreteFailure = {
    '1/4': {
        '1-5/8': { 2500: 300, 3000: 315, 4000: 345, 6000: 390 },
        '2-1/2': { 2500: 760, 3000: 830, 4000: 960, 6000: 1175 },
        '1-5/8': { 2500: 475, 3000: 520, 4000: 600, 6000: 730 }
    },
    '3/8': {
        '2-1/8': { 2500: 1055, 3000: 1155, 4000: 1335, 6000: 1635 },
        '2-1/2': { 2500: 1400, 3000: 1535, 4000: 1775, 6000: 2170 },
        '3-1/4': { 2500: 2185, 3000: 2390, 4000: 2765, 6000: 3385 }
    },
    '1/2': {
        '2-5/8': { 2500: 1755, 3000: 1920, 4000: 2220, 6000: 2715 },
        '4-1/4': { 2500: 3190, 3000: 3495, 4000: 4040, 6000: 4945 },
        '4-3/4': { 2500: 2040, 3000: 2235, 4000: 2580, 6000: 3165 }
    },
    '5/8': {
        '4': { 2500: 3140, 3000: 3510, 4000: 3845, 6000: 4515 },
        '5': { 2500: 4225, 3000: 4625, 4000: 5340, 6000: 6540 },
        '4': { 2500: 2755, 3000: 3020, 4000: 3485, 6000: 4270 }
    },
    '3/4': {
        '4': { 2500: 5940, 3000: 6645, 4000: 7440, 6000: 9115 },
        '6-1/4': { 2500: 8885, 3000: 9745, 4000: 11265, 6000: 13800 }
    }
};

// Table 22 - Screw Anchor Steel failure (Tensile and Seismic Shear values in lbs)
const Table22_ScrewSteelFailure = {
    '1/4': {
        '1-5/8': { tensile: 3370, seismicShear: 770 },
        '1-5/8': { tensile: 5475, seismicShear: 2030 }
    },
    '3/8': {
        '2-1/2': { tensile: 6150, seismicShear: 1720 },
        '2-1/4': { tensile: 10780, seismicShear: 3065 }
    },
    '1/2': {
        '3-1/4': { tensile: 14405, seismicShear: 3720 }
    },
    '5/8': {
        '4': { tensile: 19050, seismicShear: 6385 }
    },
    '3/4': {
        '4': { tensile: 19050, seismicShear: 6385 }
    }
};

const THREADED_ROD_CAPACITIES = {
    "3/8": { working: 610, seismic: 810 },
    "1/2": { working: 1130, seismic: 1500 },
    "5/8": { working: 1810, seismic: 2410 },
    "3/4": { working: 2710, seismic: 3610 },
    "7/8": { working: 3770, seismic: 5030 },
    "1": { working: 4960, seismic: 6610 },
    "1-1/4": { working: 8000, seismic: 10660 }
};

// Table 8-7: Pipe Transverse Brace Requirements
const PIPE_BRACE_REQUIREMENTS = [
    {
        maxWeights: { "0.25g": 10, "0.5g": 6, "1.0g": 3, "2.0g": 3 },
        seismicForce: 125,
        hangerRod: "3/8",
        connection: "A",
        maxUnbraced: 20,
        solidBrace: "A",
        cableBrace: "A", 
        structConnection: "B"
    },
    {
        maxWeights: { "0.25g": 16, "0.5g": 10, "1.0g": 5, "2.0g": 5 },
        seismicForce: 200,
        hangerRod: "1/2",
        connection: "B",
        maxUnbraced: 29,
        solidBrace: "A",
        cableBrace: "B",
        structConnection: "C"
    },
    {
        maxWeights: { "0.25g": 36, "0.5g": 24, "1.0g": 12, "2.0g": 12 },
        seismicForce: 480,
        hangerRod: "1/2",
        connection: "E",
        maxUnbraced: 18,
        solidBrace: "B",
        cableBrace: "C",
        structConnection: "D"
    },
    {
        maxWeights: { "0.25g": 50, "0.5g": 31, "1.0g": 15, "2.0g": 15 },
        seismicForce: 625,
        hangerRod: "5/8",
        connection: "F",
        maxUnbraced: 26,
        solidBrace: "C",
        cableBrace: "C",
        structConnection: "E"
    },
    {
        maxWeights: { "0.25g": 100, "0.5g": 62, "1.0g": 31, "2.0g": 31 },
        seismicForce: 1250,
        hangerRod: "3/4",
        connection: "H",
        maxUnbraced: 27,
        solidBrace: "D",
        cableBrace: "D",
        structConnection: "F"
    },
    {
        maxWeights: { "0.25g": 178, "0.5g": 111, "1.0g": 55, "2.0g": 55 },
        seismicForce: 2225,
        hangerRod: "7/8",
        connection: "H",
        maxUnbraced: 29,
        solidBrace: "D",
        cableBrace: "D",
        structConnection: "H"
    }
];

// Table 8-8: Solid Brace Members
const SOLID_BRACE_MEMBERS = {
    "A": { steelAngle: "2×2×1/8\"", channelStrut: "1-5/8×1-5/8\"" },
    "B": { steelAngle: "2×2×1/4\"", channelStrut: "1-5/8×1-5/8\"" },
    "C": { steelAngle: "3×3×1/4\"", channelStrut: "1-5/8×3-1/4\"" },
    "D": { steelAngle: "4×4×1/4\"", channelStrut: "1-5/8×3-1/4\"" }
};

// Table 8-9: Cable Brace Members
const CABLE_BRACE_MEMBERS = {
    "A": { prestretched: 640, standard: 1600 },
    "B": { prestretched: 1600, standard: 4000 },
    "C": { prestretched: 4000, standard: 10000 },
    "D": { prestretched: 10000, standard: 25000 }
};

// Table 8-10: Connections to Structure
const STRUCTURE_CONNECTIONS = {
    "A": {
        concreteSlab: "3/8\"×2-1/2\"",
        concreteDeck: "3/8\"×3\"",
        steelBolt: "3/8\"",
        lagBolt: "3/8\"×3\""
    },
    "B": {
        concreteSlab: "1/2\"×3\"",
        concreteDeck: "1/2\"×3\"",
        steelBolt: "1/2\"",
        lagBolt: "1/2\"×4\""
    },
    "C": {
        concreteSlab: "5/8\"×3-1/2\"",
        concreteDeck: "3/4\"×5-1/4\"",
        steelBolt: "1/2\"",
        lagBolt: "two 1/2\"×4\""
    },
    "D": {
        concreteSlab: "two 1/2\"×3\"",
        concreteDeck: "two 1/2\"×3\"",
        steelBolt: "5/8\"",
        lagBolt: "two 5/8\"×5\""
    },
    "E": {
        concreteSlab: "two 5/8\"×3-1/2\"",
        concreteDeck: "two 5/8\"×5\"",
        steelBolt: "5/8\"",
        lagBolt: "two 5/8\"×5\""
    },
    "F": {
        concreteSlab: "four 5/8\"×3-1/2\"",
        concreteDeck: "four 5/8\"×5\"",
        steelBolt: "3/4\"",
        lagBolt: "four 5/8\"×5\""
    },
    "G": {
        concreteSlab: "four 3/4\"×4-1/2\"",
        concreteDeck: "—",
        steelBolt: "7/8\"",
        lagBolt: "four 5/8\"×5\""
    },
    "H": {
        concreteSlab: "—",
        concreteDeck: "—",
        steelBolt: "1\"",
        lagBolt: "—"
    }
};

// Function to calculate minimum embedment depth
function calculateMinimumEmbedment(equipment, Tbolt, Vbolt) {
    const anchorDiameter = equipment.anchorDiameter;
    const anchorType = equipment.anchorType; // 'expansion' or 'screw'
    const fc = parseInt(equipment.fc) || 2500;
    
    if (!anchorDiameter) {
        return null;
    }
    
    // Select appropriate tables based on anchor type
    let concreteTable, steelTable;
    
    if (anchorType === 'screw') {
        concreteTable = Table3_ScrewConcreteFailure;
        steelTable = Table22_ScrewSteelFailure;
    } else {
        // Default to expansion anchor tables
        concreteTable = Table19_ConcreteFailure;
        steelTable = Table20_SteelFailure;
    }
    
    if (!concreteTable[anchorDiameter] || !steelTable[anchorDiameter]) {
        return null;
    }
    
    // Find minimum embedment for concrete failure
    let minConcreteEmbedment = null;
    const concreteData = concreteTable[anchorDiameter];
    
    for (const embedment of Object.keys(concreteData).sort((a, b) => parseFloat(a.replace('-', '.')) - parseFloat(b.replace('-', '.')))) {
        const tensionCapacity = concreteData[embedment][fc];
        if (tensionCapacity >= Tbolt) {
            minConcreteEmbedment = embedment;
            break;
        }
    }
    
    // Find minimum embedment for steel failure
    let minSteelEmbedment = null;
    const steelData = steelTable[anchorDiameter];
    
    for (const embedment of Object.keys(steelData).sort((a, b) => parseFloat(a.replace('-', '.')) - parseFloat(b.replace('-', '.')))) {
        const tensileCapacity = steelData[embedment].tensile;
        const shearCapacity = steelData[embedment].seismicShear;
        
        if (tensileCapacity >= Tbolt && shearCapacity >= Vbolt) {
            minSteelEmbedment = embedment;
            break;
        }
    }
    
    // Determine if embedment is sufficient
    let recommendLargerDiameter = false;
    let finalMinEmbedment = null;
    
    if (!minConcreteEmbedment || !minSteelEmbedment) {
        recommendLargerDiameter = true;
    } else {
        // Take the larger of the two minimum embedments
        const concreteEmbed = parseFloat(minConcreteEmbedment.replace('-', '.'));
        const steelEmbed = parseFloat(minSteelEmbedment.replace('-', '.'));
        finalMinEmbedment = concreteEmbed >= steelEmbed ? minConcreteEmbedment : minSteelEmbedment;
    }
    
    return {
        anchorDiameter,
        anchorType,
        fc,
        Tbolt,
        Vbolt,
        minConcreteEmbedment,
        minSteelEmbedment,
        finalMinEmbedment,
        recommendLargerDiameter,
        concreteCapacity: minConcreteEmbedment ? concreteData[minConcreteEmbedment][fc] : null,
        steelTensileCapacity: minSteelEmbedment ? steelData[minSteelEmbedment].tensile : null,
        steelShearCapacity: minSteelEmbedment ? steelData[minSteelEmbedment].seismicShear : null,
        tableReference: anchorType === 'screw' ? 'Table 3 & 22' : 'Table 19 & 20'
    };
}

// ASHRAE Chapter 10 Suspended Equipment Bracing Tables
const ASHRAESuspendedEquipmentTables = {
    // Table 10-1: Threaded Rod Allowable Tension Loads
    threadedRodTensionLoads: {
        '3/8': { working: 610, seismic: 810 },
        '1/2': { working: 1130, seismic: 1500 },
        '5/8': { working: 1810, seismic: 2410 },
        '3/4': { working: 2710, seismic: 3610 },
        '7/8': { working: 3770, seismic: 5030 },
        '1': { working: 4960, seismic: 6610 },
        '1-1/4': { working: 8000, seismic: 10660 }
    },

    

    // Table 10-2: Equipment Braced Above Its Center of Gravity
    equipmentAboveCG: [
        { maxWeights: { '0.25g': 400, '0.5g': 200, '1.0g': 100, '2.0g': 50 }, 
        force: 100, rodDia: '3/8', rodConnection: 'A', maxUnbraced: 30, 
        solidBrace: 'A', cableBrace: 'A', structConnection: { solid: 'B', cable: 'B' }},
        { maxWeights: { '0.25g': 800, '0.5g': 400, '1.0g': 200, '2.0g': 100 }, 
        force: 200, rodDia: '1/2', rodConnection: 'B', maxUnbraced: 39, 
        solidBrace: 'A', cableBrace: 'B', structConnection: { solid: 'C', cable: 'C' }},
        { maxWeights: { '0.25g': 1600, '0.5g': 800, '1.0g': 400, '2.0g': 200 }, 
        force: 400, rodDia: '1/2', rodConnection: 'C', maxUnbraced: 27, 
        solidBrace: 'B', cableBrace: 'B', structConnection: { solid: 'D', cable: 'D' }},
        { maxWeights: { '0.25g': 2400, '0.5g': 1200, '1.0g': 600, '2.0g': 300 }, 
        force: 600, rodDia: '5/8', rodConnection: 'D', maxUnbraced: 36, 
        solidBrace: 'C', cableBrace: 'C', structConnection: { solid: 'E', cable: 'E' }},
        { maxWeights: { '0.25g': 4000, '0.5g': 2000, '1.0g': 1000, '2.0g': 500 }, 
        force: 1000, rodDia: '3/4', rodConnection: 'F', maxUnbraced: 41, 
        solidBrace: 'C', cableBrace: 'C', structConnection: { solid: 'F', cable: 'F' }},
        { maxWeights: { '0.25g': 8000, '0.5g': 4000, '1.0g': 2000, '2.0g': 1000 }, 
        force: 2000, rodDia: '7/8', rodConnection: 'G', maxUnbraced: 40, 
        solidBrace: 'D', cableBrace: 'D', structConnection: { solid: 'H', cable: 'H' }}
    ],

    // Table 10-3: Equipment Braced Below Its Center of Gravity
    equipmentBelowCG: [
        { maxWeights: { '0.25g': 400, '0.5g': 200, '1.0g': 100, '2.0g': 50 }, 
        force: 100, rodDia: '3/8', rodConnection: 'B', maxUnbraced: 18, 
        solidBrace: 'A', cableBrace: 'A', structConnection: { solid: 'B', cable: 'B' }},
        { maxWeights: { '0.25g': 800, '0.5g': 400, '1.0g': 200, '2.0g': 100 }, 
        force: 200, rodDia: '1/2', rodConnection: 'C', maxUnbraced: 24, 
        solidBrace: 'A', cableBrace: 'B', structConnection: { solid: 'C', cable: 'C' }},
        { maxWeights: { '0.25g': 1600, '0.5g': 800, '1.0g': 400, '2.0g': 200 }, 
        force: 400, rodDia: '1/2', rodConnection: 'E', maxUnbraced: 27, 
        solidBrace: 'B', cableBrace: 'B', structConnection: { solid: 'D', cable: 'D' }},
        { maxWeights: { '0.25g': 2400, '0.5g': 1200, '1.0g': 600, '2.0g': 300 }, 
        force: 600, rodDia: '5/8', rodConnection: 'F', maxUnbraced: 22, 
        solidBrace: 'C', cableBrace: 'C', structConnection: { solid: 'E', cable: 'E' }},
        { maxWeights: { '0.25g': 4000, '0.5g': 2000, '1.0g': 1000, '2.0g': 500 }, 
        force: 1000, rodDia: '3/4', rodConnection: 'G', maxUnbraced: 26, 
        solidBrace: 'C', cableBrace: 'C', structConnection: { solid: 'F', cable: 'F' }},
        { maxWeights: { '0.25g': 8000, '0.5g': 4000, '1.0g': 2000, '2.0g': 1000 }, 
        force: 2000, rodDia: '7/8', rodConnection: 'H', maxUnbraced: 25, 
        solidBrace: 'D', cableBrace: 'D', structConnection: { solid: 'H', cable: 'H' }}
    ],

    // Table 10-4: Solid-Brace Members
    solidBraceMembers: {
        'A': { steelAngle: '2×2×1/8"', channelStrut: '1-5/8×1-5/8"' },
        'B': { steelAngle: '2×2×1/4"', channelStrut: '1-5/8×1-5/8"' },
        'C': { steelAngle: '3×3×1/4"', channelStrut: '1-5/8×3-1/4"' },
        'D': { steelAngle: '4×4×1/4"', channelStrut: '1-5/8×3-1/4"' }
    },

    // Table 10-5: Cable Brace Members (Minimum Breaking-Strength Required)
    cableBraceMembers: {
        'A': { prestretched: 640, standard: 1600 },
        'B': { prestretched: 1600, standard: 4000 },
        'C': { prestretched: 4000, standard: 10000 },
        'D': { prestretched: 10000, standard: 25000 }
    },

    // Table 10-6: Connections to Structure
    connectionsToStructure: {
        'A': {
            concreteSlab: '3/8"×2-1/2"',
            concreteDeck: '3/8"×3"',
            steelBolt: '3/8"',
            lagBolt: '3/8"×3"'
        },
        'B': {
            concreteSlab: '1/2"×3"',
            concreteDeck: '1/2"×3"',
            steelBolt: '1/2"',
            lagBolt: '1/2"×4"'
        },
        'C': {
            concreteSlab: '5/8"×3-1/2"',
            concreteDeck: '3/4"×5-1/4"',
            steelBolt: '1/2"',
            lagBolt: 'two 1/2"×4"'
        },
        'D': {
            concreteSlab: 'two 1/2"×3"',
            concreteDeck: 'two 1/2"×3"',
            steelBolt: '5/8"',
            lagBolt: 'two 5/8"×5"'
        },
        'E': {
            concreteSlab: 'two 5/8"×3-1/2"',
            concreteDeck: 'two 5/8"×5"',
            steelBolt: '5/8"',
            lagBolt: 'two 5/8"×5"'
        },
        'F': {
            concreteSlab: 'four 5/8"×3-1/2"',
            concreteDeck: 'four 5/8"×5"',
            steelBolt: '3/4"',
            lagBolt: 'four 5/8"×5"'
        },
        'G': {
            concreteSlab: 'four 3/4"×4-1/2"',
            concreteDeck: '—',
            steelBolt: '7/8"',
            lagBolt: 'four 5/8"×5"'
        },
        'H': {
            concreteSlab: '—',
            concreteDeck: '—',
            steelBolt: '1"',
            lagBolt: '—'
        }
    },

    aircraftCableTable: {
        '1/16': { breakingStrength: 480, approxWeight: 0.75, workLoad: 96 },
        '3/32': { breakingStrength: 1000, approxWeight: 16.5, workLoad: 200 },
        '1/8': { breakingStrength: 2000, approxWeight: 29, workLoad: 400 },
        '5/32': { breakingStrength: 2800, approxWeight: 45, workLoad: 560 },
        '3/16': { breakingStrength: 4200, approxWeight: 65, workLoad: 840 },
        '7/32': { breakingStrength: 5600, approxWeight: 86, workLoad: 1120 },
        '1/4': { breakingStrength: 7000, approxWeight: 110, workLoad: 1400 },
        '5/16': { breakingStrength: 9800, approxWeight: 173, workLoad: 1960 },
        '3/8': { breakingStrength: 14400, approxWeight: 243, workLoad: 2880 }
    }

};

// Function to determine seismic acceleration level
function getSeismicAcceleration(project) {
    const sds = parseFloat(project.S_DS) || 0.4;
    
    if (sds >= 2.0) return '2.0g';
    if (sds >= 1.0) return '1.0g';
    if (sds >= 0.5) return '0.5g';
    return '0.25g';
}

// Function to calculate suspended equipment bracing requirements
function calculateSuspendedEquipmentBracing(equipment, project) {
    const weight = parseFloat(equipment.weight) || 0;
    const weightUnit = equipment.weightUnit || 'kg';
    
    // Convert weight to pounds
    const weightLbs = weightUnit === 'lbs' ? weight : weight * 2.20462;
    
    // Get seismic acceleration level
    const seismicLevel = getSeismicAcceleration(project);
    
    // Determine if equipment is braced above or below center of gravity
    const installMethod = equipment.installMethod;
    const bracePosition = (installMethod === '4') ? 'below' : 'above'; // Ceiling = below CG
    
    // Select appropriate table
    const table = bracePosition === 'above' ? 
        ASHRAESuspendedEquipmentTables.equipmentAboveCG : 
        ASHRAESuspendedEquipmentTables.equipmentBelowCG;
    
    // Find appropriate row in table
    let selectedRow = null;
    for (const row of table) {
        if (weightLbs <= row.maxWeights[seismicLevel]) {
            selectedRow = row;
            break;
        }
    }
    
    if (!selectedRow) {
        // Use largest available if weight exceeds table
        selectedRow = table[table.length - 1];
    }
    
    // Get detailed specifications
    const solidBrace = ASHRAESuspendedEquipmentTables.solidBraceMembers[selectedRow.solidBrace];
    const cableBrace = ASHRAESuspendedEquipmentTables.cableBraceMembers[selectedRow.cableBrace];
    const structConnection = ASHRAESuspendedEquipmentTables.connectionsToStructure[selectedRow.structConnection.solid];
    
    return {
        seismicLevel,
        bracePosition,
        weightLbs: parseFloat(weightLbs.toFixed(2)),
        specifications: {
            hangerRod: {
                diameter: selectedRow.rodDia,
                connection: selectedRow.rodConnection,
                maxUnbracedLength: selectedRow.maxUnbraced,
                tensionCapacity: ASHRAESuspendedEquipmentTables.threadedRodTensionLoads[selectedRow.rodDia]
            },
            solidBrace: {
                size: selectedRow.solidBrace,
                steelAngle: solidBrace.steelAngle,
                channelStrut: solidBrace.channelStrut,
                maxLength: '9 ft, 6 in.'
            },
            cableBrace: {
                size: selectedRow.cableBrace,
                prestretched: cableBrace.prestretched,
                standard: cableBrace.standard
            },
            structuralConnection: {
                solid: selectedRow.structConnection.solid,
                cable: selectedRow.structConnection.cable,
                concreteSlab: structConnection.concreteSlab,
                concreteDeck: structConnection.concreteDeck,
                steelBolt: structConnection.steelBolt,
                lagBolt: structConnection.lagBolt
            }
        },
        shoppingList: generateShoppingList(selectedRow, solidBrace, cableBrace, structConnection)
    };
}

// Function to calculate suspended piping bracing requirements (ASHRAE Chapter 8)
function calculateSuspendedPipingBracing(equipment, project) {
    const pipeWeight = parseFloat(equipment.pipeWeightPerFoot) || 0;
    
    // Determine seismic level based on project S_DS
    const sds = parseFloat(project.S_DS) || 0.4;
    const seismicLevel = sds >= 2.0 ? "2.0g" : 
                        sds >= 1.0 ? "1.0g" : 
                        sds >= 0.5 ? "0.5g" : "0.25g";
    
    // Find appropriate row from Table 8-7 based on pipe weight
    let selectedRow = null;
    for (const row of PIPE_BRACE_REQUIREMENTS) {
        if (pipeWeight <= row.maxWeights[seismicLevel]) {
            selectedRow = row;
            break;
        }
    }
    
    // If no row found, use the largest available
    if (!selectedRow) {
        selectedRow = PIPE_BRACE_REQUIREMENTS[PIPE_BRACE_REQUIREMENTS.length - 1];
    }
    
    // Get specifications from other tables
    const hangerRodSpec = THREADED_ROD_CAPACITIES[selectedRow.hangerRod];
    const solidBraceSpec = SOLID_BRACE_MEMBERS[selectedRow.solidBrace];
    const cableBraceSpec = CABLE_BRACE_MEMBERS[selectedRow.cableBrace];
    const connectionSpec = STRUCTURE_CONNECTIONS[selectedRow.structConnection];
    
    return {
        seismicLevel,
        pipeWeight,
        exceedsTable: !PIPE_BRACE_REQUIREMENTS.some(row => pipeWeight <= row.maxWeights[seismicLevel]),
        specifications: {
            hangerRod: {
                diameter: selectedRow.hangerRod,
                workingLoad: hangerRodSpec.working,
                seismicLoad: hangerRodSpec.seismic,
                maxUnbraced: selectedRow.maxUnbraced,
                connection: selectedRow.connection
            },
            solidBrace: {
                category: selectedRow.solidBrace,
                steelAngle: solidBraceSpec.steelAngle,
                channelStrut: solidBraceSpec.channelStrut,
                maxLength: "9 ft, 6 in."
            },
            cableBrace: {
                category: selectedRow.cableBrace,
                prestretched: cableBraceSpec.prestretched,
                standard: cableBraceSpec.standard
            },
            structuralConnection: {
                category: selectedRow.structConnection,
                concreteSlab: connectionSpec.concreteSlab,
                concreteDeck: connectionSpec.concreteDeck,
                steelBolt: connectionSpec.steelBolt,
                lagBolt: connectionSpec.lagBolt
            }
        },
        seismicForce: selectedRow.seismicForce
    };
}

// Function to show suspended piping calculation details
function showSuspendedPipingDetails(equipment, project) {
    const bracing = calculateSuspendedPipingBracing(equipment, project);
    
    const message = `SUSPENDED PIPING BRACING SPECIFICATIONS (ASHRAE Chapter 8)
Equipment: ${equipment.equipment}
Pipe Weight: ${bracing.pipeWeight} lb/ft
Seismic Level: ${bracing.seismicLevel}
${bracing.exceedsTable ? '⚠️ WARNING: Pipe weight exceeds table limits - using maximum specifications' : ''}
HANGER ROD SPECIFICATIONS:
- Diameter: ${bracing.specifications.hangerRod.diameter}"
- Working Load: ${bracing.specifications.hangerRod.workingLoad} lbs
- Seismic Load: ${bracing.specifications.hangerRod.seismicLoad} lbs  
- Max Unbraced Length: ${bracing.specifications.hangerRod.maxUnbraced}"
- Connection Type: ${bracing.specifications.hangerRod.connection}
SOLID BRACE OPTIONS:
- Steel Angle: ${bracing.specifications.solidBrace.steelAngle}
- Channel Strut: ${bracing.specifications.solidBrace.channelStrut}
- Maximum Length: ${bracing.specifications.solidBrace.maxLength}
CABLE BRACE OPTIONS:
- Prestretched Cable: ${bracing.specifications.cableBrace.prestretched} lbs min breaking strength
- Standard Cable: ${bracing.specifications.cableBrace.standard} lbs min breaking strength
STRUCTURAL CONNECTIONS:
- Concrete Slab: ${bracing.specifications.structuralConnection.concreteSlab}
- Concrete Deck: ${bracing.specifications.structuralConnection.concreteDeck}
- Steel Structure: ${bracing.specifications.structuralConnection.steelBolt}
- Wood Structure: ${bracing.specifications.structuralConnection.lagBolt}
Reference: ASHRAE Tables 8-6 through 8-10`;
    
    alert(message);
}

// Function to find appropriate aircraft cable diameter
function getAircraftCableDiameter(requiredBreakingStrength) {
    const cableTable = ASHRAESuspendedEquipmentTables.aircraftCableTable;
    const diameters = Object.keys(cableTable);
    
    for (const diameter of diameters) {
        const cable = cableTable[diameter];
        if (cable.breakingStrength >= requiredBreakingStrength) {
            return {
                diameter: diameter,
                breakingStrength: cable.breakingStrength,
                approxWeight: cable.approxWeight,
                workLoad: cable.workLoad
            };
        }
    }
    
    // If no cable is sufficient, return the largest available with warning
    const largestDiameter = diameters[diameters.length - 1];
    return {
        diameter: largestDiameter,
        breakingStrength: cableTable[largestDiameter].breakingStrength,
        approxWeight: cableTable[largestDiameter].approxWeight,
        workLoad: cableTable[largestDiameter].workLoad,
        insufficient: true
    };
}

// Function to generate shopping list
function generateShoppingList(selectedRow, solidBrace, cableBrace, structConnection) {
    // Get aircraft cable diameter for standard cable requirement
    const aircraftCable = getAircraftCableDiameter(cableBrace.standard);
    
    return {
        hangerRods: `${selectedRow.rodDia}" diameter threaded rod (max unbraced length: ${selectedRow.maxUnbraced}")`,
        solidBracing: `Steel angle ${solidBrace.steelAngle} OR 12-gauge channel strut ${solidBrace.channelStrut}`,
        cableBracing: `Prestretched steel cable ${cableBrace.prestretched} lbs min breaking strength OR Aircraft Cable: ⌀ ${aircraftCable.diameter}", ${aircraftCable.breakingStrength} lbs min breaking strength${aircraftCable.insufficient ? ' (INSUFFICIENT - Use larger diameter)' : ''}`,
        aircraftCableDetails: aircraftCable, // Store details for popup
        anchors: {
            concreteSlab: structConnection.concreteSlab,
            concreteDeck: structConnection.concreteDeck,
            steelStructure: structConnection.steelBolt,
            lagBolt: structConnection.lagBolt
        }
    };
}
// Function to show suspended equipment bracing details
// function showSuspendedBracingDetails(equipment, project) {
//     const bracing = calculateSuspendedEquipmentBracing(equipment, project);
    
//     const message = `

// Equipment: ${equipment.equipment}
// Weight: ${bracing.weightLbs} lbs
// Seismic Level: ${bracing.seismicLevel}
// Brace Position: ${bracing.bracePosition} center of gravity

// HANGER RODS:
// - Diameter: ${bracing.specifications.hangerRod.diameter}"
// - Max Unbraced Length: ${bracing.specifications.hangerRod.maxUnbracedLength}"
// - Tension Capacity: ${bracing.specifications.hangerRod.tensionCapacity.seismic} lbs (seismic)
// - Connection Type: ${bracing.specifications.hangerRod.connection}

// BRACE MEMBERS:
// Solid Brace Option:
// - Steel Angle: ${bracing.specifications.solidBrace.steelAngle}
// - Channel Strut: ${bracing.specifications.solidBrace.channelStrut}
// - Max Length: ${bracing.specifications.solidBrace.maxLength}

// Cable Brace Option:
// - Prestretched Cable: ${bracing.specifications.cableBrace.prestretched} lbs min breaking strength
// - Standard Cable: ${bracing.specifications.cableBrace.standard} lbs min breaking strength

// STRUCTURAL CONNECTIONS:
// - Concrete Slab: ${bracing.specifications.structuralConnection.concreteSlab}
// - Concrete Deck: ${bracing.specifications.structuralConnection.concreteDeck}
// - Steel Structure: ${bracing.specifications.structuralConnection.steelBolt}
// - Wood Structure: ${bracing.specifications.structuralConnection.lagBolt}

// SHOPPING LIST:
// 1. ${bracing.shoppingList.hangerRods}
// 2. ${bracing.shoppingList.solidBracing}
// 3. ${bracing.shoppingList.cableBracing}
// 4. Expansion anchors or bolts per structural connection requirements above

// `;
    
//     alert(message);
// }

// Function to show suspended equipment hanger rod details
function showSuspendedHangerDetails(equipment, project) {
    const bracing = calculateSuspendedEquipmentBracing(equipment, project);
    
    const message = `Equipment: ${equipment.equipment}
Weight: ${bracing.weightLbs} lbs
Seismic Level: ${bracing.seismicLevel}
Brace Position: ${bracing.bracePosition} center of gravity

HANGER RODS:
- Diameter: ${bracing.specifications.hangerRod.diameter}"
- Max Unbraced Length: ${bracing.specifications.hangerRod.maxUnbracedLength}"
- Tension Capacity: ${bracing.specifications.hangerRod.tensionCapacity.seismic} lbs (seismic)
- Connection Type: ${bracing.specifications.hangerRod.connection}`;
    
    alert(message);
}

// Function to show suspended equipment brace details
function showSuspendedBraceDetails(equipment, project) {
    const bracing = calculateSuspendedEquipmentBracing(equipment, project);
    const aircraftCable = bracing.shoppingList.aircraftCableDetails;
    
    const message = `BRACE MEMBERS:
Solid Brace Option:
- Steel Angle: ${bracing.specifications.solidBrace.steelAngle}
- Channel Strut: ${bracing.specifications.solidBrace.channelStrut}
- Max Length: ${bracing.specifications.solidBrace.maxLength}

Cable Brace Option:
- Prestretched Cable: ${bracing.specifications.cableBrace.prestretched} lbs min breaking strength
- Aircraft Cable: ⌀ ${aircraftCable.diameter}"
• Breaking Strength: ${aircraftCable.breakingStrength} lbs
• Work Load Limit: ${aircraftCable.workLoad} lbs
${aircraftCable.insufficient ? '⚠️ WARNING: Largest available cable (⌀ 3/8") insufficient for required load!' : ''}

STRUCTURAL CONNECTIONS:
- Concrete Slab: ${bracing.specifications.structuralConnection.concreteSlab}
- Concrete Deck: ${bracing.specifications.structuralConnection.concreteDeck}
- Steel Structure: ${bracing.specifications.structuralConnection.steelBolt}
- Wood Structure: ${bracing.specifications.structuralConnection.lagBolt}

SHOPPING LIST:
1. ${bracing.shoppingList.hangerRods}
2. ${bracing.shoppingList.solidBracing}
3. Aircraft Cable: ⌀ ${aircraftCable.diameter}" (7x19 GAC), ${aircraftCable.breakingStrength} lbs breaking strength`;
    
    alert(message);
}

// Add calculation detail functions
function showASHRAETboltDetails(equipment, project) {
    const ashrae = calculateASHRAEAnchorBolts(equipment, project);
    if (!ashrae) {
        alert('ASHRAE anchor bolt calculations require additional parameters based on mounting type');
        return;
    }
    
    const p = ashrae.parameters;
    let message = `ASHRAE ANCHOR BOLT TENSION (Tbolt) CALCULATION

Equipment: ${equipment.equipment}
Mounting Type: ${ashrae.formulaType}

`;

    if (equipment.mountingType === 'no-isolators') {
        message += `Formula: Tbolt = Tb / (n/2)

PARAMETERS:
Tb (Total Tension) = ${p.Tb} lbs
n (Number of Anchor Bolts) = ${p.n}

CALCULATION:
Tbolt = ${p.Tb} / (${p.n}/2) = ${ashrae.Tbolt} lbs per bolt`;

    } else if (equipment.mountingType === 'type-3-1') {
        message += `Formula: Tbolt = Pt / n

PARAMETERS:
Pt (Maximum Tension) = ${p.Pt} lbs
n (Number of Anchor Bolts) = ${p.n}

CALCULATION:
Tbolt = ${p.Pt} / ${p.n} = ${ashrae.Tbolt} lbs per bolt`;

    } else if (equipment.mountingType === 'type-3-2') {
        message += `Formula: Tbolt = (Ps × H) / (n × (B/2)) + (Ps / n)

PARAMETERS:
Ps (Maximum Shear) = ${p.Ps} lbs
H (Height to Restraint) = ${p.H} in
B (Isolator Width) = ${p.B} in
n (Number of Anchor Bolts) = ${p.n}

CALCULATION:
Term 1: (Ps × H) / (n × (B/2)) = (${p.Ps} × ${p.H}) / (${p.n} × ${p.B/2}) = ${((p.Ps * p.H) / (p.n * (p.B/2))).toFixed(2)} lbs
Term 2: Ps / n = ${p.Ps} / ${p.n} = ${(p.Ps / p.n).toFixed(2)} lbs
Tbolt = Term 1 + Term 2 = ${ashrae.Tbolt} lbs per bolt`;

    } else {
        message += `Formula varies by mounting type - see ASHRAE guidelines

RESULT:
Tbolt = ${ashrae.Tbolt} lbs per bolt`;
    }
    
    alert(message);
}

function showASHRAEVboltDetails(equipment, project) {
    const ashrae = calculateASHRAEAnchorBolts(equipment, project);
    if (!ashrae) {
        alert('ASHRAE anchor bolt calculations require additional parameters based on mounting type');
        return;
    }
    
    const p = ashrae.parameters;
    let message = `ASHRAE ANCHOR BOLT SHEAR (Vbolt) CALCULATION

Equipment: ${equipment.equipment}
Mounting Type: ${ashrae.formulaType}

`;

    if (equipment.mountingType === 'no-isolators') {
        message += `Formula: Vbolt = Vb / n

PARAMETERS:
Vb (Total Shear) = ${p.Vb} lbs
n (Number of Anchor Bolts) = ${p.n}

CALCULATION:
Vbolt = ${p.Vb} / ${p.n} = ${ashrae.Vbolt} lbs per bolt`;
    } else {
        message += `Formula: Vbolt = Ps / n

PARAMETERS:
Ps (Maximum Shear) = ${p.Ps} lbs
n (Number of Anchor Bolts) = ${p.n}

CALCULATION:
Vbolt = ${p.Ps} / ${p.n} = ${ashrae.Vbolt} lbs per bolt`;
    }
    
    alert(message);
}

// New functions for concrete expansion anchor interaction formulas
function showConcreteFormula1Details(equipment, project) {
    const ashrae = calculateASHRAEAnchorBolts(equipment, project);
    if (!ashrae || !ashrae.concreteAnalysis) {
        alert('Concrete expansion anchor analysis not available');
        return;
    }
    
    const concrete = ashrae.concreteAnalysis;
    const message = `CONCRETE EXPANSION ANCHOR - INTERACTION FORMULA 1

Equipment: ${equipment.equipment}
Mounting Type: ${ashrae.formulaType}

ASHRAE FORMULA (11-36):
(Tbolt/Tallow) + (Vbolt/Vallow) ≤ 1.0

PARAMETERS:
Tbolt (Anchor Bolt Tension) = ${ashrae.Tbolt} lbs per bolt
Vbolt (Anchor Bolt Shear) = ${ashrae.Vbolt} lbs per bolt
Tallow (Allowable Tension) = ${concrete.Tallow} lbs (placeholder)
Vallow (Allowable Shear) = ${concrete.Vallow} lbs (placeholder)

CALCULATION:
(${ashrae.Tbolt}/${concrete.Tallow}) + (${ashrae.Vbolt}/${concrete.Vallow}) = ${concrete.formula1.value}

RESULT: ${concrete.formula1.value} ${concrete.formula1.pass ? '≤' : '>'} ${concrete.formula1.limit}
STATUS: ${concrete.formula1.pass ? '✅ PASS' : '❌ FAIL'}`;
    
    alert(message);
}

// New functions for concrete expansion anchor interaction formulas
function showConcreteFormula2Details(equipment, project) {
    const ashrae = calculateASHRAEAnchorBolts(equipment, project);
    if (!ashrae || !ashrae.concreteAnalysis) {
        alert('Concrete expansion anchor analysis not available');
        return;
    }
    
    const concrete = ashrae.concreteAnalysis;
    const message = `CONCRETE EXPANSION ANCHOR - INTERACTION FORMULA 2

Equipment: ${equipment.equipment}
Mounting Type: ${ashrae.formulaType}

ASHRAE FORMULA (11-37):
(Tbolt/Tallow)^(5/3) + (Vbolt/Vallow)^(5/3) ≤ 1.0

PARAMETERS:
Tbolt (Anchor Bolt Tension) = ${ashrae.Tbolt} lbs per bolt
Vbolt (Anchor Bolt Shear) = ${ashrae.Vbolt} lbs per bolt
Tallow (Allowable Tension) = ${concrete.Tallow} lbs (placeholder)
Vallow (Allowable Shear) = ${concrete.Vallow} lbs (placeholder)

CALCULATION:
(${ashrae.Tbolt}/${concrete.Tallow})^(5/3) + (${ashrae.Vbolt}/${concrete.Vallow})^(5/3) = ${concrete.formula2.value}

BREAKDOWN:
Term 1: (${ashrae.Tbolt}/${concrete.Tallow})^(5/3) = ${Math.pow(ashrae.Tbolt/concrete.Tallow, 5/3).toFixed(4)}
Term 2: (${ashrae.Vbolt}/${concrete.Vallow})^(5/3) = ${Math.pow(ashrae.Vbolt/concrete.Vallow, 5/3).toFixed(4)}
Sum: ${concrete.formula2.value}

RESULT: ${concrete.formula2.value} ${concrete.formula2.pass ? '≤' : '>'} ${concrete.formula2.limit}
STATUS: ${concrete.formula2.pass ? '✅ PASS' : '❌ FAIL'}`;
    
    alert(message);
}

function showConcreteEmbedmentDetails(equipment, project) {
    const ashrae = calculateASHRAEAnchorBolts(equipment, project);
    if (!ashrae || !ashrae.embedmentAnalysis) {
        alert('Embedment analysis not available');
        return;
    }
    
    const embed = ashrae.embedmentAnalysis;
    const tableRef = embed.anchorType === 'screw' ? 'TABLE 3 - SCREW ANCHOR CRACKED CONCRETE' : 'TABLE 19 - EXPANSION ANCHOR CRACKED CONCRETE';
    
    const message = `CONCRETE FAILURE - MINIMUM EMBEDMENT ANALYSIS

Equipment: ${equipment.equipment}
Anchor: ${embed.anchorDiameter}" ${getAnchorTypeText(embed.anchorType)} anchor

REQUIREMENTS:
Tbolt (Required Tension) = ${embed.Tbolt} lbs per bolt
f'c (Concrete Strength) = ${embed.fc} psi

${tableRef} ANALYSIS:
${embed.minConcreteEmbedment ? `
✅ RESULT: Minimum embedment = ${embed.minConcreteEmbedment}"
Concrete tension capacity = ${embed.concreteCapacity} lbs ≥ ${embed.Tbolt} lbs` : `
❌ RESULT: NO SUFFICIENT EMBEDMENT FOUND
RECOMMENDATION: Use a larger anchor diameter.`}

Reference: HILTI ${embed.tableReference} (${embed.anchorType === 'screw' ? 'KWIK HUS-EZ Screw' : 'KWIK BOLT TZ2 Expansion'} Anchor per ACI 318 Ch. 17)`;
    
    alert(message);
}

function showSteelEmbedmentDetails(equipment, project) {
    const ashrae = calculateASHRAEAnchorBolts(equipment, project);
    if (!ashrae || !ashrae.embedmentAnalysis) {
        alert('Embedment analysis not available');
        return;
    }
    
    const embed = ashrae.embedmentAnalysis;
    const tableRef = embed.anchorType === 'screw' ? 'TABLE 22 - SCREW ANCHOR STEEL FAILURE' : 'TABLE 20 - EXPANSION ANCHOR STEEL FAILURE';
    
    const message = `STEEL FAILURE - MINIMUM EMBEDMENT ANALYSIS

Equipment: ${equipment.equipment}
Anchor: ${embed.anchorDiameter}" ${getAnchorTypeText(embed.anchorType)} anchor

REQUIREMENTS:
Tbolt (Required Tension) = ${embed.Tbolt} lbs per bolt
Vbolt (Required Shear) = ${embed.Vbolt} lbs per bolt

${tableRef} ANALYSIS:
${embed.minSteelEmbedment ? `
✅ RESULT: Minimum embedment = ${embed.minSteelEmbedment}"
Steel tensile capacity = ${embed.steelTensileCapacity} lbs ≥ ${embed.Tbolt} lbs
Steel seismic shear capacity = ${embed.steelShearCapacity} lbs ≥ ${embed.Vbolt} lbs` : `
❌ RESULT: NO SUFFICIENT EMBEDMENT FOUND
RECOMMENDATION: Use a larger anchor diameter.`}

Reference: HILTI ${embed.tableReference} (${embed.anchorType === 'screw' ? 'KWIK HUS-EZ Screw' : 'KWIK BOLT TZ2 Expansion'} Anchor per ACI 318 Ch. 17)`;
    
    alert(message);
}

function showFinalEmbedmentDetails(equipment, project) {
    const ashrae = calculateASHRAEAnchorBolts(equipment, project);
    if (!ashrae || !ashrae.embedmentAnalysis) {
        alert('Embedment analysis not available');
        return;
    }
    
    const embed = ashrae.embedmentAnalysis;
    const message = `FINAL MINIMUM EMBEDMENT DETERMINATION

Equipment: ${equipment.equipment}
Anchor: ${embed.anchorDiameter}" ${equipment.anchorType || 'expansion'} anchor

ANALYSIS RESULTS:
Concrete Failure (Table 19): ${embed.minConcreteEmbedment || 'INSUFFICIENT'}"
Steel Failure (Table 20): ${embed.minSteelEmbedment || 'INSUFFICIENT'}"

GOVERNING REQUIREMENT:
${embed.recommendLargerDiameter ? `
❌ CURRENT ANCHOR INSUFFICIENT
Neither concrete nor steel capacity is adequate.

RECOMMENDATION: Use a larger anchor diameter and re-analyze.` : `
✅ FINAL MINIMUM EMBEDMENT: ${embed.finalMinEmbedment}"

This is the LARGER of the two minimum embedments, ensuring both concrete and steel failure modes are satisfied.

DESIGN RULE: 
Use embedment ≥ ${embed.finalMinEmbedment}" to satisfy both failure modes.`}

The governing embedment must satisfy BOTH concrete breakout and steel failure criteria.`;
    
    alert(message);
}

function showEmbedmentRecommendationDetails(equipment, project) {
    const ashrae = calculateASHRAEAnchorBolts(equipment, project);
    if (!ashrae || !ashrae.embedmentAnalysis) {
        alert('Embedment analysis not available');
        return;
    }
    
    const embed = ashrae.embedmentAnalysis;
    const currentDiam = embed.anchorDiameter;
    const nextSizes = {
        '1/4': '3/8"',
        '3/8': '1/2"', 
        '1/2': '5/8"',
        '5/8': '3/4"',
        '3/4': '1"'
    };
    
    const message = `ANCHOR DIAMETER RECOMMENDATION

Current Configuration:
Anchor: ${currentDiam}" ${equipment.anchorType || 'expansion'} anchor
Required Forces: Tbolt = ${embed.Tbolt} lbs, Vbolt = ${embed.Vbolt} lbs

PROBLEM:
The current ${currentDiam}" anchor diameter cannot provide sufficient capacity at any available embedment depth.

SOLUTION:
Try ${nextSizes[currentDiam] || 'larger diameter'} anchor and re-analyze.

REASON:
Larger diameter anchors have:
✓ Higher steel tensile capacity
✓ Higher steel shear capacity  
✓ Greater concrete breakout capacity
✓ More embedment options available

ACTION REQUIRED:
1. Change anchor diameter to larger size
2. Re-run analysis to verify adequate capacity
3. Determine minimum embedment for new diameter`;
    
    alert(message);
}

// Calculation detail functions for overturning - SEPARATE FUNCTIONS FOR EACH CALCULATION
function showOTMCalculationDetails(equipment, project) {
    const calc = calculateOverturningForces(equipment, project);
    if (!calc) {
        alert('Overturning calculations only apply to rigid equipment (NBC categories 11-rigid, 12-rigid, 18, 19)');
        return;
    }
    
    const message = `OVERTURNING MOMENT (OTM) CALCULATION

Equipment: ${equipment.equipment} (NBC Category: ${equipment.nbcCategory})

Formula: OTM = Fph × h

FORCES:
CFS = ${calc.formula.CFS} (from CFS calculation)
Weight = ${calc.formula.weightValue} ${calc.formula.weightUnit} = ${calc.formula.weightLbs} lbs
Fph (Horizontal Force) = CFS × W = ${calc.formula.CFS} × ${calc.formula.weightLbs} = ${calc.formula.Fph} lbs

GEOMETRY:
Equipment Height = ${calc.formula.heightIn}" 
h = 55% of equipment height = 0.55 × ${calc.formula.heightIn}" = ${calc.formula.h}"

CALCULATION:
OTM = Fph × h = ${calc.formula.Fph} × ${calc.formula.h} = ${calc.OTM} lb-in`;
    
    alert(message);
}

function showRMCalculationDetails(equipment, project) {
    const calc = calculateOverturningForces(equipment, project);
    if (!calc) {
        alert('Overturning calculations only apply to rigid equipment (NBC categories 11-rigid, 12-rigid, 18, 19)');
        return;
    }
    
    const message = `RESISTING MOMENT (RM) CALCULATION

Equipment: ${equipment.equipment} (NBC Category: ${equipment.nbcCategory})

Formula: RM = (W - Fpv) × dmin/2

FORCES:
Weight = ${calc.formula.weightValue} ${calc.formula.weightUnit} = ${calc.formula.weightLbs} lbs
Fpv (Vertical Force) = 0.2 × Sa(0.2) × Wp = 0.2 × ${parseFloat(project.maxSa0_2) || 0} × ${calc.formula.weightLbs} = ${calc.formula.Fpv} lbs

GEOMETRY:
dmin = min(height, width) = min(${calc.formula.heightIn}", ${equipment.width}") = ${calc.formula.dmin}"

CALCULATION:
RM = (W - Fpv) × dmin/2 = (${calc.formula.weightLbs} - ${calc.formula.Fpv}) × ${calc.formula.dmin}/2 = ${calc.RM} lb-in`;
    
    alert(message);
}

function showTensionCalculationDetails(equipment, project) {
    const calc = calculateOverturningForces(equipment, project);
    if (!calc) {
        alert('Overturning calculations only apply to rigid equipment (NBC categories 11-rigid, 12-rigid, 18, 19)');
        return;
    }
    
    const message = `TOTAL TENSION (T) CALCULATION

Equipment: ${equipment.equipment} (NBC Category: ${equipment.nbcCategory})

Formula: T = (OTM - RM)/dmin

REQUIRED VALUES:
OTM (Overturning Moment) = ${calc.OTM} lb-in
RM (Resisting Moment) = ${calc.RM} lb-in
dmin = min(height, width) = ${calc.formula.dmin}"

CALCULATION:
T = (OTM - RM)/dmin = (${calc.OTM} - ${calc.RM})/${calc.formula.dmin} = ${calc.T} lbs

BOLT TENSION:
Tbolt = T / (n/2) = ${calc.T} / (${calc.formula.numberOfAnchors}/2) = ${calc.Tbolt} lbs per bolt`;
    
    alert(message);
}

function showShearCalculationDetails(equipment, project) {
    const calc = calculateOverturningForces(equipment, project);
    if (!calc) {
        alert('Overturning calculations only apply to rigid equipment (NBC categories 11-rigid, 12-rigid, 18, 19)');
        return;
    }
    
    const message = `TOTAL SHEAR (V) CALCULATION

Equipment: ${equipment.equipment} (NBC Category: ${equipment.nbcCategory})

Formula: V = Fph

FORCES:
CFS = ${calc.formula.CFS} (from CFS calculation)
Weight = ${calc.formula.weightValue} ${calc.formula.weightUnit} = ${calc.formula.weightLbs} lbs
Fph (Horizontal Force) = CFS × W = ${calc.formula.CFS} × ${calc.formula.weightLbs} = ${calc.formula.Fph} lbs

CALCULATION:
V = Fph = ${calc.V} lbs

BOLT SHEAR:
Vbolt = V / n = ${calc.V} / ${calc.formula.numberOfAnchors} = ${calc.Vbolt} lbs per bolt`;
    
    alert(message);
}

// Authentication functions using authHelper
async function checkAuthentication() {
    try {
        console.log('🔐 Checking authentication using authHelper...');
        
        // Initialize authHelper here when needed
        if (!window.authHelper) {
            window.authHelper = new AuthHelper();
        }
        authHelper = window.authHelper;
        
        const userData = await authHelper.checkAuthentication();
        
        if (!userData) {
            console.log('❌ No user authenticated');
            document.getElementById('loadingProject').style.display = 'none';
            document.getElementById('authError').style.display = 'block';
            return false;
        }

        console.log('✅ User authenticated:', userData.email);
        currentUser = userData;
        isAdmin = userData.isAdmin;
        
        // Update UI with user info
        authHelper.updateUserInterface();
        
        return true;

    } catch (error) {
        console.error('❌ Authentication error:', error);
        document.getElementById('loadingProject').style.display = 'none';
        document.getElementById('authError').style.display = 'block';
        return false;
    }
}

function getAuthHeaders() {
    return authHelper.getAuthHeaders();
}

function handleAuthError(response) {
    if (response.status === 401) {
        document.getElementById('projectContainer').style.display = 'none';
        document.getElementById('authError').style.display = 'block';
        return true;
    }
    if (response.status === 403) {
        document.getElementById('projectContainer').style.display = 'none';
        document.getElementById('accessDenied').style.display = 'block';
        return true;
    }
    return false;
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        authHelper.logout();
        window.location.href = 'auth.html';
    }
}

// Function to populate equipment options
function populateEquipmentOptions(domain) {
    const equipmentInput = document.getElementById('equipment');
    const equipmentDatalist = document.getElementById('equipmentOptions');
    
    // Clear the input and datalist
    equipmentInput.value = '';
    equipmentDatalist.innerHTML = '';

    const options = equipmentOptions[domain.toLowerCase()] || [];
    options.forEach(equipment => {
        const option = document.createElement('option');
        option.value = equipment;
        option.textContent = equipment;
        equipmentDatalist.appendChild(option);
    });
    
    // Show/hide form sections based on equipment selection (will be handled in equipment change listener)
    // Reset all conditional fields to hidden state
    hideAllConditionalFields();
    
    // Initialize NBC Category for traditional equipment (not pipes)
    populateNBCCategoryOptions(false);
    
    // Reset install methods to show all options initially (will be filtered when equipment is selected)
    const installMethodSelect = document.getElementById('installMethod');
    if (installMethodSelect) {
        installMethodSelect.innerHTML = `
            <option value="">Select installation method...</option>
            <option value="1">Fixed to Slab</option>
            <option value="2">Fixed to Wall</option>
            <option value="3">Fixed to Structure</option>
            <option value="4">Fixed to Ceiling</option>
            <option value="5">Fixed to Roof</option>
        `;
    }
    
    // Update image when domain changes
    updateEquipmentImage();
}

// Function to populate install method options based on selected equipment
function populateInstallMethodOptions(domain, equipment) {
    const installMethodSelect = document.getElementById('installMethod');
    if (!installMethodSelect) return;
    
    // Store current selection
    const currentValue = installMethodSelect.value;
    
    // Clear existing options
    installMethodSelect.innerHTML = '<option value="">Select installation method...</option>';
    
    // All available install methods
    const allInstallMethods = {
        '1': 'Fixed to Slab',
        '2': 'Fixed to Wall', 
        '3': 'Fixed to Structure',
        '4': 'Fixed to Ceiling',
        '5': 'Fixed to Roof'
    };
    
    let allowedMethods = [];
    
    // Check if we have domain-specific and equipment-specific restrictions
    if (equipmentInstallMethods[domain] && equipmentInstallMethods[domain][equipment] && equipmentInstallMethods[domain][equipment].length > 0) {
        allowedMethods = equipmentInstallMethods[domain][equipment];
    } else {
        // If no restrictions defined, show all methods (fallback for other domains/equipment)
        allowedMethods = Object.keys(allInstallMethods);
    }
    
    // Add allowed methods to dropdown
    allowedMethods.forEach(methodId => {
        const option = document.createElement('option');
        option.value = methodId;
        option.textContent = allInstallMethods[methodId];
        
        // Restore previous selection if it's still valid
        if (methodId === currentValue) {
            option.selected = true;
        }
        
        installMethodSelect.appendChild(option);
    });
    
    // If previous selection is no longer valid, clear it and update image
    if (currentValue && !allowedMethods.includes(currentValue)) {
        installMethodSelect.value = '';
        updateEquipmentImage();
    }
}

// Ensure equipment has images[]; migrate legacy single fields if present
function normalizeEquipmentImages(equipment) {
if (!Array.isArray(equipment.images)) equipment.images = [];

// 1) Drop invalid entries (no key, or not in this project's prefix)
const validPrefix = `users-equipment-images/${currentProjectId}/`;
equipment.images = equipment.images.filter(img =>
    img && typeof img.key === 'string' && img.key.startsWith(validPrefix)
);

// 2) Migrate legacy single-image fields once
if (equipment.imageKey && equipment.imageKey.startsWith(validPrefix)) {
    const already = equipment.images.some(it => it.key === equipment.imageKey);
    if (!already) {
    equipment.images.push({
        key: equipment.imageKey,
        url: equipment.imageUrl || null,
        signedUrl: equipment.imageUrlSigned || null,
        uploadedAt: Date.now()
    });
    }
}

// 3) De-dupe by key just in case
const seen = new Set();
equipment.images = equipment.images.filter(img => {
    if (seen.has(img.key)) return false;
    seen.add(img.key);
    return true;
});

return equipment.images;
}

// After a new upload succeeds, push into images[]
function addImageToEquipment(equipment, { key, viewUrlSigned, publicUrlHint }) {
normalizeEquipmentImages(equipment);
equipment.images.push({
    key,
    url: publicUrlHint || null,
    signedUrl: viewUrlSigned || null,
    uploadedAt: Date.now()
});
} 

async function getSignedImageUrl(projectId, key) {
const r = await fetch(
    `https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${projectId}/images/sign?key=${encodeURIComponent(key)}`,
    { headers: getAuthHeaders() }
);
if (!r.ok) throw new Error('Failed to sign image URL');
const { url } = await r.json();
return url;
}

// Helper function to hide all conditional fields initially
function hideAllConditionalFields() {
    // Traditional equipment form groups
    const traditionalFormGroups = [
        document.querySelector('label[for="nbcCategory"]')?.closest('.form-group'),
        document.querySelector('label[for="weight"]')?.closest('.form-group'),
        document.querySelector('label[for="dimension"]')?.closest('.form-group'),
        document.querySelector('label[for="numberOfAnchors"]')?.closest('.form-group'),
        document.querySelector('label[for="anchorType"]')?.closest('.form-group'),
        document.querySelector('label[for="anchorDiameter"]')?.closest('.form-group'),
        document.querySelector('label[for="hx"]')?.closest('.form-group'),
        document.getElementById('slabThicknessGroup'),
        document.getElementById('fcGroup'),
        document.getElementById('mountingTypeGroup'),
        document.getElementById('isolatorWidthGroup'),
        document.getElementById('restraintHeightGroup'),
        document.getElementById('edgeDistancesGroup'),
        document.getElementById('edgeDistanceBGroup'),
        document.getElementById('numberOfIsolatorsGroup')
    ].filter(Boolean);
    
    traditionalFormGroups.forEach(group => {
        if (group) {
            group.style.display = 'none';
            const inputs = group.querySelectorAll('input[required], select[required]');
            inputs.forEach(input => {
                input.removeAttribute('required');
                input.setAttribute('data-was-required', 'true');
            });
        }
    });
    
    // Piping specific form groups
    const pipingFormGroups = [
        document.getElementById('pipeTypeGroup'),
        document.getElementById('pipingFieldsGroup'),
        document.getElementById('pipeDiameterGroup'),
        document.getElementById('supportTypeGroup'),
        document.getElementById('structureTypeGroup')
    ].filter(Boolean);
    
    pipingFormGroups.forEach(group => {
        if (group) {
            group.style.display = 'none';
            const inputs = group.querySelectorAll('input, select');
            inputs.forEach(input => {
                input.removeAttribute('required');
            });
        }
    });
    
    // Always keep building height (hn) visible and required - needed for all equipment
    const hnGroup = document.querySelector('label[for="hn"]')?.closest('.form-group');
    if (hnGroup) {
        hnGroup.style.display = 'block';
        const hnInput = document.getElementById('hn');
        if (hnInput) {
            hnInput.setAttribute('required', 'required');
        }
    }

    // Always keep NBC Category visible and required
    const nbcCategoryGroup = document.querySelector('label[for="nbcCategory"]')?.closest('.form-group');
    if (nbcCategoryGroup) {
        nbcCategoryGroup.style.display = 'block';
        const nbcCategoryInput = document.getElementById('nbcCategory');
        if (nbcCategoryInput) {
            nbcCategoryInput.setAttribute('required', 'required');
        }
    }
    
    // Initialize NBC Category options for non-pipe equipment by default
    populateNBCCategoryOptions(false);

}

// Helper function to generate image URL with specified extension
function getEquipmentImageUrl(equipmentType, pipeType, installMethod, projectDomain, preferPng = false) {
    const extension = preferPng ? 'png' : 'jpg';
    
    if (equipmentType === 'Pipe') {
        if (!pipeType) return null;
        
        const pipeTypeMap = {
            'Steel_Pipe': 'Steel',
            'Copper_Pipe': 'Copper', 
            'PVC_Pipe': 'PVC',
            'No_Hub_Pipe': 'NoHub'
        };
        
        const mappedPipeType = pipeTypeMap[pipeType] || pipeType;
        return `${s3BaseUrl}piping/Pipe_${mappedPipeType}.${extension}`;
    } else {
        const domainMapping = equipmentMappings[projectDomain];
        if (!domainMapping) return null;

        const equipmentCode = domainMapping.equipmentMap[equipmentType];
        if (!equipmentCode) return null;
        
        if (projectDomain === 'electricity') {
            return `${s3BaseUrl}electricity/${domainMapping.domainCode}_${equipmentCode}_${installMethod}.${extension}`;
        } else {
            return `${s3BaseUrl}${domainMapping.domainCode}_${equipmentCode}_${installMethod}.${extension}`;
        }
    }
}

// Helper function to try both JPG and PNG formats
async function getWorkingImageUrl(equipmentType, pipeType, installMethod, projectDomain) {
    // Try JPG first
    const jpgUrl = getEquipmentImageUrl(equipmentType, pipeType, installMethod, projectDomain, false);
    if (jpgUrl) {
        try {
            const jpgResponse = await fetch(jpgUrl, { method: 'HEAD' });
            if (jpgResponse.ok) {
                return jpgUrl;
            }
        } catch (error) {
            console.log('JPG not found, trying PNG...');
        }
    }
    
    // Try PNG as fallback
    const pngUrl = getEquipmentImageUrl(equipmentType, pipeType, installMethod, projectDomain, true);
    if (pngUrl) {
        try {
            const pngResponse = await fetch(pngUrl, { method: 'HEAD' });
            if (pngResponse.ok) {
                return pngUrl;
            }
        } catch (error) {
            console.log('PNG also not found');
        }
    }
    
    return null; // Neither format found
}

// Updated updateEquipmentImage function with JPG/PNG fallback
async function updateEquipmentImage() {
    console.log('🖼️ updateEquipmentImage() called');
    
    const equipmentImageElement = document.getElementById('equipmentImage');
    const imagePlaceholder = document.getElementById('imagePlaceholder');
    
    if (!equipmentImageElement || !imagePlaceholder) {
        console.log('Image elements not found, skipping image update');
        return;
    }

    const projectDomain = document.getElementById('projectDomain')?.textContent?.toLowerCase() || 'electricity';
    const equipment = document.getElementById('equipment')?.value;
    const pipeType = document.getElementById('pipeType')?.value;
    const installMethod = document.getElementById('installMethod')?.value;
    
    console.log('📋 Current selections:', { projectDomain, equipment, pipeType, installMethod });

    if (!equipment || !installMethod) {
        console.log('⚠️ Missing equipment or installation method, showing placeholder');
        equipmentImageElement.style.display = 'none';
        imagePlaceholder.style.display = 'block';
        return;
    }

    // Special handling for pipes
    if (equipment === 'Pipe') {
        if (!pipeType) {
            console.log('⚠️ Pipe selected but no pipe type chosen');
            equipmentImageElement.style.display = 'none';
            imagePlaceholder.innerHTML = `
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ffc107; margin-bottom: 10px; display: block;"></i>
                Please select a pipe type
            `;
            imagePlaceholder.style.display = 'block';
            return;
        }
    }
    
    try {
        // Try to get working image URL (JPG first, then PNG)
        const fullImageUrl = await getWorkingImageUrl(equipment, pipeType, installMethod, projectDomain);
        
        if (fullImageUrl) {
            console.log('🔗 Using image URL:', fullImageUrl);
            
            imagePlaceholder.style.display = 'none';
            equipmentImageElement.style.display = 'block';
            equipmentImageElement.src = fullImageUrl;
            equipmentImageElement.alt = equipment === 'Pipe' ? `Image of ${pipeType} pipe` : `Image of ${equipment} with installation method ${installMethod}`;
            
            equipmentImageElement.onload = function() {
                console.log('✅ Image loaded successfully:', fullImageUrl);
                // Add lightbox click handler
                this.style.cursor = 'pointer';
                this.onclick = () => window.openEquipLightbox(fullImageUrl);
            };
            
            equipmentImageElement.onerror = function() {
                console.log('❌ Image failed to load even after fallback check:', fullImageUrl);
                this.style.display = 'none';
                imagePlaceholder.innerHTML = `
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ffc107; margin-bottom: 10px; display: block;"></i>
                    Image not available
                `;
                imagePlaceholder.style.display = 'block';
            };
        } else {
            console.log('❌ No image found in either JPG or PNG format');
            equipmentImageElement.style.display = 'none';
            const imageName = getImageName(equipment, pipeType, installMethod, projectDomain);
            imagePlaceholder.innerHTML = `
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ffc107; margin-bottom: 10px; display: block;"></i>
                Can't find ${imageName || 'image'}
            `;
            imagePlaceholder.style.display = 'block';
        }
    } catch (error) {
        console.error('Error in updateEquipmentImage:', error);
        equipmentImageElement.style.display = 'none';
        imagePlaceholder.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ffc107; margin-bottom: 10px; display: block;"></i>
            Error loading image
        `;
        imagePlaceholder.style.display = 'block';
    }
}

// Event listeners to update image when selections change
function setupImageEventListeners() {
    const equipmentSelect = document.getElementById('equipment');
    const pipeTypeSelect = document.getElementById('pipeType');
    const installMethodSelect = document.getElementById('installMethod');
    const anchorTypeSelect = document.getElementById('anchorType');
    
    if (equipmentSelect) {
        equipmentSelect.addEventListener('change', function() {
            handleEquipmentChange();
            updateEquipmentImage();
        });
    }
    
    if (pipeTypeSelect) {
        pipeTypeSelect.addEventListener('change', updateEquipmentImage);
    }
    
    if (installMethodSelect) {
        installMethodSelect.addEventListener('change', function() {
            updateEquipmentImage();
            toggleMountingTypeField();
            toggleSlabCeilingFields();
        });
    }

    const mountingTypeSelect = document.getElementById('mountingType');
    if (mountingTypeSelect) {
        mountingTypeSelect.addEventListener('change', toggleMountingTypeField);
    }

    if (anchorTypeSelect) {
        anchorTypeSelect.addEventListener('change', updateAnchorDiameterOptions);
    }
}

// Function to populate NBC Category options based on equipment type
function populateNBCCategoryOptions(isPipe = false) {
    const nbcCategorySelect = document.getElementById('nbcCategory');
    if (!nbcCategorySelect) return;
    
    // Clear existing options
    nbcCategorySelect.innerHTML = '<option value="">Select NBC category...</option>';
    
    if (isPipe) {
        // For pipes, only show categories 15 and 16, default to 15
        const option15 = document.createElement('option');
        option15.value = '15';
        option15.textContent = `15 - ${nbcCategoryData['15'].description}`;
        option15.selected = true; // Default to 15
        nbcCategorySelect.appendChild(option15);
        
        const option16 = document.createElement('option');
        option16.value = '16';
        option16.textContent = `16 - ${nbcCategoryData['16'].description}`;
        nbcCategorySelect.appendChild(option16);
    } else {
        // For all other equipment, show all categories, default to 11-rigid
        Object.keys(nbcCategoryData).forEach(categoryKey => {
            const category = nbcCategoryData[categoryKey];
            const option = document.createElement('option');
            option.value = categoryKey;
            option.textContent = `${categoryKey} - ${category.description}`;
            
            // Set 11-rigid as default for non-pipe equipment
            if (categoryKey === '11-rigid') {
                option.selected = true;
            }
            
            nbcCategorySelect.appendChild(option);
        });
    }
}

function handleEquipmentChange() {
    const equipment = document.getElementById('equipment').value;
    const domain = document.getElementById('projectDomain')?.textContent?.toLowerCase() || 'electricity';
    const isPipe = equipment === 'Pipe';
    
    // Show/hide pipe type field
    const pipeTypeGroup = document.getElementById('pipeTypeGroup');
    if (pipeTypeGroup) {
        pipeTypeGroup.style.display = isPipe ? 'block' : 'none';
        const pipeTypeSelect = document.getElementById('pipeType');
        if (pipeTypeSelect) {
            if (isPipe) {
                pipeTypeSelect.setAttribute('required', 'required');
            } else {
                pipeTypeSelect.removeAttribute('required');
                pipeTypeSelect.value = ''; // Clear selection
            }
        }
    }
    
    // Populate NBC Category options based on equipment type
    populateNBCCategoryOptions(isPipe);
    
    // Show/hide form sections based on equipment type
    showHideFormSections(isPipe);
    
    // Update install method options based on equipment selection
    if (!isPipe) {
        populateInstallMethodOptions(domain, equipment);
    }
    
    // Set default install method for pipes
    if (isPipe) {
        const installMethodSelect = document.getElementById('installMethod');
        if (installMethodSelect) {
            installMethodSelect.value = '4'; // Fixed to Ceiling
            installMethodSelect.dispatchEvent(new Event('change')); // Trigger change event
        }
    }
}
    
    // Handle NBC Category restrictions for pipes
    const nbcCategorySelect = document.getElementById('nbcCategory');
    if (nbcCategorySelect) {
        if (isPipe) {
            // For pipes, only show categories 15 and 16
            nbcCategorySelect.innerHTML = `
                <option value="15" selected>15 - Pipes, ducts (including contents)</option>
                <option value="16">16 - Pipes, ducts containing toxic or explosive materials</option>
            `;
        } else {
            // Restore all NBC categories for non-pipe equipment
            nbcCategorySelect.innerHTML = `
                <option value="1">1 - All exterior and interior walls except those in Category 2 or 3</option>
                <option value="2">2 - Cantilever parapet and other cantilever walls except retaining walls</option>
                <option value="3">3 - Exterior and interior ornamentations and appendages</option>
                <option value="5">5 - Towers, chimneys, smokestacks and penthouses when connected to or forming part of a building</option>
                <option value="6">6 - Horizontally cantilevered floors, balconies, beams, etc.</option>
                <option value="7">7 - Suspended ceilings, light fixtures and other attachments to ceilings with independent vertical support</option>
                <option value="8">8 - Masonry veneer connections</option>
                <option value="9">9 - Access floors</option>
                <option value="10">10 - Masonry or concrete fences more than 1.8 m tall</option>
                <option value="11-rigid" selected>11 - Machinery, fixtures, equipment and tanks (rigid and rigidly connected)</option>
                <option value="11-flexible">11 - Machinery, fixtures, equipment and tanks (flexible or flexibly connected)</option>
                <option value="12-rigid">12 - Machinery with toxic/explosive materials (rigid and rigidly connected)</option>
                <option value="12-flexible">12 - Machinery with toxic/explosive materials (flexible or flexibly connected)</option>
                <option value="13">13 - Flat bottom tanks attached directly to a floor at or below grade</option>
                <option value="14">14 - Flat bottom tanks with toxic/explosive materials at or below grade</option>
                <option value="15">15 - Pipes, ducts (including contents)</option>
                <option value="16">16 - Pipes, ducts containing toxic or explosive materials</option>
                <option value="17">17 - Electrical cable trays, bus ducts, conduits</option>
                <option value="18">18 - Rigid components with ductile material and connections</option>
                <option value="19">19 - Rigid components with non-ductile material or connections</option>
                <option value="20">20 - Flexible components with ductile material and connections</option>
                <option value="21">21 - Flexible components with non-ductile material or connections</option>
                <option value="22-machinery">22 - Elevators and escalators (machinery and equipment)</option>
                <option value="22-rails">22 - Elevators and escalators (elevator rails)</option>
                <option value="23">23 - Floor-mounted steel pallet storage racks</option>
                <option value="24">24 - Floor-mounted steel pallet storage racks with toxic/explosive materials</option>
            `;
        }
    }
    
    // Show/hide form sections based on equipment type
    showHideFormSections(isPipe);
    
    // Set default install method for pipes
    if (isPipe) {
        const installMethodSelect = document.getElementById('installMethod');
        if (installMethodSelect) {
            installMethodSelect.value = '4'; // Fixed to Ceiling
            installMethodSelect.dispatchEvent(new Event('change')); // Trigger change event
        }
    }

// Function to show/hide form sections based on equipment type
function showHideFormSections(isPipe) {
    // Traditional equipment form groups (hide for pipes)
    const traditionalFormGroups = [
        { element: document.getElementById('weightGroup'), required: ['weight'] },
        { element: document.getElementById('dimensionGroup'), required: ['height', 'width', 'length'] },
        { element: document.getElementById('hxGroup'), required: ['hx'] },
        { element: document.getElementById('numberOfAnchorsGroup'), required: ['numberOfAnchors'] },
        { element: document.getElementById('anchorTypeGroup'), required: ['anchorType'] },
        { element: document.getElementById('anchorDiameterGroup'), required: ['anchorDiameter'] },
        { element: document.getElementById('slabThicknessGroup'), required: [] },
        { element: document.getElementById('fcGroup'), required: [] },
        { element: document.getElementById('mountingTypeGroup'), required: [] },
        { element: document.getElementById('isolatorWidthGroup'), required: [] },
        { element: document.getElementById('restraintHeightGroup'), required: [] },
        { element: document.getElementById('edgeDistancesGroup'), required: [] },
        { element: document.getElementById('edgeDistanceBGroup'), required: [] },
        { element: document.getElementById('numberOfIsolatorsGroup'), required: [] }
    ];
    
    traditionalFormGroups.forEach(group => {
        if (group.element) {
            group.element.style.display = isPipe ? 'none' : 'block';
            
            // Handle required attributes for each field in the group
            group.required.forEach(fieldId => {
                const input = document.getElementById(fieldId);
                if (input) {
                    if (isPipe) {
                        input.removeAttribute('required');
                        input.setAttribute('data-was-required', 'true');
                    } else if (input.getAttribute('data-was-required')) {
                        input.setAttribute('required', 'required');
                        input.removeAttribute('data-was-required');
                    }
                }
            });
        }
    });
    
    // Piping specific form groups (show only for pipes)
    const pipingFormGroups = [
        { element: document.getElementById('pipingFieldsGroup'), required: ['pipeWeightPerFoot'] },
        { element: document.getElementById('pipeDiameterGroup'), required: ['pipeDiameter'] },
        { element: document.getElementById('supportTypeGroup'), required: [] },
        { element: document.getElementById('structureTypeGroup'), required: [] }
    ];
    
    pipingFormGroups.forEach(group => {
        if (group.element) {
            group.element.style.display = isPipe ? 'block' : 'none';
            
            // Handle required attributes for piping fields
            group.required.forEach(fieldId => {
                const input = document.getElementById(fieldId);
                if (input) {
                    if (isPipe) {
                        input.setAttribute('required', 'required');
                    } else {
                        input.removeAttribute('required');
                    }
                }
            });
        }
    });
    
    // Slab thickness - show for pipes if install method is slab/ceiling
    const installMethod = document.getElementById('installMethod').value;
    const slabThicknessGroup = document.getElementById('slabThicknessGroup');
    if (slabThicknessGroup && isPipe) {
        if (installMethod === '1' || installMethod === '4') { // Fixed to Slab or Ceiling
            slabThicknessGroup.style.display = 'block';
        } else {
            slabThicknessGroup.style.display = 'none';
        }
    }
}
    
    // Keep building height (hn) visible for both types - it's always needed
    const hnGroup = document.querySelector('label[for="hn"]')?.closest('.form-group');
    if (hnGroup) {
        hnGroup.style.display = 'block';
        const hnInput = document.getElementById('hn');
        if (hnInput) {
            hnInput.setAttribute('required', 'required');
        }
    }

// Function to show/hide mounting type field based on install method
function toggleMountingTypeField() {
    const installMethod = document.getElementById('installMethod')?.value;
    const equipment = document.getElementById('equipment')?.value;
    const isPipe = equipment === 'Pipe';
    const mountingType = document.getElementById('mountingType')?.value;
    const mountingTypeGroup = document.getElementById('mountingTypeGroup');
    const isolatorWidthGroup = document.getElementById('isolatorWidthGroup');
    const restraintHeightGroup = document.getElementById('restraintHeightGroup');
    const edgeDistancesGroup = document.getElementById('edgeDistancesGroup');
    const edgeDistanceBGroup = document.getElementById('edgeDistanceBGroup');
    const numberOfIsolatorsGroup = document.getElementById('numberOfIsolatorsGroup');
    
    // Hide mounting type for pipes OR for wall mounting
    if (isPipe || !installMethod || installMethod === '2') {
        // Hide mounting type and all related fields
        if (mountingTypeGroup) mountingTypeGroup.style.display = 'none';
        if (isolatorWidthGroup) isolatorWidthGroup.style.display = 'none';
        if (restraintHeightGroup) restraintHeightGroup.style.display = 'none';
        if (edgeDistancesGroup) edgeDistancesGroup.style.display = 'none';
        if (edgeDistanceBGroup) edgeDistanceBGroup.style.display = 'none';
        if (numberOfIsolatorsGroup) numberOfIsolatorsGroup.style.display = 'none';
    } else {
        // Show mounting type field for traditional equipment (not pipes) and not wall mounting
        if (mountingTypeGroup) mountingTypeGroup.style.display = 'block';
        
        // Show additional fields based on mounting type
        if (['type-3-2', 'type-3-5a', 'type-3-10'].includes(mountingType)) {
            // Need isolator width and height (two-bolt arrangements)
            if (isolatorWidthGroup) isolatorWidthGroup.style.display = 'block';
            if (restraintHeightGroup) restraintHeightGroup.style.display = 'block';
            if (edgeDistancesGroup) edgeDistancesGroup.style.display = 'none';
            if (edgeDistanceBGroup) edgeDistanceBGroup.style.display = 'none';
            if (numberOfIsolatorsGroup) numberOfIsolatorsGroup.style.display = 'block';
        } else if (['type-3-5b', 'type-3-5c', 'type-3-5d', 'type-3-11'].includes(mountingType)) {
            // Need edge distances and height (four-bolt arrangements)
            if (isolatorWidthGroup) isolatorWidthGroup.style.display = 'none';
            if (restraintHeightGroup) restraintHeightGroup.style.display = 'block';
            if (edgeDistancesGroup) edgeDistancesGroup.style.display = 'block';
            if (edgeDistanceBGroup) edgeDistanceBGroup.style.display = 'block';
            if (numberOfIsolatorsGroup) numberOfIsolatorsGroup.style.display = 'block';
        } else if (['type-3-1'].includes(mountingType)) {
            // Type 3-1 needs isolator count only
            if (isolatorWidthGroup) isolatorWidthGroup.style.display = 'none';
            if (restraintHeightGroup) restraintHeightGroup.style.display = 'none';
            if (edgeDistancesGroup) edgeDistancesGroup.style.display = 'none';
            if (edgeDistanceBGroup) edgeDistanceBGroup.style.display = 'none';
            if (numberOfIsolatorsGroup) numberOfIsolatorsGroup.style.display = 'block';
        } else {
            // Hide all additional fields for other types (including no-isolators)
            if (isolatorWidthGroup) isolatorWidthGroup.style.display = 'none';
            if (restraintHeightGroup) restraintHeightGroup.style.display = 'none';
            if (edgeDistancesGroup) edgeDistancesGroup.style.display = 'none';
            if (edgeDistanceBGroup) edgeDistanceBGroup.style.display = 'none';
            if (numberOfIsolatorsGroup) numberOfIsolatorsGroup.style.display = 'none';
        }
    }
}

// Function to update anchor diameter options based on anchor type
function updateAnchorDiameterOptions() {
    const anchorType = document.getElementById('anchorType').value;
    const anchorDiameterSelect = document.getElementById('anchorDiameter');
    
    // Clear existing options
    anchorDiameterSelect.innerHTML = '';
    
    if (!anchorType) {
        anchorDiameterSelect.innerHTML = '<option value="">Select anchor type first...</option>';
        return;
    }
    
    // Add default option
    anchorDiameterSelect.innerHTML = '<option value="">Select diameter...</option>';
    
    let diameters = [];
    
    if (anchorType === 'expansion') {
        // KWIK BOLT TZ2 Expansion anchor diameters
        diameters = ['1/4', '3/8', '1/2', '5/8', '3/4', '1'];
    } else if (anchorType === 'screw') {
        // KWIK HUS EZ Screw anchor diameters
        diameters = ['1/4', '3/8', '1/2', '5/8', '3/4'];
    }
    
    // Add diameter options
    diameters.forEach(diameter => {
        const option = document.createElement('option');
        option.value = diameter;
        option.textContent = diameter + '"';
        anchorDiameterSelect.appendChild(option);
    });
}

// Function to toggle slab/ceiling specific fields
function toggleSlabCeilingFields() {
    const installMethod = document.getElementById('installMethod').value;
    const equipment = document.getElementById('equipment')?.value;
    const isPipe = equipment === 'Pipe';
    const slabThicknessGroup = document.getElementById('slabThicknessGroup');
    const fcGroup = document.getElementById('fcGroup');
    
    // Show fields for "Fixed to Slab" (1) or "Fixed to Ceiling" (4)
    // BUT NOT for pipes (pipes don't need f'c)
    if ((installMethod === '1' || installMethod === '4') && !isPipe) {
        slabThicknessGroup.style.display = 'block';
        fcGroup.style.display = 'block';
    } else if ((installMethod === '1' || installMethod === '4') && isPipe) {
        // For pipes, only show slab thickness, not f'c
        slabThicknessGroup.style.display = 'block';
        fcGroup.style.display = 'none';
    } else {
        slabThicknessGroup.style.display = 'none';
        fcGroup.style.display = 'none';
    }
}

function canModifyProject() {
    return !!(currentUser && currentUser.email);
}

// Function to calculate CFS (Coefficient of Lateral Seismic Force)
function calculateCFS(project, equipmentLevel, totalLevels) {
    const constant = 0.3;
    const Fa = project.F02 || 1.05;
    const Sa_02 = project.maxSa0_2 || 0.6;
    const IE = getRiskCoefficientIE(project.riskCategory);
    const Ax = getHeightCoefficient(equipmentLevel, totalLevels);
    
    const cfs = constant * Fa * Sa_02 * IE * Ax;
    
    return {
        cfs: parseFloat(cfs.toFixed(4)),
        formula: {
            constant,
            Fa,
            Sa_02,
            IE,
            Ax
        }
    };
}

function getHeightCoefficient(level, totalLevels) {
    if (!level || !totalLevels) return 1;
    
    const currentLevel = parseInt(level);
    const totalLevelsInt = parseInt(totalLevels);
    
    if (currentLevel === 1) return 1;
    else if (currentLevel === totalLevelsInt) return 3;
    else return 2;
}

function calculateLateralSeismicForce(cfs, weight) {
    if (!weight || isNaN(weight)) return 0;
    return parseFloat((cfs * parseFloat(weight)).toFixed(2));
}

function getRiskCoefficientIE(riskCategory) {
    const ieCoefficients = {
        'Normal': 1.0,
        'High': 1.3,
        'Protection': 1.5
    };
    return ieCoefficients[riskCategory] || 1.0;
}

function calculateAx(hx, hn) {
    if (!hx || !hn || hx < 0 || hn <= 0) return 1;
    return 1 + (2 * hx / hn);
}

function calculateSp(Cp, Ar, Ax, Rp) {
    const sp = (Cp * Ar * Ax) / Rp;
    return Math.max(0.7, Math.min(4.0, sp));
}

function calculateVp(project, equipment) {
    const categoryData = nbcCategoryData[equipment.nbcCategory];
    if (!categoryData) {
        console.error('Invalid NBC category:', equipment.nbcCategory);
        return { vp: 0, formula: {} };
    }

    const constant = 0.3;
    const Fa = project.F02 || 1.05;
    const Sa_02 = project.maxSa0_2 || 0.6;
    const IE = getRiskCoefficientIE(project.riskCategory);
    const Ax = calculateAx(equipment.hx, equipment.hn);
    const Sp = calculateSp(categoryData.Cp, categoryData.Ar, Ax, categoryData.Rp);
    const Wp = equipment.weight || 0;
    
    const vp = constant * Fa * Sa_02 * IE * Sp * Wp;
    
    return {
        vp: parseFloat(vp.toFixed(2)),
        formula: {
            constant,
            Fa,
            Sa_02,
            IE,
            Sp,
            Wp,
            Cp: categoryData.Cp,
            Ar: categoryData.Ar,
            Ax,
            Rp: categoryData.Rp
        }
    };
}

// Calculation detail functions
function showCFSCalculationDetails(equipment, project) {
    const cfsCalc = calculateCFS(project, equipment.level, equipment.totalLevels);
    
    const message = `CFS (COEFFICIENT OF LATERAL SEISMIC FORCE) CALCULATION

Formula: CFS = 0.3 × Fa × Sa(0.2) × IE × Ax

Values Used:
Constant = 0.3
Fa (Site Acceleration Coefficient) = ${cfsCalc.formula.Fa}
Sa(0.2) (Spectral Response Value) = ${cfsCalc.formula.Sa_02}
IE (Seismic Risk Coefficient) = ${cfsCalc.formula.IE}
Ax (Height Coefficient) = ${cfsCalc.formula.Ax}

Calculation:
CFS = 0.3 × ${cfsCalc.formula.Fa} × ${cfsCalc.formula.Sa_02} × ${cfsCalc.formula.IE} × ${cfsCalc.formula.Ax}
CFS = ${cfsCalc.cfs}`;
    
    alert(message);
}

function showLateralForceCalculationDetails(equipment, project) {
    const cfsCalc = calculateCFS(project, equipment.level, equipment.totalLevels);
    const force = calculateLateralSeismicForce(cfsCalc.cfs, equipment.weight);
    
    const message = `LATERAL SEISMIC FORCE CALCULATION

Formula: Force = CFS × Weight

Values Used:
CFS (Coefficient of Lateral Seismic Force) = ${cfsCalc.cfs}
Equipment Weight = ${equipment.weight || 'N/A'} kg

Calculation:
Force = ${cfsCalc.cfs} × ${equipment.weight || 0} = ${force} N`;
    
    alert(message);
}

function showVpCalculationDetails(equipment, project) {
    const vpCalc = calculateVp(project, equipment);
    
    const message = `Formula: Vp = 0.3 × Fa × Sa(0.2) × IE × Sp × Wp

NBC Category: ${equipment.nbcCategory}

Step 1: Calculate Sp = Cp × Ar × Ax / Rp
Cp (Component Factor) = ${vpCalc.formula.Cp}
Ar (Amplification Factor) = ${vpCalc.formula.Ar}
Ax (Height Factor) = ${vpCalc.formula.Ax} [calculated as 1 + 2(${equipment.hx}/${equipment.hn})]
Rp (Response Modification Factor) = ${vpCalc.formula.Rp}

Sp = ${vpCalc.formula.Cp} × ${vpCalc.formula.Ar} × ${vpCalc.formula.Ax} / ${vpCalc.formula.Rp} = ${vpCalc.formula.Sp}
(Limited between 0.7 and 4.0 per NBC requirements)

Step 2: Calculate Vp
Constant = ${vpCalc.formula.constant}
Fa (Site Acceleration Coefficient) = ${vpCalc.formula.Fa}
Sa(0.2) (Spectral Response Value) = ${vpCalc.formula.Sa_02}
IE (Importance Factor) = ${vpCalc.formula.IE}
Sp = ${vpCalc.formula.Sp}
Wp (Equipment Weight) = ${vpCalc.formula.Wp} kg

Vp = ${vpCalc.formula.constant} × ${vpCalc.formula.Fa} × ${vpCalc.formula.Sa_02} × ${vpCalc.formula.IE} × ${vpCalc.formula.Sp} × ${vpCalc.formula.Wp}
Vp = ${vpCalc.vp} N`;
    
    alert(message);
}

// Calculation detail functions for vibration isolators
function showPtCalculationDetails(equipment, project) {
    const calc = calculateOverturningForces(equipment, project);
    if (!calc || calc.mountingType === 'rigidly-mounted') {
        alert('This calculation only applies to vibration isolated equipment');
        return;
    }
    
    const mountingTypeText = calc.mountingType === 'type-3-2' ? 'Type 3-2 Vibration Isolators' : 'Type 3-1/3-5/3-10/3-11 Vibration Isolators/Snubbers';
    
    let message = `
Equipment: ${equipment.equipment}
Mounting Type: ${mountingTypeText}
`;

    if (calc.mountingType === 'type-3-2') {
        message += `Formula: Pt = (W - Fpv)/N - (Fph×h×(b2/2)×cos(θ))/Iyy - (Fph×h×(b1/2)×sin(θ))/Ixx

FORCES:
W (Equipment Weight) = ${calc.formula.weightLbs} lbs
Fpv (Vertical Seismic Force) = 0.2 × Sa(0.2) × W = ${calc.formula.Fpv} lbs
Fph (Horizontal Seismic Force) = CFS × W = ${calc.formula.Fph} lbs

MOMENT OF INERTIA:
Ixx = N(N+2)×b1²/[12(N-2)] = ${calc.formula.N}(${calc.formula.N}+2)×${calc.formula.b1}²/[12(${calc.formula.N}-2)] = ${calc.formula.Ixx}
Iyy = N×b2²/4 = ${calc.formula.N}×${calc.formula.b2}²/4 = ${calc.formula.Iyy}

WORST ANGLE:
θ = tan⁻¹(Iyy×b1)/(Ixx×b2) = tan⁻¹(${calc.formula.Iyy}×${calc.formula.b1})/(${calc.formula.Ixx}×${calc.formula.b2}) = ${calc.formula.theta}°

CALCULATION:
Term 1: (W - Fpv)/N = (${calc.formula.weightLbs} - ${calc.formula.Fpv})/${calc.formula.N} = ${((calc.formula.weightLbs - calc.formula.Fpv) / calc.formula.N).toFixed(2)} lbs
Term 2: (Fph×h×(b2/2)×cos(θ))/Iyy = (${calc.formula.Fph}×${calc.formula.h}×${calc.formula.b2/2}×cos(${calc.formula.theta}°))/${calc.formula.Iyy} = ${((calc.formula.Fph * calc.formula.h * (calc.formula.b2/2) * Math.cos(calc.formula.theta * Math.PI/180)) / calc.formula.Iyy).toFixed(2)} lbs
Term 3: (Fph×h×(b1/2)×sin(θ))/Ixx = (${calc.formula.Fph}×${calc.formula.h}×${calc.formula.b1/2}×sin(${calc.formula.theta}°))/${calc.formula.Ixx} = ${((calc.formula.Fph * calc.formula.h * (calc.formula.b1/2) * Math.sin(calc.formula.theta * Math.PI/180)) / calc.formula.Ixx).toFixed(2)} lbs

Pt = Term 1 - Term 2 - Term 3 = ${calc.Pt} lbs`;
    } else {
        message += `Formula: Pt = -Fpv/N - (Fph×h×(b2/2)×cos(θ))/Iyy - (Fph×h×(b1/2)×sin(θ))/Ixx

FORCES:
Fpv (Vertical Seismic Force) = 0.2 × Sa(0.2) × W = ${calc.formula.Fpv} lbs
Fph (Horizontal Seismic Force) = CFS × W = ${calc.formula.Fph} lbs

MOMENT OF INERTIA:
Ixx = N(N+2)×b1²/[12(N-2)] = ${calc.formula.Ixx}
Iyy = N×b2²/4 = ${calc.formula.Iyy}

WORST ANGLE:
θ = tan⁻¹(Iyy×b1)/(Ixx×b2) = ${calc.formula.theta}°

CALCULATION:
Term 1: -Fpv/N = -${calc.formula.Fpv}/${calc.formula.N} = ${(-calc.formula.Fpv / calc.formula.N).toFixed(2)} lbs
Term 2: (Fph×h×(b2/2)×cos(θ))/Iyy = ${((calc.formula.Fph * calc.formula.h * (calc.formula.b2/2) * Math.cos(calc.formula.theta * Math.PI/180)) / calc.formula.Iyy).toFixed(2)} lbs
Term 3: (Fph×h×(b1/2)×sin(θ))/Ixx = ${((calc.formula.Fph * calc.formula.h * (calc.formula.b1/2) * Math.sin(calc.formula.theta * Math.PI/180)) / calc.formula.Ixx).toFixed(2)} lbs

Pt = Term 1 - Term 2 - Term 3 = ${calc.Pt} lbs`;
    }
    
    alert(message);
}

function showPcCalculationDetails(equipment, project) {
    const calc = calculateOverturningForces(equipment, project);
    if (!calc || calc.mountingType === 'rigidly-mounted') {
        alert('This calculation only applies to vibration isolated equipment');
        return;
    }
    
    const mountingTypeText = calc.mountingType === 'type-3-2' ? 'Type 3-2 Vibration Isolators' : 'Type 3-1/3-5/3-10/3-11 Vibration Isolators/Snubbers';
    
    let message = `MAXIMUM COMPRESSION (Pc) CALCULATION

Equipment: ${equipment.equipment}
Mounting Type: ${mountingTypeText}

`;

    if (calc.mountingType === 'type-3-2') {
        message += `Formula: Pc = (W + Fpv)/N + (Fph×h×(b2/2)×cos(θ))/Iyy + (Fph×h×(b1/2)×sin(θ))/Ixx

FORCES:
W (Equipment Weight) = ${calc.formula.weightLbs} lbs
Fpv (Vertical Seismic Force) = 0.2 × Sa(0.2) × W = ${calc.formula.Fpv} lbs
Fph (Horizontal Seismic Force) = CFS × W = ${calc.formula.Fph} lbs

GEOMETRY & ANGLES:
(Same as Pt calculation - see Pt details for geometry)
θ = ${calc.formula.theta}°

CALCULATION:
Term 1: (W + Fpv)/N = (${calc.formula.weightLbs} + ${calc.formula.Fpv})/${calc.formula.N} = ${((calc.formula.weightLbs + calc.formula.Fpv) / calc.formula.N).toFixed(2)} lbs
Term 2: (Fph×h×(b2/2)×cos(θ))/Iyy = ${((calc.formula.Fph * calc.formula.h * (calc.formula.b2/2) * Math.cos(calc.formula.theta * Math.PI/180)) / calc.formula.Iyy).toFixed(2)} lbs
Term 3: (Fph×h×(b1/2)×sin(θ))/Ixx = ${((calc.formula.Fph * calc.formula.h * (calc.formula.b1/2) * Math.sin(calc.formula.theta * Math.PI/180)) / calc.formula.Ixx).toFixed(2)} lbs

Pc = Term 1 + Term 2 + Term 3 = ${calc.Pc} lbs`;
    } else {
        message += `Formula: Pc = Fpv/N + (Fph×h×(b2/2)×cos(θ))/Iyy + (Fph×h×(b1/2)×sin(θ))/Ixx

FORCES:
Fpv (Vertical Seismic Force) = 0.2 × Sa(0.2) × W = ${calc.formula.Fpv} lbs
Fph (Horizontal Seismic Force) = CFS × W = ${calc.formula.Fph} lbs
Note: Equipment weight NOT included in restoring force for this mounting type

GEOMETRY & ANGLES:
(Same as Pt calculation - see Pt details for geometry)
θ = ${calc.formula.theta}°

CALCULATION:
Term 1: Fpv/N = ${calc.formula.Fpv}/${calc.formula.N} = ${(calc.formula.Fpv / calc.formula.N).toFixed(2)} lbs
Term 2: (Fph×h×(b2/2)×cos(θ))/Iyy = ${((calc.formula.Fph * calc.formula.h * (calc.formula.b2/2) * Math.cos(calc.formula.theta * Math.PI/180)) / calc.formula.Iyy).toFixed(2)} lbs
Term 3: (Fph×h×(b1/2)×sin(θ))/Ixx = ${((calc.formula.Fph * calc.formula.h * (calc.formula.b1/2) * Math.sin(calc.formula.theta * Math.PI/180)) / calc.formula.Ixx).toFixed(2)} lbs

Pc = Term 1 + Term 2 + Term 3 = ${calc.Pc} lbs`;
    }
    
    alert(message);
}

function showPsCalculationDetails(equipment, project) {
    const calc = calculateOverturningForces(equipment, project);
    if (!calc || calc.mountingType === 'rigidly-mounted') {
        alert('This calculation only applies to vibration isolated equipment');
        return;
    }
    
    const mountingTypeText = calc.mountingType === 'type-3-2' ? 'Type 3-2 Vibration Isolators' : 'Type 3-1/3-5/3-10/3-11 Vibration Isolators/Snubbers';
    
    const message = `MAXIMUM SHEAR (Ps) CALCULATION

Equipment: ${equipment.equipment}
Mounting Type: ${mountingTypeText}

Formula: Ps = Fph/N

FORCES:
Fph (Horizontal Seismic Force) = CFS × W = ${calc.formula.Fph} lbs
N (Number of Anchors) = ${calc.formula.N}

CALCULATION:
Ps = Fph/N = ${calc.formula.Fph}/${calc.formula.N} = ${calc.Ps} lbs `;
    
    alert(message);
}

function renderEquipmentList() {
    try {
        console.log('=== renderEquipmentList() with overturning calculations START ===');
        
        const equipmentListDiv = document.getElementById('equipmentList');
        
        if (!equipmentListDiv) {
            console.error('equipmentList div not found!');
            return;
        }
        
        equipmentListDiv.innerHTML = '';

        const listHeader = document.createElement('div');
        listHeader.className = 'equipment-list-header';
        listHeader.textContent = `Equipment (${projectEquipment.length})`;
        equipmentListDiv.appendChild(listHeader);

        if (projectEquipment.length === 0) {
            equipmentListDiv.innerHTML = '<p>No equipment added yet.</p>';
            return;
        }

        projectEquipment.forEach((equipment, index) => {
            const equipmentCard = document.createElement('div');
            equipmentCard.className = 'equipment-card';
            
            // Get project data for calculations
            const projectType = document.getElementById('projectType').textContent.toLowerCase().trim();
            let riskCategory = 'Normal';
            if (['hospital', 'fire-station', 'government'].includes(projectType)) {
                riskCategory = 'Protection';
            } else if (['industrial', 'school'].includes(projectType)) {
                riskCategory = 'High';
            }
            
            const currentProject = {
                riskCategory: riskCategory,
                F02: parseFloat(document.getElementById('projectF02').textContent) || 1.05,
                maxSa0_2: parseFloat(document.getElementById('projectMaxSa0_2').textContent) || 0.6,
                S_DS: parseFloat(document.getElementById('projectSDS').textContent) || 0.4
            };
            
            // Calculate existing forces
            const cfsResult = calculateCFS(currentProject, equipment.level, equipment.totalLevels);
            const lateralForce = calculateLateralSeismicForce(cfsResult.cfs, equipment.weight);
            
            let vpResult = { vp: 'N/A' };
            let categoryData = null;

            // Always get categoryData if nbcCategory exists
            if (equipment.nbcCategory) {
                categoryData = nbcCategoryData[equipment.nbcCategory];
            }

            // Only calculate Vp if we have the required height data
            if (equipment.nbcCategory && equipment.hx !== undefined && equipment.hn !== undefined) {
                vpResult = calculateVp(currentProject, equipment);
            }
            
            // Calculate overturning forces only for rigid equipment
            let overturningResult = null;
            const rigidCategories = ['11-rigid', '12-rigid', '18', '19'];
            if (rigidCategories.includes(equipment.nbcCategory) && 
                equipment.numberOfAnchors && equipment.height && equipment.width) {
                overturningResult = calculateOverturningForces(equipment, currentProject);
            }
            
equipmentCard.innerHTML = `
    <div class="equipment-header">
        <div class="equipment-info-compact">
            <h4 title="Click to toggle details">
                ${equipment.equipment}
                ${(() => {
                    const requestInfo = getImageRequestInfo(equipment);
                    if (requestInfo) {
                        return `<i class="${requestInfo.icon}" 
                                style="color: ${requestInfo.color}; margin-left: 8px; font-size: 14px;" 
                                title="${requestInfo.tooltipText}"></i>`;
                    }
                    return '';
                })()}
            </h4>
            <div class="equipment-meta-compact">
                ${equipment.isPipe ? `
                    <span>Pipe: ${equipment.pipeDiameter || 'N/A'}</span>
                    <span class="meta-separator">•</span>
                    <span>Weight: ${equipment.pipeWeightPerFoot || 'N/A'} lb/ft</span>
                ` : `
                    <span>${equipment.anchorType ? getAnchorTypeText(equipment.anchorType) : 'N/A'}</span>
                    <span class="meta-separator">•</span>
                    <span>${equipment.numberOfAnchors || 'N/A'} anchors</span>
                    ${equipment.anchorDiameter ? `<span class="meta-separator">•</span><span>⌀ ${equipment.anchorDiameter}"</span>` : ''}
                `}
            </div>
        </div>
        <div class="equipment-actions-compact">
            <button class="details-btn" onclick="event.stopPropagation(); toggleEquipmentDetails(${index})">Details</button>
            ${canModifyProject() ? `
                ${!equipment.imageRequested ? `
                    <button class="upload-btn" onclick="event.stopPropagation(); triggerUploadImage(${index})">Upload Image</button>
                ` : `
                    <button class="upload-btn" onclick="event.stopPropagation(); triggerUploadImage(${index})">Upload Image</button>
                `}
                ${isAdmin ? `
                    <button class="${equipment.imageRequested ? 'cancel-request-btn' : 'request-btn'}" 
                            onclick="event.stopPropagation(); requestEquipmentImage(${index})"
                            style="background: ${equipment.imageRequested ? '#dc3545' : '#6f42c1'}; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.2s ease; min-width: 60px;">
                        ${equipment.imageRequested ? 'Cancel Request' : 'Request Image'}
                    </button>
                ` : ''}
                <button class="delete-btn" onclick="event.stopPropagation(); deleteEquipment(${index})">Delete</button>
                <input type="file" id="fileInput${index}" accept="image/*" style="display:none" 
                onchange="handleImageSelected(event, ${index})">
            ` : ''}
        </div>
    </div>

    <div class="equipment-details" id="equipmentDetails${index}">
        <div id="equipmentView${index}">
<!-- === Equipment Images Grid - Horizontal at top === -->
${(() => {
const images = normalizeEquipmentImages(equipment);
return `
    <div class="equip-images">
    <div class="equip-images-header">
        <span>Equipment Images</span>
    </div>
    ${images.length === 0 ? `
        <div style="font-size:12px;color:#666;">No images yet.</div>
    ` : `
        <div class="equip-thumbs">
        ${images.map((img, i) => `
            <div class="equip-thumb" tabindex="0" aria-label="View image">
            <img
            src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='80'><rect width='120' height='80' fill='%23eee'/><text x='10' y='45' font-size='12' fill='%23666'>Loading...</text></svg>"
            data-key="${img.key.replace(/"/g,'&quot;')}"
            alt="Equipment image ${i+1}"
            />
            ${canModifyProject() ? `
                <button class="thumb-delete" title="Delete image"
                        onclick="confirmDeleteImage(event, ${index}, '${img.key.replace(/'/g,"\\'")}')">Delete</button>
            ` : ``}
            </div>
        `).join('')}
        </div>
    `}
    </div>
`;
})()}

<div class="equipment-details-container">
    <div class="equipment-info-section">
                        ${equipment.isPipe ? `
                            <!-- Pipe specific fields -->
                            ${equipment.nbcCategory ? `<p><strong>NBC Category:</strong> ${equipment.nbcCategory} - ${categoryData ? categoryData.description : 'Unknown'}</p>` : ''}
                            <p><strong>Pipe Type:</strong> ${equipment.pipeType || equipment.equipment}</p>
                            <p><strong>Pipe Weight per Foot:</strong> ${equipment.pipeWeightPerFoot || 'N/A'} lb/ft</p>
                            <p><strong>Pipe Diameter:</strong> ${equipment.pipeDiameter || 'N/A'}</p>
                            <p><strong>Support Type:</strong> ${equipment.supportType || 'N/A'} | <strong>Structure Type:</strong> ${equipment.structureType || 'N/A'}</p>
                            <p><strong>Level:</strong> ${equipment.level}/${equipment.totalLevels} | <strong>Install Method:</strong> ${getInstallMethodText(equipment.installMethod)}</p>
                            ${equipment.hn !== undefined ? `<p><strong>Building Height:</strong> ${equipment.hn} m</p>` : ''}
                        ` : `
                            <!-- Traditional equipment fields -->
                            ${equipment.nbcCategory ? `<p><strong>NBC Category:</strong> ${equipment.nbcCategory} - ${categoryData ? categoryData.description : 'Unknown'}</p>` : ''}
                            <p><strong>Weight:</strong> ${equipment.weight || 'N/A'} ${equipment.weightUnit || 'kg'} | <strong>Dimensions:</strong> ${equipment.height}×${equipment.width}×${equipment.length} in</p>
                            <p><strong>Level:</strong> ${equipment.level}/${equipment.totalLevels} | <strong>Install Method:</strong> ${getInstallMethodText(equipment.installMethod)}</p>
                            ${equipment.mountingType ? `<p><strong>Mounting Type:</strong> ${getMountingTypeText(equipment.mountingType)}</p>` : ''}
                            ${equipment.anchorType ? `<p><strong>Anchor Type:</strong> ${getAnchorTypeText(equipment.anchorType)}</p>` : ''}
                            ${equipment.numberOfAnchors ? `<p><strong>Number of Anchors:</strong> ${equipment.numberOfAnchors}${equipment.anchorDiameter ? ` (⌀ ${equipment.anchorDiameter}")` : ''}</p>` : ''}
                            ${equipment.slabThickness ? `<p><strong>Slab Thickness:</strong> ${equipment.slabThickness}" | <strong>f'c:</strong> ${equipment.fc} psi</p>` : ''}
                            ${equipment.hx !== undefined && equipment.hn !== undefined ? `<p><strong>Height Above Base:</strong> ${equipment.hx} m | <strong>Building Height:</strong> ${equipment.hn} m</p>` : ''}
                        `}
                        
                        <p>
                            <strong>CFS:</strong> <span class="calculation-value cfs-value" title="Click to see CFS calculation details">${cfsResult.cfs}</span> | 
                            <strong>Lateral Force:</strong> <span class="calculation-value force-value" title="Click to see lateral force calculation details">${lateralForce} N</span>
                            ${equipment.nbcCategory ? ` | <strong>NBC Vp:</strong> <span class="calculation-value vp-value" title="Click to see NBC Vp calculation details">${vpResult.vp} N</span>` : ''}
                        </p>

                        ${(() => {
                            // Only show for pipe equipment
                            if (equipment.isPipe && equipment.pipeWeightPerFoot) {
                                const suspendedPiping = calculateSuspendedPipingBracing(equipment, currentProject);
                                return `
                                    <div class="suspended-piping-values" style="background: #f0f8ff; padding: 8px; border-radius: 4px; margin-top: 8px; border-left: 4px solid #8b5cf6;">
                                        <p><strong>Suspended Piping Bracing (ASHRAE Ch. 8):</strong></p>
                                        <p style="font-size: 12px; margin: 4px 0;">
                                            <strong>Pipe Weight:</strong> ${suspendedPiping.pipeWeight} lb/ft | 
                                            <strong>Seismic Level:</strong> ${suspendedPiping.seismicLevel}
                                        </p>
                                        <p style="font-size: 12px; margin: 4px 0;">
                                            <strong>Hanger Rod:</strong> <span class="calculation-value suspended-piping-value" title="Click to see complete specifications">${suspendedPiping.specifications.hangerRod.diameter}" dia. (${suspendedPiping.specifications.hangerRod.seismicLoad} lbs)</span> | 
                                            <strong>Max Unbraced:</strong> ${suspendedPiping.specifications.hangerRod.maxUnbraced}"
                                        </p>
                                        <p style="font-size: 12px; margin: 4px 0;">
                                            <strong>Solid Brace:</strong> ${suspendedPiping.specifications.solidBrace.steelAngle} steel angle | 
                                            <strong>Cable Brace:</strong> ${suspendedPiping.specifications.cableBrace.prestretched} lbs
                                        </p>
                                        ${suspendedPiping.exceedsTable ? '<p style="font-size: 11px; color: #ef4444;">⚠️ Pipe weight exceeds table limits</p>' : ''}
                                    </div>
                                `;
                            }
                            return '';
                        })()}
                    
                    ${overturningResult ? `
                        <div class="overturning-values">
                            <p><strong>Overturning Analysis (${overturningResult.mountingType === 'no-isolators' ? 'No Isolators' : 'Vibration Isolated Equipment'}):</strong></p>
                            ${overturningResult.mountingType === 'no-isolators' ? `
                                <p>
                                    <strong>OTM:</strong> <span class="calculation-value otm-value" title="Click to see OTM calculation details">${overturningResult.OTM} lb-in</span> | 
                                    <strong>RM:</strong> <span class="calculation-value rm-value" title="Click to see RM calculation details">${overturningResult.RM} lb-in</span> | 
                                    <strong>T:</strong> <span class="calculation-value tension-value" title="Click to see Tension calculation details">${overturningResult.T} lbs</span> | 
                                    <strong>V:</strong> <span class="calculation-value shear-value" title="Click to see Shear calculation details">${overturningResult.V} lbs</span>
                                </p>
                            ` : `
                                <p>
                                    <strong>Pt:</strong> <span class="calculation-value pt-value" title="Click to see maximum tension calculation details">${overturningResult.Pt} lbs</span> | 
                                    <strong>Pc:</strong> <span class="calculation-value pc-value" title="Click to see maximum compression calculation details">${overturningResult.Pc} lbs</span> | 
                                    <strong>Ps:</strong> <span class="calculation-value ps-value" title="Click to see maximum shear calculation details">${overturningResult.Ps} lbs</span>
                                </p>
                            `}
                        </div>
                    ` : ''}
                    
                    ${(() => {
                        const ashraeResult = calculateASHRAEAnchorBolts(equipment, currentProject);
                        return ashraeResult ? `
                            <div class="ashrae-values" style="background: #f0f8ff; padding: 8px; border-radius: 4px; margin-top: 8px; border-left: 4px solid #0066cc;">
                                <p><strong>ASHRAE Anchor Bolt Analysis (${ashraeResult.formulaType}):</strong></p>
                                <p>
                                    <strong>Tbolt:</strong> <span class="calculation-value ashrae-tbolt-value" title="Click to see ASHRAE Tbolt calculation details">${ashraeResult.Tbolt} lbs per bolt</span> | 
                                    <strong>Vbolt:</strong> <span class="calculation-value ashrae-vbolt-value" title="Click to see ASHRAE Vbolt calculation details">${ashraeResult.Vbolt} lbs per bolt</span>
                                </p>
                                ${ashraeResult.concreteAnalysis ? `
                                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ccc;">
                                        <p><strong>Structural Connection:</strong></p>
                                        <p style="font-size: 12px; margin: 4px 0;">
                                            <strong>Formula 1:</strong> <span class="calculation-value concrete-formula1-value" title="Click to see Formula 1 calculation details" style="color: ${ashraeResult.concreteAnalysis.formula1.pass ? '#16a34a' : '#ef4444'};">${ashraeResult.concreteAnalysis.formula1.value} ${ashraeResult.concreteAnalysis.formula1.pass ? '✅' : '❌'}</span> | 
                                            <strong>Formula 2:</strong> <span class="calculation-value concrete-formula2-value" title="Click to see Formula 2 calculation details" style="color: ${ashraeResult.concreteAnalysis.formula2.pass ? '#16a34a' : '#ef4444'};">${ashraeResult.concreteAnalysis.formula2.value} ${ashraeResult.concreteAnalysis.formula2.pass ? '✅' : '❌'}</span>
                                        </p>
                                        <p style="font-size: 11px; margin: 2px 0; color: ${ashraeResult.concreteAnalysis.overallPass ? '#16a34a' : '#ef4444'};">
                                            <strong>Overall Status:</strong> ${ashraeResult.concreteAnalysis.overallPass ? '✅ BOTH FORMULAS PASS' : '❌ ONE OR MORE FORMULAS FAIL'}
                                        </p>
                                    </div>
                                ` : ''}

                                ${ashraeResult.embedmentAnalysis ? `
                                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ccc;">
                                        <p><strong>Minimum Embedment Analysis (${ashraeResult.embedmentAnalysis.anchorType === 'screw' ? 'Screw Anchor' : 'Expansion Anchor'}):</strong></p>
                                        ${ashraeResult.embedmentAnalysis.recommendLargerDiameter ? `
                                            <p style="font-size: 12px; margin: 4px 0; color: #ef4444;">
                                                <strong>⚠️ RECOMMENDATION:</strong> <span class="calculation-value embedment-recommendation-value" title="Click to see embedment analysis details">Use larger anchor diameter</span>
                                            </p>
                                            <p style="font-size: 11px; margin: 2px 0; color: #ef4444;">
                                                Current ${ashraeResult.embedmentAnalysis.anchorDiameter}" diameter insufficient for loads
                                            </p>
                                        ` : `
                                            <p style="font-size: 12px; margin: 4px 0;">
                                                <strong>Concrete:</strong> <span class="calculation-value concrete-embedment-value" title="Click to see concrete embedment details">${ashraeResult.embedmentAnalysis.minConcreteEmbedment}" min</span> | 
                                                <strong>Steel:</strong> <span class="calculation-value steel-embedment-value" title="Click to see steel embedment details">${ashraeResult.embedmentAnalysis.minSteelEmbedment}" min</span>
                                            </p>
                                            <p style="font-size: 11px; margin: 2px 0; color: #16a34a;">
                                                <strong>Required Min Embedment:</strong> <span class="calculation-value final-embedment-value" title="Click to see final embedment calculation">${ashraeResult.embedmentAnalysis.finalMinEmbedment}"</span>
                                            </p>
                                        `}
                                    </div>
` : ''}
                            </div>
                        ` : '';
                    })()}

                    ${(() => {
                        // Only show for suspended equipment (Fixed to Ceiling)
                        if (equipment.installMethod === '4') {
                            const suspendedBracing = calculateSuspendedEquipmentBracing(equipment, currentProject);
                            const aircraftCable = suspendedBracing.shoppingList.aircraftCableDetails;
                            return `
                                <div class="suspended-bracing-values" style="background: #f0f8ff; padding: 8px; border-radius: 4px; margin-top: 8px; border-left: 4px solid #6f42c1;">
                                    <p><strong>Suspended Equipment Bracing (ASHRAE Ch. 10):</strong></p>
                                    <p style="font-size: 12px; margin: 4px 0;">
                                        <strong>Hanger Rod:</strong> <span class="calculation-value suspended-hanger-value" title="Click to see hanger rod specifications">${suspendedBracing.specifications.hangerRod.diameter}" dia. (${suspendedBracing.specifications.hangerRod.maxUnbracedLength}" max unbraced)</span> | 
                                        <strong>Aircraft Cable:</strong> <span class="calculation-value suspended-brace-value" title="Click to see complete bracing specifications">⌀ ${aircraftCable.diameter}" (${aircraftCable.breakingStrength} lbs)${aircraftCable.insufficient ? ' ⚠️' : ''}</span>
                                    </p>
                                    <p style="font-size: 11px; margin: 2px 0; color: #6f42c1;">
                                        <strong>Seismic Level:</strong> ${suspendedBracing.seismicLevel} | <strong>Weight:</strong> ${suspendedBracing.weightLbs} lbs
                                    </p>
                                </div>
                            `;
                        }
                        return '';
                    })()}
                    
                    ${canModifyProject() ? `
                        <div style="margin-top: 15px;">
                            <button class="edit-btn" onclick="editEquipment(${index})" style="background: #ffc107; color: #212529; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">
                                <i class="fas fa-edit"></i> Edit Equipment
                            </button>
                        </div>
                    ` : ''}
                </div>
                
                <div class="equipment-image-section">
                    <h4 style="margin-bottom: 10px; color: #333;">Equipment Image</h4>
                    <div class="equipment-detail-image-container" id="equipmentDetailImage${index}">
                        <div class="equipment-detail-placeholder" id="equipmentDetailPlaceholder${index}">
                            <i class="fas fa-image" style="font-size: 32px; color: #ccc; margin-bottom: 8px; display: block;"></i>
                            Loading image...
                        </div>
                    </div>
                </div>
            </div>
        </div>
                    
                    <div id="equipmentEdit${index}" style="display: none;">
                        <form id="equipmentEditForm${index}" onsubmit="saveEquipmentEdit(${index}, event)">
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                                ${equipment.isPipe ? `
                                    <!-- Pipe Edit Fields -->
                                    <div>
                                        <label><strong>Pipe Type:</strong></label>
                                        <select id="editPipeType${index}" style="width: 100%; padding: 5px;">
                                            <option value="Steel_Pipe" ${equipment.pipeType === 'Steel_Pipe' ? 'selected' : ''}>Steel Pipe</option>
                                            <option value="Copper_Pipe" ${equipment.pipeType === 'Copper_Pipe' ? 'selected' : ''}>Copper Pipe</option>
                                            <option value="PVC_Pipe" ${equipment.pipeType === 'PVC_Pipe' ? 'selected' : ''}>PVC Pipe</option>
                                            <option value="No_Hub_Pipe" ${equipment.pipeType === 'No_Hub_Pipe' ? 'selected' : ''}>No Hub Pipe</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label><strong>NBC Category:</strong></label>
                                        <select id="editNbcCategory${index}" style="width: 100%; padding: 5px;">
                                            <option value="15" ${equipment.nbcCategory === '15' ? 'selected' : ''}>15 - Pipes, ducts (including contents)</option>
                                            <option value="16" ${equipment.nbcCategory === '16' ? 'selected' : ''}>16 - Pipes, ducts containing toxic or explosive materials</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label><strong>Pipe Weight per Foot (lb/ft):</strong></label>
                                        <input type="number" id="editPipeWeightPerFoot${index}" value="${equipment.pipeWeightPerFoot || ''}" step="0.1" style="width: 100%; padding: 5px;">
                                    </div>
                                    <div>
                                        <label><strong>Pipe Diameter:</strong></label>
                                        <select id="editPipeDiameter${index}" style="width: 100%; padding: 5px;">
                                            <option value="">Select diameter...</option>
                                            <option value="1" ${equipment.pipeDiameter === '1' ? 'selected' : ''}>1"</option>
                                            <option value="1-1/4" ${equipment.pipeDiameter === '1-1/4' ? 'selected' : ''}>1-1/4"</option>
                                            <option value="1-1/2" ${equipment.pipeDiameter === '1-1/2' ? 'selected' : ''}>1-1/2"</option>
                                            <option value="2" ${equipment.pipeDiameter === '2' ? 'selected' : ''}>2"</option>
                                            <option value="2-1/2" ${equipment.pipeDiameter === '2-1/2' ? 'selected' : ''}>2-1/2"</option>
                                            <option value="3" ${equipment.pipeDiameter === '3' ? 'selected' : ''}>3"</option>
                                            <option value="4" ${equipment.pipeDiameter === '4' ? 'selected' : ''}>4"</option>
                                            <option value="5" ${equipment.pipeDiameter === '5' ? 'selected' : ''}>5"</option>
                                            <option value="6" ${equipment.pipeDiameter === '6' ? 'selected' : ''}>6"</option>
                                            <option value="8" ${equipment.pipeDiameter === '8' ? 'selected' : ''}>8"</option>
                                            <option value="10" ${equipment.pipeDiameter === '10' ? 'selected' : ''}>10"</option>
                                            <option value="12" ${equipment.pipeDiameter === '12' ? 'selected' : ''}>12"</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label><strong>Support Type:</strong></label>
                                        <select id="editSupportType${index}" style="width: 100%; padding: 5px;">
                                            <option value="individual" ${equipment.supportType === 'individual' ? 'selected' : ''}>Individual Clevis</option>
                                            <option value="trapeze" ${equipment.supportType === 'trapeze' ? 'selected' : ''}>Trapeze</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label><strong>Structure Type:</strong></label>
                                        <select id="editStructureType${index}" style="width: 100%; padding: 5px;">
                                            <option value="concrete-slab" ${equipment.structureType === 'concrete-slab' ? 'selected' : ''}>Concrete Slab</option>
                                            <option value="concrete-deck" ${equipment.structureType === 'concrete-deck' ? 'selected' : ''}>Concrete Deck</option>
                                            <option value="steel" ${equipment.structureType === 'steel' ? 'selected' : ''}>Structural Steel</option>
                                            <option value="wood" ${equipment.structureType === 'wood' ? 'selected' : ''}>Wood Structure</option>
                                        </select>
                                    </div>
                                ` : `
                                    <!-- Traditional Equipment Edit Fields -->
                                    <div>
                                        <label><strong>NBC Category:</strong></label>
                                        <select id="editNbcCategory${index}" style="width: 100%; padding: 5px;">
                                            <option value="1" ${equipment.nbcCategory === '1' ? 'selected' : ''}>1 - All exterior and interior walls except those in Category 2 or 3</option>
                                            <option value="2" ${equipment.nbcCategory === '2' ? 'selected' : ''}>2 - Cantilever parapet and other cantilever walls except retaining walls</option>
                                            <option value="3" ${equipment.nbcCategory === '3' ? 'selected' : ''}>3 - Exterior and interior ornamentations and appendages</option>
                                            <option value="5" ${equipment.nbcCategory === '5' ? 'selected' : ''}>5 - Towers, chimneys, smokestacks and penthouses when connected to or forming part of a building</option>
                                            <option value="6" ${equipment.nbcCategory === '6' ? 'selected' : ''}>6 - Horizontally cantilevered floors, balconies, beams, etc.</option>
                                            <option value="7" ${equipment.nbcCategory === '7' ? 'selected' : ''}>7 - Suspended ceilings, light fixtures and other attachments to ceilings with independent vertical support</option>
                                            <option value="8" ${equipment.nbcCategory === '8' ? 'selected' : ''}>8 - Masonry veneer connections</option>
                                            <option value="9" ${equipment.nbcCategory === '9' ? 'selected' : ''}>9 - Access floors</option>
                                            <option value="10" ${equipment.nbcCategory === '10' ? 'selected' : ''}>10 - Masonry or concrete fences more than 1.8 m tall</option>
                                            <option value="11-rigid" ${equipment.nbcCategory === '11-rigid' ? 'selected' : ''}>11 - Machinery, fixtures, equipment and tanks (rigid and rigidly connected)</option>
                                            <option value="11-flexible" ${equipment.nbcCategory === '11-flexible' ? 'selected' : ''}>11 - Machinery, fixtures, equipment and tanks (flexible or flexibly connected)</option>
                                            <option value="12-rigid" ${equipment.nbcCategory === '12-rigid' ? 'selected' : ''}>12 - Machinery with toxic/explosive materials (rigid and rigidly connected)</option>
                                            <option value="12-flexible" ${equipment.nbcCategory === '12-flexible' ? 'selected' : ''}>12 - Machinery with toxic/explosive materials (flexible or flexibly connected)</option>
                                            <option value="13" ${equipment.nbcCategory === '13' ? 'selected' : ''}>13 - Flat bottom tanks attached directly to a floor at or below grade</option>
                                            <option value="14" ${equipment.nbcCategory === '14' ? 'selected' : ''}>14 - Flat bottom tanks with toxic/explosive materials at or below grade</option>
                                            <option value="15" ${equipment.nbcCategory === '15' ? 'selected' : ''}>15 - Pipes, ducts (including contents)</option>
                                            <option value="16" ${equipment.nbcCategory === '16' ? 'selected' : ''}>16 - Pipes, ducts containing toxic or explosive materials</option>
                                            <option value="17" ${equipment.nbcCategory === '17' ? 'selected' : ''}>17 - Electrical cable trays, bus ducts, conduits</option>
                                            <option value="18" ${equipment.nbcCategory === '18' ? 'selected' : ''}>18 - Rigid components with ductile material and connections</option>
                                            <option value="19" ${equipment.nbcCategory === '19' ? 'selected' : ''}>19 - Rigid components with non-ductile material or connections</option>
                                            <option value="20" ${equipment.nbcCategory === '20' ? 'selected' : ''}>20 - Flexible components with ductile material and connections</option>
                                            <option value="21" ${equipment.nbcCategory === '21' ? 'selected' : ''}>21 - Flexible components with non-ductile material or connections</option>
                                            <option value="22-machinery" ${equipment.nbcCategory === '22-machinery' ? 'selected' : ''}>22 - Elevators and escalators (machinery and equipment)</option>
                                            <option value="22-rails" ${equipment.nbcCategory === '22-rails' ? 'selected' : ''}>22 - Elevators and escalators (elevator rails)</option>
                                            <option value="23" ${equipment.nbcCategory === '23' ? 'selected' : ''}>23 - Floor-mounted steel pallet storage racks</option>
                                            <option value="24" ${equipment.nbcCategory === '24' ? 'selected' : ''}>24 - Floor-mounted steel pallet storage racks with toxic/explosive materials</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label><strong>Weight:</strong></label>
                                        <div style="display: flex; gap: 5px;">
                                            <input type="number" id="editWeight${index}" value="${equipment.weight || ''}" step="0.01" style="flex: 1; padding: 5px;">
                                            <select id="editWeightUnit${index}" style="padding: 5px;">
                                                <option value="kg" ${equipment.weightUnit === 'kg' ? 'selected' : ''}>kg</option>
                                                <option value="lbs" ${equipment.weightUnit === 'lbs' ? 'selected' : ''}>lbs</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label><strong>Dimensions (H×W×L inches):</strong></label>
                                        <div style="display: flex; gap: 3px;">
                                            <input type="number" id="editHeight${index}" value="${equipment.height || ''}" placeholder="H" style="flex: 1; padding: 5px;">
                                            <input type="number" id="editWidth${index}" value="${equipment.width || ''}" placeholder="W" style="flex: 1; padding: 5px;">
                                            <input type="number" id="editLength${index}" value="${equipment.length || ''}" placeholder="L" style="flex: 1; padding: 5px;">
                                        </div>
                                    </div>
                                    <div>
                                        <label><strong>Number of Anchors:</strong></label>
                                        <input type="number" id="editNumberOfAnchors${index}" value="${equipment.numberOfAnchors || ''}" style="width: 100%; padding: 5px;">
                                    </div>
                                    <div>
                                        <label><strong>Anchor Type:</strong></label>
                                        <select id="editAnchorType${index}" style="width: 100%; padding: 5px;" onchange="updateEditAnchorDiameters(${index})">
                                            <option value="">Select anchor type...</option>
                                            <option value="expansion" ${equipment.anchorType === 'expansion' ? 'selected' : ''}>KWIK BOLT TZ2 Expansion anchor</option>
                                            <option value="screw" ${equipment.anchorType === 'screw' ? 'selected' : ''}>KWIK HUS EZ Screw anchor</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label><strong>Anchor Diameter (inches):</strong></label>
                                        <select id="editAnchorDiameter${index}" style="width: 100%; padding: 5px;">
                                            <option value="">Select diameter...</option>
                                        </select>
                                    </div>
                                    <div id="editSlabThicknessGroup${index}" style="display: ${equipment.slabThickness ? 'block' : 'none'};">
                                        <label><strong>Slab Thickness (inches):</strong></label>
                                        <input type="number" id="editSlabThickness${index}" value="${equipment.slabThickness || 4}" step="0.25" style="width: 100%; padding: 5px;">
                                    </div>
                                    <div id="editFcGroup${index}" style="display: ${equipment.fc ? 'block' : 'none'};">
                                        <label><strong>f'c (psi):</strong></label>
                                        <select id="editFc${index}" style="width: 100%; padding: 5px;">
                                            <option value="2500" ${equipment.fc === 2500 ? 'selected' : ''}>2500 psi</option>
                                            <option value="3000" ${equipment.fc === 3000 ? 'selected' : ''}>3000 psi</option>
                                            <option value="4000" ${equipment.fc === 4000 ? 'selected' : ''}>4000 psi</option>
                                            <option value="6000" ${equipment.fc === 6000 ? 'selected' : ''}>6000 psi</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label><strong>Mounting Type:</strong></label>
                                        <select id="editMountingType${index}" style="width: 100%; padding: 5px;" onchange="updateEditMountingTypeFields(${index})">
                                            <option value="no-isolators" ${equipment.mountingType === 'no-isolators' ? 'selected' : ''}>1. No isolators</option>
                                            <option value="type-3-1" ${equipment.mountingType === 'type-3-1' ? 'selected' : ''}>2. Restrained with Type 3-1 vibration isolators</option>
                                            <option value="type-3-2" ${equipment.mountingType === 'type-3-2' ? 'selected' : ''}>3. Restrained with Type 3-2 vibration isolators</option>
                                            <option value="type-3-5a" ${equipment.mountingType === 'type-3-5a' ? 'selected' : ''}>4. Restrained with Type 3-5A vibration isolators</option>
                                            <option value="type-3-5b" ${equipment.mountingType === 'type-3-5b' ? 'selected' : ''}>5. Restrained with Type 3-5B vibration isolators</option>
                                            <option value="type-3-5c" ${equipment.mountingType === 'type-3-5c' ? 'selected' : ''}>6. Restrained with Type 3-5C vibration isolators</option>
                                            <option value="type-3-5d" ${equipment.mountingType === 'type-3-5d' ? 'selected' : ''}>7. Restrained with Type 3-5D vibration isolators</option>
                                            <option value="type-3-10" ${equipment.mountingType === 'type-3-10' ? 'selected' : ''}>8. Restrained with Type 3-10 seismic snubbers</option>
                                            <option value="type-3-11" ${equipment.mountingType === 'type-3-11' ? 'selected' : ''}>9. Restrained with Type 3-11 seismic snubbers</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label><strong>Height Above Base (hx) meters:</strong></label>
                                        <input type="number" id="editHx${index}" value="${equipment.hx || ''}" step="0.01" style="width: 100%; padding: 5px;">
                                    </div>
                                    <!-- ASHRAE fields for traditional equipment - shown conditionally -->
                                    <div id="editIsolatorWidthGroup${index}" style="display: none;">
                                        <label><strong>Isolator Width (B) inches:</strong></label>
                                        <input type="number" id="editIsolatorWidth${index}" value="${equipment.isolatorWidth || ''}" step="0.01" style="width: 100%; padding: 5px;">
                                    </div>
                                    <div id="editRestraintHeightGroup${index}" style="display: none;">
                                        <label><strong>Restraint Height (H) inches:</strong></label>
                                        <input type="number" id="editRestraintHeight${index}" value="${equipment.restraintHeight || ''}" step="0.01" style="width: 100%; padding: 5px;">
                                    </div>
                                    <div id="editEdgeDistancesGroup${index}" style="display: none;">
                                        <label><strong>Edge Distance A (a) inches:</strong></label>
                                        <input type="number" id="editEdgeDistanceA${index}" value="${equipment.edgeDistanceA || ''}" step="0.01" style="width: 100%; padding: 5px;">
                                    </div>
                                    <div id="editEdgeDistanceBGroup${index}" style="display: none;">
                                        <label><strong>Edge Distance B (b) inches:</strong></label>
                                        <input type="number" id="editEdgeDistanceB${index}" value="${equipment.edgeDistanceB || ''}" step="0.01" style="width: 100%; padding: 5px;">
                                    </div>
                                    <div id="editNumberOfIsolatorsGroup${index}" style="display: none;">
                                        <label><strong>Number of Isolators (N):</strong></label>
                                        <input type="number" id="editNumberOfIsolators${index}" value="${equipment.numberOfIsolators || ''}" style="width: 100%; padding: 5px;">
                                    </div>
                                `}
                                
                                <!-- Common fields for both types -->
                                <div>
                                    <label><strong>Level:</strong></label>
                                    <input type="number" id="editLevel${index}" value="${equipment.level || ''}" style="width: 100%; padding: 5px;">
                                </div>
                                <div>
                                    <label><strong>Total Levels:</strong></label>
                                    <input type="number" id="editTotalLevels${index}" value="${equipment.totalLevels || ''}" style="width: 100%; padding: 5px;">
                                </div>
                                <div>
                                    <label><strong>Install Method:</strong></label>
                                    <select id="editInstallMethod${index}" style="width: 100%; padding: 5px;">
                                        <option value="1" ${equipment.installMethod === '1' ? 'selected' : ''}>Fixed to Slab</option>
                                        <option value="2" ${equipment.installMethod === '2' ? 'selected' : ''}>Fixed to Wall</option>
                                        <option value="3" ${equipment.installMethod === '3' ? 'selected' : ''}>Fixed to Structure</option>
                                        <option value="4" ${equipment.installMethod === '4' ? 'selected' : ''}>Fixed to Ceiling</option>
                                        <option value="5" ${equipment.installMethod === '5' ? 'selected' : ''}>Fixed to Roof</option>
                                    </select>
                                </div>
                                <div>
                                    <label><strong>Building Height (hn) meters:</strong></label>
                                    <input type="number" id="editHn${index}" value="${equipment.hn || ''}" step="0.01" style="width: 100%; padding: 5px;">
                                </div>
                            </div>
                            
                            <div style="display: flex; gap: 10px; margin-top: 15px;">
                                <button type="submit" style="background: #28a745; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">
                                    <i class="fas fa-save"></i> Save Changes
                                </button>
                                <button type="button" onclick="cancelEquipmentEdit(${index})" style="background: #6c757d; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">
                                    <i class="fas fa-times"></i> Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            `;
            const thumbImgs = equipmentCard.querySelectorAll('.equip-thumb img[data-key]');
            thumbImgs.forEach(async (el) => {
            const key = el.dataset.key;
            try {
                const url = await getSignedImageUrl(currentProjectId, key);
                el.onerror = () => { /* your cleanup */ };
                el.src = url;
                el.closest('.equip-thumb').onclick = () => window.openEquipLightbox(url);
            } catch {
                el.removeAttribute('src');
                el.alt = 'Image unavailable';
            }
            });
            
            equipmentListDiv.appendChild(equipmentCard);

            // Add click event to entire card for toggling details
            equipmentCard.addEventListener('click', (e) => {
                // Don't toggle if clicking on action buttons
                if (e.target.closest('.upload-btn') || 
                    e.target.closest('.delete-btn') || 
                    e.target.closest('input[type="file"]')) {
                    return;
                }

                    if (e.target.closest('.equipment-details')) {
                    return;
                }

                toggleEquipmentDetails(index);
            });

            // Load equipment image for this specific equipment
            loadEquipmentDetailImage(equipment, index);
            
            // Add event listeners
            const cfsValue = equipmentCard.querySelector('.cfs-value');
            const forceValue = equipmentCard.querySelector('.force-value');
            const vpValue = equipmentCard.querySelector('.vp-value');
            
            // Specific overturning calculation listeners
            const otmValue = equipmentCard.querySelector('.otm-value');
            const rmValue = equipmentCard.querySelector('.rm-value');
            const tensionValue = equipmentCard.querySelector('.tension-value');
            const shearValue = equipmentCard.querySelector('.shear-value');

            // Specific vibration isolator calculation listeners
            const ptValue = equipmentCard.querySelector('.pt-value');
            const pcValue = equipmentCard.querySelector('.pc-value');
            const psValue = equipmentCard.querySelector('.ps-value');
            
            // Add ASHRAE calculation listeners
            const ashraeTboltValue = equipmentCard.querySelector('.ashrae-tbolt-value');
            const ashraeVboltValue = equipmentCard.querySelector('.ashrae-vbolt-value');
            const concreteFormula1Value = equipmentCard.querySelector('.concrete-formula1-value');
            const concreteFormula2Value = equipmentCard.querySelector('.concrete-formula2-value');

            const concreteEmbedmentValue = equipmentCard.querySelector('.concrete-embedment-value');
            const steelEmbedmentValue = equipmentCard.querySelector('.steel-embedment-value');
            const finalEmbedmentValue = equipmentCard.querySelector('.final-embedment-value');
            const embedmentRecommendationValue = equipmentCard.querySelector('.embedment-recommendation-value');

            // const suspendedBracingValue = equipmentCard.querySelector('.suspended-bracing-value');
            //     if (suspendedBracingValue) {
            //         suspendedBracingValue.addEventListener('click', () => {
            //             showSuspendedBracingDetails(equipment, currentProject);
            //         });
            //     }

            const suspendedHangerValue = equipmentCard.querySelector('.suspended-hanger-value');
            const suspendedBraceValue = equipmentCard.querySelector('.suspended-brace-value');
            const suspendedPipingValue = equipmentCard.querySelector('.suspended-piping-value');

            if (suspendedPipingValue) {
                suspendedPipingValue.addEventListener('click', () => {
                    showSuspendedPipingDetails(equipment, currentProject);
                });
            }

            if (suspendedHangerValue) {
                suspendedHangerValue.addEventListener('click', () => {
                    showSuspendedHangerDetails(equipment, currentProject);
                });
            }

            if (suspendedBraceValue) {
                suspendedBraceValue.addEventListener('click', () => {
                    showSuspendedBraceDetails(equipment, currentProject);
                });
            }


            if (concreteEmbedmentValue) {
                concreteEmbedmentValue.addEventListener('click', () => {
                    showConcreteEmbedmentDetails(equipment, currentProject);
                });
            }

            if (steelEmbedmentValue) {
                steelEmbedmentValue.addEventListener('click', () => {
                    showSteelEmbedmentDetails(equipment, currentProject);
                });
            }

            if (finalEmbedmentValue) {
                finalEmbedmentValue.addEventListener('click', () => {
                    showFinalEmbedmentDetails(equipment, currentProject);
                });
            }

            if (embedmentRecommendationValue) {
                embedmentRecommendationValue.addEventListener('click', () => {
                    showEmbedmentRecommendationDetails(equipment, currentProject);
                });
            }

            if (ashraeTboltValue) {
                ashraeTboltValue.addEventListener('click', () => {
                    showASHRAETboltDetails(equipment, currentProject);
                });
            }

            if (ashraeVboltValue) {
                ashraeVboltValue.addEventListener('click', () => {
                    showASHRAEVboltDetails(equipment, currentProject);
                });
            }

            if (concreteFormula1Value) {
                concreteFormula1Value.addEventListener('click', () => {
                    showConcreteFormula1Details(equipment, currentProject);
                });
            }

            if (concreteFormula2Value) {
                concreteFormula2Value.addEventListener('click', () => {
                    showConcreteFormula2Details(equipment, currentProject);
                });
            }

            if (cfsValue) {
                cfsValue.addEventListener('click', () => {
                    showCFSCalculationDetails(equipment, currentProject);
                });
            }
            
            if (forceValue) {
                forceValue.addEventListener('click', () => {
                    showLateralForceCalculationDetails(equipment, currentProject);
                });
            }
            
            if (vpValue && equipment.nbcCategory) {
                vpValue.addEventListener('click', () => {
                    showVpCalculationDetails(equipment, currentProject);
                });
            }
            
            // Add specific click listeners for each overturning calculation
            if (otmValue && overturningResult) {
                otmValue.addEventListener('click', () => {
                    showOTMCalculationDetails(equipment, currentProject);
                });
            }
            
            if (rmValue && overturningResult) {
                rmValue.addEventListener('click', () => {
                    showRMCalculationDetails(equipment, currentProject);
                });
            }
            
            if (tensionValue && overturningResult) {
                tensionValue.addEventListener('click', () => {
                    showTensionCalculationDetails(equipment, currentProject);
                });
            }
            
            if (shearValue && overturningResult) {
                shearValue.addEventListener('click', () => {
                    showShearCalculationDetails(equipment, currentProject);
                });
            }

            if (ptValue && overturningResult && overturningResult.mountingType !== 'rigidly-mounted') {
                ptValue.addEventListener('click', () => {
                    showPtCalculationDetails(equipment, currentProject);
                });
            }

            if (pcValue && overturningResult && overturningResult.mountingType !== 'rigidly-mounted') {
                pcValue.addEventListener('click', () => {
                    showPcCalculationDetails(equipment, currentProject);
                });
            }

            if (psValue && overturningResult && overturningResult.mountingType !== 'rigidly-mounted') {
                psValue.addEventListener('click', () => {
                    showPsCalculationDetails(equipment, currentProject);
                });
            }

        },
    
    );
        
    } catch (error) {
        console.error('Error in renderEquipmentList():', error);
    }
}

function triggerUploadImage(index) {
    if (!canModifyProject()) {
        alert('You do not have permission to modify this project.');
        return;
    }
    const input = document.getElementById(`fileInput${index}`);
    if (input) input.click();
}

// Updated handleImageSelected function to clear image requests
async function handleImageSelected(evt, index) {
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;

    try {
        // 1) Ask backend for a presigned PUT URL scoped to this project
        const res = await fetch(
            `https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/image-upload-url`,
            {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: file.name,
                    contentType: file.type || 'application/octet-stream'
                })
            }
        );

        if (handleAuthError(res)) return;
        if (!res.ok) {
            const t = await res.text();
            throw new Error(`Failed to get upload URL: ${res.status} - ${t}`);
        }

        const { uploadUrl, key, viewUrlSigned, publicUrlHint } = await res.json();

        // 2) Upload file directly to S3 with PUT
        const putRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file
        });
        if (!putRes.ok) {
            const t = await putRes.text();
            throw new Error(`Upload failed: ${putRes.status} - ${t}`);
        }

        // 3) Persist image metadata on equipment (array-based)
        const eq = projectEquipment[index] || {};
        addImageToEquipment(eq, { key, viewUrlSigned, publicUrlHint });
        
        // CLEAR IMAGE REQUEST when new image is uploaded
        if (eq.imageRequested) {
            eq.imageRequested = false;
        }
        
        projectEquipment[index] = eq;
        await saveEquipmentToProject();
        renderEquipmentList();

        // Auto-expand the equipment details after upload
        setTimeout(() => {
            const detailsDiv = document.getElementById(`equipmentDetails${index}`);
            if (detailsDiv && !detailsDiv.classList.contains('show')) {
                toggleEquipmentDetails(index);
            }
        }, 100);

        alert('Image uploaded and saved to this equipment!');
    } catch (err) {
        console.error('Image upload error:', err);
        alert('Image upload failed: ' + err.message);
    } finally {
        // reset the input so choosing the same file again still triggers change
        evt.target.value = '';
    }
}

// Function to get request icon and tooltip text
function getImageRequestInfo(equipment) {
    if (!equipment.imageRequested) {
        return null;
    }

    const hasImages = equipment.images && equipment.images.length > 0;
    const tooltipText = hasImages 
        ? "An admin has requested you to upload an additional image for this equipment"
        : "An admin has requested you to upload an image for this equipment";

    return {
        icon: isAdmin ? 'fas fa-paper-plane' : 'fas fa-exclamation-triangle',
        tooltipText: isAdmin ? "Image request sent" : tooltipText,
        color: isAdmin ? '#17a2b8' : '#ffc107'
    };
}

// Helper function to get install method text
function getInstallMethodText(value) {
    const methods = {
        '1': 'Fixed to Slab',
        '2': 'Fixed to Wall',
        '3': 'Fixed to Structure',
        '4': 'Fixed to Ceiling',
        '5': 'Fixed to Roof'
    };
    return methods[value] || 'Unknown';
}

// Helper function to generate just the image name (without base URL and extension)
function getImageName(equipmentType, pipeType, installMethod, projectDomain) {
    if (equipmentType === 'Pipe') {
        if (!pipeType) return null;
        
        const pipeTypeMap = {
            'Steel_Pipe': 'Steel',
            'Copper_Pipe': 'Copper', 
            'PVC_Pipe': 'PVC',
            'No_Hub_Pipe': 'NoHub'
        };
        
        const mappedPipeType = pipeTypeMap[pipeType] || pipeType;
        return `Pipe_${mappedPipeType}`;
    } else {
        const domainMapping = equipmentMappings[projectDomain];
        if (!domainMapping) return null;

        const equipmentCode = domainMapping.equipmentMap[equipmentType];
        if (!equipmentCode) return null;
        
        return `${domainMapping.domainCode}_${equipmentCode}_${installMethod}`;
    }
}

// Helper function to get mounting type text
function getMountingTypeText(value) {
    const types = {
        'no-isolators': '1. No isolators',
        'type-3-1': '2. Restrained with Type 3-1 vibration isolators',
        'type-3-2': '3. Restrained with Type 3-2 vibration isolators',
        'type-3-5a': '4. Restrained with Type 3-5A vibration isolators',
        'type-3-5b': '5. Restrained with Type 3-5B vibration isolators',
        'type-3-5c': '6. Restrained with Type 3-5C vibration isolators',
        'type-3-5d': '7. Restrained with Type 3-5D vibration isolators',
        'type-3-10': '8. Restrained with Type 3-10 seismic snubbers',
        'type-3-11': '9. Restrained with Type 3-11 seismic snubbers'
    };
    return types[value] || 'Unknown mounting type';
}

// Helper function to get anchor type text
function getAnchorTypeText(value) {
    const types = {
        'expansion': 'KWIK BOLT TZ2 Expansion anchor',
        'screw': 'KWIK HUS EZ Screw anchor'
    };
    return types[value] || 'Unknown anchor type';
}

// Function to update anchor diameter options in edit mode
function updateEditAnchorDiameters(index) {
    const anchorType = document.getElementById(`editAnchorType${index}`).value;
    const anchorDiameterSelect = document.getElementById(`editAnchorDiameter${index}`);
    const currentValue = anchorDiameterSelect.value; // Save current selection
    
    // Clear existing options
    anchorDiameterSelect.innerHTML = '';
    
    if (!anchorType) {
        anchorDiameterSelect.innerHTML = '<option value="">Select anchor type first...</option>';
        return;
    }
    
    // Add default option
    anchorDiameterSelect.innerHTML = '<option value="">Select diameter...</option>';
    
    let diameters = [];
    
    if (anchorType === 'expansion') {
        // KWIK BOLT TZ2 Expansion anchor diameters
        diameters = ['1/4', '3/8', '1/2', '5/8', '3/4', '1'];
    } else if (anchorType === 'screw') {
        // KWIK HUS EZ Screw anchor diameters
        diameters = ['1/4', '3/8', '1/2', '5/8', '3/4'];
    }
    
    // Add diameter options
    diameters.forEach(diameter => {
        const option = document.createElement('option');
        option.value = diameter;
        option.textContent = diameter + '"';
        
        // Restore previous selection if it's still valid
        if (diameter === currentValue) {
            option.selected = true;
        }
        
        anchorDiameterSelect.appendChild(option);
    });
}

// Function to handle mounting type changes in edit form
function updateEditMountingTypeFields(index) {
    const mountingType = document.getElementById(`editMountingType${index}`)?.value;
    const isolatorWidthGroup = document.getElementById(`editIsolatorWidthGroup${index}`);
    const restraintHeightGroup = document.getElementById(`editRestraintHeightGroup${index}`);
    const edgeDistancesGroup = document.getElementById(`editEdgeDistancesGroup${index}`);
    const edgeDistanceBGroup = document.getElementById(`editEdgeDistanceBGroup${index}`);
    const numberOfIsolatorsGroup = document.getElementById(`editNumberOfIsolatorsGroup${index}`);
    
    // Show additional fields based on mounting type
    if (['type-3-2', 'type-3-5a', 'type-3-10'].includes(mountingType)) {
        // Need isolator width and height (two-bolt arrangements)
        if (isolatorWidthGroup) isolatorWidthGroup.style.display = 'block';
        if (restraintHeightGroup) restraintHeightGroup.style.display = 'block';
        if (edgeDistancesGroup) edgeDistancesGroup.style.display = 'none';
        if (edgeDistanceBGroup) edgeDistanceBGroup.style.display = 'none';
        if (numberOfIsolatorsGroup) numberOfIsolatorsGroup.style.display = 'block';
    } else if (['type-3-5b', 'type-3-5c', 'type-3-5d', 'type-3-11'].includes(mountingType)) {
        // Need edge distances and height (four-bolt arrangements)
        if (isolatorWidthGroup) isolatorWidthGroup.style.display = 'none';
        if (restraintHeightGroup) restraintHeightGroup.style.display = 'block';
        if (edgeDistancesGroup) edgeDistancesGroup.style.display = 'block';
        if (edgeDistanceBGroup) edgeDistanceBGroup.style.display = 'block';
        if (numberOfIsolatorsGroup) numberOfIsolatorsGroup.style.display = 'block';
    } else if (['type-3-1'].includes(mountingType)) {
        // Type 3-1 needs isolator count only
        if (isolatorWidthGroup) isolatorWidthGroup.style.display = 'none';
        if (restraintHeightGroup) restraintHeightGroup.style.display = 'none';
        if (edgeDistancesGroup) edgeDistancesGroup.style.display = 'none';
        if (edgeDistanceBGroup) edgeDistanceBGroup.style.display = 'none';
        if (numberOfIsolatorsGroup) numberOfIsolatorsGroup.style.display = 'block';
    } else {
        // Hide all additional fields for other types
        if (isolatorWidthGroup) isolatorWidthGroup.style.display = 'none';
        if (restraintHeightGroup) restraintHeightGroup.style.display = 'none';
        if (edgeDistancesGroup) edgeDistancesGroup.style.display = 'none';
        if (edgeDistanceBGroup) edgeDistanceBGroup.style.display = 'none';
        if (numberOfIsolatorsGroup) numberOfIsolatorsGroup.style.display = 'none';
    }
}

function populateEditInstallMethodOptions(index, domain, equipment) {
    const editInstallMethodSelect = document.getElementById(`editInstallMethod${index}`);
    if (!editInstallMethodSelect) return;
    
    // Store current selection
    const currentValue = editInstallMethodSelect.value;
    
    // Clear existing options
    editInstallMethodSelect.innerHTML = '';
    
    // All available install methods
    const allInstallMethods = {
        '1': 'Fixed to Slab',
        '2': 'Fixed to Wall', 
        '3': 'Fixed to Structure',
        '4': 'Fixed to Ceiling',
        '5': 'Fixed to Roof'
    };
    
    let allowedMethods = [];
    
    // Check if we have domain-specific and equipment-specific restrictions
    if (equipmentInstallMethods[domain] && equipmentInstallMethods[domain][equipment] && equipmentInstallMethods[domain][equipment].length > 0) {
        allowedMethods = equipmentInstallMethods[domain][equipment];
    } else {
        // If no restrictions defined, show all methods (fallback for other domains/equipment)
        allowedMethods = Object.keys(allInstallMethods);
    }
    
    // Add allowed methods to dropdown
    allowedMethods.forEach(methodId => {
        const option = document.createElement('option');
        option.value = methodId;
        option.textContent = allInstallMethods[methodId];
        
        // Restore previous selection if it's still valid
        if (methodId === currentValue) {
            option.selected = true;
        }
        
        editInstallMethodSelect.appendChild(option);
    });
    
    // If previous selection is no longer valid, clear it
    if (currentValue && !allowedMethods.includes(currentValue)) {
        editInstallMethodSelect.value = allowedMethods[0] || ''; // Set to first available or empty
    }
}

// Function to populate anchor diameter options when edit form loads
function populateEditAnchorDiameters(index, equipment) {
    const anchorType = equipment.anchorType;
    const anchorDiameterSelect = document.getElementById(`editAnchorDiameter${index}`);
    
    if (!anchorType) {
        anchorDiameterSelect.innerHTML = '<option value="">Select anchor type first...</option>';
        return;
    }
    
    // Clear existing options
    anchorDiameterSelect.innerHTML = '<option value="">Select diameter...</option>';
    
    let diameters = [];
    
    if (anchorType === 'expansion') {
        diameters = ['1/4', '3/8', '1/2', '5/8', '3/4', '1'];
    } else if (anchorType === 'screw') {
        diameters = ['1/4', '3/8', '1/2', '5/8', '3/4'];
    }
    
    // Add diameter options
    diameters.forEach(diameter => {
        const option = document.createElement('option');
        option.value = diameter;
        option.textContent = diameter + '"';
        
        // Select the current equipment's diameter
        if (diameter === equipment.anchorDiameter) {
            option.selected = true;
        }
        
        anchorDiameterSelect.appendChild(option);
    });
}

// Function to toggle equipment details
function toggleEquipmentDetails(index) {
    const detailsDiv = document.getElementById(`equipmentDetails${index}`);
    const equipmentCard = detailsDiv.closest('.equipment-card');
    const detailsButton = equipmentCard.querySelector('.details-btn');
    
    if (detailsDiv.classList.contains('show')) {
        detailsDiv.classList.remove('show');
        if (detailsButton) {
            detailsButton.textContent = 'Details';
        }
    } else {
        detailsDiv.classList.add('show');
        if (detailsButton) {
            detailsButton.textContent = 'Hide Details';
        }
    }
}

// Function to edit equipment
function editEquipment(index) {
    if (!canModifyProject()) {
        alert('You do not have permission to edit equipment in this project.');
        return;
    }

    // Hide view mode and show edit mode
    document.getElementById(`equipmentView${index}`).style.display = 'none';
    document.getElementById(`equipmentEdit${index}`).style.display = 'block';
    
    // Ensure details are expanded
    const detailsDiv = document.getElementById(`equipmentDetails${index}`);
    const detailsButton = detailsDiv.closest('.equipment-card').querySelector('.details-btn');
    
    if (!detailsDiv.classList.contains('show')) {
        detailsDiv.classList.add('show');
        if (detailsButton) {
            detailsButton.textContent = 'Hide Details';
        }
    }

    setTimeout(() => {
        const equipment = projectEquipment[index];
        // Keep only valid images for THIS project (prevents phantom tiles)
        const validPrefix = `users-equipment-images/${currentProjectId}/`;
        const images = normalizeEquipmentImages(equipment).filter(img =>
        img && typeof img.key === 'string' && img.key.startsWith(validPrefix)
        );

// Optionally write back so future renders stay clean
equipment.images = images;
        const domain = document.getElementById('projectDomain')?.textContent?.toLowerCase() || 'electricity';
        
        // For traditional equipment, set up conditional field visibility
        if (!equipment.isPipe) {
            populateEditAnchorDiameters(index, equipment);
            updateEditMountingTypeFields(index); // Initialize ASHRAE field visibility
            
            // NEW: Initialize install method filtering for edit form
            populateEditInstallMethodOptions(index, domain, equipment.equipmentType || equipment.equipment);
        }
    }, 100);
}

// Delete (server-side delete + update equipment)
async function confirmDeleteImage(evt, equipmentIndex, imageKey) {
evt.stopPropagation();
if (!confirm('Delete this image?')) return;
try {
    // 1) ask backend to delete the object
    const res = await fetch(
    `https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/images/delete`,
    {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: imageKey })
    }
    );
    if (handleAuthError(res)) return;
    if (!res.ok) {
    const t = await res.text();
    throw new Error(`Delete failed: ${res.status} - ${t}`);
    }

    // 2) remove from local equipment array and persist
    const eq = projectEquipment[equipmentIndex];
    if (eq) {
    normalizeEquipmentImages(eq);
    eq.images = eq.images.filter(img => img.key !== imageKey);
    projectEquipment[equipmentIndex] = eq;
    await saveEquipmentToProject();
    renderEquipmentList();

    // Auto-expand the equipment details after delete
        setTimeout(() => {
            const detailsDiv = document.getElementById(`equipmentDetails${equipmentIndex}`);
            if (detailsDiv && !detailsDiv.classList.contains('show')) {
                toggleEquipmentDetails(equipmentIndex);
            }
        }, 100);
        }
} catch (err) {
    console.error('Delete image error:', err);
    alert('Failed to delete image: ' + err.message);
}
}

// Function to cancel equipment edit
function cancelEquipmentEdit(index) {
    // Show view mode and hide edit mode
    document.getElementById(`equipmentView${index}`).style.display = 'block';
    document.getElementById(`equipmentEdit${index}`).style.display = 'none';
}

// Function to save equipment edit
async function saveEquipmentEdit(index, event) {
    event.preventDefault();
    
    if (!canModifyProject()) {
        alert('You do not have permission to edit equipment in this project.');
        return;
    }

    try {
        const currentEquipment = projectEquipment[index];
        const isPipe = currentEquipment.isPipe;
        
        // Get updated values from form - common fields
        const updatedEquipment = {
            ...currentEquipment, // Keep existing properties
            level: parseInt(document.getElementById(`editLevel${index}`).value) || 1,
            totalLevels: parseInt(document.getElementById(`editTotalLevels${index}`).value) || 1,
            installMethod: document.getElementById(`editInstallMethod${index}`).value,
            hn: parseFloat(document.getElementById(`editHn${index}`).value) || 1,
            nbcCategory: document.getElementById(`editNbcCategory${index}`).value,
            lastModified: new Date().toISOString(),
            modifiedBy: currentUser?.email || 'unknown'
        };

        // Add domain-specific fields
        if (isPipe) {
            // Pipe specific fields
            const pipeType = document.getElementById(`editPipeType${index}`).value;
            updatedEquipment.pipeType = pipeType;
            updatedEquipment.equipment = pipeType; // Update equipment name to match pipe type
            updatedEquipment.pipeWeightPerFoot = parseFloat(document.getElementById(`editPipeWeightPerFoot${index}`).value) || 0;
            updatedEquipment.pipeDiameter = document.getElementById(`editPipeDiameter${index}`).value;
            updatedEquipment.supportType = document.getElementById(`editSupportType${index}`).value;
            updatedEquipment.structureType = document.getElementById(`editStructureType${index}`).value;
            
            // Validation for pipes
            if (!pipeType) {
                alert('Please select a pipe type.');
                return;
            }
            
            if (!updatedEquipment.pipeWeightPerFoot || updatedEquipment.pipeWeightPerFoot <= 0) {
                alert('Please enter a valid pipe weight per foot greater than 0.');
                return;
            }
            
            if (!updatedEquipment.pipeDiameter) {
                alert('Please select a pipe diameter.');
                return;
            }
        } else {
            // Traditional equipment fields
            updatedEquipment.weight = parseFloat(document.getElementById(`editWeight${index}`).value) || 0;
            updatedEquipment.weightUnit = document.getElementById(`editWeightUnit${index}`).value;
            updatedEquipment.height = parseFloat(document.getElementById(`editHeight${index}`).value) || 0;
            updatedEquipment.width = parseFloat(document.getElementById(`editWidth${index}`).value) || 0;
            updatedEquipment.length = parseFloat(document.getElementById(`editLength${index}`).value) || 0;
            updatedEquipment.numberOfAnchors = parseInt(document.getElementById(`editNumberOfAnchors${index}`).value) || 4;
            updatedEquipment.anchorType = document.getElementById(`editAnchorType${index}`).value;
            updatedEquipment.anchorDiameter = document.getElementById(`editAnchorDiameter${index}`).value;
            updatedEquipment.slabThickness = parseFloat(document.getElementById(`editSlabThickness${index}`).value) || null;
            updatedEquipment.fc = parseInt(document.getElementById(`editFc${index}`).value) || null;
            updatedEquipment.mountingType = document.getElementById(`editMountingType${index}`).value;
            updatedEquipment.hx = parseFloat(document.getElementById(`editHx${index}`).value) || 0;
            // Add ASHRAE fields
            updatedEquipment.isolatorWidth = parseFloat(document.getElementById(`editIsolatorWidth${index}`).value) || null;
            updatedEquipment.restraintHeight = parseFloat(document.getElementById(`editRestraintHeight${index}`).value) || null;
            updatedEquipment.edgeDistanceA = parseFloat(document.getElementById(`editEdgeDistanceA${index}`).value) || null;
            updatedEquipment.edgeDistanceB = parseFloat(document.getElementById(`editEdgeDistanceB${index}`).value) || null;
            updatedEquipment.numberOfIsolators = parseInt(document.getElementById(`editNumberOfIsolators${index}`).value) || null;
            
            // Validation for traditional equipment
            if (!updatedEquipment.weight || updatedEquipment.weight <= 0) {
                alert('Please enter a valid weight greater than 0.');
                return;
            }
            
            if (!updatedEquipment.height || !updatedEquipment.width || !updatedEquipment.length) {
                alert('Please enter valid dimensions for height, width, and length.');
                return;
            }
            
            if (!updatedEquipment.hx || updatedEquipment.hx > updatedEquipment.hn) {
                alert('Please enter valid heights. Equipment height above base must be less than or equal to building height.');
                return;
            }
        }

        // Common validation
        if (updatedEquipment.level > updatedEquipment.totalLevels) {
            alert('Equipment level cannot be greater than total levels.');
            return;
        }
        
        if (!updatedEquipment.hn || updatedEquipment.hn <= 0) {
            alert('Please enter a valid building height greater than 0.');
            return;
        }

        if (!updatedEquipment.nbcCategory) {
            alert('Please select an NBC category.');
            return;
        }

        console.log('🔄 Updating equipment:', updatedEquipment);

        // Update the equipment in the array
        projectEquipment[index] = updatedEquipment;
        
        // Save to database
        await saveEquipmentToProject();
        
        // Re-render the equipment list to show updated calculations
        renderEquipmentList();
        
        // Show success message
        alert('Equipment updated successfully! All calculations have been recalculated.');
        
    } catch (error) {
        console.error('Error saving equipment edit:', error);
        alert('Error saving equipment changes: ' + error.message);
    }
}

// Function to delete equipment
function deleteEquipment(index) {
    if (!canModifyProject()) {
        alert('You do not have permission to delete equipment from this project.');
        return;
    }

    if (confirm('Are you sure you want to delete this equipment?')) {
        projectEquipment.splice(index, 1);
        saveEquipmentToProject();
        renderEquipmentList();
    }
}

// Function to save equipment to project
async function saveEquipmentToProject(options = {}) {
    const { silent = false } = options;
    try {
        console.log('=== SAVE EQUIPMENT TO PROJECT START ===');
        console.log('Current project ID:', currentProjectId);
        console.log('Equipment to save:', projectEquipment);
        
        const apiUrl = `https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/equipment`;
        console.log('API URL:', apiUrl);
        
        const requestBody = { equipment: projectEquipment };
        console.log('Request body:', JSON.stringify(requestBody, null, 2));
        
        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(requestBody)
        });

        if (handleAuthError(response)) {
            return;
        }

        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error response:', errorText);
            throw new Error(`Failed to save equipment: ${response.status} - ${errorText}`);
        }
        
        const responseData = await response.json();
        console.log('Response data:', responseData);
        console.log('Equipment saved successfully to database');
        
        } catch (error) {
            console.error('Error saving equipment:', error);
            console.error('Error stack:', error.stack);
            if (!silent) alert('Error saving equipment: ' + error.message);
        }
    }

// Setup equipment form submission handler
function setupEquipmentFormHandler() {
    const equipmentForm = document.getElementById('equipmentFormElement');
    const calculateButton = document.getElementById('calculateEquipment');
    const saveButton = document.getElementById('saveEquipment');
    
    if (!equipmentForm) return;
    
    // Calculate button event listener
    if (calculateButton) {
        calculateButton.addEventListener('click', handleCalculateEquipment);
    }
    
    // Save button (form submission) event listener
    equipmentForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        await handleSaveEquipment(e);
    });
}

// Handle Calculate button click
function handleCalculateEquipment() {
    console.log('Calculate button clicked!');
    
    try {
        // Get form data and validate
        const equipmentData = getEquipmentFormData();
        if (!equipmentData) {
            return; // Validation failed, errors already shown
        }
        
        // Perform calculations and display results
        displayCalculationResults(equipmentData);
        
    } catch (error) {
        console.error('Error calculating equipment:', error);
        alert('Error calculating equipment: ' + error.message);
    }
}

// Handle Save button click (original submit functionality)
async function handleSaveEquipment(e) {
    if (!canModifyProject()) {
        alert('You do not have permission to add equipment to this project.');
        return;
    }
    
    console.log('Save button clicked!');
    
    try {
        // Get form data and validate
        const equipmentData = getEquipmentFormData();
        if (!equipmentData) {
            return; // Validation failed, errors already shown
        }

        console.log('Equipment data to save:', equipmentData);

        // Add to project equipment array
        projectEquipment.push(equipmentData);
        
        console.log('Current projectEquipment array:', projectEquipment);
        
        // Save to project
        await saveEquipmentToProject();
        
        // Render equipment list
        renderEquipmentList();
        
        // Get the index of newly added equipment
        const newEquipmentIndex = projectEquipment.length - 1;

        // Clear form and reset state
        clearEquipmentForm();
        
        // Hide form and update button text
        const equipmentForm = document.getElementById('equipmentForm');
        const newCalcButton = document.getElementById('newCalculationButton');
        equipmentForm.classList.remove('show');
        if (newCalcButton) {
            newCalcButton.textContent = 'New Calculation';
        }
        
        // Automatically expand new equipment details
        setTimeout(() => {
            const newEquipmentCard = document.querySelector(`#equipmentDetails${newEquipmentIndex}`);
            if (newEquipmentCard) {
                // Expand the details
                toggleEquipmentDetails(newEquipmentIndex);
                
                // Scroll to the new equipment card
                newEquipmentCard.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
                
                // Highlight the new equipment briefly using CSS class
                const equipmentCard = newEquipmentCard.closest('.equipment-card');
                if (equipmentCard) {
                    equipmentCard.classList.add('highlighted');
                    
                    // Remove highlight after 3 seconds
                    setTimeout(() => {
                        equipmentCard.classList.remove('highlighted');
                    }, 3000);
                }
            }
        }, 100); // Small delay to ensure DOM is updated
            
        // Success message
        alert('Equipment saved successfully!');
        
    } catch (error) {
        console.error('Error saving equipment:', error);
        alert('Error saving equipment: ' + error.message);
    }
}

// Setup new calculation button handler
function setupNewCalculationButton() {
    const newCalcButton = document.getElementById('newCalculationButton');
    const equipmentForm = document.getElementById('equipmentForm');
    
    if (newCalcButton && equipmentForm) {
        newCalcButton.addEventListener('click', function() {
            if (!canModifyProject()) {
                alert('You do not have permission to add equipment to this project.');
                return;
            }
            
            if (equipmentForm.classList.contains('show')) {
                equipmentForm.classList.remove('show');
                newCalcButton.textContent = 'New Calculation';
            } else {
                equipmentForm.classList.add('show');
                newCalcButton.textContent = 'Hide Form';
                
                // SCROLL TO THE FORM WHEN SHOWING IT
                equipmentForm.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start' 
                });
            }
        });
    }
}

// Toggle function for project details
function toggleProjectDetails() {
    const detailedInfo = document.getElementById('detailedInfo');
    const toggleIcon = document.getElementById('detailsToggleBtn').querySelector('.toggle-icon');
    
    if (detailedInfo.classList.contains('expanded')) {
        // Collapse
        detailedInfo.classList.remove('expanded');
        toggleIcon.classList.remove('rotated');
    } else {
        // Expand
        detailedInfo.classList.add('expanded');
        toggleIcon.classList.add('rotated');
    }
}

// Updated loadEquipmentDetailImage function with JPG/PNG fallback
async function loadEquipmentDetailImage(equipment, index) {
    const imageContainer = document.getElementById(`equipmentDetailImage${index}`);
    const placeholder = document.getElementById(`equipmentDetailPlaceholder${index}`);
    
    if (!imageContainer || !placeholder) {
        console.log('Image container not found for equipment:', index);
        return;
    }

    const projectDomain = document.getElementById('projectDomain')?.textContent?.toLowerCase() || 'electricity';
    const equipmentType = equipment.equipmentType || equipment.equipment;
    const installMethod = equipment.installMethod;
    const pipeType = equipment.pipeType;
    
    console.log('📋 Loading image for equipment:', { projectDomain, equipmentType, equipment: equipment.equipment, installMethod, index });

    if (!equipmentType || !installMethod) {
        placeholder.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="font-size: 32px; color: #ffc107; margin-bottom: 8px; display: block;"></i>
            Missing equipment or install method data
        `;
        return;
    }

    // Special handling for pipes
    if (equipmentType === 'Pipe' || equipment.isPipe) {
        const pipeTypeToUse = pipeType || equipment.equipment;
        
        if (!pipeTypeToUse) {
            placeholder.innerHTML = `
                <i class="fas fa-exclamation-triangle" style="font-size: 32px; color: #ffc107; margin-bottom: 8px; display: block;"></i>
                Missing pipe type data
            `;
            return;
        }
    }
    
    try {
        // Try to get working image URL (JPG first, then PNG)
        const fullImageUrl = await getWorkingImageUrl(equipmentType, pipeType, installMethod, projectDomain);
        
        if (fullImageUrl) {
            console.log('🔗 Using detail image URL:', fullImageUrl);
            
            // Create image element
            const imgElement = document.createElement('img');
            imgElement.style.cssText = `
                width: 100%;
                height: auto;
                max-height: 200px;
                object-fit: contain;
                border: 1px solid #ddd;
                border-radius: 5px;
                background-color: white;
            `;
            imgElement.alt = equipment.isPipe ? `${equipment.pipeType || equipment.equipment} pipe` : `${equipmentType} with installation method ${installMethod}`;
            
            imgElement.onload = function() {
                console.log('✅ Detail image loaded successfully:', fullImageUrl);
                placeholder.style.display = 'none';
                imageContainer.appendChild(imgElement);
                // Add lightbox click handler
                imgElement.style.cursor = 'pointer';
                imgElement.onclick = () => window.openEquipLightbox(fullImageUrl);
            };
            
            imgElement.onerror = function() {
                console.log('❌ Detail image failed to load even after fallback check:', fullImageUrl);
                placeholder.innerHTML = `
                    <i class="fas fa-exclamation-triangle" style="font-size: 32px; color: #ffc107; margin-bottom: 8px; display: block;"></i>
                    Image not available
                `;
            };
            
            imgElement.src = fullImageUrl;
        } else {
            console.log('❌ No detail image found in either JPG or PNG format');
            const imageName = getImageName(equipmentType, pipeType, installMethod, projectDomain);
            placeholder.innerHTML = `
                <i class="fas fa-exclamation-triangle" style="font-size: 32px; color: #ffc107; margin-bottom: 8px; display: block;"></i>
                Can't find ${imageName || 'image'}
            `;
        }
    } catch (error) {
        console.error('Error in loadEquipmentDetailImage:', error);
        placeholder.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="font-size: 32px; color: #ffc107; margin-bottom: 8px; display: block;"></i>
            Error loading image
        `;
    }
}

// Helper function to get and validate equipment form data
function getEquipmentFormData() {
    // Get form elements
    const equipment = document.getElementById('equipment').value;
    const pipeType = document.getElementById('pipeType')?.value;
    const domain = document.getElementById('projectDomain')?.textContent?.toLowerCase() || 'electricity';
    const isPipe = equipment === 'Pipe';
    
    // Get common fields
    const level = document.getElementById('level').value;
    const totalLevels = document.getElementById('totalLevels').value;
    const installMethod = document.getElementById('installMethod').value;
    const hn = document.getElementById('hn').value;

    // Validation
    if (!equipment) {
        alert('Please select an equipment type.');
        return null;
    }

    // Additional validation for pipes
    if (isPipe && !pipeType) {
        alert('Please select a pipe type.');
        return null;
    }

    if (!level || !totalLevels) {
        alert('Please enter valid level information.');
        return null;
    }

    if (parseInt(level) > parseInt(totalLevels)) {
        alert('Equipment level cannot be greater than total levels.');
        return null;
    }

    if (!hn || parseFloat(hn) <= 0) {
        alert('Please enter a valid building height greater than 0.');
        return null;
    }

    if (!installMethod) {
        alert('Please select an installation method.');
        return null;
    }

    // Base equipment data
    let equipmentData = {
        equipment: isPipe ? `${pipeType}` : equipment, // Store full pipe type name for pipes
        equipmentType: equipment, // Store the base equipment type (Pipe or regular equipment)
        pipeType: isPipe ? pipeType : null, // Store pipe type separately for pipes
        domain: domain,
        level: parseInt(level),
        totalLevels: parseInt(totalLevels),
        installMethod: installMethod,
        hn: parseFloat(hn),
        dateAdded: new Date().toISOString(),
        addedBy: currentUser.email
    };

    if (isPipe) {
        // Pipe-specific fields
        const pipeWeightPerFoot = document.getElementById('pipeWeightPerFoot').value;
        const pipeDiameter = document.getElementById('pipeDiameter').value;
        const supportType = document.getElementById('supportType').value;
        const structureType = document.getElementById('structureType').value;
        const nbcCategory = document.getElementById('nbcCategory').value;

        if (!pipeWeightPerFoot || parseFloat(pipeWeightPerFoot) <= 0) {
            alert('Please enter a valid pipe weight per foot greater than 0.');
            return null;
        }

        if (!pipeDiameter) {
            alert('Please select a pipe diameter.');
            return null;
        }

        if (!nbcCategory) {
            alert('Please select an NBC category.');
            return null;
        }

        equipmentData = {
            ...equipmentData,
            nbcCategory: nbcCategory,
            pipeWeightPerFoot: parseFloat(pipeWeightPerFoot),
            pipeDiameter: pipeDiameter,
            supportType: supportType || 'individual',
            structureType: structureType || 'concrete-slab',
            // Set pipe as suspended piping for calculation purposes
            isPipe: true
        };

    } else {
        // Traditional equipment fields
        const nbcCategory = document.getElementById('nbcCategory').value;
        const weight = document.getElementById('weight').value;
        const weightUnit = document.getElementById('weightUnit').value;
        const height = document.getElementById('height').value;
        const width = document.getElementById('width').value;
        const length = document.getElementById('length').value;
        const numberOfAnchors = document.getElementById('numberOfAnchors').value;
        const anchorType = document.getElementById('anchorType').value;
        const anchorDiameter = document.getElementById('anchorDiameter').value;
        const slabThickness = document.getElementById('slabThickness').value;
        const fc = document.getElementById('fc').value;
        const mountingType = document.getElementById('mountingType').value;
        const isolatorWidth = document.getElementById('isolatorWidth').value;
        const restraintHeight = document.getElementById('restraintHeight').value;
        const edgeDistanceA = document.getElementById('edgeDistanceA').value;
        const edgeDistanceB = document.getElementById('edgeDistanceB').value;
        const numberOfIsolators = document.getElementById('numberOfIsolators').value;
        const hx = document.getElementById('hx').value;

        if (!weight || parseFloat(weight) <= 0) {
            alert('Please enter a valid weight greater than 0.');
            return null;
        }

        if (!height || !width || !length) {
            alert('Please enter valid dimensions for height, width, and length.');
            return null;
        }

        if (!hx || parseFloat(hx) > parseFloat(hn)) {
            alert('Please enter valid heights. Equipment height above base must be less than or equal to building height.');
            return null;
        }

        if (!numberOfAnchors || parseInt(numberOfAnchors) <= 0) {
            alert('Please enter a valid number of anchors greater than 0.');
            return null;
        }

        if (!anchorType) {
            alert('Please select an anchor type.');
            return null;
        }

        if (!anchorDiameter) {
            alert('Please select an anchor diameter.');
            return null;
        }

        equipmentData = {
            ...equipmentData,
            nbcCategory: nbcCategory,
            weight: parseFloat(weight),
            weightUnit: weightUnit,
            height: parseFloat(height),
            width: parseFloat(width),
            length: parseFloat(length),
            numberOfAnchors: parseInt(numberOfAnchors),
            anchorType: anchorType,
            anchorDiameter: anchorDiameter,
            slabThickness: parseFloat(slabThickness) || null,
            fc: parseInt(fc) || null,
            mountingType: mountingType,
            isolatorWidth: parseFloat(isolatorWidth) || null,
            restraintHeight: parseFloat(restraintHeight) || null,
            edgeDistanceA: parseFloat(edgeDistanceA) || null,
            edgeDistanceB: parseFloat(edgeDistanceB) || null,
            numberOfIsolators: parseInt(numberOfIsolators) || null,
            hx: parseFloat(hx),
            isPipe: false
        };
    }

    return equipmentData;
}

// Function to display calculation results
function displayCalculationResults(equipment) {
    console.log('🧮 Displaying calculation results for:', equipment);

    // Get project data for calculations (same as in renderEquipmentList)
    const projectType = document.getElementById('projectType').textContent.toLowerCase().trim();
    let riskCategory = 'Normal';
    if (['hospital', 'fire-station', 'government'].includes(projectType)) {
        riskCategory = 'Protection';
    } else if (['industrial', 'school'].includes(projectType)) {
        riskCategory = 'High';
    }
    
    const currentProject = {
        riskCategory: riskCategory,
        F02: parseFloat(document.getElementById('projectF02').textContent) || 1.05,
        maxSa0_2: parseFloat(document.getElementById('projectMaxSa0_2').textContent) || 0.6,
        S_DS: parseFloat(document.getElementById('projectSDS').textContent) || 0.4
    };

    // Perform all calculations
    const cfsResult = calculateCFS(currentProject, equipment.level, equipment.totalLevels);
    const lateralForce = calculateLateralSeismicForce(cfsResult.cfs, equipment.weight);

    let vpResult = { vp: 'N/A' };
    let categoryData = null;
    
    if (equipment.nbcCategory && equipment.hx !== undefined && equipment.hn !== undefined) {
        vpResult = calculateVp(currentProject, equipment);
        categoryData = nbcCategoryData[equipment.nbcCategory];
    }

    // Calculate overturning forces only for rigid equipment
    let overturningResult = null;
    const rigidCategories = ['11-rigid', '12-rigid', '18', '19'];
    if (rigidCategories.includes(equipment.nbcCategory) && 
        equipment.numberOfAnchors && equipment.height && equipment.width) {
        overturningResult = calculateOverturningForces(equipment, currentProject);
    }

    // Generate the results HTML (same format as equipment details)
    const resultsHTML = generateEquipmentDetailsHTML(equipment, currentProject, cfsResult, lateralForce, vpResult, categoryData, overturningResult);

    // Show the results section and hide placeholder
    const calculationResults = document.getElementById('calculationResults');
    const calculationPlaceholder = document.getElementById('calculationPlaceholder');
    const calculationResultsContent = document.getElementById('calculationResultsContent');

    calculationPlaceholder.style.display = 'none';
    calculationResults.style.display = 'block';
    calculationResultsContent.innerHTML = resultsHTML;

    // Add event listeners for clickable calculation values
    addCalculationEventListeners(calculationResultsContent, equipment, currentProject);

    console.log('✅ Calculation results displayed successfully');
}

// Function to clear the equipment form
function clearEquipmentForm() {
    const form = document.getElementById('equipmentFormElement');
    if (form) {
        form.reset();
        
        // Reset specific fields to defaults
        document.getElementById('nbcCategory').value = '11-rigid';
        document.getElementById('weightUnit').value = 'lbs';
        document.getElementById('fc').value = '2500';
        
        // Hide all conditional fields
        hideAllConditionalFields();
        
        // Reset image
        updateEquipmentImage();
        
        // Hide calculation results and show placeholder
        const calculationResults = document.getElementById('calculationResults');
        const calculationPlaceholder = document.getElementById('calculationPlaceholder');
        
        if (calculationResults && calculationPlaceholder) {
            calculationResults.style.display = 'none';
            calculationPlaceholder.style.display = 'block';
        }
        
        console.log('🧹 Equipment form cleared');
    }
}

// Function to generate equipment details HTML (same format as equipment list)
function generateEquipmentDetailsHTML(equipment, currentProject, cfsResult, lateralForce, vpResult, categoryData, overturningResult) {
    let html = `

        

        <div class="calculation-equipment-info">
            ${equipment.isPipe ? `
                <!-- Pipe specific display in calculation results -->
                ${equipment.nbcCategory ? `<p><strong>NBC Category:</strong> ${equipment.nbcCategory} - ${categoryData ? categoryData.description : 'Unknown'}</p>` : ''}
                <p><strong>Pipe Type:</strong> ${equipment.pipeType || equipment.equipment}</p>
                <p><strong>Pipe Weight per Foot:</strong> ${equipment.pipeWeightPerFoot || 'N/A'} lb/ft</p>
                <p><strong>Pipe Diameter:</strong> ${equipment.pipeDiameter || 'N/A'}</p>
                <p><strong>Support Type:</strong> ${equipment.supportType || 'N/A'} | <strong>Structure Type:</strong> ${equipment.structureType || 'N/A'}</p>
                <p><strong>Level:</strong> ${equipment.level}/${equipment.totalLevels} | <strong>Install Method:</strong> ${getInstallMethodText(equipment.installMethod)}</p>
                ${equipment.hn !== undefined ? `<p><strong>Building Height:</strong> ${equipment.hn} m</p>` : ''}
            ` : `
                <!-- Traditional equipment display in calculation results -->
                ${equipment.nbcCategory ? `<p><strong>NBC Category:</strong> ${equipment.nbcCategory} - ${categoryData ? categoryData.description : 'Unknown'}</p>` : ''}
                <p><strong>Weight:</strong> ${equipment.weight || 'N/A'} ${equipment.weightUnit || 'kg'} | <strong>Dimensions:</strong> ${equipment.height}×${equipment.width}×${equipment.length} in</p>
                <p><strong>Level:</strong> ${equipment.level}/${equipment.totalLevels} | <strong>Install Method:</strong> ${getInstallMethodText(equipment.installMethod)}</p>
                ${equipment.mountingType ? `<p><strong>Mounting Type:</strong> ${getMountingTypeText(equipment.mountingType)}</p>` : ''}
                ${equipment.anchorType ? `<p><strong>Anchor Type:</strong> ${getAnchorTypeText(equipment.anchorType)}</p>` : ''}
                ${equipment.numberOfAnchors ? `<p><strong>Number of Anchors:</strong> ${equipment.numberOfAnchors}${equipment.anchorDiameter ? ` (⌀ ${equipment.anchorDiameter}")` : ''}</p>` : ''}
                ${equipment.slabThickness ? `<p><strong>Slab Thickness:</strong> ${equipment.slabThickness}" | <strong>f'c:</strong> ${equipment.fc} psi</p>` : ''}
                ${equipment.hx !== undefined && equipment.hn !== undefined ? `<p><strong>Height Above Base:</strong> ${equipment.hx} m | <strong>Building Height:</strong> ${equipment.hn} m</p>` : ''}
            `}
            
            <p>
                <strong>CFS:</strong> <span class="calculation-value cfs-value" title="Click to see CFS calculation details">${cfsResult.cfs}</span> | 
                <strong>Lateral Force:</strong> <span class="calculation-value force-value" title="Click to see lateral force calculation details">${lateralForce} N</span>
                ${equipment.nbcCategory ? ` | <strong>NBC Vp:</strong> <span class="calculation-value vp-value" title="Click to see NBC Vp calculation details">${vpResult.vp} N</span>` : ''}
            </p>
            
            ${overturningResult ? `
                <div class="overturning-values">
                    <p><strong>Overturning Analysis (${overturningResult.mountingType === 'no-isolators' ? 'No Isolators' : 'Vibration Isolated Equipment'}):</strong></p>
                    ${overturningResult.mountingType === 'no-isolators' ? `
                        <p>
                            <strong>OTM:</strong> <span class="calculation-value otm-value" title="Click to see OTM calculation details">${overturningResult.OTM} lb-in</span> | 
                            <strong>RM:</strong> <span class="calculation-value rm-value" title="Click to see RM calculation details">${overturningResult.RM} lb-in</span> | 
                            <strong>T:</strong> <span class="calculation-value tension-value" title="Click to see Tension calculation details">${overturningResult.T} lbs</span> | 
                            <strong>V:</strong> <span class="calculation-value shear-value" title="Click to see Shear calculation details">${overturningResult.V} lbs</span>
                        </p>
                    ` : `
                        <p>
                            <strong>Pt:</strong> <span class="calculation-value pt-value" title="Click to see maximum tension calculation details">${overturningResult.Pt} lbs</span> | 
                            <strong>Pc:</strong> <span class="calculation-value pc-value" title="Click to see maximum compression calculation details">${overturningResult.Pc} lbs</span> | 
                            <strong>Ps:</strong> <span class="calculation-value ps-value" title="Click to see maximum shear calculation details">${overturningResult.Ps} lbs</span>
                        </p>
                    `}
                </div>
            ` : ''}
            
            ${(() => {
                // Show piping bracing for pipes
                if (equipment.isPipe && equipment.pipeWeightPerFoot) {
                    const suspendedPiping = calculateSuspendedPipingBracing(equipment, currentProject);
                    return `
                        <div class="suspended-piping-values" style="background: #f0f8ff; padding: 8px; border-radius: 4px; margin-top: 8px; border-left: 4px solid #8b5cf6;">
                            <p><strong>Suspended Piping Bracing (ASHRAE Ch. 8):</strong></p>
                            <p style="font-size: 12px; margin: 4px 0;">
                                <strong>Pipe Weight:</strong> ${suspendedPiping.pipeWeight} lb/ft | 
                                <strong>Seismic Level:</strong> ${suspendedPiping.seismicLevel}
                            </p>
                            <p style="font-size: 12px; margin: 4px 0;">
                                <strong>Hanger Rod:</strong> <span class="calculation-value suspended-piping-value" title="Click to see complete specifications">${suspendedPiping.specifications.hangerRod.diameter}" dia. (${suspendedPiping.specifications.hangerRod.seismicLoad} lbs)</span> | 
                                <strong>Max Unbraced:</strong> ${suspendedPiping.specifications.hangerRod.maxUnbraced}"
                            </p>
                            <p style="font-size: 12px; margin: 4px 0;">
                                <strong>Solid Brace:</strong> ${suspendedPiping.specifications.solidBrace.steelAngle} steel angle | 
                                <strong>Cable Brace:</strong> ${suspendedPiping.specifications.cableBrace.prestretched} lbs
                            </p>
                            ${suspendedPiping.exceedsTable ? '<p style="font-size: 11px; color: #ef4444;">⚠️ Pipe weight exceeds table limits</p>' : ''}
                        </div>
                    `;
                }
                return '';
            })()}

            ${(() => {
                const ashraeResult = calculateASHRAEAnchorBolts(equipment, currentProject);
                return ashraeResult ? `
                    <div class="ashrae-values" style="background: #f0f8ff; padding: 8px; border-radius: 4px; margin-top: 8px; border-left: 4px solid #0066cc;">
                        <p><strong>ASHRAE Anchor Bolt Analysis (${ashraeResult.formulaType}):</strong></p>
                        <p>
                            <strong>Tbolt:</strong> <span class="calculation-value ashrae-tbolt-value" title="Click to see ASHRAE Tbolt calculation details">${ashraeResult.Tbolt} lbs per bolt</span> | 
                            <strong>Vbolt:</strong> <span class="calculation-value ashrae-vbolt-value" title="Click to see ASHRAE Vbolt calculation details">${ashraeResult.Vbolt} lbs per bolt</span>
                        </p>
                        ${ashraeResult.concreteAnalysis ? `
                            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ccc;">
                                <p><strong>Structural Connection:</strong></p>
                                <p style="font-size: 12px; margin: 4px 0;">
                                    <strong>Formula 1:</strong> <span class="calculation-value concrete-formula1-value" title="Click to see Formula 1 calculation details" style="color: ${ashraeResult.concreteAnalysis.formula1.pass ? '#16a34a' : '#ef4444'};">${ashraeResult.concreteAnalysis.formula1.value} ${ashraeResult.concreteAnalysis.formula1.pass ? '✅' : '❌'}</span> | 
                                    <strong>Formula 2:</strong> <span class="calculation-value concrete-formula2-value" title="Click to see Formula 2 calculation details" style="color: ${ashraeResult.concreteAnalysis.formula2.pass ? '#16a34a' : '#ef4444'};">${ashraeResult.concreteAnalysis.formula2.value} ${ashraeResult.concreteAnalysis.formula2.pass ? '✅' : '❌'}</span>
                                </p>
                                <p style="font-size: 11px; margin: 2px 0; color: ${ashraeResult.concreteAnalysis.overallPass ? '#16a34a' : '#ef4444'};">
                                    <strong>Overall Status:</strong> ${ashraeResult.concreteAnalysis.overallPass ? '✅ BOTH FORMULAS PASS' : '❌ ONE OR MORE FORMULAS FAIL'}
                                </p>
                            </div>
                        ` : ''}

                        ${ashraeResult.embedmentAnalysis ? `
                            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ccc;">
                                <p><strong>Minimum Embedment Analysis (${ashraeResult.embedmentAnalysis.anchorType === 'screw' ? 'Screw Anchor' : 'Expansion Anchor'}):</strong></p>
                                ${ashraeResult.embedmentAnalysis.recommendLargerDiameter ? `
                                    <p style="font-size: 12px; margin: 4px 0; color: #ef4444;">
                                        <strong>⚠️ RECOMMENDATION:</strong> <span class="calculation-value embedment-recommendation-value" title="Click to see embedment analysis details">Use larger anchor diameter</span>
                                    </p>
                                    <p style="font-size: 11px; margin: 2px 0; color: #ef4444;">
                                        Current ${ashraeResult.embedmentAnalysis.anchorDiameter}" diameter insufficient for loads
                                    </p>
                                ` : `
                                    <p style="font-size: 12px; margin: 4px 0;">
                                        <strong>Concrete:</strong> <span class="calculation-value concrete-embedment-value" title="Click to see concrete embedment details">${ashraeResult.embedmentAnalysis.minConcreteEmbedment}" min</span> | 
                                        <strong>Steel:</strong> <span class="calculation-value steel-embedment-value" title="Click to see steel embedment details">${ashraeResult.embedmentAnalysis.minSteelEmbedment}" min</span>
                                    </p>
                                    <p style="font-size: 11px; margin: 2px 0; color: #16a34a;">
                                        <strong>Required Min Embedment:</strong> <span class="calculation-value final-embedment-value" title="Click to see final embedment calculation">${ashraeResult.embedmentAnalysis.finalMinEmbedment}"</span>
                                    </p>
                                `}
                            </div>
                        ` : ''}
                    </div>
                ` : '';
            })()}

            ${(() => {
                // Only show for suspended equipment (Fixed to Ceiling) - non-pipes
                if (equipment.installMethod === '4' && !equipment.isPipe) {
                    const suspendedBracing = calculateSuspendedEquipmentBracing(equipment, currentProject);
                    const aircraftCable = suspendedBracing.shoppingList.aircraftCableDetails;
                    return `
                        <div class="suspended-bracing-values" style="background: #f0f8ff; padding: 8px; border-radius: 4px; margin-top: 8px; border-left: 4px solid #6f42c1;">
                            <p><strong>Suspended Equipment Bracing (ASHRAE Ch. 10):</strong></p>
                            <p style="font-size: 12px; margin: 4px 0;">
                                <strong>Hanger Rod:</strong> <span class="calculation-value suspended-hanger-value" title="Click to see hanger rod specifications">${suspendedBracing.specifications.hangerRod.diameter}" dia. (${suspendedBracing.specifications.hangerRod.maxUnbracedLength}" max unbraced)</span> | 
                                <strong>Aircraft Cable:</strong> <span class="calculation-value suspended-brace-value" title="Click to see complete bracing specifications">⌀ ${aircraftCable.diameter}" (${aircraftCable.breakingStrength} lbs)${aircraftCable.insufficient ? ' ⚠️' : ''}</span>
                            </p>
                            <p style="font-size: 11px; margin: 2px 0; color: #6f42c1;">
                                <strong>Seismic Level:</strong> ${suspendedBracing.seismicLevel} | <strong>Weight:</strong> ${suspendedBracing.weightLbs} lbs
                            </p>
                        </div>
                    `;
                }
                return '';
            })()}
        </div>
    `;

    return html;
}

// Function to add event listeners to calculation values in results
function addCalculationEventListeners(container, equipment, currentProject) {
    // Basic calculation listeners
    const cfsValue = container.querySelector('.cfs-value');
    const forceValue = container.querySelector('.force-value');
    const vpValue = container.querySelector('.vp-value');
    
    // Overturning calculation listeners
    const otmValue = container.querySelector('.otm-value');
    const rmValue = container.querySelector('.rm-value');
    const tensionValue = container.querySelector('.tension-value');
    const shearValue = container.querySelector('.shear-value');

    // Vibration isolator calculation listeners
    const ptValue = container.querySelector('.pt-value');
    const pcValue = container.querySelector('.pc-value');
    const psValue = container.querySelector('.ps-value');
    
    // ASHRAE calculation listeners
    const ashraeTboltValue = container.querySelector('.ashrae-tbolt-value');
    const ashraeVboltValue = container.querySelector('.ashrae-vbolt-value');
    const concreteFormula1Value = container.querySelector('.concrete-formula1-value');
    const concreteFormula2Value = container.querySelector('.concrete-formula2-value');

    const concreteEmbedmentValue = container.querySelector('.concrete-embedment-value');
    const steelEmbedmentValue = container.querySelector('.steel-embedment-value');
    const finalEmbedmentValue = container.querySelector('.final-embedment-value');
    const embedmentRecommendationValue = container.querySelector('.embedment-recommendation-value');

    const suspendedHangerValue = container.querySelector('.suspended-hanger-value');
    const suspendedBraceValue = container.querySelector('.suspended-brace-value');

    // Add event listeners
    if (cfsValue) {
        cfsValue.addEventListener('click', () => {
            showCFSCalculationDetails(equipment, currentProject);
        });
    }
    
    if (forceValue) {
        forceValue.addEventListener('click', () => {
            showLateralForceCalculationDetails(equipment, currentProject);
        });
    }
    
    if (vpValue && equipment.nbcCategory) {
        vpValue.addEventListener('click', () => {
            showVpCalculationDetails(equipment, currentProject);
        });
    }
    
    // Overturning calculation event listeners
    if (otmValue) {
        otmValue.addEventListener('click', () => {
            showOTMCalculationDetails(equipment, currentProject);
        });
    }
    
    if (rmValue) {
        rmValue.addEventListener('click', () => {
            showRMCalculationDetails(equipment, currentProject);
        });
    }
    
    if (tensionValue) {
        tensionValue.addEventListener('click', () => {
            showTensionCalculationDetails(equipment, currentProject);
        });
    }
    
    if (shearValue) {
        shearValue.addEventListener('click', () => {
            showShearCalculationDetails(equipment, currentProject);
        });
    }

    // Vibration isolator calculation event listeners
    if (ptValue) {
        ptValue.addEventListener('click', () => {
            showPtCalculationDetails(equipment, currentProject);
        });
    }

    if (pcValue) {
        pcValue.addEventListener('click', () => {
            showPcCalculationDetails(equipment, currentProject);
        });
    }

    if (psValue) {
        psValue.addEventListener('click', () => {
            showPsCalculationDetails(equipment, currentProject);
        });
    }

    // ASHRAE calculation event listeners
    if (ashraeTboltValue) {
        ashraeTboltValue.addEventListener('click', () => {
            showASHRAETboltDetails(equipment, currentProject);
        });
    }

    if (ashraeVboltValue) {
        ashraeVboltValue.addEventListener('click', () => {
            showASHRAEVboltDetails(equipment, currentProject);
        });
    }

    if (concreteFormula1Value) {
        concreteFormula1Value.addEventListener('click', () => {
            showConcreteFormula1Details(equipment, currentProject);
        });
    }

    if (concreteFormula2Value) {
        concreteFormula2Value.addEventListener('click', () => {
            showConcreteFormula2Details(equipment, currentProject);
        });
    }

    if (concreteEmbedmentValue) {
        concreteEmbedmentValue.addEventListener('click', () => {
            showConcreteEmbedmentDetails(equipment, currentProject);
        });
    }

    if (steelEmbedmentValue) {
        steelEmbedmentValue.addEventListener('click', () => {
            showSteelEmbedmentDetails(equipment, currentProject);
        });
    }

    if (finalEmbedmentValue) {
        finalEmbedmentValue.addEventListener('click', () => {
            showFinalEmbedmentDetails(equipment, currentProject);
        });
    }

    if (embedmentRecommendationValue) {
        embedmentRecommendationValue.addEventListener('click', () => {
            showEmbedmentRecommendationDetails(equipment, currentProject);
        });
    }

    if (suspendedHangerValue) {
        suspendedHangerValue.addEventListener('click', () => {
            showSuspendedHangerDetails(equipment, currentProject);
        });
    }

    if (suspendedBraceValue) {
        suspendedBraceValue.addEventListener('click', () => {
            showSuspendedBraceDetails(equipment, currentProject);
        });
    }
}

// PDF Report Generation
// Frontend: Update generateProjectReport function in project-details.js
// Add this logic before calling the Lambda API

async function generateProjectReport() {
    if (!currentProjectId) {
        alert('Error: No project selected');
        return;
    }

    const generateButton = document.getElementById('generateReportButton');
    
    try {
        generateButton.disabled = true;
        generateButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating PDF... (up to 30 seconds)';
        
        // ENHANCEMENT: Calculate embedment for each equipment before sending to Lambda
        const equipmentWithEmbedment = await prepareEquipmentForReport();
        
        // Create a project object with enhanced equipment data
        const projectForReport = {
            ...projectData,
            equipment: equipmentWithEmbedment
        };
        
        // Send enhanced project data to Lambda (equipment now includes calculatedMinEmbedment)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);

        const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/report`, {
            method: 'POST', // Change to POST to send data in body
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                projectData: projectForReport
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            if (response.status === 504) {
                throw new Error('PDF generation timed out. Please try again.');
            }
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'PDF generation failed');
        }

        if (!result.downloadUrl) {
            throw new Error('No download URL received from server');
        }

        console.log('✅ Opening download URL:', result.downloadUrl);
        // window.open(result.downloadUrl, '_blank');
        window.location.href = result.downloadUrl;
        
        console.log('✅ PDF download completed successfully');
        
    } catch (error) {
        console.error('❌ PDF generation error:', error);
        if (error.name === 'AbortError' || error.message.includes('504')) {
            alert('PDF generation timed out. Please try again in a few minutes.');
        } else {
            alert('Error generating report: ' + error.message);
        }
    } finally {
        generateButton.disabled = false;
        generateButton.innerHTML = '<i class="fas fa-file-pdf"></i> Generate Report';
    }
}

// NEW: Function to calculate embedment for each equipment before sending to Lambda
async function prepareEquipmentForReport() {
    console.log('📊 Calculating embedment values for PDF report...');
    
    // Get current project data for calculations
    const projectType = document.getElementById('projectType').textContent.toLowerCase().trim();
    let riskCategory = 'Normal';
    if (['hospital', 'fire-station', 'government'].includes(projectType)) {
        riskCategory = 'Protection';
    } else if (['industrial', 'school'].includes(projectType)) {
        riskCategory = 'High';
    }
    
    const currentProject = {
        riskCategory: riskCategory,
        F02: parseFloat(document.getElementById('projectF02').textContent) || 1.05,
        maxSa0_2: parseFloat(document.getElementById('projectMaxSa0_2').textContent) || 0.6,
        S_DS: parseFloat(document.getElementById('projectSDS').textContent) || 0.4
    };

    // Calculate embedment for each equipment
    const equipmentWithEmbedment = projectEquipment.map(equipment => {
        if (equipment.isPipe) {
            // Pipes don't need embedment calculations
            return equipment;
        }

        try {
            // Calculate ASHRAE anchor bolt forces
            const ashraeResult = calculateASHRAEAnchorBolts(equipment, currentProject);
            
            if (ashraeResult && ashraeResult.embedmentAnalysis && ashraeResult.embedmentAnalysis.finalMinEmbedment) {
                const calculatedMinEmbedment = ashraeResult.embedmentAnalysis.finalMinEmbedment;
                console.log(`✅ Calculated embedment for ${equipment.equipment}: ${calculatedMinEmbedment}`);
                
                return {
                    ...equipment,
                    calculatedMinEmbedment: calculatedMinEmbedment
                };
            } else {
                console.log(`⚠️ No embedment calculation for ${equipment.equipment}`);
                return {
                    ...equipment,
                    calculatedMinEmbedment: null
                };
            }
        } catch (error) {
            console.error('Error calculating embedment for equipment:', equipment.equipment, error);
            return {
                ...equipment,
                calculatedMinEmbedment: null
            };
        }
    });

    console.log('✅ Equipment embedment calculations completed');
    console.log('📤 Equipment data being sent to Lambda:', equipmentWithEmbedment.map(e => ({
        equipment: e.equipment,
        calculatedMinEmbedment: e.calculatedMinEmbedment
    })));
    
    return equipmentWithEmbedment;
}

async function saveProjectStatus(newStatus) {
    try {
        const response = await fetch('https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects', {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id: currentProjectId,
                status: newStatus
            })
        });
        
        if (response.ok) {
            console.log('Status saved');
        }
    } catch (error) {
        console.error('Save failed:', error);
    }
}

// Function to request image for equipment (admin only)
async function requestEquipmentImage(index) {
    if (!isAdmin) {
        alert('Only admins can request images.');
        return;
    }

    if (!canModifyProject()) {
        alert('You do not have permission to modify this project.');
        return;
    }

    try {
        // Toggle the image request status
        const equipment = projectEquipment[index];
        equipment.imageRequested = !equipment.imageRequested;
        
        // Save to database
        await saveEquipmentToProject();
        
        // Re-render the equipment list
        renderEquipmentList();
        
        const action = equipment.imageRequested ? 'sent' : 'cancelled';
        alert(`Image request ${action} successfully.`);
        
    } catch (error) {
        console.error('Error updating image request:', error);
        alert('Error updating image request: ' + error.message);
    }
}


// Make functions globally available
window.logout = logout;
window.deleteEquipment = deleteEquipment;
window.toggleEquipmentDetails = toggleEquipmentDetails;
window.editEquipment = editEquipment;
window.saveEquipmentEdit = saveEquipmentEdit;
window.cancelEquipmentEdit = cancelEquipmentEdit;
window.toggleProjectDetails = toggleProjectDetails;
window.updateEditAnchorDiameters = updateEditAnchorDiameters;
window.updateEditMountingTypeFields = updateEditMountingTypeFields;
window.generateProjectReport = generateProjectReport;
window.requestEquipmentImage = requestEquipmentImage;
