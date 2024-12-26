const express = require("express");
const fs = require("fs-extra");
const pino = require("pino");
const NodeCache = require("node-cache");
const { Mutex } = require("async-mutex");
const PastebinAPI = require("pastebin-js");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers,
    makeCacheableSignalKeyStore,
    DisconnectReason,
} = require("@whiskeysockets/baileys");

// Initialize services
const pastebin = new PastebinAPI("EMWTMkQAVfJa9kM-MRUrxd5Oku1U7pgL");
const app = express();
const port = process.env.PORT || 3000
const msgRetryCounterCache = new NodeCache();
const mutex = new Mutex();
const logger = pino({ level: "info" });

// Clean up session files if necessary
const cleanSessionDir = async () => {
    const sessionDir = path.join(__dirname, "session");
    if (fs.existsSync(sessionDir)) {
        await fs.emptyDir(sessionDir);
        await fs.remove(sessionDir);
    }
};

// Middleware to serve static files
app.use(express.static(path.join(__dirname, "pages")));

app.get("/main", (req, res) => {
  res.sendFile(__dirname+"/pages/main.html");
});
app.get("/test2", (req, res) => {
  res.send("All system are in optimal condition");
});
app.get("/repl", (req, res) => {
res.redirect(301, 'https://replit.com/@SamPandey001/Secktor-Md'); //
});
app.get("/deployment", (req, res) => {
 res.sendFile(__dirname+"/pages/index-button.html");
});
app.get("/deploy", (req, res) => {
  res.sendFile(__dirname+"/pages/deploy.html");
});
app.get("/heroku", (req, res) => {
  res.sendFile(__dirname+"/pages/heroku.html");
});
app.get("/editor", (req, res) => {
  res.sendFile(__dirname+"/pages/editor.html"); 
});
app.get("/modules", (req, res) => {
  res.sendFile(__dirname+"/pages/module.html");
});
// app.get('/koyeb', (req, res) => {
// res.redirect(301, 'https://app.koyeb.com/apps/deploy?type=docker&image=quay.io/sampandey001/koyeb:latest&env[SESSION_ID]&env[OWNER_NUMBER]&env[MONGODB_URI]&&env[OWNER_NAME]&env[PREFIX]=.&env[THUMB_IMAGE]=https://raw.githubusercontent.com/SecktorBot/Brandimages/main/logos/SocialLogo%201.png&env[email]=sam@secktor.live&env[global_url]=instagram.com&env[FAKE_COUNTRY_CODE]=92&env[READ_MESSAGE]=false&env[DISABLE_PM]=false&env[ANTI_BAD_WORD]=fuck&env[WORKTYPE]=public&env[THEME]=SECKTOR&env[PACK_INFO]=Sam;Pandey&name=secktorbot&env[KOYEB_NAME]=sampandey001&env[ANTILINK_VALUES]=chat.whatsapp.com&env[PORT]=8000');
// });
app.get("/koyeb", (req, res) => {
  res.sendFile(__dirname+"/pages/deploy.html");
});
app.get('/koyeb2', (req, res) => {
res.redirect(301, 'https://app.koyeb.com/apps/deploy?type=git&repository=github.com/https://github.com/SamPandey001/Secktor-Md&branch=main&build_command=npm%20i&run_command=npm%20start&env[SESSION_ID]&env[OWNER_NUMBER]&env[MONGODB_URI]&&env[OWNER_NAME]&env[PREFIX]=.&env[THUMB_IMAGE]=https://raw.githubusercontent.com/SecktorBot/Brandimages/main/logos/SocialLogo%201.png&env[email]=sam@secktor.live&env[global_url]=instagram.com&env[FAKE_COUNTRY_CODE]=92&env[READ_MESSAGE]=false&env[DISABLE_PM]=false&env[ANTI_BAD_WORD]=fuck&env[WORKTYPE]=public&env[THEME]=SECKTOR&env[PACK_INFO]=Sam;Pandey&name=secktorbot&env[KOYEB_NAME]=sampandey001&env[ANTILINK_VALUES]=chat.whatsapp.com&env[PORT]=8000');
	     });
app.get('/railway', (req, res) => {
res.redirect(301, 'https://railway.app/new/template/hbw5a1?referralCode=okazYt'); 
});
app.get('/youtube', (req, res) => {
  res.sendFile(__dirname+"/pages/main.html");
});
app.get('/support', (req, res) => {
res.redirect(301, 'https://chat.whatsapp.com/DG86OkvmerHKHJjkE5X2Wv');
});
app.get('/mongo', (req, res) => {
res.redirect(301, 'https://www.youtube.com/watch?v=4YEUtGlqkl4');
});

app.get('/wiki', (req, res) => {
res.redirect(301, 'https://github.com/SamPandey001/Secktor-Md/wiki');
});

app.get('/plugins', (req, res) => {
res.redirect(301, 'https://github.com/SamPandey001/Secktor-Plugins');
});
app.get('/repo', (req, res) => {
res.redirect(301, 'https://github.com/SamPandey001/Secktor-Md');
});
app.get('/termux', (req, res) => {
res.redirect(301, 'https://f-droid.org/repo/com.termux_118.apk');
}); 
app.get('/public', (req, res) => {
res.redirect(301, 'https://chat.whatsapp.com/DG86OkvmerHKHJjkE5X2Wv');
});
app.get('/wiki/mongo', (req, res) => {
res.redirect(301, 'https://github.com/SamPandey001/Secktor-Md/wiki/Mongodb-URI');
});
app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "pages", "dashboard.html"));
});
app.get("/pair", async (req, res) => {
    const Num = req.query.code;
    if (!Num) {
        return res.status(400).json({ message: "Phone number is required" });
    }

    const release = await mutex.acquire();
    try {
        await cleanSessionDir();
        await connector(Num, res);
    } catch (error) {
        logger.error("Error during pairing process:", error);
        res.status(500).json({ error: "Server Error" });
        await cleanSessionDir();
    } finally {
        release();
    }
});

// Connector function to handle WhatsApp connection
async function connector(Num, res) {
    const sessionDir = path.join(__dirname, "session");
    await fs.ensureDir(sessionDir);

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    session = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
        logger,
        browser: Browsers.macOS("Safari"),
        markOnlineOnConnect: true,
        msgRetryCounterCache,
    });

    if (!session.authState.creds.registered) {
        await delay(1500);
        Num = Num.replace(/[^0-9]/g, "");
        const code = await session.requestPairingCode(Num);
        if (!res.headersSent) {
            res.json({ code: code?.match(/.{1,4}/g)?.join("-") });
        }
    }

    session.ev.on("creds.update", async () => {
        await saveCreds();
    });

    session.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "open") {
            logger.info("Connected successfully");
            await delay(5000);
            await handleSessionUpload(session);
        } else if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode;
            logger.warn(`Connection closed. Reason: ${reason}`);
            reconn(reason);
        }
    });
}

// Handle session upload to Pastebin
async function handleSessionUpload(session) {
    try {
        const sessionFilePath = path.join(__dirname, "session", "creds.json");
	 let data = await fs.readFileSync(__dirname+'/auth_info_baileys/creds.json','utf-8')
	    let textt = btoa(data)
        const pasteData = await pastebin.createPasteFromFile(
            sessionFilePath,
            "SamPandey001",
            null,
            1,
            "N",
        );
        const unique = pasteData.split("/")[3];
        const sessionKey = Buffer.from(unique).toString("base64");
        await session.sendMessage(session.user.id, {
            text: "Secktor;;;" + sessionKey,
        });
	      await session.sendMessage(session.user.id, {
            text: "Secktor;;;" + data,
        });
	       await session.sendMessage(session.user.id, {
            text: "Use the shorter session ID first, and if the bot doesn't connect, try the longer one.\n*Thank You :)*",
        });
        logger.info("[Session] Session online");

        await cleanSessionDir();
    } catch (error) {
        logger.error("Error uploading session to Pastebin:", error);
    }
}

// Reconnect function to handle disconnections
function reconn(reason) {
    if (
        [
            DisconnectReason.connectionLost,
            DisconnectReason.connectionClosed,
            DisconnectReason.restartRequired,
        ].includes(reason)
    ) {
        logger.info("Connection lost, reconnecting...");
        connector();
    } else {
        logger.error(`Disconnected! Reason: ${reason}`);
        session.end();
    }
}

// Start the server
app.listen(port, () => {
    logger.info(`Server running on http://localhost:${port}`);
});
