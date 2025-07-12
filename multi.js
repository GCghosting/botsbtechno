const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const moment = require('moment');

const TOKEN = '7089049407:AAETfrMd1aGVy8xD2lNoS60tHHFlcZUquuk'; // <-- GANTI DENGAN TOKEN ANDA
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

const userSession = {};

function normalizePhone(phone) {
    phone = phone.replace(/\D/g, '');
    if (phone.startsWith('60')) return phone;
    if (phone.startsWith('0')) return '60' + phone.substring(1);
    return '60' + phone;
}
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
        return d.toLocaleDateString('ms-MY');
    } catch {
        return dateString;
    }
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

function mainMenu(chatId, userId, firstName) {
    const caption =
        `👋 Selamat datang <a href="tg://user?id=${userId}">${firstName}</a> (ID: <code>${userId}</code>)!\n\n` +
        `Sila pilih pilihan telco anda yang sesuai di bawah:\n` +
        `📌 DIG1 - Check hidden data basic!\n` +
        `📌 CELC0M - Langgan Call/Freebies Data!\n` +
        `📌 MAX1S - Boleh langgan freebies Data!\n` +
        `📌 VPN CONFIG - Server SG Digital Ocean boleh pakai macam Biasa!\nServer CF WORKER kalau nak guna, wajib off Mux/Untick mux\n` +
        `📌 HTML CONVERT - Send Code Html, dan bot akan auto deploy kan web/Apa² yang dibuat\n\n`;        

    // Susun butang menu
    let buttons = [
        [{ text: 'TELCO DIG1', callback_data: 'check_digi' }, { text: 'TELCO MAX1S', callback_data: 'check_maxis' }],
        [{ text: 'TELCO CELC0M', callback_data: 'check_celcom' }],
        [{ text: 'Get VPN Config', callback_data: 'get_vpn' }],
        [{ text: 'Html Code Convert To Web', callback_data: 'convert_html_to_web' }] 
    ];

    // Tambah butang broadcast jika admin
    if (isAdmin(userId)) {
        buttons.push([{ text: '📢 Broadcast Message', callback_data: 'admin_broadcast' }]);
    }

    bot.sendPhoto(chatId, SERVER_IMAGE, {
        caption: caption,
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: buttons
        }
    });
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


bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name || 'User';
    mainMenu(chatId, userId, firstName);
    addUserToBot(userId);
});

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


bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;
    const session = userSession[chatId];
    try { await bot.deleteMessage(chatId, messageId); } catch (e) {}

    // === MENU UTAMA & TELCO ===
    if (data === 'check_digi') {
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
    else if (data === 'back_main') {
    userSession[chatId] = null;
    // Guna query.from untuk dapat userId dan firstName
    mainMenu(chatId, query.from.id, query.from.first_name || 'User');
}


    // === DIGI ===
    else if (data === 'digi_login_new') {
        userSession[chatId] = { telco: 'digi', state: 'await_phone' };
        bot.sendMessage(chatId, 'Masukkan nombor telefon Digi (cth: 60123456789):', {
            reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Digi Menu', callback_data: 'check_digi' }]] }
        });
    }
    
    else if (data === 'admin_broadcast') {
      if (!isAdmin(query.from.id)) return;
      userStates[chatId] = { step: 'admin_broadcast' };
      bot.sendMessage(chatId, 'Hantar mesej atau gambar yang anda ingin broadcast ke semua user.');
    }
    
    else if (data === 'convert_html_to_web') {
        bot.sendMessage(chatId, 'Sila hantar kod HTML anda (teks atau fail .html) untuk convert ke web version:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⬅️ Kembali ke Menu', callback_data: 'back_main' }]
                ]
            }
        });
        userSession[chatId] = { state: 'await_html_code' };
    }


    
    
    else if (data === 'get_vpn') {
      bot.sendMessage(chatId, 'Pilih config VPN:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Config SG DigitalOcean🇸🇬', callback_data: 'vpn_sg_do' }],
            [{ text: 'Config CF Worker♾️', callback_data: 'vpn_cf_worker' }],
            [{ text: '⬅️ Kembali ke Menu', callback_data: 'back_main' }]
          ]
        }
      });
    }
    else if (data === 'vpn_sg_do') {
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

    // === MAXIS ===
    else if (data === 'maxis_login_new') {
        userSession[chatId] = { telco: 'maxis', state: 'await_phone' };
        bot.sendMessage(chatId, 'Masukkan nombor telefon Maxis (cth: 60123456789):', {
            reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]] }
        });
    }
    else if (data === 'maxis_login_existing') {
        userSession[chatId] = { telco: 'maxis', state: 'await_existing' };
        bot.sendMessage(chatId, 'Masukkan nombor telefon Maxis yang pernah anda daftar:', {
            reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]] }
        });
    }
    else if (data === 'maxis_owner') {
        userSession[chatId] = { telco: 'maxis', state: 'await_owner' };
        bot.sendMessage(chatId, 'Masukkan ID owner Maxis untuk akses:', {
            reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]] }
        });
    }
    // === Maxis: Langgan Freebies - Confirmation ===
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
    // === Maxis: Langgan Freebies - Proceed ===
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
    // === Maxis: Back ke Dashboard ===
    else if (data === 'back_maxis_dashboard') {
        const dashCtx = userSession[chatId].lastMaxisDash || (session.maxis ? { token: session.maxis.token, msisdn: session.maxis.msisdn } : null);
        if (!dashCtx || !dashCtx.msisdn) {
            bot.sendMessage(chatId, 'Sesi Maxis tamat. Sila /start semula.');
            return;
        }
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
            freebiesBtns.push([{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]);
            bot.sendMessage(chatId, dashboardMsg, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: freebiesBtns }
            });
        } catch (e) {
            bot.sendMessage(chatId, 'Ralat semasa memuat dashboard Maxis.');
        }
    }

    // === CELCOM ===
    else if (data === 'celcom_login_new') {
        userSession[chatId] = { telco: 'celcom', state: 'await_phone' };
        bot.sendMessage(chatId, 'Masukkan nombor telefon Celcom (cth: 60123456789):');
    }
    else if (data === 'celcom_login_existing') {
        userSession[chatId] = { telco: 'celcom', state: 'await_existing' };
        bot.sendMessage(chatId, 'Masukkan nombor telefon Celcom yang pernah anda daftar:');
    }
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
    // Langgan Unlimited Call (RM1 atau RM3)
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
            const msisdn = s.celcom.msisdn.startsWith('60') ? '0' + s.celcom.msisdn.substring(2) : s.celcom.msisdn;
            const headers = {
                "Accept": "application/json",
                "msisdn": msisdn,
                "Content-Type": "application/json",
                "Authorization": s.celcom.idToken,
                "appVersion": "3.0.69",
                "buildNumber": "200843",
                "os": "android",
                "screenDensity": "1x",
                "Accept-Charset": "UTF-8",
                "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 14; V2202 Build/UP1A.231005.007)",
                "Host": "apicl3.celcom.com.my",
                "Connection": "Keep-Alive",
                "Accept-Encoding": "gzip"
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
    else if (data === 'back_celcom_dashboard') {
        const s = userSession[chatId];
        if (!s || !s.celcom || !s.celcom.idToken || !s.celcom.msisdn) {
            bot.sendMessage(chatId, 'Sesi Celcom tamat. Sila /start semula.');
            return;
        }
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
// Tambah baris Unlimited Call
                freebiesBtns.push([
                    { text: 'Langgan Unlimited Call', callback_data: 'celcom_unlimited_call' }
                ]);
                freebiesBtns.push([{ text: '⬅️ Kembali ke Menu', callback_data: 'celcom_login_existing' 
                }]);
                bot.sendMessage(chatId, dashboardMsg, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: freebiesBtns }
                });

        } catch (e) {
            bot.sendMessage(chatId, 'Ralat semasa memuat dashboard Celcom.');
        }
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
    const text = msg.text;
    const userId = msg.from.id;
    addUserToBot(userId);

    if (typeof text === 'string' && text.startsWith('/')) return;

    const session = userSession[chatId];
    if (!session) return;

    // === HANDLE HTML CONVERT TO WEB ===
    if (session.state === 'await_html_code') {
        // --- Jika user hantar fail .html ---
        if (msg.document && msg.document.mime_type === 'text/html') {
            const fileId = msg.document.file_id;
            const fileLink = await bot.getFileLink(fileId);
            const axios = require('axios');
            try {
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
    if (session.telco === 'digi') {
        if (session.state === 'await_phone') {
            const phone = normalizePhone(text);
            userSession[chatId] = { telco: 'digi', state: 'await_otp', phone };
            try {
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
                const response = await axios.get(url, { headers });
                if (response.data?.data?.success !== true) throw new Error('OTP gagal dihantar.');
                bot.sendMessage(chatId, `OTP telah dihantar ke ${phone}. Sila masukkan kod OTP:`, {
                    reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Digi Menu', callback_data: 'check_digi' }]] }
                });
            } catch (e) {
                bot.sendMessage(chatId, 'Gagal menghantar OTP. Sila cuba lagi.');
                userSession[chatId] = null;
            }
        }
        else if (session.state === 'await_otp') {
            const otp = text;
            const phone = session.phone;
            try {
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
                const data = { msisdn: phone, tac: otp };
                const response = await axios.post("https://mydigiapp.digi.com.my/auth/login", data, { headers });
                const digiData = response.data?.data;
                if (!digiData?.ssi) throw new Error('OTP salah atau gagal login.');
                const cleanPhone = phone.replace(/\D/g, '');
                const outputFile = path.join(dataDir, `${cleanPhone}.digi.txt`);
                fs.writeFileSync(outputFile, `msisdn: ${phone}\nssi: ${digiData.ssi}\n`);
                userSession[chatId] = { telco: 'digi', state: 'logged_in', phone, ssi: digiData.ssi };
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
        }
  // === Broadcast Handler ===
        if (isAdmin(userId) && state?.step === 'admin_broadcast') {
          if (msg.photo) {
            const photoId = msg.photo[msg.photo.length - 1].file_id;
            broadcastToAllUsers({ photo: photoId, caption: msg.caption || '' });
          } else if (msg.text) {
            broadcastToAllUsers({ text: msg.text });
          }
          bot.sendMessage(chatId, '✅ Broadcast dihantar kepada semua user.');
          userStates[chatId] = {};
          return;
        }

        
        if (session.state === 'await_existing') {
            const phone = normalizePhone(text);
            const file = path.join(dataDir, `${phone}.digi.txt`);
            if (!fs.existsSync(file)) {
                bot.sendMessage(chatId, 'Nombor anda tiada dalam sistem Digi.');
                userSession[chatId] = null;
            } else {
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
        }
        else if (session.state === 'await_owner') {
            if (text !== OWNER_ID) {
                bot.sendMessage(chatId, 'ID salah. Akses ditolak.');
                userSession[chatId] = null;
            } else {
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
        }
    }
    // === Maxis Flow ===
    else if (session.telco === 'maxis') {
        if (session.state === 'await_phone') {
            const phone = normalizePhone(text);
            try {
                const processId = await maxisSendOtp(phone);
                userSession[chatId] = { telco: 'maxis', state: 'await_otp', phone, processId };
                bot.sendMessage(chatId, `OTP telah dihantar ke ${phone}. Sila masukkan OTP:`, {
                    reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]] }
                });
            } catch (e) {
                bot.sendMessage(chatId, 'Gagal menghantar OTP Maxis. Sila cuba lagi.');
                userSession[chatId] = null;
            }
        }
        else if (session.state === 'await_otp') {
            const otp = text;
            const { phone, processId } = session;
            try {
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
                freebiesBtns.push([{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]);
                bot.sendMessage(chatId, dashboardMsg, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: freebiesBtns }
                });
            } catch (e) {
                bot.sendMessage(chatId, 'OTP salah atau ralat Maxis. Sila cuba lagi.');
                userSession[chatId] = null;
            }
        }
        else if (session.state === 'await_existing') {
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
                freebiesBtns.push([{ text: '⬅️ Kembali ke Maxis Menu', callback_data: 'check_maxis' }]);
                bot.sendMessage(chatId, dashboardMsg, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: freebiesBtns }
                });
            } catch (e) {
                bot.sendMessage(chatId, 'Ralat semasa memuat dashboard Maxis.');
            }
        }
        else if (session.state === 'await_owner') {
            if (text !== OWNER_ID) {
                bot.sendMessage(chatId, 'ID salah. Akses ditolak.');
                userSession[chatId] = null;
            } else {
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
        }
    }
    // === Celcom Flow ===
    else if (session.telco === 'celcom') {
        if (session.state === 'await_phone') {
            const phone = normalizePhone(text);
            userSession[chatId] = { telco: 'celcom', state: 'await_otp', phone };
            try {
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
        }
        else if (session.state === 'await_otp') {
            const otp = text;
            const sessionId = session.sessionId;
            const phone = session.phone;
            try {
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
                    "X-Android-Cert": "384809A099428C4B3C1CE6E88BEFB5720C03B155",
                    "Accept-Language": "en-MY, en-US",
                    "X-Client-Version": "Android/Fallback/X21001000/FirebaseCore-Android",
                    "X-Firebase-GMPID": "1:100358938974:android:0dcb236af9df7cda206fcf",
                    "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 14; V2202 Build/UP1A.231005.007)",
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
// Tambah baris Unlimited Call
                freebiesBtns.push([
                    { text: 'Langgan Unlimited Call', callback_data: 'celcom_unlimited_call' }
                ]);
                freebiesBtns.push([{ text: '⬅️ Kembali ke Menu', callback_data: 'celcom_login_existing' 
                }]);
                bot.sendMessage(chatId, dashboardMsg, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: freebiesBtns }
                });
            } catch (e) {
                bot.sendMessage(chatId, 'OTP salah atau ralat Celcom. Sila cuba lagi.');
                userSession[chatId] = null;
            }
        }
        else if (session.state === 'await_existing') {
            const phone = normalizePhone(text);
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
// Tambah baris Unlimited Call
                freebiesBtns.push([
                    { text: 'Langgan Unlimited Call', callback_data: 'celcom_unlimited_call' }
                ]);
                freebiesBtns.push([{ text: '⬅️ Kembali ke Menu', callback_data: 'celcom_login_existing' 
                }]);
                bot.sendMessage(chatId, dashboardMsg2, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: freebiesBtns }
                });
            } catch (e) {
                bot.sendMessage(chatId, 'Ralat semasa memuat dashboard Celcom.');
            }
        }
        else if (session.state === 'await_owner') {
            if (text !== OWNER_ID) {
                bot.sendMessage(chatId, 'ID salah. Akses ditolak.');
                userSession[chatId] = null;
            } else {
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
        }
    }
});
