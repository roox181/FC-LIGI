
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");

const {
    loadMatches,
    saveMatches,
    calculateStandings
} = require("./matches");

const app = express();
const PORT = 3000;

const players = ["Alkım", "Buğra", "Osman", "Mustafa"];
const FIXTURE_FILE = path.join(__dirname, "fixtures.json");

if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
    console.error("HATA: .env dosyasında ADMIN_PASSWORD veya SESSION_SECRET eksik.");
    process.exit(1);
}

app.use(express.json());

app.use(session({
    name: "fc_ligi_session",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "strict",
        secure: false,
        maxAge: 2 * 60 * 60 * 1000
    }
}));

function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin === true) {
        return next();
    }

    return res.status(401).json({
        error: "Yönetici girişi gerekli."
    });
}

// Fikstürü dosyadan oku.
function loadFixture() {
    if (!fs.existsSync(FIXTURE_FILE)) {
        return null;
    }

    const data = JSON.parse(
        fs.readFileSync(FIXTURE_FILE, "utf8")
    );

    if (!data || !Array.isArray(data.rounds)) {
        throw new Error("Fikstür dosyasının biçimi geçersiz.");
    }

    return data;
}

// Fikstürü dosyaya kaydet.
function saveFixture(fixture) {
    fs.writeFileSync(
        FIXTURE_FILE,
        JSON.stringify(fixture, null, 2),
        "utf8"
    );
}

// Rastgele sıralama.
function shuffle(array) {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
}

// Her oyuncunun diğer oyuncularla bir kez oynadığı
// üç turluk fikstür oluştur.
function generateFixture() {
    const shuffledPlayers = shuffle(players);
    const rounds = [];

    // Tek sayıda oyuncu olmadığı için 3 tur yeterli.
    for (let roundIndex = 0; roundIndex < shuffledPlayers.length - 1; roundIndex++) {
        const roundMatches = [];

        for (let i = 0; i < shuffledPlayers.length / 2; i++) {
            const first = shuffledPlayers[i];
            const second = shuffledPlayers[shuffledPlayers.length - 1 - i];

            // Ev sahibi/deplasman sırasını rastgele seç.
            const homeFirst = Math.random() < 0.5;

            roundMatches.push({
                home: homeFirst ? first : second,
                away: homeFirst ? second : first
            });
        }

        rounds.push({
            name: `${roundIndex + 1}. Tur`,
            matches: roundMatches
        });

        // İlk oyuncu sabit kalır, diğer oyuncular döndürülür.
        const fixedPlayer = shuffledPlayers[0];
        const rotatingPlayers = shuffledPlayers.slice(1);

        rotatingPlayers.unshift(rotatingPlayers.pop());

        shuffledPlayers.splice(
            0,
            shuffledPlayers.length,
            fixedPlayer,
            ...rotatingPlayers
        );
    }

    return {
        rounds,
        createdAt: new Date().toISOString()
    };
}

// Yönetici girişi.
app.post("/api/admin/login", (req, res, next) => {
    const { password } = req.body || {};

    if (
        typeof password !== "string" ||
        password !== process.env.ADMIN_PASSWORD
    ) {
        return res.status(401).json({
            error: "Şifre yanlış."
        });
    }

    req.session.regenerate((error) => {
        if (error) return next(error);

        req.session.isAdmin = true;

        req.session.save((saveError) => {
            if (saveError) return next(saveError);

            res.json({
                message: "Yönetici girişi başarılı."
            });
        });
    });
});

// Giriş durumunu kontrol et.
app.get("/api/admin/status", (req, res) => {
    res.json({
        isAdmin: req.session?.isAdmin === true
    });
});

// Yönetici çıkışı.
app.post("/api/admin/logout", (req, res, next) => {
    req.session.destroy((error) => {
        if (error) return next(error);

        res.clearCookie("fc_ligi_session", {
            httpOnly: true,
            sameSite: "strict",
            secure: false
        });

        res.json({ message: "Çıkış yapıldı." });
    });
});

// Yönetici panelini statik dosyalardan önce koru.
app.get("/admin-panel.html", requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, "admin-panel.html"));
});

// Fikstürü herkes görüntüleyebilir.
app.get("/api/fixtures", (req, res) => {
    try {
        const fixture = loadFixture();

        if (!fixture) {
            return res.json({ rounds: [] });
        }

        res.json(fixture);
    } catch (error) {
        console.error("Fikstür okunamadı:", error);
        res.status(500).json({
            error: "Fikstür yüklenemedi."
        });
    }
});

// Yalnızca yönetici fikstür oluşturabilir.
app.post("/api/fixtures", requireAdmin, (req, res) => {
    try {
        const requestedPlayers = req.body?.players;

        // İstemciden gelen oyuncu listesini doğrula.
        if (
            !Array.isArray(requestedPlayers) ||
            requestedPlayers.length !== players.length ||
            new Set(requestedPlayers).size !== players.length ||
            !players.every(player => requestedPlayers.includes(player))
        ) {
            return res.status(400).json({
                error: "Oyuncu listesi geçersiz."
            });
        }

        const fixture = generateFixture();
        saveFixture(fixture);

        res.status(201).json(fixture);
    } catch (error) {
        console.error("Fikstür oluşturulamadı:", error);
        res.status(500).json({
            error: "Fikstür oluşturulamadı veya kaydedilemedi."
        });
    }
});

// Maçları getir.
app.get("/api/matches", (req, res) => {
    try {
        res.json(loadMatches());
    } catch (error) {
        console.error("Maçlar yüklenemedi:", error);
        res.status(500).json({
            error: "Maçlar yüklenemedi."
        });
    }
});

// Puan tablosunu getir.
app.get("/api/standings", (req, res) => {
    try {
        res.json(calculateStandings(loadMatches()));
    } catch (error) {
        console.error("Puan tablosu yüklenemedi:", error);
        res.status(500).json({
            error: "Puan tablosu yüklenemedi."
        });
    }
});

// Yeni maç kaydet — yalnızca yönetici.
app.post("/api/matches", requireAdmin, (req, res) => {
    try {
        const { home, away, homeGoals, awayGoals } = req.body || {};

        if (
            !players.includes(home) ||
            !players.includes(away) ||
            home === away ||
            !Number.isInteger(homeGoals) ||
            !Number.isInteger(awayGoals) ||
            homeGoals < 0 ||
            awayGoals < 0 ||
            homeGoals > 99 ||
            awayGoals > 99
        ) {
            return res.status(400).json({
                error: "Geçersiz maç bilgileri veya skor."
            });
        }

        const matches = loadMatches();

        const newMatch = {
            home,
            away,
            homeGoals,
            awayGoals,
            date: new Date().toISOString()
        };

        matches.push(newMatch);
        saveMatches(matches);

        res.status(201).json({
            message: "Maç kaydedildi.",
            match: newMatch
        });
    } catch (error) {
        console.error("Maç kaydedilemedi:", error);
        res.status(500).json({
            error: "Maç kaydedilemedi."
        });
    }
});

// Maç sil — yalnızca yönetici.
app.delete("/api/matches/:index", requireAdmin, (req, res) => {
    try {
        const index = Number(req.params.index);
        const matches = loadMatches();

        if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= matches.length
        ) {
            return res.status(404).json({
                error: "Silinecek maç bulunamadı."
            });
        }

        const deletedMatch = matches[index];

        matches.splice(index, 1);
        saveMatches(matches);

        res.json({
            message: "Maç silindi.",
            deletedMatch
        });
    } catch (error) {
        console.error("Maç silinemedi:", error);
        res.status(500).json({
            error: "Maç silinemedi."
        });
    }
});

// Statik dosyaları korumalı yönetici rotasından sonra sun.
app.use(express.static(__dirname, {
    index: "index.html",
    dotfiles: "ignore"
}));

// Genel hata yönetimi.
app.use((error, req, res, next) => {
    console.error("SUNUCU HATASI:", error);

    if (res.headersSent) return next(error);

    res.status(500).json({
        error: "Sunucuda bir hata oluştu."
    });
});

// Sunucuyu başlat.
const server = app.listen(PORT, "127.0.0.1", () => {
    console.log(`FC Ligi: http://127.0.0.1:${PORT}`);
});

server.on("error", (error) => {
    console.error("SUNUCU HATASI:", error);
});
