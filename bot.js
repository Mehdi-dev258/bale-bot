// bot.js - نسخه دانلودر یوتیوب برای بله (مناسب GitHub Actions)
const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');
const https = require('https');

const BOT_TOKEN = '816023557:5vHkipUO5yquItXxCcvjORH6LpvJkXqxLoA';
const API_URL = `https://tapi.bale.ai/bot${BOT_TOKEN}/`;
const OFFSET_FILE = path.join(__dirname, 'last_update.txt');

// --- توابع کمکی لاگ و آفست (بدون تغییر) ---
function log(msg, type = 'INFO') {
    const time = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    console.log(`[${time}] [${type}] ${msg}`);
}

function getLastUpdateId() {
    try {
        if (fs.existsSync(OFFSET_FILE)) {
            return parseInt(fs.readFileSync(OFFSET_FILE, 'utf8')) || 0;
        }
    } catch (error) {
        log(`خطا در خواندن فایل آفست: ${error.message}`, 'ERROR');
    }
    return 0;
}

function saveLastUpdateId(updateId) {
    try {
        fs.writeFileSync(OFFSET_FILE, updateId.toString());
    } catch (error) {
        log(`خطا در ذخیره فایل آفست: ${error.message}`, 'ERROR');
    }
}
// --- پایان توابع کمکی ---

// تابع ارسال فایل ویدیو به بله
async function sendVideo(chatId, filePath, caption = '') {
    try {
        const fileStream = fs.createReadStream(filePath);
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('video', fileStream);
        formData.append('caption', caption);

        const response = await fetch(`${API_URL}sendVideo`, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });
        
        const data = await response.json();
        if (!data.ok) {
            log(`خطا در ارسال ویدیو: ${data.description}`, 'ERROR');
            return false;
        }
        return true;
    } catch (error) {
        log(`خطا در ارسال فایل: ${error.message}`, 'ERROR');
        return false;
    }
}

// تابع اصلی پردازش آپدیت (با قابلیت دانلود)
async function processUpdate(update) {
    if (!update.message || !update.message.text) return;
    
    const msg = update.message;
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    log(`پیام از ${chatId}: ${text}`);

    // --- منطق جدید برای دانلود یوتیوب ---
    // چک کردن اینکه آیا لینک یوتیوب در متن وجود دارد یا خیر
    const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = text.match(youtubeRegex);

    if (match) {
        const videoId = match[1];
        const url = match[0];
        
        await sendMessage(chatId, `⏳ لینک یوتیوب شناسایی شد. در حال دریافت اطلاعات و دانلود...\nلینک: ${url}`);
        
        const videoPath = path.join(__dirname, `temp_${videoId}.mp4`);
        
        try {
            // 1. دانلود ویدیو با yt-dlp (بهترین کیفیت زیر 50MB برای رعایت محدودیت API بله)
            // نکته مهم برای GitHub Actions: باید yt-dlp در workflow نصب شده باشد.
            log(`شروع دانلود ویدیو با شناسه ${videoId}...`);
            
            // دستور yt-dlp با فرمت فشرده و محدودیت حجم (بله حداکثر 50MB قبول می‌کند)
            const command = `yt-dlp -f "best[height<=480][filesize<45M]/best[height<=480]/worst" --no-playlist -o "${videoPath}" ${url}`;
            
            execSync(command, { stdio: 'inherit', timeout: 40000 }); // حداکثر 40 ثانیه برای دانلود
            
            // 2. بررسی حجم فایل (امنیتی برای API بله)
            const stats = fs.statSync(videoPath);
            const fileSizeInMB = stats.size / (1024*1024);
            
            if (fileSizeInMB > 49) {
                await sendMessage(chatId, `❌ حجم ویدیو (${fileSizeInMB.toFixed(2)}MB) بیشتر از حد مجاز 50MB است.`);
                fs.unlinkSync(videoPath);
                return;
            }
            
            // 3. ارسال ویدیو به کاربر
            await sendVideo(chatId, videoPath, `🎬 ویدیوی درخواستی شما:\n${url}`);
            log(`✅ ویدیو با موفقیت ارسال شد.`);
            
            // 4. پاکسازی فایل موقت
            fs.unlinkSync(videoPath);
            
        } catch (error) {
            log(`خطا در پردازش ویدیو: ${error.message}`, 'ERROR');
            await sendMessage(chatId, `❌ متاسفانه دانلود ویدیو با خطا مواجه شد. ممکن است ویدیو طولانی یا حجم آن بالا باشد.\nخطا: ${error.message.substring(0, 100)}`);
            // اگر فایل نیمه‌کاره وجود داشت پاک کن
            if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        }
        
        return; // کار با این پیام تمام شد
    }

    // --- منطق پاسخگویی متنی قبلی ---
    let reply = '';
    if (text.includes('سلام')) {
        reply = 'سلام! لینک یوتیوب بفرست تا برات دانلود کنم. 👋';
    } else if (text.includes('ربات')) {
        reply = 'من ربات دانلودر یوتیوب هستم. لینک ویدیو رو بفرست. 🤖';
    } else {
        reply = 'لینک ویدیوی یوتیوب (youtube.com یا youtu.be) رو برام ارسال کن.';
    }
    
    await sendMessage(chatId, reply);
}

// تابع sendMessage (بدون تغییر عمده)
async function sendMessage(chatId, text) {
    try {
        const response = await fetch(`${API_URL}sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' })
        });
        const data = await response.json();
        if (!data.ok) log(`خطا در ارسال پیام: ${data.description}`, 'ERROR');
        return data.ok;
    } catch (error) {
        log(`خطا در ارسال پیام: ${error.message}`, 'ERROR');
        return false;
    }
}

// تابع getUpdates (بدون تغییر)
async function getUpdates(offset) {
    const url = `${API_URL}getUpdates?offset=${offset}&timeout=25`; 
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 28000);
    try {
        const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') log('تایم‌اوت درخواست - طبیعی در Actions', 'WARN');
        else log(`خطا در دریافت آپدیت: ${error.message}`, 'ERROR');
        return null;
    }
}

// تابع main (بدون تغییر)
async function main() {
    log('🚀 شروع اجرای ربات (GitHub Actions Mode + YouTube Downloader)');
    const startTime = Date.now();
    const maxRunTime = 55000; 
    let lastUpdateId = getLastUpdateId();
    let processedCount = 0;
    
    while (Date.now() - startTime < maxRunTime) {
        const result = await getUpdates(lastUpdateId);
        if (!result || !result.ok) break;
        const updates = result.result || [];
        if (updates.length === 0) break;
        
        log(`📨 ${updates.length} آپدیت جدید دریافت شد`);
        for (const update of updates) {
            await processUpdate(update);
            lastUpdateId = Math.max(lastUpdateId, update.update_id + 1);
            processedCount++;
        }
        saveLastUpdateId(lastUpdateId);
        if (updates.length < 10) break;
    }
    log(`✅ پایان اجرا - ${processedCount} پیام پردازش شد`);
    saveLastUpdateId(lastUpdateId);
}

main().catch(error => {
    log(`❌ خطای بحرانی: ${error.message}`, 'ERROR');
    console.error(error.stack);
    process.exit(1);
});
