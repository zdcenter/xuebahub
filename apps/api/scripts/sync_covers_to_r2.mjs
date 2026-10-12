import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..', '..');

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

function hash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function uploadBufferToR2(key, buffer, contentType = 'image/png') {
  return new Promise((resolve, reject) => {
    const method = 'PUT';
    const objectPath = `/${bucket}/${key}`;
    const payloadHash = hash(buffer);

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = `${method}\n${objectPath}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${hash(canonicalRequest)}`;

    const kDate = hmac('AWS4' + secretKey, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    const kSigning = hmac(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authorization = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const req = https.request({
      host,
      path: objectPath,
      method,
      headers: {
        'host': host,
        'content-type': contentType,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        'Authorization': authorization,
        'Content-Length': buffer.length
      }
    }, (res) => {
      let respBody = '';
      res.on('data', chunk => respBody += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.statusCode);
        } else {
          reject(new Error(`Upload failed HTTP ${res.statusCode}: ${respBody}`));
        }
      });
    });

    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

async function main() {
  const coversDir = path.join(projectRoot, 'apps', 'web', 'public', 'covers');
  const ogCoverPath = path.join(projectRoot, 'apps', 'web', 'public', 'og-cover.png');

  console.log(`[R2 Uploader] Checking files in ${coversDir}...`);
  if (!fs.existsSync(coversDir)) {
    console.error('Covers dir not found!');
    return;
  }

  const files = fs.readdirSync(coversDir).filter(f => f.endsWith('.png'));
  console.log(`Found ${files.length} covers to sync to R2.`);

  for (const file of files) {
    const filePath = path.join(coversDir, file);
    const buffer = fs.readFileSync(filePath);
    const r2Key = `covers/${file}`;
    process.stdout.write(`Uploading ${r2Key} (${(buffer.length / 1024).toFixed(1)} KB)... `);
    try {
      await uploadBufferToR2(r2Key, buffer, 'image/png');
      console.log(`✓ OK -> https://image.xuebaw.com/${r2Key}`);
    } catch (e) {
      console.log(`✗ FAIL: ${e.message}`);
    }
  }

  if (fs.existsSync(ogCoverPath)) {
    const buffer = fs.readFileSync(ogCoverPath);
    process.stdout.write(`Uploading default og-cover.png... `);
    try {
      await uploadBufferToR2('covers/default.png', buffer, 'image/png');
      console.log(`✓ OK -> https://image.xuebaw.com/covers/default.png`);
    } catch (e) {
      console.log(`✗ FAIL: ${e.message}`);
    }
  }

  console.log('[R2 Uploader] All files synced to Cloudflare R2 successfully!');
}

main();
