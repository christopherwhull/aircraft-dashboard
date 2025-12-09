# GitHub Wiki Setup Guide

This guide explains how to set up and maintain the GitHub Wiki for the Aircraft Dashboard project.

## Overview

The Aircraft Dashboard project includes comprehensive wiki documentation located in the `/wiki` directory. This documentation needs to be published to the GitHub Wiki to make it easily accessible to users.

## Wiki Structure

The wiki contains the following pages:

### Core Pages
- **Home.md** - Main landing page with overview and navigation
- **_Sidebar.md** - Navigation sidebar that appears on all wiki pages

### Dashboard Tab Documentation
- **Live.md** - Real-time aircraft tracking documentation
- **Airlines.md** - Airline statistics and analysis
- **Flights.md** - Flight reconstruction and history
- **Positions.md** - Position data and time-series analysis
- **Squawk.md** - Squawk code transition monitoring
- **Heatmap.md** - Geographic density visualization
- **Reception.md** - Reception range analysis
- **Cache_Status.md** - Cache status and enrichment information

### Technical Documentation
- **API.md** - API endpoints and usage examples
- **Types_Database.md** - Aircraft types database documentation
- **Logo_Management.md** - Logo system and media pack documentation

## Publishing the Wiki

There are three methods to publish the wiki content to GitHub:

### Method 1: Using the Automated Script (Recommended)

The easiest way to publish or validate the wiki:

```bash
# Check wiki files are valid
node tools/publish-wiki.js --check

# Publish to GitHub Wiki (requires wiki repo to be cloned)
node tools/publish-wiki.js
```

The script will:
1. Validate that all required files exist
2. Check file sizes and structure
3. Copy files to the wiki repository (if cloned)
4. Provide instructions for committing and pushing

### Method 2: Manual Git-Based Publishing

If you prefer manual control:

1. **Clone the wiki repository:**
   ```bash
   git clone https://github.com/christopherwhull/aircraft-dashboard.wiki.git
   ```

2. **Copy wiki files:**
   ```bash
   # From the main repository root
   cp wiki/*.md aircraft-dashboard.wiki/
   
   # Don't copy README.md (it's only for the main repo)
   rm aircraft-dashboard.wiki/README.md
   ```

3. **Commit and push:**
   ```bash
   cd aircraft-dashboard.wiki
   git add .
   git commit -m "Update wiki content"
   git push origin master
   ```

### Method 3: GitHub Web Interface

For small updates or individual page changes:

1. Navigate to your repository on GitHub
2. Click the **Wiki** tab at the top
3. If the wiki doesn't exist, click **Create the first page**
4. Create or edit pages directly in the web interface
5. Copy content from the corresponding `.md` files in the `/wiki` directory

## Enabling GitHub Wiki

If the wiki is not enabled on your repository:

1. Go to your repository on GitHub
2. Click **Settings** (requires admin access)
3. Scroll down to **Features** section
4. Check the **Wikis** checkbox
5. Click **Save** if needed

The Wiki tab will now appear in your repository navigation.

## Wiki Maintenance Workflow

When updating the wiki:

1. **Edit files in `/wiki` directory** in the main repository
   - Make changes to the appropriate `.md` files
   - Use standard Markdown syntax
   - Test locally if possible

2. **Commit to main repository:**
   ```bash
   git add wiki/*.md
   git commit -m "docs: Update wiki content"
   git push
   ```

3. **Publish to GitHub Wiki:**
   ```bash
   node tools/publish-wiki.js
   ```
   Or follow the manual steps above.

4. **Verify on GitHub:**
   - Navigate to the Wiki tab on GitHub
   - Check that pages render correctly
   - Verify navigation links work
   - Test the sidebar navigation

## GitHub Wiki Naming Conventions

GitHub Wiki has specific naming conventions:

- **Spaces**: Convert to hyphens in URLs
  - `Cache Status` → file: `Cache_Status.md` → URL: `/Cache-Status`
- **Underscores**: Can be used interchangeably with hyphens
  - Both `Cache_Status.md` and `Cache-Status.md` work
- **Home Page**: Must be named `Home.md`
- **Sidebar**: Must be named `_Sidebar.md`
- **Case Sensitivity**: Page names are case-insensitive in URLs

## Wiki Features

### Sidebar Navigation

The `_Sidebar.md` file provides navigation on every wiki page:

- Automatically appears on the left side of each page
- Contains links to all major sections
- Organized into logical categories
- Can be customized by editing `wiki/_Sidebar.md`

### Internal Links

Wiki pages can link to each other using simple syntax:

```markdown
[Link Text](Page-Name)
```

Examples:
```markdown
[API Documentation](API)
[Live Tab](Live)
[Types Database](Types_Database)
```

### External Links

Link to files in the main repository:

```markdown
[Configuration Guide](../CONFIGURATION.md)
[Main README](../README.md)
```

## Testing Locally

While GitHub Wiki doesn't have a local preview mode, you can test the Markdown:

1. **Use a Markdown previewer:**
   - VS Code with Markdown preview
   - GitHub Desktop
   - Online tools like dillinger.io

2. **Check links:**
   - Ensure internal wiki links use correct page names
   - Verify external links to main repo files
   - Test that images load correctly

3. **Validate with the script:**
   ```bash
   node tools/publish-wiki.js --check
   ```

## Troubleshooting

### Wiki tab not visible
- Check repository settings to ensure Wikis are enabled
- You may need admin access to enable this feature

### Pages not updating
- Clear your browser cache
- Check that you pushed to the correct branch (usually `master` or `main`)
- Verify the wiki repository URL is correct

### Links broken
- Check that page names match exactly
- Remember that GitHub converts spaces to hyphens in URLs
- Use underscores in file names for multi-word pages

### Images not displaying
- Store images in the main repository, not the wiki repo
- Use relative links: `![Alt text](../path/to/image.png)`
- Or use absolute URLs to the raw GitHub content

## Best Practices

1. **Keep wiki in sync**: Always update `/wiki` in the main repo first, then publish
2. **Use the script**: The automated script ensures consistency
3. **Test links**: Check that all internal and external links work
4. **Update sidebar**: When adding new pages, update `_Sidebar.md`
5. **Write clear content**: Use headers, lists, and code blocks for readability
6. **Version control**: The wiki is its own git repo, so changes are tracked

## Additional Resources

- [GitHub Wiki Documentation](https://docs.github.com/en/communities/documenting-your-project-with-wikis)
- [Markdown Guide](https://www.markdownguide.org/)
- [GitHub Flavored Markdown](https://github.github.com/gfm/)

## Getting Help

If you encounter issues:
1. Check this guide for common solutions
2. Review the wiki publishing script output for errors
3. File an issue on the main repository
4. Contact the maintainers for assistance
