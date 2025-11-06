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

    if (!coverFile || !pdfFile) {
        statusDiv.classList.remove('hidden');
        statusText.textContent = 'خطأ: الرجاء اختيار الغلاف وملف الكتاب أولاً.';
        statusText.classList.add('text-red-500');
        return;
    }

    // إظهار مؤشر التحميل
    statusDiv.classList.remove('hidden');
    form.querySelector('button[type="submit"]').disabled = true;

    try {
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

        const res = await fetch('/.netlify/functions/upload', {
            method: 'POST',
            body: formData,
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!res.ok) {
            throw new Error('فشل رفع الملفات: ' + res.statusText);
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
            form.reset();
            statusDiv.classList.add('hidden');
            progressBar.style.width = '0%';
            form.querySelector('button[type="submit"]').disabled = false;
        }, 1000);

        // إظهار إشعار النجاح
        const alertBox = document.getElementById('success-alert');
        if (alertBox) {
            alertBox.classList.remove('hidden');
            setTimeout(() => alertBox.classList.add('hidden'), 2000);
        }
    } catch (err) {
        console.error('خطأ في الرفع:', err);
        statusText.textContent = 'حدث خطأ: ' + err.message;
        statusText.classList.add('text-red-500');
        // إعادة تمكين الزر بعد الخطأ
        form.querySelector('button[type="submit"]').disabled = false;
    }
}