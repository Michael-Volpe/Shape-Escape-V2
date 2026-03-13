// Connect to your specific Convex project
const client = new window.convex.ConvexClient("https://famous-skunk-169.convex.cloud");

let currentMode = 0; // 0 = Hall of Fame, 1 = Meteor Dash
const myName = localStorage.getItem("gameUsername");

const config = {
    0: {
        title: "HALL OF FAME",
        sub: "TOP 100 LEADERBOARD",
        query: "functions:getTopScores",
        headers: ["#", "NAME", "SCORE", "LVL", "TIME", "DATE"]
    },
    1: {
        title: "METEOR DASH",
        sub: "TOP METEOR ESCAPISTS",
        query: "functions:getMeteorLeaderboard",
        headers: ["#", "NAME", "DODGED", "LVL", "TIME", "DATE"]
    }
};

async function displayLeaderboard() {
    const leaderboardBody = document.getElementById("leaderboardBody");
    const boardTitle = document.getElementById("boardTitle");
    const boardSub = document.getElementById("boardSub");
    const headerRow = document.getElementById("tableHeaderRow");
    
    const settings = config[currentMode];
    
    // Update Title Texts
    boardTitle.innerText = settings.title;
    boardSub.innerText = settings.sub;

    // Update Table Headers
    if (headerRow) {
        headerRow.innerHTML = settings.headers.map(h => `<th>${h}</th>`).join("");
    }

    try {
        leaderboardBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px;">Fetching ${settings.title}...</td></tr>`;

        const scores = await client.query(settings.query);
        leaderboardBody.innerHTML = "";

        if (!scores || scores.length === 0) {
            leaderboardBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px;">No records found.</td></tr>`;
            return;
        }

        leaderboardBody.innerHTML = scores.map((entry, index) => {
            // Map keys based on mode (Global uses .name, Meteor uses .username)
            const name = currentMode === 0 ? (entry.name || "Anonymous") : (entry.username || "Anonymous");
            const isMe = myName && name.trim() === myName.trim();
            
            const rowStyle = isMe ? 'background: rgba(255, 68, 68, 0.2); border-left: 4px solid #ff4444;' : '';
            const nameStyle = isMe ? 'color: #ff4444; font-weight: 900;' : 'color: #ffffff; font-weight: bold;';

            // Column Mapping Logic
            let col3, col4, col5, col6;

            if (currentMode === 0) {
                // Hall of Fame Data
                col3 = entry.score || 0;
                col4 = entry.level || 0;
                col5 = (entry.time || 0) + "s";
                col6 = entry.date ? new Date(entry.date).toLocaleDateString() : "---";
            } else {
                // Meteor Dash Data (md_scores)
                col3 = entry.meteorsAvoided || 0;
                col4 = entry.finalLevel || 0;
                col5 = (entry.timeSurvived || 0) + "s";
                // Uses 'timestamp' from md_scores table or fallback to creationTime
                const rawDate = entry.timestamp || entry._creationTime;
                col6 = rawDate ? new Date(rawDate).toLocaleDateString() : "---";
            }

            return `
                <tr style="${rowStyle}">
                    <td>${(index === 0 && col3 > 0) ? '👑' : '#' + (index + 1)}</td>
                    <td style="${nameStyle}">${name}</td>
                    <td style="color: #ffeb3b; font-weight: bold;">${col3}</td>
                    <td>${col4}</td>
                    <td>${col5}</td>
                    <td style="font-size: 10px; color: #888;">${col6}</td>
                </tr>
            `;
        }).join("");

    } catch (err) {
        console.error("Leaderboard Error:", err);
        leaderboardBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red; padding: 20px;">Error: ${err.message}</td></tr>`;
    }
}

// Global function to switch boards
window.switchLeaderboard = (direction) => {
    currentMode = (currentMode + direction + 2) % 2;
    displayLeaderboard();
};

// Initial call
displayLeaderboard();
