const CHAR_API = "http://localhost:3000/characters";
const USER_API = "http://localhost:3000/userHeroes";
const POINT_LIMIT = 200;
const STAT_NAMES = [
  "intelligence",
  "strength",
  "speed",
  "durability",
  "power",
  "combat",
];

let currentTurn = 1;
let currentPage = 1;
const pageSize = 12;
let sortOrder = "desc";
let editingHeroId = null;
let editingHeroFull = null; // holds the full hero object being edited (needed for PUT)
const teamsByPlayer = { 1: [], 2: [] };

const poolDiv = document.getElementById("character-pool");
const turnIndicator = document.getElementById("turn-indicator");
const publisherFilter = document.getElementById("publisher-filter");
const sortStat = document.getElementById("sort-stat");
const sortOrderBtn = document.getElementById("sort-order-btn");
const pageInfo = document.getElementById("page-info");

const editModal = document.getElementById("edit-modal");
const editHeroName = document.getElementById("edit-hero-name");
const editTotal = document.getElementById("edit-total");
const editError = document.getElementById("edit-error");
const statInputs = {
  intelligence: document.getElementById("edit-intelligence"),
  strength: document.getElementById("edit-strength"),
  speed: document.getElementById("edit-speed"),
  durability: document.getElementById("edit-durability"),
  power: document.getElementById("edit-power"),
  combat: document.getElementById("edit-combat"),
};

// ---- FETCH AND RENDER POOL ----
async function loadPool() {
  const params = new URLSearchParams({
    picked: "false",
    _page: String(currentPage),
    _per_page: String(pageSize),
  });

  if (publisherFilter.value) {
    params.set("publisher", publisherFilter.value);
  }
  if (sortStat.value) {
    const sortField = sortOrder === "desc" ? `-${sortStat.value}` : sortStat.value;
    params.set("_sort", sortField);
  }

  try {
    const res = await fetch(`${CHAR_API}?${params}`);
    if (!res.ok) {
      throw new Error(`API responded with ${res.status}`);
    }

    const payload = await res.json();
    const characters = Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(characters)) {
      throw new Error("API returned an invalid character list");
    }
    renderPool(characters);
  } catch (error) {
    console.error("Could not load character pool:", error);
    poolDiv.innerHTML = "<p class=\"error\">Could not load the character pool. Start json-server on port 3000.</p>";
  }
}

function renderPool(characters) {
  poolDiv.innerHTML = "";

  characters.forEach((char) => {
    const card = document.createElement("div");
    card.className = "card";

    const img = document.createElement("img");
    img.src = char.image || "placeholder.png";
    img.onerror = () => { img.src = "placeholder.png"; };

    const name = document.createElement("h3");
    name.textContent = char.name;

    const stats = document.createElement("p");
    stats.textContent = `INTELLIGENCE ${char.intelligence} | STRENGTH ${char.strength} | SPEED ${char.speed}`;

    const pickBtn = document.createElement("button");
    pickBtn.textContent = "Pick";
    pickBtn.onclick = () => pickCharacter(char);

    // card.appendChild(img);
    card.appendChild(name);
    card.appendChild(stats);
    card.appendChild(pickBtn);

    poolDiv.appendChild(card);
  });
}

// ---- PICK A CHARACTER (POST a copy into userHeroes, PATCH original) ----
async function pickCharacter(char) {
    
  await fetch(USER_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      originalId: char.id,
      name: char.name,
      publisher: char.publisher,
      image: char.image,
      intelligence: char.intelligence,
      strength: char.strength,
      speed: char.speed,
      durability: char.durability,
      power: char.power,
      combat: char.combat,
      baseStats: Object.fromEntries(
        STAT_NAMES.map((stat) => [stat, char[stat]])
      ),
      pickedBy: currentTurn,
    }),
  });

  await fetch(`${CHAR_API}/${char.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ picked: true, pickedBy: currentTurn }),
  });

  currentTurn = currentTurn === 1 ? 2 : 1;
  turnIndicator.textContent = `Player ${currentTurn}'s turn`;

  loadPool();
  loadTeams();
}

// ---- LOAD TEAMS (from userHeroes) ----
async function loadTeams() {
  const res1 = await fetch(`${USER_API}?pickedBy=1`);
  const team1 = await res1.json();
  teamsByPlayer[1] = team1;
  renderTeam(team1, "team1-list");

  const res2 = await fetch(`${USER_API}?pickedBy=2`);
  const team2 = await res2.json();
  teamsByPlayer[2] = team2;
  renderTeam(team2, "team2-list");
}

function renderTeam(team, listId) {
  const list = document.getElementById(listId);
  list.innerHTML = "";

  team.forEach((hero) => {
    const li = document.createElement("li");

    const nameSpan = document.createElement("span");
    nameSpan.textContent = hero.name;

    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.onclick = () => openEditModal(hero);

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Remove";
    deleteBtn.onclick = () => deleteHero(hero);

    li.appendChild(nameSpan);
    li.appendChild(editBtn);
    li.appendChild(deleteBtn);
    list.appendChild(li);
  });
}

// ---- DELETE (only from userHeroes, frees original back to pool) ----
async function deleteHero(hero) {
  await fetch(`${USER_API}/${hero.id}`, { method: "DELETE" });

  await fetch(`${CHAR_API}/${hero.originalId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ picked: false, pickedBy: null }),
  });

  loadPool();
  loadTeams();
}

// ---- EDIT MODAL (PUT, capped at 200 team upgrade points) ----
function openEditModal(hero) {
  if (!hero.baseStats) {
    hero.baseStats = Object.fromEntries(
      STAT_NAMES.map((stat) => [stat, hero[stat]])
    );
  }

  editingHeroId = hero.id;
  editingHeroFull = hero;
  editHeroName.textContent = `Edit ${hero.name}`;

  statInputs.intelligence.value = hero.intelligence;
  statInputs.strength.value = hero.strength;
  statInputs.speed.value = hero.speed;
  statInputs.durability.value = hero.durability;
  statInputs.power.value = hero.power;
  statInputs.combat.value = hero.combat;

  updateEditTotal();
  editError.classList.add("hidden");
  editModal.classList.remove("hidden");
}

function updateEditTotal() {
  const team = teamsByPlayer[editingHeroFull?.pickedBy] || [];
  const total = team.reduce((teamTotal, hero) => {
    return teamTotal + STAT_NAMES.reduce((heroTotal, stat) => {
      const baseValue = Number(hero.baseStats?.[stat] ?? hero[stat] ?? 0);
      const currentValue = hero.id === editingHeroId
        ? Number(statInputs[stat].value || 0)
        : Number(hero[stat] || 0);
      return heroTotal + Math.max(0, currentValue - baseValue);
    }, 0);
  }, 0);

  editTotal.textContent = total;
  return total;
}

Object.values(statInputs).forEach((input) => {
  input.addEventListener("input", updateEditTotal);
});

document.getElementById("edit-cancel-btn").onclick = () => {
  editModal.classList.add("hidden");
};

document.getElementById("edit-save-btn").onclick = async () => {
  const total = updateEditTotal();

  if (total > POINT_LIMIT) {
    editError.classList.remove("hidden");
    return;
  }

  // PUT replaces the whole record in json-server, so we send every field
  // (not just the stats) to avoid wiping out name/publisher/image/pickedBy.
  await fetch(`${USER_API}/${editingHeroId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...editingHeroFull,
      intelligence: Number(statInputs.intelligence.value),
      strength: Number(statInputs.strength.value),
      speed: Number(statInputs.speed.value),
      durability: Number(statInputs.durability.value),
      power: Number(statInputs.power.value),
      combat: Number(statInputs.combat.value),
    }),
  });

  editModal.classList.add("hidden");
  loadTeams();
};

// ---- PAGINATION ----
document.getElementById("prev-page").onclick = () => {
  if (currentPage > 1) {
    currentPage--;
    pageInfo.textContent = `Page ${currentPage}`;
    loadPool();
  }
};

document.getElementById("next-page").onclick = () => {
  currentPage++;
  pageInfo.textContent = `Page ${currentPage}`;
  loadPool();
};

// ---- FILTER / SORT CONTROLS ----
publisherFilter.onchange = () => {
  currentPage = 1;
  loadPool();
};

sortStat.onchange = () => {
  currentPage = 1;
  loadPool();
};

sortOrderBtn.onclick = () => {
  sortOrder = sortOrder === "desc" ? "asc" : "desc";
  sortOrderBtn.textContent = sortOrder === "desc" ? "Desc" : "Asc";
  loadPool();
};

// ---- INITIAL LOAD ----
loadPool();
loadTeams();