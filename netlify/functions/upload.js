const crypto = require('crypto');
const Busboy = require('busboy');
const fetch = require('node-fetch');

// الإعدادات الأمنية
const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150MB الحد الأقصى الكلي
const MAX_UPLOAD_TIME = 5 * 60 * 1000; // 5 دقائق
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];
const ALLOWED_PDF_TYPES = ['application/pdf'];

exports.handler = async (event, context) => {
  // تعيين مهلة زمنية للطلب
  const timeoutId = setTimeout(() => {
    console.error('⚠️ تجاوز وقت الطلب');
  }, MAX_UPLOAD_TIME);

  try {
    // إضافة رؤوس CORS
    const requestOrigin = (event.headers && (event.headers.origin || event.headers.Origin)) || '*';
    const corsHeaders = {
      'Access-Control-Allow-Origin': requestOrigin,
      'Access-Control-Allow-Headers': 'Content-Type, Accept, Origin, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Credentials': requestOrigin === '*' ? 'false' : 'true',
      'Access-Control-Max-Age': '86400',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    };

    // معالجة طلب OPTIONS (CORS preflight)
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: corsHeaders,
        body: ''
      };
    }

    if (event.httpMethod !== 'POST') {
      return { 
        statusCode: 405, 
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Method Not Allowed' }) 
      };
    }

    // التحقق من متغيرات البيئة
    const NETLIFY_TOKEN = process.env.NETLIFY_AUTH_TOKEN;
    const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID;
    
    console.log('🔐 التحقق من بيانات الخادم:', {
      hasToken: !!NETLIFY_TOKEN,
      hasSiteId: !!NETLIFY_SITE_ID
    });

    if (!NETLIFY_TOKEN || !NETLIFY_SITE_ID) {
      return { 
        statusCode: 500, 
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'خطأ في إعدادات الخادم',
          debug: { hasToken: !!NETLIFY_TOKEN, hasSiteId: !!NETLIFY_SITE_ID }
        }) 
      };
    }

    // تحضير معالج busboy
    const headers = {};
    for (const k of Object.keys(event.headers || {})) {
      headers[k.toLowerCase()] = event.headers[k];
    }

    const busboy = new Busboy({ headers, limits: { fileSize: MAX_FILE_SIZE } });
    const files = {};
    const fields = {};
    let uploadError = null;

    console.log('📝 طلب رفع وارد:', {
      method: event.httpMethod,
      contentType: event.headers['content-type']
    });

    return new Promise((resolve) => {
      busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        console.log('📦 معالجة ملف:', { fieldname, filename, mimetype });
        
        // التحقق من نوع الملف
        const isAllowedType = ALLOWED_IMAGE_TYPES.includes(mimetype) || ALLOWED_PDF_TYPES.includes(mimetype);
        if (!isAllowedType) {
          uploadError = `نوع ملف غير مدعوم: ${mimetype}`;
          file.resume();
          return;
        }

        const chunks = [];
        let fileSize = 0;

        file.on('data', (data) => {
          fileSize += data.length;
          if (fileSize > MAX_FILE_SIZE) {
            uploadError = 'حجم الملف يتجاوز الحد الأقصى المسموح';
            file.destroy();
          } else {
            chunks.push(data);
          }
        });

        file.on('end', () => {
          const buffer = Buffer.concat(chunks);
          console.log(`✅ اكتمال الملف ${fieldname}:`, {
            size: buffer.length,
            filename,
            mimetype
          });
          files[fieldname] = { buffer, filename, mimetype };
        });

        file.on('error', (err) => {
          uploadError = 'خطأ في رفع الملف: ' + err.message;
          console.error('❌ خطأ في الملف:', err);
        });
      });

      busboy.on('field', (name, val) => {
        fields[name] = val;
      });

      busboy.on('finish', async () => {
        clearTimeout(timeoutId);
        
        if (uploadError) {
          return resolve({ 
            statusCode: 400, 
            headers: corsHeaders,
            body: JSON.stringify({ error: uploadError }) 
          });
        }

        try {
          // تحضير بيانات الملفات والـ manifest
          const filesMap = {};
          const manifest = {};

          for (const key of Object.keys(files)) {
            const f = files[key];
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substring(2, 8);
            const safeName = `${timestamp}-${randomStr}-${f.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            
            let relPath;
            if (ALLOWED_IMAGE_TYPES.includes(f.mimetype)) {
              relPath = `covers/${safeName}`;
            } else if (ALLOWED_PDF_TYPES.includes(f.mimetype)) {
              relPath = `books/${safeName}`;
            } else {
              continue;
            }

            filesMap[relPath] = f.buffer;
            const sha = crypto.createHash('sha1').update(f.buffer).digest('hex');
            manifest[relPath] = sha;

            console.log('📄 ملف جاهز للنشر:', { path: relPath, sha: sha.substring(0, 8) + '...' });
          }

          // 1) إنشاء deploy مع manifest
          console.log('🚀 إنشاء نسخة نشر جديدة على Netlify...');
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
            console.error('❌ فشل إنشاء Deploy:', createDeployRes.status, txt.substring(0, 200));
            return resolve({ 
              statusCode: 500, 
              headers: corsHeaders,
              body: JSON.stringify({ error: 'فشل في إنشاء نسخة النشر' }) 
            });
          }

          const deployData = await createDeployRes.json();
          console.log('✅ تم إنشاء Deploy ID:', deployData.id || deployData.deploy_id);

          // 2) رفع الملفات المطلوبة
          const required = deployData.required || deployData.upload_required || {};
          console.log('📤 عدد الملفات المطلوبة للرفع:', Object.keys(required).length);

          for (const p of Object.keys(required)) {
            const uploadUrl = required[p];
            const buffer = filesMap[p];
            if (!buffer) continue;

            const putRes = await fetch(uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/octet-stream'
              },
              body: buffer
            });

            if (!putRes.ok) {
              const txt = await putRes.text();
              console.error('❌ فشل رفع الملف:', p, putRes.status);
              return resolve({ 
                statusCode: 500, 
                headers: corsHeaders,
                body: JSON.stringify({ error: 'فشل رفع الملف: ' + p }) 
              });
            }
            console.log('✅ تم رفع:', p);
          }

          // 3) بناء الروابط العامة
          const siteUrl = deployData.deploy_ssl_url || deployData.deploy_url || deployData.ssl_url || deployData.url;
          const resultUrls = {};

          for (const p of Object.keys(filesMap)) {
            const clean = p.replace(/^\//, '');
            if (p.startsWith('covers/')) resultUrls.cover = `${siteUrl}/${clean}`;
            if (p.startsWith('books/')) resultUrls.pdf = `${siteUrl}/${clean}`;
          }

          console.log('✅ اكتمال الرفع بنجاح');
          resolve({ 
            statusCode: 200, 
            headers: corsHeaders,
            body: JSON.stringify({
              success: true,
              ...resultUrls,
              deploy: deployData.deploy_id || deployData.id || null
            })
          });

        } catch (err) {
          console.error('❌ استثناء في معالجة الرفع:', err.message);
          resolve({ 
            statusCode: 500, 
            headers: corsHeaders,
            body: JSON.stringify({ error: err.message || 'فشل الرفع' }) 
          });
        }
      });

      busboy.on('error', (err) => {
        console.error('❌ خطأ في Busboy:', err);
        resolve({
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'خطأ في معالجة البيانات المرسلة' })
        });
      });

      const body = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8');
      busboy.end(body);
    });

  } catch (err) {
    console.error('❌ خطأ عام:', err);
    clearTimeout(timeoutId);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'خطأ عام في الخادم' })
    };
  }
};
