/**
 * Scatterplot Manager Module
 * Manages the gauge vs radar QPE comparison scatterplot visualization
 * Provides interactive features including point exclusion and crosshair mapping
 */

(function(window) {
    'use strict';

    // Default scatterplot configuration
    const SCATTERPLOT_DEFAULTS = {
        DEFAULT_MIN: 0,
        DEFAULT_MAX: 5,
        SCALE_PADDING_FACTOR: 1.2
    };

    /**
     * ScatterplotManager Class
     * Handles all scatterplot rendering, interaction, and statistics display
     */
    class ScatterplotManager {
        /**
         * Creates a new scatterplot manager
         *
         * @param {string} canvasId - ID of the canvas element for the scatterplot
         * @param {Object} map - Leaflet map instance for crosshair display
         */
        constructor(canvasId, map) {
            this.canvas = document.getElementById(canvasId);
            this.chart = null;
            this.data = [];
            this.map = map;
            this.crosshairMarker = null;
            this.excludedIndices = new Set();
            this.fullGaugeData = [];

            this.initializeChart();
            this.setupClickHandler();
        }

        /**
         * Initializes the Chart.js scatterplot with default configuration
         */
        initializeChart() {
            const ctx = this.canvas.getContext('2d');
            const self = this;

            this.chart = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [
                        this.createIncludedDataset(),
                        this.createExcludedDataset()
                    ]
                },
                options: this.createChartOptions(self)
            });

            this.addReferenceLine();
        }

        /**
         * Creates the dataset configuration for included (non-excluded) gauge points
         *
         * @returns {Object} Chart.js dataset configuration
         */
        createIncludedDataset() {
            return {
                label: 'Gauge vs Radar QPE',
                data: [],
                backgroundColor: 'rgba(52, 152, 219, 0.6)',
                borderColor: 'rgba(52, 152, 219, 1)',
                borderWidth: 1,
                pointRadius: 4,
                pointHoverRadius: 6
            };
        }

        /**
         * Creates the dataset configuration for excluded gauge points
         *
         * @returns {Object} Chart.js dataset configuration
         */
        createExcludedDataset() {
            return {
                label: 'Excluded Gauges',
                data: [],
                pointStyle: 'cross',
                backgroundColor: 'rgba(231, 76, 60, 0.8)',
                borderColor: 'rgba(231, 76, 60, 1)',
                borderWidth: 2,
                pointRadius: 8,
                pointHoverRadius: 10,
                rotation: 45
            };
        }

        /**
         * Creates chart options configuration
         *
         * @param {ScatterplotManager} self - Reference to this instance for event handlers
         * @returns {Object} Chart.js options configuration
         */
        createChartOptions(self) {
            return {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Gauge QPE vs Radar QPE',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false
                    }
                },
                onHover: function(event, activeElements) {
                    self.handleChartHover(activeElements);
                },
                scales: {
                    x: this.createXAxisConfig(),
                    y: this.createYAxisConfig()
                }
            };
        }

        /**
         * Creates X-axis configuration for gauge QPE
         *
         * @returns {Object} Chart.js axis configuration
         */
        createXAxisConfig() {
            return {
                type: 'linear',
                position: 'bottom',
                title: {
                    display: true,
                    text: 'Gauge QPE (inches)',
                    font: {
                        size: 12,
                        weight: 'bold'
                    }
                },
                min: SCATTERPLOT_DEFAULTS.DEFAULT_MIN,
                max: SCATTERPLOT_DEFAULTS.DEFAULT_MAX,
                ticks: {
                    stepSize: 0.5
                }
            };
        }

        /**
         * Creates Y-axis configuration for radar QPE
         *
         * @returns {Object} Chart.js axis configuration
         */
        createYAxisConfig() {
            return {
                type: 'linear',
                title: {
                    display: true,
                    text: 'Radar QPE (inches)',
                    font: {
                        size: 12,
                        weight: 'bold'
                    }
                },
                min: SCATTERPLOT_DEFAULTS.DEFAULT_MIN,
                max: SCATTERPLOT_DEFAULTS.DEFAULT_MAX,
                ticks: {
                    stepSize: 0.5
                }
            };
        }

        /**
         * Adds a 1:1 reference line to the scatterplot
         * This helps visualize perfect agreement between gauge and radar
         */
        addReferenceLine() {
            const refLineData = [
                { x: 0, y: 0 },
                { x: 10, y: 10 }
            ];

            this.chart.data.datasets.push({
                label: '1:1 Line',
                data: refLineData,
                type: 'line',
                borderColor: 'rgba(231, 76, 60, 0.8)',
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false,
                showLine: true
            });

            this.chart.update('none');
        }

        /**
         * Handles hover events over chart points
         * Shows crosshair on map when hovering over a gauge point
         *
         * @param {Array} activeElements - Array of active chart elements under cursor
         */
        handleChartHover(activeElements) {
            if (activeElements.length > 0) {
                const element = activeElements[0];
                const datasetIndex = element.datasetIndex;

                // Only show crosshair for data points (dataset 0 or 1), not the reference line
                if (datasetIndex === 0 || datasetIndex === 1) {
                    const chartPoint = this.chart.data.datasets[datasetIndex].data[element.index];
                    const gaugeData = this.findMatchingGauge(chartPoint);

                    if (gaugeData) {
                        this.showCrosshair(gaugeData.lat, gaugeData.lon);
                    }
                }
            } else {
                this.hideCrosshair();
            }
        }

        /**
         * Finds the gauge data object that matches a chart point
         *
         * @param {Object} chartPoint - Chart point with x and y coordinates
         * @returns {Object|undefined} Matching gauge data or undefined
         */
        findMatchingGauge(chartPoint) {
            return this.fullGaugeData.find(g =>
                g.displayValue === chartPoint.x &&
                (g.mrmsValue === chartPoint.y || (g.mrmsValue === null && chartPoint.y === 0))
            );
        }

        /**
         * Sets up click handler for excluding/including points
         */
        setupClickHandler() {
            const self = this;
            this.canvas.addEventListener('click', function(evt) {
                const points = self.chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);

                if (points.length > 0) {
                    const firstPoint = points[0];
                    const datasetIndex = firstPoint.datasetIndex;
                    const pointIndex = firstPoint.index;

                    // Only handle clicks on the main dataset (0) or excluded dataset (1)
                    if (datasetIndex === 0 || datasetIndex === 1) {
                        const chartPoint = self.chart.data.datasets[datasetIndex].data[pointIndex];
                        const originalIndex = self.findOriginalIndex(chartPoint);

                        if (originalIndex !== -1) {
                            self.toggleExclude(originalIndex);
                        }
                    }
                }
            });
        }

        /**
         * Finds the original index in the data array for a chart point
         *
         * @param {Object} chartPoint - Chart point with x and y coordinates
         * @returns {number} Index in data array, or -1 if not found
         */
        findOriginalIndex(chartPoint) {
            return this.data.findIndex(d =>
                d.x === chartPoint.x && d.y === chartPoint.y
            );
        }

        /**
         * Toggles the exclusion state of a gauge point
         * Excluded points are shown with a red X and not included in statistics
         *
         * @param {number} index - Index of the point in the data array
         */
        toggleExclude(index) {
            if (this.excludedIndices.has(index)) {
                this.excludedIndices.delete(index);
            } else {
                this.excludedIndices.add(index);
            }

            this.refreshDisplay();
        }

        /**
         * Refreshes the chart display and recalculates statistics
         * Separates data into included and excluded datasets
         */
        refreshDisplay() {
            const includedData = [];
            const excludedData = [];

            this.data.forEach((point, index) => {
                if (this.excludedIndices.has(index)) {
                    excludedData.push(point);
                } else {
                    includedData.push(point);
                }
            });

            this.chart.data.datasets[0].data = includedData;
            this.chart.data.datasets[1].data = excludedData;
            this.chart.update();

            this.updateStatistics(includedData);
        }

        /**
         * Calculates comprehensive statistics for gauge vs radar comparison
         *
         * @param {Array<Object>} data - Array of data points with x (gauge) and y (radar) values
         * @returns {Object} Statistics object with meanBias, additiveBias, mae, rmse, and cc
         */
        calculateStatistics(data) {
            if (!data || data.length === 0) {
                return {
                    meanBias: null,
                    additiveBias: null,
                    mae: null,
                    rmse: null,
                    cc: null
                };
            }

            const n = data.length;
            let sumGauge = 0;
            let sumRadar = 0;
            let sumAbsError = 0;
            let sumSqError = 0;

            for (const point of data) {
                const gauge = point.x;
                const radar = point.y;
                const error = gauge - radar;

                sumGauge += gauge;
                sumRadar += radar;
                sumAbsError += Math.abs(error);
                sumSqError += error * error;
            }

            const meanBias = sumRadar > 0 ? sumGauge / sumRadar : null;
            const additiveBias = sumGauge - sumRadar;
            const mae = sumAbsError / n;
            const rmse = Math.sqrt(sumSqError / n);

            // Calculate correlation coefficient
            const meanGauge = sumGauge / n;
            const meanRadar = sumRadar / n;

            let numerator = 0;
            let denomGauge = 0;
            let denomRadar = 0;

            for (const point of data) {
                const gaugeDiff = point.x - meanGauge;
                const radarDiff = point.y - meanRadar;
                numerator += gaugeDiff * radarDiff;
                denomGauge += gaugeDiff * gaugeDiff;
                denomRadar += radarDiff * radarDiff;
            }

            const cc = (denomGauge > 0 && denomRadar > 0)
                ? numerator / Math.sqrt(denomGauge * denomRadar)
                : null;

            return {
                meanBias,
                additiveBias,
                mae,
                rmse,
                cc
            };
        }

        /**
         * Updates the statistics display in the UI
         *
         * @param {Array<Object>} data - Array of data points
         */
        updateStatistics(data) {
            const stats = this.calculateStatistics(data);

            const meanBiasEl = document.getElementById('stat-mean-bias');
            const addBiasEl = document.getElementById('stat-add-bias');
            const maeEl = document.getElementById('stat-mae');
            const rmseEl = document.getElementById('stat-rmse');
            const ccEl = document.getElementById('stat-cc');

            if (meanBiasEl) meanBiasEl.textContent = stats.meanBias !== null ? stats.meanBias.toFixed(2) : '--';
            if (addBiasEl) addBiasEl.textContent = stats.additiveBias !== null ? stats.additiveBias.toFixed(2) : '--';
            if (maeEl) maeEl.textContent = stats.mae !== null ? stats.mae.toFixed(2) : '--';
            if (rmseEl) rmseEl.textContent = stats.rmse !== null ? stats.rmse.toFixed(2) : '--';
            if (ccEl) ccEl.textContent = stats.cc !== null ? stats.cc.toFixed(2) : '--';
        }

        /**
         * Updates the scatterplot with new gauge data
         *
         * @param {Array<Object>} gaugeData - Array of gauge data objects
         * @param {boolean} biasMode - Whether bias mode is active (not used currently)
         */
        updateData(gaugeData, biasMode = false) {
            if (!gaugeData || gaugeData.length === 0) {
                this.clearData();
                return;
            }

            const scatterData = this.prepareScatterData(gaugeData);
            this.data = scatterData;
            this.fullGaugeData = gaugeData.filter(d => d.displayValue > 0);

            this.autoAdjustScales(scatterData);
            this.refreshDisplay();
        }

        /**
         * Prepares gauge data for scatterplot display
         *
         * @param {Array<Object>} gaugeData - Array of gauge data objects
         * @returns {Array<Object>} Array of scatter points with x, y, and bias
         */
        prepareScatterData(gaugeData) {
            return gaugeData
                .filter(d => d.displayValue > 0)
                .map(d => ({
                    x: d.displayValue,
                    y: d.mrmsValue !== null && d.mrmsValue !== undefined ? d.mrmsValue : 0,
                    bias: d.biasRatio
                }));
        }

        /**
         * Auto-adjusts scale ranges based on data extent
         *
         * @param {Array<Object>} scatterData - Array of scatter points
         */
        autoAdjustScales(scatterData) {
            if (scatterData.length === 0) return;

            const maxGauge = Math.max(...scatterData.map(d => d.x));
            const maxRadar = Math.max(...scatterData.map(d => d.y));
            const maxVal = Math.max(maxGauge, maxRadar);
            const scaleMax = Math.ceil(maxVal * SCATTERPLOT_DEFAULTS.SCALE_PADDING_FACTOR);

            this.chart.options.scales.x.max = scaleMax;
            this.chart.options.scales.y.max = scaleMax;
        }

        /**
         * Shows a crosshair marker on the map at the specified location
         *
         * @param {number} lat - Latitude
         * @param {number} lon - Longitude
         */
        showCrosshair(lat, lon) {
            if (!this.map) return;

            if (this.crosshairMarker) {
                this.map.removeLayer(this.crosshairMarker);
            }

            const crosshairIcon = this.createCrosshairIcon();

            this.crosshairMarker = L.marker([lat, lon], {
                icon: crosshairIcon,
                interactive: false,
                zIndexOffset: 1000
            }).addTo(this.map);
        }

        /**
         * Creates a crosshair icon for map display
         *
         * @returns {Object} Leaflet divIcon
         */
        createCrosshairIcon() {
            return L.divIcon({
                className: 'crosshair-icon',
                html: '<div style="position: relative; width: 40px; height: 40px;">' +
                      '<div style="position: absolute; top: 50%; left: 0; width: 100%; height: 2px; background: red; transform: translateY(-50%);"></div>' +
                      '<div style="position: absolute; left: 50%; top: 0; width: 2px; height: 100%; background: red; transform: translateX(-50%);"></div>' +
                      '</div>',
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });
        }

        /**
         * Hides the crosshair marker from the map
         */
        hideCrosshair() {
            if (this.crosshairMarker && this.map) {
                this.map.removeLayer(this.crosshairMarker);
                this.crosshairMarker = null;
            }
        }

        /**
         * Clears all data from the scatterplot and resets scales
         */
        clearData() {
            this.data = [];
            this.fullGaugeData = [];
            this.excludedIndices.clear();
            this.chart.data.datasets[0].data = [];
            this.chart.data.datasets[1].data = [];
            this.chart.options.scales.x.max = SCATTERPLOT_DEFAULTS.DEFAULT_MAX;
            this.chart.options.scales.y.max = SCATTERPLOT_DEFAULTS.DEFAULT_MAX;
            this.chart.update();

            this.updateStatistics([]);
        }

        /**
         * Gets the current data array
         *
         * @returns {Array<Object>} Current data array
         */
        getData() {
            return this.data;
        }
    }

    // Export to global scope for backwards compatibility
    window.ScatterplotManager = ScatterplotManager;

})(window);
