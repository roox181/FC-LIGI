
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "matches.json");

function loadMatches() {
    if (!fs.existsSync(DATA_FILE)) {
        return [];
    }

    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveMatches(matches) {
    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(matches, null, 2),
        "utf8"
    );
}

// Oyuncuların puan tablosunu hesapla
function calculateStandings(matches) {
    const players = ["Alkım", "Buğra", "Osman", "Mustafa"];

    const standings = players.map(name => ({
        name,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0
    }));

    for (const match of matches) {
        if (
            !match ||
            typeof match.home !== "string" ||
            typeof match.away !== "string" ||
            !Number.isInteger(match.homeGoals) ||
            !Number.isInteger(match.awayGoals) ||
            match.homeGoals < 0 ||
            match.awayGoals < 0
        ) {
            continue;
        }

        const home = standings.find(p => p.name === match.home);
        const away = standings.find(p => p.name === match.away);

        if (!home || !away || home === away) {
            continue;
        }

        home.played++;
        away.played++;

        home.goalsFor += match.homeGoals;
        home.goalsAgainst += match.awayGoals;

        away.goalsFor += match.awayGoals;
        away.goalsAgainst += match.homeGoals;

        if (match.homeGoals > match.awayGoals) {
            home.wins++;
            home.points += 3;
            away.losses++;
        } else if (match.homeGoals < match.awayGoals) {
            away.wins++;
            away.points += 3;
            home.losses++;
        } else {
            home.draws++;
            away.draws++;
            home.points++;
            away.points++;
        }
    }

    for (const player of standings) {
        player.goalDifference =
            player.goalsFor - player.goalsAgainst;
    }

    standings.sort((a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        a.name.localeCompare(b.name, "tr")
    );

    return standings;
}

module.exports = {
    loadMatches,
    saveMatches,
    calculateStandings
};
