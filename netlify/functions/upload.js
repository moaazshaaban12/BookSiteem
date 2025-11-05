
const crypto = require('crypto');
const Busboy = require('busboy');

// Note: This function uses Netlify's Deploy API to create a new deploy
// containing the uploaded files so they become persistent and public
// on your Netlify site. You must set these environment variables in
// your Netlify site's settings: NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID.

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }


  const NETLIFY_TOKEN = process.env.NETLIFY_AUTH_TOKEN;
  const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID;
  if (!NETLIFY_TOKEN || !NETLIFY_SITE_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured: set NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID env vars' }) };
  }

  const headers = {};
  // copy case-insensitive headers for busboy
  for (const k of Object.keys(event.headers || {})) headers[k.toLowerCase()] = event.headers[k];

  const busboy = new Busboy({ headers });
  const files = {};
  const fields = {};

  return new Promise((resolve) => {
    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
      const chunks = [];
      file.on('data', (data) => chunks.push(data));
      file.on('end', () => {
        files[fieldname] = { buffer: Buffer.concat(chunks), filename, mimetype };
      });
    });

    busboy.on('field', (name, val) => {
      fields[name] = val;
    });


    busboy.on('finish', async () => {
      try {
        // Prepare file paths and SHA1 manifest required by Netlify Deploy API
        const filesMap = {}; // path -> buffer
        const manifest = {}; // path -> sha1

        for (const key of Object.keys(files)) {
          const f = files[key];
          const safeName = `${Date.now()}-${f.filename.replace(/\s+/g, '_')}`;
          let relPath;
          if (f.mimetype.startsWith('image/')) {
            relPath = `covers/${safeName}`;
          } else if (f.mimetype === 'application/pdf') {
            relPath = `books/${safeName}`;
          } else {
            continue;
          }
          filesMap[relPath] = f.buffer;
          const sha = crypto.createHash('sha1').update(f.buffer).digest('hex');
          manifest[relPath] = sha;
        }

        // 1) Create a deploy with the manifest
        const createDeployRes = await fetch(`https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/deploys`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${NETLIFY_TOKEN}`
          },
          body: JSON.stringify({ files: manifest })
        });
        if (!createDeployRes.ok) {
          const txt = await createDeployRes.text();
          console.error('Failed to create deploy:', createDeployRes.status, txt);
          return resolve({ statusCode: 500, body: JSON.stringify({ error: 'Failed to create deploy', details: txt }) });
        }
        const deployData = await createDeployRes.json();

        // 2) Upload required files
        const required = deployData.required || deployData.upload_required || {};
        // 'required' is an object mapping path -> upload_url
        for (const p of Object.keys(required)) {
          const uploadUrl = required[p];
          const buffer = filesMap[p];
          if (!buffer) continue; // nothing to upload for this path
          const putRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/octet-stream'
            },
            body: buffer
          });
          if (!putRes.ok) {
            const txt = await putRes.text();
            console.error('Failed to upload file to Netlify:', p, putRes.status, txt);
            return resolve({ statusCode: 500, body: JSON.stringify({ error: 'Failed to upload file', path: p, details: txt }) });
          }
        }

        // 3) Deploy created; build public URLs using deploy's ssl_url or deploy_url
        const siteUrl = deployData.deploy_ssl_url || deployData.deploy_url || deployData.ssl_url || deployData.url;
        const resultUrls = {};
        for (const p of Object.keys(filesMap)) {
          // ensure leading slash removed
          const clean = p.replace(/^\//, '');
          if (p.startsWith('covers/')) resultUrls.cover = `${siteUrl}/${clean}`;
          if (p.startsWith('books/')) resultUrls.pdf = `${siteUrl}/${clean}`;
        }

        resolve({ statusCode: 200, body: JSON.stringify(Object.assign({ success: true }, resultUrls, { deploy: deployData.deploy_id || deployData.id || null })) });
      } catch (err) {
        console.error('Server upload exception', err);
        resolve({ statusCode: 500, body: JSON.stringify({ error: err.message || 'Upload failed' }) });
      }
    });

    const body = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8');
    busboy.end(body);
  });
};
