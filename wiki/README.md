# Aircraft Dashboard Wiki

This directory contains the wiki content for the Aircraft Dashboard project. The wiki provides comprehensive documentation for all features, APIs, and usage guides.

## Wiki Structure

The wiki is organized into the following sections:

### Getting Started
- **[Home.md](Home.md)** - Main wiki landing page with overview and quick links

### Dashboard Tabs Documentation
- **[Live.md](Live.md)** - Real-time aircraft tracking and live statistics
- **[Airlines.md](Airlines.md)** - Airline activity statistics and flight drilldown
- **[Flights.md](Flights.md)** - Historical flight reconstruction and tracking
- **[Positions.md](Positions.md)** - Position statistics and time-series analysis
- **[Squawk.md](Squawk.md)** - Squawk code transition analysis
- **[Heatmap.md](Heatmap.md)** - Aircraft position density visualization
- **[Reception.md](Reception.md)** - ADS-B signal reception range analysis
- **[Cache_Status.md](Cache_Status.md)** - Cache and enrichment status details

### Technical Documentation
- **[API.md](API.md)** - API endpoints documentation and usage examples
- **[Types_Database.md](Types_Database.md)** - Aircraft types database information
- **[Logo_Management.md](Logo_Management.md)** - Logo system and media pack generator

### Navigation
- **[_Sidebar.md](_Sidebar.md)** - Wiki sidebar navigation menu

## Publishing to GitHub Wiki

To publish this wiki content to the GitHub Wiki:

### Option 1: Manual Publishing via GitHub UI
1. Go to your repository on GitHub
2. Click on the "Wiki" tab
3. Enable the wiki if it's not already enabled
4. Create or edit pages directly in the GitHub UI
5. Copy content from each `.md` file in this directory to the corresponding wiki page

### Option 2: Git-based Publishing
1. Clone the wiki repository:
   ```bash
   git clone https://github.com/christopherwhull/aircraft-dashboard.wiki.git
   ```

2. Copy all wiki files to the cloned wiki repository:
   ```bash
   cp wiki/*.md aircraft-dashboard.wiki/
   ```

3. Commit and push to the wiki repository:
   ```bash
   cd aircraft-dashboard.wiki
   git add .
   git commit -m "Update wiki content"
   git push origin master
   ```

### Option 3: Automated Script
Use the provided script (if available) to automatically sync wiki content:
```bash
# If you have a publish script in tools/ or scripts/
node tools/publish-wiki.js
```

## Wiki File Naming Conventions

GitHub Wiki uses specific naming conventions:
- Spaces in page titles are represented by hyphens (`-`) or underscores (`_`) in URLs
- File names should match: `Cache_Status.md` → `Cache Status` page
- The `Home.md` file is the main landing page
- `_Sidebar.md` provides navigation (if present)

## Maintaining the Wiki

When updating the wiki:
1. Edit files in this `/wiki` directory
2. Test the markdown rendering locally
3. Commit changes to the main repository
4. Sync to GitHub Wiki using one of the publishing methods above

## Links and References

- [Main Repository](https://github.com/christopherwhull/aircraft-dashboard)
- [GitHub Wiki Documentation](https://docs.github.com/en/communities/documenting-your-project-with-wikis)
