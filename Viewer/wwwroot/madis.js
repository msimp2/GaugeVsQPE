/**
 * MADIS Gauge Data Module
 * Handles fetching, processing, and visualizing gauge precipitation data with MRMS QPE comparison
 */

import {
    GEOGRAPHIC_BOUNDS,
    BATCH_PROCESSING,
    UNIT_CONVERSION,
    MRMS_ZERO_THRESHOLD,
    BIAS_RATIO_FOR_ZERO_MRMS,
    GAUGE_MARKER,
    BIAS_COLOR_THRESHOLDS,
    PRECIP_COLOR_THRESHOLDS,
    ZERO_PRECIP_COLOR
} from './config.js';
import { updateGaugeCountStatistics } from './statisticsCalculator.js';

// Global state for MADIS data and markers
window.madisData = [];
window.madisMarkersLayer = null;
window.fullGaugeData = [];

/**
 * Builds the MADIS API URL for fetching gauge precipitation data
 *
 * @param {string} startDate - Date in YYYYMMDD format
 * @param {string} startHour - Hour in HH format (00-23)
 * @param {string} startMinute - Minute in MM format
 * @param {number} lookBack - Minutes to look back from start time
 * @param {number} lookForward - Minutes to look forward from start time
 * @param {string} accumPeriod - Accumulation period ('1H' or '24H')
 * @returns {string} Complete MADIS API URL
 */
function buildMadisApiUrl(startDate, startHour, startMinute, lookBack, lookForward, accumPeriod = '1H') {
    const precipVariable = accumPeriod === '24H' ? 'PCP24H' : 'PCP1H';

    const params = new URLSearchParams({
        rdr: '',
        time: `${startDate}_${startHour}${startMinute}`,
        minbck: `-${lookBack}`,
        minfwd: lookForward,
        recwin: '4',
        dfltrsel: '0',
        state: '',
        latll: GEOGRAPHIC_BOUNDS.LAT_LOWER,
        lonll: GEOGRAPHIC_BOUNDS.LON_LOWER,
        latur: GEOGRAPHIC_BOUNDS.LAT_UPPER,
        lonur: GEOGRAPHIC_BOUNDS.LON_UPPER,
        stanam: '',
        stasel: '0',
        pvdrsel: '0',
        varsel: '1',
        qctype: '0',
        qcsel: '0',
        xml: '5',
        csvmiss: '0'
    });

    // Add required variables
    params.append('nvars', precipVariable);
    params.append('nvars', 'LAT');
    params.append('nvars', 'LON');

    return `https://madis-data.ncep.noaa.gov/madisPublic1/cgi-bin/madisXmlPublicDir?${params.toString()}`;
}

/**
 * Converts precipitation value from millimeters to inches
 *
 * @param {number} valueInMM - Value in millimeters
 * @returns {number} Value in inches
 */
function convertMMToInches(valueInMM) {
    return valueInMM * UNIT_CONVERSION.MM_TO_INCHES;
}

/**
 * Converts precipitation value from inches to millimeters
 *
 * @param {number} valueInInches - Value in inches
 * @returns {number} Value in millimeters
 */
function convertInchesToMM(valueInInches) {
    return valueInInches * UNIT_CONVERSION.INCHES_TO_MM;
}

/**
 * Retrieves the MRMS QPE value at a specific lat/lon coordinate
 *
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<number|null>} MRMS value in inches, or null if not available
 */
async function getMrmsValueAtLocation(lat, lon) {
    try {
        const response = await fetch(`/api/tiles/value?lat=${lat}&lon=${lon}&cacheKey=default`);
        const result = await response.json();
        return result.value;
    } catch (error) {
        console.error('Error fetching MRMS value:', error);
        return null;
    }
}

/**
 * Processes items in batches to avoid overwhelming the browser/server
 * Includes a small delay between batches for rate limiting
 *
 * @param {Array} items - Array of items to process
 * @param {number} batchSize - Number of items per batch
 * @param {Function} processFn - Async function to process each item
 * @returns {Promise<Array>} Array of processed results
 */
async function processBatches(items, batchSize, processFn) {
    const results = [];

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(processFn));
        results.push(...batchResults);

        // Small delay between batches to prevent overwhelming the connection
        if (i + batchSize < items.length) {
            await new Promise(resolve => setTimeout(resolve, BATCH_PROCESSING.DELAY_BETWEEN_BATCHES_MS));
        }
    }

    return results;
}

/**
 * Determines the color for a precipitation value based on thresholds
 *
 * @param {number} valueInInches - Precipitation value in inches
 * @returns {string} RGB color string
 */
function getPrecipitationColor(valueInInches) {
    if (valueInInches <= 0) {
        return ZERO_PRECIP_COLOR;
    }

    for (const { threshold, color } of PRECIP_COLOR_THRESHOLDS) {
        if (valueInInches >= threshold) {
            return color;
        }
    }

    return PRECIP_COLOR_THRESHOLDS[PRECIP_COLOR_THRESHOLDS.length - 1].color;
}

/**
 * Determines the color for a bias ratio value
 * Bias ratio represents gauge/QPE ratio
 *
 * @param {number|null} biasRatio - Gauge/QPE ratio
 * @returns {string} RGB color string
 */
function getBiasColor(biasRatio) {
    if (biasRatio === null || biasRatio === undefined || !isFinite(biasRatio)) {
        return ZERO_PRECIP_COLOR;
    }

    for (const { threshold, color } of BIAS_COLOR_THRESHOLDS) {
        if (biasRatio >= threshold) {
            return color;
        }
    }

    return BIAS_COLOR_THRESHOLDS[BIAS_COLOR_THRESHOLDS.length - 1].color;
}

/**
 * Calculates the bias ratio between gauge and MRMS values
 * Handles special cases for zero MRMS values
 *
 * @param {number} gaugeValue - Gauge precipitation value
 * @param {number|null} mrmsValue - MRMS precipitation value
 * @param {boolean} showZeroMrms - Whether to include gauges where MRMS is zero
 * @returns {Object} Object with biasRatio and shouldInclude flag
 */
function calculateBiasRatio(gaugeValue, mrmsValue, showZeroMrms) {
    const mrmsIsZero = mrmsValue === null || mrmsValue === 0 || mrmsValue < MRMS_ZERO_THRESHOLD;

    if (gaugeValue > 0 && mrmsIsZero) {
        // Gauge detected precip but MRMS didn't
        if (!showZeroMrms) {
            return { biasRatio: null, shouldInclude: false };
        }
        return { biasRatio: BIAS_RATIO_FOR_ZERO_MRMS, shouldInclude: true };
    }

    if (mrmsValue !== null && mrmsValue !== undefined && mrmsValue >= MRMS_ZERO_THRESHOLD) {
        // Both have valid values
        return { biasRatio: gaugeValue / mrmsValue, shouldInclude: true };
    }

    return { biasRatio: null, shouldInclude: true };
}

/**
 * Clears all gauge markers from the map
 *
 * @param {Object} map - Leaflet map instance
 */
function clearGaugeMarkers(map) {
    if (window.madisMarkersLayer) {
        window.madisMarkersLayer.clearLayers();
    } else if (map) {
        window.madisMarkersLayer = L.layerGroup().addTo(map);
    }
}

/**
 * Filters gauges to only those with precipitation and within bounds
 *
 * @param {Array} gauges - Array of gauge objects
 * @returns {Array} Filtered array of gauge objects
 */
function filterGaugesWithPrecipitation(gauges) {
    return gauges.filter(item => {
        const { lat, lon, value } = item;
        return !isNaN(lat) && !isNaN(lon) &&
               lat >= GEOGRAPHIC_BOUNDS.LAT_LOWER &&
               lat <= GEOGRAPHIC_BOUNDS.LAT_UPPER &&
               lon >= GEOGRAPHIC_BOUNDS.LON_LOWER &&
               lon <= GEOGRAPHIC_BOUNDS.LON_UPPER &&
               value > 0;
    });
}

/**
 * Processes a single gauge: converts units, fetches MRMS value, calculates bias
 *
 * @param {Object} gauge - Gauge object with stationId, lat, lon, value, etc.
 * @param {boolean} showZeroMrms - Whether to include gauges where MRMS is zero
 * @returns {Promise<Object|null>} Processed gauge data or null if should be excluded
 */
async function processGauge(gauge, showZeroMrms) {
    const { stationId, obvTime, provider, value, lat, lon } = gauge;
    const displayValue = convertMMToInches(value);

    if (!isFinite(displayValue) || isNaN(displayValue)) {
        return null;
    }

    const mrmsValue = await getMrmsValueAtLocation(lat, lon);
    const { biasRatio, shouldInclude } = calculateBiasRatio(displayValue, mrmsValue, showZeroMrms);

    if (!shouldInclude) {
        return null;
    }

    return {
        stationId,
        obvTime,
        provider,
        displayValue,
        mrmsValue,
        biasRatio,
        lat,
        lon
    };
}

/**
 * Creates a Leaflet marker for a gauge
 *
 * @param {Object} gaugeData - Processed gauge data
 * @param {boolean} biasMode - Whether to color by bias or magnitude
 * @param {string} unit - Display unit ('in' for inches)
 * @returns {Object} Leaflet circle marker
 */
function createGaugeMarker(gaugeData, biasMode, unit) {
    const { stationId, obvTime, provider, displayValue, mrmsValue, biasRatio, lat, lon } = gaugeData;

    const fillColor = biasMode ? getBiasColor(biasRatio) : getPrecipitationColor(displayValue);

    const mrmsText = mrmsValue !== null && mrmsValue !== undefined
        ? `<strong>MRMS:</strong> ${mrmsValue.toFixed(2)} ${unit}<br/><strong>Gauge:</strong> ${displayValue.toFixed(2)} ${unit}`
        : `<strong>Gauge:</strong> ${displayValue.toFixed(2)} ${unit}`;

    return L.circleMarker([lat, lon], {
        radius: GAUGE_MARKER.RADIUS,
        color: GAUGE_MARKER.BORDER_COLOR,
        fillColor: fillColor,
        fillOpacity: GAUGE_MARKER.FILL_OPACITY,
        weight: GAUGE_MARKER.BORDER_WEIGHT
    }).bindPopup(
        `<strong>${stationId}</strong><br/>` +
        `Obs Time: ${obvTime}<br/>` +
        `Provider: ${provider}<br/>` +
        mrmsText
    );
}

/**
 * Plots all processed gauge data on the map with MRMS comparison
 *
 * @param {Object} map - Leaflet map instance
 */
async function plotGaugeData(map) {
    if (!map) {
        console.error('Leaflet map is not initialized.');
        return;
    }

    clearGaugeMarkers(map);

    const unit = 'in';
    const biasMode = document.getElementById('bias-toggle')?.checked || false;
    const showZeroMrms = document.getElementById('show-zero-mrms-toggle')?.checked || false;

    const totalGaugesLoaded = window.madisData.length;
    const filteredGauges = filterGaugesWithPrecipitation(window.madisData);

    // Process gauges in batches to avoid overwhelming the server
    const gaugeData = await processBatches(
        filteredGauges,
        BATCH_PROCESSING.BATCH_SIZE,
        async (gauge) => await processGauge(gauge, showZeroMrms)
    );

    // Store processed gauge data globally for filtering by map bounds
    window.fullGaugeData = gaugeData.filter(d => d !== null);

    // Update statistics display
    updateGaugeCountStatistics(totalGaugesLoaded, window.fullGaugeData.length);

    // Plot all gauges as markers
    for (const data of gaugeData) {
        if (!data) continue;

        const marker = createGaugeMarker(data, biasMode, unit);
        marker.addTo(window.madisMarkersLayer);
    }

    // Update scatterplot with gauge data
    if (window.scatterplotManager) {
        window.scatterplotManager.updateData(window.fullGaugeData, biasMode);
    }
}

/**
 * Fetches MADIS CSV data from the proxy and parses it
 *
 * @param {string} url - Proxy URL for MADIS data
 * @param {Object} map - Leaflet map instance
 */
async function fetchAndParseMadisData(url, map) {
    clearGaugeMarkers(map);

    try {
        const response = await fetch(url);
        const text = await response.text();
        const lines = text.trim().split('\n');

        if (lines.length < 2) {
            console.warn('No MADIS data returned');
            return;
        }

        window.madisData = parseMADISCSV(lines);
        await plotGaugeData(map);

    } catch (error) {
        console.error('Error fetching MADIS data:', error);
    }
}

/**
 * Parses MADIS CSV data into structured objects
 *
 * @param {Array<string>} lines - Array of CSV lines
 * @returns {Array<Object>} Array of parsed gauge objects
 */
function parseMADISCSV(lines) {
    const gauges = [];

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length < 10) continue;

        const stationId = cols[0];
        const obvTime = cols[2];
        const provider = cols[3];

        // Precipitation is in meters, convert to mm and ensure non-negative
        let value = Math.round((parseFloat(cols[5]) * 1000) * 100) / 100;
        value = Math.max(0, value);

        const lat = parseFloat(cols[7]);
        const lon = parseFloat(cols[9]);

        gauges.push({ stationId, obvTime, provider, value, lat, lon });
    }

    return gauges;
}

/**
 * Updates the scatterplot based on current map bounds
 * Filters gauge data to only show gauges visible in the current viewport
 *
 * @param {Object} map - Leaflet map instance
 */
function updateScatterplotByBounds(map) {
    if (!map || !window.fullGaugeData || window.fullGaugeData.length === 0) {
        return;
    }

    const bounds = map.getBounds();
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const west = bounds.getWest();
    const east = bounds.getEast();

    // Filter gauges within current map bounds
    const filteredData = window.fullGaugeData.filter(d => {
        if (!d) return false;
        return d.lat >= south && d.lat <= north && d.lon >= west && d.lon <= east;
    });

    const biasMode = document.getElementById('bias-toggle')?.checked || false;

    if (window.scatterplotManager) {
        window.scatterplotManager.updateData(filteredData, biasMode);
    }
}

/**
 * Initializes the MADIS functionality and returns controller interface
 *
 * @param {Object} map - Leaflet map instance
 * @returns {Object} Controller object with methods to interact with MADIS data
 */
export function initializeMadis(map) {
    if (!map) {
        console.error('Map not provided to initializeMadis');
        return;
    }

    window.madisMarkersLayer = L.layerGroup().addTo(map);

    return {
        /**
         * Loads MADIS gauge data for a specific time period
         *
         * @param {string} date - Date in YYYYMMDD format
         * @param {string} hour - Hour in HH format
         * @param {string} minute - Minute in MM format
         * @param {number} lookBack - Minutes to look back
         * @param {number} lookForward - Minutes to look forward
         * @param {string} accumPeriod - Accumulation period ('1H' or '24H')
         * @returns {Promise<number>} Number of gauges loaded
         */
        loadMadisData: async function(date, hour, minute, lookBack, lookForward, accumPeriod) {
            const madisUrl = buildMadisApiUrl(date, hour, minute, lookBack, lookForward, accumPeriod);
            console.log('MADIS URL:', madisUrl);

            const proxyUrl = `/api/madisproxy?url=${encodeURIComponent(madisUrl)}`;
            console.log('Proxy URL:', proxyUrl);

            await fetchAndParseMadisData(proxyUrl, map);

            return window.madisData.length;
        },

        /**
         * Clears all gauge markers from the map
         */
        clearMarkers: function() {
            clearGaugeMarkers(map);
        },

        /**
         * Toggles visibility of gauge markers
         *
         * @param {boolean} visible - Whether markers should be visible
         */
        toggleVisibility: function(visible) {
            if (window.madisMarkersLayer) {
                if (visible) {
                    map.addLayer(window.madisMarkersLayer);
                } else {
                    map.removeLayer(window.madisMarkersLayer);
                }
            }
        },

        /**
         * Updates scatterplot to show only gauges in current map bounds
         */
        updateScatterplotByBounds: function() {
            updateScatterplotByBounds(map);
        },

        /**
         * Replots gauges with current data (useful for bias mode toggle or filter changes)
         */
        replotGauges: function() {
            plotGaugeData(map);
        }
    };
}
