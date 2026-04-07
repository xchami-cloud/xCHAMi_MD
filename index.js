const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    jidDecode 
} = require("@whiskeysockets/baileys");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const qrcode = require("qrcode-terminal");
const axios = require("axios");
const pino = require("pino");

// ඔබගේ InfinityFree API Link එක මෙතනට නිවැරදිව දාන්න
const CONFIG_API = "https://xchamiwpbot.free.nf/api.php";

async function startxCHAMi() {
    console.log("-----------------------------------------");
    console.log("🚀 xCHAMi MD පද්ධතිය ආරම්භ වෙනවා...");
    console.log("-----------------------------------------");
    
    const { state, saveCreds } = await useMultiFileAuthState('xchami_session');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // අපි qrcode-terminal එකෙන් අතින් print කරනවා
        browser: ["xCHAMi MD", "Safari", "3.0.0"],
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    // සම්බන්ධතාවය පරීක්ෂා කිරීම
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("✅ QR එක ලැබුණා! කරුණාකර Scan කරන්න:");
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            let reason = lastDisconnect?.error?.output?.statusCode;
            if (reason === DisconnectReason.restartRequired) {
                console.log("🔄 Restart අවශ්‍යයි, නැවත ආරම්භ වෙනවා...");
                startxCHAMi();
            } else if (reason !== DisconnectReason.loggedOut) {
                console.log("❌ සම්බන්ධතාවය බිඳ වැටුණා. නැවත උත්සාහ කරනවා...");
                startxCHAMi();
            } else {
                console.log("🚫 ඔබ ලොග් අවුට් වී ඇත. කරුණාකර Session එක මකා නැවත Scan කරන්න.");
            }
        } else if (connection === 'open') {
            console.log('🎉 xCHAMi MD සාර්ථකව සම්බන්ධ විය!');
            console.log('🤖 බොට් දැන් සක්‍රීයයි (Online).');
        }
    });

    sock.ev.on('messages.upsert', async (chat) => {
        try {
            const msg = chat.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const from = msg.key.remoteJid;
            const isGroup = from.endsWith('@g.us');
            const body = msg.message.conversation || msg.message.extendedTextMessage?.text;

            // Group මැසේජ් වලට රිප්ලයි නොකිරීමට (අවශ්‍ය නම් මෙය මකන්න)
            if (isGroup) return;

            if (body) {
                console.log(`📩 පණිවිඩයක් ලැබුණා: ${body}`);

                // Fetch Settings from API with backup values
                let settings;
                try {
                    const res = await axios.get(CONFIG_API, { timeout: 8000 });
                    settings = res.data;
                } catch (e) {
                    console.log("⚠️ API Error: Default settings භාවිතා කරනවා.");
                    // API එක වැඩ නැත්නම් බොට් නතර නොවී වැඩ කිරීමට Default settings
                    settings = {
                        api_key: "YOUR_BACKUP_GEMMA_KEY", 
                        system_prompt: "You are xCHAMi MD, a friendly educational AI. Answer in Sinhala script.",
                        bot_status: "ON"
                    };
                }

                if (settings.bot_status === 'OFF') return;

                // Typing Indicator
                await sock.sendPresenceUpdate('composing', from);
                
                const genAI = new GoogleGenerativeAI(settings.api_key);
                const model = genAI.getGenerativeModel({ 
                    model: "gemma-2b-it", // වඩාත් වේගවත් Gemma model එක
                    systemInstruction: settings.system_prompt 
                });

                const result = await model.generateContent(body);
                const response = await result.response;
                const aiText = response.text();

                // Reply sending
                await sock.sendMessage(from, { text: aiText }, { quoted: msg });
                console.log(`✅ පිළිතුර යැවුවා.`);
            }
        } catch (error) {
            console.error("Critical Error:", error.message);
        }
    });
}

// ආරම්භ කිරීම
startxCHAMi().catch(err => console.log("Fatal Error:", err));
