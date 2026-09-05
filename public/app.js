const matchesElement = document.querySelector("#matches");
const tabs = [...document.querySelectorAll(".filter-tab")];
const refreshButton = document.querySelector("#refresh");
let selectedStatus = "live";

function formatOvers(innings) {
  return innings ? `${innings.overs}.${innings.balls}` : "-";
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderMatches(matches) {
  if (matches.length === 0) {
    matchesElement.innerHTML = `<div class="empty-state"><strong>No matches in this view.</strong><span>Try another status filter.</span></div>`;
    return;
  }

  matchesElement.replaceChildren(...matches.map((match) => {
    const firstInnings = match.innings[0];
    const team = match.teams.find((item) => item.id === firstInnings?.battingTeamId);
    const opponent = match.teams.find((item) => item.id !== firstInnings?.battingTeamId);

    const card = createElement("article", "match-card");
    const header = createElement("div", "match-card-head");
    const headerInfo = createElement("div", "");
    const freshness = createElement("span", `live-badge freshness-${match.freshness.state}`);
    freshness.append(createElement("span", "status-dot"), document.createTextNode(match.freshness.state));
    headerInfo.append(freshness, createElement("span", "competition", `${match.competition.name} · ${match.format.toUpperCase()}`));
    header.append(headerInfo, createElement("span", "match-id", match.id.slice(-3)));

    const main = createElement("div", "match-main");
    const teams = createElement("div", "teams");
    const activeTeam = createElement("div", "team team-active");
    activeTeam.append(createElement("span", "team-code", team?.shortName ?? "-"), createElement("span", "", team?.name ?? "-"));
    const otherTeam = createElement("div", "team");
    otherTeam.append(createElement("span", "team-code", opponent?.shortName ?? "-"), createElement("span", "", opponent?.name ?? "-"));
    teams.append(activeTeam, otherTeam);

    const score = createElement("div", "score");
    score.append(createElement("strong", "", `${firstInnings?.runs ?? 0}/${firstInnings?.wickets ?? 0}`), createElement("span", "", `${formatOvers(firstInnings)} overs`));
    main.append(teams, score);

    const footer = createElement("div", "match-card-foot");
    footer.append(
      createElement("span", "", match.venue?.name ?? "Venue unavailable"),
      createElement("span", "", `Fetched ${new Date(match.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`)
    );
    card.append(header, main, footer);
    return card;
  }));
}

async function loadMatches() {
  refreshButton.disabled = true;
  refreshButton.classList.add("is-loading");
  matchesElement.innerHTML = `<div class="loading-state">Loading scores<span class="pulse">...</span></div>`;
  try {
    const response = await fetch(`/api/matches?status=${selectedStatus}`);
    if (!response.ok) throw new Error("Unable to load matches");
    const payload = await response.json();
    renderMatches(payload.data);
  } catch (error) {
    matchesElement.innerHTML = `<div class="empty-state error"><strong>Scores unavailable.</strong><span>Check the service and try again.</span></div>`;
  } finally {
    refreshButton.disabled = false;
    refreshButton.classList.remove("is-loading");
  }
}

tabs.forEach((tab) => tab.addEventListener("click", () => {
  selectedStatus = tab.dataset.status;
  tabs.forEach((item) => {
    const active = item === tab;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
  });
  loadMatches();
}));
refreshButton.addEventListener("click", loadMatches);
loadMatches();