// bot.js - نسخه بهینه برای GitHub Actions
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = '816023557:5vHkipUO5yquItXxCcvjORH6LpvJkXqxLoA';
const API_URL = `https://tapi.bale.ai/bot${BOT_TOKEN}/`;
const OFFSET_FILE = path.join(__dirname, 'last_update.txt');

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

async function getUpdates(offset) {
    // تایم‌اوت ۳۰ ثانیه - حداکثر زمان مجاز در Actions
    const url = `${API_URL}getUpdates?offset=${offset}&timeout=25`; 
    
    // استفاده از AbortController برای timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 28000);
    
    try {
        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            log('تایم‌اوت درخواست - طبیعی در Actions', 'WARN');
        } else {
            log(`خطا در دریافت آپدیت: ${error.message}`, 'ERROR');
        }
        return null;
    }
}

async function sendMessage(chatId, text) {
    try {
        const response = await fetch(`${API_URL}sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML'
            })
        });
        
        const data = await response.json();
        
        if (!data.ok) {
            log(`خطا در ارسال پیام: ${data.description}`, 'ERROR');
            return false;
        }
        
        return true;
    } catch (error) {
        log(`خطا در ارسال پیام: ${error.message}`, 'ERROR');
        return false;
    }
}

async function processUpdate(update) {
    if (!update.message || !update.message.text) return;
    
    const msg = update.message;
    const chatId = msg.chat.id;
    const text = msg.text;
    
    log(`پیام از ${chatId}: ${text}`);
    
    // منطق پاسخگویی
    let reply = '';
    if (text.includes('سلام')) {
        reply = 'سلام! چطور میتونم کمکت کنم؟ 👋';
    } else if (text.includes('ربات')) {
        reply = 'من یک ربات هستم که روی GitHub Actions اجرا میشم! 🤖';
    } else {
        reply = 'پیامت رو دریافت کردم: ' + text;
    }
    
    await sendMessage(chatId, reply);
}

async function main() {
    log('🚀 شروع اجرای ربات (GitHub Actions Mode)');
    
    const startTime = Date.now();
    const maxRunTime = 50000; // حداکثر ۵۰ ثانیه (کمتر از محدودیت ۶۰ ثانیه Actions)
    let lastUpdateId = getLastUpdateId();
    let processedCount = 0;
    
    // حلقه اصلی - تا زمانی که وقت هست ادامه بده
    while (Date.now() - startTime < maxRunTime) {
        log(`📥 دریافت آپدیت‌ها با offset: ${lastUpdateId}`);
        
        const result = await getUpdates(lastUpdateId);
        
        if (!result || !result.ok) {
            log('پاسخی دریافت نشد یا خطا در API', 'WARN');
            break;
        }
        
        const updates = result.result || [];
        
        if (updates.length === 0) {
            log('هیچ آپدیت جدیدی نیست');
            break; // اگر آپدیت نیست، از حلقه خارج شو
        }
        
        log(`📨 ${updates.length} آپدیت جدید دریافت شد`);
        
        for (const update of updates) {
            await processUpdate(update);
            lastUpdateId = Math.max(lastUpdateId, update.update_id + 1);
            processedCount++;
        }
        
        saveLastUpdateId(lastUpdateId);
        
        // اگر تعداد زیادی آپدیت هست، ادامه بده
        if (updates.length < 10) {
            break; // آپدیت‌ها تموم شده
        }
    }
    
    log(`✅ پایان اجرا - ${processedCount} پیام پردازش شد`);
    
    // حتماً آخرین آفست رو ذخیره کن
    saveLastUpdateId(lastUpdateId);
}

// اجرای اصلی با هندل کردن خطا
main().catch(error => {
    log(`❌ خطای بحرانی: ${error.message}`, 'ERROR');
    console.error(error.stack);
    process.exit(1);
});
