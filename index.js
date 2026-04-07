const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const TelegramBot = require('node-telegram-bot-api');
const qrcode = require('qrcode');
const axios = require("axios");
const pino = require("pino");

// --- CONFIGURATION ---
const CONFIG_API = "https://xchamiwpbot.free.nf/api.php";
const UPDATE_API = "https://xchamiwpbot.free.nf/update_settings.php"; 
const TELEGRAM_TOKEN = '8442632780:AAH2Qn37FZ3tWI2UWH1BkLL-ypgdYfG2ZCM';
const MY_CHAT_ID = '5874012720';

const tgBot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

async function startxCHAMi() {
    console.log("🚀 xCHAMi MD Advanced System පණගැන්වෙනවා...");
    const { state, saveCreds } = await useMultiFileAuthState('xchami_session');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["xCHAMi MD Admin", "Chrome", "1.0.0"],
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    // --- TELEGRAM ADMIN PANEL ---
    tgBot.onText(/\/start/, (msg) => {
        if (msg.chat.id.toString() !== MY_CHAT_ID) return;
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🟢 BOT ON', callback_data: 'bot_on' }, { text: '🔴 BOT OFF', callback_data: 'bot_off' }],
                    [{ text: '📊 CHECK STATUS', callback_data: 'status' }],
                    [{ text: '🛠 HELP COMMANDS', callback_data: 'help' }]
                ]
            }
        };
        tgBot.sendMessage(MY_CHAT_ID, "👋 *xCHAMi MD CONTROL PANEL*\n\nපහත බොත්තම් මඟින් බොට් පාලනය කරන්න. API Key හෝ Prompt වෙනස් කිරීමට අදාළ Command එක භාවිතා කරන්න.", { parse_mode: 'Markdown', ...opts });
    });

    tgBot.on('callback_query', async (query) => {
        if (query.message.chat.id.toString() !== MY_CHAT_ID) return;
        const data = query.data;

        if (data === 'bot_on' || data === 'bot_off') {
            const status = data === 'bot_on' ? 'ON' : 'OFF';
            try {
                await axios.post(UPDATE_API, { action: 'update_status', value: status });
                tgBot.answerCallbackQuery(query.id, { text: `Bot Status: ${status} ✅` });
            } catch (e) { tgBot.sendMessage(MY_CHAT_ID, "❌ Database Update Error!"); }
        } else if (data === 'status') {
            const { data: s } = await axios.get(CONFIG_API);
            tgBot.sendMessage(MY_CHAT_ID, `📊 *CURRENT SETTINGS*\n\n📌 *Status:* ${s.bot_status}\n🔑 *API Key:* \`${s.api_key.substring(0,10)}...\` \n📝 *Prompt:* ${s.system_prompt.substring(0,100)}...`, { parse_mode: 'Markdown' });
        } else if (data === 'help') {
            tgBot.sendMessage(MY_CHAT_ID, "📝 *COMMAND LIST*\n\n1. `/setapi [key]` - අලුත් API Key එකක් දැමීමට\n2. `/setprompt [text]` - System Prompt එක වෙනස් කිරීමට", { parse_mode: 'Markdown' });
        }
    });

    tgBot.on('message', async (msg) => {
        if (msg.chat.id.toString() !== MY_CHAT_ID || !msg.text) return;
        const text = msg.text;

        if (text.startsWith('/setapi ')) {
            const val = text.split('/setapi ')[1];
            await axios.post(UPDATE_API, { action: 'update_api', value: val });
            tgBot.sendMessage(MY_CHAT_ID, "✅ *API Key එක සාර්ථකව Update කළා!*", { parse_mode: 'Markdown' });
        } else if (text.startsWith('/setprompt ')) {
            const val = text.split('/setprompt ')[1];
            await axios.post(UPDATE_API, { action: 'update_prompt', value: val });
            tgBot.sendMessage(MY_CHAT_ID, "✅ *System Prompt එක සාර්ථකව Update කළා!*", { parse_mode: 'Markdown' });
        }
    });

    // --- WHATSAPP CONNECTION & LOGIC ---
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            const qrBuffer = await qrcode.toBuffer(qr);
            await tgBot.sendPhoto(MY_CHAT_ID, qrBuffer, { caption: '🔔 *xCHAMi MD - LOGIN QR*\n\nකරුණාකර මෙය ඉක්මනින් Scan කරන්න.' });
        }
        if (connection === 'open') tgBot.sendMessage(MY_CHAT_ID, "✅ *WhatsApp Connected Successfully!*");
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startxCHAMi();
        }
    });

    sock.ev.on('messages.upsert', async (chat) => {
        try {
            const msg = chat.messages[0];
            if (!msg.message || msg.key.fromMe) return;
            const from = msg.key.remoteJid;
            const body = msg.message.conversation || msg.message.extendedTextMessage?.text;

            if (body && !from.endsWith('@g.us')) {
                const { data: settings } = await axios.get(CONFIG_API);
                if (settings.bot_status === 'OFF') return;

                // --- CUSTOM WHATSAPP COMMANDS ---
                if (body === '.status') return await sock.sendMessage(from, { text: "🚀 xCHAMi MD සක්‍රීයයි!" }, { quoted: msg });
                if (body === '.owner') return await sock.sendMessage(from, { text: "👨‍💻 මෙම බොට් නිපදවන ලද්දේ xCHAMi STUDIO විසිනි." }, { quoted: msg });

                await sock.sendPresenceUpdate('composing', from);

                const genAI = new GoogleGenerativeAI(settings.api_key);
                const model = genAI.getGenerativeModel({ 
                    model: "gemini-1.5-flash", 
                    systemInstruction: settings.system_prompt + " .වැදගත්: සැමවිටම පිළිතුරට ගැලපෙන ආකර්ෂණීය Emojis භාවිතා කරන්න. (Always use emojis to make response beautiful ✨)"
                });

                const result = await model.generateContent(body);
                await sock.sendMessage(from, { text: result.response.text() }, { quoted: msg });
            }
        } catch (e) { console.log("Error:", e.message); }
    });
}

startxCHAMi();
