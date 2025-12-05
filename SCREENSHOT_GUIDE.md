# Screenshot Capture Guide for AirSquawk Wiki

## Quick Start

1. **Ensure the system is running with active aircraft**
   ```powershell
   # Check if server is running
   curl http://localhost:3002/api/health
   
   # Check if you have active flights
   curl http://localhost:3002/api/flights
   ```

2. **Run the screenshot helper script**
   ```powershell
   cd tools
   .\capture-screenshots.ps1
   ```

3. **Follow the interactive prompts** or capture manually

## Manual Capture Instructions

### Using Windows Snipping Tool

1. **Press `Win + Shift + S`**
2. **Select capture mode:**
   - Window mode (recommended for full browser)
   - Rectangle mode (for specific areas)
3. **Click the browser window**
4. **Save to:** `aircraft-dashboard.wiki\screenshots\`

### Using Browser DevTools (Alternative)

1. **Open DevTools:** Press `F12`
2. **Open Command Menu:** Press `Ctrl + Shift + P`
3. **Type:** `screenshot`
4. **Select:** "Capture full size screenshot"

## Screenshots Needed

### Main Dashboard (http://localhost:3002/)

#### 1. main-dashboard.png
- **What to show:** Header with AirSquawk logo, active flights list
- **Requirements:** 
  - Several active flights visible
  - Server status indicators showing
  - Full browser window

#### 2. live-view-tab.png
- **Tab:** Click "Live"
- **What to show:** Map with multiple aircraft markers
- **Requirements:**
  - At least 5-10 aircraft visible
  - One popup open showing aircraft details
  - Aircraft icons should show direction (rotation)
  - Map controls visible

#### 3. flights-tab.png
- **Tab:** Click "Flights"
- **What to show:** Complete flight list table
- **Requirements:**
  - Multiple flights with different airlines
  - Registration numbers visible
  - Aircraft types visible
  - Duration times showing

#### 4. positions-tab.png
- **Tab:** Click "Positions"
- **What to show:** Raw position data table
- **Requirements:**
  - Multiple position records
  - Variety of altitudes (low and high)
  - Different speeds visible
  - Recent timestamps

#### 5. airlines-tab.png
- **Tab:** Click "Airlines"
- **What to show:** Airline statistics bar chart
- **Requirements:**
  - Multiple airlines represented
  - Airline logos visible (if available)
  - Flight counts displayed
  - Full chart visible

#### 6. types-database-tab.png
- **Tab:** Click "Types Database"
- **What to show:** Search interface with results
- **Requirements:**
  - Search for "B738" or "A320"
  - Show search results with details
  - Manufacturer and model visible

#### 7. squawk-tab.png
- **Tab:** Click "Squawk"
- **What to show:** Squawk transition history
- **Requirements:**
  - Several squawk changes listed
  - Timestamps and aircraft details
  - If possible, include emergency code (7500, 7600, 7700)

#### 8. reception-tab.png
- **Tab:** Click "Reception"
- **What to show:** Receiver coverage map
- **Requirements:**
  - Coverage overlay visible
  - Receiver location marker
  - Range visualization

#### 9. cache-status-tab.png
- **Tab:** Click "Cache Status"
- **What to show:** All cache statistics
- **Requirements:**
  - Position count in cache
  - S3 operation counts
  - Memory usage metrics
  - Last update timestamps

#### 10. s3-diagnostics-tab.png
- **Tab:** Click "S3 Diagnostics"
- **What to show:** Bucket health and diagnostics
- **Requirements:**
  - Bucket list with statuses
  - Connection health indicators
  - S3 endpoint information

### Heatmap Page (http://localhost:3002/heatmap-leaflet.html)

#### 11. heatmap-tab.png
- **What to show:** Heatmap with 24-hour traffic density
- **Requirements:**
  - Select "24h" time range
  - Heatmap overlay showing traffic patterns
  - Color gradient visible (blue → yellow → red)
  - Some hotspots visible

#### 12. heatmap-with-chart.png
- **What to show:** Heatmap with sectional chart overlay
- **Requirements:**
  - Enable "Chicago" or "Detroit" sectional chart
  - Heatmap overlay visible
  - Aviation chart visible underneath
  - Opacity allowing both layers to be seen

#### 13. heatmap-controls.png
- **What to show:** Close-up of control panel
- **Requirements:**
  - Capture just the left control panel
  - Show all filter options:
    - Time range selector
    - Manufacturer dropdown
    - Altitude filter
    - Speed filter
    - Chart selector
  - Show current selections

### MinIO Console (http://localhost:9001/)

#### 14. minio-console.png
- **What to show:** MinIO web console dashboard
- **Requirements:**
  - Login first (minioadmin/minioadmin123)
  - Show bucket list
  - Show storage usage
  - Navigation menu visible

#### 15. s3-bucket-browser.png
- **What to show:** Inside piaware-history bucket
- **Requirements:**
  - Navigate to: piaware-history → positions
  - Show folder structure: YYYY/MM/DD/HH
  - Show some position files listed
  - File sizes and timestamps visible

## Quality Guidelines

### Resolution
- **Minimum:** 1920×1080
- **Recommended:** Full browser window at your native resolution

### Format
- **Save as:** PNG (not JPEG)
- **Naming:** Use exact names from the list above
- **Location:** `aircraft-dashboard.wiki\screenshots\`

### Composition
- **Include:**
  - Full browser chrome (address bar, tabs)
  - Relevant data visible
  - Clear, readable text
  
- **Avoid:**
  - Empty or loading states
  - Personal information in URLs
  - Cluttered or confusing layouts

### Optimization
After capturing, optimize file sizes:

```powershell
# Using ImageMagick (if installed)
magick convert screenshot.png -quality 95 -resize 1920x screenshot-optimized.png

# Or use online tools:
# - TinyPNG (https://tinypng.com/)
# - Squoosh (https://squoosh.app/)
```

Target: < 500 KB per screenshot

## Uploading to Wiki

Once all screenshots are captured:

```powershell
# Navigate to wiki directory
cd aircraft-dashboard.wiki

# Check what screenshots you have
ls screenshots\

# Stage all screenshots
git add screenshots/*.png

# Commit with descriptive message
git commit -m "docs: add dashboard screenshots for all tabs

- Main dashboard with AirSquawk branding
- All tab screenshots (Live, Flights, Heatmap, etc.)
- Heatmap with and without sectional charts
- MinIO console and bucket browser
- Control panel close-ups"

# Push to GitHub
git push
```

## Verification

After pushing, verify screenshots appear on wiki:

1. Visit: https://github.com/christopherwhull/aircraft-dashboard/wiki/Screenshots
2. Check that all images load correctly
3. Verify image quality and clarity

## Tips for Better Screenshots

### Timing
- **Capture during peak traffic hours** for more interesting data
- **Wait for multiple aircraft** before capturing Live view
- **Let data accumulate** for several hours before capturing heatmaps

### Browser Setup
- **Zoom level:** 100% (Ctrl + 0)
- **Full screen mode:** F11 (then exit for capture)
- **Dark mode:** Already default in heatmap
- **Hide bookmarks bar** for cleaner captures

### Data Preparation
- **Run tracker for several hours** to populate data
- **Ensure S3 uploads are working** for heatmap data
- **Verify aircraft enrichment** is working (airlines, types)

### Multiple Attempts
- **Take several shots** of each tab
- **Choose the best one** with most representative data
- **Retake if necessary** - quality matters!

## Troubleshooting

### No Aircraft Visible
```powershell
# Check if PiAware is reachable
curl http://piaware:8080/data/aircraft.json

# Check if tracker is running
Get-Process | Where-Object { $_.Name -like "*python*" }

# Check server logs
tail -n 50 runtime\server-*.log
```

### Heatmap Not Loading
```powershell
# Check S3 connection
curl http://localhost:3002/api/cache-status

# Check if position data exists
mc ls local/piaware-history/positions/
```

### Charts Not Appearing
```powershell
# Check if tile server is running
curl http://localhost:3003/health

# Check if GeoTIFF files exist
ls "C:\Users\chris\*.tif"
```

## Example Screenshot Checklist

Use this to track your progress:

```
[ ] main-dashboard.png
[ ] live-view-tab.png
[ ] flights-tab.png
[ ] positions-tab.png
[ ] airlines-tab.png
[ ] types-database-tab.png
[ ] squawk-tab.png
[ ] reception-tab.png
[ ] cache-status-tab.png
[ ] s3-diagnostics-tab.png
[ ] heatmap-tab.png
[ ] heatmap-with-chart.png
[ ] heatmap-controls.png
[ ] minio-console.png
[ ] s3-bucket-browser.png
```

## Questions?

If you encounter issues or need clarification:
1. Check the [Screenshots wiki page](https://github.com/christopherwhull/aircraft-dashboard/wiki/Screenshots)
2. Review the [Data Flow Architecture](https://github.com/christopherwhull/aircraft-dashboard/wiki/Data-Flow-Architecture)
3. Check server status: `curl http://localhost:3002/api/health`

---

**Remember:** High-quality screenshots make the documentation much more valuable for users! Take your time and capture representative, interesting data.
