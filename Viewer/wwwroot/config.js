/**
 * Configuration module for MRMS QPE Viewer
 * Contains all application constants, bounds, color maps, and configuration settings
 */

// Geographic bounds for MADIS gauge data fetching (CONUS)
export const GEOGRAPHIC_BOUNDS = {
    LAT_LOWER: 20.0,
    LAT_UPPER: 60.0,
    LON_LOWER: -130.0,
    LON_UPPER: -60.0
};

// Default map settings
export const MAP_DEFAULTS = {
    CENTER: [39.8283, -98.5795],  // Geographic center of United States
    ZOOM: 5,
    ZOOM_CONTROL: true
};

// Batch processing configuration for API calls
export const BATCH_PROCESSING = {
    BATCH_SIZE: 50,               // Number of gauges to process per batch
    DELAY_BETWEEN_BATCHES_MS: 50  // Delay between batches to avoid overwhelming the server
};

// Unit conversion constants
export const UNIT_CONVERSION = {
    MM_TO_INCHES: 1 / 25.4,
    INCHES_TO_MM: 25.4
};

// QPE product accumulation periods
export const ACCUMULATION_PERIODS = {
    ONE_HOUR: '1H',
    TWENTY_FOUR_HOUR: '24H'
};

// Minimum threshold for considering MRMS value as non-zero
export const MRMS_ZERO_THRESHOLD = 0.001;

// Bias ratio for gauges where MRMS shows zero but gauge shows precipitation
export const BIAS_RATIO_FOR_ZERO_MRMS = 11;

// Gauge marker display settings
export const GAUGE_MARKER = {
    RADIUS: 6,
    BORDER_COLOR: '#333',
    BORDER_WEIGHT: 1,
    FILL_OPACITY: 0.85
};

// Scatterplot default scale settings
export const SCATTERPLOT = {
    DEFAULT_MIN: 0,
    DEFAULT_MAX: 5,
    SCALE_PADDING_FACTOR: 1.2  // Add 20% padding to max value for scale
};

/**
 * QPE Color Bands and Labels
 * Each colorbar contains:
 *   - title: Display title for the colorbar
 *   - bands: Array of RGB color strings for each threshold band
 *   - labels: Array of string labels corresponding to each threshold
 */
export const QPE_COLORBARS = {
    // 15-minute and 1-hour accumulation periods
    QPE15Min: {
        title: 'inches',
        bands: [
            'rgb(255, 255, 200)',  // 8.0+ inches
            'rgb(150, 100, 200)',  // 7.0-8.0
            'rgb(200, 0, 255)',    // 6.5-7.0
            'rgb(255, 0, 255)',    // 6.0-6.5
            'rgb(180, 0, 0)',      // 5.5-6.0
            'rgb(220, 0, 0)',      // 5.0-5.5
            'rgb(255, 0, 0)',      // 4.5-5.0
            'rgb(255, 50, 0)',     // 4.0-4.5
            'rgb(255, 100, 0)',    // 3.0-4.0
            'rgb(255, 165, 0)',    // 2.0-3.0
            'rgb(255, 200, 0)',    // 1.75-2.0
            'rgb(255, 255, 0)',    // 1.25-1.75
            'rgb(150, 255, 0)',    // 1.00-1.25
            'rgb(0, 255, 0)',      // 0.80-1.00
            'rgb(0, 200, 0)',      // 0.60-0.80
            'rgb(0, 150, 0)',      // 0.40-0.60
            'rgb(0, 0, 255)',      // 0.20-0.40
            'rgb(0, 128, 255)',    // 0.10-0.20
            'rgb(0, 200, 255)',    // 0.05-0.10
            'rgb(0, 255, 255)'     // 0.01-0.05
        ],
        labels: ['8.0+', '7.0', '6.5', '6.0', '5.5', '5.0', '4.5', '4.0', '3.0', '2.0', '1.75', '1.25', '1.00', '0.80', '0.60', '0.40', '0.20', '0.10', '0.05', '0.01']
    },

    // 6-hour and 12-hour accumulation periods
    QPE6Hr: {
        title: 'Precipitation (in) - 6/12 hr',
        bands: [
            'rgb(255, 255, 200)',  // 16.0+ inches
            'rgb(150, 100, 200)',  // 14.0-16.0
            'rgb(200, 0, 255)',    // 12.0-14.0
            'rgb(255, 0, 255)',    // 10.0-12.0
            'rgb(180, 0, 0)',      // 9.0-10.0
            'rgb(200, 0, 0)',      // 8.0-9.0
            'rgb(255, 0, 0)',      // 7.0-8.0
            'rgb(255, 50, 0)',     // 6.0-7.0
            'rgb(255, 100, 0)',    // 5.0-6.0
            'rgb(255, 140, 0)',    // 4.0-5.0
            'rgb(255, 165, 0)',    // 3.5-4.0
            'rgb(255, 200, 0)',    // 3.0-3.5
            'rgb(255, 255, 0)',    // 2.5-3.0
            'rgb(200, 255, 0)',    // 2.0-2.5
            'rgb(150, 255, 0)',    // 1.50-2.0
            'rgb(0, 255, 0)',      // 1.25-1.50
            'rgb(0, 200, 0)',      // 1.00-1.25
            'rgb(0, 150, 0)',      // 0.80-1.00
            'rgb(0, 0, 255)',      // 0.60-0.80
            'rgb(0, 128, 255)',    // 0.40-0.60
            'rgb(0, 200, 255)',    // 0.20-0.40
            'rgb(0, 255, 255)'     // 0.05-0.20
        ],
        labels: ['16+', '14', '12', '10', '9', '8', '7', '6', '5', '4', '3.5', '3', '2.5', '2', '1.5', '1.25', '1', '0.8', '0.6', '0.4', '0.2', '0.05']
    },

    // 24-hour accumulation period
    QPE24Hr: {
        title: 'inches',
        bands: [
            'rgb(255, 255, 200)',  // 24.0+ inches
            'rgb(150, 100, 200)',  // 20.0-24.0
            'rgb(200, 0, 255)',    // 18.0-20.0
            'rgb(255, 0, 255)',    // 16.0-18.0
            'rgb(180, 0, 0)',      // 14.0-16.0
            'rgb(220, 0, 0)',      // 12.0-14.0
            'rgb(255, 0, 0)',      // 10.0-12.0
            'rgb(255, 50, 0)',     // 9.0-10.0
            'rgb(255, 100, 0)',    // 8.0-9.0
            'rgb(255, 140, 0)',    // 7.0-8.0
            'rgb(255, 165, 0)',    // 6.0-7.0
            'rgb(255, 200, 0)',    // 5.0-6.0
            'rgb(255, 255, 0)',    // 4.0-5.0
            'rgb(200, 255, 0)',    // 3.0-4.0
            'rgb(150, 255, 0)',    // 2.5-3.0
            'rgb(0, 255, 0)',      // 2.0-2.5
            'rgb(0, 200, 0)',      // 1.5-2.0
            'rgb(0, 150, 0)',      // 1.0-1.5
            'rgb(0, 0, 255)',      // 0.75-1.0
            'rgb(0, 128, 255)',    // 0.30-0.75
            'rgb(0, 200, 255)',    // 0.10-0.30
            'rgb(0, 255, 255)'     // 0.05-0.10
        ],
        labels: ['24+', '20', '18', '16', '14', '12', '10', '9', '8', '7', '6', '5', '4', '3', '2.5', '2', '1.5', '1', '0.75', '0.3', '0.1', '0.05']
    },

    // 48-hour accumulation period
    QPE48Hr: {
        title: 'Precipitation (in) - 48 hr',
        bands: [
            'rgb(255, 255, 100)',  // 32.0+ inches
            'rgb(255, 255, 150)',  // 28.0-32.0
            'rgb(255, 255, 200)',  // 24.0-28.0
            'rgb(150, 100, 200)',  // 20.0-24.0
            'rgb(200, 0, 255)',    // 18.0-20.0
            'rgb(255, 0, 255)',    // 16.0-18.0
            'rgb(180, 0, 0)',      // 14.0-16.0
            'rgb(220, 0, 0)',      // 12.0-14.0
            'rgb(255, 0, 0)',      // 10.0-12.0
            'rgb(255, 50, 0)',     // 8.0-10.0
            'rgb(255, 100, 0)',    // 7.0-8.0
            'rgb(255, 140, 0)',    // 6.0-7.0
            'rgb(255, 165, 0)',    // 5.0-6.0
            'rgb(255, 200, 0)',    // 4.0-5.0
            'rgb(255, 255, 0)',    // 3.0-4.0
            'rgb(200, 255, 0)',    // 2.5-3.0
            'rgb(150, 255, 0)',    // 2.0-2.5
            'rgb(0, 255, 0)',      // 1.5-2.0
            'rgb(0, 200, 0)',      // 1.0-1.5
            'rgb(0, 150, 0)',      // 0.75-1.0
            'rgb(0, 0, 255)',      // 0.50-0.75
            'rgb(0, 128, 255)',    // 0.25-0.50
            'rgb(0, 200, 255)',    // 0.10-0.25
            'rgb(0, 255, 255)'     // 0.01-0.10
        ],
        labels: ['32+', '28', '24', '20', '18', '16', '14', '12', '10', '8', '7', '6', '5', '4', '3', '2.5', '2', '1.5', '1', '0.75', '0.5', '0.25', '0.1', '0.01']
    },

    // 72-hour accumulation period
    QPE72Hr: {
        title: 'Precipitation (in) - 72 hr',
        bands: [
            'rgb(255, 255, 100)',  // 40.0+ inches
            'rgb(255, 255, 150)',  // 36.0-40.0
            'rgb(255, 255, 200)',  // 32.0-36.0
            'rgb(150, 100, 200)',  // 28.0-32.0
            'rgb(200, 0, 255)',    // 24.0-28.0
            'rgb(255, 0, 255)',    // 22.0-24.0
            'rgb(180, 0, 0)',      // 20.0-22.0
            'rgb(220, 0, 0)',      // 18.0-20.0
            'rgb(255, 0, 0)',      // 16.0-18.0
            'rgb(255, 50, 0)',     // 14.0-16.0
            'rgb(255, 100, 0)',    // 12.0-14.0
            'rgb(255, 140, 0)',    // 10.0-12.0
            'rgb(255, 165, 0)',    // 8.0-10.0
            'rgb(255, 200, 0)',    // 7.0-8.0
            'rgb(255, 255, 0)',    // 6.0-7.0
            'rgb(200, 255, 0)',    // 5.0-6.0
            'rgb(150, 255, 0)',    // 4.0-5.0
            'rgb(0, 255, 0)',      // 3.0-4.0
            'rgb(0, 200, 0)',      // 2.0-3.0
            'rgb(0, 150, 0)',      // 1.5-2.0
            'rgb(0, 0, 255)',      // 1.0-1.5
            'rgb(0, 128, 255)',    // 0.50-1.0
            'rgb(0, 200, 255)',    // 0.25-0.50
            'rgb(0, 255, 255)'     // 0.10-0.25
        ],
        labels: ['40+', '36', '32', '28', '24', '22', '20', '18', '16', '14', '12', '10', '8', '7', '6', '5', '4', '3', '2', '1.5', '1', '0.5', '0.25', '0.1']
    },

    // Gauge bias colorbar (gauge/QPE ratio)
    GaugeBias: {
        title: 'Gauge/QPE Bias',
        bands: [
            // Positive bias (gauge > QPE) - light to dark red
            'rgb(139, 0, 0)',      // 10+ (extreme overestimation)
            'rgb(178, 34, 34)',    // 5-10
            'rgb(205, 92, 92)',    // 2.5-5
            'rgb(220, 120, 120)',  // 2-2.5
            'rgb(235, 150, 150)',  // 1.6-2
            'rgb(245, 180, 180)',  // 1.3-1.6
            'rgb(255, 210, 210)',  // 1.1-1.3
            'rgb(255, 230, 230)',  // 1.0-1.1
            // Neutral
            'rgb(245, 245, 245)',  // 0.9-1.0 (near neutral)
            // Negative bias (gauge < QPE) - light to dark blue/purple
            'rgb(230, 230, 255)',  // 0.9-1.0
            'rgb(210, 210, 255)',  // 0.77-0.9 (1/1.3)
            'rgb(180, 180, 245)',  // 0.625-0.77 (1/1.6)
            'rgb(150, 150, 235)',  // 0.5-0.625 (1/2)
            'rgb(120, 120, 220)',  // 0.4-0.5 (1/2.5)
            'rgb(92, 92, 205)',    // 0.2-0.4 (1/5)
            'rgb(34, 34, 178)',    // 0.1-0.2 (1/10)
            'rgb(0, 0, 139)'       // <0.1 (extreme underestimation)
        ],
        labels: ['10+', '5', '2.5', '2', '1.6', '1.3', '1.1', '1.0', '0.9', '0.77', '0.625', '0.5', '0.4', '0.2', '0.1', '<0.1']
    }
};

/**
 * Bias color thresholds and their corresponding colors
 * Used for mapping bias ratios to colors
 */
export const BIAS_COLOR_THRESHOLDS = [
    { threshold: 10, color: 'rgb(139, 0, 0)' },      // Extreme positive bias
    { threshold: 5, color: 'rgb(178, 34, 34)' },
    { threshold: 2.5, color: 'rgb(205, 92, 92)' },
    { threshold: 2.0, color: 'rgb(220, 120, 120)' },
    { threshold: 1.6, color: 'rgb(235, 150, 150)' },
    { threshold: 1.3, color: 'rgb(245, 180, 180)' },
    { threshold: 1.1, color: 'rgb(255, 210, 210)' },
    { threshold: 1.0, color: 'rgb(255, 230, 230)' },
    { threshold: 0.9, color: 'rgb(245, 245, 245)' },  // Near neutral
    { threshold: 0.77, color: 'rgb(230, 230, 255)' },
    { threshold: 0.625, color: 'rgb(210, 210, 255)' },
    { threshold: 0.5, color: 'rgb(180, 180, 245)' },
    { threshold: 0.4, color: 'rgb(150, 150, 235)' },
    { threshold: 0.2, color: 'rgb(120, 120, 220)' },
    { threshold: 0.1, color: 'rgb(92, 92, 205)' },
    { threshold: 0.01, color: 'rgb(34, 34, 178)' },
    { threshold: 0, color: 'rgb(0, 0, 139)' }         // Extreme negative bias
];

/**
 * Precipitation color thresholds and their corresponding colors
 * Used for mapping precipitation values (in inches) to colors
 */
export const PRECIP_COLOR_THRESHOLDS = [
    { threshold: 8.0, color: 'rgb(255, 255, 200)' },
    { threshold: 7.0, color: 'rgb(150, 100, 200)' },
    { threshold: 6.5, color: 'rgb(200, 0, 255)' },
    { threshold: 6.0, color: 'rgb(255, 0, 255)' },
    { threshold: 5.5, color: 'rgb(180, 0, 0)' },
    { threshold: 5.0, color: 'rgb(220, 0, 0)' },
    { threshold: 4.5, color: 'rgb(255, 0, 0)' },
    { threshold: 4.0, color: 'rgb(255, 50, 0)' },
    { threshold: 3.0, color: 'rgb(255, 100, 0)' },
    { threshold: 2.0, color: 'rgb(255, 165, 0)' },
    { threshold: 1.75, color: 'rgb(255, 200, 0)' },
    { threshold: 1.25, color: 'rgb(255, 255, 0)' },
    { threshold: 1.00, color: 'rgb(150, 255, 0)' },
    { threshold: 0.80, color: 'rgb(0, 255, 0)' },
    { threshold: 0.60, color: 'rgb(0, 200, 0)' },
    { threshold: 0.40, color: 'rgb(0, 150, 0)' },
    { threshold: 0.20, color: 'rgb(0, 0, 255)' },
    { threshold: 0.10, color: 'rgb(0, 128, 255)' },
    { threshold: 0.05, color: 'rgb(0, 200, 255)' },
    { threshold: 0.01, color: 'rgb(0, 255, 255)' }
];

// Color for zero or missing precipitation
export const ZERO_PRECIP_COLOR = 'rgb(200, 200, 200)';

// Default overlay settings for map overlays (state boundaries, county lines, etc.)
export const DEFAULT_OVERLAY_SETTINGS = {
    states: {
        color: '#FFFFFF',
        weight: 2,
        opacity: 0.8
    },
    counties: {
        color: '#00FF00',
        weight: 1,
        opacity: 0.6
    },
    latlon: {
        color: '#666666',
        weight: 1,
        opacity: 0.5
    }
};

// Basemap configurations
export const BASEMAPS = {
    dark: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20
    },
    osm: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    },
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 18
    },
    light: {
        url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20
    }
};
