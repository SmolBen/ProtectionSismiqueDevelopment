// Exterior Wall Calculation Logic - V2
// Uses colombageData for track pairings

/**
 * Main calculation function
 * @param {Object} inputs - User input values
 * @returns {Object} Calculation results with all checks
 */
function calculateExteriorWall(inputs) {
  const {
    windloadULS,        // psf
    spacing,            // inches
    bridgingSpacing,    // inches
    deflectionLimit,    // L/value
    heightFt,           // feet
    heightIn,           // inches
    bearingLength,      // inches
    fastenerType,       // EOF, IOF, ETF, ITF
    steelStud,          // designation
    bottomTrack,        // designation
    deflectionTrack     // designation (may include "TROUÉE")
  } = inputs;

  // Calculate derived values
  const windloadSLS = windloadULS * 0.75;
  const heightTotal = heightFt + heightIn / 12; // total height in feet
  const ulsLoad = (1.4 * windloadULS * spacing) / 12; // lb/ft
  const slsLoad = (windloadSLS * spacing) / 12; // lb/ft

  // Get stud properties
  const stud = findStud(steelStud);
  if (!stud) throw new Error(`Stud ${steelStud} not found in database`);

  // Determine moment capacity based on bridging spacing
  const momentCapacity = stud.lu <= bridgingSpacing ? stud.mrxUL : stud.mrxDB;

  // 1. MOMENT CHECK
  const momentRequired = ((ulsLoad * Math.pow(heightTotal, 2)) / 8) * (12 / 1000); // kip.in
  const momentRatio = momentRequired / momentCapacity;
  const momentCheck = momentRequired < momentCapacity ? 'PASS' : 'FAIL';

  // 2. SHEAR CHECK
  const shearRequired = (heightTotal * ulsLoad) / 2000; // kip
  const shearCapacity = stud.vrn; // kip
  const shearRatio = shearRequired / shearCapacity;
  const shearCheck = shearRequired < shearCapacity ? 'PASS' : 'FAIL';

  // 3. COMBINED CHECK
  const combinedRatio = Math.sqrt(Math.pow(momentRatio, 2) + Math.pow(shearRatio, 2));
  const combinedCheck = combinedRatio <= 1 ? 'PASS' : 'FAIL';

  // 4. DEFLECTION CHECK
  const deflectionRequired = (5 * (slsLoad / 12) * Math.pow(heightTotal * 12, 4)) / 
                              (384 * 29000000 * stud.ixd); // inches
  const deflectionAllowable = (12 * heightTotal) / deflectionLimit; // inches
  const deflectionActualLimit = (heightFt * 12 + heightIn) / deflectionRequired;
  const deflectionCheck = deflectionRequired < deflectionAllowable ? 'PASS' : 'FAIL';

  // 5. WEB CRIPPLING CHECK
  const studDepth = parseStudDepth(steelStud);
  const thicknessMil = parseInt(steelStud.match(/\d+$/)[0]);
  const thicknessIn = getThicknessInches(thicknessMil);
  
  const cripData = findCripData(studDepth, thicknessMil);
  if (!cripData) {
    return {
      error: `Web crippling data not found for depth ${studDepth}" and thickness ${thicknessMil} mil`
    };
  }

  const h = cripData.ht_ratio * thicknessIn;
  
  // Calculate bearing length
  const bearingLengthCalc = (bearingLength / h < 2 && bearingLength / thicknessIn < 210)
    ? bearingLength
    : Math.min(2 * h, 210 * thicknessIn);

  // Get web crippling capacity based on fastener type
  const p1 = getCrip1Value(cripData, fastenerType);
  const p2 = getCrip2Value(cripData, fastenerType);
  const webCripplingCapacity = p1 + p2 * Math.sqrt(bearingLengthCalc / thicknessIn); // lb
  
  const reactionForce = shearRequired * 1000; // lb
  const webCripplingRatio = reactionForce / webCripplingCapacity;
  const webCripplingStiffener = reactionForce < webCripplingCapacity ? 'NO' : 'YES';

  // 6. DEFLECTION TRACK CHECK
  const trackCapacity = getDeflectionTrackCapacity(deflectionTrack);
  const trackLoad = reactionForce / 1.4; // lb (convert from ULS to SLS)
  const trackRatio = trackLoad / trackCapacity;
  const trackCheck = trackLoad <= trackCapacity ? 'PASS' : 'FAIL';

  return {
    // Inputs echoed back
    inputs: {
      windloadULS,
      windloadSLS,
      spacing,
      bridgingSpacing,
      deflectionLimit,
      height: `${heightFt}'-${heightIn}"`,
      heightTotal,
      bearingLength,
      fastenerType,
      steelStud,
      bottomTrack,
      deflectionTrack
    },
    
    // Calculated loads
    loads: {
      ulsLoad: ulsLoad.toFixed(2),
      slsLoad: slsLoad.toFixed(2)
    },

    // Check results
    checks: {
      moment: {
        status: momentCheck,
        required: momentRequired.toFixed(3),
        allowable: momentCapacity.toFixed(3),
        ratio: (momentRatio * 100).toFixed(2)
      },
      shear: {
        status: shearCheck,
        required: shearRequired.toFixed(3),
        allowable: shearCapacity.toFixed(3),
        ratio: (shearRatio * 100).toFixed(2)
      },
      combined: {
        status: combinedCheck,
        ratio: (combinedRatio * 100).toFixed(2)
      },
      deflection: {
        status: deflectionCheck,
        required: deflectionRequired.toFixed(4),
        requiredLimit: `L/${Math.round(deflectionActualLimit)}`,
        allowable: deflectionAllowable.toFixed(4),
        allowableLimit: `L/${deflectionLimit}`,
        ratio: (deflectionRequired / deflectionAllowable * 100).toFixed(2)
      },
      webCrippling: {
        stiffener: webCripplingStiffener,
        reaction: reactionForce.toFixed(1),
        capacity: webCripplingCapacity.toFixed(1),
        ratio: (webCripplingRatio * 100).toFixed(2)
      },
      deflectionTrack: {
        status: trackCheck,
        load: trackLoad.toFixed(1),
        capacity: trackCapacity.toFixed(1),
        ratio: (trackRatio * 100).toFixed(2)
      }
    }
  };
}

/**
 * Parse stud designation to get depth in inches
 */
function parseStudDepth(designation) {
  // Examples: 600S125-33 -> 6", 362S125-33 -> 3.625", 2x600S125-33 -> 6"
  const match = designation.match(/(\d+)S/);
  if (!match) return 0;
  
  const value = parseInt(match[1]);
  if (value === 362) return 3.625;
  if (value < 100) return value; // Already in inches
  return value / 100; // Convert from mils notation
}

/**
 * Convert thickness from mils to inches
 */
function getThicknessInches(thicknessMil) {
  const map = {
    18: 0.0188,
    33: 0.0346,
    43: 0.0451,
    54: 0.0566,
    68: 0.0713,
    97: 0.1017
  };
  return map[thicknessMil] || 0;
}

/**
 * Get web crippling P1 value based on fastener type
 */
function getCrip1Value(cripData, fastenerType) {
  switch (fastenerType) {
    case 'EOF': return cripData.peo1;
    case 'IOF': return cripData.pio1;
    case 'ETF': return cripData.pet1;
    case 'ITF': return cripData.pit1;
    default: return 0;
  }
}

/**
 * Get web crippling P2 value based on fastener type
 */
function getCrip2Value(cripData, fastenerType) {
  switch (fastenerType) {
    case 'EOF': return cripData.peo2;
    case 'IOF': return cripData.pio2;
    case 'ETF': return cripData.pet2;
    case 'ITF': return cripData.pit2;
    default: return 0;
  }
}

/**
 * Get deflection track capacity based on designation
 * Based on Bailey method (LSD) - from Excel hardcoded values
 * Handles both T and ST designations
 */
function getDeflectionTrackCapacity(designation) {
  // Remove "TROUÉE" suffix if present
  const cleanDesignation = designation.replace(/ TROUÉE$/i, '').replace(/TROUÉE$/i, '').trim();
  
  // Extract thickness (last 2 digits)
  const thicknessMil = parseInt(cleanDesignation.match(/\d+$/)[0]);
  
  // Capacity map from Excel (Pr LSD-Bailey values)
  const capacityMap = {
    18: null,  // Not available in Excel
    33: 175,
    43: 257,
    54: 458,
    68: 608,
    97: null   // Not available in Excel
  };
  
  return capacityMap[thicknessMil] || 0;
}