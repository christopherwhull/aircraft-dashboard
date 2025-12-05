# Guide: Building Your Own Logo Database

This guide explains how to add, update, and manage airline logos for the aircraft dashboard. The system uses an S3 bucket to store logo images and a JSON file (`airline_database.json`) to map airlines to their respective logos.

## Prerequisites

Before you begin, ensure you have the following set up:

1.  **Node.js Environment**: The logo management scripts are written in Node.js.
2.  **S3 Compatible Storage**: An S3 bucket (like AWS S3 or a self-hosted MinIO instance) is required to store the logo images.
3.  **Configuration**: Your `config.js` file must be correctly configured with the S3 endpoint, credentials, and bucket names. Specifically, the `writeBucket` is used for storing logos.

## `airline_database.json`

The `airline_database.json` file is the heart of the logo system. It's a JSON object where each key is an airline's ICAO code.

### Structure

Each airline entry has the following structure:

```json
"AAL": {
  "name": "American Airlines",
  "logo": "/api/v1logos/AAL"
}
```

-   `name`: The common name of the airline.
-   `logo`: The API path to the airline's logo. When set to a path, the `logo-server.js` will fetch the corresponding logo from the S3 bucket. When set to `null`, it signals to the management script that a logo is missing.

## Adding New Airline Logos

There are two ways to add a new logo: automatically using the provided script or manually.

### Method 1: Automated Download (Recommended)

The `logo-tools/logo-manager.js` script can automatically find and download logos from public sources.

1.  **Add the Airline to the Database**:
    Open `airline_database.json` and add a new entry for the airline you want to add. Set the `logo` property to `null`.

    **Example**: To add "JetBlue" (JBU), add the following entry:

    ```json
    "JBU": {
      "name": "JetBlue",
      "logo": null
    }
    ```

2.  **Run the Download Script**:
    Execute the script from your terminal, specifying the ICAO code(s) of the airline(s) you want to download.

    ```bash
    node logo-tools/logo-manager.js download --airlines=JBU,SWA,UAL
    ```

    The script will:
    -   Search for airlines in `airline_database.json` with a `null` logo.
    -   Attempt to download the logo from an external source.
    -   Upload the logo to your S3 bucket under the `logos/` directory (e.g., `logos/JBU.png`).
    -   Automatically update `airline_database.json` to set the correct logo path (e.g., `/api/v1logos/JBU`).

### Method 2: Manual Upload

If the automated script cannot find a logo, or if you have a custom logo file, you can add it manually.

1.  **Prepare Your Logo**:
    -   The logo should be a PNG file.
    -   Name the file using the airline's ICAO code (e.g., `JBU.png`).

2.  **Upload to S3**:
    -   Using an S3 client (like `s3cmd`, `mc`, or the AWS/MinIO web console), upload your logo file to the `logos/` directory inside your configured `writeBucket`.

3.  **Update the Database Manually**:
    -   Open `airline_database.json`.
    -   Find the entry for your airline (or create one).
    -   Set the `logo` property to point to the API endpoint for that logo. The format is `/api/v1logos/ICAO`.

    **Example**: For JetBlue (JBU), you would update the entry to:

    ```json
    "JBU": {
      "name": "JetBlue",
      "logo": "/api/v1logos/JBU"
    }
    ```

## Verification

After adding a logo, restart the server to ensure all changes are loaded.

```bash
python tools/restart_server.py --all
```

Then, open the aircraft dashboard in your browser and find an aircraft from the airline you just added. The new logo should be displayed. If you see a default logo, check the server logs for any errors related to fetching the image from S3.
