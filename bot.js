// bot.js - نسخه مناسب برای GitHub Actions
const fs = require('fs');
const path = require('path');

// تنظیمات
const BOT_TOKEN = '816023557:5vHkipUO5yquItXxCcvjORH6LpvJkXqxLoA';
const API_URL = `https://tapi.bale.ai/bot${BOT_TOKEN}/`;
const OFFSET_FILE = path.join(__dirname, 'last_update.txt');

// تابع لاگ
function log(msg, type = 'INFO') {
    const time = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    console.log(`[${time}] [${type}] ${msg}`);
}

// خواندن آخرین آپدیت پردازش شده از فایل
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

// ذخیره آخرین آپدیت پردازش شده
function saveLastUpdateId(updateId) {
    try {
        fs.writeFileSync(OFFSET_FILE, updateId.toString());
    } catch (error) {
        log(`خطا در ذخیره فایل آفست: ${error.message}`, 'ERROR');
    }
}

// دریافت آپدیت‌ها
async function getUpdates(offset) {
    const url = `${API_URL}getUpdates?offset=${offset}&timeout=5`; // تایم‌اوت کوتاه برای Actions
    
    try {
        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        log(`خطا در دریافت آپدیت: ${error.message}`, 'ERROR');
        return null;
    }
}

// ارسال پیام
async function sendMessage(chatId, text) {
    try {
        const response = await fetch(`${API_URL}sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text
            })
        });
        
        const result = await response.json();
        if (!result.ok) {
            log(`خطای API بله: ${result.description}`, 'ERROR');
        }
        return result;
    } catch (error) {
        log(`خطا در ارسال پیام: ${error.message}`, 'ERROR');
        return null;
    }
}

// پردازش پیام
async function processMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text || '';
    const name = msg.from?.first_name || 'ناشناس';
    
    log(`پیام از ${name} (${chatId}): ${text}`);
    
    if (text === '/start') {
        await sendMessage(chatId, `👋 سلام ${name}!\n✅ ربات فعال است (اجرا توسط GitHub Actions)`);
    } 
    else if (text === '/info') {
        await sendMessage(chatId, `🆔 Chat ID: \`${chatId}\``);
    } 
    else if (text === '/help') {
        await sendMessage(chatId, "📋 دستورات:\n/start\n/info\n/ping\n/help");
    } 
    else if (text === '/ping') {
        await sendMessage(chatId, "🏓 Pong! از GitHub Actions");
    } 
    else if (text.startsWith('/')) {
        await sendMessage(chatId, "❓ دستور نامعتبر");
    } 
    else {
        await sendMessage(chatId, `📝 نوشتید: ${text}\n_(پاسخ از GitHub Actions)_`);
    }
}

// تابع اصلی
async function main() {
    log("🚀 شروع اجرای ربات در GitHub Actions", 'SUCCESS');
    
    let lastUpdate = getLastUpdateId();
    log(`آخرین آپدیت پردازش شده: ${lastUpdate}`);
    
    const updates = await getUpdates(lastUpdate + 1);
    
    if (updates && updates.ok && updates.result && updates.result.length > 0) {
        log(`📨 ${updates.result.length} پیام جدید دریافت شد`, 'SUCCESS');
        
        for (const update of updates.result) {
            lastUpdate = update.update_id;
            
            if (update.message) {
                await processMessage(update.message);
            }
        }
        
        saveLastUpdateId(lastUpdate);
        log(`✅ آپدیت ${lastUpdate} ذخیره شد`, 'SUCCESS');
    } else {
        log("📭 پیام جدیدی وجود ندارد", 'INFO');
    }
    
    log("🏁 اجرای ربات به پایان رسید", 'SUCCESS');
}

// اجرا
main().catch(error => {
    log(`خطای مرگبار: ${error.message}`, 'ERROR');
    process.exit(1);
});
