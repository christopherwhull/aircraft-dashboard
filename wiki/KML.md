**KML Generation**

- **Purpose**: Documents how KML files are produced by the tracker and server, where they are written, how to enable them, and how to inspect the output.

**Where It's Implemented**
- **Python tracker**: `aircraft_tracker.py` contains `generate_kml_from_records()` which builds `piaware.reception.kml` from PiAware reception records.
- **Node server**: `server.js` contains `generateKML()` used for visualization exports and debugging.
- **Configuration**: `config.js` (shared) exposes `reception.enableKML` and bucket settings used by both components.

**How KML Is Built (Overview)**
- **Source data**: Reception records (tab-separated logs of PiAware receptions) or in-memory sector/altitude records collected by the Node server.
- **Coordinate computation**: For reception records where only bearing and slant/range are available, the tracker computes a destination point from the receiver's latitude/longitude using the bearing and distance (a geodesic/destination-point calculation). The computed lat/lon is used for placemarks.
- **Altitude**: Altitudes recorded in feet are converted to meters in KML (multiply ft by 0.3048) so they display correctly in Google Earth and other viewers.
- **Styles and zones**: KML files include style definitions for altitude zones (e.g., 0-4999 ft, 5000-9999 ft, etc.). The Node server's `generateKML()` defines a set of colored styles named `zone0`, `zone1`, ... and assigns placemarks to the appropriate zone.
- **Placemarks and lines**: Typical outputs include point placemarks for receiver and aircraft, descriptive text (callsign/hex, slant distance, sector/altitude zone), and optional LineStrings or vertical lines to show slant-range or height.

**Files & Paths**
- **Tracker KML output**: default `piaware.reception.kml` (path controlled by tracker configuration variables in `aircraft_tracker.py`).
- **Server KML**: generated in-memory by `generateKML()` and served by the API or saved/uploaded depending on server configuration.
- **S3 / MinIO**: When enabled, KML files are uploaded to the `output-kmls` bucket (see `config.js` bucket names). The write bucket name is `output-kmls` by default in the repository configuration.

**Configuration & Enabling**
- **Enable KML generation**: Set the flag in `config.js`:
  - `reception: { enableKML: true }`
- **S3 Uploads**: Ensure `config.buckets` includes `output-kmls` (or the configured KML bucket) and that the Node server and/or tracker can write to it. The Node server will auto-create configured buckets at startup if it has permission to do so.

**How to Inspect Outputs**
- **Local file**: If running the Python tracker locally, check the configured output directory (or the tracker log) for `piaware.reception.kml`.
- **MinIO web UI**: Open MinIO (default `http://localhost:9000`) and browse the `output-kmls` bucket to download and view KML files.
- **Google Earth / KML viewers**: Open the downloaded `.kml` file in Google Earth or other KML-capable viewers to inspect placemarks and altitude visualization.

**Troubleshooting**
- **No KML generated**: Verify `reception.enableKML` is `true` in `config.js` and that the tracker/service has write access to the output directory or S3 bucket.
- **Missing styles/colors**: The Node server defines `zone0..zone8` colors in `generateKML()`; if you need different colors, edit `server.js` or adapt the Python KML builder.
- **Bad coordinates**: If computed placement looks wrong, confirm the receiver latitude/longitude in config and that the incoming records have valid bearing and distance values.

**Where to Look in Code**
- `aircraft_tracker.py` — search for `generate_kml_from_records` and `reception_record_file` variables.
- `server.js` — search for `generateKML()` and the `altitudeColors` / `zone` style definitions.
- `config.js` — `reception.enableKML`, `buckets.outputKmls` (or similarly named bucket entries) and S3 configuration entries.

If you want, I can: (1) add a short example showing a minimal KML file example, (2) add a small script to validate generated KML files, or (3) run a short verification by starting the tracker and checking an output KML in your environment — tell me which you prefer.

**Minimal KML Example**
- A minimal example KML is included in the repository at `wiki/example_kml.kml`. It demonstrates a receiver placemark, an aircraft placemark with altitude in meters, and a simple style.
- You can open that file in Google Earth or use the validator script (below) to check the file.

**Validator Script**
- A small validator script `scripts/validate_kml.py` is provided. It parses a KML file, checks basic structure (root KML element, Document, Placemark), and validates coordinate formats (longitude,latitude,altitude). Run it against any `.kml` file to perform a quick sanity check.

Example usage:

```bash
python scripts/validate_kml.py wiki/example_kml.kml
```
