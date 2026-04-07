const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason } = require("@whiskeysockets/baileys");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const qrcode = require("qrcode-terminal");
const axios = require("axios");
const pino = require("pino");

const CONFIG_API = "http://YOUR_SUBDOMAIN.infinityfreeapp.com/api.php";

async function startxCHAMi() {
    const { state, saveCreds } = await useMultiFileAuthState('xchami_session');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ["xCHAMi MD", "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (chat) => {
        const msg = chat.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (body) {
            try {
                // Fetch settings from Admin Panel
                const { data: settings } = await axios.get(CONFIG_API);
                if (settings.bot_status === 'OFF') return;

                // Typing Indicator
                await sock.sendPresenceUpdate('composing', from);
                await delay(1500);

                const genAI = new GoogleGenerativeAI(settings.api_key);
                const model = genAI.getGenerativeModel({ 
                    model: "gemma-4-2b-it", 
                    systemInstruction: settings.system_prompt 
                });

                const result = await model.generateContent(body);
                const response = await result.response;
                const aiText = response.text();

                await sock.sendMessage(from, { text: aiText }, { quoted: msg });

            } catch (err) {
                console.error("Error:", err.message);
                // API Key error check
                if(err.message.includes("API_KEY_INVALID")) {
                    await sock.sendMessage(from, { text: "⚠️ API Key එක අවලංගුයි. කරුණාකර Admin Panel එක පරීක්ෂා කරන්න." });
                }
            }
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startxCHAMi();
        } else if (connection === 'open') {
            console.log('✅ xCHAMi MD සම්බන්ධ විය!');
        }
    });
}

startxCHAMi();
