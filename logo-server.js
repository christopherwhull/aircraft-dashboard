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
const LOGO_S3_KEY = 'logos/airsquak.jpg';

const server = http.createServer(async (req, res) => {
    if (req.url === '/api/logo') {
        try {
            const command = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: LOGO_S3_KEY,
            });
            const { Body, ContentType } = await s3.send(command);
            res.setHeader('Content-Type', ContentType || 'image/jpeg');
            Body.pipe(res);
        } catch (error) {
            console.error('Error serving logo:', error);
            res.statusCode = 500;
            res.end('Error serving logo');
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
