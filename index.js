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
const port = 3000;
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

// Define routes
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "pages", "dashboard.html"));
});

// Define other routes
const routes = [
    { path: "/main", file: "main.html" },
    { path: "/id", file: "qr-session.html" },
    { path: "/test2", handler: (req, res) => res.send("All systems are in optimal condition") },
    { path: "/repl", redirect: 'https://replit.com/@SamPandey001/Secktor-Md' },
    { path: "/deployment", file: "index-button.html" },
    { path: "/deploy", file: "deploy.html" },
    { path: "/heroku", file: "heroku.html" },
    { path: "/editor", file: "editor.html" },
    { path: "/modules", file: "module.html" },
    { path: "/koyeb", file: "deploy.html" },
    {
        path: '/koyeb2',
        redirect: 'https://app.koyeb.com/apps/deploy?type=git&repository=github.com/https://github.com/SamPandey001/Secktor-Md&branch=main&build_command=npm%20i&run_command=npm%20start&env[SESSION_ID]&env[OWNER_NUMBER]&env[MONGODB_URI]&&env[OWNER_NAME]&env[PREFIX]=.&env[THUMB_IMAGE]=https://raw.githubusercontent.com/SecktorBot/Brandimages/main/logos/SocialLogo%201.png&env[email]=sam@secktor.live&env[global_url]=instagram.com&env[FAKE_COUNTRY_CODE]=92&env[READ_MESSAGE]=false&env[DISABLE_PM]=false&env[ANTI_BAD_WORD]=fuck&env[WORKTYPE]=public&env[THEME]=SECKTOR&env[PACK_INFO]=Sam;Pandey&name=secktorbot&env[KOYEB_NAME]=sampandey001&env[ANTILINK_VALUES]=chat.whatsapp.com&env[PORT]=8000'
    },
    { path: '/railway', redirect: 'https://railway.app/new/template/hbw5a1?referralCode=okazYt' },
    { path: '/youtube', file: "main.html" },
    { path: '/support', redirect: 'https://chat.whatsapp.com/Bl2F9UTVU4CBfZU6eVnrbCl' },
    { path: '/mongo', redirect: 'https://www.youtube.com/watch?v=WWrpBCBlyuo' },
    { path: '/wiki', redirect: 'https://github.com/SamPandey001/Secktor-Md/wiki' },
    { path: '/plugins', redirect: 'https://github.com/SamPandey001/Secktor-Plugins' },
    { path: '/repo', redirect: 'https://github.com/SamPandey001/Secktor-Md' },
    { path: '/termux', redirect: 'https://f-droid.org/repo/com.termux_118.apk' },
    { path: '/pages', redirect: 'https://chat.whatsapp.com/KWWFhiP1yNn2Sc9TDZpHXJ' },
    { path: '/wiki/mongo', redirect: 'https://github.com/SamPandey001/Secktor-Md/wiki/Mongodb-URI' },
    { path: '/session', redirect: 'https://secktor-md.koyeb.app/' },
    { path: '/session2', redirect: 'https://secktor-md.koyeb.app/' },
];

routes.forEach(route => {
    if (route.file) {
        app.get(route.path, (req, res) => res.sendFile(path.join(__dirname, "pages", route.file)));
    } else if (route.redirect) {
        app.get(route.path, (req, res) => res.redirect(301, route.redirect));
    } else if (route.handler) {
        app.get(route.path, route.handler);
    }
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
        const pasteData = await pastebin.createPasteFromFile(
            sessionFilePath,
            "SamPandey001",
            null,
            1,
            "N"
        );
        const unique = pasteData.split("/")[3];
        const sessionKey = Buffer.from(unique).toString("base64");
        await session.sendMessage(session.user.id, {
            text: "Secktor;;;" + sessionKey,
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