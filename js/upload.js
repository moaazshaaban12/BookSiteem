// دالة إعادة تعيين حالة النموذج
function resetFormState(form, statusDiv, statusText, progressBar, errorDiv) {
    form.reset();
    statusDiv.classList.add('hidden');
    progressBar.style.width = '0%';
    progressBar.classList.remove('bg-red-500');
    statusText.classList.remove('text-red-500');
    statusText.textContent = '';
    if (errorDiv) {
        errorDiv.classList.add('hidden');
        errorDiv.textContent = '';
    }
    form.querySelector('button[type="submit"]').disabled = false;
}

// دالة رفع الكتاب
async function handleBookUpload(e) {
    e.preventDefault();
    const form = e.target;
    const statusDiv = document.getElementById('upload-status');
    const statusText = document.getElementById('upload-status-text');
    const progressBar = document.getElementById('upload-progress');
    
    // جمع البيانات
    const title = document.getElementById('title').value.trim();
    const author = document.getElementById('author').value.trim();
    const category = document.getElementById('category').value.trim();
    const summary = document.getElementById('summary').value.trim();
    // حذفنا حقل الوصف الطويل لأننا نكتفي بالملخص
    const coverFile = document.getElementById('cover-file').files[0];
    const pdfFile = document.getElementById('pdf-file').files[0];

    // التحقق من الحقول المطلوبة
    if (!title || !author || !category || !summary) {
        statusText.textContent = 'خطأ: جميع الحقول مطلوبة';
        statusText.classList.add('text-red-500');
        statusDiv.classList.remove('hidden');
        return;
    }

    // التحقق من الملفات
    if (!coverFile || !pdfFile) {
        statusText.textContent = 'خطأ: الرجاء اختيار الغلاف وملف الكتاب أولاً.';
        statusText.classList.add('text-red-500');
        statusDiv.classList.remove('hidden');
        return;
    }

    // التحقق من نوع الملفات
    const allowedCoverTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    const allowedPdfTypes = ['application/pdf'];

    if (!allowedCoverTypes.includes(coverFile.type)) {
        statusText.textContent = 'خطأ: يجب أن يكون الغلاف بصيغة JPG أو PNG';
        statusText.classList.add('text-red-500');
        statusDiv.classList.remove('hidden');
        return;
    }

    if (!allowedPdfTypes.includes(pdfFile.type)) {
        statusText.textContent = 'خطأ: يجب أن يكون الكتاب بصيغة PDF';
        statusText.classList.add('text-red-500');
        statusDiv.classList.remove('hidden');
        return;
    }

    // التحقق من حجم الملفات (10MB للغلاف و 100MB للكتاب)
    if (coverFile.size > 10 * 1024 * 1024) {
        statusText.textContent = 'خطأ: حجم الغلاف يجب أن لا يتجاوز 10 ميجابايت';
        statusText.classList.add('text-red-500');
        statusDiv.classList.remove('hidden');
        return;
    }

    if (pdfFile.size > 100 * 1024 * 1024) {
        statusText.textContent = 'خطأ: حجم الكتاب يجب أن لا يتجاوز 100 ميجابايت';
        statusText.classList.add('text-red-500');
        statusDiv.classList.remove('hidden');
        return;
    }

    // إظهار مؤشر التحميل
    statusDiv.classList.remove('hidden');
    form.querySelector('button[type="submit"]').disabled = true;

    const errorDiv = document.getElementById('error-message');
    
    try {
        // إخفاء رسالة الخطأ السابقة إن وجدت
        errorDiv.classList.add('hidden');
        
        // تحضير بيانات الرفع
        const formData = new FormData();
        formData.append('cover', coverFile);
        formData.append('pdf', pdfFile);

        // تحديث النص والتقدم
        statusText.textContent = 'جاري رفع الغلاف...';
        progressBar.style.width = '25%';

        // رفع الملفات
        console.log('Uploading files:', {
            cover: coverFile.name,
            pdf: pdfFile.name
        });

        let res;
        try {
            res = await fetch('/.netlify/functions/upload', {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json'
                },
                credentials: 'same-origin'
            });
        } catch (networkError) {
            throw new Error('فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.');
        }

        if (!res.ok) {
            const errorText = await res.text().catch(() => res.statusText);
            throw new Error('فشل رفع الملفات: ' + errorText);
        }

        progressBar.style.width = '75%';
        statusText.textContent = 'جاري معالجة الملفات...';

        const uploadResult = await res.json();
        
        if (!uploadResult || !uploadResult.success || !uploadResult.cover || !uploadResult.pdf) {
            throw new Error('فشل استلام روابط الملفات المرفوعة');
        }

        progressBar.style.width = '100%';
        statusText.textContent = 'تم الرفع بنجاح!';

        // إنشاء كود الكتاب
        const id = 'book-' + Math.random().toString(36).substring(2, 9);
        const bookJSON = {
            id,
            title,
            author,
            category,
            summary,
            cover: uploadResult.cover,
            downloadUrl: uploadResult.pdf
        };

        // عرض الكود الناتج
        const outputDiv = document.getElementById('generated-code');
        const pre = outputDiv.querySelector('pre');
        pre.textContent = JSON.stringify(bookJSON, null, 4);
        outputDiv.classList.remove('hidden');

        // أضف الكتاب إلى الواجهة فوراً
        booksData.unshift(bookJSON);
        renderBooks();

        // إغلاق نافذة الإدخال بعد ثانية
        setTimeout(() => {
            document.getElementById('admin-upload').classList.add('hidden');
            // إعادة تعيين النموذج
            resetFormState(form, statusDiv, statusText, progressBar, errorDiv);
        }, 1000);

        // إظهار إشعار النجاح
        const alertBox = document.getElementById('success-alert');
        if (alertBox) {
            alertBox.classList.remove('hidden');
            setTimeout(() => alertBox.classList.add('hidden'), 2000);
        }
    } catch (err) {
        console.error('خطأ في الرفع:', err);
        
        // عرض رسالة الخطأ للمستخدم
        errorDiv.textContent = 'حدث خطأ: ' + (err.message || 'فشل رفع الملفات');
        errorDiv.classList.remove('hidden');
        
        // تحديث حالة النموذج
        statusText.textContent = 'فشل الرفع';
        statusText.classList.add('text-red-500');
        progressBar.classList.add('bg-red-500');
        
        // إعادة تمكين الزر
        form.querySelector('button[type="submit"]').disabled = false;
    }
}