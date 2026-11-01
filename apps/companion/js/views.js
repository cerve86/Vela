/* View logic, wired to the per-athlete Supabase data layer.
   Each init* runs after sign-in (called from index.html renderApp). */

/* ============ TODAY — readiness (saves to Supabase) ============ */
async function initToday(){
  const greet = document.getElementById('greet');
  const rows  = document.getElementById('amrows');
  const out   = document.getElementById('amout');
  const rhrI  = document.getElementById('rhr');
  const hrvI  = document.getElementById('hrv');
  const baseinfo = document.getElementById('baseinfo');
  if(!rows||!out) return;

  renderPlanCard(); renderProfileCard();
  const hr = new Date().getHours();
  const hello = hr<12?"Buongiorno":hr<18?"Buon pomeriggio":"Buonasera";
  const flavours=["bella!","principessa!","campionessa!","cara!"];
  greet.textContent = hello+", "+flavours[Math.floor(Date.now()/86400000)%flavours.length];

  const AM=[
    {k:"sleep",name:"Sleep",opts:["Rough","OK","Good"]},
    {k:"legs",name:"Legs",opts:["Heavy","Normal","Fresh"]},
    {k:"energy",name:"Energy",opts:["Low","Meh","Good"]},
    {k:"last_session",name:"Last session felt",opts:["Hard","Moderate","Easy"]}
  ];
  const st={sleep:-1,legs:-1,energy:-1,last_session:-1};
  const existing = await todayReadiness();
  if(existing){ AM.forEach(a=>{ if(existing[a.k]!=null) st[a.k]=existing[a.k]; });
    if(existing.hrv&&hrvI) hrvI.value=existing.hrv;
    if(existing.rhr&&rhrI) rhrI.value=existing.rhr; }

  // --- history: intervals.icu wellness if wired, else the manual logs ---
  let hist = await intervalsWellness(42);
  if(!hist.length){ const v = await recentVitals(42);
    hist = v.map(x=>({date:x.log_date, hrv:x.hrv, restingHR:x.rhr})); }
  const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
  const sd   = a => { const m=mean(a); return Math.sqrt(mean(a.map(v=>(v-m)*(v-m)))); };
  const series = key => hist.map(d=>d[key]).filter(v=>v!=null && !isNaN(v));

  // 'Reading HRV' card method: judge the 7-day rolling average against a personal
  // normal band (mean ± 0.75·SD), not a single morning. The band is CV-derived, so a
  // noisier device just gives a wider band — mixed devices across athletes are fine.
  function readHrvRhr(){
    const h=hrvI?parseFloat(hrvI.value):NaN, r=rhrI?parseFloat(rhrI.value):NaN;
    const H=series('hrv'); if(!isNaN(h)) H.push(h);
    const R=series('restingHR'); if(!isNaN(r)) R.push(r);
    const res={enoughH:H.length>=14, enoughR:R.length>=14};
    if(res.enoughH){ const m=mean(H), s=sd(H);
      res.base=m; res.lo=m-0.75*s; res.hi=m+0.75*s; res.roll7=mean(H.slice(-7));
      res.pos = res.roll7<res.lo?'below' : res.roll7>res.hi?'above' : 'inside'; }
    if(res.enoughR){ const m=mean(R), s=sd(R);
      res.rbase=m; res.rUp = mean(R.slice(-7)) > m + Math.max(0.75*s, 3); } // 3-bpm floor
    return res;
  }
  async function persist(){
    const fields={}; AM.forEach(a=>{ if(st[a.k]>=0) fields[a.k]=st[a.k]; });
    const h=hrvI?parseFloat(hrvI.value):NaN, r=rhrI?parseFloat(rhrI.value):NaN;
    if(!isNaN(h)) fields.hrv=h; if(!isNaN(r)) fields.rhr=r;
    if(Object.keys(fields).length) await saveReadiness(fields);
  }
  function updBaseInfo(v){
    if(!baseinfo) return;
    v = v || readHrvRhr();
    baseinfo.textContent = v.enoughH
      ? "Your HRV baseline ~"+Math.round(v.base)+" ms (normal range "+Math.round(v.lo)+"–"+Math.round(v.hi)+" ms); 7-day average "+Math.round(v.roll7)+" ms"+(v.enoughR?", resting HR ~"+Math.round(v.rbase)+" bpm":"")+". Read against your own trend — not a single morning or another person."
      : "Building your HRV baseline — needs ~2 weeks of readings. Until then the read leans on how you feel, your sleep and resting HR, which carry most of the same signal.";
  }
  function render(){
    const answered = AM.every(a=>st[a.k]>=0);
    if(!answered){ out.className='readout'; out.innerHTML="Tap through the four above for today's read."; updBaseInfo(); return; }
    const feel = AM.reduce((s,a)=>s+st[a.k],0);        // /8, subjective leads
    let band = feel>=6?2 : feel>=3?1 : 0;
    const cause = (st.sleep===0) || (st.last_session===0); // a clear, expected reason for a dip
    const v = readHrvRhr();
    let note="";
    // HRV per the card: trend vs band · RHR together is the strong signal · cause-aware · gate intensity
    if(v.enoughH){
      if(v.pos==='above'){
        if(band===2) note=" Your HRV's above your range too — well recovered, a good morning to put the quality session in.";
      } else if(v.pos==='below'){
        if(cause){
          note=" Your HRV's dipped, but that's expected after "+(st.last_session===0?"a hard session":"a short night")+" — note it, keep today easy and it rebounds. Not a warning.";
        } else if(v.enoughR && v.rUp){
          if(band>0) band=Math.min(band,1);  // gate intensity — not a rest day
          note=" HRV's below your range and resting HR's up, with no obvious cause — gate the intensity: keep easy work easy, soften or move the hard session. Still fine to train aerobically.";
        } else {
          note=" HRV's a touch below your range but resting HR's normal — usually just a transient. Train as you feel; if it's still down in a couple of days we'll look.";
        }
      } else if(v.enoughR && v.rUp){
        note=" Resting HR's a little up — worth an easy start.";
      }
    } else if(v.enoughR && v.rUp && band>0){
      band=Math.min(band,1); note=" Resting HR's up on your usual — ease in today.";
    }
    const reasons=[];
    if(st.sleep===0)reasons.push("sleep was short");
    if(st.legs===0)reasons.push("legs feel heavy");
    if(st.energy===0)reasons.push("energy's low");
    if(st.last_session===0)reasons.push("your last session felt hard");
    const rtxt = reasons.length? reasons.join(", ") : "a couple of small signs";
    let cls,pill,msg;
    if(band===2){ cls='good'; pill='Good to go';
      msg=(st.sleep===0?"Short on sleep, but your legs and energy are showing up":"Body and legs are with you today")+". Enjoy the session as written — start easy and let it build."; }
    else if(band===1){ cls='warn'; pill='Ease in';
      msg="A couple of signs to respect — "+rtxt+". Trim today — a bit shorter, or ease the intensity, then see how it feels — or just tell me you'd rather rest and we'll move it."; }
    else { cls='bad'; pill='Keep it easy';
      msg="Your body's asking for a gentler day — "+rtxt+". Keep it easy and low-impact — an easy walk or spin is perfect — or rest if you'd rather and we'll move it. A smart call, not a setback."; }
    out.className='readout '+cls;
    out.innerHTML='<span class="pill">'+pill+'</span><div>'+msg+note+'</div><div class="suggest">A suggestion — your coach confirms.</div>';
    updBaseInfo(v);
  }
  function buildRows(){
    rows.innerHTML="";
    AM.forEach(it=>{
      const row=document.createElement('div');row.className='frow';
      row.innerHTML='<div class="fh"><b>'+it.name+'</b></div>';
      const seg=document.createElement('div');seg.className='seg';seg.setAttribute('role','group');seg.setAttribute('aria-label',it.name);
      it.opts.forEach((lab,i)=>{
        const b=document.createElement('button');b.type='button';b.textContent=lab;
        b.setAttribute('aria-pressed', st[it.k]===i?'true':'false');
        b.onclick=async()=>{ st[it.k]=i;
          Array.prototype.slice.call(seg.querySelectorAll('button')).forEach(x=>x.setAttribute('aria-pressed','false'));
          b.setAttribute('aria-pressed','true'); render(); await persist(); };
        seg.appendChild(b);
      });
      row.appendChild(seg); rows.appendChild(row);
    });
  }
  if(hrvI)hrvI.addEventListener('input',()=>{render();persist();});
  if(rhrI)rhrI.addEventListener('input',()=>{render();persist();});
  buildRows(); render();
}

/* ============ PROFILE — the athlete's own radar ============ */
function mkRadar(cfg){
  const n=cfg.n, LV=cfg.levels, CX=cfg.cx, CY=cfg.cy, R=cfg.R, start=cfg.start||-90;
  const pt=(i,v)=>{const a=(start+i*(360/n))*Math.PI/180,rad=R*v/LV;return [CX+rad*Math.cos(a),CY+rad*Math.sin(a)];};
  const p=[];
  p.push('<svg class="radar" viewBox="0 0 '+cfg.size[0]+' '+cfg.size[1]+'" role="img" aria-label="'+(cfg.label||'radar')+'">');
  for(let l=1;l<=LV;l++){const r=[];for(let i=0;i<n;i++){const q=pt(i,l);r.push(q[0].toFixed(1)+','+q[1].toFixed(1));}
    p.push('<polygon points="'+r.join(' ')+'" fill="none" stroke="var(--grid)" stroke-width="1"/>');}
  // the scale, up the first spoke: 1–5
  for(let l=1;l<=LV;l++){const q=pt(0,l);p.push('<text x="'+(q[0]+3).toFixed(1)+'" y="'+(q[1]+2.5).toFixed(1)+'" font-size="8" fill="var(--muted)">'+l+'</text>');}
  for(let i=0;i<n;i++){const q=pt(i,LV);p.push('<line x1="'+CX+'" y1="'+CY+'" x2="'+q[0].toFixed(1)+'" y2="'+q[1].toFixed(1)+'" stroke="var(--grid)" stroke-width="1"/>');}
  const poly=cfg.vals.map((v,i)=>{const q=pt(i,Math.max(v,.0001));return q[0].toFixed(1)+','+q[1].toFixed(1);}).join(' ');
  p.push('<polygon points="'+poly+'" fill="'+cfg.fill+'" stroke="'+cfg.stroke+'" stroke-width="2" stroke-linejoin="round"/>');
  cfg.vals.forEach((v,i)=>{const q=pt(i,Math.max(v,.0001));p.push('<circle cx="'+q[0].toFixed(1)+'" cy="'+q[1].toFixed(1)+'" r="2.4" fill="'+cfg.stroke+'"/>');});
  cfg.labels.forEach((lines,i)=>{
    const lp=pt(i,LV);let lx=lp[0],ly=lp[1],anchor='middle',dx=0;
    const a=(start+i*(360/n))*Math.PI/180, c=Math.cos(a), sn=Math.sin(a);
    if(c>0.1){anchor='start';dx=6;} else if(c<-0.1){anchor='end';dx=-6;}
    const half=(cfg.scores?lines.length:lines.length-1)*4.4;
    if(sn<-0.9){ly-=half+8;} if(sn>0.9){ly+=half+10;}
    const all=cfg.scores?lines.concat([cfg.vals[i]+'/'+LV]):lines;
    const cnt=all.length,sy=ly-(cnt-1)*4.4+2;
    const ts=all.map((ln,k)=>'<tspan x="'+(lx+dx).toFixed(1)+'" y="'+(sy+k*8.8).toFixed(1)+'"'+(cfg.scores&&k===cnt-1?' fill="var(--accent)" font-weight="700"':'')+'>'+ln+'</tspan>').join('');
    p.push('<text text-anchor="'+anchor+'" font-size="8.2" font-weight="600" fill="var(--ink)">'+ts+'</text>');
  });
  p.push('</svg>');return p.join('');
}
const MLAB=[["Foot &","ankle"],["Lateral","hip"],["Rotation /","diagonal"],["Posterior","chain"],["Trunk /","pelvic floor"],["Upper","body"]];
const MDOM=["Foot & ankle","Lateral hip","Rotation / diagonal","Posterior chain","Trunk / pelvic floor","Upper body"];
const escH=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmtDay=d=>new Date(d+'T00:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short'});

// Today's profile summary: her goal, the movement radar and its focus line, and how to film.
async function renderProfileCard(){
  const box=document.getElementById('profcard'); if(!box) return;
  const [m, client]=await Promise.all([latestMovement(), myClient()]);
  const film=(document.getElementById('filmGuide')||{}).innerHTML||'';
  const goal=client&&client.goal?`<p class="goal">${escH(client.goal)}</p>`:'';
  if(!m||!m.scores){
    box.innerHTML=`<div class="sumhead"><h3>Your profile</h3><span class="stamp">not assessed yet</span></div>${goal}
      <p class="hintline">Your first clip sets your starting shape — film about 45 seconds of easy running and send it over.</p>${film}`;
    return;
  }
  const vals=MDOM.map(d=> (m.scores[d]!=null?Number(m.scores[d]):0));
  box.innerHTML=`<div class="sumhead"><h3>Your profile</h3><span class="stamp">assessed ${escH(fmtDay(m.assessed_at))}</span></div>${goal}
    <div class="radarwrap">${mkRadar({n:6,levels:5,cx:130,cy:132,R:78,start:-90,vals,scores:true,
      fill:'var(--base-fill)',stroke:'var(--base)',labels:MLAB,size:[260,268],label:'Your movement profile, scored 0 to 5'})}</div>
    ${m.focus?`<p class="focus"><b>Focus:</b> ${escH(m.focus)}</p>`:''}
    ${film.replace('How to film your clip','Re-filming at the taper? How to film')}`;
}

// Today's plan summary: her programme, which week it is, and this week day by day.
async function renderPlanCard(){
  const box=document.getElementById('plancard'); if(!box) return;
  const plan=await myPlan();
  if(!plan||!plan.name&&plan.days.every(d=>!d.sessions.length)){
    box.innerHTML='<div class="sumhead"><h3>Your plan</h3></div><p class="hintline">Your coach is putting your plan together — it shows up here as soon as it starts.</p>';
    return;
  }
  const t=today();
  const DOW=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const rows=plan.days.map((d,i)=>{
    const ss=d.sessions, isToday=d.date===t, past=d.date<t;
    if(!ss.length) return `<li class="rest${isToday?' today':''}"><span class="dow">${DOW[i]}</span><span class="ttl">Rest</span><span></span></li>`;
    const done=ss.every(x=>x.status==='completed'), skipped=ss.some(x=>x.status==='skipped');
    const chip=done?'<span class="st done">Done</span>':isToday?'<span class="st next">Today</span>':skipped?'<span class="st missed">Skipped</span>':past?'<span class="st planned">Not logged</span>':'<span class="st planned">Planned</span>';
    return `<li class="${isToday?'today':''}"><span class="dow">${DOW[i]}</span><span class="ttl">${escH(ss.map(x=>x.title).join(' + '))}</span>${chip}</li>`;
  }).join('');
  const wk=plan.week&&plan.weeks?`Week ${plan.week} of ${plan.weeks}`:'';
  box.innerHTML=`<div class="sumhead"><h3>Your plan</h3>${wk?`<span class="stamp">${wk}</span>`:''}</div>
    ${plan.name?`<p class="goal">${escH(plan.name)}</p>`:''}
    ${plan.body?`<p class="planbody">${escH(plan.body)}</p>`:`<ul class="planweek">${rows}</ul>`}`;
}

/* ============ STRENGTH — the athlete's own items ============ */
async function initStrength(){
  const box=document.getElementById('stout'); if(!box) return;
  let LIB={}; try{ LIB=await (await fetch('assets/exercises/exercises.json')).json(); }catch(e){}
  const items=await myStrength();
  if(!items.length){ box.innerHTML='<p class="hintline">Your strength list lands after your first running analysis.</p>'; return; }
  // Items come from the coach's Vela library (companion_my_strength): name, why, cues,
  // dose and her demo video. exercises.json still supplies a photo dropped in by name.
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const safeUrl=u=>{ u=String(u||'').trim(); return /^https:\/\//i.test(u)?u:''; };
  const card=(it)=>{
    const meta=LIB[it.movement]||{};
    const photo=meta.photo||'';
    const desc=it.why||meta.description||'';
    const cues=(it.cues&&it.cues.length)?it.cues:(meta.cues||[]);
    const video=safeUrl(it.video_url);
    const img=photo?`<img class="exphoto" loading="lazy" alt="" src="${esc(photo)}" onerror="this.closest('.exslot').classList.add('nophoto');this.remove();">`:'';
    return `<div class="stitem">
      <div class="exslot${photo?'':' nophoto'}">${img}<span class="ph">${video?'demo below':'photo / video<br>coming soon'}</span></div>
      <div class="exbody"><b>${esc(it.movement)}</b>
        ${it.dose?`<span class="desc">${esc(it.dose)}</span>`:''}
        ${desc?`<span class="desc">${esc(desc)}</span>`:''}
        ${cues.length?`<ul class="cues">${cues.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>`:''}
        ${video?`<a class="rlink" href="${esc(video)}" target="_blank" rel="noopener noreferrer">Watch the demo</a>`:''}
      </div></div>`;
  };
  const render=(title,sub,list)=> list.length?`<div class="stgroup"><h3>${title}</h3><p class="gs">${sub}</p>${list.map(card).join('')}</div>`:'';
  const focus=items.filter(i=>i.tag==='focus'), race=items.filter(i=>i.tag==='race');
  box.innerHTML = render('Focus','What your running analysis flagged — little and often, year-round.',focus)
    + render('Race-ready','The running strength everyone needs — build early, hold it near the race.',race);
}

/* ============ PROGRESS — adherence + trends (athlete-facing) ============
   Athlete view only: clean trends + ONE interpreted line. The recovery-factor
   association read (sleep/load/cycle -> next-day HRV) is COACH-ONLY and is
   deliberately not part of this client bundle (see BUILD-SPEC + IP strategy). */
async function initProgress(){
  const box=document.getElementById('progressout'); if(!box) return;
  box.innerHTML='<p class="hintline">Loading your progress…</p>';

  // --- pull data (all from intervals.icu except HRV fallback; degrade to empty) ---
  const acts = await intervalsActivities(56);          // completed activities
  const events = await intervalsEvents(56);            // planned, from the intervals.icu calendar
  let wells = await intervalsWellness(56);             // HRV/RHR
  if(!wells.length){ const v=await recentVitals(56);
    wells = v.map(x=>({date:x.log_date, hrv:x.hrv, restingHR:x.rhr})); }

  // --- helpers ---
  const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
  const sd=a=>{const m=mean(a);return Math.sqrt(mean(a.map(v=>(v-m)*(v-m))));};
  const km=m=>(m||0)/1000;
  // intervals.icu activity fields: start_date_local, distance (m), type
  const runs=(acts||[]).filter(a=>{
    const t=(a.type||'').toLowerCase(); return t.includes('run')|| (a.distance && !t);
  }).map(a=>({date:(a.start_date_local||a.start_date||'').slice(0,10), dist:km(a.distance), name:a.name||a.type||'Run'}))
   .filter(a=>a.date);

  // ---- weekly volume (last 8 ISO-ish weeks, Mon-anchored) ----
  const weekKey=d=>{const dt=new Date(d+'T00:00:00');const day=(dt.getDay()+6)%7;dt.setDate(dt.getDate()-day);return ymdLocal(dt);};
  const weeks={};
  runs.forEach(r=>{const k=weekKey(r.date);weeks[k]=(weeks[k]||0)+r.dist;});
  // build last 8 week buckets even if empty
  const wkList=[];{let d=new Date();d.setDate(d.getDate()-(d.getDay()+6)%7);
    for(let i=7;i>=0;i--){const dd=new Date(d);dd.setDate(dd.getDate()-i*7);const k=ymdLocal(dd);wkList.push({k,km:weeks[k]||0});}}
  const hasRuns=runs.length>0;

  // ---- long run progression (max run per week) ----
  const longByWeek={};runs.forEach(r=>{const k=weekKey(r.date);longByWeek[k]=Math.max(longByWeek[k]||0,r.dist);});
  const longList=wkList.map(w=>({k:w.k,km:longByWeek[w.k]||0}));

  // ---- HRV baseline vs range (same method as Today's card) ----
  const hwells=wells.filter(w=>w.hrv!=null&&!isNaN(w.hrv));
  const hseries=hwells.map(w=>Number(w.hrv)), hdates=hwells.map(w=>String(w.date).slice(0,10));
  const rseries=wells.map(w=>w.restingHR).filter(v=>v!=null&&!isNaN(v));
  let hrvPanel='';
  if(hseries.length>=14){
    const m=mean(hseries),s=sd(hseries),lo=m-0.75*s,hi=m+0.75*s,roll7=mean(hseries.slice(-7));
    const pos=roll7<lo?'below':roll7>hi?'above':'inside';
    const rbit=rseries.length>=14?(", resting HR around "+Math.round(mean(rseries))+" bpm"):"";
    let line;
    if(pos==='inside') line="Your recovery trend is sitting right in your normal range—steady, which is exactly what you want through a build.";
    else if(pos==='above') line="Your recovery trend is running a touch above your usual range—a sign the training's being absorbed well.";
    else line="Your 7-day recovery trend has eased below your usual range. Often just a hard week or a short night or two—keep easy days easy and it tends to come back. Your coach is watching it with you.";
    hrvPanel=`<div class="card pcard">
      <h3 class="pgh">Recovery trend (HRV)</h3>
      ${sparkBand(hseries, lo, hi, m, hdates)}
      <p class="pgnote">Baseline ~${Math.round(m)} ms · your normal range ${Math.round(lo)}–${Math.round(hi)} ms · 7-day average ${Math.round(roll7)} ms${rbit}.</p>
      <p class="pgline">${line}</p>
      <details class="watch"><summary>What this is</summary>
        <p class="estnote">This follows your own trend over weeks against a personal band—not a single morning, and never compared to anyone else. A noisier watch just gives a slightly wider band. It’s a guide to how recovery’s tracking, read alongside how you feel.</p>
      </details>
    </div>`;
  } else {
    hrvPanel=`<div class="card pcard"><h3 class="pgh">Recovery trend (HRV)</h3>
      <p class="hintline">Building your recovery baseline — it needs about two weeks of readings. Until then, how you feel and your resting HR carry most of the same signal.</p></div>`;
  }

  // ---- planned vs done (adherence) — planned side from the intervals.icu calendar ----
  // The schedule lives in intervals.icu; we only read it. A planned workout event
  // counts as "done" if a completed activity lands within +/-1 day. This is a feedback
  // read, not a calendar — the app shows no dates, just the adherence summary.
  const today10=ymdLocal(new Date());
  const plannedEv=(events||[]).filter(e=>{
    const cat=(e.category||'').toUpperCase();
    const isPlanned = cat==='WORKOUT' || e.type;            // planned workout events
    const d=(e.start_date_local||e.start_date||'').slice(0,10);
    return isPlanned && d && d<=today10;                    // only sessions due by now
  }).map(e=>({date:(e.start_date_local||e.start_date||'').slice(0,10), paired:!!(e.paired_activity_id||e.athlete_cannot_edit===false&&e.icu_training_load)}));
  let adherence='';
  if(plannedEv.length){
    const doneDates=new Set((acts||[]).map(a=>(a.start_date_local||a.start_date||'').slice(0,10)).filter(Boolean));
    const near=d=>{const b=new Date(d+'T00:00:00');for(let o=-1;o<=1;o++){const x=new Date(b);x.setDate(x.getDate()+o);if(doneDates.has(ymdLocal(x)))return true;}return false;};
    const done=plannedEv.filter(p=>p.paired||near(p.date)).length;
    const pct=Math.round(100*done/plannedEv.length);
    adherence=`<div class="card pcard">
      <h3 class="pgh">Keeping to the plan</h3>
      ${donutPct(pct)}
      <p class="pgnote">${done} of ${plannedEv.length} planned sessions done over the last few weeks.</p>
      <p class="pgline">${pct>=85?"Beautifully consistent — this is the part that moves the needle most.":pct>=60?"Solid consistency — the sessions you’re hitting are doing the work.":"Life happens — what you’ve done still counts, and we shape the plan around what fits."}</p>
    </div>`;
  } else {
    adherence=`<div class="card pcard"><h3 class="pgh">Keeping to the plan</h3>
      <p class="hintline">Once your planned sessions are on your intervals.icu calendar, you’ll see how your week is lining up here — your schedule stays in your calendar, this just reads it.</p></div>`;
  }

  // ---- volume + long-run panels ----
  const volPanel=`<div class="card pcard">
    <h3 class="pgh">Weekly running</h3>
    ${hasRuns?barChart(wkList,'km'):'<p class="hintline">Your weekly distance appears here once runs are flowing in from your watch.</p>'}
    ${hasRuns?`<p class="pgnote">Last 8 weeks · total this week ${wkList[wkList.length-1].km.toFixed(1)} km.</p>`:''}
  </div>`;
  const longPanel=hasRuns?`<div class="card pcard">
    <h3 class="pgh">Long run</h3>
    ${barChart(longList,'km')}
    <p class="pgnote">Your longest run each week — the one that builds half-marathon endurance.</p>
  </div>`:'';

  box.innerHTML = adherence + volPanel + longPanel + hrvPanel;
}

// A "nice" axis maximum and step for ticks: 1, 2, 2.5 or 5 times a power of ten.
function niceAxis(max,ticks=4){
  const raw=Math.max(max,1)/ticks, mag=Math.pow(10,Math.floor(Math.log10(raw)));
  const step=[1,2,2.5,5,10].map(f=>f*mag).find(v=>v>=raw);
  return {step, top:step*Math.ceil(Math.max(max,1)/step)};
}
// bar chart with a km axis (Y) and week-start dates (X). data:[{k:'YYYY-MM-DD', km}]
function barChart(data,key){
  const W=320,H=180,L=34,R=10,T=28,B=36,n=data.length;
  const {step,top}=niceAxis(Math.max(...data.map(d=>d[key])));
  const y=v=>T+(H-T-B)*(1-v/top), gap=(W-L-R)/n, bw=gap*0.62;
  const out=[];
  for(let v=0;v<=top+1e-9;v+=step){
    out.push(`<line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W-R}" y2="${y(v).toFixed(1)}" stroke="var(--grid)" stroke-width="${v?0.6:1}"/>`);
    out.push(`<text class="axt" x="${L-4}" y="${(y(v)+3.5).toFixed(1)}" text-anchor="end">${+v.toFixed(1)}</text>`);
  }
  data.forEach((d,i)=>{
    const h=(H-T-B)*(d[key]/top), x=L+i*gap+(gap-bw)/2;
    out.push(`<rect x="${x.toFixed(1)}" y="${(H-B-h).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h,0.5).toFixed(1)}" rx="3" fill="var(--base)"><title>${fmtDay(d.k)}: ${d[key].toFixed(1)} ${key}</title></rect>`);
    if((n-1-i)%2===0) out.push(`<text class="axt" x="${(x+bw/2).toFixed(1)}" y="${H-B+14}" text-anchor="middle">${fmtDay(d.k)}</text>`);
  });
  out.push(`<text class="axtitle" x="2" y="12">${key}</text>`);
  out.push(`<text class="axtitle" x="${(L+(W-R))/2}" y="${H-3}" text-anchor="middle">week starting</text>`);
  return `<svg class="pgchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly ${key}, last ${n} weeks">${out.join('')}</svg>`;
}
// HRV line with the normal band shaded: ms axis (Y), dates (X). series newest-last.
function sparkBand(series,lo,hi,base,dates){
  const W=320,H=180,L=34,R=10,T=28,B=36,n=series.length;
  const minV=Math.min(...series,lo), maxV=Math.max(...series,hi);
  const {step}=niceAxis(maxV-minV,4);
  const y0=Math.floor(minV/step)*step, y1=Math.ceil(maxV/step)*step, span=(y1-y0)||1;
  // x follows the calendar when dates are given, so a gap in readings shows as a gap
  const dated=dates&&dates.length===n, ms=d=>new Date(d+'T00:00:00').getTime();
  const t0=dated?ms(dates[0]):0, tN=dated?ms(dates[n-1]):1;
  const x=i=>L+(W-L-R)*(dated?(ms(dates[i])-t0)/((tN-t0)||1):i/(Math.max(1,n-1)));
  const y=v=>T+(H-T-B)*(1-(v-y0)/span);
  const out=[];
  for(let v=y0;v<=y1+1e-9;v+=step){
    out.push(`<line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W-R}" y2="${y(v).toFixed(1)}" stroke="var(--grid)" stroke-width="0.6"/>`);
    out.push(`<text class="axt" x="${L-4}" y="${(y(v)+3.5).toFixed(1)}" text-anchor="end">${+v.toFixed(2)}</text>`);
  }
  out.push(`<rect x="${L}" y="${y(hi).toFixed(1)}" width="${W-L-R}" height="${(y(lo)-y(hi)).toFixed(1)}" fill="var(--base-fill)"/>`);
  out.push(`<line x1="${L}" y1="${y(base).toFixed(1)}" x2="${W-R}" y2="${y(base).toFixed(1)}" stroke="var(--muted)" stroke-dasharray="3 3" stroke-width="0.8"/>`);
  out.push(`<polyline points="${series.map((v,i)=>x(i).toFixed(1)+','+y(v).toFixed(1)).join(' ')}" fill="none" stroke="var(--base)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
  out.push(`<circle cx="${x(n-1).toFixed(1)}" cy="${y(series[n-1]).toFixed(1)}" r="3.2" fill="var(--base)"/>`);
  if(dated){
    // first, middle and last day of the window, placed on the same time scale
    const mid=new Date((t0+tN)/2), midD=ymdLocal(mid), xm=L+(W-L-R)*((ms(midD)-t0)/((tN-t0)||1));
    out.push(`<text class="axt" x="${x(0).toFixed(1)}" y="${H-B+14}" text-anchor="start">${fmtDay(dates[0])}</text>`);
    out.push(`<text class="axt" x="${xm.toFixed(1)}" y="${H-B+14}" text-anchor="middle">${fmtDay(midD)}</text>`);
    out.push(`<text class="axt" x="${x(n-1).toFixed(1)}" y="${H-B+14}" text-anchor="end">${fmtDay(dates[n-1])}</text>`);
  }
  out.push(`<text class="axtitle" x="2" y="12">ms</text>`);
  out.push(`<text class="axtitle" x="${(L+(W-R))/2}" y="${H-3}" text-anchor="middle">shaded band = your normal range</text>`);
  return `<svg class="pgchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="HRV over the last ${n} days against your normal range">${out.join('')}</svg>`;
}
// simple percentage donut
function donutPct(pct){
  const R=34,C=2*Math.PI*R,off=C*(1-pct/100);
  return `<svg class="pgdonut" viewBox="0 0 90 90" role="img" aria-label="${pct} percent of planned sessions done">`+
    `<circle cx="45" cy="45" r="${R}" fill="none" stroke="var(--ring)" stroke-width="9"/>`+
    `<circle cx="45" cy="45" r="${R}" fill="none" stroke="var(--fuel)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 45 45)"/>`+
    `<text x="45" y="50" font-size="18" text-anchor="middle" font-weight="700" fill="var(--ink)">${pct}%</text></svg>`;
}

/* ============ ROUTES — curated run routes (shared library) ============ */
async function initRoutes(){
  const box=document.getElementById('routesout'); if(!box) return;
  const routes=await myRoutes();
  if(!routes.length){
    box.innerHTML='<p class="hintline">No routes yet — your coach adds them here. They’ll show up with distance, surface and a tap to open the map.</p>';
    return;
  }
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const safeUrl=u=>{ u=String(u||'').trim(); return /^https?:\/\//i.test(u)?u:''; };
  const card=r=>{
    const dist=(r.distance_km!=null)?(Number(r.distance_km)+' km'):'';
    const bits=[dist, r.terrain?esc(r.terrain):''].filter(Boolean).join(' · ');
    const maps=safeUrl(r.map_url), strava=safeUrl(r.strava_url);
    const links=[
      maps?`<a class="rlink" href="${esc(maps)}" target="_blank" rel="noopener noreferrer">Open in Maps</a>`:'',
      strava?`<a class="rlink" href="${esc(strava)}" target="_blank" rel="noopener noreferrer">Open in Strava</a>`:''
    ].filter(Boolean).join('');
    return `<div class="routecard">
      <div class="rhead"><b>${esc(r.name)}</b>${bits?`<span class="rmeta">${bits}</span>`:''}</div>
      ${r.start_point?`<div class="rstart"><span class="rk">Start</span> ${esc(r.start_point)}</div>`:''}
      ${r.description?`<p class="rdesc">${esc(r.description)}</p>`:''}
      ${links?`<div class="rlinks">${links}</div>`:''}
    </div>`;
  };
  box.innerHTML=routes.map(card).join('');
}

/* ============ LEARN — client-only evidence shelf (grid) ============ */
async function initLearn(){
  const box=document.getElementById('learnout'); if(!box) return;
  const tiles=await myResources();
  if(!tiles.length){
    box.innerHTML='<p class="hintline">Your learning shelf is being put together — a few tiles land here soon.</p>';
    return;
  }
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const safeUrl=u=>{ u=String(u||'').trim(); return /^https?:\/\//i.test(u)?u:''; };
  const tile=t=>{
    const link=safeUrl(t.link_url);
    const img=safeUrl(t.image_url);
    const inner=`
      <div class="ltimg${img?'':' noimg'}">${img?`<img loading="lazy" alt="" src="${esc(img)}" onerror="this.closest('.ltimg').classList.add('noimg');this.remove();">`:''}<span class="ph">✨</span></div>
      <div class="ltbody"><b>${esc(t.title)}</b>${t.blurb?`<span class="ltblurb">${esc(t.blurb)}</span>`:''}</div>`;
    return link
      ? `<a class="ltile" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
      : `<div class="ltile">${inner}</div>`;
  };
  box.innerHTML='<div class="lgrid">'+tiles.map(tile).join('')+'</div>';
}

/* ============ FUEL — day-aware bottle + Ten Haaf estimate (daily, on-device) ============ */
function initFuel(){
  /* ---- bottle ---- */
  const ITEMS=[
    {k:"before",name:"Fuelled before",hint:"Carbs in before a key or long run"},
    {k:"during",name:"Carbs on the go",hint:"Gel, chews or drink on long / hard sessions"},
    {k:"after",name:"Recovered after",hint:"Carbs + protein within about an hour"},
    {k:"protein",name:"Protein at meals",hint:"A protein source at each main meal"},
    {k:"enough",name:"Ate enough",hint:"A full day's food — didn't skimp"}
  ];
  const DAYS=[
    {k:"easy",label:"Easy",active:["after","protein","enough"],target:0.6,
      note:"An easy session needs less fuel during it — water's fine, a little electrolyte helps in the heat. Keep carbs and protein coming through the day. Going lighter during is right; skimping on food isn't."},
    {k:"demanding",label:"Demanding",active:["before","during","after","protein","enough"],target:0.8,
      note:"Big session — fuel it fully: carbs before, something on the run, a proper recovery after."},
    {k:"recovery",label:"Recovery",active:["protein","enough"],target:0.6,
      note:"No run to fuel, but don't under-eat — protein and a full day's food are how you adapt."},
    {k:"unwell",label:"Unwell",active:["protein","enough"],target:0.55,
      note:"No performance pressure today. Eat what you can, keep fluids up, rest."}
  ];
  const PHASES=[
    {k:"foll",label:"Follicular",bump:0,note:"Follicular phase — you often handle carbs and harder efforts well; a good window to back a big day."},
    {k:"lut",label:"Luteal",bump:0.05,note:"Luteal phase — you run warmer and burn through carbs faster, and effort can feel harder. Be a little more generous with fuel and fluids."},
    {k:"skip",label:"Not tracking",bump:0,note:""}
  ];
  let state={day:"",phase:"",before:0,during:0,after:0,protein:0,enough:0,date:""};
  const KEY="rb-fuel-v2", t=today();
  try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&s.date===t)state=Object.assign(state,s);}catch(e){}
  const persist=()=>{state.date=t;try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){}};
  const dayEl=document.getElementById('daysel'), phEl=document.getElementById('phasesel'),
        frows=document.getElementById('frows'), fsvg=document.getElementById('fuelsvg'),
        fb=document.getElementById('feedback'), cap=document.getElementById('fuelcap');
  if(!dayEl) return;
  const LABELS=["Missed","Some","Nailed"];
  const curDay=()=>DAYS.filter(d=>d.k===state.day)[0]||null;
  const curPhase=()=>PHASES.filter(p=>p.k===state.phase)[0]||null;
  const targetPct=()=>{const d=curDay();if(!d)return .7;const p=curPhase();return Math.min(.95,d.target+(p?p.bump:0));};
  const someTouched=()=>{const d=curDay();if(!d)return false;return d.active.some(k=>state[k]>0);};
  function drawBottle(pct,tgt,dim){
    pct=Math.max(0,Math.min(1,pct));
    const bx=34,bw=52,by=46,bh=128,r=14,fillH=bh*pct,fillY=by+bh-fillH,ty=by+bh-bh*tgt;
    const fillCol=dim?'var(--grid)':'var(--fuel)';const s=[];
    s.push('<svg viewBox="0 0 120 200" width="120" height="200" role="img" aria-label="Fuel bottle '+Math.round(pct*100)+' percent full">');
    s.push('<rect x="'+(bx+bw/2-9)+'" y="26" width="18" height="12" rx="3" fill="var(--grid)"/>');
    s.push('<rect x="'+(bx+bw/2-13)+'" y="35" width="26" height="8" rx="3" fill="'+(dim?'var(--grid)':'var(--fuel)')+'"/>');
    s.push('<defs><clipPath id="bott"><rect x="'+bx+'" y="'+by+'" width="'+bw+'" height="'+bh+'" rx="'+r+'"/></clipPath></defs>');
    s.push('<rect x="'+bx+'" y="'+by+'" width="'+bw+'" height="'+bh+'" rx="'+r+'" fill="var(--fuel-soft)"/>');
    s.push('<rect x="'+bx+'" y="'+fillY.toFixed(1)+'" width="'+bw+'" height="'+fillH.toFixed(1)+'" fill="'+fillCol+'" clip-path="url(#bott)"/>');
    if(tgt>0&&tgt<1){
      s.push('<line x1="'+(bx-4)+'" y1="'+ty.toFixed(1)+'" x2="'+(bx+bw+4)+'" y2="'+ty.toFixed(1)+'" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 3"/>');
      s.push('<text x="'+(bx+bw+7)+'" y="'+(ty+3).toFixed(1)+'" font-size="8" fill="var(--muted)">enough</text>');
    }
    s.push('<rect x="'+bx+'" y="'+by+'" width="'+bw+'" height="'+bh+'" rx="'+r+'" fill="none" stroke="var(--ink)" stroke-width="1.5" opacity="0.22"/></svg>');
    return s.join('');
  }
  function renderChips(){
    Array.prototype.slice.call(dayEl.querySelectorAll('.chip')).forEach(b=>b.remove());
    DAYS.forEach(d=>{const b=document.createElement('button');b.type='button';b.className='chip';b.textContent=d.label;
      b.setAttribute('aria-pressed',state.day===d.k?'true':'false');
      b.onclick=()=>{state.day=d.k;persist();renderAll();};dayEl.appendChild(b);});
    Array.prototype.slice.call(phEl.querySelectorAll('.chip')).forEach(b=>b.remove());
    PHASES.forEach(p=>{const b=document.createElement('button');b.type='button';b.className='chip ph';b.textContent=p.label;
      b.setAttribute('aria-pressed',state.phase===p.k?'true':'false');
      b.onclick=()=>{state.phase=p.k;persist();renderAll();};phEl.appendChild(b);});
  }
  function renderRows(){
    frows.innerHTML="";const d=curDay();
    if(!d){const h=document.createElement('div');h.className='hintline';h.textContent="Pick today's type above to begin — it decides what to fuel for.";frows.appendChild(h);return;}
    ITEMS.forEach(it=>{
      const on=d.active.indexOf(it.k)>=0;
      const row=document.createElement('div');row.className='frow'+(on?'':' off');
      row.innerHTML='<div class="fh"><b>'+it.name+'</b><span>'+it.hint+'</span></div>';
      if(on){
        const seg=document.createElement('div');seg.className='seg';seg.setAttribute('role','group');seg.setAttribute('aria-label',it.name);
        for(let i=0;i<3;i++){const b=document.createElement('button');b.type='button';b.textContent=LABELS[i];
          b.setAttribute('aria-pressed', state[it.k]===i&&(i>0||someTouched())?'true':'false');
          (function(b,i){b.onclick=()=>{state[it.k]=i;
            Array.prototype.slice.call(seg.querySelectorAll('button')).forEach(x=>x.setAttribute('aria-pressed',x===b?'true':'false'));
            persist();drawFuel();};})(b,i);
          seg.appendChild(b);}
        row.appendChild(seg);
      } else { const na=document.createElement('div');na.className='na';
        na.textContent=it.k==="during"?"Not needed today — water's fine":"Not needed today";row.appendChild(na);}
      frows.appendChild(row);
    });
  }
  function drawFuel(){
    const d=curDay();
    if(!d){fsvg.innerHTML=drawBottle(0,0,true);cap.textContent="Pick today first";
      fb.innerHTML="Choose today's type and the bottle fills to <b>enough for that day</b> — big days need plenty, lighter days need less.";return;}
    let sum=0;d.active.forEach(k=>sum+=state[k]);
    const fill=sum/(2*d.active.length),tgt=targetPct();
    fsvg.innerHTML=drawBottle(fill,tgt,false);
    cap.textContent = !someTouched()?"Tap how today went" : fill>=tgt?"Fuelled for today" : fill>=tgt*0.55?"Getting there":"Room to top up";
    let msg="";
    if(!someTouched()){fb.innerHTML="Tap how each part of today went — this is a check-in, not a test.";return;}
    if(state.enough===2) msg+="<b>You ate enough today</b> — the one that matters most. ";
    else if(state.enough===1) msg+="Top up a little more through the day — fuelling the work beats cutting back. ";
    else msg+="Today's big one: <b>eat a bit more.</b> Under-fuelling is what holds running back — aim up, never down. ";
    msg+=d.note+" ";const p=curPhase();if(p&&p.note)msg+="<br><span style='color:var(--muted)'>"+p.note+"</span>";
    fb.innerHTML=msg;
  }
  function renderAll(){renderChips();renderRows();drawFuel();}
  const reset=document.getElementById('freset');
  if(reset)reset.addEventListener('click',()=>{state={day:"",phase:"",before:0,during:0,after:0,protein:0,enough:0,date:t};persist();renderAll();});
  renderAll();

  /* ---- Ten Haaf estimate ---- */
  initEstimate();
}
async function initEstimate(){
  const out=document.getElementById('estout');
  const w=document.getElementById('wkg'),h=document.getElementById('hcm'),a=document.getElementById('age'),
        dkm=document.getElementById('dkm'),dmin=document.getElementById('dmin'),
        sportEl=document.getElementById('sportsel'),effEl=document.getElementById('effortsel'),
        runBox=document.getElementById('runinput'),metBox=document.getElementById('metinput');
  if(!out||!sportEl) return;
  const prof=await myProfile(); if(prof&&prof.weight_kg&&w&&!w.value) w.value=prof.weight_kg;
  const SPORTS=[{k:'run',label:'Run'},{k:'bike',label:'Bike'},{k:'swim',label:'Swim'},{k:'row',label:'Row'},{k:'other',label:'Other'}];
  const EFFORTS=[{k:'easy',label:'Easy'},{k:'moderate',label:'Moderate'},{k:'hard',label:'Hard'}];
  const MET={bike:{easy:5,moderate:7.5,hard:10},swim:{easy:6,moderate:8,hard:10},row:{easy:6,moderate:8.5,hard:11},other:{easy:5,moderate:7,hard:9}};
  const sel={sport:'',eff:''},K='rb-est-v3';
  try{const s=JSON.parse(localStorage.getItem(K));if(s){if(s.h&&h)h.value=s.h;if(s.a&&a)a.value=s.a;if(s.sport)sel.sport=s.sport;if(s.eff)sel.eff=s.eff;}}catch(e){}
  const r50=x=>Math.round(x/50)*50;
  const save=()=>{try{localStorage.setItem(K,JSON.stringify({h:h.value,a:a.value,sport:sel.sport,eff:sel.eff}));}catch(e){}};
  function chips(host,list,key){
    if(!host)return;Array.prototype.slice.call(host.querySelectorAll('.chip')).forEach(b=>b.remove());
    list.forEach(o=>{const b=document.createElement('button');b.type='button';b.className='chip';b.textContent=o.label;
      b.setAttribute('aria-pressed',sel[key]===o.k?'true':'false');
      b.onclick=()=>{sel[key]=o.k;if(key==='sport')toggle();chips(host,list,key);upd();};host.appendChild(b);});
  }
  function toggle(){const isRun=sel.sport==='run';if(runBox)runBox.hidden=!isRun;if(metBox)metBox.hidden=!(sel.sport&&!isRun);}
  function upd(){
    const W=parseFloat(w.value),H=parseFloat(h.value),A=parseFloat(a.value);
    if(!(W>=30&&W<=150&&H>=130&&H<=200&&A>=16&&A<=70)){out.innerHTML="Add your weight, height and age for an estimate.";save();return;}
    const rmr=11.936*W+587.728*(H/100)-8.129*A+29.279, base=rmr*1.4;
    let ex=0,extxt=" (no session logged today)";
    if(sel.sport==='run'){const D=parseFloat(dkm&&dkm.value)||0;if(D>0){ex=D*W*1.0;extxt=", with ~"+r50(ex).toLocaleString()+" kcal for "+D+" km of running";}}
    else if(sel.sport&&sel.eff){const M=parseFloat(dmin&&dmin.value)||0;if(M>0){ex=(MET[sel.sport][sel.eff]-1)*W*(M/60);
      const sp=SPORTS.filter(x=>x.k===sel.sport)[0];extxt=", with ~"+r50(ex).toLocaleString()+" kcal for "+M+" min of "+sp.label.toLowerCase()+" ("+sel.eff+")";}}
    const total=base+ex,lo=r50(total*0.93),hi=r50(total*1.07);
    out.innerHTML="Today ≈ <b>"+lo.toLocaleString()+"–"+hi.toLocaleString()+" kcal</b>"+extxt+".";save();
  }
  chips(sportEl,SPORTS,'sport');chips(effEl,EFFORTS,'eff');toggle();
  [w,h,a,dkm,dmin].forEach(el=>{if(el)el.addEventListener('input',upd);});upd();
}
