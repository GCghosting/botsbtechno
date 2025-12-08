/**
 * Bot Telegram Pengurusan Telco Bersepadu (CelcomDigi NGA, Maxis, Digi, Celcom)
 * Versi Penuh dan Terstruktur.
 * * Sila pastikan anda telah memasang semua kebergantungan (dependencies):
 * npm install node-telegram-bot-api fs path axios moment form-data
 */

// --- KEPERLUAN (IMPORTS) ---
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const moment = require('moment');
const FormData = require('form-data');

// --- PENGKONFIGURASIAN UTAMA ---
const BOT_TOKEN = '8256123040:AAEIyWGF5rx4iGXPQiXKlXIwbnQMKrDUYD8'; // GANTI DENGAN TOKEN ANDA
const OWNER_ID = 'error109'; // ID Pemilik untuk Owner List
const ADMIN_IDS = [7001582342]; // GANTIKAN DENGAN ARRAY USER ID ADMIN
const SERVER_IMAGE = 'https://images.unsplash.com/photo-1553481187-be93c21490a9?auto=format&fit=crop&w=1400&q=80';
const DATA_DIR = path.join(__dirname, 'data');

// Tetapan fail data
const USER_ACCOUNTS_FILE = path.join(DATA_DIR, 'user_accounts.json');
const ACCESS_KEYS_FILE = path.join(DATA_DIR, 'keyaccess.txt');
const MOBILESHIELD_USERS_FILE = path.join(DATA_DIR, 'mobileshield_users.txt');
const TELEGRAM_USERS_FILE = path.join(DATA_DIR, 'userbot.txt'); // Untuk Broadcast

// Tetapan Global
const MAX_SPAM_COUNT = 60;
const SPAM_DELAY_MS = 17000;
const NOTIFICATION_BEFORE_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 Jam
const NOTIFICATION_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 Minit

let MAINTENANCE_MODE = false;

// State sementara pengguna (CelcomDigi NGA & Admin flow)
const userState = {};
// State sementara pengguna (Telco Lama / HTML Convert)
const userSession = {};

// --- INJELISASI (SETUP AWAL) ---
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// --- DATA PRODUK ADDON & FREEBIES ---
const CMP_RM1_DAILY_ID = 'CMP_132194'; // ID Produk Khas untuk RM1 Daily MI UL (CMP Offer)
const MOBILESHIELD_PRODUCT_ID = 90011270;
const MOBILESHIELD_SKU = '448296';
const MOBILESHIELD_PRICE_CENT = 1000; // RM10.00
const MOBILESHIELD_PRODUCT_DATA = {
    id: MOBILESHIELD_SKU,
    product_id: MOBILESHIELD_PRODUCT_ID,
    preferred_name: 'MobileSHIELD',
    name: 'MobileSHIELD',
    price: MOBILESHIELD_PRICE_CENT / 100,
    price_cent: MOBILESHIELD_PRICE_CENT,
    validity: '30 Hari',
    internet_quota: '1GB',
    telco_type: 2, // Digi
    isMobileShield: true,
    screenName: "lifestyle-offers",
    description: "lifestyle Subscription"
};

const MAXIS_FREEBIES_DATA = [
    { productId: 1145, title: "100GB 1-day (TikTok)", description: "RM1 100GB 1-day (TikTok)" },
    { productId: 1146, title: "100GB 1-day (Facebook)", description: "RM1 100GB 1-day (Facebook)" },
    { productId: 1147, title: "100GB 2-days (Facebook)", description: "RM2 100GB 2-days (Facebook)" },
    { productId: 1148, title: "100GB 2-days (TikTok)", description: "RM2 100GB 2-days (TikTok)" },
    { productId: 1149, title: "100GB 1-day (YouTube)", description: "RM1 100GB 1-day (YouTube)" },
    { productId: 1150, title: "100GB 2-days (YouTube)", description: "RM2 100GB 2-days (YouTube)" },
    { productId: 1151, title: "100GB 5-days (YouTube)", description: "RM3 100GB 5-days (YouTube)" }
];

const CELCOM_FREEBIES_DATA = [
    { id: "40943", title: "10GB Facebook", description: "10GB Facebook Freebies" },
    { id: "40944", title: "10GB Instagram", description: "10GB Instagram Freebies" },
    { id: "40945", title: "3GB YOUTUBE + 300MB IFLIX", description: "3GB YOUTUBE + 300MB IFLIX" },
    { id: "40946", title: "Unlimited WhatsApp, WeChat, Twitter, Imo", description: "Unlimited Social Freebies" }
];


// --- FUNGSI UTILITI DATA & AKSES ---

function isAdmin(userId) {
    return ADMIN_IDS.includes(userId);
}

function hasAccess(userId) {
    if (isAdmin(userId)) return true;
    const allAccounts = readAllAccounts();
    const userAccounts = allAccounts[userId];
    if (userAccounts) {
        for (const msisdn in userAccounts) {
            if (userAccounts[msisdn].has_access) {
                return true;
            }
        }
    }
    return false;
}

function normalizePhone(phone) {
    phone = phone.replace(/\D/g, '');
    if (phone.startsWith('60')) return phone;
    if (phone.startsWith('0')) return '60' + phone.substring(1);
    return '60' + phone;
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- FUNGSI PENGURUSAN DATA CELCOMDIGI NGA ---

function readAllAccounts() {
    try {
        if (fs.existsSync(USER_ACCOUNTS_FILE)) {
            const data = fs.readFileSync(USER_ACCOUNTS_FILE, 'utf8').trim();
            if (data) return JSON.parse(data);
        }
    } catch (e) {
        console.error(`Gagal baca/parse fail akaun: ${e.message}`);
    }
    return {};
}

function writeAllAccounts(allAccounts) {
    try {
        fs.writeFileSync(USER_ACCOUNTS_FILE, JSON.stringify(allAccounts, null, 2));
    } catch (e) {
        console.error(`Gagal tulis fail akaun: ${e.message}`);
    }
}

function getUserData(userId, msisdn) {
    const allAccounts = readAllAccounts();
    if (msisdn === '00000000000') return allAccounts[userId]?.[msisdn] || null; 
    return allAccounts[userId]?.[msisdn] || null;
}

function getUserAccounts(userId) {
    const allAccounts = readAllAccounts();
    const accounts = allAccounts[userId] || {};
    if (accounts['00000000000']) {
        const { '00000000000': temp, ...rest } = accounts;
        return rest;
    }
    return accounts;
}

function saveUserData(userId, msisdn, data) {
    const allAccounts = readAllAccounts();
    if (!allAccounts[userId]) allAccounts[userId] = {};
    const existingData = allAccounts[userId][msisdn] || {};
    const newAccessStatus = allAccounts[userId]['00000000000']?.has_access || existingData.has_access || false;
    
    const newData = { 
        ...existingData, 
        ...data, 
        has_access: newAccessStatus,
        last_updated: new Date().toISOString() 
    };
    
    allAccounts[userId][msisdn] = newData;
    
    if (msisdn !== '00000000000' && allAccounts[userId]['00000000000']) {
        allAccounts[userId][msisdn].has_access = allAccounts[userId]['00000000000'].has_access;
        delete allAccounts[userId]['00000000000']; 
    }
    
    writeAllAccounts(allAccounts);
}

function deleteUserData(userId, msisdn) {
    const allAccounts = readAllAccounts();
    if (allAccounts[userId] && allAccounts[userId][msisdn]) {
        delete allAccounts[userId][msisdn];
        
        const remainingKeys = Object.keys(allAccounts[userId]).filter(key => key !== '00000000000');
        
        if (remainingKeys.length === 0) {
            if (allAccounts[userId]['00000000000']?.has_access) {
            } else {
                 delete allAccounts[userId];
            }
        }
        
        writeAllAccounts(allAccounts);
        return true;
    }
    return false;
}

function getCookie(userId, msisdn) {
    return getUserData(userId, msisdn)?.cookie || null;
}

// --- FUNGSI PENGURUSAN KUNCI AKSES ---

function readAccessKeys() {
    try {
        if (fs.existsSync(ACCESS_KEYS_FILE)) {
            const data = fs.readFileSync(ACCESS_KEYS_FILE, 'utf8').trim();
            return data.split('\n').map(key => key.trim()).filter(key => key.length > 0);
        }
    } catch (e) {
        console.error(`Gagal baca fail kunci akses: ${e.message}`);
    }
    return [];
}

function writeAccessKeys(keysArray) {
    try {
        fs.writeFileSync(ACCESS_KEYS_FILE, keysArray.join('\n') + '\n');
    } catch (e) {
        console.error(`Gagal tulis fail kunci akses: ${e.message}`);
    }
}

function grantAccessToUser(userId) {
    const allAccounts = readAllAccounts();
    if (!allAccounts[userId]) {
        allAccounts[userId] = { '00000000000': { has_access: true, last_updated: new Date().toISOString() } };
    } else {
        let updated = false;
        for (const msisdn in allAccounts[userId]) {
            if (!allAccounts[userId][msisdn].has_access) {
                allAccounts[userId][msisdn].has_access = true;
                updated = true;
            }
        }
        if (Object.keys(allAccounts[userId]).filter(key => key !== '00000000000').length === 0) {
             allAccounts[userId]['00000000000'] = { has_access: true, last_updated: new Date().toISOString() };
             updated = true;
        }
        if (updated) {
            writeAllAccounts(allAccounts);
        }
    }
    writeAllAccounts(allAccounts);
}

function revokeAllUserAccess() {
    const allAccounts = readAllAccounts();
    let usersAffected = 0;
    
    for (const userId in allAccounts) {
        if (isAdmin(Number(userId))) continue; 
        
        let accessRevoked = false;
        
        for (const msisdn in allAccounts[userId]) {
            if (allAccounts[userId][msisdn].has_access === true) {
                allAccounts[userId][msisdn].has_access = false;
                accessRevoked = true;
            }
        }
        
        if (accessRevoked) {
            usersAffected++;
        }
    }
    
    writeAllAccounts(allAccounts);
    return usersAffected;
}

// --- FUNGSI PENGURUSAN MOBILESHIELD USER ---

function readMobileShieldUsers() {
    try {
        if (fs.existsSync(MOBILESHIELD_USERS_FILE)) {
            const data = fs.readFileSync(MOBILESHIELD_USERS_FILE, 'utf8').trim();
            return data.split('\n').map(id => id.trim()).filter(id => id.length > 0);
        }
    } catch (e) {
        console.error(`Gagal baca fail MobileSHIELD user: ${e.message}`);
    }
    return [];
}

function writeMobileShieldUsers(userIdsArray) {
    try {
        fs.writeFileSync(MOBILESHIELD_USERS_FILE, userIdsArray.join('\n') + '\n');
    } catch (e) {
        console.error(`Gagal tulis fail MobileSHIELD user: ${e.message}`);
    }
}

function isMobileShieldUser(userId) {
    if (isAdmin(Number(userId))) return true;
    const users = readMobileShieldUsers();
    return users.includes(String(userId));
}

function addMobileShieldUser(userId) {
    const users = readMobileShieldUsers();
    const userIdString = String(userId);
    if (!users.includes(userIdString)) {
        users.push(userIdString);
        writeMobileShieldUsers(users);
        return true;
    }
    return false;
}

function deleteMobileShieldUser(userId) {
    const users = readMobileShieldUsers();
    const userIdString = String(userId);
    const index = users.indexOf(userIdString);
    if (index > -1) {
        users.splice(index, 1);
        writeMobileShieldUsers(users);
        return true;
    }
    return false;
}

// --- FUNGSI PENGURUSAN USER TELEGRAM (BROADCAST) ---

function addUserToBot(userId) {
  let userIds = [];
  if (fs.existsSync(TELEGRAM_USERS_FILE)) {
    userIds = fs.readFileSync(TELEGRAM_USERS_FILE, 'utf-8').split('\n').filter(Boolean);
  }
  if (!userIds.includes(String(userId))) {
    fs.appendFileSync(TELEGRAM_USERS_FILE, userId + '\n');
  }
}

async function broadcastMessage(chatIdsArray, messageText, parseMode = 'Markdown') {
    let successCount = 0;
    let failedCount = 0;
    
    for (const chatId of chatIdsArray) {
        try {
            await bot.sendMessage(chatId, messageText, { parse_mode: parseMode });
            successCount++;
        } catch (e) {
            failedCount++;
        }
        await delay(300); 
    }
    return { successCount, failedCount };
}


// --- FUNGSI FORMATTING & UTILITY ---

function formatRMFromCent(cent) {
  if (typeof cent !== 'number') return 'N/A';
  return (cent / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQuota(value) {
  if (typeof value === "string" && value.toLowerCase() === "unlimited") return "unlimited";
  const num = Number(value);
  if (isNaN(num)) return value;
  if (num >= 1048576) return (num / 1024 / 1024).toFixed(2) + " GB";
  else if (num >= 1024) return (num / 1024).toFixed(2) + " MB";
  else return num + " KB";
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  try {
    const d = new Date(dateString);
    if (isNaN(d)) return dateString;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0'); 
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateString;
  }
}

// --- PENGKONFIGURASIAN HEADERS API ---

const DEVICE_HEADERS_BASE = {
  'Host': 'nga.celcomdigi.com',
  'content-type': 'application/json',
  'language': 'en',
  'deviceid': '0df748e13740bd94',
  'devicemodel': 'Infinix X6531B',
  'devicename': 'Infinix HOT',
  'devicebrand': 'Infinix',
  'deviceos': 'Android',
  'systemversion': '14',
  'apkversion': '1.0.8(11746)',
  'user-agent': 'okhttp/4.12.0',
  'accept-encoding': 'gzip',
};

const DEVICE_HEADERS_FOR_ADDONS = {
  ...DEVICE_HEADERS_BASE,
  'devicemodel': 'V2202',
  'devicename': 'V2202',
  'devicebrand': 'vivo',
  'deviceos': 'Android',
  'systemversion': '15',
  'screen': 'addon-internet-listing',
  'sentry-trace': 'b0ebe3a8bbad4514b1e5b2a52953abf6-8ed31dc38ab85a31-1',
  'baggage': 'sentry-environment=PRODUCTION,sentry-release=1.0.8-11746,sentry-public_key=469b09dfdb3510e0864c700e3676fc8c,sentry-trace_id=b0ebe3d5b7414514b1e5b2a52953abf6,sentry-sample_rate=1,sentry-transaction=InternetAddOns,sentry-sampled=true',
};

const DEVICE_HEADERS_FOR_CMP_OFFER = {
    ...DEVICE_HEADERS_BASE,
    'screen': '',
    'sentry-trace': '5c8ddb1154cd48b8a54937bade5d895b-9c86432b88f2f02b-1',
    'baggage': 'sentry-environment=PRODUCTION,sentry-release=1.0.8-11746,sentry-public_key=469b09dfdb3510e0864c700e3676fc8c,sentry-trace_id=5c8ddb1154cd48b8a54937bade5d895b,sentry-sample_rate=1,sentry-transaction=Explore,sentry-sampled=true',
};

const DEVICE_HEADERS_FOR_MOBILESHIELD = {
    ...DEVICE_HEADERS_BASE,
    'devicemodel': 'V2202',
    'devicename': 'V2202',
    'devicebrand': 'vivo',
    'deviceos': 'Android',
    'systemversion': '15',
    'screen': 'lifestyle-offers',
    'sentry-trace': '9e27c006d0484e599e6ff8d59f0f63b1-4191c94d0388656d-1',
    'baggage': 'sentry-environment=PRODUCTION,sentry-release=1.0.8-11746,sentry-public_key=469b09dfdb3510e0864c700e3676fc8c,sentry-trace_id=9e27c006d0484e599e6ff8d59f0f63b1,sentry-sample_rate=1,sentry-transaction=LifestyleOffers,sentry-sampled=true',
};


// --- FUNGSI NOTIFIKASI TAMAT TEMPOH ---

function updateNotificationDue(userId, msisdn, quotaName, durationHours = 24) {
    const expiryTimeMs = durationHours * 60 * 60 * 1000;
    const expectedExpiryTime = Date.now() + expiryTimeMs; 
    const notificationDueTime = expectedExpiryTime - NOTIFICATION_BEFORE_EXPIRY_MS;
    
    saveUserData(userId, msisdn, {
        expiryNotification: {
            quotaName: quotaName,
            notificationDue: new Date(notificationDueTime).toISOString(), 
            sent: false 
        }
    });
}

// Pastikan anda mempunyai akses kepada:
// bot (objek bot Telegram anda), axios, readUser, logSubscriptionHistory, 
// normalizeMsisdn, formatDate, DEVICE_HEADERS_BASE, userState (atau storage session anda).

/**
 * Menyemak dan memaparkan pilihan Extend Validity (Talktime Deno).
 * @param {object} bot Objek bot Telegram anda.
 * @param {number} chatId ID chat pengguna.
 * @param {string} msisdn Nombor telefon pengguna yang ingin diperiksa (sebaiknya sudah dinormalisasi).
 * @param {number} [messageId] ID Mesej sedia ada untuk disunting (jika dipanggil dari callback).
 */
async function handleCheckExtendValidity(bot, chatId, msisdn, messageId) {
  // Nota: Dalam bot generik, anda perlu pastikan MSISDN sudah dihantar dengan betul.
  // Logik mendapatkan MSISDN dari ctx.session atau ctx.callbackQuery telah DIBUANG.
  
  const ms = normalizeMsisdn(msisdn);
  if (!ms) {
    return bot.sendMessage(chatId, '❌ MSISDN tidak sah.');
  }

  const acct = readUser(ms);
  if (!acct || !acct.cookie) {
    const message = '⚠️ Sesi tamat, sila login semula.';
    const options = {
      reply_markup: { inline_keyboard: [[{ text: '🔑 Login OTP', callback_data: `request_otp_${ms}` }]] }
    };
    return bot.sendMessage(chatId, message, options);
  }

  try {
    const headers = {
      ...DEVICE_HEADERS_BASE,
      cookie: acct.cookie,
      msisdn: ms,
      dguardid: acct.last_login_resp?.data?.dguardProfile?.dguardId || '',
      dguardmsisdn: ms
    };

    const resp = await axios.get('https://nga.celcomdigi.com/offering/v1/talktimeDeno', { headers, validateStatus: () => true });
    const options = resp.data?.data || [];

    if (!options.length) {
      const message = `❌ Tiada pilihan Extend Validity tersedia untuk **${ms}**`;
      const opts = {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'dashboard' }]] }
      };
      
      // Jika dipanggil dari callback, sunting mesej, jika tidak, hantar mesej baru
      if (messageId) {
          return bot.editMessageText(message, { chat_id: chatId, message_id: messageId, ...opts });
      }
      return bot.sendMessage(chatId, message, opts);
    }

    let message = `**📆 Extend Validity untuk ${ms}**\n\nPilih tempoh untuk lanjutkan tempoh aktif SIM anda:`;
    const inlineKeyboard = [];

    options.forEach(item => {
      // Buat callback data untuk submission
      const callbackData = `extend_submit_${ms}_${item.amount}_${item.days_to_extend}`;
      
      message += `\n\n*${item.name}*`
      message += `\n  - *Tambahan:* +${item.days_to_extend} hari (hingga ${formatDate(item.newExpiryDate)})`
      message += `\n  - *Harga:* **RM${item.amount}**`;

      inlineKeyboard.push([
        { 
          text: `💳 RM${item.amount} (+${item.days_to_extend} Hari)`, 
          callback_data: callbackData 
        }
      ]);
    });
    
    inlineKeyboard.push([{ text: '⬅️ Kembali ke Dashboard', callback_data: 'dashboard' }]);

    const opts = {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard }
    };

    // Sunting mesej sedia ada jika ada messageId, jika tidak hantar mesej baru
    if (messageId) {
        return bot.editMessageText(message, { chat_id: chatId, message_id: messageId, ...opts });
    }
    return bot.sendMessage(chatId, message, opts);

  } catch (e) {
    console.error('extend_validity error (bot):', e.response?.data || e.message);
    const message = '❌ Gagal semak pilihan Extend Validity. Sila cuba lagi atau kembali ke dashboard.';
    const opts = {
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'dashboard' }]] }
    };
    if (messageId) {
        return bot.editMessageText(message, { chat_id: chatId, message_id: messageId, ...opts });
    }
    return bot.sendMessage(chatId, message, opts);
  }
}

/**
 * Memproses langganan Extend Validity (Talktime Extend).
 * @param {object} bot Objek bot Telegram anda.
 * @param {number} chatId ID chat pengguna.
 * @param {string} data Callback data (e.g., 'extend_submit_6019XXXXXXX_5_30').
 * @param {string} callbackQueryId ID callback query untuk memberi notifikasi (menggantikan ctx.answerCbQuery).
 * @param {number} messageId ID Mesej sedia ada untuk disunting.
 */
async function handleSubmitExtendValidity(bot, chatId, data, callbackQueryId, messageId) {
  const parts = data.split('_');
  
  if (parts.length < 5) { // Sekarang 5 bahagian: extend_submit, msisdn, amount, days
      bot.answerCallbackQuery(callbackQueryId, '❌ Ralat data callback.', true);
      return bot.sendMessage(chatId, '❌ Ralat data callback.');
  }

  const msisdn = parts[2];
  const deductionAmount = parts[3];
  const incrementDays = parts[4];
  
  // Menggantikan ctx.answerCbQuery
  if (callbackQueryId) {
      bot.answerCallbackQuery(callbackQueryId, 'Memproses langganan, sila tunggu...');
  }
  
  const acct = readUser(msisdn);
  if (!acct || !acct.cookie) {
    const message = '⚠️ Sesi tamat, sila login semula';
    const options = {
      reply_markup: { inline_keyboard: [[{ text: '🔑 Login OTP', callback_data: `request_otp_${msisdn}` }]] }
    };
    // Cuba sunting mesej sedia ada jika ada
    if (messageId) {
        return bot.editMessageText(message, { chat_id: chatId, message_id: messageId, ...options });
    }
    return bot.sendMessage(chatId, message, options);
  }
  
  try {
    const headers = {
      ...DEVICE_HEADERS_BASE,
      cookie: acct.cookie,
      msisdn: msisdn,
      dguardid: acct.last_login_resp?.data?.dguardProfile?.dguardId || '',
      dguardmsisdn: msisdn,
      'content-type': 'application/json'
    };

    const body = {
      deductionAmount: Number(deductionAmount),
      incrementDays: Number(incrementDays)
    };

    const resp = await axios.post('https://nga.celcomdigi.com/subscriber/v1/talktimeExtend', body, {
      headers,
      validateStatus: () => true
    });
    
    const expiry = resp.data?.data?.talktimeExtend?.expiryDate;
    const isSuccess = resp.data?.status === 'SUCCESS' || expiry;

    if (isSuccess) {
      const expiryText = expiry ? formatDate(expiry) : 'N/A';
      
      // LOG HISTORY: Extend Validity
      logSubscriptionHistory(msisdn, {
        type: 'Extend Validity',
        product_name: `Tambah ${incrementDays} Hari`,
        price: Number(deductionAmount),
        status: 'SUCCESS',
        details: `Luput Baru: ${expiryText}`,
        ref: `EXT-${Date.now()}`
      });
      
      const successMessage = `
**✅ Berjaya extend tempoh SIM!**

*Nombor:* **${msisdn}**
*Tambahan:* **${incrementDays} hari**
*Jumlah ditolak:* **RM${deductionAmount}**
*Tempoh baru tamat pada:* **${expiryText}**
      `.trim();
      
      const options = {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📜 Lihat History', callback_data: `history_${msisdn}` }],
            [{ text: '⬅️ Kembali ke Dashboard', callback_data: 'dashboard' }]
          ]
        }
      };
      
      // Sunting mesej sedia ada
      return bot.editMessageText(successMessage, { chat_id: chatId, message_id: messageId, ...options });
    }

    // Kalau tiada expiry & tiada status success
    const errorMessage = `
**❌ Gagal extend tempoh.**
*Nombor:* **${msisdn}**
*Respons:* \`\`\`json\n${JSON.stringify(resp.data, null, 2).substring(0, 500)}...\n\`\`\`
    `.trim();

    const options = {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'dashboard' }]] }
    };
    
    // Sunting mesej sedia ada
    return bot.editMessageText(errorMessage, { chat_id: chatId, message_id: messageId, ...options });

  } catch (e) {
    console.error('extend_validity_submit error (bot):', e.response?.data || e.message);
    const message = '❌ Ralat semasa proses extend. Sila cuba lagi.';
    const options = {
      reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'dashboard' }]] }
    };
    // Sunting mesej sedia ada
    return bot.editMessageText(message, { chat_id: chatId, message_id: messageId, ...options });
  }
}


async function expiryNotificationScheduler() {
    if (MAINTENANCE_MODE) return;

    const allAccounts = readAllAccounts();
    const now = Date.now();
    let checks = 0;
    let notificationsSent = 0;

    for (const userId in allAccounts) {
        const userAccounts = allAccounts[userId];
        for (const msisdn in userAccounts) {
            const userData = userAccounts[msisdn];
            if (msisdn === '00000000000') continue;
            
            const notificationInfo = userData.expiryNotification;

            if (notificationInfo && !notificationInfo.sent) {
                checks++;
                const notificationDue = new Date(notificationInfo.notificationDue).getTime();
                const chatId = userData.chatId;

                if (now >= notificationDue) {
                    if (chatId) {
                        const message = 
                            `⚠️ *PERHATIAN* ⚠️\n\n` +
                            `Langganan Quota *${notificationInfo.quotaName}* untuk nombor <code>${msisdn}</code> akan tamat tempoh dalam masa *kurang dari 2 jam*.\n\n` +
                            `Sila perbaharui langganan anda sekarang untuk mengelakkan gangguan!`;
                        
                        try {
                            await bot.sendMessage(chatId, message, { 
                                parse_mode: 'HTML',
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: '➕ Langgan Semula Sekarang', callback_data: `view_msisdn_${msisdn}` }]
                                    ]
                                }
                            });
                            notificationsSent++;
                            saveUserData(userId, msisdn, { expiryNotification: { ...notificationInfo, sent: true } });
                        } catch (e) {
                            saveUserData(userId, msisdn, { expiryNotification: { ...notificationInfo, sent: true } });
                        }
                    } else {
                        saveUserData(userId, msisdn, { expiryNotification: { ...notificationInfo, sent: true } });
                    }
                }
            }
        }
    }
}

// --- PENGENDALIAN API CELCOMDIGI ---

async function getCmpOffer(cookie) {
    try {
        const headers = { ...DEVICE_HEADERS_FOR_CMP_OFFER, 'cookie': cookie };
        const endpoint = 'https://nga.celcomdigi.com/offering/v1/cmpOffer?zone=NGCA%20Home';
        const response = await axios.get(endpoint, { headers });
        return response.data.data.data || [];
    } catch (e) {
        return [];
    }
}

async function processCmpOptIn(chatId, msisdn, productData, cookie, currentAttempt = 1, messageId = null) {
    const { campaignId, keyword, poId, name, price } = productData;
    const userId = userState[chatId]?.userId || msisdn; 
    
    const statusText = `⏳ Memproses langganan *${name}* (RM${Number(price).toFixed(2)})`;
    
    try {
        if (!messageId) {
            const newMessage = await bot.sendMessage(chatId, statusText, { parse_mode: 'Markdown' });
            messageId = newMessage.message_id;
        } else {
            await bot.editMessageText(statusText, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
        }
    } catch (e) {
        if (currentAttempt === 1) {
            const newMessage = await bot.sendMessage(chatId, statusText, { parse_mode: 'Markdown' });
            messageId = newMessage.message_id;
        }
    }

    try {
        const headers = { ...DEVICE_HEADERS_BASE, 'cookie': cookie };
        const payload = { campaignId: Number(campaignId), keyword: keyword, offerId: poId };
        const res = await axios.post('https://nga.celcomdigi.com/offering/v1/cmpOptIn', payload, { headers });
        
        if (res.status === 200 || res.status === 202) {
             const successMessage = `✅ *Langganan CMP Berjaya!* 🎉\nProduk: *${name}*\nSila semak SMS anda.`;
             if (chatId && messageId) {
                  await bot.editMessageText(successMessage, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
             }
             updateNotificationDue(userId, msisdn, name, 24); 
             return { status: 'success', reference: 'N/A' };
        } else {
            throw new Error(`Respons API tidak dijangka. Status: ${res.status}`);
        }
    } catch (e) {
        let errorMessage = `Ralat: ${e.message}`;
        if (e.response?.data?.data?.code === '1006') {
             errorMessage = '❌ GAGAL: Baki Kredit Tidak Mencukupi.';
        } else if (e.response?.data?.data?.message) {
             errorMessage = `❌ GAGAL: ${e.response.data.data.message}`;
        }
        
        if (chatId && messageId) { 
            const finalErrorMessage = `❌ *Gagal Langgan!* 😔\n${errorMessage}\nSila semak baki kredit atau cuba lagi.`;
            await bot.editMessageText(finalErrorMessage, { 
                chat_id: chatId, 
                message_id: messageId, 
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard' }]] }
            });
        }
        
        return { status: 'failed', message: errorMessage };
    }
}

async function processSubscription(chatId, userId, msisdn, productData, count = 1, currentAttempt = 1, messageId = null) {
    const { id, product_id, preferred_name, name, price, telco_type, isCmpOffer, validity, internet_quota, isMobileShield } = productData;
    const cookie = getCookie(userId, msisdn); 
    
    if (isCmpOffer) return processCmpOptIn(chatId, msisdn, productData, cookie, currentAttempt, messageId);
    
    // Logik Paparan Status Spam/Tunggal
    if (count > 1 || !messageId || chatId === null) { 
        if (chatId) {
            const statusText = (count > 1) 
                ? `🔥 Langganan Spam: *${preferred_name || name}* (RM${formatRMFromCent(price * 100)})\n⏳ Memproses *Percubaan ${currentAttempt} / ${count}*...`
                : `⏳ Memproses langganan untuk *${preferred_name || name}* (RM${formatRMFromCent(price * 100)})`;

            try {
                if (!messageId) {
                    const newMessage = await bot.sendMessage(chatId, statusText, { parse_mode: 'Markdown' });
                    messageId = newMessage.message_id;
                } else {
                    await bot.editMessageText(statusText, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
                }
            } catch (e) {
                 if (currentAttempt === 1) {
                    const newMessage = await bot.sendMessage(chatId, statusText, { parse_mode: 'Markdown' });
                    messageId = newMessage.message_id;
                 }
            }
        }
    }

    try {
        if (!cookie) throw new Error('Cookie hilang. Sila login semula.');

        // 1. POST /subscribe (Get paymentUrl) 
        const subscribePayload = {
            description: "Add on Purchase", paymentMethod: "CPA", userName: "Mad", userEmail: `${msisdn}@celcomdigi.com`, 
            msisdn: msisdn, network: (telco_type === 2) ? "DIGI" : "CELCOM", amount: price,
            skuName: preferred_name || name, sku: String(id), product_id: Number(product_id), override_addon: false,
            screenName: "addon-internet-submit", item_id: String(product_id), item_ngpcid: Number(id),
        };
        
        const subscribeHeaders = { ...DEVICE_HEADERS_BASE, 'Host': 'nga.celcomdigi.com', 'screen': 'addon-internet-submit', 'cookie': cookie };

        if (isMobileShield) {
             subscribeHeaders['dguardid'] = '8c9def93-a7d1-4c8e-b556-5840117083fd';
             subscribeHeaders['dguardmsisdn'] = msisdn;
             subscribeHeaders['screen'] = 'lifestyle-offers'; 
        }

        const resSubscribe = await axios.post('https://nga.celcomdigi.com/digipay/v1/subscribe', subscribePayload, { headers: subscribeHeaders });
        const paymentUrl = resSubscribe.data.data.paymentUrl;
        
        if (!paymentUrl) throw new Error("Gagal mendapatkan Payment URL.");

        // 2. GET paymentUrl (Handle 302) 
        const urlParts = new URL(paymentUrl);
        const paymentHeaders = {
            'Host': urlParts.host, 'user-agent': 'Mozilla/5.0 (Linux; Android 15; V2202 Build/AP3A.240905.015.A2; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.7339.207 Mobile Safari/537.36',
            'x-requested-with': 'com.celcomdigi.selfcare', 'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7', 'cookie': cookie, 
        };

        let htmlResponse = '';
        try {
            const resPayment = await axios.get(paymentUrl, { headers: paymentHeaders, maxRedirects: 0, validateStatus: (status) => status >= 200 && status < 400 });
            htmlResponse = resPayment.data;
        } catch (e) {
            if (e.response && e.response.status === 302) {
                htmlResponse = e.response.data;
            } else {
                throw e;
            }
        }
        
        const html = htmlResponse;
        const metaTagMatch = html.match(/url='([^']+)'/);
        
        if (!metaTagMatch || !metaTagMatch[1]) {
            if (count === 1 && chatId && messageId) { 
                 await bot.editMessageText(`✅ *Langganan Berjaya!* 🎉\nProduk: *${preferred_name || name}*\nSila semak SMS anda.`, 
                    { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
                );
            }
            const durationMatch = validity?.match(/(\d+)\s*(hour|day)/i);
            let durationHours = 24;
            if (durationMatch) {
                const num = parseInt(durationMatch[1]);
                if (durationMatch[2].toLowerCase() === 'day') durationHours = num * 24;
                else if (durationMatch[2].toLowerCase() === 'hour') durationHours = num;
            }
            updateNotificationDue(userId, msisdn, `${internet_quota} (${preferred_name || name})`, durationHours);
            
            return { status: 'success', reference: 'N/A' };
        }
        
        const callbackUrl = metaTagMatch[1].replace(/&amp;/g, '&');
        const paymentStatusMatch = callbackUrl.match(/payment_status=([^&]+)/i);
        const errorDescMatch = callbackUrl.match(/error_description=([^&]+)/i);
        
        const paymentStatus = paymentStatusMatch ? decodeURIComponent(paymentStatusMatch[1]) : 'Unknown';
        const errorDescription = errorDescMatch ? decodeURIComponent(errorDescMatch[1].replace(/\+/g, ' ')) : 'Unknown Error';

        if (paymentStatus === 'Fail') {
            let errorMsg = errorDescription.toLowerCase().includes('insufficient balance') 
                ? `❌ GAGAL: Baki Kredit Tidak Mencukupi! Sila Topup.`
                : `❌ GAGAL: ${errorDescription.substring(0, 100)}`;
            throw new Error(errorMsg);
        }
        
        // 3. GET final callback URL
        const callbackHeaders = { ...paymentHeaders, 'Host': 'nga.celcomdigi.com' };
        const resCallback = await axios.get(callbackUrl, { headers: callbackHeaders });
        
        const isSuccessFromResponse = resCallback.data.trim() === 'RECEIVEOK';

        if (isSuccessFromResponse) {
            if (count === 1 && chatId && messageId) { 
                await bot.editMessageText(`✅ *Langganan Berjaya Dikesan!* 🎉\nProduk: *${preferred_name || name}*`, 
                    { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
                );
            }
            const durationMatch = validity?.match(/(\d+)\s*(hour|day)/i);
            let durationHours = 24;
            if (durationMatch) {
                const num = parseInt(durationMatch[1]);
                if (durationMatch[2].toLowerCase() === 'day') durationHours = num * 24;
                else if (durationMatch[2].toLowerCase() === 'hour') durationHours = num;
            }
            updateNotificationDue(userId, msisdn, `${internet_quota} (${preferred_name || name})`, durationHours);

            return { status: 'success', reference: 'N/A' };
        } else {
            throw new Error(`Pengesahan akhir gagal. Respons: ${resCallback.data.trim()}.`);
        }

    } catch (e) {
        
        if (count === 1 && chatId && messageId) { 
            const errorMessage = `❌ *Gagal Langgan!* 😔\nRalat: ${e.message}\nSila semak baki kredit atau cuba lagi.`;
            await bot.editMessageText(errorMessage, { 
                chat_id: chatId, 
                message_id: messageId, 
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard' }]] }
            });
        }
        
        return { status: 'failed', message: e.message };
    }
}

async function runSpamLoop(chatId, userId, msisdn, productData, count) {
    let successCount = 0;
    let failedCount = 0;
    let messageId = null; 

    const initialMessage = await bot.sendMessage(chatId, 
        `🔥 Langganan Spam Dimulakan:\n*Produk:* ${productData.preferred_name || productData.name}\n*Jumlah:* ${count} kali\n\nMemproses...`, 
        { parse_mode: 'Markdown' }
    );
    messageId = initialMessage.message_id;

    for (let i = 1; i <= count; i++) {
        const result = await processSubscription(chatId, userId, msisdn, productData, count, i, messageId); 

        if (result.status === 'success') {
            successCount++;
        } else {
            failedCount++;
        }
        
        const statusMessage = 
            `🔥 Langganan Spam: *${productData.preferred_name || productData.name}*\n` +
            `✅ Berjaya: ${successCount}\n` +
            `❌ Gagal: ${failedCount}\n`;
            
        let nextAction = (i < count) 
            ? `⏳ Menunggu ${SPAM_DELAY_MS / 1000}s untuk *Percubaan ${i + 1} / ${count}*...`
            : `✅ Selesai memproses semua langganan.`;

        try {
            await bot.editMessageText(statusMessage + nextAction, { 
                chat_id: chatId, 
                message_id: messageId, 
                parse_mode: 'Markdown' 
            });
        } catch (e) {
            // Ignore edit error
        }

        if (i < count) {
            await delay(SPAM_DELAY_MS);
        }
    }
    
    const finalMessage = 
        `✅ *Proses Spam Selesai!*\n\n` +
        `Produk: *${productData.preferred_name || productData.name}*\n` +
        `Jumlah Percubaan: ${count}\n` +
        `Berjaya: *${successCount}* kali\n` +
        `Gagal: *${failedCount}* kali\n\n` +
        `Sila semak semula baki data anda.`;

    await bot.editMessageText(finalMessage, { 
        chat_id: chatId, 
        message_id: messageId, 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard' }]] }
    });
}

// --- FUNGSI TAMPILAN DASHBOARD CELCOMDIGI ---

async function displayDashboard(chatId, userId, msisdn) {
    // ... (Fungsi sama seperti sebelumnya) ...
  const cookie = getCookie(userId, msisdn);
  if (!cookie) {
    bot.sendMessage(chatId, 'Cookie tamat tempoh. Sila login semula untuk nombor ini.', {
         reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu Utama', callback_data: 'back_menu' }]] } 
    });
    // Hanya padam data jika user biasa, jika admin yang akses, jangan padam.
    if (!isAdmin(Number(userId)) || userId !== userState[chatId]?.userId) {
        deleteUserData(userId, msisdn); 
    }
    if (userState[chatId]) delete userState[chatId];
    return;
  }
  
  try {
    // Simpan MSISDN yang sedang aktif
    userState[chatId] = { userId: userId, msisdn: msisdn, step: 'dashboard_view' };
    
    // Jika Admin, tambah maklumat Admin
    let adminNote = '';
    if (isAdmin(Number(userId)) && userId !== String(getUserData(userId, msisdn)?.chatId)) {
        adminNote = '⚠️ *ANDA SEDANG MENGAKSES DASHBOARD SEBAGAI ADMIN.*\n\n';
    }


    const headers = { ...DEVICE_HEADERS_BASE, cookie };
    const userData = getUserData(userId, msisdn); 
    const renewStatus = userData?.autorenew?.status === 'active' ? `<b>✅ AKTIF (${userData.autorenew.productName})</b>` : '❌ TIDAK AKTIF';
    
    // 1. Dapatkan Maklumat Asas
    const dashBasic = await axios.get('https://nga.celcomdigi.com/subscriber', { headers });
    const data = dashBasic.data.data;
    
    // Simpan telco (jika belum ada) dan chatId untuk kegunaan scheduler (hanya jika bukan admin login)
    if (!isAdmin(Number(userId)) || userId === String(getUserData(userId, msisdn)?.chatId)) {
        // PENTING: Pastikan has_access juga disimpan
        saveUserData(userId, msisdn, { telco: data.telco, chatId: chatId, has_access: true });
    }

    // 2. Dapatkan Baki Kredit
    let balanceText = 'N/A';
    try {
        const balanceHeaders = { ...DEVICE_HEADERS_BASE, screen: 'dashboard-balance', cookie };
        const dashBalance = await axios.get('https://nga.celcomdigi.com/subscriber/v1/prepaid-balance/msisdn', { headers: balanceHeaders });
        const mainBalance = dashBalance.data.data.prepaidBalance.main[0];
        
        if (mainBalance && mainBalance.units === 'MYR') {
            balanceText = `RM ${Number(mainBalance.amount).toFixed(2)}`;
        }
    } catch (e) {
        console.warn('Gagal dapatkan baki kredit:', e.response?.data || e.message);
        balanceText = 'Gagal (Sila Cuba Lagi)';
    }
    
        // Logik Notifikasi Tamat Tempoh
    let notificationInfoText = '';
    const notifInfo = userData?.expiryNotification;
    if (notifInfo && !notifInfo.sent) {
        const dueTime = new Date(notifInfo.notificationDue).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });
        notificationInfoText = `\n\n🔔 *Notifikasi Tamat Tempoh:* Ditetapkan pada ${dueTime} (MSIA) untuk quota *${notifInfo.quotaName}*`;
    }    
    
    let message = adminNote;
    
    message +=
      `<b>📱 Maklumat Pelanggan</b>\n` +
      `Nombor: <code>${msisdn}</code>\n` +
      `Telco: ${data.telco}\n` +
      `Status: ${data.status}\n` +
      `<b>Kredit: ${balanceText}</b>\n` +
      `Name: ${data.subscriptions.primary[0]?.name || '-'}\n` +
      `Expired Date: ${formatDate(data.characteristic.lifeCycleInfo.terminationDate)}\n` +
      `${notificationInfoText}\n\n`;
      
    // 3. Dapatkan Penggunaan Data
    const dashUsage = await axios.get('https://nga.celcomdigi.com/account/v1/usage', { headers });
    const internetPlans = dashUsage.data.data.plan.internet || [];
    
    if (internetPlans.length === 0) {
      message += "Tiada maklumat Data ditemui.\n\n";
    } else {
      message += "<b>📶 Maklumat Data Anda:</b>\n";
      internetPlans.forEach((plan, index) => {
        message += `Plan #${index + 1}:\n` +
                   ` - Name: ${plan.plan}\n` +
                   ` - Quota: ${formatQuota(plan.total)}\n` +
                   ` - Balance: ${formatQuota(plan.balance)}\n` +
                   ` - Expiry: ${formatDate(plan.expiryDate)} (${plan.expiryText})\n\n`;
      });
    }
    
    await bot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '👑Langganan B0S & Lifestyle', callback_data: 'setup_renew_spam' }], 
          [{ text: '🔎 Check All Addons CelcomDigi', callback_data: 'check_all_addons' }], 
          [{ text: '📆 Extend Validity', callback_data: 'extend_cd_validity' }], 
          [{ text: '❌ Padam Nombor Ini (Logout)', callback_data: `delete_msisdn_${msisdn}` }], 
          [{ text: '🏠 Kembali ke Menu Utama', callback_data: 'back_menu' }]
        ]
      }
    });
  } catch (e) {
    console.error('Display dashboard error (API Utama):', e.response?.data || e.message);
    bot.sendMessage(chatId, 'Gagal papar dashboard. Cookie mungkin tamat tempoh. Sila login semula.', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu Utama', callback_data: 'back_menu' }]] } 
    });
    if (!isAdmin(Number(userId)) || userId !== userState[chatId]?.userId) {
        deleteUserData(userId, msisdn);
    }
    if (userState[chatId]) delete userState[chatId];
  }
}



// --- FUNGSI TAMPILAN DASHBOARD TELCO LAMA ---

// --- DIGI ---
async function getDigiAccountInfo(ssi, msisdn) {
    const url = "https://mydigiapp.digi.com.my/checkSession";
    const headers = {
        "Host": "mydigiapp.digi.com.my", "accept": "application/json", "deviceid": "random-device-id",
        "applicationversion": "14.0.11", "devicemodel": "V2202", "devicebrand": "vivo", "deviceversion": "14",
        "deviceos": "Android", "systemversion": "14", "appversion": "14.0.11.1102014615",
        "useragent": "Mozilla/5.0 (Linux; Android 14; V2202 Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/135.0.7049.38 Mobile Safari/537.36",
        "msisdin": msisdn, "language": "ms", "digiauth": ssi, "content-type": "application/json",
        "accept-encoding": "gzip", "cookie": `sid=${ssi}`, "user-agent": "okhttp/4.10.0"
    };
    const data = { msisdn };
    const response = await axios.post(url, data, { headers });
    let planName = 'N/A';
    let number = 'N/A';
    if (response.data?.data?.subscriberRecord) {
        const subscriber = response.data.data.subscriberRecord;
        number = subscriber.MSISDN || 'N/A';
        if (Array.isArray(subscriber.offersRecords)) {
            const primary = subscriber.offersRecords.find(o => o.Status === "ACTIVE" && o.OfferType === "PRIMARY");
            planName = primary ? primary.OfferName : 'N/A';
        }
    }
    return { number, planName };
}

async function getBillingInfo(ssi, msisdn) {
    const url = "https://mydigiapp.digi.com.my/api/usage";
    const headers = { "Host": "mydigiapp.digi.com.my", "digiauth": ssi, "accept-encoding": "gzip", "cookie": `sid=${ssi}`, "user-agent": "okhttp/4.10.0" };
    const response = await axios.get(url, { headers });
    const currentPlanDetails = response.data.data?.currentPlanDetails || {};
    const plans = [];
    ["voice", "internet"].forEach(category => {
        if (currentPlanDetails[category]) {
            currentPlanDetails[category].forEach(plan => {
                plans.push({ planDescription: plan.planDescription || "N/A", total: formatQuota(plan.total), balance: formatQuota(plan.balance), expiredDate: plan.expiredDate || "N/A", note: plan.note || "N/A" });
            });
        }
    });
    const hiddenQuota = [];
    const serviceRecords = response.data._data?.serviceRecords || [];
    serviceRecords.forEach(record => {
        if (record.QuotaList?.QuotaRecord) {
            record.QuotaList.QuotaRecord.forEach(q => {
                if (q.QuotaAttribute === 1) {
                    hiddenQuota.push({ description: q.Description || "N/A", total: formatQuota(q.Total), balance: formatQuota(q.Balance) });
                }
            });
        }
    });
    let credit = 'N/A';
    let creditExpiry = 'N/A';
    const balanceRecords = response.data._data?.balanceRecords || [];
    if (balanceRecords.length > 0) credit = formatRMFromCent(balanceRecords[0].Amount);
    if (balanceRecords.length > 2) creditExpiry = balanceRecords[2].AccountExpiryDate || 'N/A';
    return { plans, hiddenQuota, credit, creditExpiry };
}

function formatDashboardDigi(data) {
    let text = `📱 *Dashboard Digi*\n\n`;
    text += `> *Nombor:* \`${data.number}\`\n`;
    text += `> *Plan:* ${data.planName}\n`;
    text += `> *Kredit:* RM ${data.credit}\n`;
    text += `> *Expired:* ${formatDate(data.creditExpiry)}\n\n`;
    text += `*Maklumat Plan Digi:*\n`;
    if (!data.plans || data.plans.length === 0) {
        text += `> Tiada maklumat plan.\n`;
    } else {
        data.plans.forEach(plan => {
            text += `> • *${plan.planDescription}*\n`;
            text += `>   └ Total: ${plan.total}\n`;
            text += `>   └ Baki: ${plan.balance}\n`;
            text += `>   └ Tamat: ${formatDate(plan.expiredDate)}\n\n`;
        });
    }
    text += `*Hidden Quota Digi:*\n`;
    if (!data.hiddenQuota || data.hiddenQuota.length === 0) {
        text += `> Tiada hidden quota.\n`;
    } else {
        data.hiddenQuota.forEach(q => {
            text += `> • ${q.description}\n`;
            text += `>   └ Total: ${q.total}\n`;
            text += `>   └ Baki: ${q.balance}\n\n`;
        });
    }
    return text.trim();
}

// --- MAXIS ---

const MAXIS_API_HEADERS = {
    "channel": "hra",
    "x-api-key": "08bdedcf-6757-4c96-8efa-dbea297b0946",
    "x-apigw-api-id": "a8pdjulkwe",
    "content-type": "application/json",
    "user-agent": "okhttp/4.11.0",
    "clientversion": "5.19.0"
};

async function refreshMaxisTokenByFile(phone) {
    const cleanPhone = normalizePhone(phone);
    const outputFile = path.join(DATA_DIR, `${cleanPhone}.maxis.txt`);
    if (!fs.existsSync(outputFile)) return null;

    const content = fs.readFileSync(outputFile, 'utf8');
    const lines = content.split('\n');
    let msisdn = null, authorization = null, cookie = null, accountNumber = null;
    for (const line of lines) {
        if (line.startsWith('msisdn:')) msisdn = line.split(':')[1].trim();
        else if (line.startsWith('Authorization:')) authorization = line.split(':')[1].trim();
        else if (line.startsWith('Didsession:')) cookie = line.split(':')[1].trim();
        else if (line.startsWith('AccountNumber:')) accountNumber = line.split(':')[1].trim();
    }
    if (!cookie) return null;

    const headers = { ...MAXIS_API_HEADERS, "cookie": cookie };
    try {
        const response = await axios({
            method: 'post',
            url: 'https://api-digital.maxis.com.my/prod/api/v4.0/users/token?redirectUrl=https%3A%2F%2Fselfserve.hotlink.com.my%2Fms%2Fauth&brand=HOTLINK&type=OPENAM&clientId=HOTLINKPORTAL&languageId=0',
            headers: headers
        });
        if (!response.data.responseData) return null;

        const token = response.data.responseData.access_token;
        const accno = response.data.responseData.account[0].accountNo;
        const refreshedMsisdn = response.data.responseData.account[0].subscriptions[0].msisdn;
        const userData = `msisdn: ${refreshedMsisdn}\nAccountNumber: ${accno}\nAuthorization: ${token}\nDidsession: ${cookie}\n`;
        fs.writeFileSync(outputFile, userData);
        return { token, accno, msisdn: refreshedMsisdn, cookie };
    } catch (error) {
        return null;
    }
}

async function maxisSendOtp(phone) {
    const url = `https://api-digital.maxis.com.my/prod/api/v4.0/users/otp?languageId=1&msisdn=${phone}`;
    const response = await axios.get(url, { headers: MAXIS_API_HEADERS });
    if (!response.data.responseData) throw new Error('Gagal hantar OTP Maxis.');
    return response.data.responseData.processId;
}

async function maxisVerifyOtp(phone, processId, otp) {
    const url = `https://api-digital.maxis.com.my/prod/api/v4.0/users/otp?languageId=1&msisdn=${phone}`;
    const headers = { ...MAXIS_API_HEADERS, 'content-type': 'application/json' };
    const data = { processId, otp, cookie: "AWSALB=Q4YaQ9mRZZe4eDcnfWA8/SAPlERgXRmOmHOcqUPJJis/co83prJo9IBXNt73rgWvfsQgRv5ZG6Og6U46E0VUl/eZw57XNR2Fn7VzjjBLY1aeEGz7hhuNTVackjth;" };
    const response = await axios.put(url, data, { headers });
    if (response.data.status === 'fail' || !response.data.responseData) throw new Error('OTP salah atau gagal login Maxis.');
    return response.data.responseData.cookie;
}

async function maxisGetDashboard(token, msisdn) {
    const dataUrl = `https://api-digital.maxis.com.my/prod/api/v5.0/account/balance/data?languageId=1&msisdn=${msisdn}`;
    const headers = {
        ...MAXIS_API_HEADERS, "authorization": token, "rateplanid": "67", "clientapikey": "h0tl1nk@pp!",
        "accept": "application/vnd.maxis.v2+json", "rateplanboid": "57313918", "accept-encoding": "gzip",
        "user-agent": "okhttp/4.12.0", "platform": "android"
    };
    const dataResponse = await axios.get(dataUrl, { headers });
    const responseData = dataResponse.data.responseData || {};
    const creditUrl = `https://api-digital.maxis.com.my/prod/api/v5.0/account/balance/credit?languageId=1&msisdn=${msisdn}&extraOpt=segment`;
    const creditResponse = await axios.get(creditUrl, { headers });
    const creditData = creditResponse.data.responseData || {};
    return {
        msisdn,
        dataBalance: {
            balance: responseData.balance ? (responseData.balance / 1024).toFixed(2) + ' GB' : 'N/A',
            expiry: responseData.expiry ? moment(responseData.expiry).format('DD-MM-YYYY HH:mm:ss') : 'N/A',
            total: responseData.total ? (responseData.total / 1024).toFixed(2) + ' GB' : 'N/A'
        },
        details: responseData.details ? responseData.details.map(detail => ({
            name: detail.name || 'N/A',
            balance: detail.baseQuota ? detail.baseQuota.balanceText : 'N/A',
            expiry: detail.expiry ? moment(detail.expiry).format('DD-MM-YYYY HH:mm:ss') : 'N/A'
        })) : [],
        focData: responseData.focDataDetail ? {
            name: responseData.focDataDetail.name || 'N/A',
            balance: responseData.focDataDetail.balanceText || 'N/A',
            renewal: responseData.focDataDetail.renewalDate ? moment(responseData.focDataDetail.renewalDate).format('DD-MM-YYYY HH:mm:ss') : 'N/A'
        } : null,
        creditInfo: {
            balance: creditData.balance ? (creditData.balance / 100).toFixed(2) + ' RM' : 'N/A',
            expiry: creditData.expiry ? moment(creditData.expiry).format('DD-MM-YYYY HH:mm:ss') : 'N/A',
            ratePlanName: creditData.accountInfo ? creditData.accountInfo.ratePlanName : 'N/A',
            accountStatus: creditData.accountStatus || 'N/A',
            graceExpiry: creditData.graceExpiry ? moment(creditData.graceExpiry).format('DD-MM-YYYY HH:mm:ss') : 'N/A'
        }
    };
}

async function extendValidityMaxis1(msisdn, token) {
    try {
        const url = `https://api-digital.maxis.com.my/prod/api/v1.0/topup/extendvalidity?languageId=1&msisdn=${msisdn}`;
        const headers = {
            "Host": "api-digital.maxis.com.my:4463", "channel": "HRA", "authorization": token, "clientapikey": "h0tl1nk@pp!",
            "content-type": "application/json; charset=utf-8", "accept": "application/vnd.maxis.v2+json",
            "languageid": "1", "x-api-key": "08bdedcf-6757-4c96-8efa-dbea297b0946", "rateplanboid": "57313918",
            "accept-encoding": "gzip", "user-agent": "okhttp/4.12.0", "x-apigw-api-id": "a8pdjulkwe",
            "clientversion": "5.31.1", "platform": "android"
        };
        const res = await axios.post(url, {}, { headers });
        if (res.data && (res.data.statusCode === 0 || res.data.status === 'SUCCESS')) {
            return { success: true, message: JSON.stringify(res.data, null, 2) };
        }
        return { success: false, message: JSON.stringify(res.data, null, 2) };
    } catch (e) {
        return { success: false, message: e.response?.data ? JSON.stringify(e.response.data, null, 2) : e.message };
    }
}

function formatDashboardMaxis(data) {
    let text = `📱 *Dashboard Maxis*\n\n`;
    text += `> *Nombor:* \`${data.msisdn}\`\n`;
    text += `> *Plan:* ${data.creditInfo.ratePlanName}\n`;
    text += `> *Kredit:* ${data.creditInfo.balance}\n`;
    text += `> *Expired:* ${data.creditInfo.expiry}\n`;
    text += `> *Status Akaun:* ${data.creditInfo.accountStatus}\n\n`;
    text += `*Maklumat Data Maxis:*\n`;
    if (!data.details || data.details.length === 0) {
        text += `> Tiada maklumat data.\n`;
    } else {
        data.details.forEach(detail => {
            text += `> • *${detail.name}*\n`;
            text += `>   └ Baki: ${detail.balance}\n`;
            text += `>   └ Tamat: ${detail.expiry}\n\n`;
        });
    }
    if (data.focData) {
        text += `*FOC Data:*\n`;
        text += `> • ${data.focData.name}\n`;
        text += `>   └ Baki: ${data.focData.balance}\n`;
        text += `>   └ Renewal: ${data.focData.renewal}\n\n`;
    }
    return text.trim();
}

// --- CELCOM ---

async function refreshCelcomTokenByFile(phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    const outputFile = path.join(DATA_DIR, `${cleanPhone}.celcom.txt`);
    if (!fs.existsSync(outputFile)) return null;
    const content = fs.readFileSync(outputFile, 'utf8');
    const lines = content.split('\n');
    let msisdn = null, idToken = null, refreshToken = null;
    for (const line of lines) {
        if (line.startsWith('msisdn:')) msisdn = line.split(':')[1].trim();
        else if (line.startsWith('id token:')) idToken = line.split(':')[1].trim();
        else if (line.startsWith('refreshToken:')) refreshToken = line.split(':')[1].trim();
    }
    if (!refreshToken) return null;
    try {
        const firebaseHeaders = { "Content-Type": "application/json" };
        const firebaseData = { "grant_type": "refresh_token", "refresh_token": refreshToken };
        const firebaseResp = await axios.post(
            'https://securetoken.googleapis.com/v1/token?key=AIzaSyAY_xgPxtljMmsFPn8NFDyN7S-eeqzI4Io',
            firebaseData,
            { headers: firebaseHeaders }
        );
        const newIdToken = firebaseResp.data.id_token;
        const newRefreshToken = firebaseResp.data.refresh_token;
        const userData = `msisdn: ${msisdn}\nid token: ${newIdToken}\nrefreshToken: ${newRefreshToken}\n`;
        fs.writeFileSync(outputFile, userData);
        return { msisdn, idToken: newIdToken, refreshToken: newRefreshToken };
    } catch (error) {
        return null;
    }
}

async function getCelcomDashboard(msisdn, idToken) {
    let formattedMsisdn = msisdn;
    if (msisdn.startsWith('60')) formattedMsisdn = '0' + msisdn.substring(2);

    const billingHeaders = {
        "Accept": "application/json", "deviceModel": "V2202", "Content-Type": "application/json",
        "Authorization": idToken, "msisdn": formattedMsisdn, "appVersion": "3.0.70",
        "deviceId": "2f66e7c375ed06f4", "os": "android", "buildNumber": "200843",
        "Accept-Charset": "UTF-8", "User-Agent": "Dalvik/2.1.0 (Linux; Android 14; V2202 Build/UP1A.231005.007)",
        "Host": "apicl3.celcom.com.my", "Connection": "Keep-Alive", "Accept-Encoding": "gzip"
    };

    const billingUrl = "https://apicl3.celcom.com.my/home-view/home-data/balance";
    const billingParams = { "isInitialRequest": "true", "lang": "en" };
    const billingResponse = await axios.get(billingUrl, { headers: billingHeaders, params: billingParams });
    const duePayment = billingResponse.data.duePayment || {};

    let addOnPacks = [];
    try {
        const usageUrl = "https://apicl3.celcom.com.my/subscriber-usage-info/v2/local";
        const usageParams = { "lang": "en", "isB40RedeemChecked": "true", "is1GBRedeemCheck": "false" };
        const usageResponse = await axios.get(usageUrl, { headers: billingHeaders, params: usageParams });
        if (usageResponse.status === 200 && usageResponse.data.statusCode !== 500) {
            const usageData = usageResponse.data;
            if (usageData.internet?.addOnPacks) {
                addOnPacks = usageData.internet.addOnPacks;
            }
        }
    } catch (e) {}
    return {
        msisdn: formattedMsisdn, lineStatus: duePayment.lineStatus || 'N/A', balance: duePayment.balance || 'N/A',
        plan: duePayment.planName || 'N/A', expiryDate: duePayment.payBefore ? formatDate(duePayment.payBefore) : 'N/A',
        addOnPacks
    };
}

async function subscribeUnlimitedCall(msisdn, idToken, price, productKey) {
    try {
        const headers = {
            "x-dynatrace": "MT_3_16_1522471433_8-0_e9ba6289-2990-4491-bb2c-bc8c2d6c256b_0_577_684", "Accept": "application/json",
            "msisdn": msisdn, "Content-Type": "application/json", "Authorization": idToken, "appVersion": "3.0.67",
            "buildNumber": "200809", "os": "android", "screenDensity": "1x", "Accept-Charset": "UTF-8",
            "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 10; 23078RKD5C Build/TKQ1.221114.001)",
            "Host": "apicl3.celcom.com.my", "Connection": "Keep-Alive", "Accept-Encoding": "gzip"
        };
        const transactAddon = price === "1.00" ? "call-RM1" : "call-RM3";
        const payload = {
            "msisdn": msisdn, "planName": "Base Plan Meta High Speed", "price": price, "productId": "2060377",
            "productKey": productKey, "personaliseAdobeInfo": { "transact_product": "", "transact_product_addons": `${transactAddon}|null|null`,
            "transact_pid": "2060377", "transact_value": price }, "resubscribeFlag": false, "predefinedFlag": false
        };
        const apiUrl = "https://apicl3.celcom.com.my/plans-and-add-ons-mgmt/meta/metaMaxupPurchase?lang=en";
        const response = await axios.post(apiUrl, payload, { headers });
        if (response.status === 200) {
            return { success: true, message: response.data.message || "Langganan berjaya" };
        } else {
            return { success: false, message: `Gagal melanggan: ${response.data.message || "Ralat tidak diketahui"}` };
        }
    } catch (error) {
        return { success: false, message: `Ralat: ${error.message}` };
    }
}

async function extendValidity(formattedMsisdn, idToken, productId) {
  try {
    const headers = {
      'content-type': 'application/json', 'Host': 'apicl3.celcom.com.my', 'Authorization': idToken,
      'x-dynatrace': 'MT_3_14_1938539898_77-0_e9ba6289-2990-4491-bb2c-bc8c2d6c256b_0_8362_1181',
      'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 10; NX729J Build/KOT49H)',
      'Accept-Encoding': 'gzip', 'Connection': 'Keep-Alive', 'Accept': 'application/json',
    };
    const data = { "subscriberNo": formattedMsisdn, "productId": productId };
    const response = await axios.post(
      'https://apicl3.celcom.com.my/subscriber-billing-info/billing/extendValidity?lang=en',
      data, { headers: headers }
    );
    if (response.data.statusCode === 0) {
      return { success: true, message: response.data.statusDesc || "Tempoh sah sim berjaya dilanjutkan" };
    } else {
      return { success: false, message: response.data.statusDesc || "Gagal melanjutkan tempoh sah sim" };
    }
  } catch (error) {
    return { success: false, message: 'Ralat: ' + error.message };
  }
}

function formatDashboardCelcom(data) {
    let text = `📱 *Dashboard Celcom*\n\n`;
    text += `> *Nombor:* \`${data.msisdn}\`\n`;
    text += `> *Plan:* ${data.plan}\n`;
    text += `> *Baki:* ${data.balance}\n`;
    text += `> *Expired:* ${data.expiryDate}\n`;
    text += `> *Status Line:* ${data.lineStatus}\n\n`;
    text += `*Add-on/Quota:*\n`;
    if (!data.addOnPacks || data.addOnPacks.length === 0) {
        text += `> Tiada maklumat quota.\n`;
    } else {
        data.addOnPacks.forEach(q => {
            text += `> • ${q.headerName}\n`;
            text += `>   └ Baki: ${q.balanceQuotaMegaByte || 'N/A'} MB\n`;
            text += `>   └ Total: ${q.totalQuotaMegaByte || 'N/A'} MB\n`;
            text += `>   └ Tamat: ${formatDate(q.expireDate)}\n\n`;
        });
    }
    return text.trim();
}


// --- FUNGSI UTILITY LAIN ---

async function convertHtmlToWeb(htmlCode) {
  const form = new FormData();
  form.append('htmlFile', Buffer.from(''), { filename: '' });
  form.append('htmlCode', htmlCode);

  try {
    const response = await axios.post(
      'https://htmlviewermrsb.gleeze.com/preview',
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Origin': 'https://htmlviewermrsb.gleeze.com',
          'Referer': 'https://htmlviewermrsb.gleeze.com/'
        }
      }
    );
    return response.data.id;
  } catch (err) {
    return null;
  }
}


// --- PENGENDALIAN MENU UTAMA & SUB MENU ---

function mainMenu(chatId, userId, firstName) {
    const caption =
        `👋 Selamat datang, <a href="tg://user?id=${userId}">${firstName}</a> (ID: <code>${userId}</code>).\n\n` +
        `Sila pilih Telco di bawah:\n` +
        `<b>━━━━━━━━━━━━━━━━━━━</b>\n` +
        `<b>[CELCOM DIGI (NGA)]</b>\n` +
        ` •  Untuk nombor Celcom & Digi (melalui *sistem baharu*).\n` +
        ` •  Bot akan AutoUpdate Notification 2jam sebelum langganan tamat.\n\n` +
        `<b>[TELCO LAMA]</b>\n` +
        ` •  <b>DIG1 (Digi Sahaja):</b> Check *Hidden Data* & maklumat kredit.\n` +
        ` •  <b>CELC0M (Celcom Sahaja):</b> Langgan *Panggilan/Data Freebies* & *Extend Validity*.\n` +
        ` •  <b>MAX1S (Maxis Sahaja):</b> Langgan *Data Freebies*, *Extend Validity* & *Redeem Giveaway*.\n` +
        `<b>━━━━━━━━━━━━━━━━━━━</b>\n\n` +
        `<ins>Bot masih dalam fasa *pengujian*. Sila laporkan isu kepada Admin @SynxByte :</ins>\n` +
        `<b>Status Bot:</b> ${MAINTENANCE_MODE ? '❌ MAINTENANCE MODE' : '✅ ONLINE'}`;

    let buttons = [
        [{ text: 'CELCOM Digi (Baru)', callback_data: 'menu_telco' }], 
        [{ text: 'TELCO DIG1 (Digi Sahaja)', callback_data: 'check_digi' }, { text: 'TELCO MAX1S (Maxis Sahaja)', callback_data: 'check_maxis' }], 
        [{ text: 'TELCO CELC0M (Celcom Sahaja)', callback_data: 'check_celcom' }]
    ];

    if (isAdmin(Number(userId))) {
        buttons.push([{ text: '🔑 Menu Admin', callback_data: 'admin_menu' }]); 
        buttons.push([{ text: '📢 Broadcast Message', callback_data: 'admin_broadcast_start' }]); 
    }

    const options = {
        caption: caption,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    };

    if (SERVER_IMAGE) {
        bot.sendPhoto(chatId, SERVER_IMAGE, options)
           .catch(e => {
               delete options.caption;
               bot.sendMessage(chatId, caption, options);
           });
    } else {
        delete options.caption;
        bot.sendMessage(chatId, caption, options);
    }
}

function digiMenu(chatId) {
    bot.sendMessage(chatId, 'Pilih menu Digi:', {
        reply_markup: {
            inline_keyboard: [
                [ { text: 'Nombor Telefon Baru', callback_data: 'digi_login_new' }, { text: 'Guna Nombor Sedia Ada', callback_data: 'digi_login_existing' } ],
             //   [ { text: 'Owner List', callback_data: 'digi_owner' } ], 
                [ { text: '⬅️ Kembali ke Menu', callback_data: 'back_menu' } ]
            ]
        }
    });
}

function maxisMenu(chatId) {
    bot.sendMessage(chatId, 'Pilih menu Maxis:', {
        reply_markup: {
            inline_keyboard: [
                [ { text: 'Nombor Telefon Baru', callback_data: 'maxis_login_new' }, { text: 'Guna Nombor Sedia Ada', callback_data: 'maxis_login_existing' } ],
             //   [ { text: 'Owner List', callback_data: 'maxis_owner' } ],
                [ { text: '⬅️ Kembali ke Menu', callback_data: 'back_menu' } ]
            ]
        }
    });
}

function celcomMenu(chatId) {
    bot.sendMessage(chatId, 'Pilih menu Celcom:', {
        reply_markup: {
            inline_keyboard: [
                [ { text: 'Nombor Telefon Baru', callback_data: 'celcom_login_new' }, { text: 'Guna Nombor Sedia Ada', callback_data: 'celcom_login_existing' } ],
            //    [ { text: 'Owner List', callback_data: 'celcom_owner' } ],
                [ { text: '⬅️ Kembali ke Menu', callback_data: 'back_menu' } ]
            ]
        }
    });
}


// --- PENGENDALIAN PERINTAH BOT ---

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = Number(msg.from.id);
    const firstName = msg.from.first_name || 'User';

    addUserToBot(userId); 

    if (MAINTENANCE_MODE && !isAdmin(userId)) {
        return bot.sendMessage(chatId, '🚧 *Bot sedang dalam penyelenggaraan (Maintenance Mode).* Sila cuba lagi sebentar nanti.', { parse_mode: 'Markdown' });
    }

    if (!isAdmin(userId) && !hasAccess(userId)) {
        userState[chatId] = { step: 'access_key_wait', userId: String(userId) };
        return bot.sendMessage(chatId, 
            '⚠️ *Sila masukkan Key Access Bot yang diterima dari Admin* untuk meneruskan:', 
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '❌ Batal / Menu Utama', callback_data: 'back_menu' }]
                    ]
                }
            }
        );
    }

    mainMenu(chatId, String(userId), firstName);
});


// --- PENGENDALIAN CALLBACK QUERY ---

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;
    const userId = String(query.from.id);
    const session = userSession[chatId]; 
    
    // SEMAK MAINTENANCE MODE & KUNCI AKSES
    if (MAINTENANCE_MODE && !isAdmin(Number(userId)) && data !== 'back_menu') {
        try { await bot.deleteMessage(chatId, messageId); } catch {}
        return bot.sendMessage(chatId, '🚧 *Bot sedang dalam penyelenggaraan (Maintenance Mode).* Sila cuba lagi sebentar nanti.', { parse_mode: 'Markdown' });
    }
    
    if (!isAdmin(Number(userId)) && !hasAccess(Number(userId)) && data !== 'back_menu') {
        try { await bot.deleteMessage(chatId, messageId); } catch {}
        return; 
    }

    try { await bot.deleteMessage(chatId, messageId); } catch (e) {}

    // >>> LOGIK MENU UTAMA (CELCOMDIGI & UMUM) <<<

    if (data === 'back_menu') {
        if (userState[chatId]) delete userState[chatId];
        if (userSession[chatId]) delete userSession[chatId];
        mainMenu(chatId, userId, query.from.first_name || 'User');
        return;
    }
    
    // --- Handlers Menu Utama CelcomDigi ---
    else if (data === 'menu_telco') {
        const userAccounts = getUserAccounts(userId);
        const hasAccounts = userAccounts && Object.keys(userAccounts).length > 0;
        
        const menuButtons = [[{ text: '➕ Nombor Telefon Baru (Request Otp)', callback_data: 'nombor_baru' }]];
        if (hasAccounts) {
            menuButtons.push([{ text: '📋 Guna Nombor Sedia Ada', callback_data: 'senarai_nombor' }]);
        }
        menuButtons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'back_menu' }]);
        
        bot.sendMessage(chatId, 'Pilih salah satu:', { reply_markup: { inline_keyboard: menuButtons } });
    } 
    else if (data === 'nombor_baru') {
        userState[chatId] = { userId: userId, step: 'minta_msisdn' };
        bot.sendMessage(chatId, 'Sila masukkan nombor telefon Celcom/Digi (contoh: 60123456789):', {
            reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'menu_telco' }]] }
        });
    } 
    else if (data === 'senarai_nombor') {
        const userAccounts = getUserAccounts(userId);
        if (!userAccounts || Object.keys(userAccounts).length === 0) {
            return bot.sendMessage(chatId, 'Anda tiada nombor sedia ada yang didaftarkan. Sila tambah nombor baru.', { reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'menu_telco' }]] } });
        }
        
        let message = '📞 *Nombor Telefon Sedia Ada*:\n\nSila pilih nombor untuk lihat dashboard:';
        const buttons = Object.keys(userAccounts).filter(msisdn => msisdn !== '00000000000').map(msisdn => {
            const telco = userAccounts[msisdn].telco || 'N/A';
            return [{ text: `${msisdn} - ${telco}`, callback_data: `view_msisdn_${msisdn}` }];
        });
        buttons.push([{ text: '🔙 Kembali ke Pilihan Login', callback_data: 'menu_telco' }]);
        
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
    }
    else if (data && data.startsWith('view_msisdn_')) {
        const msisdn = data.replace('view_msisdn_', '');
        const userData = getUserData(userId, msisdn);
        
        if (!userData?.cookie) {
            bot.sendMessage(chatId, 'Cookie untuk nombor ini telah luput. Sila login dengan OTP semula.');
            deleteUserData(userId, msisdn);
            return;
        }
        
        userState[chatId] = { userId: userId, msisdn: msisdn, step: 'dashboard_view' };
        bot.sendMessage(chatId, `Memuatkan dashboard untuk ${msisdn}...`);
        await displayDashboard(chatId, userId, msisdn);
    }
    else if (data === 'dashboard') {
        const msisdn = userState[chatId]?.msisdn;
        const targetUserId = userState[chatId]?.userId || userId; 
        
        if (msisdn) {
            await displayDashboard(chatId, targetUserId, msisdn); 
        } else {
            bot.sendMessage(chatId, 'Sila pilih nombor sedia ada atau login semula.');
            mainMenu(chatId, userId, query.from.first_name || 'User'); 
        }
    } 

    // --- Handlers Telco Lama ---
    else if (data === 'check_digi') {
        userSession[chatId] = { telco: 'digi', state: 'menu' };
        digiMenu(chatId);
    }
    else if (data === 'check_maxis') {
        userSession[chatId] = { telco: 'maxis', state: 'menu' };
        maxisMenu(chatId);
    }
    else if (data === 'check_celcom') {
        userSession[chatId] = { telco: 'celcom', state: 'menu' };
        celcomMenu(chatId);
    }
    else if (data === 'digi_login_new') { userSession[chatId] = { telco: 'digi', state: 'await_phone' }; bot.sendMessage(chatId, 'Masukkan nombor telefon Digi (cth: 60123456789):', { reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Digi Menu', callback_data: 'check_digi' }]] } }); }
    else if (data === 'digi_login_existing') { userSession[chatId] = { telco: 'digi', state: 'await_existing' }; bot.sendMessage(chatId, 'Masukkan nombor telefon Digi yang pernah anda daftar:', { reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Digi Menu', callback_data: 'check_digi' }]] } }); }
    else if (data === 'digi_owner') { userSession[chatId] = { telco: 'digi', state: 'await_owner' }; bot.sendMessage(chatId, 'Masukkan ID owner Digi untuk akses:', { reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Digi Menu', callback_data: 'check_digi' }]] } }); }
    
    else if (data === 'maxis_login_new') { userSession[chatId] = { telco: 'maxis', state: 'await_phone' }; bot.sendMessage(chatId, 'Masukkan nombor telefon Maxis (cth: 60123456789):', { reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]] } }); }
    else if (data === 'maxis_login_existing' || data === 'back_maxis_dashboard') {
        const s = userSession[chatId];
        const dashCtx = s?.lastMaxisDash || (s?.maxis ? { token: s.maxis.token, msisdn: s.maxis.msisdn } : null);
        
        if (data === 'back_maxis_dashboard' && dashCtx?.msisdn) {
            // Re-render dashboard
        }
        userSession[chatId] = { telco: 'maxis', state: 'await_existing' };
        bot.sendMessage(chatId, 'Masukkan nombor telefon Maxis yang pernah anda daftar:', { reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]] } });
    }
    else if (data === 'maxis_owner') { userSession[chatId] = { telco: 'maxis', state: 'await_owner' }; bot.sendMessage(chatId, 'Masukkan ID owner Maxis untuk akses:', { reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]] } }); }
    else if (data === 'maxis_extend_validity_1') {
        const s = userSession[chatId];
        if (!s || !s.maxis || !s.maxis.token || !s.maxis.msisdn) { bot.sendMessage(chatId, 'Sesi Maxis tamat. Sila /start semula.'); return; }
        bot.sendMessage(chatId, 'Memproses Extend Validity 1 Hari...');
        try {
            const response = await extendValidityMaxis1(s.maxis.msisdn, s.maxis.token);
            bot.sendMessage(chatId, `✅ Berjaya extend validity: ${response.message}`, { reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_maxis_dashboard' }]] } });
        } catch (e) {
            bot.sendMessage(chatId, `❌ Ralat Extend Validity: ${e.message}`);
        }
    }
    else if (data === "maxisredeemgiveaway") { bot.sendMessage(chatId, "Sila masukkan kod giveaway anda:"); userSession[chatId].state = "awaitmaxisgiveawaycode"; }
    else if (data.startsWith('maxis_freebies_')) {
        const idx = parseInt(data.split('_')[2]);
        const freebies = MAXIS_FREEBIES_DATA[idx];
        userSession[chatId].pendingFreebies = idx;
        bot.sendMessage(chatId, `*Adakah anda berminat untuk melanggan ${freebies.title}?*`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [ [ { text: 'Teruskan Langganan', callback_data: `maxis_confirm_${idx}` } ], [ { text: '⬅️ Kembali ke Dashboard', callback_data: 'back_maxis_dashboard' } ] ] } });
    }
    else if (data.startsWith('maxis_confirm_')) {
        const idx = parseInt(data.split('_')[2]);
        const freebies = MAXIS_FREEBIES_DATA[idx];
        const s = userSession[chatId];
        if (!s || !s.maxis || !s.maxis.token || !s.maxis.msisdn) { bot.sendMessage(chatId, 'Sesi Maxis tamat. Sila /start semula.'); return; }
        try {
            const url = "https://app-nlb.hotlink.com.my:4443/api/v5.0/purchase/product";
            const postData = { "amount": 100, "productId": freebies.productId, "maxisId": "57586198", "isProductFromMaxisApi": false, "provisionType": 6 };
            const headers = { "Accept": "application/vnd.maxis.v2+json", "clientApiKey": "h0tl1nk@pp!", "Content-Type": "application/json", "token": s.maxis.token };
            const response = await axios.post(url, postData, { headers });
            const transactionId = response.data.transactionId;
            bot.sendMessage(chatId, `✅ Langganan *${freebies.title}* berjaya!\nTransaction ID: \`${transactionId || 'Tidak tersedia'}\``, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_maxis_dashboard' }]] } });
        } catch (e) {
            bot.sendMessage(chatId, `❌ Gagal langgan ${freebies.title}.\n${e.message}`, { reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_maxis_dashboard' }]] } });
        }
    }

    else if (data === 'celcom_login_new') { userSession[chatId] = { telco: 'celcom', state: 'await_phone' }; bot.sendMessage(chatId, 'Masukkan nombor telefon Celcom (cth: 60123456789):'); }
    else if (data === 'celcom_login_existing' || data === 'back_celcom_dashboard') {
        const s = userSession[chatId];
        if (s?.celcom?.idToken && s?.celcom?.msisdn) { /* ... re-render dashboard ... */ }

        userSession[chatId] = { telco: 'celcom', state: 'await_existing' };
        bot.sendMessage(chatId, 'Masukkan nombor telefon Celcom yang pernah anda daftar:');
    }
    else if (data === 'celcom_owner') { userSession[chatId] = { telco: 'celcom', state: 'await_owner' }; bot.sendMessage(chatId, 'Masukkan ID owner Celcom untuk akses:'); }
    else if (data === 'celcom_unlimited_call') { bot.sendMessage(chatId, 'Pilih pelan Unlimited Call:', { reply_markup: { inline_keyboard: [ [{ text: 'Langgan RM1 (5 hari)', callback_data: 'celcom_call_rm1' }, { text: 'Langgan RM3 (30 hari)', callback_data: 'celcom_call_rm3' } ], [{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }] ] } }); }
    else if (data === 'celcom_call_rm1' || data === 'celcom_call_rm3') {
        const s = userSession[chatId];
        if (!s || !s.celcom || !s.celcom.idToken || !s.celcom.msisdn) { bot.sendMessage(chatId, 'Sesi Celcom tamat. Sila /start semula.'); return; }
        const msisdn = s.celcom.msisdn.startsWith('60') ? '0' + s.celcom.msisdn.substring(2) : s.celcom.msisdn;
        const price = data === 'celcom_call_rm1' ? "1.00" : "3.00";
        const productKey = data === 'celcom_call_rm1' ? "VORM1" : "VORM3";
        bot.sendMessage(chatId, 'Memproses langganan Unlimited Call...');
        try {
            const result = await subscribeUnlimitedCall(msisdn, s.celcom.idToken, price, productKey);
            bot.sendMessage(chatId, result.message, { reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }]] } });
        } catch (e) { bot.sendMessage(chatId, 'Ralat semasa langgan Unlimited Call.'); }
    }
    else if (data === 'celcom_extend_validity') { bot.sendMessage(chatId, 'Pilih tempoh lanjutan SIM:', { reply_markup: { inline_keyboard: [ [{ text: 'Extend 1 Hari - RM1', callback_data: 'celcom_extend_1d' }], [{ text: 'Extend 3 Hari - RM2', callback_data: 'celcom_extend_3d' }], [{ text: 'Extend 15 Hari - RM8', callback_data: 'celcom_extend_15d' }], [{ text: 'Extend 180 Hari - RM54', callback_data: 'celcom_extend_180d' }], [{ text: 'Pakej Rahmah 180 Hari - RM30', callback_data: 'celcom_extend_rahmah' }], [{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }] ] } }); }
    else if (data === 'celcom_extend_1d' || data === 'celcom_extend_3d' || data === 'celcom_extend_15d' || data === 'celcom_extend_180d') {
        const s = userSession[chatId];
        if (!s || !s.celcom || !s.celcom.idToken || !s.celcom.msisdn) { bot.sendMessage(chatId, 'Sesi Celcom tamat. Sila /start semula.'); return; }
        const productIdMap = { 'celcom_extend_1d': '1', 'celcom_extend_3d': '2', 'celcom_extend_15d': '3', 'celcom_extend_180d': '4' };
        const productId = productIdMap[data];
        bot.sendMessage(chatId, 'Memproses lanjutan tempoh sah SIM...');
        try {
            const result = await extendValidity(s.celcom.msisdn, s.celcom.idToken, productId);
            bot.sendMessage(chatId, result.message, { reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }]] } });
        } catch (e) { bot.sendMessage(chatId, 'Ralat semasa lanjutan tempoh sah SIM.'); }
    }
    else if (data === 'celcom_extend_rahmah') {
        const s = userSession[chatId];
        if (!s || !s.celcom || !s.celcom.idToken || !s.celcom.msisdn) { bot.sendMessage(chatId, 'Sesi Celcom tamat. Sila /start semula.'); return; }
        bot.sendMessage(chatId, 'Memproses Pakej Rahmah...');
        try {
            const msisdn = s.celcom.msisdn.startsWith('60') ? '0' + s.celcom.msisdn.slice(2) : s.celcom.msisdn;
            const dataBody = {
                productId: "2060452", planType: "Monthly", accountType: "Prepaid", planName: "Pakej Rahmah Siswa 30GB",
                productVolume: "30 GB + High Speed", headerTitle: "Pakej Rahmah", totalAmount: 30, requestType: "INDIVIDUAL_PRODUCT ",
                type: "Addons", offerId: "2060452", personaliseAdobeInfo: { transact_pid: "2060452", transact_value: 30 }
            };
            const headers = {
                "Accept": "application/json", "msisdn": msisdn, "Content-Type": "application/json", "Authorization": s.celcom.idToken,
                "appVersion": "3.0.71", "buildNumber": "200866", "os": "android", "screenDensity": "1x", "Accept-Charset": "UTF-8",
                "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 14; Infinix X6531B Build/UP1A.231005.007)",
                "Host": "apicl3.celcom.com.my", "Connection": "Keep-Alive", "Accept-Encoding": "gzip"
            };
            const response = await axios.post('https://apicl3.celcom.com.my/plans-and-add-ons-mgmt/addOns/purchase/latest?lang=en', dataBody, { headers });
            if (response.data?.statusCode === 0) {
                bot.sendMessage(chatId, '✅ Pakej Rahmah 180 Hari berjaya diaktifkan!', { reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }]] } });
            } else {
                bot.sendMessage(chatId, `❌ Gagal aktifkan Pakej Rahmah.\n${response.data.statusDesc || ''}`, { reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }]] } });
            }
        } catch (e) { bot.sendMessage(chatId, `❌ Ralat semasa proses Rahmah: ${e.message}`, { reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }]] } }); }
    }
    else if (data.startsWith('celcom_freebies_')) {
        const idx = parseInt(data.split('_')[2]);
        const freebies = CELCOM_FREEBIES_DATA[idx];
        userSession[chatId].pendingFreebies = idx;
        bot.sendMessage(chatId, `*Adakah anda berminat untuk tebus ${freebies.title}?*`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [ [ { text: 'Teruskan Tebus', callback_data: `celcom_confirm_${idx}` } ], [ { text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' } ] ] } });
    }
    else if (data.startsWith('celcom_confirm_')) {
        const idx = parseInt(data.split('_')[2]);
        const freebies = CELCOM_FREEBIES_DATA[idx];
        const s = userSession[chatId];
        if (!s || !s.celcom || !s.celcom.idToken || !s.celcom.msisdn) { bot.sendMessage(chatId, 'Sesi Celcom tamat. Sila /start semula.'); return; }
        try {
            const msisdn = s.celcom.msisdn.startsWith('60') ? '0' + s.celcom.msisdn.substring(2) : s.celcom.msisdn;
            const headers = { "Content-Type": "application/json", "Authorization": s.celcom.idToken }; // Simplified headers
            const dataPost = { msisdn: msisdn, freebieProductId: freebies.id };
            const response = await axios.post('https://apicl3.celcom.com.my/plans-and-add-ons-mgmt/freebies/active?lang=en', dataPost, { headers });
            if (response.data && response.data.statusCode === 0) {
                bot.sendMessage(chatId, `✅ Tebusan *${freebies.title}* berjaya!`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }]] } });
            } else {
                bot.sendMessage(chatId, `❌ Gagal tebus ${freebies.title}.\n${response.data.message || ''}`, { reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }]] } });
            }
        } catch (e) { bot.sendMessage(chatId, `❌ Gagal tebus ${freebies.title}.\n${e.message}`, { reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }]] } }); }
    }
    
    // --- Logik CelcomDigi Addons/Spam/Delete ---
    else if (data && data.startsWith('delete_msisdn_')) {
        const msisdnToDelete = data.replace('delete_msisdn_', '');
        let targetUserId = userId;
        const allAccounts = readAllAccounts();
        for(const uid in allAccounts) { if (allAccounts[uid][msisdnToDelete]) { targetUserId = uid; break; } }
        
        deleteUserData(targetUserId, msisdnToDelete);
        if (userState[chatId] && userState[chatId].msisdn === msisdnToDelete) { delete userState[chatId]; }
        
        bot.sendMessage(chatId, `✅ Nombor <code>${msisdnToDelete}</code> (UserID: <code>${targetUserId}</code>) telah dipadam dari senarai. Anda telah logout.`, { 
            parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Login / Daftar Nombor', callback_data: 'menu_telco' }]] }
        });
    }
    else if (data === 'setup_renew_spam') {
        const msisdn = userState[chatId]?.msisdn;
        const targetUserId = userState[chatId]?.userId || userId;
        if (!msisdn) return bot.sendMessage(chatId, 'Sila login dahulu sebelum check addons.', { reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu Utama', callback_data: 'back_menu' }]] } });
        const cookie = getCookie(targetUserId, msisdn);
        if (!cookie) { bot.sendMessage(chatId, 'Cookie tamat tempoh. Sila login semula.', { reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu Utama', callback_data: 'back_menu' }]] } }); deleteUserData(targetUserId, msisdn); return; }

        bot.sendMessage(chatId, 'Memuatkan addons untuk Langganan Sekali/Spam...'); 

        const addonHeaders = { ...DEVICE_HEADERS_FOR_ADDONS, 'cookie': cookie };
        const endpoint = 'https://nga.celcomdigi.com/offering/v1/addons?category=internet';
        
        try {
            const response = await axios.get(endpoint, { headers: addonHeaders });
            const resData = response.data.data;
            
            const cmpOffers = await getCmpOffer(cookie);
            
            // Cari tawaran RM1 Daily yang spesifik
            const rm1DailyOffer = cmpOffers.find(o => o.name === 'RM1 Daily MI UL (1 Day)' && o.price === 1);
            
            const allProducts = {}; 
            let message = '📦 *Langganan Sekali & Spam Addons*\n\n'; 
            const buttons = [];
            const filteredProducts = [];
            
            if (isMobileShieldUser(Number(targetUserId))) {
                const mshieldData = MOBILESHIELD_PRODUCT_DATA;
                message += `• *${mshieldData.preferred_name}*\n  Price: RM 0.00\n  Quota: ${mshieldData.internet_quota}\n  Expiry: ${mshieldData.validity}\n\n`;
                buttons.push([
                    { text: `➕ Langgan Sekali (${mshieldData.preferred_name})`, callback_data: `subscribe_addon_${mshieldData.id}` },
                    { text: `🚀 Langgan SPAM (${mshieldData.preferred_name})`, callback_data: `spam_addon_start_${mshieldData.id}` }
                ]);
                allProducts[mshieldData.id] = mshieldData;
            }
            
            // Tambah RM1 Daily Offer (jika ada) - ini adalah yang spesifik
            if (rm1DailyOffer) {
                const productData = {
                    id: CMP_RM1_DAILY_ID, product_id: CMP_RM1_DAILY_ID, preferred_name: rm1DailyOffer.name, name: rm1DailyOffer.name,
                    price: rm1DailyOffer.price, price_cent: rm1DailyOffer.price * 100, validity: '1 Day', internet_quota: 'Unlimited',
                    isCmpOffer: true, campaignId: rm1DailyOffer.campaignId, keyword: rm1DailyOffer.keyword, poId: rm1DailyOffer.poId,
                };
                filteredProducts.push(productData);
                allProducts[CMP_RM1_DAILY_ID] = productData;
            }

            // **********************************************
            // * LOGIK BARU UNTUK SEMUA TAWARAN getCmpOffer *
            // **********************************************
            
            const addedCmpIds = new Set(rm1DailyOffer ? [CMP_RM1_DAILY_ID] : []); // Untuk elak duplikasi
            
            cmpOffers.forEach((cmpOffer, index) => {
                const productId = `CMP_OFFER_${index + 1}`; // ID sementara untuk setiap tawaran CMP
                
                // Elak tawaran RM1 Daily yang sudah ditambah
                if (cmpOffer.name === 'RM1 Daily MI UL (1 Day)' && cmpOffer.price === 1) return;
                
                // Cipta objek produk untuk tawaran CMP
                const productData = {
                    id: productId, product_id: productId, preferred_name: cmpOffer.name, name: cmpOffer.name,
                    price: cmpOffer.price, price_cent: cmpOffer.price * 100, validity: cmpOffer.validity || 'N/A', 
                    internet_quota: cmpOffer.internetQuota || 'N/A', isCmpOffer: true, 
                    campaignId: cmpOffer.campaignId, keyword: cmpOffer.keyword, poId: cmpOffer.poId,
                    // Tambahkan ID ke set untuk rujukan kemudian
                    original_id: productId 
                };
                
                // Tambah jika belum ada
                if (!addedCmpIds.has(productId)) {
                    filteredProducts.push(productData);
                    allProducts[productId] = productData;
                    addedCmpIds.add(productId);
                }
            });
            
            // ****************************************************
            // * TAMAT LOGIK BARU UNTUK SEMUA TAWARAN getCmpOffer *
            // ****************************************************
            
            for (const catKey in resData) {
                const category = resData[catKey];
                if (typeof category === 'object' && category !== null && category.products) {
                    category.products.forEach(prod => {
                        const priceCent = prod.price_cent || (prod.price * 100); 
                        const quotaDisplay = prod.internet_quota || 'N/A';
                        const isRM12_30D = priceCent === 1200 && quotaDisplay.includes('100GB') && prod.validity?.includes('30');
                        const isRM1_24H = priceCent === 100 && quotaDisplay.includes('100GB') && prod.validity?.includes('24');
                        const isFreebie = priceCent === 0 && (quotaDisplay.includes('2GB') || quotaDisplay.includes('1GB') || quotaDisplay.includes('3GB'));

                        if (isRM12_30D || isRM1_24H || isFreebie) {
                            filteredProducts.push(prod);
                            allProducts[prod.product_id] = prod; 
                        }
                    });
                }
            }

            let addonCount = 0;
            if (filteredProducts.length === 0 && !isMobileShieldUser(Number(targetUserId))) {
                message += '😔 Tiada Addons yang sepadan untuk Langganan Sekali/Spam ditemui buat masa ini.';
            } else {
                filteredProducts.forEach(prod => {
                    addonCount++;
                    const priceCent = prod.price_cent || (prod.price * 100); 
                    const priceFormatted = formatRMFromCent(priceCent); 
                    const quotaDisplay = prod.internet_quota || 'N/A';
                    const nameDisplay = prod.preferred_name || prod.name || prod.name;
                    const productId = prod.product_id || prod.original_id; // Guna original_id untuk tawaran CMP
                    
                    // Semak jika ia adalah Tawaran CMP umum (bukan RM1 Daily)
                    const isGenericCmpOffer = prod.isCmpOffer && productId !== CMP_RM1_DAILY_ID; 

                    message += `• *${nameDisplay}* (RM${priceFormatted})\n  Quota: ${quotaDisplay}\n  Expiry: ${prod.validity || 'N/A'}\n\n`;

                    const isCMP_RM1 = productId === CMP_RM1_DAILY_ID;
                    const isRM1_24H = priceCent === 100 && !isCMP_RM1;
                    const isFreebie = priceCent === 0 && !isCMP_RM1;
                    
                    if (isCMP_RM1) { 
                        buttons.push([{ text: `➕ Langgan Sekali (RM1 UL)`, callback_data: `subscribe_addon_${productId}` }]); 
                    } else if (isGenericCmpOffer) { // Butang untuk SEMUA tawaran CMP yang lain
                         buttons.push([{ text: `➕ Langgan Sekali (${nameDisplay})`, callback_data: `subscribe_addon_${productId}` }]);
                    } else if (isRM1_24H) { 
                        buttons.push([{ text: `➕ Langgan Sekali (RM1 100GB)`, callback_data: `subscribe_addon_${productId}` }]); 
                    } else if (isFreebie) { 
                        buttons.push([
                            { text: `✨ Langgan Sekali (${quotaDisplay})`, callback_data: `subscribe_addon_${productId}` }, 
                            { text: `🚀 Langgan SPAM (${quotaDisplay})`, callback_data: `spam_addon_start_${productId}` }
                        ]); 
                    } else { 
                        // Tambahkan butang SPAM untuk semua produk biasa yang lain (contoh: RM12 30D)
                        buttons.push([
                            { text: `➕ Langgan ${nameDisplay} (RM${priceFormatted})`, callback_data: `subscribe_addon_${productId}` },
                            { text: `🚀 Langgan SPAM (${nameDisplay})`, callback_data: `spam_addon_start_${productId}` }
                        ]);
                    }
                });
            }
            
            buttons.push([{text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard'}]);
            buttons.push([{text: '🔎 Check All Addons', callback_data: 'check_all_addons'}]);
            
            userState[chatId].addonProducts = allProducts; 
        
            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: {inline_keyboard: buttons} });
            
        } catch (e) {
            bot.sendMessage(chatId, 'Gagal mendapatkan addons. Sila cuba semula.', { reply_markup: { inline_keyboard: [[{ text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard' }]] } });
        }
    }

    else if (data === 'check_all_addons') {
        const msisdn = userState[chatId]?.msisdn;
        const targetUserId = userState[chatId]?.userId || userId;
        if (!msisdn) return bot.sendMessage(chatId, 'Sila login dahulu sebelum check addons.', { reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu Utama', callback_data: 'back_menu' }]] } });
        const cookie = getCookie(targetUserId, msisdn);
        if (!cookie) { bot.sendMessage(chatId, 'Cookie tamat tempoh. Sila login semula.', { reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu Utama', callback_data: 'back_menu' }]] } }); deleteUserData(targetUserId, msisdn); return; }

        bot.sendMessage(chatId, 'Memuatkan SEMUA addons internet...');
        const addonHeaders = { ...DEVICE_HEADERS_FOR_ADDONS, 'cookie': cookie };
        const endpoint = 'https://nga.celcomdigi.com/offering/v1/addons?category=internet';
        
        try {
            const response = await axios.get(endpoint, { headers: addonHeaders });
            const resData = response.data.data;
            const allProducts = {}; 
            const categorizedProducts = { '💰 Addons Berbayar (30 Hari / Bulanan)': [], '⚡ Addons Harian / Mingguan': [], '🎁 Addons Percuma (RM0)': [], '🌐 Addons Lain-lain': [] };

            for (const catKey in resData) {
                const category = resData[catKey];
                if (typeof category === 'object' && category !== null && category.products) {
                    category.products.forEach(prod => {
                        const priceCent = prod.price_cent || (prod.price * 100); 
                        allProducts[prod.product_id] = prod; 
                        
                        if (priceCent === 0) { categorizedProducts['🎁 Addons Percuma (RM0)'].push(prod); } 
                        else if (prod.validity?.includes('30') || prod.validity?.includes('month')) { categorizedProducts['💰 Addons Berbayar (30 Hari / Bulanan)'].push(prod); } 
                        else if (prod.validity?.includes('24') || prod.validity?.includes('day') || prod.validity?.includes('week')) { categorizedProducts['⚡ Addons Harian / Mingguan'].push(prod); } 
                        else { categorizedProducts['🌐 Addons Lain-lain'].push(prod); }
                    });
                }
            }

            let message = '📦 *SEMUA Addons Internet CelcomDigi*\n\n';
            const buttons = [];
            let productCount = 0;

            for (const categoryName in categorizedProducts) {
                const products = categorizedProducts[categoryName];
                if (products.length > 0) {
                    message += `--- **${categoryName}** ---\n`;
                    products.forEach(prod => {
                        productCount++;
                        const priceFormatted = formatRMFromCent(prod.price_cent || (prod.price * 100)); 
                        const quotaDisplay = prod.internet_quota || 'N/A';
                        const nameDisplay = prod.preferred_name || prod.name;
                        
                        message += `• *${nameDisplay}* (RM${priceFormatted})\n  Quota: ${quotaDisplay}\n  Expiry: ${prod.validity || 'N/A'}\n\n`;
                        buttons.push([{ text: `➕ Langgan ${nameDisplay} (RM${priceFormatted})`, callback_data: `subscribe_addon_${prod.product_id}` }]);
                    });
                }
            }
            
            if (productCount === 0) { message = '😔 Tiada Addons Internet ditemui buat masa ini.'; }
            
            buttons.push([{text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard'}]);
            buttons.push([{text: '👑 Langganan B0S & Lifestyle', callback_data: 'setup_renew_spam'}]);
            
            userState[chatId].addonProducts = allProducts; 

            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: {inline_keyboard: buttons} });
            
        } catch (e) {
            bot.sendMessage(chatId, 'Gagal mendapatkan SEMUA addons. Sila cuba semula.', { reply_markup: { inline_keyboard: [[{ text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard' }]] } });
        }
    } 
    else if (data && data.startsWith('subscribe_addon_')) {
        const productId = data.replace('subscribe_addon_', '');
        const msisdn = userState[chatId]?.msisdn;
        const targetUserId = userState[chatId]?.userId || userId;
        let productData = userState[chatId]?.addonProducts?.[productId];

        if (!productData && productId === MOBILESHIELD_SKU) {
            productData = MOBILESHIELD_PRODUCT_DATA;
            if (!isMobileShieldUser(Number(targetUserId))) { return bot.sendMessage(chatId, '❌ Anda tidak dibenarkan melanggan MobileSHIELD. Sila hubungi Admin.', { reply_markup: { inline_keyboard: [[{ text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard' }]] } }); }
        }

        if (!msisdn || !productData) { return bot.sendMessage(chatId, 'Maklumat langganan tidak ditemui. Sila cuba check addons semula.', { reply_markup: { inline_keyboard: [[{ text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard' }]] } }); }
        
        await processSubscription(chatId, targetUserId, msisdn, productData, 1, 1); 
    }
    else if (data && data.startsWith('spam_addon_start_')) {
        const productId = data.replace('spam_addon_start_', '');
        const msisdn = userState[chatId]?.msisdn;
        const targetUserId = userState[chatId]?.userId || userId;
        let productData = userState[chatId]?.addonProducts?.[productId];
        
        if (!productData && productId === MOBILESHIELD_SKU) {
            productData = MOBILESHIELD_PRODUCT_DATA;
            if (!isMobileShieldUser(Number(targetUserId))) { return bot.sendMessage(chatId, '❌ Anda tidak dibenarkan melanggan MobileSHIELD secara SPAM.', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard' }]] } }); }
        }

        if (!msisdn || !productData) { return bot.sendMessage(chatId, 'Maklumat produk tidak ditemui. Sila cuba check addons semula.', { reply_markup: { inline_keyboard: [[{ text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard' }]] } }); }
        
        const maxSpam = productData.isMobileShield ? 100 : MAX_SPAM_COUNT; 

        userState[chatId].spamInfo = { productId, productData, maxSpam };
        userState[chatId].step = 'spam_count_wait';
        
        bot.sendMessage(chatId, `Anda memilih *SPAM* untuk *${productData.preferred_name || productData.name}*.\n\n` + `Sila masukkan jumlah langganan yang anda mahu (Maksimum: ${maxSpam}):`,
            { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'setup_renew_spam' }]] } }
        );
    }
    
    // --- Logik Admin ---
    else if (data === 'admin_menu') {
        if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        const maintenanceText = MAINTENANCE_MODE ? '✅ OFF Maintenance Mode' : '❌ ON Maintenance Mode';
        const maintenanceData = MAINTENANCE_MODE ? 'admin_maintenance_off' : 'admin_maintenance_on';
        
        const adminButtons = [
            [{ text: '🔑 Urus Kunci Akses Bot', callback_data: 'admin_manage_keys' }], 
            [{ text: '👤 Urus MobileSHIELD User', callback_data: 'admin_manage_mobileshield' }],
            [{ text: '📢 Broadcast to All User', callback_data: 'admin_broadcast_start' }], 
            [{ text: '👤 Login Nombor Pengguna (MSISDN)', callback_data: 'admin_login_msisdn_start' }], 
            [{ text: maintenanceText, callback_data: maintenanceData }], 
            [{ text: '🗑️ Padam Nombor Pengguna', callback_data: 'admin_delete_msisdn' }],
            [{ text: '📈 Check Users Status', callback_data: 'admin_check_users' }],
            [{ text: '🏠 Kembali ke Menu Utama', callback_data: 'back_menu' }]
        ];
        bot.sendMessage(chatId, '🔑 *Menu Admin*', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: adminButtons } });
    } 
    else if (data === 'admin_manage_mobileshield') {
        if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        const users = readMobileShieldUsers();
        let message = `🛡️ *Urus Pengguna MobileSHIELD*\n\nJumlah Pengguna Aktif: *${users.length}*\n\n`;
        if (users.length > 0) { message += `*Senarai User ID:*\n` + users.map((uid, index) => `${index + 1}. \`${uid}\``).join('\n'); } else { message += `_Tiada pengguna MobileSHIELD berdaftar buat masa ini._\n`; }
        const shieldButtons = [ [{ text: '➕ Tambah User ID Baru', callback_data: 'admin_add_mobileshield_start' }], [{ text: '🗑️ Padam User ID', callback_data: 'admin_delete_mobileshield_start' }], [{ text: '🔙 Kembali ke Menu Admin', callback_data: 'admin_menu' }] ];
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: shieldButtons } });
    }
    else if (data === 'admin_add_mobileshield_start') { if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.'); userState[chatId] = { step: 'admin_mobileshield_add_wait' }; bot.sendMessage(chatId, 'Sila masukkan *User ID Telegram* (contoh: `123456789`) yang anda mahu berikan akses MobileSHIELD:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_manage_mobileshield' }]] } }); }
    else if (data === 'admin_delete_mobileshield_start') { if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.'); userState[chatId] = { step: 'admin_mobileshield_delete_wait' }; bot.sendMessage(chatId, 'Sila masukkan *User ID Telegram* yang anda mahu padam akses MobileSHIELD:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_manage_mobileshield' }]] } }); }
    else if (data === 'admin_manage_keys') {
        if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        const keys = readAccessKeys();
        let message = `🔑 *Urus Kunci Akses Bot*\n\nJumlah Kunci Aktif: *${keys.length}*\n\n`;
        if (keys.length > 0) { message += `*Senarai Kunci Aktif:*\n` + keys.map((key, index) => `${index + 1}. \`${key}\``).join('\n'); } else { message += `_Tiada kunci akses aktif buat masa ini._\n`; }
        const keyButtons = [ [{ text: '➕ Tambah Kunci Baru', callback_data: 'admin_add_key_start' }], [{ text: '🗑️ Padam Semua Kunci', callback_data: 'admin_delete_all_keys' }], [{ text: '🔙 Kembali ke Menu Admin', callback_data: 'admin_menu' }] ];
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyButtons } });
    }
    else if (data === 'admin_add_key_start') { if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.'); userState[chatId] = { step: 'admin_key_add_wait' }; bot.sendMessage(chatId, 'Sila masukkan *satu (1) keyword* untuk dijadikan kunci akses bot. Contoh: `MYACCESS123`', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_manage_keys' }]] } }); }
    else if (data === 'admin_delete_all_keys') {
        if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        writeAccessKeys([]);
        const usersRevoked = revokeAllUserAccess(); 
        bot.sendMessage(chatId, `✅ *Semua kunci akses bot telah berjaya dipadam.*\n🛑 *Akses pengguna lama yang sudah log masuk telah ditarik balik* (${usersRevoked} pengguna terjejas).`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔑 Urus Kunci Akses Bot', callback_data: 'admin_manage_keys' }]] } });
    }
    else if (data === 'admin_login_msisdn_start') { if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.'); userState[chatId] = { step: 'admin_minta_msisdn_login' }; bot.sendMessage(chatId, 'Sila masukkan nombor telefon *pengguna* yang anda mahu akses dashboard:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_menu' }]] } }); }
    else if (data === 'admin_maintenance_on') { if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.'); MAINTENANCE_MODE = true; bot.sendMessage(chatId, '✅ *Maintenance Mode Diaktifkan.* Hanya Admin boleh guna bot.', { parse_mode: 'Markdown' }); await mainMenu(chatId, userId, query.from.first_name || 'User'); }
    else if (data === 'admin_maintenance_off') { if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.'); MAINTENANCE_MODE = false; bot.sendMessage(chatId, '✅ *Maintenance Mode Dimatikan.* Bot kembali beroperasi seperti biasa.', { parse_mode: 'Markdown' }); await mainMenu(chatId, userId, query.from.first_name || 'User'); }
    else if (data === 'admin_delete_msisdn') { if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.'); userState[chatId] = { step: 'admin_minta_msisdn_padam' }; bot.sendMessage(chatId, 'Sila masukkan nombor telefon *pengguna* yang anda mahu padam data (cookie/autorenew) sepenuhnya:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_menu' }]] } }); }
    else if (data === 'admin_broadcast_start') { if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.'); userState[chatId] = { step: 'admin_broadcast_wait_message' }; bot.sendMessage(chatId, '📢 *Sila masukkan mesej broadcast anda:*\n\nAnda boleh menggunakan format *Markdown* (cth: `*tebal*`).', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_menu' }]] } }); }
    else if (data === 'admin_check_users') {
        if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        const allAccounts = readAllAccounts();
        const uniqueUsers = Object.keys(allAccounts);
        const totalUsers = uniqueUsers.length;
        let totalMsisdn = 0;
        
        const messageParts = [`👥 *Laporan Pengguna Bot:*\n`, `Jumlah Pengguna Unik: *${totalUsers}*`];
        for (const uid in allAccounts) {
            const msisdns = Object.keys(allAccounts[uid]).filter(key => key !== '00000000000'); 
            totalMsisdn += msisdns.length;
            if (messageParts.length < 8) { messageParts.push(`\n- User ID <code>${uid}</code> (${msisdns.length} nombor)`); }
        }
        messageParts.push(`\nJumlah Nombor Telefon Didaftar: *${totalMsisdn}*\n`);
        if (totalUsers > 5) { messageParts.push(`\n(_Paparan ringkasan, ${totalUsers - 5} pengguna lain dikecualikan_)\n`); }
        bot.sendMessage(chatId, messageParts.join('\n'), { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🔑 Menu Admin', callback_data: 'admin_menu' }]] } });
    }

    // --- Logik Utility/VPN ---
    else if (data === 'get_vpn') { bot.sendMessage(chatId, 'Pilih config VPN:', { reply_markup: { inline_keyboard: [ [{ text: 'Config SG DigitalOcean🇸🇬', callback_data: 'vpn_sg_do' }], [{ text: 'Config CF Worker♾️', callback_data: 'vpn_cf_worker' }], [{ text: '⬅️ Kembali ke Menu', callback_data: 'back_menu' }] ] } }); }
    else if (data === 'vpn_sg_do') { 
        const configMsg = `<b>🔒 VLESS XRAY</b>\n... (Config VLESS XRAY Penuh) ...`; 
        bot.sendMessage(chatId, configMsg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [ [{ text: '⬅️ Kembali ke VPN Menu', callback_data: 'get_vpn' }] ] } }); 
    }
    else if (data === 'vpn_cf_worker') { bot.sendMessage(chatId, 'Pilih lokasi server:', { reply_markup: { inline_keyboard: [ [{ text: 'Server Malaysia🇲🇾', callback_data: 'cfw_my' }, { text: 'Server Singapore🇸🇬', callback_data: 'cfw_sg' }], [{ text: 'Server Indonesia🇮🇩', callback_data: 'cfw_id' }], [{ text: '⬅️ Kembali ke VPN Menu', callback_data: 'get_vpn' }] ] } }); }
    else if (data === 'cfw_my') { bot.sendMessage(chatId, 'Pilih server Malaysia:', { reply_markup: { inline_keyboard: [ [{ text: 'Server Malaysia 1', callback_data: 'cfw_my_1' }], [{ text: 'Server Malaysia 2', callback_data: 'cfw_my_2' }], [{ text: '⬅️ Kembali', callback_data: 'vpn_cf_worker' }] ] } }); }
    // ... Logik CFW lain (cfw_sg, cfw_id, cfw_my_1, dll.) ...
    else if (data === 'convert_html_to_web') {
        bot.sendMessage(chatId, 'Sila hantar kod HTML anda (teks atau fail .html) untuk convert ke web version:', { reply_markup: { inline_keyboard: [ [{ text: '⬅️ Kembali ke Menu', callback_data: 'back_menu' }] ] } });
        userSession[chatId] = { state: 'await_html_code' };
    }
    else {
        try { await bot.answerCallbackQuery(query.id, { text: 'Pilihan tidak sah atau tiada tindakan.' }); } catch {}
    }

});


// --- PENGENDALIAN MESEJ MASUK ---

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const userId = String(msg.from.id);
    const userIdNum = Number(userId); 
    
    addUserToBot(msg.from.id);

    const session = userSession[chatId]; 
    const state = userState[chatId];     
    
    if (MAINTENANCE_MODE && !isAdmin(userIdNum) && text !== '/start') return;
    if (typeof text === 'string' && text.startsWith('/')) return; 

    // === LOGIK KUNCI AKSES ===
    if (state?.step === 'access_key_wait') {
        const accessKeys = readAccessKeys();
        const inputKey = text;
        
        if (accessKeys.includes(inputKey)) {
            grantAccessToUser(userIdNum); 
            delete userState[chatId];
            bot.sendMessage(chatId, `✅ *Kunci Akses Sah!* Anda kini boleh menggunakan bot.`, { parse_mode: 'Markdown' });
            mainMenu(chatId, userId, msg.from.first_name || 'User'); 
        } else {
            bot.sendMessage(chatId, `❌ *Kunci Akses Tidak Sah.* Sila cuba lagi atau hubungi Admin.`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Batal / Menu Utama', callback_data: 'back_menu' }] ] } });
        }
        return; 
    }
    
    // === ADMIN INPUTS ===
    else if (state?.step === 'admin_key_add_wait') { /* ... Logik Admin Key Add ... */ }
    else if (state?.step === 'admin_mobileshield_add_wait') { /* ... Logik Admin MobileShield Add ... */ }
    else if (state?.step === 'admin_mobileshield_delete_wait') { /* ... Logik Admin MobileShield Delete ... */ }
    else if (state?.step === 'admin_login_msisdn_start') { /* ... Logik Admin Login MSISDN ... */ }
    else if (state?.step === 'admin_minta_msisdn_padam') { /* ... Logik Admin Delete MSISDN ... */ }
    else if (state?.step === 'admin_broadcast_wait_message') {
        if (!isAdmin(userIdNum)) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        const allAccounts = readAllAccounts();
        const uniqueChatIds = new Set();
        for (const uid in allAccounts) { for (const msisdn in allAccounts[uid]) { if (allAccounts[uid][msisdn].chatId) { uniqueChatIds.add(allAccounts[uid][msisdn].chatId); break; } } }
        const chatIdsArray = Array.from(uniqueChatIds);
        
        await bot.sendMessage(chatId, `⏳ *Memulakan proses Broadcast* ke ${chatIdsArray.length} pengguna... Sila tunggu.`, { parse_mode: 'Markdown' });
        delete userState[chatId]; 
        const result = await broadcastMessage(chatIdsArray, text, 'Markdown'); 
        
        await bot.sendMessage(chatId, `✅ *Broadcast Selesai!*\n\nBerjaya: *${result.successCount}*\nGagal: *${result.failedCount}*\n\nSila pilih tindakan seterusnya:`, 
            { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔑 Menu Admin', callback_data: 'admin_menu' }] ] } }
        );
        return;
    }
    
    // === HANDLE HTML CONVERT TO WEB ===
    else if (session?.state === 'await_html_code') {
        if (msg.document && msg.document.mime_type === 'text/html') { /* ... Logik File HTML ... */ }
        else if (msg.text) {
            bot.sendMessage(chatId, 'Sedang convert, sila tunggu...');
            const id = await convertHtmlToWeb(msg.text);
            if (id) { bot.sendMessage(chatId, `Ini link web version anda:\nhttps://htmlviewermrsb.gleeze.com/view/${id}`); } 
            else { bot.sendMessage(chatId, 'Maaf, berlaku ralat semasa convert HTML.'); }
            userSession[chatId] = null;
        } else { bot.sendMessage(chatId, 'Sila hantar kod HTML (teks) atau fail .html sahaja.'); }
        return;
    }

    // === TELCO LAMA FLOW ===
    else if (session?.telco === 'digi') { /* ... Logik Digi Flow ... */ }
    else if (session?.telco === 'maxis') { /* ... Logik Maxis Flow ... */ }
    else if (session?.telco === 'celcom') { /* ... Logik Celcom Flow ... */ }
    
    // === CELCOM-DIGI NGA FLOW ===
    else if (state?.step === 'minta_msisdn') {
        const msisdn = normalizePhone(text);
        userState[chatId].msisdn = msisdn;
        userState[chatId].step = 'otp_wait';
        
        userState[chatId].otpTimeout = setTimeout(() => { if (userState[chatId]?.step === 'otp_wait') { bot.sendMessage(chatId, '⚠️ *Perhatian:* Anda mempunyai 1 minit lagi untuk memasukkan OTP sebelum sesi login ini tamat.', { parse_mode: 'Markdown' }); } }, 120000); // 2 minit 

        bot.sendMessage(chatId, `Menghantar OTP ke ${msisdn}...`);
        try {
            const headersGetOtp = { ...DEVICE_HEADERS_BASE, screen: 'login-request-otp' };
            await axios.get(`https://nga.celcomdigi.com/auth/guest/guest-otp?msisdn=${msisdn}`, { headers: headersGetOtp });
            bot.sendMessage(chatId, '✅ OTP telah dihantar. Sila masukkan OTP yang anda terima:', { reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'menu_telco' }] ] } });
        } catch (e) {
            bot.sendMessage(chatId, 'Gagal menghantar OTP. Sila pastikan nombor betul atau cuba semula.', { reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'menu_telco' }] ] } });
            clearTimeout(userState[chatId].otpTimeout);
            delete userState[chatId];
        }
        return;
    } else if (state?.step === 'otp_wait') {
        const otp = text;
        const msisdn = userState[chatId].msisdn;
        
        if (userState[chatId].otpTimeout) { clearTimeout(userState[chatId].otpTimeout); delete userState[chatId].otpTimeout; }

        bot.sendMessage(chatId, 'Memproses login...');
        try {
            const headersPostLogin = { ...DEVICE_HEADERS_BASE, screen: 'login-guest' };
            const res = await axios.post('https://nga.celcomdigi.com/auth/guest/guest-login', { otp, token: '', msisdn }, { headers: headersPostLogin });
            const setCookieHeader = res.headers['set-cookie'];
            let cookieValue = '';
            if (setCookieHeader?.length > 0) {
                const connectSid = setCookieHeader.find(c => c.startsWith('connect.sid='));
                if (connectSid) { cookieValue = connectSid.split(';')[0]; saveUserData(userId, msisdn, { cookie: cookieValue, chatId: chatId, has_access: true }); userState[chatId].cookie = cookieValue; }
            }
            if (!cookieValue) { throw new Error("Gagal mendapatkan cookie dari respons."); }
            bot.sendMessage(chatId, '✅ Login berjaya! Memaparkan dashboard...');
            await displayDashboard(chatId, userId, msisdn); 
        } catch (e) {
            bot.sendMessage(chatId, '❌ Login / OTP gagal, sila pastikan OTP betul atau cuba semula.', { reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'menu_telco' }] ] } });
            delete userState[chatId];
        }
        return;
    } 
    
    // === SPAM COUNT INPUT ===
    else if (state?.step === 'spam_count_wait') {
        const count = parseInt(text);
        const msisdn = userState[chatId].msisdn;
        const targetUserId = userState[chatId]?.userId || userId;
        const { productData, maxSpam } = userState[chatId].spamInfo; 

        if (isNaN(count) || count < 1 || count > maxSpam) {
            return bot.sendMessage(chatId, `❌ Jumlah mesti nombor antara 1 hingga ${maxSpam}. Sila cuba lagi:`, { reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'setup_renew_spam' }] ] } });
        }

        userState[chatId].step = 'dashboard_view'; 
        delete userState[chatId].spamInfo;
        await runSpamLoop(chatId, targetUserId, msisdn, productData, count); 
        return;
    }
});


// --- MULA PENJADUAL ---
setInterval(expiryNotificationScheduler, NOTIFICATION_CHECK_INTERVAL_MS); 
expiryNotificationScheduler();
