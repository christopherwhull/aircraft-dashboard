const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

async function listS3Files(s3, bucketName, prefix = '', maxKeys = 1000, maxPages = null) {
    const allContents = [];
    let continuationToken = null;
    let pageCount = 0;
    const startTime = Date.now();

    do {
        const command = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: prefix,
            MaxKeys: maxKeys,
            ContinuationToken: continuationToken
        });
        const data = await s3.send(command);
        pageCount++;

        if (data.Contents) {
            allContents.push(...data.Contents);
        }

        continuationToken = data.NextContinuationToken;

        // Stop if we've reached max pages (e.g., maxPages=1 for performance)
        if (maxPages && pageCount >= maxPages) {
            console.log(`[listS3Files] Stopped pagination after ${pageCount} pages (${allContents.length} items)`);
            break;
        }
    } while (continuationToken);

    const duration = Date.now() - startTime;
    console.log(`[listS3Files] Listed ${allContents.length} files from s3://${bucketName}/${prefix} in ${duration}ms (${pageCount} pages)`);

    return allContents;
}

/**
 * List aircraft files from all receiver prefixes for multi-tracker support
 * This function searches both the base prefix and all receiver-specific prefixes
 */
async function listAircraftFiles(s3, bucketName, basePrefix = 'data/', maxKeys = 1000, maxPages = null) {
    const allFiles = [];
    const startTime = Date.now();

    // List files from base prefix (for backward compatibility)
    const baseFiles = await listS3Files(s3, bucketName, `${basePrefix}piaware_aircraft_log`, maxKeys, maxPages);
    allFiles.push(...baseFiles);

    // List files from all receiver-specific prefixes
    const receiverBaseFiles = await listS3Files(s3, bucketName, `${basePrefix}receivers/`, maxKeys, maxPages);
    allFiles.push(...receiverBaseFiles);

    const duration = Date.now() - startTime;
    console.log(`[listAircraftFiles] Listed ${allFiles.length} aircraft files from s3://${bucketName}/${basePrefix} in ${duration}ms`);

    return allFiles;
}

async function downloadAndParseS3File(s3, bucketName, fileKey) {
    try {
        const command = new GetObjectCommand({ Bucket: bucketName, Key: fileKey });
        const data = await s3.send(command);
        const content = await streamToString(data.Body);

        if (!content || content.trim() === '') {
            console.warn(`S3 file is empty: ${fileKey}`);
            return []; // Return an empty array for empty files
        }

        // Try parsing as a single JSON object first (for files this app writes)
        try {
            const singleJson = JSON.parse(content);
            if (singleJson.aircraft && Array.isArray(singleJson.aircraft)) {
                return singleJson.aircraft;
            }
            if (Array.isArray(singleJson)) {
                return singleJson;
            }
        } catch (e) {
            // Not a single JSON object, proceed to line-by-line parsing for Python app logs.
        }

        // Handle line-delimited JSON from the Python app
        const records = [];
        for (const line of content.split('\n')) {
            if (line.trim()) {
                try {
                    records.push(JSON.parse(line));
                } catch (e) {
                    // This can happen if a file is partially written, etc.
                    // Silently skip - this is normal for streaming data
                }
            }
        }
        return records;

    } catch (error) {
        // Don't log NoSuchKey errors - these are expected when files don't exist yet
        if (error.Code !== 'NoSuchKey') {
            console.error(`Error in downloadAndParseS3File for ${fileKey}:`, error);
        }
        throw error;
    }
}

function streamToString(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
}

async function uploadJsonToS3(s3, bucketName, fileKey, jsonData) {
    const fileContent = JSON.stringify(jsonData, null, 2);
    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: fileKey,
        Body: fileContent,
        ContentType: 'application/json'
    });
    await s3.send(command);
}

module.exports = { listS3Files, listAircraftFiles, downloadAndParseS3File, uploadJsonToS3 };
