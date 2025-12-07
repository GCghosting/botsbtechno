const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const moment = require('moment');

const TOKEN = '8256123040:AAEIyWGF5rx4iGXPQiXKlXIwbnQMKrDUYD8'; // <-- GANTI DENGAN TOKEN ANDA
const OWNER_ID = 'error109';
const ADMIN_IDS = '2129865779'; // Gantikan dengan User ID anda
const SERVER_IMAGE = 'https://images.unsplash.com/photo-1553481187-be93c21490a9?auto=format&fit=crop&w=1400&q=80';
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const FormData = require('form-data');

const freebiesData = [
    { productId: 1145, title: "100GB 1-day (TikTok)", description: "RM1 100GB 1-day (TikTok)" },
    { productId: 1146, title: "100GB 1-day (Facebook)", description: "RM1 100GB 1-day (Facebook)" },
    { productId: 1147, title: "100GB 2-days (Facebook)", description: "RM2 100GB 2-days (Facebook)" },
    { productId: 1148, title: "100GB 2-days (TikTok)", description: "RM2 100GB 2-days (TikTok)" },
    { productId: 1149, title: "100GB 1-day (YouTube)", description: "RM1 100GB 1-day (YouTube)" },
    { productId: 1150, title: "100GB 2-days (YouTube)", description: "RM2 100GB 2-days (YouTube)" },
    { productId: 1151, title: "100GB 5-days (YouTube)", description: "RM3 100GB 5-days (YouTube)" }
];

const freebiesCelcom = [
    { id: "40943", title: "10GB Facebook", description: "10GB Facebook Freebies" },
    { id: "40944", title: "10GB Instagram", description: "10GB Instagram Freebies" },
    { id: "40945", title: "3GB YOUTUBE + 300MB IFLIX", description: "3GB YOUTUBE + 300MB IFLIX" },
    { id: "40946", title: "Unlimited WhatsApp, WeChat, Twitter, Imo", description: "Unlimited Social Freebies" }
];

const USER_ACCOUNTS_FILE = 'user_accounts.json'; 
const ACCESS_KEYS_FILE = 'keyaccess.txt'; // <-- FAIL UNTUK KUNCI AKSES
const MOBILESHIELD_USERS_FILE = 'mobileshield_users.txt'; // <-- FAIL BARU UNTUK PENGGUNA MOBILESHIELD

const MAX_SPAM_COUNT = 60;
const SPAM_DELAY_MS = 17000;
// NOTIFIKASI AKAN DIHANTAR 2 JAM SEBELUM QUOTA TAMAT TEMPOH
const NOTIFICATION_BEFORE_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 Jam
// Kitaran Semakan untuk Notifikasi (Contoh: Setiap 15 minit)
const NOTIFICATION_CHECK_INTERVAL_MS = 15 * 60 * 1000; 

let MAINTENANCE_MODE = false; 

// Untuk menyimpan state sementara pengguna (cth: msisdn semasa, cookie, produk addons, admin actions)
const userState = {};

// ID Produk Khas untuk RM1 Daily MI UL (CMP Offer)
const CMP_RM1_DAILY_ID = 'CMP_132194'; 

// ID Produk Khas untuk MobileSHIELD (Berdasarkan CURL pengguna)
const MOBILESHIELD_PRODUCT_ID = 90011270;
const MOBILESHIELD_SKU = '448296'; // skuId dari payload
const MOBILESHIELD_PRICE_CENT = 1000; // RM10.00
const MOBILESHIELD_PRODUCT_DATA = {
    id: MOBILESHIELD_SKU, // skuId
    product_id: MOBILESHIELD_PRODUCT_ID, // productId
    preferred_name: 'MobileSHIELD',
    name: 'MobileSHIELD',
    price: MOBILESHIELD_PRICE_CENT / 100, // 10
    price_cent: MOBILESHIELD_PRICE_CENT, // 1000
    validity: '30 Hari',
    internet_quota: '1GB',
    telco_type: 2, // Digi
    isMobileShield: true, 
    screenName: "lifestyle-offers", 
    description: "lifestyle Subscription"
};


// --- Utility Functions (UPDATED FOR CENTRAL JSON FILE) ---

function isAdmin(userId) { 
    // GANTI DENGAN ID TELEGRAM ANDA
    const admins = [2129865779]; 
    return admins.includes(userId); 
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function revokeAllUserAccess() {
    const allAccounts = readAllAccounts();
    let usersAffected = 0;
    
    for (const userId in allAccounts) {
        // Abaikan Admin
        if (isAdmin(Number(userId))) continue; 
        
        const userAccounts = allAccounts[userId];
        let accessRevoked = false;
        
        for (const msisdn in userAccounts) {
            if (userAccounts[msisdn].has_access === true) {
                userAccounts[msisdn].has_access = false;
                accessRevoked = true;
            }
        }
        
        if (accessRevoked) {
            allAccounts[userId] = userAccounts;
            usersAffected++;
        }
    }
    
    writeAllAccounts(allAccounts);
    return usersAffected;
}

// --- FUNGSI PENGURUSAN KUNCI AKSES ---

/**
 * Membaca semua kunci akses dari keyaccess.txt.
 * Mengembalikan Array of Strings (kunci).
 */
function readAccessKeys() {
    try {
        if (fs.existsSync(ACCESS_KEYS_FILE)) {
            const data = fs.readFileSync(ACCESS_KEYS_FILE, 'utf8').trim();
            // Setiap kunci di baris baru
            return data.split('\n').map(key => key.trim()).filter(key => key.length > 0);
        }
    } catch (e) {
        console.error(`Gagal baca fail kunci akses: ${e.message}`);
    }
    return [];
}

/**
 * Menulis senarai kunci akses ke keyaccess.txt.
 */
function writeAccessKeys(keysArray) {
    try {
        // Tulis setiap kunci pada baris baru
        fs.writeFileSync(ACCESS_KEYS_FILE, keysArray.join('\n') + '\n');
    } catch (e) {
        console.error(`Gagal tulis fail kunci akses: ${e.message}`);
    }
}

/**
 * Menyemak sama ada UserId mempunyai akses (sama ada Admin atau kunci yang sah telah digunakan).
 */
function hasAccess(userId) {
    if (isAdmin(userId)) return true;
    const allAccounts = readAllAccounts();
    // Semak jika mana-mana MSISDN di bawah UserId ini telah didaftarkan dengan 'has_access: true'
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

/**
 * Menandakan semua akaun di bawah UserId sebagai 'has_access: true'.
 */
function grantAccessToUser(userId) {
    const allAccounts = readAllAccounts();
    if (!allAccounts[userId]) {
         // Jika user tiada akaun lagi, buat entri kosong.
        allAccounts[userId] = {}; 
    }
    
    let updated = false;
    // Tandakan semua akaun sedia ada dengan has_access: true
    for (const msisdn in allAccounts[userId]) {
        if (!allAccounts[userId][msisdn].has_access) {
            allAccounts[userId][msisdn].has_access = true;
            updated = true;
        }
    }
    
    // Jika tiada akaun, letakkan entri dummy sementara untuk penanda akses
    if (Object.keys(allAccounts[userId]).length === 0) {
        allAccounts[userId]['00000000000'] = { has_access: true, last_updated: new Date().toISOString() };
        updated = true;
    }
    
    if (updated) {
        writeAllAccounts(allAccounts);
    }
}


// --- FUNGSI PENGURUSAN MOBILESHIELD USER (BARU) ---

/**
 * Membaca semua user ID yang dibenarkan MobileSHIELD dari mobileshield_users.txt.
 * Mengembalikan Array of Strings (userIds).
 */
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

/**
 * Menulis senarai user ID MobileSHIELD ke mobileshield_users.txt.
 */
function writeMobileShieldUsers(userIdsArray) {
    try {
        fs.writeFileSync(MOBILESHIELD_USERS_FILE, userIdsArray.join('\n') + '\n');
    } catch (e) {
        console.error(`Gagal tulis fail MobileSHIELD user: ${e.message}`);
    }
}

/**
 * Menyemak sama ada UserId dibenarkan MobileSHIELD (termasuk Admin).
 */
function isMobileShieldUser(userId) {
    if (isAdmin(Number(userId))) return true;
    const users = readMobileShieldUsers();
    return users.includes(String(userId));
}

/**
 * Menambah UserId ke senarai MobileSHIELD.
 */
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

/**
 * Memadam UserId dari senarai MobileSHIELD.
 */
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


// --- Utility Functions (Data User) - Sama seperti sebelumnya ---

/**
 * Membaca data akaun keseluruhan dari user_accounts.json.
 */
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

/**
 * Menulis data akaun keseluruhan ke user_accounts.json.
 */
function writeAllAccounts(allAccounts) {
    try {
        fs.writeFileSync(USER_ACCOUNTS_FILE, JSON.stringify(allAccounts, null, 2));
    } catch (e) {
        console.error(`Gagal tulis fail akaun: ${e.message}`);
    }
}

/**
 * Mendapatkan data spesifik untuk satu MSISDN dari seorang pengguna.
 */
function getUserData(userId, msisdn) {
    const allAccounts = readAllAccounts();
    // Mengendalikan kes '00000000000' yang merupakan penanda akses
    if (msisdn === '00000000000') return allAccounts[userId]?.[msisdn] || null;
    return allAccounts[userId]?.[msisdn] || null;
}

/**
 * Mendapatkan semua nombor telefon yang didaftarkan oleh seorang pengguna.
 */
function getUserAccounts(userId) {
    const allAccounts = readAllAccounts();
    const accounts = allAccounts[userId] || {};
    // Keluarkan penanda akses '00000000000' jika ada sebelum kembali ke user
    if (accounts['00000000000']) {
        const { '00000000000': temp, ...rest } = accounts;
        return rest;
    }
    return accounts;
}

/**
 * Menyimpan/mengemaskini data untuk satu MSISDN di bawah ID pengguna.
 */
function saveUserData(userId, msisdn, data) {
    const allAccounts = readAllAccounts();
    
    if (!allAccounts[userId]) {
        allAccounts[userId] = {};
    }
    
    const existingData = allAccounts[userId][msisdn] || {};
    // PENTING: Jika ia login, pastikan ia inherit has_access jika sudah ada.
    const newAccessStatus = allAccounts[userId]['00000000000']?.has_access || existingData.has_access || false;
    
    const newData = { 
        ...existingData, 
        ...data, 
        has_access: newAccessStatus, // Simpan status akses
        last_updated: new Date().toISOString() 
    };
    
    allAccounts[userId][msisdn] = newData;
    
    // Jika ini adalah login pertama dan penanda akses 00000 wujud, salin has_access
    if (msisdn !== '00000000000' && allAccounts[userId]['00000000000']) {
        allAccounts[userId][msisdn].has_access = allAccounts[userId]['00000000000'].has_access;
        // Padam penanda akses 00000000000 jika akaun sebenar pertama wujud
        delete allAccounts[userId]['00000000000']; 
    }
    
    writeAllAccounts(allAccounts);
}

/**
 * Memadam data MSISDN dari seorang pengguna.
 */
function deleteUserData(userId, msisdn) {
    const allAccounts = readAllAccounts();
    if (allAccounts[userId] && allAccounts[userId][msisdn]) {
        delete allAccounts[userId][msisdn];
        
        const remainingKeys = Object.keys(allAccounts[userId]).filter(key => key !== '00000000000');
        
        if (remainingKeys.length === 0) {
            // Jika tiada nombor sebenar, pastikan penanda akses kekal (jika ada)
            if (allAccounts[userId]['00000000000']?.has_access) {
                 // Hanya tinggal penanda akses. Kekalkan objek user ID.
            } else {
                 delete allAccounts[userId];
            }
        }
        
        writeAllAccounts(allAccounts);
        console.log(`Padam data untuk User:${userId}, MSISDN:${msisdn}.`);
        return true;
    }
    return false;
}

/**
 * Dapatkan cookie berdasarkan userId dan msisdn.
 */
function getCookie(userId, msisdn) {
    return getUserData(userId, msisdn)?.cookie || null;
}

// --- FUNGSI BARU: LOGIK NOTIFIKASI TAMAT TEMPOH ---

/**
 * Mengemas kini tarikh luput (jangkaan) untuk notifikasi.
 * Nota: Tempoh langganan CelcomDigi Addons biasanya 24 jam.
 */
function updateNotificationDue(userId, msisdn, quotaName, durationHours = 24) {
    const expiryTimeMs = durationHours * 60 * 60 * 1000;
    // Masa luput dijangka = masa langganan + tempoh langganan
    const expectedExpiryTime = Date.now() + expiryTimeMs; 
    
    // Masa notifikasi = Masa luput dijangka - 2 jam (NOTIFICATION_BEFORE_EXPIRY_MS)
    const notificationDueTime = expectedExpiryTime - NOTIFICATION_BEFORE_EXPIRY_MS;
    
    saveUserData(userId, msisdn, {
        expiryNotification: {
            quotaName: quotaName,
            // Simpan tarikh notifikasi untuk scheduler
            notificationDue: new Date(notificationDueTime).toISOString(), 
            // Tandakan notifikasi sebagai belum dihantar
            sent: false 
        }
    });
    
    console.log(`[NOTIFIKASI ${msisdn}] Ditetapkan: ${new Date(notificationDueTime).toLocaleTimeString()} untuk produk ${quotaName}`);
}

/**
 * Penjadual yang berjalan secara berkala untuk menyemak Notifikasi Tamat Tempoh.
 */
async function expiryNotificationScheduler() {
    if (MAINTENANCE_MODE) {
        console.log(`[NOTIFIKASI SCHEDULER] Dihentikan kerana Maintenance Mode aktif.`);
        return;
    }

    console.log(`[NOTIFIKASI SCHEDULER] Memulakan semakan notifikasi tamat tempoh...`);
    const allAccounts = readAllAccounts();
    const now = Date.now();
    let checks = 0;
    let notificationsSent = 0;

    for (const userId in allAccounts) {
        const userAccounts = allAccounts[userId];
        for (const msisdn in userAccounts) {
            const userData = userAccounts[msisdn];
            // Abaikan penanda akses
            if (msisdn === '00000000000') continue;
            
            const notificationInfo = userData.expiryNotification;

            if (notificationInfo && !notificationInfo.sent) {
                checks++;
                const notificationDue = new Date(notificationInfo.notificationDue).getTime();
                const chatId = userData.chatId;

                // Jika masa notifikasi sudah tiba atau telah berlalu
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
                            // Tandakan notifikasi sebagai sudah dihantar
                            saveUserData(userId, msisdn, { 
                                expiryNotification: { ...notificationInfo, sent: true } 
                            });
                            console.log(`[NOTIFIKASI ${msisdn}] Notifikasi '2 Jam' berjaya dihantar.`);

                        } catch (e) {
                            console.error(`[NOTIFIKASI ${msisdn}] Gagal hantar notifikasi: ${e.message}`);
                            // Tandakan sebagai dihantar untuk mengelakkan spam berterusan jika bot diblokir/error
                            saveUserData(userId, msisdn, { 
                                expiryNotification: { ...notificationInfo, sent: true } 
                            });
                        }
                    } else {
                        // Jika tiada chatId, tandakan sebagai dihantar untuk mengelakkan semakan berulang
                        saveUserData(userId, msisdn, { 
                            expiryNotification: { ...notificationInfo, sent: true } 
                        });
                        console.log(`[NOTIFIKASI ${msisdn}] Tiada chatId, diabaikan.`);
                    }
                }
            }
        }
    }
    console.log(`[NOTIFIKASI SCHEDULER] Selesai. (${checks} semakan, ${notificationsSent} notifikasi dihantar).`);
}

// --- FUNGSI FORMATTING (Sama seperti sebelumnya) ---

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

// --- Headers Configuration (Sama seperti sebelumnya) ---
const deviceHeadersBase = {
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

const deviceHeadersForAddons = {
  'Host': 'nga.celcomdigi.com',
  'content-type': 'application/json',
  'language': 'en',
  'deviceid': 'tchrvzgimkmty49k',
  'devicemodel': 'V2202',
  'devicename': 'V2202',
  'devicebrand': 'vivo',
  'deviceos': 'Android',
  'systemversion': '15',
  'apkversion': '1.0.8(11746)',
  'screen': 'addon-internet-listing',
  'sentry-trace': 'b0ebe3a8bbad4514b1e5b2a52953abf6-8ed31dc38ab85a31-1',
  'baggage': 'sentry-environment=PRODUCTION,sentry-release=1.0.8-11746,sentry-public_key=469b09dfdb3510e0864c700e3676fc8c,sentry-trace_id=b0ebe3d5b7414514b1e5b2a52953abf6,sentry-sample_rate=1,sentry-transaction=InternetAddOns,sentry-sampled=true',
  'accept-encoding': 'gzip',
  'user-agent': 'okhttp/4.12.0',
};

const deviceHeadersForCmpOffer = {
    'Host': 'nga.celcomdigi.com',
    'content-type': 'application/json',
    'apkversion': '1.0.8(11746)',
    'screen': '',
    'sentry-trace': '5c8ddb1154cd48b8a54937bade5d895b-9c86432b88f2f02b-1',
    'baggage': 'sentry-environment=PRODUCTION,sentry-release=1.0.8-11746,sentry-public_key=469b09dfdb3510e0864c700e3676fc8c,sentry-trace_id=5c8ddb1154cd48b8a54937bade5d895b,sentry-sample_rate=1,sentry-transaction=Explore,sentry-sampled=true',
    'accept-encoding': 'gzip',
    'user-agent': 'okhttp/4.12.0',
};

const deviceHeadersForMobileShield = {
    'Host': 'nga.celcomdigi.com',
    'content-type': 'application/json',
    'language': 'en',
    'deviceid': 'tchrvzgimkmty49k',
    'devicemodel': 'V2202',
    'devicename': 'V2202',
    'devicebrand': 'vivo',
    'deviceos': 'Android',
    'systemversion': '15',
    'apkversion': '1.0.8(11746)',
    'screen': 'lifestyle-offers',
    'sentry-trace': '9e27c006d0484e599e6ff8d59f0f63b1-4191c94d0388656d-1',
    'baggage': 'sentry-environment=PRODUCTION,sentry-release=1.0.8-11746,sentry-public_key=469b09dfdb3510e0864c700e3676fc8c,sentry-trace_id=9e27c006d0484e599e6ff8d59f0f63b1,sentry-sample_rate=1,sentry-transaction=LifestyleOffers,sentry-sampled=true',
    'accept-encoding': 'gzip',
    'user-agent': 'okhttp/4.12.0',
};


// --- FUNGSI API (Sama seperti sebelumnya) ---

async function getCmpOffer(cookie) {
    try {
        const headers = { ...deviceHeadersForCmpOffer, 'cookie': cookie };
        const endpoint = 'https://nga.celcomdigi.com/offering/v1/cmpOffer?zone=NGCA%20Home';
        const response = await axios.get(endpoint, { headers });
        return response.data.data.data || [];
    } catch (e) {
        console.error('Gagal mendapatkan CMP Offers:', e.response?.data || e.message);
        return [];
    }
}

async function processCmpOptIn(chatId, msisdn, productData, cookie, currentAttempt = 1, messageId = null) {
    const { campaignId, keyword, poId, name, price } = productData;
    const log = (msg) => console.log(`[CMP OPTIN ${msisdn} #${currentAttempt}] ${msg}`);
    const userId = userState[chatId]?.userId || msisdn; 
    
    const statusText = `⏳ Memproses langganan *${name}* (RM${Number(price).toFixed(2)})`;
    
    if (chatId) {
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

    try {
        const headers = { ...deviceHeadersBase, 'cookie': cookie };
        const payload = {
            campaignId: Number(campaignId),
            keyword: keyword,
            offerId: poId,
        };

        log('Menghantar permintaan CMP OptIn...');
        const res = await axios.post('https://nga.celcomdigi.com/offering/v1/cmpOptIn', payload, { headers });
        
        if (res.status === 200 || res.status === 202) {
             const successMessage = `✅ *Langganan CMP Berjaya!* 🎉\nProduk: *${name}*\nSila semak SMS anda.`;
             if (chatId && messageId) {
                  await bot.editMessageText(successMessage, 
                    { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
                  );
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
        
        log(errorMessage);
        
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
    // TAMBAH isMobileShield di sini
    const { 
        id, 
        product_id, 
        preferred_name, 
        name, 
        price, 
        telco_type, 
        isCmpOffer, 
        validity, 
        internet_quota,
        isMobileShield // <--- BARU: Tambah isMobileShield
    } = productData;
    
    const cookie = getCookie(userId, msisdn); 
    const log = (msg) => console.log(`[SUBSCRIBE ${msisdn} #${currentAttempt}] ${msg}`);
    
    // Jika ia CMP Offer, guna fungsi khas
    if (isCmpOffer) {
        return processCmpOptIn(chatId, msisdn, productData, cookie, currentAttempt, messageId);
    }
    
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

    // Logik langganan Addon biasa
    try {
        if (!cookie) throw new Error('Cookie hilang. Sila login semula.');

        // --- 1. POST /subscribe (Get paymentUrl) ---
        const subscribePayload = {
            description: "Add on Purchase",
            paymentMethod: "CPA",
            userName: "Mad",
            userEmail: `${msisdn}@celcomdigi.com`, 
            msisdn: msisdn,
            network: (telco_type === 2) ? "DIGI" : "CELCOM", 
            amount: price,
            skuName: preferred_name || name,
            sku: String(id),
            product_id: Number(product_id),
            override_addon: false,
            screenName: "addon-internet-submit",
            item_id: String(product_id),
            item_ngpcid: Number(id),
        };
        
        // Header Asas
        const subscribeHeaders = {
            ...deviceHeadersBase,
            'Host': 'nga.celcomdigi.com',
            'screen': 'addon-internet-submit',
            'cookie': cookie,
        };

        // Logik Tambahan Header MobileShield
        if (isMobileShield) {
             subscribeHeaders['dguardid'] = '8c9def93-a7d1-4c8e-b556-5840117083fd';
             subscribeHeaders['dguardmsisdn'] = msisdn;
             subscribeHeaders['screen'] = 'lifestyle-offers'; 
             log('Header MobileShield Ditambah.');
        }


        log('Langkah 1: Menghantar permintaan langganan...');
        const resSubscribe = await axios.post('https://nga.celcomdigi.com/digipay/v1/subscribe', subscribePayload, { headers: subscribeHeaders });
        const paymentUrl = resSubscribe.data.data.paymentUrl;
        
        if (!paymentUrl) throw new Error("Gagal mendapatkan Payment URL.");

        // --- 2. GET paymentUrl (Handle 302) ---
        const urlParts = new URL(paymentUrl);
        const paymentHeaders = {
            'Host': urlParts.host,
            'user-agent': 'Mozilla/5.0 (Linux; Android 15; V2202 Build/AP3A.240905.015.A2; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.7339.207 Mobile Safari/537.36',
            'x-requested-with': 'com.celcomdigi.selfcare',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'cookie': cookie, 
        };

        log(`Langkah 2: Mengakses Payment URL: ${paymentUrl}`);
        
        let htmlResponse = '';
        try {
            const resPayment = await axios.get(paymentUrl, { 
                headers: paymentHeaders, 
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400
            });
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
            log("Callback URL tidak ditemui. Anggap Berjaya (Langganan Tanpa Pengesahan Akhir).");
            if (count === 1 && chatId && messageId) { 
                 await bot.editMessageText(`✅ *Langganan Berjaya!* 🎉\nProduk: *${preferred_name || name}*\nSila semak SMS anda.`, 
                    { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
                );
            }
            // Logik notifikasi due time
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
        const referenceNumberMatch = callbackUrl.match(/reference_number=([^&]+)/);
        const referenceNumber = referenceNumberMatch ? referenceNumberMatch[1] : 'N/A';

        // ** LOGIK KEMAS KINI: SEMAK STATUS DARI CALLBACK URL SEBELUM PENGESAHAN AKHIR **
        const paymentStatusMatch = callbackUrl.match(/payment_status=([^&]+)/i);
        const fulfillmentStatusMatch = callbackUrl.match(/fulfillment_status=([^&]+)/i); // Tambah semakan ini
        const errorDescMatch = callbackUrl.match(/error_description=([^&]+)/i);
        
        const paymentStatus = paymentStatusMatch ? decodeURIComponent(paymentStatusMatch[1]) : 'Unknown';
        const fulfillmentStatus = fulfillmentStatusMatch ? decodeURIComponent(fulfillmentStatusMatch[1]) : 'Unknown';
        const errorDescription = errorDescMatch ? decodeURIComponent(errorDescMatch[1].replace(/\+/g, ' ')) : 'Unknown Error';

        if (paymentStatus === 'Fail') {
            let errorMsg;
            // Pengendalian khas untuk Insufficient Balance
            if (errorDescription.toLowerCase().includes('insufficient balance')) {
                 errorMsg = `❌ GAGAL: Baki Kredit Tidak Mencukupi! Sila Topup.`;
            } else {
                 errorMsg = `❌ GAGAL: ${errorDescription.substring(0, 100)}`;
            }

            log(errorMsg);
            throw new Error(errorMsg); // Lempar error untuk diproses dalam catch block di bawah
        }
        
        // --- 3. GET final callback URL ---
        const callbackHeaders = { ...paymentHeaders, 'Host': 'nga.celcomdigi.com' };
        log(`Langkah 3: Menghantar Callback URL untuk pengesahan: ${callbackUrl}`);
        
        const resCallback = await axios.get(callbackUrl, { headers: callbackHeaders });
        
        // ** PEMBAIKAN UNTUK MESEJ SUKSES: Terima 'Success' dari URL ATAU dapatkan 'RECEIVEOK' **
        const isSuccessFromUrl = paymentStatus.toLowerCase() === 'success' && fulfillmentStatus.toLowerCase() === 'success';
        const isSuccessFromResponse = resCallback.data.trim() === 'RECEIVEOK';

        if (isSuccessFromUrl || isSuccessFromResponse) {
            log(`Langganan Berjaya Dikesan: Status URL: ${paymentStatus}, Respons Akhir: ${resCallback.data.trim()}`);
            
            if (count === 1 && chatId && messageId) { 
                await bot.editMessageText(`✅ *Langganan Berjaya Dikesan!* 🎉\nProduk: *${preferred_name || name}*`, 
                    { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
                );
            }
            // PENTING: Panggil logik notifikasi tamat tempoh selepas langganan berjaya
            const durationMatch = validity?.match(/(\d+)\s*(hour|day)/i);
            let durationHours = 24;
            if (durationMatch) {
                const num = parseInt(durationMatch[1]);
                if (durationMatch[2].toLowerCase() === 'day') durationHours = num * 24;
                else if (durationMatch[2].toLowerCase() === 'hour') durationHours = num;
            }
            updateNotificationDue(userId, msisdn, `${internet_quota} (${preferred_name || name})`, durationHours);

            return { status: 'success', reference: referenceNumber };
        } else {
            // Jika bukan RECEIVEOK DAN status URL bukan Success, anggap gagal
            throw new Error(`Pengesahan akhir gagal. Respons: ${resCallback.data.trim()}. Status Pembayaran URL: ${paymentStatus}`);
        }

    } catch (e) {
        log(`Ralat: ${e.message}`);
        
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

const userSession = {};

function normalizePhone(phone) {
    phone = phone.replace(/\D/g, '');
    if (phone.startsWith('60')) return phone;
    if (phone.startsWith('0')) return '60' + phone.substring(1);
    return '60' + phone;
}

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

async function subscribeUnlimitedCall(msisdn, idToken, price, productKey) {
    try {
        const headers = {
            "x-dynatrace": "MT_3_16_1522471433_8-0_e9ba6289-2990-4491-bb2c-bc8c2d6c256b_0_577_684",
            "Accept": "application/json",
            "msisdn": msisdn,
            "Content-Type": "application/json",
            "Authorization": idToken,
            "appVersion": "3.0.67",
            "buildNumber": "200809",
            "os": "android",
            "screenDensity": "1x",
            "Accept-Charset": "UTF-8",
            "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 10; 23078RKD5C Build/TKQ1.221114.001)",
            "Host": "apicl3.celcom.com.my",
            "Connection": "Keep-Alive",
            "Accept-Encoding": "gzip"
        };
        const transactAddon = price === "1.00" ? "call-RM1" : "call-RM3";
        const payload = {
            "msisdn": msisdn,
            "planName": "Base Plan Meta High Speed",
            "price": price,
            "productId": "2060377",
            "productKey": productKey,
            "personaliseAdobeInfo": {
                "transact_product": "",
                "transact_product_addons": `${transactAddon}|null|null`,
                "transact_pid": "2060377",
                "transact_value": price
            },
            "resubscribeFlag": false,
            "predefinedFlag": false
        };
        const apiUrl = "https://apicl3.celcom.com.my/plans-and-add-ons-mgmt/meta/metaMaxupPurchase?lang=en";
        const response = await axios.post(apiUrl, payload, { headers });
        if (response.status === 200) {
            return {
                success: true,
                message: response.data.message || "Langganan berjaya"
            };
        } else {
            return {
                success: false,
                message: `Gagal melanggan: ${response.data.message || "Ralat tidak diketahui"}`
            };
        }
    } catch (error) {
        return {
            success: false,
            message: `Ralat: ${error.message}`
        };
    }
}

// === REFRESH TOKEN CELCOM ===
async function refreshCelcomTokenByFile(phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    const outputFile = path.join(dataDir, `${cleanPhone}.celcom.txt`);
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
        const firebaseData = {
            "grant_type": "refresh_token",
            "refresh_token": refreshToken
        };
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

// === DASHBOARD CELCOM ===
async function getCelcomDashboard(msisdn, idToken) {
    // Format msisdn ke 01xxxxxxxxx
    let formattedMsisdn = msisdn;
    if (msisdn.startsWith('60')) formattedMsisdn = '0' + msisdn.substring(2);

    // Billing
    const billingUrl = "https://apicl3.celcom.com.my/home-view/home-data/balance";
    const billingParams = { "isInitialRequest": "true", "lang": "en" };
    const billingHeaders = {
        "Accept": "application/json",
        "deviceModel": "V2202",
        "Content-Type": "application/json",
        "Authorization": idToken,
        "msisdn": formattedMsisdn,
        "appVersion": "3.0.70",
        "deviceId": "2f66e7c375ed06f4",
        "os": "android",
        "buildNumber": "200843",
        "Accept-Charset": "UTF-8",
        "User-Agent": "Dalvik/2.1.0 (Linux; Android 14; V2202 Build/UP1A.231005.007)",
        "Host": "apicl3.celcom.com.my",
        "Connection": "Keep-Alive",
        "Accept-Encoding": "gzip"
    };

    const billingResponse = await axios.get(billingUrl, { headers: billingHeaders, params: billingParams });
    const billingData = billingResponse.data;
    const duePayment = billingData.duePayment || {};

    // Usage (addOnPacks)
    let addOnPacks = [];
    try {
        const usageUrl = "https://apicl3.celcom.com.my/subscriber-usage-info/v2/local";
        const usageParams = { "lang": "en", "isB40RedeemChecked": "true", "is1GBRedeemCheck": "false" };
        const usageResponse = await axios.get(usageUrl, { headers: billingHeaders, params: usageParams });
        if (usageResponse.status === 200 && usageResponse.data.statusCode !== 500) {
            const usageData = usageResponse.data;
            if (usageData.internet && usageData.internet.addOnPacks && usageData.internet.addOnPacks.length > 0) {
                addOnPacks = usageData.internet.addOnPacks;
            }
        }
    } catch (e) {}
    return {
        msisdn: formattedMsisdn,
        lineStatus: duePayment.lineStatus || 'N/A',
        balance: duePayment.balance || 'N/A',
        plan: duePayment.planName || 'N/A',
        expiryDate: duePayment.payBefore ? formatDate(duePayment.payBefore) : 'N/A',
        addOnPacks
    };
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

// === REFRESH TOKEN MAXIS ===
async function refreshMaxisTokenByFile(phone) {
    const cleanPhone = normalizePhone(phone);
    const outputFile = path.join(dataDir, `${cleanPhone}.maxis.txt`);
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

    const headers = {
        "channel": "hra",
        "x-api-key": "08bdedcf-6757-4c96-8efa-dbea297b0946",
        "x-apigw-api-id": "a8pdjulkwe",
        "content-type": "application/json",
        "user-agent": "okhttp/4.11.0",
        "clientversion": "5.19.0",
        "cookie": cookie
    };
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

async function extendValidityMaxis1(msisdn, token) {
    const axios = require('axios');
    try {
        const url = `https://api-digital.maxis.com.my/prod/api/v1.0/topup/extendvalidity?languageId=1&msisdn=${msisdn}`;
        const headers = {
            "Host": "api-digital.maxis.com.my:4463",
            "channel": "HRA",
            "authorization": token,
            "clientapikey": "h0tl1nk@pp!",
            "content-type": "application/json; charset=utf-8",
            "accept": "application/vnd.maxis.v2+json",
            "languageid": "1",
            "x-api-key": "08bdedcf-6757-4c96-8efa-dbea297b0946",
            "rateplanboid": "57313918",
            "accept-encoding": "gzip",
            "user-agent": "okhttp/4.12.0",
            "x-apigw-api-id": "a8pdjulkwe",
            "clientversion": "5.31.1",
            "platform": "android"
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


// === DIGI API ===
async function getDigiAccountInfo(ssi, msisdn) {
    const url = "https://mydigiapp.digi.com.my/checkSession";
    const headers = {
        "Host": "mydigiapp.digi.com.my",
        "accept": "application/json",
        "deviceid": "random-device-id",
        "applicationversion": "14.0.11",
        "devicename": "random-device-name",
        "devicemodel": "V2202",
        "devicebrand": "vivo",
        "deviceversion": "14",
        "deviceos": "Android",
        "systemversion": "14",
        "appversion": "14.0.11.1102014615",
        "useragent": "Mozilla/5.0 (Linux; Android 14; V2202 Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/135.0.7049.38 Mobile Safari/537.36",
        "msisdin": msisdn,
        "language": "ms",
        "digiauth": ssi,
        "content-type": "application/json",
        "accept-encoding": "gzip",
        "cookie": `sid=${ssi}`,
        "user-agent": "okhttp/4.10.0"
    };
    const data = { msisdn };
    const response = await axios.post(url, data, { headers });
    let planName = 'N/A';
    let number = 'N/A';
    if (response.data && response.data.data && response.data.data.subscriberRecord) {
        const subscriber = response.data.data.subscriberRecord;
        number = subscriber.MSISDN || 'N/A';
        if (Array.isArray(subscriber.offersRecords)) {
            const primary = subscriber.offersRecords.find(
                o => o.Status === "ACTIVE" && o.OfferType === "PRIMARY"
            );
            planName = primary ? primary.OfferName : 'N/A';
        }
    }
    return { number, planName };
}
async function getBillingInfo(ssi, msisdn) {
    const url = "https://mydigiapp.digi.com.my/api/usage";
    const headers = {
        "Host": "mydigiapp.digi.com.my",
        "digiauth": ssi,
        "accept-encoding": "gzip",
        "cookie": `sid=${ssi}`,
        "user-agent": "okhttp/4.10.0"
    };
    const response = await axios.get(url, { headers });
    const currentPlanDetails = response.data.data && response.data.data.currentPlanDetails
        ? response.data.data.currentPlanDetails
        : {};
    const plans = [];
    ["voice", "internet"].forEach(category => {
        if (currentPlanDetails[category]) {
            currentPlanDetails[category].forEach(plan => {
                plans.push({
                    planDescription: plan.planDescription || "N/A",
                    total: formatQuota(plan.total),
                    balance: formatQuota(plan.balance),
                    expiredDate: plan.expiredDate || "N/A",
                    note: plan.note || "N/A"
                });
            });
        }
    });
    const hiddenQuota = [];
    const serviceRecords = response.data._data && response.data._data.serviceRecords
        ? response.data._data.serviceRecords
        : [];
    serviceRecords.forEach(record => {
        if (record.QuotaList && Array.isArray(record.QuotaList.QuotaRecord)) {
            record.QuotaList.QuotaRecord.forEach(q => {
                if (q.QuotaAttribute === 1) {
                    hiddenQuota.push({
                        description: q.Description || "N/A",
                        total: formatQuota(q.Total),
                        balance: formatQuota(q.Balance)
                    });
                }
            });
        }
    });
    let credit = 'N/A';
    let creditExpiry = 'N/A';
    const balanceRecords = response.data._data && response.data._data.balanceRecords
        ? response.data._data.balanceRecords
        : [];
    if (balanceRecords.length > 0) {
        credit = formatRMFromCent(balanceRecords[0].Amount);
    }
    if (balanceRecords.length > 2) {
        creditExpiry = balanceRecords[2].AccountExpiryDate || 'N/A';
    }
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

// === MAXIS API ===
const maxisHeaders = {
    "channel": "hra",
    "x-api-key": "08bdedcf-6757-4c96-8efa-dbea297b0946",
    "x-apigw-api-id": "a8pdjulkwe",
    "content-type": "application/json",
    "user-agent": "okhttp/4.11.0",
    "clientversion": "5.19.0"
};
async function maxisSendOtp(phone) {
    const url = `https://api-digital.maxis.com.my/prod/api/v4.0/users/otp?languageId=1&msisdn=${phone}`;
    const response = await axios.get(url, { headers: maxisHeaders });
    if (!response.data.responseData) throw new Error('Gagal hantar OTP Maxis.');
    return response.data.responseData.processId;
}
async function maxisVerifyOtp(phone, processId, otp) {
    const url = `https://api-digital.maxis.com.my/prod/api/v4.0/users/otp?languageId=1&msisdn=${phone}`;
    const headers = { ...maxisHeaders, 'content-type': 'application/json' };
    const data = {
        processId,
        otp,
        cookie: "AWSALB=Q4YaQ9mRZZe4eDcnfWA8/SAPlERgXRmOmHOcqUPJJis/co83prJo9IBXNt73rgWvfsQgRv5ZG6Og6U46E0VUl/eZw57XNR2Fn7VzjjBLY1aeEGz7hhuNTVackjth;"
    };
    const response = await axios.put(url, data, { headers });
    if (response.data.status === 'fail' || !response.data.responseData) throw new Error('OTP salah atau gagal login Maxis.');
    return response.data.responseData.cookie;
}
async function maxisGetDashboard(token, msisdn) {
    const dataUrl = `https://api-digital.maxis.com.my/prod/api/v5.0/account/balance/data?languageId=1&msisdn=${msisdn}`;
    const headers = {
        ...maxisHeaders,
        "authorization": token,
        "rateplanid": "67",
        "clientapikey": "h0tl1nk@pp!",
        "accept": "application/vnd.maxis.v2+json",
        "rateplanboid": "57313918",
        "accept-encoding": "gzip",
        "user-agent": "okhttp/4.12.0",
        "platform": "android"
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
            renewal: responseData.focDataDetail.renewalDate ?
                moment(responseData.focDataDetail.renewalDate).format('DD-MM-YYYY HH:mm:ss') : 'N/A'
        } : null,
        creditInfo: {
            balance: creditData.balance ? (creditData.balance / 100).toFixed(2) + ' RM' : 'N/A',
            expiry: creditData.expiry ? moment(creditData.expiry).format('DD-MM-YYYY HH:mm:ss') : 'N/A',
            ratePlanName: creditData.accountInfo ? creditData.accountInfo.ratePlanName : 'N/A',
            accountStatus: creditData.accountStatus || 'N/A',
            graceExpiry: creditData.graceExpiry ?
                moment(creditData.graceExpiry).format('DD-MM-YYYY HH:mm:ss') : 'N/A'
        }
    };
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

// === BOT TELEGRAM ===
const bot = new TelegramBot(TOKEN, { polling: true });


// Contoh: letak di atas sekali

function isAdmin(userId) {
  return ADMIN_IDS.includes(Number(userId));
}


function digiMenu(chatId) {
    bot.sendMessage(chatId, 'Pilih menu Digi:', {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'Nombor Telefon Baru', callback_data: 'digi_login_new' },
                    { text: 'Guna Nombor Sedia Ada', callback_data: 'digi_login_existing' }
                ],
                [{ text: '⬅️ Kembali ke Menu', callback_data: 'back_main' }]
            ]
        }
    });
}

function maxisMenu(chatId) {
    bot.sendMessage(chatId, 'Pilih menu Maxis:', {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'Nombor Telefon Baru', callback_data: 'maxis_login_new' },
                    { text: 'Guna Nombor Sedia Ada', callback_data: 'maxis_login_existing' }
                ],
                [{ text: '⬅️ Kembali ke Menu', callback_data: 'back_main' }]
            ]
        }
    });
}

// === Tambah ini untuk Celcom ===
function celcomMenu(chatId) {
    bot.sendMessage(chatId, 'Pilih menu Celcom:', {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'Nombor Telefon Baru', callback_data: 'celcom_login_new' },
                    { text: 'Guna Nombor Sedia Ada', callback_data: 'celcom_login_existing' }
                ],
                [{ text: '⬅️ Kembali ke Menu', callback_data: 'back_main' }]
            ]
        }
    });
}


// PENTING: Pastikan semua pembolehubah (variables) dan fungsi berikut telah diisytiharkan/ditentukan di bahagian lain kod anda:
// - bot (objek Telegram Bot)
// - MAINTENANCE_MODE (boolean)
// - isAdmin(userId) (fungsi boolean)
// - hasAccess(userId) (fungsi boolean)
// - userState (objek untuk menyimpan status pengguna)
// - SERVER_IMAGE (pembolehubah untuk URL/path imej)
// - addUserToBot(userId) (fungsi)

// Gabungan logik /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = Number(msg.from.id);
    const firstName = msg.from.first_name || 'User';

    // Logik: Tambah pengguna ke pangkalan data/rekod (dari skrip kedua)
    // Sila pastikan fungsi ini wujud:
    // addUserToBot(userId); 

    // 1. SEMAK MAINTENANCE MODE (dari skrip pertama)
    if (MAINTENANCE_MODE && !isAdmin(userId)) {
        return bot.sendMessage(chatId, '🚧 *Bot sedang dalam penyelenggaraan (Maintenance Mode).* Sila cuba lagi sebentar nanti.', { parse_mode: 'Markdown' });
    }

    // 2. SEMAK KUNCI AKSES (dari skrip pertama)
    if (!isAdmin(userId) && !hasAccess(userId)) {
        userState[chatId] = { step: 'access_key_wait', userId: String(userId) };
        return bot.sendMessage(chatId, 
            '⚠️ *Sila masukkan Key Access Bot yang diterima dari Admin* untuk meneruskan:\n\n' +
            'Jika anda tidak mempunyai Key Access, sila hubungi Admin.', 
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

    // Jika melepasi semua semakan, tunjukkan menu utama
    mainMenu(chatId, String(userId), firstName);
});


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
        
        `<ins>Bot masih dalam fasa *pengujian*. Sila laporkan isu kepada Admin @bossgass:</ins>\n` +
        `<b>Status Bot:</b> ${MAINTENANCE_MODE ? '❌ MAINTENANCE MODE' : '✅ ONLINE'}`;

    // Gabungan Butang Menu
    let buttons = [
        // Baris 1: CELCOM Digi (NGA)
        [{ text: 'CELCOM Digi (Baru)', callback_data: 'menu_telco' }], 
        
        // Baris 2: Telco Lama - DIGI & MAXIS
        [{ text: 'TELCO DIG1 (Digi Sahaja)', callback_data: 'check_digi' }, { text: 'TELCO MAX1S (Maxis Sahaja)', callback_data: 'check_maxis' }], 
        
        // Baris 3: Telco Lama - CELCOM
        [{ text: 'TELCO CELC0M (Celcom Sahaja)', callback_data: 'check_celcom' }]
    ];

    // Butang Admin
    if (isAdmin(Number(userId))) {
        buttons.push([{ text: '🔑 Menu Admin', callback_data: 'admin_menu' }]); 
        buttons.push([{ text: '📢 Broadcast Message', callback_data: 'admin_broadcast_start' }]); 
    }

    const options = {
        caption: caption,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    };

    // Logik hantar Photo/Message
    if (SERVER_IMAGE) {
        bot.sendPhoto(chatId, SERVER_IMAGE, options)
           .catch(e => {
               // Fallback jika masih terlalu panjang atau ralat lain
               console.error("Gagal hantar Photo dengan caption:", e.message);
               delete options.caption;
               bot.sendMessage(chatId, caption, options);
           });
    } else {
        delete options.caption;
        bot.sendMessage(chatId, caption, options);
    }
}




async function displayDashboard(chatId, userId, msisdn) {
  const cookie = getCookie(userId, msisdn);
  if (!cookie) {
    bot.sendMessage(chatId, 'Cookie tamat tempoh. Sila login semula untuk nombor ini.', {
         reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu Utama', callback_data: 'back_menu' }]] } 
    });
    // Hanya padam data jika user biasa, jika admin yang akses, jangan padam.
    if (!isAdmin(Number(userId)) || userId !== String(getUserData(userId, msisdn)?.chatId)) {
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


    const headers = { ...deviceHeadersBase, cookie };
    const userData = getUserData(userId, msisdn); 
    // Baris Auto-Renew dibuang

    // 1. Dapatkan Maklumat Asas
    const dashBasic = await axios.get('https://nga.celcomdigi.com/subscriber', { headers });
    const data = dashBasic.data.data;
    
    // Simpan telco (jika belum ada) dan chatId untuk kegunaan scheduler (hanya jika bukan admin login)
    if (!isAdmin(Number(userId)) || userId === String(getUserData(userId, msisdn)?.chatId)) {
        saveUserData(userId, msisdn, { telco: data.telco, chatId: chatId });
    }

    // 2. Dapatkan Baki Kredit
    let balanceText = 'N/A';
    try {
        const balanceHeaders = { ...deviceHeadersBase, screen: 'dashboard-balance', cookie };
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
      `${notificationInfoText}\n\n`; // Masukkan info notifikasi
      
    // 3. Dapatkan Penggunaan Data (LOGIK KEMAS KINI)
    const dashUsage = await axios.get('https://nga.celcomdigi.com/account/v1/usage', { headers });
    const internetPlans = dashUsage.data.data.plan.internet || [];
    
    // LOGIK BARU: Gabung dan tapis data (Saring kuota 0)
    const combinedPlans = {};
    const mobileShieldPlans = [];

    internetPlans.forEach(plan => {
        const balanceNum = Number(plan.balance);
        const totalNum = Number(plan.total);
        
        // ** LOGIK MOBILESHIELD BARU **
        if (plan.plan === 'Lifestyle_Prepaid') {
            // Hanya masukkan pelan MobileSHIELD yang mempunyai kuota > 0
            if (!isNaN(totalNum) && totalNum > 0) { 
                mobileShieldPlans.push(plan);
            }
            return; // Skip MobileSHIELD untuk logik gabungan biasa
        }
        
        // 2. Logik gabungan biasa (Saring kuota 0)
        // Gabungkan berdasarkan nama plan + tarikh luput (kecuali 'unlimited' atau 'N/A')
        if (plan.balance === 'unlimited' || (balanceNum > 0) || plan.balance === 'N/A') {

            const key = plan.plan + '|' + plan.expiryDate; 
            
            if (!combinedPlans[key]) {
                combinedPlans[key] = {
                    plan: plan.plan,
                    total: totalNum,
                    balance: balanceNum,
                    expiryDate: plan.expiryDate,
                    expiryText: plan.expiryText,
                    // Simpan kuota asal untuk rujukan (jika 'unlimited' atau 'N/A')
                    originalTotal: plan.total, 
                    originalBalance: plan.balance 
                };
            } else {
                // Tambah kuota (jika nombor, abaikan 'unlimited')
                if (!isNaN(balanceNum) && combinedPlans[key].originalBalance !== 'unlimited') {
                    combinedPlans[key].total += totalNum;
                    combinedPlans[key].balance += balanceNum;
                }
            }
        }
    });

    // ** LOGIK BARU: Gabungkan MobileSHIELD **
    let totalMobileShieldQuota = 0;
    let totalMobileShieldBalance = 0;
    
    mobileShieldPlans.forEach(plan => {
        const balanceNum = Number(plan.balance);
        const totalNum = Number(plan.total);
        // Pastikan ia bukan 'unlimited' dan nombor yang sah
        if (!isNaN(balanceNum) && !isNaN(totalNum)) {
            totalMobileShieldQuota += totalNum;
            totalMobileShieldBalance += balanceNum;
        }
    });
    
    // Tambah MobileSHIELD yang digabungkan (jika total kuota > 0)
    if (totalMobileShieldQuota > 0) {
        combinedPlans['MobileSHIELD_Prepaid_Combined'] = {
            plan: 'Lifestyle_Prepaid (Combined)',
            total: totalMobileShieldQuota,
            balance: totalMobileShieldBalance,
            expiryDate: 'N/A', 
            expiryText: 'N/A (Expiry Hidden)', 
            originalTotal: totalMobileShieldQuota,
            originalBalance: totalMobileShieldBalance
        };
    }

    const finalPlans = Object.values(combinedPlans); // Tukar kembali kepada array
    
    if (finalPlans.length === 0) {
      message += "Tiada maklumat Data aktif ditemui.\n\n";
    } else {
      message += "<b>📶 Maklumat Data Aktif Anda:</b>\n";
      finalPlans.forEach((plan, index) => {
        
        const finalQuotaDisplay = formatQuota(plan.total);
        const finalBalanceDisplay = formatQuota(plan.balance);
        
        let planMessage = '';
        if (plan.plan === 'MobileSHIELD_Prepaid (Combined)') {
            // Paparan khas untuk MobileSHIELD (tanpa expiry)
            planMessage += `Plan #${index + 1}:\n` +
                       ` - Name: Lifestyle_Prepaid\n` +
                       ` - Quota: ${finalQuotaDisplay}\n` +
                       ` - Balance: ${finalBalanceDisplay}\n\n`;
        } else {
            // Paparan biasa
            planMessage += `Plan #${index + 1}:\n` +
                       ` - Name: ${plan.plan}\n` +
                       ` - Quota: ${plan.originalTotal === 'unlimited' ? 'Unlimited' : finalQuotaDisplay}\n` +
                       ` - Balance: ${plan.originalBalance === 'unlimited' ? 'Unlimited' : finalBalanceDisplay}\n` +
                       ` - Expiry: ${formatDate(plan.expiryDate)} (${plan.expiryText})\n\n`;
        }
          
        message += planMessage;
      });
    }
    
    await bot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '👑Langganan Spam & Special Quota', callback_data: 'setup_renew_spam' }], 
          [{ text: '🔎 Check All Addons CelcomDigi', callback_data: 'check_all_addons' }], 
     //     [{ text: '❌ Padam Nombor Ini (Logout)', callback_data: `delete_msisdn_${msisdn}` }], 
          [{ text: '🏠 Kembali ke Menu Utama', callback_data: 'back_menu' }]
        ]
      }
    });
  } catch (e) {
    console.error('Display dashboard error (API Utama):', e.response?.data || e.message);
    bot.sendMessage(chatId, 'Gagal papar dashboard. Cookie mungkin tamat tempoh. Sila login semula.', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu Utama', callback_data: 'back_menu' }]] } 
    });
    if (!isAdmin(Number(userId)) || userId !== String(getUserData(userId, msisdn)?.chatId)) {
        deleteUserData(userId, msisdn);
    }
    if (userState[chatId]) delete userState[chatId];
  }
}

// --- Tambahan Fungsi Loop Spam & Broadcast (Sama seperti sebelumnya) ---

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
        // Hantar mesej dalam processSubscription
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
            console.error('Gagal update status:', e.message);
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

const userStates = {};

bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const session = userSession[chatId];

  // Pastikan user memang dalam mode 'await_html_code'
  if (session && session.state === 'await_html_code') {
    // Hanya proses fail HTML
    if (msg.document.mime_type === 'text/html' || msg.document.file_name.endsWith('.html')) {
      try {
        // Dapatkan link fail dari Telegram
        const fileId = msg.document.file_id;
        const fileLink = await bot.getFileLink(fileId);

        // Download isi fail
        const response = await axios.get(fileLink);
        const htmlCode = response.data;

        bot.sendMessage(chatId, 'Sedang convert, sila tunggu...');
        const id = await convertHtmlToWeb(htmlCode);

        if (id) {
          const link = `https://htmlviewermrsb.gleeze.com/view/${id}`;
          bot.sendMessage(chatId, `Ini link web version anda:\n${link}`);
        } else {
          bot.sendMessage(chatId, 'Maaf, berlaku ralat semasa convert HTML.');
        }
      } catch (e) {
        bot.sendMessage(chatId, 'Gagal membaca fail HTML.');
      }
      userSession[chatId] = null;
    } else {
      bot.sendMessage(chatId, 'Sila hantar fail .html sahaja.');
    }
  }
});


async function extendValidity(formattedMsisdn, idToken, productId) {
  const axios = require('axios');
  try {
    const headers = {
      'content-type': 'application/json',
      'Host': 'apicl3.celcom.com.my',
      'Authorization': idToken,
      'x-dynatrace': 'MT_3_14_1938539898_77-0_e9ba6289-2990-4491-bb2c-bc8c2d6c256b_0_8362_1181',
      'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 10; NX729J Build/KOT49H)',
      'Accept-Encoding': 'gzip',
      'Connection': 'Keep-Alive',
      'Accept': 'application/json',
    };
    const data = {
      "subscriberNo": formattedMsisdn,
      "productId": productId,
    };
    const response = await axios.post(
      'https://apicl3.celcom.com.my/subscriber-billing-info/billing/extendValidity?lang=en',
      data,
      { headers: headers }
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


// PENTING: Pastikan semua pembolehubah (variables) dan fungsi berikut telah diisytiharkan/ditentukan di bahagian lain kod anda:
// - bot (objek Telegram Bot)
// - MAINTENANCE_MODE (boolean)
// - isAdmin(userId) (fungsi boolean)
// - hasAccess(userId) (fungsi boolean)
// - userState (objek untuk menyimpan status pengguna CelcomDigi)
// - userSession (objek untuk menyimpan status pengguna Digi/Maxis/Celcom lama)
// - getUserAccounts, getUserData, deleteUserData, getCookie, displayDashboard, 
//   processSubscription, getCmpOffer, isMobileShieldUser, readMobileShieldUsers, 
//   readAccessKeys, writeAccessKeys, revokeAllUserAccess, ... (fungsi CelcomDigi)
// - digiMenu, maxisMenu, celcomMenu, freebiesData, freebiesCelcom, formatDashboardMaxis, 
//   formatDashboardCelcom, subscribeUnlimitedCall, extendValidity, ... (fungsi Telco lain/VPN)
// - CMP_RM1_DAILY_ID, MOBILESHIELD_PRODUCT_DATA, MOBILESHIELD_SKU, MAX_SPAM_COUNT (pembolehubah global)

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;
    const userId = String(query.from.id);
    const session = userSession[chatId]; // Ambil sesi untuk Telco lama/VPN
    
    // Logik CelcomDigi/Skrip 1: SEMAK MAINTENANCE MODE & KUNCI AKSES
    if (MAINTENANCE_MODE && !isAdmin(Number(userId)) && data !== 'back_menu') {
        try { await bot.deleteMessage(chatId, messageId); } catch {}
        return bot.sendMessage(chatId, '🚧 *Bot sedang dalam penyelenggaraan (Maintenance Mode).* Sila cuba lagi sebentar nanti.', { parse_mode: 'Markdown' });
    }
    
    if (!isAdmin(Number(userId)) && !hasAccess(Number(userId)) && data !== 'back_menu') {
        // Abaikan callback dari user tanpa akses (kecuali back_menu)
        try { await bot.deleteMessage(chatId, messageId); } catch {}
        return; 
    }

    // Cuba padam mesej asal (dari skrip 1 & 2)
    try { await bot.deleteMessage(chatId, messageId); } catch (e) {}

    // =================================================================
    // >>> LOGIK MENU UTAMA (CELCOMDIGI & UMUM) <<<
    // =================================================================

    if (data === 'back_menu') {
        // RESET kedua-dua sesi/state
        if (userState[chatId]) delete userState[chatId];
        if (userSession[chatId]) delete userSession[chatId];
        mainMenu(chatId, userId, query.from.first_name || 'User');
        return;
    }
    
    // --- Handlers Menu Utama CelcomDigi (Skrip 1) ---
    else if (data === 'menu_telco') {
        const userAccounts = getUserAccounts(userId);
        const hasAccounts = userAccounts && Object.keys(userAccounts).length > 0;
        
        const menuButtons = [
            [{ text: '➕ Nombor Telefon Baru (Request Otp)', callback_data: 'nombor_baru' }]
        ];

        if (hasAccounts) {
            menuButtons.push([{ text: '📋 Guna Nombor Sedia Ada', callback_data: 'senarai_nombor' }]);
        }
        
        menuButtons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'back_menu' }]);
        
        bot.sendMessage(chatId, 'Pilih salah satu:', {
            reply_markup: {
                inline_keyboard: menuButtons
            }
        });
    } 
    else if (data === 'nombor_baru') {
        userState[chatId] = { userId: userId, step: 'minta_msisdn' };
        
        const buttons = [
            [{ text: '❌ Batal', callback_data: 'menu_telco' }] 
        ];
        
        bot.sendMessage(chatId, 'Sila masukkan nombor telefon Celcom/Digi (contoh: 60123456789):', {
            reply_markup: { inline_keyboard: buttons }
        });
    } 
    // Logik: PAPARKAN SENARAI NOMBOR CelcomDigi
    else if (data === 'senarai_nombor') {
        const userAccounts = getUserAccounts(userId);
        if (!userAccounts || Object.keys(userAccounts).length === 0) {
            return bot.sendMessage(chatId, 'Anda tiada nombor sedia ada yang didaftarkan. Sila tambah nombor baru.', {
                reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'menu_telco' }]] }
            });
        }
        
        let message = '📞 *Nombor Telefon Sedia Ada*:\n\nSila pilih nombor untuk lihat dashboard:';
        const buttons = [];
        
        for (const msisdn in userAccounts) {
            const account = userAccounts[msisdn];
            const telco = account.telco || 'N/A';
            // Pastikan bukan penanda akses yang tersimpan
            if (msisdn === '00000000000') continue;
            
            buttons.push([{ 
                text: `${msisdn} - ${telco}`, 
                callback_data: `view_msisdn_${msisdn}` 
            }]);
        }
        
        buttons.push([{ text: '🔙 Kembali ke Pilihan Login', callback_data: 'menu_telco' }]);
        
        bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        });
    }
    // Logik: BUTANG PILIH NOMBOR DITEKAN (CelcomDigi)
    else if (data && data.startsWith('view_msisdn_')) {
        const msisdn = data.replace('view_msisdn_', '');
        const userData = getUserData(userId, msisdn);
        
        if (!userData) {
            return bot.sendMessage(chatId, 'Nombor tidak ditemui dalam rekod anda. Sila login semula.', {
                reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'senarai_nombor' }]] }
            });
        }
        
        if (!userData.cookie) {
            bot.sendMessage(chatId, 'Cookie untuk nombor ini telah luput. Sila login dengan OTP semula.');
            deleteUserData(userId, msisdn);
            return;
        }
        
        userState[chatId] = { userId: userId, msisdn: msisdn, step: 'dashboard_view' };
        bot.sendMessage(chatId, `Memuatkan dashboard untuk ${msisdn}...`);
        await displayDashboard(chatId, userId, msisdn);
    }
    
    // Logik: PAPARKAN DASHBOARD (CelcomDigi)
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

    // --- Handlers Telco Lama (Skrip 2) ---
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
    // Logik digi_login_new, maxis_login_new, celcom_login_new, etc. (sama seperti skrip 2)
    // Sila pastikan fungsi 'digiMenu', 'maxisMenu', 'celcomMenu' wujud
    else if (data === 'digi_login_new') {
        userSession[chatId] = { telco: 'digi', state: 'await_phone' };
        bot.sendMessage(chatId, 'Masukkan nombor telefon Digi (cth: 60123456789):', {
            reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Digi Menu', callback_data: 'check_digi' }]] }
        });
    }
    else if (data === 'digi_login_existing') {
        userSession[chatId] = { telco: 'digi', state: 'await_existing' };
        bot.sendMessage(chatId, 'Masukkan nombor telefon Digi yang pernah anda daftar:', {
            reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Digi Menu', callback_data: 'check_digi' }]] }
        });
    }
    else if (data === 'digi_owner') {
        userSession[chatId] = { telco: 'digi', state: 'await_owner' };
        bot.sendMessage(chatId, 'Masukkan ID owner Digi untuk akses:', {
            reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Digi Menu', callback_data: 'check_digi' }]] }
        });
    }
    // --- Logik Maxis ---
    else if (data === 'maxis_login_new') {
        userSession[chatId] = { telco: 'maxis', state: 'await_phone' };
        bot.sendMessage(chatId, 'Masukkan nombor telefon Maxis (cth: 60123456789):', {
            reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]] }
        });
    }
    else if (data === 'maxis_login_existing' || data === 'back_maxis_dashboard') {
        // Mengendalikan 'back_maxis_dashboard' (Skrip 2)
        const dashCtx = userSession[chatId]?.lastMaxisDash || (session?.maxis ? { token: session.maxis.token, msisdn: session.maxis.msisdn } : null);
        
        if (data === 'maxis_login_existing' && dashCtx) {
            // Jika ada sesi sedia ada, terus ke dashboard
            // Tindakan ini bergantung kepada logik `maxis_login_existing` yang asal
            // Untuk mematuhi skrip 2, kita set state dan minta input dahulu
            userSession[chatId] = { telco: 'maxis', state: 'await_existing' };
            bot.sendMessage(chatId, 'Masukkan nombor telefon Maxis yang pernah anda daftar:', {
                reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]] }
            });
            return;
        }

        if (data === 'back_maxis_dashboard' && dashCtx?.msisdn) {
            const refreshed = await refreshMaxisTokenByFile(dashCtx.msisdn);
            if (!refreshed) {
                bot.sendMessage(chatId, 'Token Maxis tamat. Sila login semula.', {
                    reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]] }
                });
                return;
            }
            try {
                const dash = await maxisGetDashboard(refreshed.token, refreshed.msisdn);
                userSession[chatId].maxis = {
                    token: refreshed.token,
                    msisdn: refreshed.msisdn,
                    accno: refreshed.accno,
                    cookie: refreshed.cookie
                };
                userSession[chatId].lastMaxisDash = { token: refreshed.token, msisdn: refreshed.msisdn };
                const dashboardMsg = formatDashboardMaxis(dash);
                const freebiesBtns = freebiesData.map((f, idx) => [{ text: f.title, callback_data: `maxis_freebies_${idx}` }]);
                freebiesBtns.push([{ text: 'Langgan Extend Validity', callback_data: 'maxis_extend_validity_1' }]); // Tambah Extend Validity
                freebiesBtns.push([{ text: 'Tebus Giveaway', callback_data: 'maxisredeemgiveaway' }]); // Tambah Giveaway
                freebiesBtns.push([{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]);
                
                bot.sendMessage(chatId, dashboardMsg, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: freebiesBtns }
                });
            } catch (e) {
                bot.sendMessage(chatId, 'Ralat semasa memuat dashboard Maxis.');
            }
            return;
        }
        
        userSession[chatId] = { telco: 'maxis', state: 'await_existing' };
        bot.sendMessage(chatId, 'Masukkan nombor telefon Maxis yang pernah anda daftar:', {
            reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]] }
        });
        
    }
    // ... Logik Maxis lain (Owner, Extend Validity 1, Redeem Giveaway, Freebies Confirmation/Proceed)
    else if (data === 'maxis_owner') {
        userSession[chatId] = { telco: 'maxis', state: 'await_owner' };
        bot.sendMessage(chatId, 'Masukkan ID owner Maxis untuk akses:', {
            reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]] }
        });
    }
    else if (data === 'maxis_extend_validity_1') {
        const s = userSession[chatId];
        if (!s || !s.maxis || !s.maxis.token || !s.maxis.msisdn) {
            bot.sendMessage(chatId, 'Sesi Maxis tamat. Sila /start semula.');
            return;
        }
        bot.sendMessage(chatId, 'Memproses Extend Validity 1 Hari...');
        try {
            const response = await extendValidityMaxis1(s.maxis.msisdn, s.maxis.token);
            if (response && response.status === "success") {
                bot.sendMessage(chatId, `✅ Berjaya extend validity:
    ${response.message || 'Validity dilanjutkan 1 hari.'}`);
            } else {
                bot.sendMessage(chatId, `❌ Gagal extend validity. SIM masih aktif.
    ${JSON.stringify(response) || "Sila cuba lagi."}`);
            }
        } catch (e) {
            bot.sendMessage(chatId, `❌ Ralat Extend Validity: ${e.message}`);
        }
    }
    else if (data === "maxisredeemgiveaway") {
        bot.sendMessage(chatId, "Sila masukkan kod giveaway anda:");
        userSession[chatId].state = "awaitmaxisgiveawaycode";
    }
    // ... Logik Maxis Freebies (sama seperti skrip 2)
    else if (data.startsWith('maxis_freebies_')) {
        const idx = parseInt(data.split('_')[2]);
        const freebies = freebiesData[idx];
        userSession[chatId].pendingFreebies = idx;
        if (session.maxis && session.maxis.token && session.maxis.msisdn) {
            userSession[chatId].lastMaxisDash = {
                token: session.maxis.token,
                msisdn: session.maxis.msisdn
            };
        }
        bot.sendMessage(chatId,
            `*Adakah anda berminat untuk melanggan ${freebies.title}?*\n\n` +
            `Kredit akan ditolak sebanyak *${freebies.description.split(' ')[0]}* (${freebies.description}).\n\n` +
            `Tekan "Teruskan Langganan" untuk meneruskan, atau "⬅️ Kembali ke Dashboard" untuk batal.`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Teruskan Langganan', callback_data: `maxis_confirm_${idx}` }
                        ],
                        [
                            { text: '⬅️ Kembali ke Dashboard', callback_data: 'back_maxis_dashboard' }
                        ]
                    ]
                }
            }
        );
    }
    else if (data.startsWith('maxis_confirm_')) {
        const idx = parseInt(data.split('_')[2]);
        const freebies = freebiesData[idx];
        const s = userSession[chatId];
        if (!s || !s.maxis || !s.maxis.token || !s.maxis.msisdn) {
            bot.sendMessage(chatId, 'Sesi Maxis tamat. Sila /start semula.');
            return;
        }
        try {
            const url = "https://app-nlb.hotlink.com.my:4443/api/v5.0/purchase/product";
            const postData = {
                "amount": 100,
                "productRecurringType": null,
                "productId": freebies.productId,
                "maxisId": "57586198",
                "packageType": null,
                "paymentIndicator": null,
                "isProductFromMaxisApi": false,
                "provisionType": 6
            };
            const headers = {
                "Accept": "application/vnd.maxis.v2+json",
                "clientApiKey": "h0tl1nk@pp!",
                "Content-Type": "application/json",
                "token": s.maxis.token
            };
            const response = await axios.post(url, postData, { headers });
            const transactionId = response.data.transactionId;
            bot.sendMessage(chatId, `✅ Langganan *${freebies.title}* berjaya!\nTransaction ID: \`${transactionId || 'Tidak tersedia'}\``, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_maxis_dashboard' }]] }
            });
        } catch (e) {
            bot.sendMessage(chatId, `❌ Gagal langgan ${freebies.title}.\n${e.message}`, {
                reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_maxis_dashboard' }]] }
            });
        }
    }
    // --- Logik Celcom Lama ---
    else if (data === 'celcom_login_new') {
        userSession[chatId] = { telco: 'celcom', state: 'await_phone' };
        bot.sendMessage(chatId, 'Masukkan nombor telefon Celcom (cth: 60123456789):');
    }
    else if (data === 'celcom_login_existing' || data === 'back_celcom_dashboard') {
        // Mengendalikan 'back_celcom_dashboard' (Skrip 2)
        const s = userSession[chatId];

        if (data === 'celcom_login_existing' && s?.celcom?.msisdn) {
            // Jika ada sesi sedia ada, terus ke dashboard (rujuk logik `back_celcom_dashboard`)
            // PENTING: Untuk mematuhi skrip 2, kita set state dan minta input dahulu jika tiada sesi
            // Tetapi untuk flow yang lebih baik, jika ada token terus ke dashboard.
        }
        
        if (s?.celcom?.idToken && s?.celcom?.msisdn) {
             const refreshed = await refreshCelcomTokenByFile(s.celcom.msisdn);
            if (!refreshed) {
                bot.sendMessage(chatId, 'Token Celcom tamat. Sila login semula.');
                return;
            }
            try {
                const dash = await getCelcomDashboard(refreshed.msisdn, refreshed.idToken);
                userSession[chatId].celcom = refreshed;
                const dashboardMsg = formatDashboardCelcom(dash);
                const freebiesBtns = [];
                for (let i = 0; i < freebiesCelcom.length; i += 2) {
                    const row = [
                        { text: freebiesCelcom[i].title, callback_data: `celcom_freebies_${i}` }
                    ];
                    if (freebiesCelcom[i + 1]) {
                        row.push({ text: freebiesCelcom[i + 1].title, callback_data: `celcom_freebies_${i + 1}` });
                    }
                    freebiesBtns.push(row);
                }
                freebiesBtns.push([{ text: 'Langgan Unlimited Call', callback_data: 'celcom_unlimited_call' }]);
                freebiesBtns.push([{ text: 'Extend Validity SIM', callback_data: 'celcom_extend_validity' }]);
                freebiesBtns.push([{ text: '⬅️ Kembali ke Menu', callback_data: 'check_celcom' }]);
                
                bot.sendMessage(chatId, dashboardMsg, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: freebiesBtns }
                });
            } catch (e) {
                bot.sendMessage(chatId, 'Ralat semasa memuat dashboard Celcom.');
            }
            return;
        }

        userSession[chatId] = { telco: 'celcom', state: 'await_existing' };
        bot.sendMessage(chatId, 'Masukkan nombor telefon Celcom yang pernah anda daftar:');
    }
    // ... Logik Celcom lain (Owner, Unlimited Call, Extend Validity, Freebies)
    else if (data === 'celcom_owner') {
        userSession[chatId] = { telco: 'celcom', state: 'await_owner' };
        bot.sendMessage(chatId, 'Masukkan ID owner Celcom untuk akses:');
    }
    else if (data === 'celcom_unlimited_call') {
        bot.sendMessage(chatId, 'Pilih pelan Unlimited Call:', {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Langgan RM1 (5 hari)', callback_data: 'celcom_call_rm1' },
                        { text: 'Langgan RM3 (30 hari)', callback_data: 'celcom_call_rm3' }
                    ],
                    [{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }]
                ]
            }
        });
    }
    else if (data === 'celcom_call_rm1' || data === 'celcom_call_rm3') {
        const s = userSession[chatId];
        if (!s || !s.celcom || !s.celcom.idToken || !s.celcom.msisdn) {
            bot.sendMessage(chatId, 'Sesi Celcom tamat. Sila /start semula.');
            return;
        }
        const msisdn = s.celcom.msisdn.startsWith('60') ? '0' + s.celcom.msisdn.substring(2) : s.celcom.msisdn;
        const idToken = s.celcom.idToken;
        const price = data === 'celcom_call_rm1' ? "1.00" : "3.00";
        const productKey = data === 'celcom_call_rm1' ? "VORM1" : "VORM3";
        bot.sendMessage(chatId, 'Memproses langganan Unlimited Call...');
        try {
            const result = await subscribeUnlimitedCall(msisdn, idToken, price, productKey);
            bot.sendMessage(chatId, result.message, {
                reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }]] }
            });
        } catch (e) {
            bot.sendMessage(chatId, 'Ralat semasa langgan Unlimited Call.');
        }
    }
    else if (data === 'celcom_extend_validity') {
      bot.sendMessage(chatId, 'Pilih tempoh lanjutan SIM:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Extend 1 Hari - RM1', callback_data: 'celcom_extend_1d' }],
            [{ text: 'Extend 3 Hari - RM2', callback_data: 'celcom_extend_3d' }],
            [{ text: 'Extend 15 Hari - RM8', callback_data: 'celcom_extend_15d' }],
            [{ text: 'Extend 180 Hari - RM54', callback_data: 'celcom_extend_180d' }],
            [{ text: 'Pakej Rahmah 180 Hari - RM30', callback_data: 'celcom_extend_rahmah' }],
            [{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }]
          ]
        }
      });
    }
    // Logik Extend Validity lain (sama seperti skrip 2)
    else if (data === 'celcom_extend_1d' || data === 'celcom_extend_3d' || data === 'celcom_extend_15d' || data === 'celcom_extend_180d') {
      const s = userSession[chatId];
      if (!s || !s.celcom || !s.celcom.idToken || !s.celcom.msisdn) {
        bot.sendMessage(chatId, 'Sesi Celcom tamat. Sila /start semula.');
        return;
      }
      const productIdMap = {
        'celcom_extend_1d': '1',
        'celcom_extend_3d': '2',
        'celcom_extend_15d': '3',
        'celcom_extend_180d': '4'
      };
      const productId = productIdMap[data];
      const msisdn = s.celcom.msisdn;
      const idToken = s.celcom.idToken;
      bot.sendMessage(chatId, 'Memproses lanjutan tempoh sah SIM...');
      try {
        const result = await extendValidity(msisdn, idToken, productId);
        bot.sendMessage(chatId, result.message, {
          reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }]] }
        });
      } catch (e) {
        bot.sendMessage(chatId, 'Ralat semasa lanjutan tempoh sah SIM.');
      }
    }
    else if (data === 'celcom_extend_rahmah') {
        // Logik Pakej Rahmah (sama seperti skrip 2)
        const s = userSession[chatId];
        if (!s || !s.celcom || !s.celcom.idToken || !s.celcom.msisdn) {
            bot.sendMessage(chatId, 'Sesi Celcom tamat. Sila /start semula.');
            return;
        }
        // ... (Kod Langganan Rahmah dari Skrip 2) ...
        bot.sendMessage(chatId, 'Memproses Pakej Rahmah...');
        try {
             // Sila pastikan 'axios' tersedia dalam skop
            const msisdn = s.celcom.msisdn.startsWith('60') ? '0' + s.celcom.msisdn.slice(2) : s.celcom.msisdn;
            const idToken = s.celcom.idToken;
            const dataBody = {
                productId: "2060452",
                planType: "Monthly",
                accountType: "Prepaid",
                planName: "Pakej Rahmah Siswa 30GB",
                productVolume: "30 GB + High Speed",
                headerTitle: "Pakej Rahmah",
                totalAmount: 30,
                requestType: "INDIVIDUAL_PRODUCT ",
                type: "Addons",
                offerId: "2060452",
                personaliseAdobeInfo: { transact_pid: "2060452", transact_value: 30 }
            };
            const headers = {
                "Accept": "application/json",
                "msisdn": msisdn,
                "Content-Type": "application/json",
                "Authorization": idToken,
                "appVersion": "3.0.71",
                "buildNumber": "200866",
                "os": "android",
                "screenDensity": "1x",
                "Accept-Charset": "UTF-8",
                "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 14; Infinix X6531B Build/UP1A.231005.007)",
                "Host": "apicl3.celcom.com.my",
                "Connection": "Keep-Alive",
                "Accept-Encoding": "gzip"
            };
            const response = await axios.post(
                'https://apicl3.celcom.com.my/plans-and-add-ons-mgmt/addOns/purchase/latest?lang=en',
                dataBody, { headers }
            );
            if (response.data?.statusCode === 0) {
                bot.sendMessage(chatId, '✅ Pakej Rahmah 180 Hari berjaya diaktifkan!', {
                    reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }]] }
                });
            } else {
                bot.sendMessage(chatId, `❌ Gagal aktifkan Pakej Rahmah.\n${response.data.statusDesc || ''}`, {
                    reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }]] }
                });
            }
        } catch (e) {
            bot.sendMessage(chatId, `❌ Ralat semasa proses Rahmah: ${e.message}`, {
                reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }]] }
            });
        }
    }

    // Logik Celcom Freebies (sama seperti skrip 2)
    else if (data.startsWith('celcom_freebies_')) {
        const idx = parseInt(data.split('_')[2]);
        const freebies = freebiesCelcom[idx];
        userSession[chatId].pendingFreebies = idx;
        bot.sendMessage(chatId,
            `*Adakah anda berminat untuk tebus ${freebies.title}?*\n\n` +
            `Tekan "Teruskan Tebus" untuk meneruskan, atau "⬅️ Kembali ke Dashboard" untuk batal.`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Teruskan Tebus', callback_data: `celcom_confirm_${idx}` }
                        ],
                        [
                            { text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }
                        ]
                    ]
                }
            }
        );
    }
    else if (data.startsWith('celcom_confirm_')) {
        const idx = parseInt(data.split('_')[2]);
        const freebies = freebiesCelcom[idx];
        const s = userSession[chatId];
        if (!s || !s.celcom || !s.celcom.idToken || !s.celcom.msisdn) {
            bot.sendMessage(chatId, 'Sesi Celcom tamat. Sila /start semula.');
            return;
        }
        try {
            // ... (Kod Tebus Freebies dari Skrip 2) ...
            const msisdn = s.celcom.msisdn.startsWith('60') ? '0' + s.celcom.msisdn.substring(2) : s.celcom.msisdn;
            const headers = {
                // ... headers dari Skrip 2
            };
            const dataPost = {
                msisdn: msisdn,
                freebieProductId: freebies.id
            };
            const response = await axios.post(
                'https://apicl3.celcom.com.my/plans-and-add-ons-mgmt/freebies/active?lang=en',
                dataPost,
                { headers }
            );
            if (response.data && response.data.statusCode === 0) {
                bot.sendMessage(chatId, `✅ Tebusan *${freebies.title}* berjaya!`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }]] }
                });
            } else {
                bot.sendMessage(chatId, `❌ Gagal tebus ${freebies.title}.\n${response.data.message || ''}`, {
                    reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }]] }
                });
            }
        } catch (e) {
            bot.sendMessage(chatId, `❌ Gagal tebus ${freebies.title}.\n${e.message}`, {
                reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Dashboard', callback_data: 'back_celcom_dashboard' }]] }
            });
        }
    }


    // =================================================================
    // >>> LOGIK CELCOMDIGI ADDONS/SPAM/DELETE <<<
    // =================================================================
    
    // Logik: PADAM NOMBOR DARI DASHBOARD (CelcomDigi)
    else if (data && data.startsWith('delete_msisdn_')) {
        const msisdnToDelete = data.replace('delete_msisdn_', '');
        
        let targetUserId = userId;
        const allAccounts = readAllAccounts();
        for(const uid in allAccounts) {
            if (allAccounts[uid][msisdnToDelete]) {
                targetUserId = uid; 
                break;
            }
        }
        
        deleteUserData(targetUserId, msisdnToDelete);
        
        if (userState[chatId] && userState[chatId].msisdn === msisdnToDelete) {
            delete userState[chatId];
        }
        
        bot.sendMessage(chatId, `✅ Nombor <code>${msisdnToDelete}</code> (UserID: <code>${targetUserId}</code>) telah dipadam dari senarai. Anda telah logout.`, { 
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: 'Login / Daftar Nombor', callback_data: 'menu_telco' }]]
            }
        });
    }
    
    // Logik: SETUP RENEW & SPAM (CelcomDigi)
// Logik: SETUP RENEW & SPAM (CelcomDigi)
    else if (data === 'setup_renew_spam') {
        const msisdn = userState[chatId]?.msisdn;
        const targetUserId = userState[chatId]?.userId || userId;
        
        // 1. Validasi Login
        if (!msisdn) return bot.sendMessage(chatId, 'Sila login dahulu sebelum check addons.', {
            reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu Utama', callback_data: 'back_menu' }]] }
        });
    
        const cookie = getCookie(targetUserId, msisdn);
        if (!cookie) {
            bot.sendMessage(chatId, 'Cookie tamat tempoh. Sila login semula.', {
                 reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu Utama', callback_data: 'back_menu' }]] }
            });
            deleteUserData(targetUserId, msisdn);
            return;
        }
    
        bot.sendMessage(chatId, 'Memuatkan addons untuk Langganan Sekali...');
        
        const addonHeaders = { ...deviceHeadersForAddons, 'cookie': cookie };
        const endpoint = 'https://nga.celcomdigi.com/offering/v1/addons?category=internet';
        
        try {
            const response = await axios.get(endpoint, { headers: addonHeaders });
            const resData = response.data.data;
            
            // Dapatkan SEMUA CMP Offers
            const cmpOffers = await getCmpOffer(cookie); 
            
            const allProducts = {}; 
            let message = '📦 *Langganan Sekali Addons*\n\n'; 
            const buttons = [];
            const filteredProducts = [];
            const CMP_PRODUCT_IDS = [];
            
            // 1.1 LOGIK MOBILESHIELD
            if (isMobileShieldUser(Number(targetUserId))) {
                const mshieldData = MOBILESHIELD_PRODUCT_DATA;
                const productId = mshieldData.id;
    
                message += 
                    `• *${mshieldData.preferred_name}*\n` +
                    `  Price: RM 0.00\n` +
                    `  Quota: ${mshieldData.internet_quota}\n` +
                    `  Expiry: ${mshieldData.validity}\n\n`;
                    
                // MobileShield: Kekal dengan opsi Langgan Sekali & SPAM, guna subscribe_addon_
                buttons.push([
                    { text: `➕ Langgan Sekali (${mshieldData.preferred_name})`, callback_data: `subscribe_addon_${productId}` },
                    { text: `🚀 Langgan SPAM (${mshieldData.preferred_name})`, callback_data: `spam_addon_start_${productId}` }
                ]);
                allProducts[productId] = mshieldData;
            }
            
            // 2. Tambah SEMUA CMP Offer yang relevan
            cmpOffers.forEach(offer => {
                // Saring: ambil tawaran yang dianggap Internet/MI UL atau tawaran RM1
                if (offer.name?.toLowerCase().includes('mi ul') || offer.price > 0 && offer.validity?.includes('Day') || offer.price === 1) {
                    const productId = offer.poId || `${offer.campaignId}_${offer.price}`; 
                    
                    // Pastikan tiada duplikasi ID yang sama dengan MobileShield (walaupun jarang berlaku)
                    if (productId !== MOBILESHIELD_PRODUCT_DATA.id) { 
                        const productData = {
                            id: productId,
                            product_id: productId, 
                            preferred_name: offer.name || `CMP Offer RM${(offer.price || 0).toFixed(2)}`,
                            name: offer.name || `CMP Offer RM${(offer.price || 0).toFixed(2)}`,
                            price: offer.price,
                            price_cent: offer.price * 100,
                            validity: offer.validity || 'N/A',
                            internet_quota: offer.quota_label || 'Unlimited',
                            isCmpOffer: true, 
                            campaignId: offer.campaignId,
                            keyword: offer.keyword,
                            poId: offer.poId,
                        };
                        
                        filteredProducts.push(productData);
                        allProducts[productId] = productData;
                        CMP_PRODUCT_IDS.push(productId);
                    }
                }
            });
    
    
            // 3. Logik Addons biasa: DETECT SEMUA
            for (const catKey in resData) {
                const category = resData[catKey];
                if (typeof category === 'object' && category !== null && category.products) {
                    category.products.forEach(prod => {
                        const productId = prod.product_id;
                        
                        // Pastikan bukan MobileShield, dan bukan CMP Offer
                        if (productId !== MOBILESHIELD_PRODUCT_DATA.id && !CMP_PRODUCT_IDS.includes(productId)) {
                            // **Mesti ada price_cent untuk mengelakkan ralat, jika price_cent tiada, guna prod.price**
                            if (prod.price_cent === undefined && prod.price !== undefined) {
                                prod.price_cent = prod.price * 100;
                            }
    
                            filteredProducts.push(prod);
                            allProducts[productId] = prod; 
                        }
                    });
                }
            }
    
            // 4. Logik paparan butang: Susun dan Papar
            const productIdsSeen = new Set();
            
            if (isMobileShieldUser(Number(targetUserId))) {
                 productIdsSeen.add(MOBILESHIELD_PRODUCT_DATA.id); 
            }
            
            // Susun: CMP Offers di atas, diikuti Addons Biasa
            const cmpOffersToDisplay = filteredProducts.filter(p => p.isCmpOffer && !productIdsSeen.has(p.product_id));
            const regularAddonsToDisplay = filteredProducts.filter(p => !p.isCmpOffer && !productIdsSeen.has(p.product_id));
    
            const allDisplayProducts = [...cmpOffersToDisplay, ...regularAddonsToDisplay].filter((prod, index, self) => 
                index === self.findIndex((t) => (
                    t.product_id === prod.product_id
                ))
            );
    
            if (allDisplayProducts.length === 0) {
                if (!isMobileShieldUser(Number(targetUserId))) {
                    message += '😔 Tiada Addons untuk Langganan Sekali ditemui buat masa ini.';
                }
            } else {
                // Sort by price (asc) within each category (optional, for better view)
                allDisplayProducts.sort((a, b) => (a.price_cent || 0) - (b.price_cent || 0));
    
                allDisplayProducts.forEach(prod => {
                    const priceCent = prod.price_cent || (prod.price * 100); 
                    const priceFormatted = formatRMFromCent(priceCent); 
                    const quotaDisplay = prod.internet_quota || 'N/A';
                    const nameDisplay = prod.preferred_name || prod.name;
                    const productId = prod.product_id || prod.id;
                    const isCmpOffer = prod.isCmpOffer; 
    
                    message += 
                        `• *${nameDisplay}${isCmpOffer ? ' (CMP)' : ''}*\n` +
                        `  Price: RM${priceFormatted}\n` +
                        `  Quota: ${quotaDisplay}\n` +
                        `  Expiry: ${prod.validity || 'N/A'}\n\n`;
    
                    
                    if (isCmpOffer) {
                        // Semua CMP Offer guna subscribe_cmp_
                        buttons.push([{ 
                            text: `➕ Langgan CMP (${nameDisplay})`, 
                            callback_data: `subscribe_cmp_${productId}` 
                        }]); 
                    } else {
                        // Semua Addon Biasa guna subscribe_addon_ (Hanya Langgan Sekali)
                        buttons.push([{
                            text: `➕ Langgan Sekali ${nameDisplay} (RM${priceFormatted})`, 
                            callback_data: `subscribe_addon_${productId}` 
                        }]);
                    }
                });
            }
            
            buttons.push([{text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard'}]);
            buttons.push([{text: '🔎 Check All Addons', callback_data: 'check_all_addons'}]);
            
            userState[chatId].addonProducts = allProducts; 
        
            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
                reply_markup: {inline_keyboard: buttons}
            });
            
        } catch (e) {
            console.error('Setup Renew/Spam Addon API error:', e.response?.data || e.message);
            bot.sendMessage(chatId, 'Gagal mendapatkan addons. Sila cuba semula.', {
                reply_markup: { inline_keyboard: [[{ text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard' }]] }
            });
        }
    }

    
    // Logik: CHECK ALL ADDONS CELCOMDIGI
    else if (data === 'check_all_addons') {
        const msisdn = userState[chatId]?.msisdn;
        const targetUserId = userState[chatId]?.userId || userId;
        
        if (!msisdn) return bot.sendMessage(chatId, 'Sila login dahulu sebelum check addons.', {
            reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu Utama', callback_data: 'back_menu' }]] }
        });

        const cookie = getCookie(targetUserId, msisdn);
        if (!cookie) {
            bot.sendMessage(chatId, 'Cookie tamat tempoh. Sila login semula.', {
                 reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu Utama', callback_data: 'back_menu' }]] }
            });
            deleteUserData(targetUserId, msisdn);
            return;
        }

        bot.sendMessage(chatId, 'Memuatkan SEMUA addons internet...');

        const addonHeaders = { ...deviceHeadersForAddons, 'cookie': cookie };
        const endpoint = 'https://nga.celcomdigi.com/offering/v1/addons?category=internet';
        
        try {
            const response = await axios.get(endpoint, { headers: addonHeaders });
            const resData = response.data.data;
            
            // ... Logik kategori dan paparan (sama seperti Skrip 1) ...
            const allProducts = {}; 
            const categorizedProducts = {
                '💰 Addons Berbayar (30 Hari / Bulanan)': [],
                '⚡ Addons Harian / Mingguan': [],
                '🎁 Addons Percuma (RM0)': [],
                '🌐 Addons Lain-lain': []
            };

            for (const catKey in resData) {
                const category = resData[catKey];
                if (typeof category === 'object' && category !== null && category.products) {
                    category.products.forEach(prod => {
                        const priceCent = prod.price_cent || (prod.price * 100); 
                        allProducts[prod.product_id] = prod; 
                        
                        if (priceCent === 0) {
                            categorizedProducts['🎁 Addons Percuma (RM0)'].push(prod);
                        } else if (prod.validity?.includes('30') || prod.validity?.includes('month')) {
                            categorizedProducts['💰 Addons Berbayar (30 Hari / Bulanan)'].push(prod);
                        } else if (prod.validity?.includes('24') || prod.validity?.includes('day') || prod.validity?.includes('week')) {
                            categorizedProducts['⚡ Addons Harian / Mingguan'].push(prod);
                        } else {
                            categorizedProducts['🌐 Addons Lain-lain'].push(prod);
                        }
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
                        const priceCent = prod.price_cent || (prod.price * 100); 
                        const priceFormatted = formatRMFromCent(priceCent); 
                        const quotaDisplay = prod.internet_quota || 'N/A';
                        const nameDisplay = prod.preferred_name || prod.name;
                        
                        message += 
                            `• *${nameDisplay}* (RM${priceFormatted})\n` +
                            `  Quota: ${quotaDisplay}\n` +
                            `  Expiry: ${prod.validity || 'N/A'}\n\n`;

                        buttons.push([{
                            text: `➕ Langgan ${nameDisplay} (RM${priceFormatted})`, 
                            callback_data: `subscribe_addon_${prod.product_id}`
                        }]);
                    });
                }
            }
            
            if (productCount === 0) {
                 message = '😔 Tiada Addons Internet ditemui buat masa ini.';
            }
            
            buttons.push([{text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard'}]);
            buttons.push([{text: '👑 Langganan Spam & Special Quota', callback_data: 'setup_renew_spam'}]);
            
            userState[chatId].addonProducts = allProducts; 

            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
                reply_markup: {inline_keyboard: buttons}
            });
            
        } catch (e) {
            console.error('Check All Addon API error:', e.response?.data || e.message);
            bot.sendMessage(chatId, 'Gagal mendapatkan SEMUA addons. Sila cuba semula.', {
                reply_markup: { inline_keyboard: [[{ text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard' }]] }
            });
        }
    } 
    
    // Logik: SUBSCRIBE ADDON (CelcomDigi)
    else if (data && data.startsWith('subscribe_addon_')) {
        const productId = data.replace('subscribe_addon_', '');
        const msisdn = userState[chatId]?.msisdn;
        const targetUserId = userState[chatId]?.userId || userId;
        let productData = userState[chatId]?.addonProducts?.[productId];

        if (!productData && productId === MOBILESHIELD_SKU) {
            productData = MOBILESHIELD_PRODUCT_DATA;
            if (!isMobileShieldUser(Number(targetUserId))) {
                 return bot.sendMessage(chatId, '❌ Anda tidak dibenarkan melanggan MobileSHIELD. Sila hubungi Admin.', {
                     reply_markup: { inline_keyboard: [[{ text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard' }]] }
                });
            }
        }

        if (!msisdn || !productData) {
          return bot.sendMessage(chatId, 'Maklumat langganan tidak ditemui. Sila cuba check addons semula.', {
              reply_markup: { inline_keyboard: [[{ text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard' }]] }
          });
        }
        
        await processSubscription(chatId, targetUserId, msisdn, productData, 1, 1); 
    }
    
    // Logik: SPAM ADDON START (CelcomDigi)
    else if (data && data.startsWith('spam_addon_start_')) {
        const productId = data.replace('spam_addon_start_', '');
        const msisdn = userState[chatId]?.msisdn;
        const targetUserId = userState[chatId]?.userId || userId;
        let productData = userState[chatId]?.addonProducts?.[productId];
        
        if (!productData && productId === MOBILESHIELD_SKU) {
            productData = MOBILESHIELD_PRODUCT_DATA;
            if (!isMobileShieldUser(Number(targetUserId))) {
                 return bot.sendMessage(chatId, '❌ Anda tidak dibenarkan melanggan MobileSHIELD secara SPAM. Sila hubungi Admin.', {
                     parse_mode: 'Markdown',
                     reply_markup: { inline_keyboard: [[{ text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard' }]] }
                });
            }
        }

        if (!msisdn || !productData) {
          return bot.sendMessage(chatId, 'Maklumat produk tidak ditemui. Sila cuba check addons semula.', {
              reply_markup: { inline_keyboard: [[{ text: '🏠 Kembali ke Dashboard', callback_data: 'dashboard' }]] }
          });
        }
        
        const maxSpam = productData.isMobileShield ? 100 : MAX_SPAM_COUNT; 

        userState[chatId].spamInfo = { productId, productData, maxSpam };
        userState[chatId].step = 'spam_count_wait';
        
        bot.sendMessage(chatId, 
            `Anda memilih *SPAM* untuk *${productData.preferred_name || productData.name}*.\n\n` +
            `Sila masukkan jumlah langganan yang anda mahu (Maksimum: ${maxSpam}):`,
            { 
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'setup_renew_spam' }]] } 
            }
        );
    }

    // =================================================================
    // >>> LOGIK ADMIN (CELCOMDIGI) <<<
    // =================================================================
    
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
            [{ text: '📈 Check Users Status', callback_data: 'admin_check_users' }], // Tambah butang ini dari logik bawah
            [{ text: '🏠 Kembali ke Menu Utama', callback_data: 'back_menu' }]
        ];
        bot.sendMessage(chatId, '🔑 *Menu Admin*', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: adminButtons } });
    } 
    
    // Logik: ADMIN MANAGE MOBILESHIELD START
    else if (data === 'admin_manage_mobileshield') {
        if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        
        const users = readMobileShieldUsers();
        let message = `🛡️ *Urus Pengguna MobileSHIELD*\n\n`;
        message += `Jumlah Pengguna Aktif: *${users.length}*\n\n`;
        
        if (users.length > 0) {
            message += `*Senarai User ID:*\n`;
            users.forEach((uid, index) => {
                message += `${index + 1}. \`${uid}\`\n`;
            });
        } else {
            message += `_Tiada pengguna MobileSHIELD berdaftar buat masa ini._\n`;
        }
        
        const shieldButtons = [
            [{ text: '➕ Tambah User ID Baru', callback_data: 'admin_add_mobileshield_start' }],
            [{ text: '🗑️ Padam User ID', callback_data: 'admin_delete_mobileshield_start' }],
            [{ text: '🔙 Kembali ke Menu Admin', callback_data: 'admin_menu' }]
        ];
        
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: shieldButtons } });
    }
    
    // Logik: ADMIN ADD MOBILESHIELD START
    else if (data === 'admin_add_mobileshield_start') {
        if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        userState[chatId] = { step: 'admin_mobileshield_add_wait' };
        bot.sendMessage(chatId, 
            'Sila masukkan *User ID Telegram* (contoh: `123456789`) yang anda mahu berikan akses MobileSHIELD:', 
            { 
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_manage_mobileshield' }]] } 
            }
        );
    }
    
    // Logik: ADMIN DELETE MOBILESHIELD START
    else if (data === 'admin_delete_mobileshield_start') {
        if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        userState[chatId] = { step: 'admin_mobileshield_delete_wait' };
        bot.sendMessage(chatId, 
            'Sila masukkan *User ID Telegram* yang anda mahu padam akses MobileSHIELD:', 
            { 
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_manage_mobileshield' }]] } 
            }
        );
    }
    
    // Logik: ADMIN MANAGE KEYS START
    else if (data === 'admin_manage_keys') {
        if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        
        const keys = readAccessKeys();
        let message = `🔑 *Urus Kunci Akses Bot*\n\n`;
        message += `Jumlah Kunci Aktif: *${keys.length}*\n\n`;
        
        if (keys.length > 0) {
            message += `*Senarai Kunci Aktif:*\n`;
            keys.forEach((key, index) => {
                message += `${index + 1}. \`${key}\`\n`;
            });
        } else {
            message += `_Tiada kunci akses aktif buat masa ini._\n`;
        }
        
        const keyButtons = [
            [{ text: '➕ Tambah Kunci Baru', callback_data: 'admin_add_key_start' }],
            [{ text: '🗑️ Padam Semua Kunci', callback_data: 'admin_delete_all_keys' }],
            [{ text: '🔙 Kembali ke Menu Admin', callback_data: 'admin_menu' }]
        ];
        
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyButtons } });
    }
    
    // Logik: ADMIN ADD KEY START
    else if (data === 'admin_add_key_start') {
        if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        userState[chatId] = { step: 'admin_key_add_wait' };
        bot.sendMessage(chatId, 
            'Sila masukkan *satu (1) keyword* untuk dijadikan kunci akses bot. Contoh: `MYACCESS123`', 
            { 
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_manage_keys' }]] } 
            }
        );
    }
    
    // Logik: ADMIN DELETE ALL KEYS
    else if (data === 'admin_delete_all_keys') {
        if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        
        writeAccessKeys([]);
        const usersRevoked = revokeAllUserAccess(); 
        
        bot.sendMessage(chatId, 
            `✅ *Semua kunci akses bot telah berjaya dipadam.*\n` + 
            `🛑 *Akses pengguna lama yang sudah log masuk telah ditarik balik* (${usersRevoked} pengguna terjejas).\n\n` +
            `Pengguna perlu mendapatkan dan memasukkan kunci baru untuk menggunakan bot.`, 
            { 
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '🔑 Urus Kunci Akses Bot', callback_data: 'admin_manage_keys' }]] } 
            }
        );
    }

    
    // Logik: ADMIN START LOGIN MSISDN
    else if (data === 'admin_login_msisdn_start') {
        if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        
        userState[chatId] = { step: 'admin_minta_msisdn_login' };
        bot.sendMessage(chatId, 'Sila masukkan nombor telefon *pengguna* yang anda mahu akses dashboard:', { 
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_menu' }]] } 
        });
    }
    
    // Logik: MAINTENANCE MODE ON/OFF
    else if (data === 'admin_maintenance_on') {
        if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        MAINTENANCE_MODE = true;
        bot.sendMessage(chatId, '✅ *Maintenance Mode Diaktifkan.* Hanya Admin boleh guna bot.', { parse_mode: 'Markdown' });
        await mainMenu(chatId, userId, query.from.first_name || 'User'); 
    }
    else if (data === 'admin_maintenance_off') {
        if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        MAINTENANCE_MODE = false;
        bot.sendMessage(chatId, '✅ *Maintenance Mode Dimatikan.* Bot kembali beroperasi seperti biasa.', { parse_mode: 'Markdown' });
        await mainMenu(chatId, userId, query.from.first_name || 'User'); 
    }
    else if (data === 'admin_delete_msisdn') {
        if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        
        userState[chatId] = { step: 'admin_minta_msisdn_padam' };
        bot.sendMessage(chatId, 'Sila masukkan nombor telefon *pengguna* yang anda mahu padam data (cookie/autorenew) sepenuhnya:', { 
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_menu' }]] } 
        });
    }
    
    // Logik: BROADCAST START (Skrip 1)
    else if (data === 'admin_broadcast_start') {
        if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        userState[chatId] = { step: 'admin_broadcast_wait_message' };
        bot.sendMessage(chatId, 
            '📢 *Sila masukkan mesej broadcast anda:*\n\n' +
            'Anda boleh menggunakan format *Markdown* (cth: `*tebal*`, `_condong_`, `[teks](url)`).\n\n' +
            'Bot akan menghantar mesej ini ke *SEMUA* pengguna bot yang aktif.', 
            { 
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_menu' }]] } 
            }
        );
    }
    // Logik: BROADCAST (Skrip 2, perlu guna `admin_broadcast_start` dari skrip 1 untuk trigger)
    else if (data === 'admin_broadcast') {
        if (!isAdmin(query.from.id)) return;
        userStates[chatId] = { step: 'admin_broadcast' };
        bot.sendMessage(chatId, 'Hantar mesej atau gambar yang anda ingin broadcast ke semua user.');
    }
    
    // Logik: CHECK NUMBER USER 
    else if (data === 'admin_check_users') {
        if (!isAdmin(Number(userId))) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        
        const allAccounts = readAllAccounts();
        const uniqueUsers = Object.keys(allAccounts);
        const totalUsers = uniqueUsers.length;
        let totalMsisdn = 0;
        
        const messageParts = [];
        messageParts.push(`👥 *Laporan Pengguna Bot:*\n`);
        messageParts.push(`Jumlah Pengguna Unik: *${totalUsers}*`);
        
        for (const uid in allAccounts) {
            const msisdns = Object.keys(allAccounts[uid]).filter(key => key !== '00000000000'); 
            totalMsisdn += msisdns.length;
            if (messageParts.length < 8) { 
                messageParts.push(`\n- User ID <code>${uid}</code> (${msisdns.length} nombor)`);
            }
        }
        
        messageParts.push(`\nJumlah Nombor Telefon Didaftar: *${totalMsisdn}*\n`);
        
        if (totalUsers > 5) {
            messageParts.push(`\n(_Paparan ringkasan, ${totalUsers - 5} pengguna lain dikecualikan_)\n`);
        }
        
        bot.sendMessage(chatId, messageParts.join('\n'), { 
            parse_mode: 'HTML', 
            reply_markup: { inline_keyboard: [[{ text: '🔑 Menu Admin', callback_data: 'admin_menu' }]] } 
        });
    }

    // =================================================================
    // >>> LOGIK UTILITI/VPN (SKRIP 2) <<<
    // =================================================================
    
    else if (data === 'get_vpn') {
      bot.sendMessage(chatId, 'Pilih config VPN:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Config SG DigitalOcean🇸🇬', callback_data: 'vpn_sg_do' }],
            [{ text: 'Config CF Worker♾️', callback_data: 'vpn_cf_worker' }],
            [{ text: '⬅️ Kembali ke Menu', callback_data: 'back_menu' }]
          ]
        }
      });
    }
    else if (data === 'vpn_sg_do') {
      // ... (Config VLESS XRAY dari Skrip 2) ...
      const configMsg = `
    <b>🔒 VLESS XRAY</b>
    <b>Username      :</b> CFSB
    <b>Host/IP       :</b> sg1.mrsbxboss.com
    <b>UUID          :</b> b16d5576-57c0-4dda-b610-01e4dc3ebcaa
    <b>Port TLS      :</b> 443
    <b>Port none TLS :</b> 80, 2082
    <b>Path          :</b> /vless
    <b>Service Name  :</b> vless-grpc
    <b>Expired On    :</b> 2025-07-11

    <b>Link TLS</b>
    <code>vless://b16d5576-57c0-4dda-b610-01e4dc3ebcaa@sg1.mrsbxboss.com:443?path=/vless&security=tls&encryption=none&type=ws#CFSB</code>

    <b>Link none TLS</b>
    <code>vless://b16d5576-57c0-4dda-b610-01e4dc3ebcaa@sg1.mrsbxboss.com:80?path=/vless&encryption=none&type=ws#CFSB</code>

    <b>Link GRPC</b>
    <code>vless://b16d5576-57c0-4dda-b610-01e4dc3ebcaa@sg1.mrsbxboss.com:443?mode=gun&security=tls&encryption=none&type=grpc&serviceName=vless-grpc&sni=sg1.mrsbxboss.com#CFSB</code>
    
    <b>Yes Exp/Live</b>
    <code>vless://b16d5576-57c0-4dda-b610-01e4dc3ebcaa@104.17.113.188:80?security=none&encryption=none&type=ws&headerType=none&path=%2Fvless&host=cdn.who.int.sg1.mrsbxboss.com#CFSB</code>
    
    <b>Digi 3MBPS</b>
    <code>vless://b16d5576-57c0-4dda-b610-01e4dc3ebcaa@162.159.134.61:80?security=none&encryption=none&type=ws&headerType=none&path=%2Fvless&host=sg1.mrsbxboss.com#CFSB</code>
    
    <b>Digi 6/12MBPS</b>
    <code>vless://b16d5576-57c0-4dda-b610-01e4dc3ebcaa@opensignal.com.sg1.mrsbxboss.com:80?security=none&encryption=none&type=ws&headerType=none&path=%2Fvless#CFSB</code>
    
    <b>Umobile(UNLIMITED)</b>
    <code>vless://b16d5576-57c0-4dda-b610-01e4dc3ebcaa@104.18.9.53:80?security=none&encryption=none&type=ws&headerType=none&path=%2Fvless&host=sg1.mrsbxboss.com#CFSB</code>
    
    <b>Unifi Bebas</b>
    <code>vless://b16d5576-57c0-4dda-b610-01e4dc3ebcaa@104.17.10.12:80?security=none&encryption=none&type=ws&headerType=none&path=%2Fvless&host=sg1.mrsbxboss.com#CFSB</code>
    
    <b>Unifi 5G Wow</b>
    <code>vmess://eyJhZGQiOiIxNjIuMTU5LjEzNC42MSIsImFpZCI6IjAiLCJob3N0Ijoib3BlbnNpZ25hbC5jb20iLCJpZCI6IjE5MzBjMTFmLTI0YzUtNDI1Ni05ODU5LWY2YjFhYjJlNjQ0MiIsIm5ldCI6IndzIiwicGF0aCI6IndzczpcL1wvc2cxLm1yc2J4Ym9zcy5jb21cLyIsInBvcnQiOiI4MCIsInBzIjoiQ0ZTQiIsInRscyI6Im5vbmUiLCJzbmkiOiIiLCJ0eXBlIjoibm9uZSIsInYiOiIyIn0=</code>
    
    <b>Unifi 5G Wow[Capped 5MBPS]</b>
    <code>vless://b16d5576-57c0-4dda-b610-01e4dc3ebcaa@sg1.mrsbxboss.com:443?security=tls&encryption=none&type=grpc&mode=gun&serviceName=vless-grpc&sni=www.unifi.com.my#CFSB</code>
    
    <b>Maxis(FREEZE)</b>
    <code>vless://b16d5576-57c0-4dda-b610-01e4dc3ebcaa@cdn.opensignal.com:80?security=none&encryption=none&type=ws&headerType=none&path=%2Fvless&host=cdn.opensignal.com.sg1.mrsbxboss.com#CFSB</code>

      `;
      bot.sendMessage(chatId, configMsg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Kembali ke VPN Menu', callback_data: 'get_vpn' }]
          ]
        }
      });
    }
    else if (data === 'vpn_cf_worker') {
      bot.sendMessage(chatId, 'Pilih lokasi server:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Server Malaysia🇲🇾', callback_data: 'cfw_my' }, { text: 'Server Singapore🇸🇬', callback_data: 'cfw_sg' }],
            [{ text: 'Server Indonesia🇮🇩', callback_data: 'cfw_id' }],
            [{ text: '⬅️ Kembali ke VPN Menu', callback_data: 'get_vpn' }]
          ]
        }
      });
    }
    // ... Logik CF Worker (cfw_my, cfw_sg, cfw_id, cfw_my_1, etc.) ...
    else if (data === 'cfw_my') {
      bot.sendMessage(chatId, 'Pilih server Malaysia:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Server Malaysia 1', callback_data: 'cfw_my_1' }],
            [{ text: 'Server Malaysia 2', callback_data: 'cfw_my_2' }],
            [{ text: '⬅️ Kembali', callback_data: 'vpn_cf_worker' }]
          ]
        }
      });
    }
    else if (data === 'cfw_sg') {
      bot.sendMessage(chatId, 'Pilih server Singapore:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Server Singapore 1', callback_data: 'cfw_sg_1' }],
            [{ text: 'Server Singapore 2', callback_data: 'cfw_sg_2' }],
            [{ text: '⬅️ Kembali', callback_data: 'vpn_cf_worker' }]
          ]
        }
      });
    }
    else if (data === 'cfw_id') {
      bot.sendMessage(chatId, 'Pilih server Indonesia:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Server Indonesia 1', callback_data: 'cfw_id_1' }],
            [{ text: 'Server Indonesia 2', callback_data: 'cfw_id_2' }],
            [{ text: '⬅️ Kembali', callback_data: 'vpn_cf_worker' }]
          ]
        }
      });
    }
    else if (data === 'cfw_my_1') {
      const configMsg = `
    <b>Yes Exp/Live</b>
    <code>vless://mrsbXgass@104.17.113.188:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=47.254.206.121:443&host=tap-database.who.int.usr.mrsbxboss.com#CFSB</code>
    
    <b>Digi 3MBPS</b>
    <code>vless://mrsbXgass@162.159.134.61:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=47.254.206.121:443&host=usr.mrsbxboss.com#CFSB</code>
    
    <b>Umobile(UNLIMITED)</b>
    <code>vless://mrsbXgass@104.18.9.53:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=47.254.206.121:443&host=usr.mrsbxboss.com#CFSB</code>
    
    <b>Maxis(FREEZE)</b>
    <code>vless://mrsbXgass@cdn.opensignal.com:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=47.254.206.121:443&host=usr.mrsbxboss.com#CFSB</code>
    
    <b>Sedut Youtube</b>
    <code>vless://mrsbXgass@youtubei.googleapis.com.usr.mrsbxboss.com:443?path=/vl=47.254.206.121:443&security=tls&encryption=none&host=youtubei.googleapis.com.usr.mrsbxboss.com&type=ws&sni=youtubei.googleapis.com.usr.mrsbxboss.com#CFSB</code>
      `;
      bot.sendMessage(chatId, configMsg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Kembali ke Server Malaysia', callback_data: 'cfw_my' }]
          ]
        }
      });
    }
    else if (data === 'cfw_my_2') {
      // ... (Config CFW MY 2 dari Skrip 2) ...
       const configMsg = `
    <b>Yes Exp/Live</b>
    <code>vless://mrsbXgass@104.17.113.188:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=38.60.193.247:13300&host=tap-database.who.int.usr.mrsbxboss.com#CFSB</code>
    
    <b>Digi 3MBPS</b>
    <code>vless://mrsbXgass@162.159.134.61:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=38.60.193.247:13300&host=usr.mrsbxboss.com#CFSB</code>
    
    <b>Umobile(UNLIMITED)</b>
    <code>vless://mrsbXgass@104.18.9.53:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=38.60.193.247:13300&host=usr.mrsbxboss.com#CFSB</code>
    
    <b>Maxis(FREEZE)</b>
    <code>vless://mrsbXgass@cdn.opensignal.com:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=38.60.193.247:13300&host=usr.mrsbxboss.com#CFSB</code>
    
    <b>Sedut Youtube</b>
    <code>vless://mrsbXgass@youtubei.googleapis.com.usr.mrsbxboss.com:443?path=/vl=38.60.193.247:13300&security=tls&encryption=none&host=youtubei.googleapis.com.usr.mrsbxboss.com&type=ws&sni=youtubei.googleapis.com.usr.mrsbxboss.com#CFSB</code>
      `;
      bot.sendMessage(chatId, configMsg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Kembali ke Server Malaysia', callback_data: 'cfw_my' }]
          ]
        }
      });
    }    
    // ... Semua logik CF Worker yang lain (cfw_sg_1, cfw_sg_2, cfw_id_1, cfw_id_2) (sama seperti skrip 2)
    else if (data === 'cfw_sg_1') {
        const configMsg = `
    <b>Yes Exp/Live</b>
    <code>vless://mrsbXgass@104.17.113.188:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=159.89.208.94:443&host=tap-database.who.int.usr.mrsbxboss.com#CFSB</code>
    
    <b>Digi 3MBPS</b>
    <code>vless://mrsbXgass@162.159.134.61:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=159.89.208.94:443&host=usr.mrsbxboss.com#CFSB</code>
    
    <b>Umobile(UNLIMITED)</b>
    <code>vless://mrsbXgass@104.18.9.53:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=159.89.208.94:443&host=usr.mrsbxboss.com#CFSB</code>
    
    <b>Maxis(FREEZE)</b>
    <code>vless://mrsbXgass@cdn.opensignal.com:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=159.89.208.94:443&host=usr.mrsbxboss.com#CFSB</code>
    
    <b>Sedut Youtube</b>
    <code>vless://mrsbXgass@youtubei.googleapis.com.usr.mrsbxboss.com:443?path=/vl=159.89.208.94:443&security=tls&encryption=none&host=youtubei.googleapis.com.usr.mrsbxboss.com&type=ws&sni=youtubei.googleapis.com.usr.mrsbxboss.com#CFSB</code>
      `;
      bot.sendMessage(chatId, configMsg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Kembali ke Server Singapore', callback_data: 'cfw_sg' }]
          ]
        }
      });
    }
    else if (data === 'cfw_sg_2') {
        const configMsg = `
    <b>Yes Exp/Live</b>
    <code>vless://mrsbXgass@104.17.113.188:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=139.180.154.158:443&host=tap-database.who.int.usr.mrsbxboss.com#CFSB</code>
    
    <b>Digi 3MBPS</b>
    <code>vless://mrsbXgass@162.159.134.61:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=139.180.154.158:443&host=usr.mrsbxboss.com#CFSB</code>
    
    <b>Umobile(UNLIMITED)</b>
    <code>vless://mrsbXgass@104.18.9.53:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=139.180.154.158:443&host=usr.mrsbxboss.com#CFSB</code>
    
    <b>Maxis(FREEZE)</b>
    <code>vless://mrsbXgass@cdn.opensignal.com:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=139.180.154.158:443&host=usr.mrsbxboss.com#CFSB</code>
    
    <b>Sedut Youtube</b>
    <code>vless://mrsbXgass@youtubei.googleapis.com.usr.mrsbxboss.com:443?path=/vl=139.180.154.158:443&security=tls&encryption=none&host=youtubei.googleapis.com.usr.mrsbxboss.com&type=ws&sni=youtubei.googleapis.com.usr.mrsbxboss.com#CFSB</code>
      `;
      bot.sendMessage(chatId, configMsg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Kembali ke Server Singapore', callback_data: 'cfw_sg' }]
          ]
        }
      });
    }
    else if (data === 'cfw_id_1') {
        const configMsg = `
    <b>Yes Exp/Live</b>
    <code>vless://mrsbXgass@104.17.113.188:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=36.95.152.58:12137&host=tap-database.who.int.usr.mrsbxboss.com#CFSB</code>
    
    <b>Digi 3MBPS</b>
    <code>vless://mrsbXgass@162.159.134.61:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=36.95.152.58:12137&host=usr.mrsbxboss.com#CFSB</code>
    
    <b>Umobile(UNLIMITED)</b>
    <code>vless://mrsbXgass@104.18.9.53:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=36.95.152.58:12137&host=usr.mrsbxboss.com#CFSB</code>
    
    <b>Maxis(FREEZE)</b>
    <code>vless://mrsbXgass@cdn.opensignal.com:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=36.95.152.58:12137&host=usr.mrsbxboss.com#CFSB</code>
    
    <b>Sedut Youtube</b>
    <code>vless://mrsbXgass@youtubei.googleapis.com.usr.mrsbxboss.com:443?path=/vl=36.95.152.58:12137&security=tls&encryption=none&host=youtubei.googleapis.com.usr.mrsbxboss.com&type=ws&sni=youtubei.googleapis.com.usr.mrsbxboss.com#CFSB</code>
      `;
      bot.sendMessage(chatId, configMsg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Kembali ke Server Indonesia', callback_data: 'cfw_id' }]
          ]
        }
      });
    } 
    else if (data === 'cfw_id_2') {
        const configMsg = `
    <b>Yes Exp/Live</b>
    <code>vless://mrsbXgass@104.17.113.188:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=203.194.112.119:2053&host=tap-database.who.int.usr.mrsbxboss.com#CFSB</code>
    
    <b>Digi 3MBPS</b>
    <code>vless://mrsbXgass@162.159.134.61:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=203.194.112.119:2053&host=usr.mrsbxboss.com#CFSB</code>
    
    <b>Umobile(UNLIMITED)</b>
    <code>vless://mrsbXgass@104.18.9.53:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=203.194.112.119:2053&host=usr.mrsbxboss.com#CFSB</code>
    
    <b>Maxis(FREEZE)</b>
    <code>vless://mrsbXgass@cdn.opensignal.com:80?security=none&encryption=none&type=ws&headerType=none&path=/vl=203.194.112.119:2053&host=usr.mrsbxboss.com#CFSB</code>
    
    <b>Sedut Youtube</b>
    <code>vless://mrsbXgass@youtubei.googleapis.com.usr.mrsbxboss.com:443?path=/vl=203.194.112.119:2053&security=tls&encryption=none&host=youtubei.googleapis.com.usr.mrsbxboss.com&type=ws&sni=youtubei.googleapis.com.usr.mrsbxboss.com#CFSB</code>
      `;
      bot.sendMessage(chatId, configMsg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Kembali ke Server Indonesia', callback_data: 'cfw_id' }]
          ]
        }
      });
    }                                      

    else if (data === 'convert_html_to_web') {
        bot.sendMessage(chatId, 'Sila hantar kod HTML anda (teks atau fail .html) untuk convert ke web version:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⬅️ Kembali ke Menu', callback_data: 'back_menu' }]
                ]
            }
        });
        userSession[chatId] = { state: 'await_html_code' };
    }


    // Logik catch-all, jika tiada yang sepadan
    else {
        // Ini memastikan callback dari butang yang tidak disokong (jika ada) tidak menggantung bot
        console.log(`Callback query not handled: ${data}`);
        try {
            await bot.answerCallbackQuery(query.id, { text: 'Pilihan tidak sah atau tiada tindakan.' });
        } catch {}
    }

});



function broadcastToAllUsers(message) {
  const userIds = fs.readFileSync('userbot.txt', 'utf-8').split('\n').filter(Boolean);
  userIds.forEach(userId => {
    if (message.photo) {
      bot.sendPhoto(userId, message.photo, { caption: message.caption })
        .catch(e => console.log('SendPhoto error to', userId, e.message));
    } else if (message.text) {
      bot.sendMessage(userId, message.text)
        .catch(e => console.log('SendMessage error to', userId, e.message));
    }
  });
}



function addUserToBot(userId) {
  const file = 'userbot.txt';
  let userIds = [];
  if (fs.existsSync(file)) {
    userIds = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
  }
  if (!userIds.includes(String(userId))) {
    fs.appendFileSync(file, userId + '\n');
  }
}

bot.on('polling_error', (error) => {
  console.log('[polling_error]', error.code, error.message, error.response && error.response.body);
});


bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const userId = String(msg.from.id);
    // userId as number for admin checks
    const userIdNum = Number(userId); 
    
    // Pastikan fungsi addUserToBot dipanggil untuk userId dari bot pertama
    // Asumsi: addUserToBot(userIdNum) atau addUserToBot(userId)
    // Saya akan gunakan userId dari msg.from.id
    addUserToBot(msg.from.id);

    // Dapatkan sesi untuk kedua-dua aliran
    const session = userSession[chatId]; // Untuk aliran Telco Lama / HTML
    const state = userState[chatId];     // Untuk aliran Admin / Celcom-Digi NGA / Access Key
    
    // --- LOGIK BOT KEDUA: MAINTENANCE MODE & ACCESS CHECK ---
    // SEMAK MAINTENANCE MODE
    if (MAINTENANCE_MODE && !isAdmin(userIdNum)) {
        if (text === '/start') return; 
        return bot.sendMessage(chatId, '🚧 *Bot sedang dalam penyelenggaraan (Maintenance Mode).* Sila cuba lagi sebentar nanti.', { parse_mode: 'Markdown' });
    }

    // Jika mesej bukan dari admin, dan tiada state/session, abaikan (kecuali /start)
    // Ini mengelakkan bot bertindak balas kepada mesej biasa jika tiada state aktif.
    if (!state && !session && !isAdmin(userIdNum) && text !== '/start') return;
    
    // Abaikan arahan Telegram (commands) bermula dengan /
    if (typeof text === 'string' && text.startsWith('/')) {
        // Biarkan command handler lain yang mengendalikan /start, /menu dll.
        return; 
    }
    
    // --- LOGIK BOT KEDUA: ADMIN/ACCESS KEY FLOW (Dahulukan) ---

    // === LOGIK KUNCI AKSES (Access Key) ===
    if (state?.step === 'access_key_wait') {
        const accessKeys = readAccessKeys();
        const inputKey = text;
        
        if (accessKeys.includes(inputKey)) {
            grantAccessToUser(userIdNum); 
            delete userState[chatId];
            bot.sendMessage(chatId, `✅ *Kunci Akses Sah!* Anda kini boleh menggunakan bot.`, { parse_mode: 'Markdown' });
            // Asumsi: mainMenu adalah fungsi yang wujud
            mainMenu(chatId, userId, msg.from.first_name || 'User'); 
        } else {
            bot.sendMessage(chatId, `❌ *Kunci Akses Tidak Sah.* Sila cuba lagi atau hubungi Admin.`, { 
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Batal / Menu Utama', callback_data: 'back_menu' }] ] } 
            });
        }
        return; 
    }
    
    // === ADMIN KEY ADD INPUT ===
    else if (state?.step === 'admin_key_add_wait') {
        if (!isAdmin(userIdNum)) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        
        const newKey = text.toUpperCase(); 
        if (newKey.length < 5 || newKey.length > 20 || !/^[A-Z0-9]+$/.test(newKey)) {
            return bot.sendMessage(chatId, 
                '❌ Kunci mesti antara 5 hingga 20 aksara, dan hanya boleh mengandungi huruf (A-Z) dan nombor (0-9). Sila cuba lagi:',
                { reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_manage_keys' }]] } }
            );
        }
        
        const existingKeys = readAccessKeys();
        if (existingKeys.includes(newKey)) {
            return bot.sendMessage(chatId, 
                `❌ Kunci \`${newKey}\` sudah wujud. Sila masukkan kunci lain:`,
                { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_manage_keys' }]] } }
            );
        }
        
        existingKeys.push(newKey);
        writeAccessKeys(existingKeys);
        delete userState[chatId];
        
        bot.sendMessage(chatId, 
            `✅ Kunci akses baru \`${newKey}\` berjaya ditambah!`, 
            { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔑 Urus Kunci Akses Bot', callback_data: 'admin_manage_keys' }]] } }
        );
        return;
    }
    
    // === ADMIN MOBILESHIELD ADD/DELETE INPUT ===
    else if (state?.step === 'admin_mobileshield_add_wait') {
        if (!isAdmin(userIdNum)) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        
        const targetUserId = text.trim(); 
        if (!/^\d+$/.test(targetUserId)) {
            return bot.sendMessage(chatId, 
                '❌ User ID mesti nombor. Sila cuba lagi:',
                { reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_manage_mobileshield' }]] } }
            );
        }
        
        if (addMobileShieldUser(targetUserId)) {
            bot.sendMessage(chatId, 
                `✅ User ID \`${targetUserId}\` berjaya ditambah sebagai pengguna MobileSHIELD.`, 
                { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🛡️ Urus MobileSHIELD User', callback_data: 'admin_manage_mobileshield' }]] } }
            );
        } else {
             bot.sendMessage(chatId, 
                `⚠️ User ID \`${targetUserId}\` sudah wujud dalam senarai pengguna MobileSHIELD.`, 
                { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🛡️ Urus MobileSHIELD User', callback_data: 'admin_manage_mobileshield' }]] } }
            );
        }
        delete userState[chatId];
        return;
    }
    else if (state?.step === 'admin_mobileshield_delete_wait') {
        if (!isAdmin(userIdNum)) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        
        const targetUserId = text.trim(); 
        if (!/^\d+$/.test(targetUserId)) {
            return bot.sendMessage(chatId, 
                '❌ User ID mesti nombor. Sila cuba lagi:',
                { reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_manage_mobileshield' }]] } }
            );
        }
        
        if (deleteMobileShieldUser(targetUserId)) {
            bot.sendMessage(chatId, 
                `✅ User ID \`${targetUserId}\` berjaya dipadam dari senarai pengguna MobileSHIELD.`, 
                { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🛡️ Urus MobileSHIELD User', callback_data: 'admin_manage_mobileshield' }]] } }
            );
        } else {
             bot.sendMessage(chatId, 
                `⚠️ User ID \`${targetUserId}\` tidak ditemui dalam senarai pengguna MobileSHIELD.`, 
                { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🛡️ Urus MobileSHIELD User', callback_data: 'admin_manage_mobileshield' }]] } }
            );
        }
        delete userState[chatId];
        return;
    }
    
    // --- LOGIK BOT PERTAMA: HTML & TELCO LAMA FLOW ---
    
    // === HANDLE HTML CONVERT TO WEB ===
    if (session?.state === 'await_html_code') {
        // --- Jika user hantar fail .html ---
        if (msg.document && msg.document.mime_type === 'text/html') {
            const fileId = msg.document.file_id;
            const fileLink = await bot.getFileLink(fileId);
            const axios = require('axios');
            try {
                const response = await axios.get(fileLink);
                const htmlCode = response.data;
                bot.sendMessage(chatId, 'Sedang convert, sila tunggu...');
                // Asumsi: convertHtmlToWeb adalah fungsi yang wujud
                const id = await convertHtmlToWeb(htmlCode); 
                if (id) {
                    const link = `https://htmlviewermrsb.gleeze.com/view/${id}`;
                    bot.sendMessage(chatId, `Ini link web version anda:\n${link}`);
                } else {
                    bot.sendMessage(chatId, 'Maaf, berlaku ralat semasa convert HTML.');
                }
            } catch (e) {
                bot.sendMessage(chatId, 'Gagal membaca fail HTML.');
            }
            userSession[chatId] = null;
            return;
        }
        // --- Jika user hantar teks HTML ---
        else if (msg.text) {
            const htmlCode = msg.text;
            bot.sendMessage(chatId, 'Sedang convert, sila tunggu...');
            const id = await convertHtmlToWeb(htmlCode);
            if (id) {
                const link = `https://htmlviewermrsb.gleeze.com/view/${id}`;
                bot.sendMessage(chatId, `Ini link web version anda:\n${link}`);
            } else {
                bot.sendMessage(chatId, 'Maaf, berlaku ralat semasa convert HTML.');
            }
            userSession[chatId] = null;
            return;
        }
        // --- Jika user hantar selain dua di atas ---
        else {
            bot.sendMessage(chatId, 'Sila hantar kod HTML (teks) atau fail .html sahaja.');
            return;
        }
    }


    // === Digi Flow ===
    if (session?.telco === 'digi') {
        if (session.state === 'await_phone') {
            const phone = normalizePhone(text);
            userSession[chatId] = { telco: 'digi', state: 'await_otp', phone };
            try {
                // ... (Logik Digi Send OTP) ...
                const headers = {
                    "Host": "mydigiapp.digi.com.my",
                    "accept": "application/json",
                    "deviceid": "random-device-id",
                    "applicationversion": "14.0.11",
                    "devicename": "random-device-name",
                    "devicemodel": "V2202",
                    "devicebrand": "vivo",
                    "deviceversion": "14",
                    "deviceos": "Android",
                    "systemversion": "14",
                    "appversion": "14.0.11.1102014615",
                    "useragent": "Mozilla/5.0 (Linux; Android 14; V2202 Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/135.0.7049.38 Mobile Safari/537.36",
                    "msisdin": "null",
                    "msisdn": phone,
                    "language": "ms",
                    "accept-encoding": "gzip",
                    "user-agent": "okhttp/4.10.0"
                };
                const url = `https://mydigiapp.digi.com.my/auth/requestTac?msisdn=${phone}`;
                const axios = require('axios'); // Asumsi: axios diimport atau wujud di luar
                const response = await axios.get(url, { headers });
                if (response.data?.data?.success !== true) throw new Error('OTP gagal dihantar.');
                bot.sendMessage(chatId, `OTP telah dihantar ke ${phone}. Sila masukkan kod OTP:`, {
                    reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Digi Menu', callback_data: 'check_digi' }]] }
                });
            } catch (e) {
                bot.sendMessage(chatId, 'Gagal menghantar OTP. Sila cuba lagi.');
                userSession[chatId] = null;
            }
            return;
        }
        else if (session.state === 'await_otp') {
            const otp = text;
            const phone = session.phone;
            try {
                // ... (Logik Digi Verify OTP & Login) ...
                const headers = {
                    "Host": "mydigiapp.digi.com.my",
                    "accept": "application/json",
                    "deviceid": "random-device-id",
                    "applicationversion": "14.0.11",
                    "devicename": "random-device-name",
                    "devicemodel": "V2202",
                    "devicebrand": "vivo",
                    "deviceversion": "14",
                    "deviceos": "Android",
                    "systemversion": "14",
                    "appversion": "14.0.11.1102014615",
                    "useragent": "Mozilla/5.0 (Linux; Android 14; V2202 Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/135.0.7049.38 Mobile Safari/537.36",
                    "msisdin": "null",
                    "language": "ms",
                    "content-type": "application/json",
                    "accept-encoding": "gzip",
                    "user-agent": "okhttp/4.10.0"
                };
                const axios = require('axios');
                const fs = require('fs'); // Asumsi: fs dan path diimport atau wujud di luar
                const path = require('path');
                const data = { msisdn: phone, tac: otp };
                const response = await axios.post("https://mydigiapp.digi.com.my/auth/login", data, { headers });
                const digiData = response.data?.data;
                if (!digiData?.ssi) throw new Error('OTP salah atau gagal login.');
                const cleanPhone = phone.replace(/\D/g, '');
                const outputFile = path.join(dataDir, `${cleanPhone}.digi.txt`);
                fs.writeFileSync(outputFile, `msisdn: ${phone}\nssi: ${digiData.ssi}\n`);
                userSession[chatId] = { telco: 'digi', state: 'logged_in', phone, ssi: digiData.ssi };
                // Asumsi: getDigiAccountInfo, getBillingInfo, formatDashboardDigi adalah fungsi yang wujud
                const accountInfo = await getDigiAccountInfo(digiData.ssi, phone); 
                const billingInfo = await getBillingInfo(digiData.ssi, phone);
                const dashboardMsg = formatDashboardDigi({
                    number: accountInfo.number,
                    planName: accountInfo.planName,
                    credit: billingInfo.credit,
                    creditExpiry: billingInfo.creditExpiry,
                    plans: billingInfo.plans,
                    hiddenQuota: billingInfo.hiddenQuota
                });
                bot.sendMessage(chatId, dashboardMsg, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Digi Menu', callback_data: 'check_digi' }]] }
                });
            } catch (e) {
                bot.sendMessage(chatId, 'OTP salah atau ralat Digi. Sila cuba lagi.');
                userSession[chatId] = null;
            }
            return;
        }
        else if (session.state === 'await_existing') {
            const phone = normalizePhone(text);
            const fs = require('fs');
            const path = require('path');
            const file = path.join(dataDir, `${phone}.digi.txt`);
            if (!fs.existsSync(file)) {
                bot.sendMessage(chatId, 'Nombor anda tiada dalam sistem Kami, Sila login number terlebih dahulu.');
                userSession[chatId] = null;
            } else {
                // ... (Logik Digi Login Existing) ...
                const content = fs.readFileSync(file, 'utf8');
                const ssi = content.match(/ssi:\s*(.+)/)?.[1];
                userSession[chatId] = { telco: 'digi', state: 'logged_in', phone, ssi };
                try {
                    const accountInfo = await getDigiAccountInfo(ssi, phone);
                    const billingInfo = await getBillingInfo(ssi, phone);
                    const dashboardMsg = formatDashboardDigi({
                        number: accountInfo.number,
                        planName: accountInfo.planName,
                        credit: billingInfo.credit,
                        creditExpiry: billingInfo.creditExpiry,
                        plans: billingInfo.plans,
                        hiddenQuota: billingInfo.hiddenQuota
                    });
                    bot.sendMessage(chatId, dashboardMsg, {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Digi Menu', callback_data: 'check_digi' }]] }
                    });
                } catch (e) {
                    bot.sendMessage(chatId, 'Ralat semasa memuat dashboard Digi.');
                }
            }
            return;
        }
        else if (session.state === 'await_owner') {
            const fs = require('fs');
            const path = require('path');
            if (text !== OWNER_ID) {
                bot.sendMessage(chatId, 'ID salah. Akses ditolak.');
                userSession[chatId] = null;
            } else {
                // ... (Logik Digi Owner List) ...
                const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.digi.txt'));
                if (files.length === 0) {
                    bot.sendMessage(chatId, 'Tiada nombor Digi dalam server.');
                    userSession[chatId] = null;
                    return;
                }
                let msgText = '*Senarai Nombor Digi dalam Server:*\n\n';
                for (let i = 0; i < files.length; i++) {
                    const content = fs.readFileSync(path.join(dataDir, files[i]), 'utf8');
                    const msisdn = content.match(/msisdn:\s*(.+)/)?.[1] || '-';
                    const ssi = content.match(/ssi:\s*(.+)/)?.[1] || '-';
                    msgText += `${i + 1}. ${msisdn}\nSSI: ${ssi}\n\n`;
                }
                bot.sendMessage(chatId, msgText, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Digi Menu', callback_data: 'check_digi' }]] }
                });
                userSession[chatId] = null;
            }
            return;
        }
    }
    
    // === Maxis Flow ===
    else if (session?.telco === 'maxis') {
        if (session.state === 'await_phone') {
            // ... (Logik Maxis Send OTP) ...
            const phone = normalizePhone(text);
            try {
                // Asumsi: maxisSendOtp adalah fungsi yang wujud
                const processId = await maxisSendOtp(phone); 
                userSession[chatId] = { telco: 'maxis', state: 'await_otp', phone, processId };
                bot.sendMessage(chatId, `OTP telah dihantar ke ${phone}. Sila masukkan OTP:`, {
                    reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]] }
                });
            } catch (e) {
                bot.sendMessage(chatId, 'Gagal menghantar OTP Maxis. Sila cuba lagi.');
                userSession[chatId] = null;
            }
            return;
        }
        else if (session.state === 'await_otp') {
            const otp = text;
            const { phone, processId } = session;
            try {
                // ... (Logik Maxis Verify OTP & Login) ...
                const axios = require('axios');
                const fs = require('fs');
                const path = require('path');
                // Asumsi: maxisVerifyOtp, refreshMaxisTokenByFile, maxisGetDashboard, formatDashboardMaxis, maxisHeaders, dataDir, freebiesData wujud
                const cookie = await maxisVerifyOtp(phone, processId, otp);
                const refreshed = await refreshMaxisTokenByFile(phone);
                let token, accno, msisdn;
                if (refreshed) {
                    token = refreshed.token;
                    accno = refreshed.accno;
                    msisdn = refreshed.msisdn;
                } else {
                    const headers = { ...maxisHeaders, cookie };
                    const url = 'https://api-digital.maxis.com.my/prod/api/v4.0/users/token?redirectUrl=https%3A%2F%2Fselfserve.hotlink.com.my%2Fms%2Fauth&brand=HOTLINK&type=OPENAM&clientId=HOTLINKPORTAL&languageId=0';
                    const response = await axios.post(url, {}, { headers });
                    token = response.data.responseData.access_token;
                    accno = response.data.responseData.account[0].accountNo;
                    msisdn = response.data.responseData.account[0].subscriptions[0].msisdn;
                }
                const cleanPhone = phone.replace(/\D/g, '');
                const outputFile = path.join(dataDir, `${cleanPhone}.maxis.txt`);
                fs.writeFileSync(outputFile, `msisdn: ${msisdn}\nAccountNumber: ${accno}\nAuthorization: ${token}\nDidsession: ${cookie}\n`);
                userSession[chatId] = { telco: 'maxis', state: 'logged_in', maxis: { token, accno, msisdn, cookie } };
                userSession[chatId].lastMaxisDash = { token, msisdn };
                const dash = await maxisGetDashboard(token, msisdn);
                const dashboardMsg = formatDashboardMaxis(dash);
                const freebiesBtns = freebiesData.map((f, idx) => [{ text: f.title, callback_data: `maxis_freebies_${idx}` }]);
                freebiesBtns.push([{ text: 'Extend Validity 1 Hari', callback_data: 'maxis_extend_validity_1' }]);
                freebiesBtns.push([{ text: 'Redeem Giveaway Code', callback_data: 'maxisredeemgiveaway' }]);                
                freebiesBtns.push([{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]);
                bot.sendMessage(chatId, dashboardMsg, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: freebiesBtns }
                });
            } catch (e) {
                bot.sendMessage(chatId, 'OTP salah atau ralat Maxis. Sila cuba lagi.');
                userSession[chatId] = null;
            }
            return;
        }
        else if (session.state === 'await_existing') {
            // ... (Logik Maxis Login Existing) ...
            const phone = normalizePhone(text);
            const refreshed = await refreshMaxisTokenByFile(phone);
            if (!refreshed) {
                bot.sendMessage(chatId, 'Token Maxis tamat. Sila login semula.', {
                    reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]] }
                });
                userSession[chatId] = null;
                return;
            }
            userSession[chatId] = { telco: 'maxis', state: 'logged_in', maxis: refreshed };
            userSession[chatId].lastMaxisDash = { token: refreshed.token, msisdn: refreshed.msisdn };
            try {
                const dash = await maxisGetDashboard(refreshed.token, refreshed.msisdn);
                const dashboardMsg = formatDashboardMaxis(dash);
                const freebiesBtns = freebiesData.map((f, idx) => [{ text: f.title, callback_data: `maxis_freebies_${idx}` }]);
                freebiesBtns.push([{ text: 'Extend Validity 1 Hari', callback_data: 'maxis_extend_validity_1' }]);
                freebiesBtns.push([{ text: 'Redeem Giveaway Code', callback_data: 'maxisredeemgiveaway' }]);                                
                freebiesBtns.push([{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]);

                bot.sendMessage(chatId, dashboardMsg, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: freebiesBtns }
                });
            } catch (e) {
                bot.sendMessage(chatId, 'Ralat semasa memuat dashboard Maxis.');
            }
            return;
        }
        else if (session.state === "awaitmaxisgiveawaycode") {
            // ... (Logik Maxis Redeem Giveaway Code) ...
            const codes = msg.text.trim().split('\n').map(c => c.trim()).filter(c => c.length > 0);
            const s = userSession[chatId];
            if (!s || !s.maxis || !s.maxis.token || !s.maxis.msisdn) {
              bot.sendMessage(chatId, "Sesi Maxis tamat. Sila login semula.");
              userSession[chatId].state = null;
              return;
            }
          
            bot.sendMessage(chatId, "Sedang proses redeem kod-kod giveaway...");
          
            const headers = {
                "Host": "api-digital.maxis.com.my",
                "authorization": s.maxis.token,
                "x-api-key": "08bdedcf-6757-4c96-8efa-dbea297b0946",
                "channel": "HRA",
                "x-apigw-api-id": "a8pdjulkwe",
                "content-type": "application/json",
                "user-agent": "Mozilla/5.0 (Linux; Android 15; V2202 Build/AP3A.240905.015.A2; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.7339.207 Mobile Safari/537.36",
                "origin": "https://digitalweb.maxis.com.my",
                "x-requested-with": "my.com.maxis.hotlink.production",
                "sec-ch-ua-platform": "\"Android\"",
                "accept": "application/json, text/plain, */*",
                "sec-ch-ua": "\"Chromium\";v=\"140\", \"Not=A?Brand\";v=\"24\", \"Android WebView\";v=\"140\"",
                "sec-ch-ua-mobile": "?1",
                "sec-fetch-site": "same-site",
                "sec-fetch-mode": "cors",
                "sec-fetch-dest": "empty",
                "referer": "https://digitalweb.maxis.com.my/",
                "accept-encoding": "gzip, deflate, br, zstd",
                "accept-language": "en-MY,en;q=0.9,ms-MY;q=0.8,ms;q=0.7,en-US;q=0.6",
                "priority": "u=1, i"
            };
          
            const axios = require("axios");
            const url = `https://api-digital.maxis.com.my/prod/api/v1.0/rewards/giveaway/event?languageId=1&msisdn=${s.maxis.msisdn}`;
          
            let results = [];
            
            async function redeemCodes() {
              for (const code of codes) {
                const payload = {
                  events: [
                    {
                      type: "code_redemption",
                      redemptionInfo: { code }
                    }
                  ]
                };
            
                try {
                  const resp = await axios.post(url, payload, { headers });
                  if (resp.data && resp.data.status === "success") {
                    results.push(`✅ ${code}: Berjaya redeem!`);
                  } else {
                    results.push(`❌ ${code}: Gagal - ${JSON.stringify(resp.data)}`);
                  }
                } catch (err) {
                  results.push(`❌ ${code}: Error - ${err.message}`);
                }
            
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            }
            
            redeemCodes()
              .then(() => {
                let replyText = results.join(
            ) + 
            
            'Sila pilih tindakan seterusnya:';
                let replyMarkup = {
                  inline_keyboard: [
                    [
                      { text: 'Masukkan Kod Lain', callback_data: 'maxisredeemgiveaway' },
                      { text: '⬅️ Kembali ke Menu', callback_data: 'checkmaxis' }
                    ]
                  ]
                };
            
                bot.sendMessage(chatId, replyText, { reply_markup: replyMarkup });
                userSession[chatId].state = null;
              });
            
            return;
            
        }
        else if (session.state === 'await_owner') {
            const fs = require('fs');
            const path = require('path');
            if (text !== OWNER_ID) {
                bot.sendMessage(chatId, 'ID salah. Akses ditolak.');
                userSession[chatId] = null;
            } else {
                // ... (Logik Maxis Owner List) ...
                const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.maxis.txt'));
                if (files.length === 0) {
                    bot.sendMessage(chatId, 'Tiada nombor Maxis dalam server.');
                    userSession[chatId] = null;
                    return;
                }
                let msgText = '*Senarai Nombor Maxis dalam Server:*\n\n';
                for (let i = 0; i < files.length; i++) {
                    const content = fs.readFileSync(path.join(dataDir, files[i]), 'utf8');
                    const msisdn = content.match(/msisdn:\s*(.+)/)?.[1] || '-';
                    const token = content.match(/Authorization:\s*(.+)/)?.[1] || '-';
                    msgText += `${i + 1}. ${msisdn}\nToken: ${token}\n\n`;
                }
                bot.sendMessage(chatId, msgText, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]] }
                });
                userSession[chatId] = null;
            }
            return;
        }
    }
    
    // === Celcom Flow ===
    else if (session?.telco === 'celcom') {
        if (session.state === 'await_phone') {
            const phone = normalizePhone(text);
            userSession[chatId] = { telco: 'celcom', state: 'await_otp', phone };
            try {
                // ... (Logik Celcom Send OTP) ...
                const axios = require('axios');
                const data = { msisdn: `+${phone}` };
                const headers = {
                    "Connection": "Keep-Alive",
                    "Host": "apicl3.celcom.com.my",
                    "Content-Type": "application/json"
                };
                const response = await axios.post(
                    'https://apicl3.celcom.com.my/auth/otp-generate?lang=en',
                    data,
                    { headers }
                );
                if (response.data.statusCode !== 0 || !response.data.sessionId) throw new Error('OTP gagal dihantar.');
                userSession[chatId].sessionId = response.data.sessionId;
                bot.sendMessage(chatId, `OTP telah dihantar ke ${phone}. Sila masukkan kod OTP:`);
            } catch (e) {
                bot.sendMessage(chatId, 'Gagal menghantar OTP. Sila cuba lagi.');
                userSession[chatId] = null;
            }
            return;
        }
        else if (session.state === 'await_otp') {
            const otp = text;
            const sessionId = session.sessionId;
            const phone = session.phone;
            try {
                // ... (Logik Celcom Verify OTP & Login) ...
                const axios = require('axios');
                const fs = require('fs');
                const path = require('path');
                const data = {
                    "otp": otp,
                    "type": "msisdn",
                    "sessionId": sessionId,
                    "loginChannel": "otp",
                    "pushToken": "et1L5oBISDyCCAl94vmX6A:APA91bFb6FM3oak8kBnw_gGcz_p7eQfBF1EDNyVAoJh7-xVP1f7Bjso45Q-13OnszsG0szXaRUFdcaRUT3AW9ypDOrdvwYw1D-8vFseKfoZB3ndqKiN0tkQ",
                    "networkType": "wifi",
                    "adId": "d7097309-a9e7-480d-9fa6-b1406de53e0d",
                    "appVersion": "3.0.70",
                    "deviceModel": "V2202",
                    "deviceVersion": "14",
                    "deviceId": "2f66e7c375ed06f4",
                    "os": "android",
                    "referralCode": "",
                    "networkSpeed": "1"
                };
                const headers = {
                    "Connection": "Keep-Alive",
                    "Host": "apicl3.celcom.com.my",
                    "Content-Type": "application/json"
                };
                const response = await axios.post(
                    'https://apicl3.celcom.com.my/auth/token-create?lang=en',
                    data,
                    { headers }
                );
                if (!response.data.token) throw new Error('OTP salah atau gagal mendapatkan token.');
                const token = response.data.token;
                // Firebase exchange
                const firebaseHeaders = {
                    "Content-Type": "application/json",
                    "X-Android-Package": "com.celcom.mycelcom",
                    // ... (headers lain) ...
                    "Host": "www.googleapis.com",
                    "Connection": "Keep-Alive",
                    "Accept-Encoding": "gzip"
                };
                const firebaseData = { "token": token, "returnSecureToken": true };
                const firebaseResponse = await axios.post(
                    'https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyCustomToken?key=AIzaSyAY_xgPxtljMmsFPn8NFDyN7S-eeqzI4Io',
                    firebaseData,
                    { headers: firebaseHeaders }
                );
                let formattedMsisdn = phone;
                if (phone.startsWith('60')) formattedMsisdn = '0' + phone.substring(2);
                const cleanPhone = phone.replace(/\D/g, '');
                const outputFile = path.join(dataDir, `${cleanPhone}.celcom.txt`);
                const userData = `msisdn: ${formattedMsisdn}\nid token: ${firebaseResponse.data.idToken}\nrefreshToken: ${firebaseResponse.data.refreshToken}\n`;
                fs.writeFileSync(outputFile, userData);
                userSession[chatId] = { telco: 'celcom', state: 'logged_in', celcom: { msisdn: formattedMsisdn, idToken: firebaseResponse.data.idToken, refreshToken: firebaseResponse.data.refreshToken } };
                // Asumsi: getCelcomDashboard, formatDashboardCelcom, freebiesCelcom wujud
                const dash = await getCelcomDashboard(formattedMsisdn, firebaseResponse.data.idToken); 
                const dashboardMsg = formatDashboardCelcom(dash);
                const freebiesBtns = [];
                for (let i = 0; i < freebiesCelcom.length; i += 2) {
                    const row = [
                        { text: freebiesCelcom[i].title, callback_data: `celcom_freebies_${i}` }
                    ];
                    if (freebiesCelcom[i + 1]) {
                        row.push({ text: freebiesCelcom[i + 1].title, callback_data: `celcom_freebies_${i + 1}` });
                    }
                    freebiesBtns.push(row);
                }
                freebiesBtns.push([{ text: 'Langgan Unlimited Call', callback_data: 'celcom_unlimited_call' }]);
                freebiesBtns.push([{ text: 'Extend Validity SIM', callback_data: 'celcom_extend_validity' }]);
                freebiesBtns.push([{ text: '⬅️ Kembali ke Menu', callback_data: 'celcom_login_existing' }]);
                bot.sendMessage(chatId, dashboardMsg, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: freebiesBtns }
                });
            } catch (e) {
                bot.sendMessage(chatId, 'OTP salah atau ralat Celcom. Sila cuba lagi.');
                userSession[chatId] = null;
            }
            return;
        }
        else if (session.state === 'await_existing') {
            // ... (Logik Celcom Login Existing) ...
            const phone = normalizePhone(text);
            // Asumsi: refreshCelcomTokenByFile wujud
            const refreshed = await refreshCelcomTokenByFile(phone); 
            if (!refreshed) {
                bot.sendMessage(chatId, 'Token Celcom tamat. Sila login semula.');
                userSession[chatId] = null;
                return;
            }
            userSession[chatId] = { telco: 'celcom', state: 'logged_in', celcom: refreshed };
            try {
                const dash = await getCelcomDashboard(refreshed.msisdn, refreshed.idToken);
                const dashboardMsg2 = formatDashboardCelcom(dash);
                const freebiesBtns = [];
                for (let i = 0; i < freebiesCelcom.length; i += 2) {
                    const row = [
                        { text: freebiesCelcom[i].title, callback_data: `celcom_freebies_${i}` }
                    ];
                    if (freebiesCelcom[i + 1]) {
                        row.push({ text: freebiesCelcom[i + 1].title, callback_data: `celcom_freebies_${i + 1}` });
                    }
                    freebiesBtns.push(row);
                }
                freebiesBtns.push([{ text: 'Langgan Unlimited Call', callback_data: 'celcom_unlimited_call' }]);
                freebiesBtns.push([{ text: 'Extend Validity SIM', callback_data: 'celcom_extend_validity' }]);       
                freebiesBtns.push([{ text: '⬅️ Kembali ke Menu', callback_data: 'celcom_login_existing' }]);
                bot.sendMessage(chatId, dashboardMsg2, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: freebiesBtns }
                });
            } catch (e) {
                bot.sendMessage(chatId, 'Ralat semasa memuat dashboard Celcom.');
            }
            return;
        }
        else if (session.state === 'await_owner') {
            const fs = require('fs');
            const path = require('path');
            if (text !== OWNER_ID) {
                bot.sendMessage(chatId, 'ID salah. Akses ditolak.');
                userSession[chatId] = null;
            } else {
                // ... (Logik Celcom Owner List) ...
                const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.celcom.txt'));
                if (files.length === 0) {
                    bot.sendMessage(chatId, 'Tiada nombor Celcom dalam server.');
                    userSession[chatId] = null;
                    return;
                }
                let msgText = '*Senarai Nombor Celcom dalam Server:*\n\n';
                for (let i = 0; i < files.length; i++) {
                    const content = fs.readFileSync(path.join(dataDir, files[i]), 'utf8');
                    const msisdn = content.match(/msisdn:\s*(.+)/)?.[1] || '-';
                    const idToken = content.match(/id token:\s*(.+)/)?.[1] || '-';
                    msgText += `${i + 1}. ${msisdn}\nToken: ${idToken}\n\n`;
                }
                bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
                userSession[chatId] = null;
            }
            return;
        }
    }
    
    // --- LOGIK BOT KEDUA: CELCOM-DIGI NGA / SPAM / ADMIN LOGIC ---

    // === Broadcast Handler (dari bot pertama, tetapi diletakkan di akhir untuk mengelakkan konflik state) ===
    // PENTING: State broadcast ini dari bot pertama menggunakan pembolehubah 'state' (userStates[chatId]) dari bot pertama.
    // Tetapi dalam gabungan ini, bot kedua menggunakan 'state' untuk userState[chatId]. Saya akan ganti:
    const stateBot1 = userStates[chatId]; // Menggunakan nama lain untuk mengelakkan konflik
    if (isAdmin(userIdNum) && stateBot1?.step === 'admin_broadcast') {
        // Logik ini bertindih dengan 'admin_broadcast_wait_message' dari bot kedua.
        // Saya akan mengabaikan logik ini dan kekalkan logik broadcast dari bot kedua (lebih canggih).
        // HANYA JIKA ANDA NAK KEKALKAN:
        /*
        if (msg.photo) {
            broadcastToAllUsers({ photo: msg.photo[msg.photo.length - 1].file_id, caption: msg.caption || '' });
        } else if (msg.text) {
            broadcastToAllUsers({ text: msg.text });
        }
        bot.sendMessage(chatId, '✅ Broadcast dihantar kepada semua user.');
        userStates[chatId] = {};
        return;
        */
    }
    
    // === CELCOM-DIGI NGA FLOW (Menggunakan userState) ===
    else if (state?.step === 'minta_msisdn') {
        // ... (Logik Celcom-Digi NGA Minta MSISDN) ...
        const msisdn = normalizePhone(text);
        userState[chatId].msisdn = msisdn;
        userState[chatId].step = 'otp_wait';
        
        userState[chatId].otpTimeout = setTimeout(() => {
            if (userState[chatId]?.step === 'otp_wait') {
                 bot.sendMessage(chatId, '⚠️ *Perhatian:* Anda mempunyai 1 minit lagi untuk memasukkan OTP sebelum sesi login ini tamat.', { parse_mode: 'Markdown' });
            }
        }, 120000); // Notifikasi selepas 2 minit 

        bot.sendMessage(chatId, `Menghantar OTP ke ${msisdn}...`);
        try {
            const axios = require('axios');
            // Asumsi: deviceHeadersBase wujud
            const headersGetOtp = { ...deviceHeadersBase, screen: 'login-request-otp' };
            await axios.get(`https://nga.celcomdigi.com/auth/guest/guest-otp?msisdn=${msisdn}`, { headers: headersGetOtp });
            bot.sendMessage(chatId, '✅ OTP telah dihantar. Sila masukkan OTP yang anda terima:', {
                reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'menu_telco' }] ] } 
            });
        } catch (e) {
            console.error('Gagal hantar OTP:', e.response?.data || e.message);
            bot.sendMessage(chatId, 'Gagal menghantar OTP. Sila pastikan nombor betul atau cuba semula.', {
                reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'menu_telco' }] ] }
            });
            clearTimeout(userState[chatId].otpTimeout);
            delete userState[chatId];
        }
        return;
    } else if (state?.step === 'otp_wait') {
        // ... (Logik Celcom-Digi NGA Tunggu OTP) ...
        const otp = text;
        const msisdn = userState[chatId].msisdn;
        
        if (userState[chatId].otpTimeout) {
             clearTimeout(userState[chatId].otpTimeout);
             delete userState[chatId].otpTimeout;
        }

        bot.sendMessage(chatId, 'Memproses login...');
        try {
            const axios = require('axios');
            // Asumsi: saveUserData, displayDashboard wujud
            const headersPostLogin = { ...deviceHeadersBase, screen: 'login-guest' };
            const res = await axios.post('https://nga.celcomdigi.com/auth/guest/guest-login', { otp, token: '', msisdn }, { headers: headersPostLogin });
            const setCookieHeader = res.headers['set-cookie'];
            let cookieValue = '';
            if (setCookieHeader && setCookieHeader.length > 0) {
                const connectSid = setCookieHeader.find(c => c.startsWith('connect.sid='));
                if (connectSid) {
                    cookieValue = connectSid.split(';')[0];
                    
                    saveUserData(userId, msisdn, { cookie: cookieValue, chatId: chatId, has_access: true }); 
                    userState[chatId].cookie = cookieValue;
                }
            }
            if (!cookieValue) { throw new Error("Gagal mendapatkan cookie dari respons."); }
            bot.sendMessage(chatId, '✅ Login berjaya! Memaparkan dashboard...');
            await displayDashboard(chatId, userId, msisdn); 
        } catch (e) {
            console.error('Login error:', e.response?.data || e.message);
            bot.sendMessage(chatId, '❌ Login / OTP gagal, sila pastikan OTP betul atau cuba semula.', {
                reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'menu_telco' }] ] }
            });
            delete userState[chatId];
        }
        return;
    } 
    
    // === SPAM COUNT INPUT ===
    else if (state?.step === 'spam_count_wait') {
        // ... (Logik Spam Count) ...
        const count = parseInt(text);
        const msisdn = userState[chatId].msisdn;
        const targetUserId = userState[chatId]?.userId || userId;
        // Asumsi: spamInfo wujud dalam state
        const { productData, maxSpam } = userState[chatId].spamInfo; 

        if (isNaN(count) || count < 1 || count > maxSpam) {
            return bot.sendMessage(chatId, `❌ Jumlah mesti nombor antara 1 hingga ${maxSpam}. Sila cuba lagi:`, {
                reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'setup_renew_spam' }] ] }
            });
        }

        userState[chatId].step = 'dashboard_view'; 
        delete userState[chatId].spamInfo;

        // Asumsi: runSpamLoop wujud
        await runSpamLoop(chatId, targetUserId, msisdn, productData, count); 
        return;
    }
    
    // === ADMIN LOGIN MSISDN INPUT ===
    else if (state?.step === 'admin_minta_msisdn_login') {
        // ... (Logik Admin Login MSISDN) ...
        if (!isAdmin(userIdNum)) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        
        const msisdnToLogin = normalizePhone(text);
        // Asumsi: readAllAccounts wujud
        const allAccounts = readAllAccounts(); 
        let targetUserId = null;
        
        for (const uid in allAccounts) {
            if (allAccounts[uid][msisdnToLogin] && allAccounts[uid][msisdnToLogin].cookie) {
                targetUserId = uid;
                break;
            }
        }
        
        if (targetUserId) {
            userState[chatId] = { 
                userId: targetUserId, 
                msisdn: msisdnToLogin, 
                step: 'dashboard_view' 
            };
            
            bot.sendMessage(chatId, `✅ Nombor <code>${msisdnToLogin}</code> (UserID: <code>${targetUserId}</code>) ditemui. Mengakses dashboard...`, { parse_mode: 'HTML' });
            await displayDashboard(chatId, targetUserId, msisdnToLogin);
        } else {
            bot.sendMessage(chatId, `❌ Nombor <code>${msisdnToLogin}</code> tidak ditemui dalam rekod bot atau cookie telah luput.`, { parse_mode: 'HTML' });
            delete userState[chatId];
            bot.sendMessage(chatId, 'Sila pilih tindakan seterusnya:', {
                reply_markup: {
                     inline_keyboard: [[{ text: '🔑 Menu Admin', callback_data: 'admin_menu' }] ]
                }
            });
        }
        return;
    }
    
    // === ADMIN DELETE MSISDN INPUT ===
    else if (state?.step === 'admin_minta_msisdn_padam') {
        // ... (Logik Admin Delete MSISDN) ...
        if (!isAdmin(userIdNum)) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        
        const msisdnToDelete = normalizePhone(text);
        const allAccounts = readAllAccounts();
        let found = false;
        let targetUserId = null;
        
        for (const uid in allAccounts) {
            if (allAccounts[uid][msisdnToDelete]) {
                targetUserId = uid;
                found = true;
                break;
            }
        }
        
        if (found) {
            // Asumsi: deleteUserData wujud
            deleteUserData(targetUserId, msisdnToDelete); 
            bot.sendMessage(chatId, `✅ Nombor <code>${msisdnToDelete}</code> (UserID: <code>${targetUserId}</code>) berjaya dipadam sepenuhnya dari rekod.`, { parse_mode: 'HTML' });
        } else {
            bot.sendMessage(chatId, `❌ Nombor <code>${msisdnToDelete}</code> tidak ditemui dalam mana-mana rekod pengguna.`, { parse_mode: 'HTML' });
        }
        
        delete userState[chatId];
        bot.sendMessage(chatId, 'Sila pilih tindakan seterusnya:', {
            reply_markup: {
                 inline_keyboard: [[{ text: '🔑 Menu Admin', callback_data: 'admin_menu' }] ]
            }
        });
        return;
    } 
    
    // === BROADCAST MESSAGE INPUT (Advanced) ===
    else if (state?.step === 'admin_broadcast_wait_message') {
        // ... (Logik Broadcast) ...
        if (!isAdmin(userIdNum)) return bot.sendMessage(chatId, '❌ Anda bukan Admin.');
        
        const allAccounts = readAllAccounts();
        const uniqueChatIds = new Set();
        for (const uid in allAccounts) {
            for (const msisdn in allAccounts[uid]) {
                if (allAccounts[uid][msisdn].chatId) {
                    uniqueChatIds.add(allAccounts[uid][msisdn].chatId);
                    break; 
                }
            }
        }
        const chatIdsArray = Array.from(uniqueChatIds);
        
        await bot.sendMessage(chatId, 
            `⏳ *Memulakan proses Broadcast* ke ${chatIdsArray.length} pengguna... Sila tunggu.`, 
            { parse_mode: 'Markdown' }
        );
        
        delete userState[chatId]; 

        // Asumsi: broadcastMessage wujud
        const result = await broadcastMessage(chatIdsArray, text, 'Markdown'); 
        
        await bot.sendMessage(chatId, 
            `✅ *Broadcast Selesai!*\n\n` +
            `Jumlah Penerima: ${chatIdsArray.length}\n` +
            `Berjaya: *${result.successCount}*\n` +
            `Gagal: *${result.failedCount}* (Bot diblokir/dikeluarkan)\n\n` +
            `Sila pilih tindakan seterusnya:`, 
            { 
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '🔑 Menu Admin', callback_data: 'admin_menu' }] ] } 
            }
        );
        return;
    }
    
    // Jika tiada state yang sepadan, dan ini bukan '/start', abaikan.
    // Jika anda ingin mengendalikan mesej teks generik di sini, anda boleh menambahnya.
});


setInterval(expiryNotificationScheduler, NOTIFICATION_CHECK_INTERVAL_MS); 
// Mulakan semakan pertama serta-merta
expiryNotificationScheduler();
