// Scatterplot Module for Gauge vs Radar QPE Comparison
(function(window) {
    'use strict';

    class ScatterplotManager {
        constructor(canvasId, map) {
            this.canvas = document.getElementById(canvasId);
            this.chart = null;
            this.data = [];
            this.map = map;
            this.crosshairMarker = null;
            this.excludedIndices = new Set();  // Track excluded gauge indices
            this.initializeChart();
            this.setupClickHandler();
        }

        initializeChart() {
            const ctx = this.canvas.getContext('2d');
            const self = this;

            this.chart = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [
                        {
                            label: 'Gauge vs Radar QPE',
                            data: [],
                            backgroundColor: 'rgba(52, 152, 219, 0.6)',
                            borderColor: 'rgba(52, 152, 219, 1)',
                            borderWidth: 1,
                            pointRadius: 4,
                            pointHoverRadius: 6
                        },
                        {
                            label: 'Excluded Gauges',
                            data: [],
                            pointStyle: 'cross',
                            backgroundColor: 'rgba(231, 76, 60, 0.8)',
                            borderColor: 'rgba(231, 76, 60, 1)',
                            borderWidth: 2,
                            pointRadius: 8,
                            pointHoverRadius: 10,
                            rotation: 45
                        }
                    ]
                },
                options: {
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
                            enabled: false  // Disable tooltip popup
                        }
                    },
                    onHover: function(event, activeElements) {
                        if (activeElements.length > 0) {
                            const element = activeElements[0];
                            const datasetIndex = element.datasetIndex;

                            // Only show crosshair for data points (dataset 0 or 1), not the reference line
                            if (datasetIndex === 0 || datasetIndex === 1) {
                                // Get the original index from the chart data point
                                const chartPoint = self.chart.data.datasets[datasetIndex].data[element.index];

                                // Find the matching gauge in fullGaugeData
                                const gaugeData = self.fullGaugeData.find(g =>
                                    g.displayValue === chartPoint.x &&
                                    (g.mrmsValue === chartPoint.y || (g.mrmsValue === null && chartPoint.y === 0))
                                );

                                if (gaugeData) {
                                    self.showCrosshair(gaugeData.lat, gaugeData.lon);
                                }
                            }
                        } else {
                            self.hideCrosshair();
                        }
                    },
                    scales: {
                        x: {
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
                            min: 0,
                            max: 5,
                            ticks: {
                                stepSize: 0.5
                            }
                        },
                        y: {
                            type: 'linear',
                            title: {
                                display: true,
                                text: 'Radar QPE (inches)',
                                font: {
                                    size: 12,
                                    weight: 'bold'
                                }
                            },
                            min: 0,
                            max: 5,
                            ticks: {
                                stepSize: 0.5
                            }
                        }
                    }
                }
            });

            // Add 1:1 reference line
            this.addReferenceLine();
        }

        addReferenceLine() {
            // Add a diagonal 1:1 line as a separate dataset
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
                        // Get the clicked point data
                        const chartPoint = self.chart.data.datasets[datasetIndex].data[pointIndex];

                        // Find the original index in self.data
                        const originalIndex = self.data.findIndex(d =>
                            d.x === chartPoint.x && d.y === chartPoint.y
                        );

                        if (originalIndex !== -1) {
                            self.toggleExclude(originalIndex);
                        }
                    }
                }
            });
        }

        toggleExclude(index) {
            if (this.excludedIndices.has(index)) {
                // Re-include the gauge
                this.excludedIndices.delete(index);
            } else {
                // Exclude the gauge
                this.excludedIndices.add(index);
            }

            // Refresh the chart and statistics
            this.refreshDisplay();
        }

        refreshDisplay() {
            // Separate data into included and excluded
            const includedData = [];
            const excludedData = [];

            this.data.forEach((point, index) => {
                if (this.excludedIndices.has(index)) {
                    excludedData.push(point);
                } else {
                    includedData.push(point);
                }
            });

            // Update datasets
            this.chart.data.datasets[0].data = includedData;
            this.chart.data.datasets[1].data = excludedData;
            this.chart.update();

            // Update statistics with only included data
            this.updateStatistics(includedData);
        }

        updateData(gaugeData, biasMode = false) {
            if (!gaugeData || gaugeData.length === 0) {
                this.data = [];
                this.fullGaugeData = [];
                this.excludedIndices.clear();
                this.chart.data.datasets[0].data = [];
                this.chart.data.datasets[1].data = [];
                this.chart.update();
                this.updateStatistics([]);
                return;
            }

            // Include all gauges with displayValue > 0, even if MRMS is 0 or null
            const scatterData = gaugeData
                .filter(d => d.displayValue > 0)
                .map(d => ({
                    x: d.displayValue,  // Gauge value
                    y: d.mrmsValue !== null && d.mrmsValue !== undefined ? d.mrmsValue : 0,  // Use 0 if MRMS is null
                    bias: d.biasRatio
                }));

            this.data = scatterData;
            this.fullGaugeData = gaugeData.filter(d => d.displayValue > 0);  // Store full gauge data for crosshair

            // Auto-adjust scales based on data
            if (scatterData.length > 0) {
                const maxGauge = Math.max(...scatterData.map(d => d.x));
                const maxRadar = Math.max(...scatterData.map(d => d.y));
                const maxVal = Math.max(maxGauge, maxRadar);
                const scaleMax = Math.ceil(maxVal * 1.2); // Add 20% padding

                this.chart.options.scales.x.max = scaleMax;
                this.chart.options.scales.y.max = scaleMax;
            }

            // Use refreshDisplay to properly separate included/excluded data
            this.refreshDisplay();
        }

        showCrosshair(lat, lon) {
            if (!this.map) return;

            // Remove existing crosshair if any
            if (this.crosshairMarker) {
                this.map.removeLayer(this.crosshairMarker);
            }

            // Create crosshair icon
            const crosshairIcon = L.divIcon({
                className: 'crosshair-icon',
                html: '<div style="position: relative; width: 40px; height: 40px;">' +
                      '<div style="position: absolute; top: 50%; left: 0; width: 100%; height: 2px; background: red; transform: translateY(-50%);"></div>' +
                      '<div style="position: absolute; left: 50%; top: 0; width: 2px; height: 100%; background: red; transform: translateX(-50%);"></div>' +
                      '</div>',
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });

            // Add crosshair marker
            this.crosshairMarker = L.marker([lat, lon], {
                icon: crosshairIcon,
                interactive: false,
                zIndexOffset: 1000
            }).addTo(this.map);
        }

        hideCrosshair() {
            if (this.crosshairMarker && this.map) {
                this.map.removeLayer(this.crosshairMarker);
                this.crosshairMarker = null;
            }
        }

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
            let sumGaugeRadar = 0;
            let sumGaugeSq = 0;
            let sumRadarSq = 0;

            // Calculate sums
            for (const point of data) {
                const gauge = point.x;
                const radar = point.y;
                const error = gauge - radar;

                sumGauge += gauge;
                sumRadar += radar;
                sumAbsError += Math.abs(error);
                sumSqError += error * error;
                sumGaugeRadar += gauge * radar;
                sumGaugeSq += gauge * gauge;
                sumRadarSq += radar * radar;
            }

            // Mean Bias (multiplicative): sum(gauge) / sum(radar)
            const meanBias = sumRadar > 0 ? sumGauge / sumRadar : null;

            // Additive Bias: sum(gauge) - sum(radar)
            const additiveBias = sumGauge - sumRadar;

            // MAE: mean absolute error
            const mae = sumAbsError / n;

            // RMSE: root mean square error
            const rmse = Math.sqrt(sumSqError / n);

            // Correlation Coefficient (Pearson's r)
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
                meanBias: meanBias,
                additiveBias: additiveBias,
                mae: mae,
                rmse: rmse,
                cc: cc
            };
        }

        updateStatistics(data) {
            const stats = this.calculateStatistics(data);

            // Update the statistics display with safety checks
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

        clearData() {
            this.data = [];
            this.chart.data.datasets[0].data = [];
            this.chart.options.scales.x.max = 5;
            this.chart.options.scales.y.max = 5;
            this.chart.update();
        }

        getData() {
            return this.data;
        }
    }

    // Export to global scope
    window.ScatterplotManager = ScatterplotManager;

})(window);
