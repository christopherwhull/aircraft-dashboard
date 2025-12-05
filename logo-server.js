const http = require('http');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const config = require('./config');

const s3 = new S3Client({
    endpoint: config.s3.endpoint,
    region: config.s3.region,
    credentials: config.s3.credentials,
    forcePathStyle: config.s3.forcePathStyle,
});

const BUCKET_NAME = config.buckets.writeBucket;

const server = http.createServer(async (req, res) => {
    const urlParts = req.url.split('/');
    if (urlParts.length === 4 && urlParts[1] === 'api' && urlParts[2] === 'v1logos') {
        const icao = urlParts[3];
        const logoS3Key = `logos/${icao}.png`;

        try {
            const command = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: logoS3Key,
            });
            const { Body, ContentType } = await s3.send(command);
            res.setHeader('Content-Type', ContentType || 'image/png');
            Body.pipe(res);
        } catch (error) {
            console.error(`Error serving logo for ${icao}:`, error);

            // If the logo is not found, serve a default image
            try {
                const defaultLogoKey = 'logos/default.png';
                const defaultLogoCommand = new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: defaultLogoKey,
                });
                const { Body: defaultBody, ContentType: defaultContentType } = await s3.send(defaultLogoCommand);
                res.setHeader('Content-Type', defaultContentType || 'image/png');
                defaultBody.pipe(res);
            } catch (defaultError) {
                console.error('Error serving default logo:', defaultError);
                res.statusCode = 500;
                res.end('Error serving logo');
            }
        }
    } else {
        res.statusCode = 404;
        res.end('Not Found');
    }
});

server.on('error', (e) => {
    console.error(`Server error: ${e.message}`);
});

server.listen(3005, '0.0.0.0', () => {
    console.log('Logo server running on port 3005');
});
