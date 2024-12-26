const express = require("express");
const fs = require("fs-extra");
const pino = require("pino");
const NodeCache = require("node-cache");
const { Mutex } = require("async-mutex");
const PastebinAPI = require("pastebin-js");
const path = require("path");
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
const port = process.env.PORT || 3000;
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

    const session = makeWASocket({
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
        const data = await fs.readFileSync(sessionFilePath, 'utf-8');
        const textt = Buffer.from(data, 'utf-8').toString('base64');

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
            text: "Secktor;;;" + textt,
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
