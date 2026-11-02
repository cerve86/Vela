/* ============ STRENGTH — her movement profile and her own exercises ============
   initStrength(el) renders the whole tab into #strength. Called by the shell once per
   signed-in user. The movement profile lives here rather than on Today: it changes every
   few weeks, and it is the reason behind the exercise list under it. */

// The coach scores six areas from the running clip. The coach types the keys into
// companion_movement_profiles.scores, and her library names the same areas on each movement
// ("Trunk & pelvic floor" there, "Trunk / pelvic floor" here), so both are matched by their
// words rather than spelled exactly. Listed in reading order; "hip" is tried last, so
// "Posterior chain (hip extension)" stays with the glutes.
const STR_DOMAINS = [
  [/foot|ankle/i, "Feet and ankles"],
  [/lateral|hip/i, "Side hips"],
  [/rotat|diagonal|twist/i, "Twisting control"],
  [/posterior|glute|hamstring/i, "Glutes and back of the legs"],
  [/trunk|pelvic|core/i, "Core and pelvic floor"],
  [/upper|shoulder|arm/i, "Upper body"]
];
const STR_MATCH = [0, 2, 3, 4, 5, 1];
const strArea = (key) => { const k = String(key || ""); const i = STR_MATCH.find(j => STR_DOMAINS[j][0].test(k)); return i == null ? -1 : i; };
const strPlain = (key) => { const i = strArea(key); return i < 0 ? "" : STR_DOMAINS[i][1]; };

// The filming guide. Clips go to the coach through the Vela app's messages: the companion
// has no upload, so it says where to send them rather than "send it over".
function strFilmGuide(summary) {
  const coach = esc(coachName());
  return `<details class="watch stfilm">
  <summary>${esc(summary)}</summary>
  <div class="filmguide">
    <p><b>Two angles, about 20 seconds each.</b></p>
    <ol>
      <li><b>From the side:</b> phone level with your hips and your whole body in frame. Film one side, then the other.</li>
      <li><b>From behind:</b> straight behind you at hip height, hips down to heels in frame.</li>
    </ol>
    <p><b>Holding the phone:</b> ask someone to hold the phone steady at hip height, or prop it on something that height.</p>
    <p><b>What to wear:</b> fitted shorts or leggings and a fitted top, so hips, knees and ankles show. Hair tied back.</p>
    <p><b>Phone settings:</b> slow motion if it's easy to find. Hold it sideways, wipe the lens, and film in good light, not facing a window.</p>
    <p><b>Mark the spot</b> with a tile or some tape, so a re-film before your race is in the same place. Settle into your pace before filming starts, and don't look at the phone as you pass.</p>
    <p><b>Then send both clips to ${coach}</b> in the Vela app.</p>
    <p><a class="btn-secondary" href="vela://messages">Open messages in the Vela app</a></p>
  </div>
</details>`;
}

function strMarkup() {
  return `
  <h2 class="section-h tab-h" tabindex="-1">Your strength</h2>
  <p class="section-s">What your running clip showed, and the exercises chosen for you from it.</p>
  <section class="card stprof" aria-labelledby="st-prof-h">
    <div class="sthead"><h3 class="section-h3" id="st-prof-h">Your movement profile</h3><span class="stamp" id="st-prof-when"></span></div>
    <div id="stprofile"></div>
  </section>
  <div id="stout"></div>
  <p class="note">The dose is where you start. ${esc(coachName({ start: true }))} sets the load and when to progress. Your strength sessions themselves are in your plan in the Vela app.</p>`;
}

// exercises.json can still supply a photo dropped in by name. The photo stays hidden until it
// has loaded, so a file not there yet never flashes a broken image.
let _strExLib;
async function strExerciseLibrary() {
  if (_strExLib) return _strExLib;
  try { _strExLib = await (await fetch("assets/exercises/exercises.json")).json(); } catch (e) { _strExLib = {}; }
  return _strExLib;
}

// The six scores as labelled bars, a real list so a screen reader hears "Side hips, 2 out of 5".
function strProfile() {
  const box = $("stprofile"), when = $("st-prof-when"); if (!box) return;
  return loadInto(box, {
    key: "movement", load: latestMovement, loading: "Loading your movement profile…",
    render: (m) => {
      if (!m || !m.scores || typeof m.scores !== "object") {
        if (when) when.textContent = "Not assessed yet";
        box.innerHTML = `<p class="hintline">Your first running clip sets your starting point. Film it with the guide below and send it to ${esc(coachName())} in the Vela app.</p>
          ${strFilmGuide("How to film your running clip")}`;
        return;
      }
      if (when) when.textContent = m.assessed_at ? "Assessed " + fmtDay(m.assessed_at) : "";
      const byArea = {};
      Object.keys(m.scores).forEach(k => { const i = strArea(k); if (i >= 0 && byArea[i] == null) byArea[i] = m.scores[k]; });
      const rows = STR_DOMAINS.map(([, label], i) => {
        const raw = byArea[i], v = raw == null || raw === "" || isNaN(raw) ? null : Math.max(0, Math.min(5, Number(raw)));
        const shown = v == null ? "" : +v.toFixed(1);
        return `<li class="mvrow">
          <span class="mvname">${esc(label)}</span>
          <span class="mvbar" aria-hidden="true"><span style="width:${v == null ? 0 : (v / 5) * 100}%"></span></span>
          <span class="mvscore">${v == null ? '<span class="muted">Not scored</span>' : `${shown}<span class="sr-only"> out of 5</span><span aria-hidden="true">/5</span>`}</span>
        </li>`;
      }).join("");
      box.innerHTML = `${m.focus ? `<p class="stfocus"><b>Focus:</b> ${esc(m.focus)}</p>` : ""}
        <ul class="mvlist">${rows}</ul>
        <p class="hintline">Scored 0 to 5 by ${esc(coachName())} from your running clip. Higher is stronger.</p>
        ${strFilmGuide("Filming again before your race? How to film")}`;
    }
  });
}

async function strExercises() {
  const box = $("stout"); if (!box) return;
  const LIB = await strExerciseLibrary();
  // Text first: name, dose, what it's for, the cues. A photo only when one exists, and a
  // demo link only when the coach has added a video; no placeholder boxes.
  const item = (it) => {
    const meta = LIB[it.movement] || {};
    const photo = meta.photo || "";
    const desc = it.why || meta.description || "";
    const cues = (it.cues && it.cues.length) ? it.cues : (meta.cues || []);
    const video = safeUrl(it.video_url);
    const area = strPlain(it.domain);
    return `<li class="stitem">
      ${photo ? `<img class="exphoto" loading="lazy" alt="" src="${esc(photo)}" hidden onload="this.hidden=false" onerror="this.remove()">` : ""}
      <h4 class="stname">${esc(it.movement)}</h4>
      ${it.dose ? `<p class="dose"><span class="sr-only">Dose: </span>${esc(it.dose)}</p>` : ""}
      ${area ? `<p class="works">For your ${esc(area.toLowerCase())}</p>` : ""}
      ${desc ? `<p class="desc">${esc(desc)}</p>` : ""}
      ${cues.length ? `<ul class="cues" aria-label="Cues">${cues.map(c => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
      ${video ? `<a class="btn-secondary stvid" href="${esc(video)}" target="_blank" rel="noopener noreferrer"><span>Watch the demo<span class="sr-only"> of ${esc(it.movement)} (opens in a new tab)</span></span></a>` : ""}
    </li>`;
  };
  const group = (id, title, sub, list) => list.length
    ? `<section class="stgroup" aria-labelledby="${id}"><h3 class="section-h3" id="${id}">${title}</h3><p class="gs">${sub}</p><ul class="stlist">${list.map(item).join("")}</ul></section>`
    : "";
  return loadInto(box, {
    key: "strength", load: myStrength, loading: "Loading your exercises…",
    empty: `Your exercises appear here once ${coachName()} has picked them for you.`,
    render: (items) => {
      const focus = items.filter(i => i.tag === "focus"), race = items.filter(i => i.tag !== "focus");
      box.innerHTML = group("st-focus-h", "Focus", "What your running clip showed. Little and often, all year.", focus)
        + group("st-race-h", "Race-ready", "The strength every runner needs. Build it early and keep it up near the race.", race);
    }
  });
}

async function initStrength(el) {
  el.innerHTML = strMarkup();
  const parts = [strProfile, strExercises];
  const metas = await Promise.all(parts.map(f => f()));
  // Back online after showing the phone's copy or an error: refresh just those parts.
  onReconnect("strength", async () => {
    if (!el.contains($("stout"))) return;
    for (let i = 0; i < parts.length; i++) if (!metas[i] || metas[i].stale) metas[i] = await parts[i]();
  });
}
