// ثوابت التطبيق
const MAX_COVER_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PDF_SIZE = 100 * 1024 * 1024;  // 100MB
const ALLOWED_COVER_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];
const ALLOWED_PDF_TYPES = ['application/pdf'];
const UPLOAD_ENDPOINT = '/.netlify/functions/upload';

// دالة التحقق من البيانات
function validateFormData(data) {
    const { title, author, category, summary, coverFile, pdfFile } = data;
    
    if (!title || !author || !category || !summary) {
        throw new Error('جميع الحقول مطلوبة');
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

// دالة رفع الملفات إلى الخادم
async function uploadToServer(formData) {
    try {
        const response = await fetch(UPLOAD_ENDPOINT, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => response.statusText);
            throw new Error('فشل رفع الملفات: ' + errorText);
        }

        const result = await response.json();
        
        if (!result?.success || !result?.cover || !result?.pdf) {
            throw new Error('فشل استلام روابط الملفات المرفوعة');
        }

        return result;
    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            throw new Error('فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.');
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

// دالة رفع الكتاب الرئيسية
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
        // جمع البيانات
        const formData = {
            title: document.getElementById('title')?.value?.trim(),
            author: document.getElementById('author')?.value?.trim(),
            category: document.getElementById('category')?.value?.trim(),
            summary: document.getElementById('summary')?.value?.trim(),
            coverFile: document.getElementById('cover-file')?.files[0],
            pdfFile: document.getElementById('pdf-file')?.files[0]
        };

        // التحقق من البيانات
        validateFormData(formData);

        // تحضير بيانات الرفع
        const uploadData = new FormData();
        uploadData.append('cover', formData.coverFile);
        uploadData.append('pdf', formData.pdfFile);

        // تحديث واجهة المستخدم
        updateUI(elements, {
            message: 'جاري رفع الملفات...',
            progress: 25
        });

        // رفع الملفات
        const uploadResult = await uploadToServer(uploadData);

        // تحديث التقدم
        updateUI(elements, {
            message: 'جاري معالجة الملفات...',
            progress: 75
        });

        // إنشاء بيانات الكتاب
        const bookData = {
            id: 'book-' + Math.random().toString(36).substring(2, 9),
            title: formData.title,
            author: formData.author,
            category: formData.category,
            summary: formData.summary,
            cover: uploadResult.cover,
            downloadUrl: uploadResult.pdf
        };

        // تحديث واجهة المستخدم
        updateUI(elements, {
            message: 'تم الرفع بنجاح!',
            progress: 100
        });

        // عرض الكود الناتج
        const outputDiv = document.getElementById('generated-code');
        const pre = outputDiv.querySelector('pre');
        pre.textContent = JSON.stringify(bookData, null, 2);
        outputDiv.classList.remove('hidden');

        // إضافة الكتاب للقائمة وتحديث العرض
        if (typeof window.booksData !== 'undefined') {
            window.booksData.unshift(bookData);
            if (typeof window.renderBooks === 'function') {
                window.renderBooks();
            }
        }

        // إظهار رسالة النجاح
        const alertBox = document.getElementById('success-alert');
        if (alertBox) {
            alertBox.classList.remove('hidden');
            setTimeout(() => alertBox.classList.add('hidden'), 2000);
        }

        // إغلاق النافذة وإعادة تعيين النموذج
        setTimeout(() => {
            document.getElementById('admin-upload').classList.add('hidden');
            elements.form.reset();
            elements.statusDiv.classList.add('hidden');
            elements.progressBar.style.width = '0%';
            elements.submitButton.disabled = false;
        }, 1000);

    } catch (error) {
        console.error('خطأ في الرفع:', error);
        updateUI(elements, {
            error: 'حدث خطأ: ' + (error.message || 'فشل رفع الملفات')
        });
    }
}

// تسجيل معالج الحدث عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('book-form');
    if (form) {
        form.addEventListener('submit', handleBookUpload);
    }
});