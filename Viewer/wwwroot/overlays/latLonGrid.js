// Lat/Lon Grid Overlay Module
(function(window) {
    'use strict';

    class LatLonGrid {
        constructor(map) {
            this.map = map;
            this.layer = null;
            this.enabled = false;
            this.color = '#666666';
            this.weight = 1;
            this.opacity = 0.5;
            this.spacing = 5; // degrees
        }

        load() {
            if (this.layer) {
                this.map.removeLayer(this.layer);
            }

            this.layer = L.layerGroup();
            this.updateGrid();

            if (this.enabled) {
                this.layer.addTo(this.map);
            }

            // Update grid when map moves or zooms
            this.map.on('moveend', () => this.updateGrid());
            this.map.on('zoomend', () => {
                this.updateSpacing();
                this.updateGrid();
            });

            return true;
        }

        updateSpacing() {
            const zoom = this.map.getZoom();

            // Adjust spacing based on zoom level
            if (zoom <= 4) {
                this.spacing = 10;
            } else if (zoom <= 6) {
                this.spacing = 5;
            } else if (zoom <= 8) {
                this.spacing = 2;
            } else {
                this.spacing = 1;
            }
        }

        updateGrid() {
            if (!this.layer) return;

            this.layer.clearLayers();

            const bounds = this.map.getBounds();

            // Draw latitude lines with labels on the left
            for (let lat = Math.floor(bounds.getSouth() / this.spacing) * this.spacing;
                 lat <= bounds.getNorth(); lat += this.spacing) {
                const latlng = [[lat, bounds.getWest()], [lat, bounds.getEast()]];
                L.polyline(latlng, {
                    color: this.color,
                    weight: this.weight,
                    opacity: this.opacity
                }).addTo(this.layer);

                // Add latitude label on the left side of the map
                const labelLat = lat;
                const labelLon = bounds.getWest() + (bounds.getEast() - bounds.getWest()) * 0.05;

                const latLabel = L.marker([labelLat, labelLon], {
                    icon: L.divIcon({
                        className: 'lat-lon-label',
                        html: `<div style="color: ${this.color}; opacity: ${this.opacity}; font-size: 11px; font-weight: bold; background: rgba(0,0,0,0.6); padding: 2px 5px; border-radius: 3px; white-space: nowrap;">${lat}°</div>`,
                        iconSize: [40, 20],
                        iconAnchor: [20, 10]
                    })
                }).addTo(this.layer);
            }

            // Draw longitude lines with labels along the bottom
            for (let lon = Math.floor(bounds.getWest() / this.spacing) * this.spacing;
                 lon <= bounds.getEast(); lon += this.spacing) {
                const latlng = [[bounds.getSouth(), lon], [bounds.getNorth(), lon]];
                L.polyline(latlng, {
                    color: this.color,
                    weight: this.weight,
                    opacity: this.opacity
                }).addTo(this.layer);

                // Add longitude label along the bottom of the map
                const labelLat = bounds.getSouth() + (bounds.getNorth() - bounds.getSouth()) * 0.05;
                const labelLon = lon;

                const lonLabel = L.marker([labelLat, labelLon], {
                    icon: L.divIcon({
                        className: 'lat-lon-label',
                        html: `<div style="color: ${this.color}; opacity: ${this.opacity}; font-size: 11px; font-weight: bold; background: rgba(0,0,0,0.6); padding: 2px 5px; border-radius: 3px; white-space: nowrap;">${lon}°</div>`,
                        iconSize: [40, 20],
                        iconAnchor: [20, 10]
                    })
                }).addTo(this.layer);
            }
        }

        setColor(color) {
            this.color = color;
            if (this.enabled) {
                this.updateGrid();
            }
        }

        setWeight(weight) {
            this.weight = parseInt(weight);
            if (this.enabled) {
                this.updateGrid();
            }
        }

        setOpacity(opacity) {
            this.opacity = parseFloat(opacity);
            if (this.enabled) {
                this.updateGrid();
            }
        }

        toggle(enabled) {
            this.enabled = enabled;

            if (!this.layer) {
                // Load/create grid if not yet created
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
    window.LatLonGrid = LatLonGrid;

})(window);
