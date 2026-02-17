const SUPABASE_URL = "https://agbdhsetpkozexgayypl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_G5yfHs7W1leSva8Pb8iDzg_01eNASv7";

let supabase;
let trendChart;
let players = [];

const setupNotice = document.getElementById("setupNotice");
const authStatus = document.getElementById("authStatus");
const adminCard = document.getElementById("adminCard");
const saveStatus = document.getElementById("saveStatus");

const gameForm = document.getElementById("gameForm");
const placementsContainer = document.getElementById("placementsContainer");
const sendMagicLinkBtn = document.getElementById("sendMagicLinkBtn");
const participantCountSelect = document.getElementById("participantCount");

if (SUPABASE_URL.startsWith("YOUR_") || SUPABASE_ANON_KEY.startsWith("YOUR_")) {
  adminCard.classList.add("disabled");
  setupNotice.style.display = "block";
} else {
  setupNotice.style.display = "none";
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  initialize();
}

async function initialize() {
  await checkSession();
  bindEvents();
  await loadPlayers();
  renderParticipantOptions();
  renderPlacementSelectors(getSelectedParticipantCount());
  await refreshDashboard();
}

function bindEvents() {
  sendMagicLinkBtn.addEventListener("click", sendMagicLink);
  gameForm.addEventListener("submit", submitGame);

  participantCountSelect.addEventListener("change", () => {
    renderPlacementSelectors(getSelectedParticipantCount());
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    updateAuthUI(session);
  });
}

async function checkSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    authStatus.textContent = `Auth error: ${error.message}`;
    return;
  }
  updateAuthUI(data.session);
}

function updateAuthUI(session) {
  if (session?.user) {
    authStatus.textContent = `Signed in as ${session.user.email}`;
    adminCard.classList.remove("disabled");
  } else {
    authStatus.textContent = "Not signed in. Admin form is locked.";
    adminCard.classList.add("disabled");
  }
}

async function sendMagicLink() {
  const email = document.getElementById("emailInput").value.trim();
  if (!email) {
    authStatus.textContent = "Enter an email first.";
    return;
  }

  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) {
    authStatus.textContent = `Failed to send login link: ${error.message}`;
    return;
  }
  authStatus.textContent = "Magic link sent. Open your email and come back after login.";
}

async function loadPlayers() {
  const { data, error } = await supabase
    .from("players")
    .select("id,name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    authStatus.textContent = `Failed to load players: ${error.message}`;
    return;
  }

  players = data || [];
}

function renderParticipantOptions() {
  participantCountSelect.innerHTML = "";

  for (let count = 2; count <= players.length; count += 1) {
    const option = document.createElement("option");
    option.value = String(count);
    option.textContent = String(count);
    participantCountSelect.appendChild(option);
  }

  participantCountSelect.value = String(players.length);
}

function getSelectedParticipantCount() {
  const value = Number(participantCountSelect.value);
  if (!Number.isFinite(value) || value < 2) return players.length;
  return value;
}

function renderPlacementSelectors(participantCount) {
  placementsContainer.innerHTML = "";

  for (let place = 1; place <= participantCount; place += 1) {
    const wrapper = document.createElement("div");
    wrapper.className = "placementItem";

    const label = document.createElement("label");
    label.textContent = `${ordinal(place)} Place`;

    const select = document.createElement("select");
    select.name = `place_${place}`;
    select.required = true;
    select.innerHTML = `<option value="">Select player</option>`;

    players.forEach((p) => {
      const option = document.createElement("option");
      option.value = p.id;
      option.textContent = p.name;
      select.appendChild(option);
    });

    label.appendChild(select);
    wrapper.appendChild(label);
    placementsContainer.appendChild(wrapper);
  }
}

async function submitGame(event) {
  event.preventDefault();

  const sessionResult = await supabase.auth.getSession();
  if (!sessionResult.data.session) {
    saveStatus.textContent = "Sign in as admin first.";
    return;
  }

  const playedAt = document.getElementById("playedAt").value;
  const mapName = document.getElementById("mapName").value.trim();
  const replayUrl = document.getElementById("replayUrl").value.trim() || null;
  const participantCount = getSelectedParticipantCount();

  if (!playedAt || !mapName) {
    saveStatus.textContent = "Date and map are required.";
    return;
  }

  const orderedPlayerIds = [];
  for (let place = 1; place <= participantCount; place += 1) {
    const select = document.querySelector(`select[name=place_${place}]`);
    orderedPlayerIds.push(select.value);
  }

  const unique = new Set(orderedPlayerIds);
  if (orderedPlayerIds.some((v) => !v) || unique.size !== participantCount) {
    saveStatus.textContent = "Each placement must have a different player.";
    return;
  }

  saveStatus.textContent = "Saving...";

  const { data: gameInsert, error: gameErr } = await supabase
    .from("games")
    .insert({
      played_at: playedAt,
      map_name: mapName,
      replay_url: replayUrl,
      created_by: sessionResult.data.session.user.email || "admin",
    })
    .select("id")
    .single();

  if (gameErr) {
    saveStatus.textContent = `Failed to save game: ${gameErr.message}`;
    return;
  }

  const rows = orderedPlayerIds.map((playerId, idx) => ({
    game_id: gameInsert.id,
    player_id: playerId,
    placement: idx + 1,
  }));

  const { error: resultErr } = await supabase.from("game_results").insert(rows);
  if (resultErr) {
    saveStatus.textContent = `Saved game, but failed results insert: ${resultErr.message}`;
    return;
  }

  saveStatus.textContent = "Game saved.";
  gameForm.reset();
  participantCountSelect.value = String(players.length);
  renderPlacementSelectors(getSelectedParticipantCount());

  await refreshDashboard();
}

async function refreshDashboard() {
  const leaderboard = await renderLeaderboard();
  renderComparison(leaderboard);
  await Promise.all([renderRecentGames(), renderTrendChart()]);
}

async function fetchResults() {
  const { data, error } = await supabase
    .from("game_results")
    .select("game_id,placement,player_id,players(name),games(id,played_at,map_name,replay_url)")
    .order("played_at", { foreignTable: "games", ascending: true });

  if (error) {
    throw error;
  }
  return data || [];
}

function buildLeaderboardData(results) {
  const gameSizes = new Map();
  const board = new Map();

  results.forEach((row) => {
    gameSizes.set(row.game_id, (gameSizes.get(row.game_id) || 0) + 1);
  });

  players.forEach((p) => {
    board.set(p.name, {
      player: p.name,
      games: 0,
      scoreSum: 0,
      placeSum: 0,
      wins: 0,
    });
  });

  results.forEach((row) => {
    const playerName = row.players?.name || "Unknown";
    if (!board.has(playerName)) {
      board.set(playerName, { player: playerName, games: 0, scoreSum: 0, placeSum: 0, wins: 0 });
    }

    const gameSize = gameSizes.get(row.game_id) || 1;
    const score = row.placement / gameSize;

    const current = board.get(playerName);
    current.scoreSum += score;
    current.games += 1;
    current.placeSum += row.placement;
    if (row.placement === 1) current.wins += 1;
  });

  return [...board.values()]
    .map((r) => ({
      ...r,
      avgScore: r.games > 0 ? r.scoreSum / r.games : null,
      avgPlace: r.games > 0 ? r.placeSum / r.games : null,
    }))
    .sort((a, b) => {
      const aScore = a.avgScore ?? Number.POSITIVE_INFINITY;
      const bScore = b.avgScore ?? Number.POSITIVE_INFINITY;
      if (aScore !== bScore) return aScore - bScore;
      return b.wins - a.wins;
    });
}

async function renderLeaderboard() {
  const tbody = document.querySelector("#leaderboardTable tbody");
  tbody.innerHTML = "";

  try {
    const results = await fetchResults();
    const rows = buildLeaderboardData(results);

    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.player}</td>
        <td>${r.games}</td>
        <td>${r.avgScore === null ? "-" : r.avgScore.toFixed(3)}</td>
        <td>${r.avgPlace === null ? "-" : r.avgPlace.toFixed(2)}</td>
        <td>${r.wins}</td>
      `;
      tbody.appendChild(tr);
    });

    return rows.filter((r) => r.games > 0);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">${err.message}</td></tr>`;
    return [];
  }
}

function renderComparison(sortedRows) {
  const tbody = document.querySelector("#comparisonTable tbody");
  tbody.innerHTML = "";

  if (sortedRows.length < 2) {
    tbody.innerHTML = '<tr><td colspan="3">Need at least two ranked players.</td></tr>';
    return;
  }

  for (let i = 0; i < sortedRows.length - 1; i += 1) {
    const higher = sortedRows[i];
    const lower = sortedRows[i + 1];

    if (!higher.avgScore || !lower.avgScore) continue;

    const gapPct = ((lower.avgScore - higher.avgScore) / higher.avgScore) * 100;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${higher.player} (${higher.avgScore.toFixed(3)})</td>
      <td>${lower.player} (${lower.avgScore.toFixed(3)})</td>
      <td>${gapPct.toFixed(2)}%</td>
    `;
    tbody.appendChild(tr);
  }
}

async function renderRecentGames() {
  const tbody = document.querySelector("#gamesTable tbody");
  tbody.innerHTML = "";

  try {
    const { data: games, error: gamesErr } = await supabase
      .from("games")
      .select("id,played_at,map_name,replay_url")
      .order("played_at", { ascending: false })
      .limit(20);

    if (gamesErr) throw gamesErr;

    const { data: results, error: resErr } = await supabase
      .from("game_results")
      .select("game_id,placement,players(name)")
      .order("placement", { ascending: true });

    if (resErr) throw resErr;

    const grouped = new Map();
    results.forEach((r) => {
      if (!grouped.has(r.game_id)) grouped.set(r.game_id, []);
      grouped.get(r.game_id).push(`${r.placement}. ${r.players?.name || "Unknown"}`);
    });

    games.forEach((g) => {
      const tr = document.createElement("tr");
      const replayCell = g.replay_url
        ? `<a href="${g.replay_url}" target="_blank" rel="noreferrer">Replay</a>`
        : "-";

      tr.innerHTML = `
        <td>${g.played_at}</td>
        <td>${g.map_name}</td>
        <td>${replayCell}</td>
        <td>${(grouped.get(g.id) || []).join(" | ")}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">${err.message}</td></tr>`;
  }
}

async function renderTrendChart() {
  const ctx = document.getElementById("trendChart");

  try {
    const results = await fetchResults();
    const gameSizes = new Map();
    const datesSet = new Set();

    results.forEach((row) => {
      gameSizes.set(row.game_id, (gameSizes.get(row.game_id) || 0) + 1);
      if (row.games?.played_at) datesSet.add(row.games.played_at);
    });

    const orderedDates = [...datesSet].sort();
    const byPlayerDate = new Map();

    results.forEach((row) => {
      const playerName = row.players?.name || "Unknown";
      const date = row.games?.played_at;
      if (!date) return;

      const gameSize = gameSizes.get(row.game_id) || 1;
      const score = row.placement / gameSize;

      if (!byPlayerDate.has(playerName)) byPlayerDate.set(playerName, new Map());
      const playerMap = byPlayerDate.get(playerName);
      if (!playerMap.has(date)) playerMap.set(date, []);
      playerMap.get(date).push(score);
    });

    const palette = ["#1b7f5d", "#d97706", "#2563eb", "#dc2626", "#7c3aed", "#0f766e", "#be123c", "#4b5563"];

    const datasets = [...byPlayerDate.entries()].map(([name, dateMap], i) => {
      let runningSum = 0;
      let runningCount = 0;

      const data = orderedDates.map((d) => {
        if (dateMap.has(d)) {
          const scores = dateMap.get(d);
          scores.forEach((value) => {
            runningSum += value;
            runningCount += 1;
          });
        }

        if (runningCount === 0) return null;
        return runningSum / runningCount;
      });

      return {
        label: name,
        data,
        borderColor: palette[i % palette.length],
        backgroundColor: palette[i % palette.length],
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.25,
      };
    });

    if (trendChart) trendChart.destroy();

    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: orderedDates,
        datasets,
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom" },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Running Avg Score (Lower is Better)" },
          },
          x: {
            title: { display: true, text: "Game Date" },
          },
        },
      },
    });
  } catch (_err) {
    if (trendChart) trendChart.destroy();
    trendChart = null;
  }
}

function ordinal(num) {
  const suffix = ["th", "st", "nd", "rd"];
  const value = num % 100;
  return `${num}${suffix[(value - 20) % 10] || suffix[value] || suffix[0]}`;
}
