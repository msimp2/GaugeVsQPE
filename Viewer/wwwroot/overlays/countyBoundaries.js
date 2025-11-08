// County Boundaries Overlay Module
(function(window) {
    'use strict';

    class CountyBoundaries {
        constructor(map) {
            this.map = map;
            this.layer = null;
            this.enabled = false;
            this.color = '#00FF00';
            this.weight = 1;
            this.opacity = 0.6;
        }

        async load() {
            if (this.layer) {
                this.map.removeLayer(this.layer);
            }

            try {
                // Use US counties GeoJSON from a CDN
                const response = await fetch('https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json');
                const geojsonData = await response.json();

                this.layer = L.geoJSON(geojsonData, {
                    style: () => ({
                        fillColor: 'none',
                        fillOpacity: 0,
                        color: this.color,
                        weight: this.weight,
                        opacity: this.opacity
                    })
                });

                if (this.enabled) {
                    this.layer.addTo(this.map);
                }

                return true;
            } catch (error) {
                console.error('Error loading county boundaries:', error);
                return false;
            }
        }

        setColor(color) {
            this.color = color;
            if (this.layer && this.enabled) {
                this.layer.setStyle({ color: this.color });
            }
        }

        setWeight(weight) {
            this.weight = parseInt(weight);
            if (this.layer && this.enabled) {
                this.layer.setStyle({ weight: this.weight });
            }
        }

        setOpacity(opacity) {
            this.opacity = parseFloat(opacity);
            if (this.layer && this.enabled) {
                this.layer.setStyle({ opacity: this.opacity });
            }
        }

        toggle(enabled) {
            this.enabled = enabled;

            if (!this.layer) {
                // Load data if not yet loaded
                this.load();
                return;
            }

            if (enabled) {
                this.layer.addTo(this.map);
            } else {
                this.map.removeLayer(this.layer);
            }
        }

        isEnabled() {
            return this.enabled;
        }
    }

    // Export to global scope
    window.CountyBoundaries = CountyBoundaries;

})(window);
