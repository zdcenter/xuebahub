import crypto from 'node:crypto';
import https from 'node:https';

const accountId = '73d37f32afe703dfcc03ea189fc33fe0';
const accessKey = '33d6889c2f7ecdf74e0699754d2c4d5b';
const secretKey = '22757aebaa86f6c28173deeab0e8e0b679e932998f9ed6762b8391bcdfbd8090';
const bucket = 'xuebaw-image';
const region = 'auto';
const service = 's3';
const host = `${accountId}.r2.cloudflarestorage.com`;

function hmac(key, string) {
  return crypto.createHmac('sha256', key).update(string).digest();
}

function hash(string) {
  return crypto.createHash('sha256').update(string).digest('hex');
}

async function testR2() {
  const method = 'PUT';
  const objectKey = 'covers/test_connection.txt';
  const path = `/${bucket}/${objectKey}`;
  const body = 'Hello from XuebaHub Cloudflare R2 connection test!';
  const payloadHash = hash(body);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = `${method}\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${hash(canonicalRequest)}`;

  const kDate = hmac('AWS4' + secretKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authorization = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  console.log(`Testing PUT to https://${host}${path}...`);

  const req = https.request({
    host,
    path,
    method,
    headers: {
      'host': host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'Authorization': authorization,
      'Content-Length': Buffer.byteLength(body)
    }
  }, (res) => {
    let respBody = '';
    res.on('data', chunk => respBody += chunk);
    res.on('end', async () => {
      console.log(`Status: ${res.statusCode} ${res.statusMessage}`);
      console.log(`Response: ${respBody}`);
      if (res.statusCode === 200) {
        console.log(`SUCCESS! Testing public access via https://image.xuebaw.com/${objectKey}...`);
        const pubRes = await fetch(`https://image.xuebaw.com/${objectKey}`);
        console.log(`Public URL Status: ${pubRes.status}`);
        const pubText = await pubRes.text();
        console.log(`Public URL Content: ${pubText}`);
      }
    });
  });

  req.on('error', (err) => {
    console.error('Request error:', err);
  });

  req.write(body);
  req.end();
}

testR2();
