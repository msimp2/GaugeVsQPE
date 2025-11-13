/**
 * Main Application Module
 * Initializes and orchestrates all components of the MRMS QPE Viewer
 */

import { initializeMap, createBasemapLayers, addBasemapToMap, initializeOverlays, getAllOverlaySettings } from './mapManager.js';
import { updateQPEColorbar } from './colorbarManager.js';
import { initializeMadis } from './madis.js';
import {
    initializeDateTimeInputs,
    setupProductSelectHandler,
    setupBiasToggleHandler,
    setupShowZeroMrmsToggleHandler,
    setupExportGaugeButtonHandler,
    setupLoadDataButtonHandler,
    setupOverlayTypeSelectHandler,
    setupOverlayToggleHandler,
    setupOverlayColorPickerHandler,
    setupOverlayWeightSliderHandler,
    setupOverlayOpacitySliderHandler,
    setupBasemapSelectHandler,
    setupMapViewportHandlers
} from './uiHandlers.js';

/**
 * Tracks the last loaded gauge parameters to avoid unnecessary reloads
 */
const lastGaugeLoad = {
    date: null,
    hour: null,
    accumPeriod: null
};

/**
 * Initializes the entire application
 * This function runs after all dependencies (Leaflet, Chart.js) are loaded
 */
function initializeApplication() {
    // Initialize the Leaflet map
    const map = initializeMap('map');

    // Initialize the scatterplot with map reference for crosshairs
    window.scatterplotManager = new ScatterplotManager('scatterplot-canvas', map);

    // Create all available basemaps
    const basemaps = createBasemapLayers();

    // Add default dark basemap
    const currentBasemapState = {
        current: addBasemapToMap(map, basemaps.dark)
    };

    // Initialize data layer state (will hold the MRMS tile layer)
    const dataLayerState = {
        current: null
    };

    // Initialize date/time inputs with current UTC time
    initializeDateTimeInputs();

    // Setup product selector and colorbar
    setupProductSelectHandler();

    // Initialize map overlays (state boundaries, county lines, lat/lon grid)
    const overlays = initializeOverlays(map);
    const overlaySettings = getAllOverlaySettings();

    // Initialize MADIS gauge plotting controller
    import('./madis.js').then(module => {
        window.madisController = module.initializeMadis(map);
        console.log('MADIS module initialized successfully');

        // Setup all UI event handlers
        setupBiasToggleHandler(window.madisController);
        setupShowZeroMrmsToggleHandler(window.madisController);
        setupExportGaugeButtonHandler();
        setupLoadDataButtonHandler(map, dataLayerState, window.madisController, lastGaugeLoad);

        // Setup map viewport handlers (update scatterplot on pan/zoom)
        setupMapViewportHandlers(map, window.madisController);

    }).catch(error => {
        console.error('Error loading MADIS module:', error);
    });

    // Setup overlay controls
    setupOverlayTypeSelectHandler(overlays, overlaySettings);
    setupOverlayToggleHandler(overlays);
    setupOverlayColorPickerHandler(overlays, overlaySettings);
    setupOverlayWeightSliderHandler(overlays, overlaySettings);
    setupOverlayOpacitySliderHandler(overlays, overlaySettings);

    // Setup basemap selector
    setupBasemapSelectHandler(map, basemaps, currentBasemapState, dataLayerState);
}

/**
 * Ensures the application is initialized only once
 */
let appInitialized = false;

function safeInitializeApplication() {
    if (appInitialized) return;
    appInitialized = true;
    initializeApplication();
}

// Export for use by the HTML onload handler
window.safeInitializeApp = safeInitializeApplication;

// Auto-initialize when DOM and all scripts are ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeInitializeApplication);
} else {
    // DOM already loaded
    safeInitializeApplication();
}
