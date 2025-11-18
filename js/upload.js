// ثوابت التطبيق
const MAX_COVER_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PDF_SIZE = 100 * 1024 * 1024;  // 100MB
const ALLOWED_COVER_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];
const ALLOWED_PDF_TYPES = ['application/pdf'];
const UPLOAD_ENDPOINT = '/.netlify/functions/upload';

// معرّف فريد لكل جلسة (يضاف أمان إضافي)
const SESSION_ID = Math.random().toString(36).substring(2, 15);

// دالة التحقق من البيانات مع حماية إضافية
function validateFormData(data) {
    const { title, author, category, summary, coverFile, pdfFile } = data;
    
    // التحقق من عدم ترك أي حقل فارغاً
    if (!title || !author || !category || !summary) {
        throw new Error('جميع الحقول مطلوبة ولا يمكن تركها فارغة');
    }

    // التحقق من أن الحقول لا تحتوي على أكواد برمجية ضارة
    const dangerousPatterns = /<script|javascript:|onerror|onclick/gi;
    if (dangerousPatterns.test(title) || dangerousPatterns.test(author) || 
        dangerousPatterns.test(category) || dangerousPatterns.test(summary)) {
        throw new Error('تم اكتشاف محتوى غير آمن. يرجى التحقق من المدخلات.');
    }

    if (!coverFile || !pdfFile) {
        throw new Error('يرجى اختيار ملف الغلاف وملف الكتاب');
    }

    if (!ALLOWED_COVER_TYPES.includes(coverFile.type)) {
        throw new Error('يجب أن يكون الغلاف بصيغة JPG أو PNG');
    }

    if (!ALLOWED_PDF_TYPES.includes(pdfFile.type)) {
        throw new Error('يجب أن يكون الكتاب بصيغة PDF');
    }

    if (coverFile.size > MAX_COVER_SIZE) {
        throw new Error('حجم الغلاف يجب أن لا يتجاوز 10 ميجابايت');
    }

    if (pdfFile.size > MAX_PDF_SIZE) {
        throw new Error('حجم الكتاب يجب أن لا يتجاوز 100 ميجابايت');
    }
}

// دالة رفع الملفات إلى الخادم مع معالجة أفضل للأخطاء
async function uploadToServer(formData) {
    try {
        // إضافة معرّف الجلسة كطبقة أمان إضافية
        formData.append('sessionId', SESSION_ID);
        
        const response = await fetch(UPLOAD_ENDPOINT, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            // معالجة محددة لكل نوع خطأ
            if (response.status === 404) {
                throw new Error('❌ خدمة الرفع غير متاحة. تأكد من أن الدالة منشورة على Netlify.');
            }
            if (response.status === 413) {
                throw new Error('❌ حجم الملف كبير جداً. يرجى التأكد من حد الحجم الأقصى.');
            }
            if (response.status === 500) {
                const txt = await response.text().catch(() => response.statusText);
                throw new Error('❌ خطأ في الخادم: ' + (txt || 'حاول لاحقاً'));
            }
            if (response.status === 429) {
                throw new Error('❌ الكثير من المحاولات. انتظر قليلاً ثم حاول مجدداً.');
            }
            const errorText = await response.text().catch(() => response.statusText);
            throw new Error('❌ فشل رفع الملفات: ' + errorText);
        }

        const result = await response.json();
        
        // التحقق من أن الرد يحتوي على البيانات المطلوبة
        if (!result?.success || !result?.cover || !result?.pdf) {
            throw new Error('❌ فشل الخادم في إرجاع روابط الملفات');
        }

        return result;
    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            throw new Error('❌ فشل الاتصال بالإنترنت أو الخادم. تحقق من الاتصال.');
        }
        throw error;
    }
}

// دالة تحديث واجهة المستخدم
function updateUI(elements, { message, error, progress }) {
    const { form, statusDiv, statusText, progressBar, errorDiv, submitButton } = elements;

    if (error) {
        errorDiv.textContent = error;
        errorDiv.classList.remove('hidden');
        statusText.textContent = 'فشل الرفع';
        statusText.classList.add('text-red-500');
        progressBar.classList.add('bg-red-500');
        submitButton.disabled = false;
        return;
    }

    if (progress !== undefined) {
        progressBar.style.width = `${progress}%`;
    }

    if (message) {
        statusText.textContent = message;
    }
}

// دالة رفع الكتاب الرئيسية مع معالجة شاملة للأخطاء
async function handleBookUpload(e) {
    e.preventDefault();
    
    const elements = {
        form: e.target,
        statusDiv: document.getElementById('upload-status'),
        statusText: document.getElementById('upload-status-text'),
        progressBar: document.getElementById('upload-progress'),
        errorDiv: document.getElementById('error-message'),
        submitButton: e.target.querySelector('button[type="submit"]')
    };

    // تهيئة حالة النموذج
    elements.statusDiv.classList.remove('hidden');
    elements.errorDiv.classList.add('hidden');
    elements.progressBar.style.width = '0%';
    elements.progressBar.classList.remove('bg-red-500');
    elements.statusText.classList.remove('text-red-500');
    elements.submitButton.disabled = true;

    try {
        // جمع البيانات بعناية
        const titleInput = document.getElementById('title');
        const authorInput = document.getElementById('author');
        const categoryInput = document.getElementById('category');
        const summaryInput = document.getElementById('summary');
        const coverFileInput = document.getElementById('cover-file');
        const pdfFileInput = document.getElementById('pdf-file');

        if (!titleInput || !authorInput || !categoryInput || !summaryInput) {
            throw new Error('❌ لم يتم العثور على جميع حقول النموذج');
        }

        const formData = {
            title: titleInput.value?.trim(),
            author: authorInput.value?.trim(),
            category: categoryInput.value?.trim(),
            summary: summaryInput.value?.trim(),
            coverFile: coverFileInput?.files[0],
            pdfFile: pdfFileInput?.files[0]
        };

        // التحقق من البيانات
        validateFormData(formData);

        // تحضير بيانات الرفع
        const uploadData = new FormData();
        uploadData.append('cover', formData.coverFile);
        uploadData.append('pdf', formData.pdfFile);

        // تحديث واجهة المستخدم
        updateUI(elements, {
            message: 'جاري رفع الملفات (0%)...',
            progress: 10
        });

        // رفع الملفات
        const uploadResult = await uploadToServer(uploadData);

        // تحديث التقدم
        updateUI(elements, {
            message: 'جاري معالجة البيانات (75%)...',
            progress: 75
        });

        // إنشاء بيانات الكتاب بمعرّف فريد
        const bookData = {
            id: 'book-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
            title: formData.title,
            author: formData.author,
            category: formData.category,
            summary: formData.summary,
            description: formData.summary, // استخدم الملخص كوصف قصير
            cover: uploadResult.cover,
            downloadUrl: uploadResult.pdf,
            dateAdded: new Date().toISOString()
        };

        // تحديث واجهة المستخدم
        updateUI(elements, {
            message: 'تم الرفع بنجاح! (100%)',
            progress: 100
        });

        // عرض الكود الناتج
        const outputDiv = document.getElementById('generated-code');
        if (outputDiv) {
            const pre = outputDiv.querySelector('pre');
            if (pre) {
                pre.textContent = JSON.stringify(bookData, null, 2);
                outputDiv.classList.remove('hidden');
            }
        }

        // إضافة الكتاب للقائمة وتحديث العرض
        if (typeof window.booksData !== 'undefined' && Array.isArray(window.booksData)) {
            window.booksData.unshift(bookData);
            console.log('✅ تم إضافة الكتاب:', bookData.title);
            if (typeof window.renderBooks === 'function') {
                window.renderBooks();
            }
        }

        // إظهار رسالة النجاح
        const alertBox = document.getElementById('success-alert');
        if (alertBox) {
            alertBox.classList.remove('hidden');
            setTimeout(() => alertBox.classList.add('hidden'), 3000);
        }

        // إغلاق النافذة وإعادة تعيين النموذج بعد تأخير قصير
        setTimeout(() => {
            const adminUploadDiv = document.getElementById('admin-upload');
            if (adminUploadDiv) {
                adminUploadDiv.classList.add('hidden');
            }
            elements.form.reset();
            elements.statusDiv.classList.add('hidden');
            elements.progressBar.style.width = '0%';
            elements.submitButton.disabled = false;
        }, 2000);

    } catch (error) {
        console.error('❌ خطأ في الرفع:', error);
        updateUI(elements, {
            error: error.message || 'حدث خطأ غير متوقع في رفع الملفات'
        });
    }
}

// تسجيل معالج الحدث عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('book-form');
    if (form) {
        form.addEventListener('submit', handleBookUpload);
        console.log('✅ تم تحضير نموذج رفع الكتب');
    } else {
        console.warn('⚠️ لم يتم العثور على نموذج الرفع');
    }

    // زر اختبار نقطة النهاية لخدمة الرفع (للتشخيص)
    const testBtn = document.getElementById('test-upload-endpoint');
    const statusSpan = document.getElementById('endpoint-test-status');
    if (testBtn && statusSpan) {
        testBtn.addEventListener('click', async () => {
            statusSpan.classList.remove('hidden');
            statusSpan.textContent = '🔄 جاري اختبار الخدمة...';
            try {
                // اختبر OPTIONS request للتحقق من توفر الخدمة
                const res = await fetch(UPLOAD_ENDPOINT, { 
                    method: 'OPTIONS', 
                    cache: 'no-store'
                });
                
                if (res.ok || res.status === 204) {
                    statusSpan.textContent = `✅ خدمة الرفع متاحة (HTTP ${res.status})`;
                    console.log('✅ اختبار الخدمة نجح');
                } else {
                    statusSpan.textContent = `⚠️ رد من الخادم: ${res.status} ${res.statusText}`;
                    console.warn('⚠️ رد غير متوقع من الخادم:', res.status);
                }
            } catch (err) {
                statusSpan.textContent = `❌ خطأ: ${err.message || 'تعذر الوصول للخدمة'}`;
                console.error('❌ فشل اختبار الخدمة:', err);
            }
            // أخفِ الحالة بعد 8 ثوانٍ
            setTimeout(() => statusSpan.classList.add('hidden'), 8000);
        });
    }
});