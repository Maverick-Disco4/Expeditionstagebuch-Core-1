
let db, activeTrip, map, miniMap, plannedLayer, drivenLayer, liveLayer, liveMarker, watchId=null, wakeLock=null;
const $ = id => document.getElementById(id);
const save = () => localStorage.setItem("expedition-core1", JSON.stringify(db));
const money = v => Number(v||0).toLocaleString("de-DE",{style:"currency",currency:"EUR"});
const todayISO = () => new Date().toISOString().slice(0,10);
const tripDays = t => Math.max(1, Math.round((new Date(t.endDate)-new Date(t.startDate))/86400000)+1);
const currentDay = t => Math.min(tripDays(t), Math.max(1, Math.round((new Date()-new Date(t.startDate))/86400000)+1));
const fmtMs = ms => {const m=Math.floor((ms||0)/60000),h=Math.floor(m/60);return `${h}:${String(m%60).padStart(2,"0")}`};

async function init(){
  const stored = localStorage.getItem("expedition-core1");
  db = stored ? JSON.parse(stored) : await fetch("trips.json").then(r=>r.json());
  activeTrip = db.trips.find(t=>t.id===db.activeTripId) || db.trips[0];
  setupNav(); renderAll(); setupForms(); registerSW();
}
function showView(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===id));
  document.querySelectorAll("nav button[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===id));
  if(id==="mapView") setTimeout(initMap,150);
}
window.showView=showView;
function setupNav(){
  document.querySelectorAll("nav button[data-view]").forEach(b=>b.onclick=()=>showView(b.dataset.view));
  $("quickAddBtn").onclick=()=>showView("journal");
}
function renderAll(){renderDashboard();renderTrips();renderPlanning();renderJournal();renderCash();}
function plannedKm(){return activeTrip.legs.reduce((s,l)=>s+Number(l.plannedKm||0),0)}
function drivenKm(){return activeTrip.tracks.reduce((s,t)=>s+Number(t.km||0),0)}
function expenseSum(){return activeTrip.expenses.reduce((s,e)=>s+Number(e.amount||0),0)}
function photoCount(){return activeTrip.pois.reduce((s,p)=>s+(p.photos?.length||0),0)+activeTrip.journal.reduce((s,j)=>s+(j.photos?.length||0),0)}
function renderDashboard(){
  $("activeTripSub").textContent = activeTrip.name;
  $("dashTripName").textContent=activeTrip.name;$("dashTripMeta").textContent=activeTrip.subtitle||activeTrip.vehicle||"";
  const days=tripDays(activeTrip), cur=currentDay(activeTrip), pct=Math.round(cur/days*100);
  $("tripProgressBar").style.width=pct+"%";$("statDays").textContent=`${cur} / ${days}`;$("statKm").textContent=`${drivenKm().toFixed(0)} km`;$("statTime").textContent=fmtMs(activeTrip.tracks.reduce((s,t)=>s+(t.ms||0),0));
  const leg=activeTrip.legs[0];$("currentLegTitle").textContent=leg?.title||"Keine Etappe";$("currentLegMeta").textContent=leg?`${leg.date} · ${leg.plannedKm} km · ${leg.plannedTime}`:"";
  $("countPois").textContent=activeTrip.pois.length;$("countPhotos").textContent=photoCount();$("sumExpenses").textContent=money(expenseSum());$("countNights").textContent=activeTrip.legs.filter(l=>l.overnight).length;
  renderExpenseSummary();renderLatestPois();renderLatestJournal();setTimeout(initMiniMap,100);
}
function renderExpenseSummary(){
  const cats={};activeTrip.expenses.forEach(e=>cats[e.category]=(cats[e.category]||0)+Number(e.amount||0));
  $("expenseSummary").innerHTML=`<h2>${money(expenseSum())}</h2>`+Object.entries(cats).map(([k,v])=>`<div class="item"><strong>${k}</strong><span style="float:right">${money(v)}</span></div>`).join("");
}
function renderLatestPois(){
  $("latestPois").innerHTML=activeTrip.pois.slice(-3).reverse().map(p=>`<div class="item"><strong>${p.name}</strong><br><span class="stars">${"★".repeat(p.rating||0)}${"☆".repeat(5-(p.rating||0))}</span><span style="float:right">${p.category}</span></div>`).join("")||"<p>Noch keine POIs.</p>";
}
function renderLatestJournal(){
  const j=activeTrip.journal.at(-1);$("latestJournal").innerHTML=j?`<strong>${j.date} · ${j.title}</strong><p>${j.text}</p>`:"<p>Noch kein Eintrag.</p>";
}
function renderTrips(){
  $("tripList").innerHTML=db.trips.map(t=>`<div class="item"><strong>${t.name}</strong><br>${t.subtitle||""}<button class="secondary" onclick="selectTrip('${t.id}')">Öffnen</button></div>`).join("");
}
window.selectTrip=id=>{db.activeTripId=id;activeTrip=db.trips.find(t=>t.id===id);save();renderAll();showView("dashboard")};
function renderPlanning(){
  $("legList").innerHTML=activeTrip.legs.map((l,i)=>`<div class="item"><strong>${i+1}. ${l.title}</strong><br>${l.date} · ${l.plannedKm} km · ${l.plannedTime}<br>${l.overnight||""}<div class="two"><button onclick="editLeg('${l.id}')">Bearbeiten</button><button class="secondary" onclick="moveLeg('${l.id}',-1)">↑</button><button class="secondary" onclick="moveLeg('${l.id}',1)">↓</button></div></div>`).join("");
}
window.editLeg=id=>{const l=activeTrip.legs.find(x=>x.id===id), e=$("legEditor");e.hidden=false;e.className="editor";e.innerHTML=`<h3>Etappe bearbeiten</h3><input id="le-title" value="${l.title}"><div class="two"><input id="le-date" value="${l.date}"><input id="le-km" type="number" value="${l.plannedKm}"></div><div class="two"><input id="le-from" value="${l.from}"><input id="le-to" value="${l.to}"></div><div class="two"><input id="le-time" value="${l.plannedTime}"><input id="le-overnight" value="${l.overnight||""}"></div><div class="two"><input id="le-lat" type="number" step="0.000001" value="${l.lat}"><input id="le-lon" type="number" step="0.000001" value="${l.lon}"></div><textarea id="le-notes">${l.notes||""}</textarea><button onclick="saveLeg('${id}')">Etappe speichern</button>`;e.scrollIntoView({behavior:"smooth"})}
window.saveLeg=id=>{const l=activeTrip.legs.find(x=>x.id===id);Object.assign(l,{title:$("le-title").value,date:$("le-date").value,plannedKm:Number($("le-km").value),from:$("le-from").value,to:$("le-to").value,plannedTime:$("le-time").value,overnight:$("le-overnight").value,lat:Number($("le-lat").value),lon:Number($("le-lon").value),notes:$("le-notes").value});save();renderAll();$("legEditor").hidden=true}
window.moveLeg=(id,d)=>{const a=activeTrip.legs,i=a.findIndex(l=>l.id===id),j=i+d;if(i<0||j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];save();renderPlanning()}
function renderJournal(){
  $("poiList").innerHTML=activeTrip.pois.map(p=>`<div class="item"><strong>${p.name}</strong><br>${p.category} · <span class="stars">${"★".repeat(p.rating||0)}${"☆".repeat(5-(p.rating||0))}</span><p>${p.note||""}</p></div>`).join("")||"<p>Noch keine POIs.</p>";
}
function renderCash(){
  $("expenseList").innerHTML=activeTrip.expenses.slice().reverse().map(e=>`<div class="item"><strong>${e.category}</strong><span style="float:right">${money(e.amount)}</span><br>${e.date} · ${e.note||""}</div>`).join("");
}
function setupForms(){
  $("addLegBtn").onclick=()=>{activeTrip.legs.push({id:"leg-"+Date.now(),date:"",title:"Neue Etappe",from:"",to:"",plannedKm:0,plannedTime:"",lat:0,lon:0,overnight:"",notes:""});save();renderPlanning()};
  $("expenseForm").onsubmit=e=>{e.preventDefault();activeTrip.expenses.push({id:"exp-"+Date.now(),date:todayISO(),category:$("expenseCategory").value,amount:Number($("expenseAmount").value),note:$("expenseNote").value});save();e.target.reset();renderAll()};
  $("newTripBtn").onclick=()=>{const name=prompt("Name der Expedition?");if(!name)return;const t={id:"trip-"+Date.now(),name,subtitle:"Neue Expedition",startDate:todayISO(),endDate:todayISO(),legs:[],pois:[],expenses:[],tracks:[],journal:[]};db.trips.push(t);db.activeTripId=t.id;activeTrip=t;save();renderAll()};
  $("exportAllBtn").onclick=()=>downloadJSON(db,"expeditionstagebuch-core1-backup.json");
  $("exportTripBtn").onclick=()=>downloadJSON(activeTrip,`${activeTrip.id}.json`);
  $("importAllInput").onchange=e=>importJSON(e.target.files[0],data=>{db=data;activeTrip=db.trips.find(t=>t.id===db.activeTripId)||db.trips[0];save();renderAll()});
}
function downloadJSON(data,name){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.download=name;a.click()}
function importJSON(file,cb){if(!file)return;const r=new FileReader();r.onload=()=>cb(JSON.parse(r.result));r.readAsText(file)}
function initMiniMap(){if(miniMap)return;miniMap=L.map("miniMap",{zoomControl:false,attributionControl:false}).setView([46,3],5);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(miniMap);drawRoute(miniMap)}
function initMap(){if(map){map.invalidateSize();return}map=L.map("map").setView([46,3],5);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);drawRoute(map);drawTracks(map)}
function drawRoute(m){const pts=activeTrip.legs.map(l=>[l.lat,l.lon]).filter(p=>p[0]&&p[1]);if(pts.length){L.polyline(pts,{color:"#4e9cff",weight:4}).addTo(m);pts.forEach((p,i)=>L.marker(p).addTo(m).bindPopup(activeTrip.legs[i].title));m.fitBounds(pts,{padding:[20,20]})}}
function drawTracks(m){activeTrip.tracks.forEach(t=>{if(t.points?.length)L.polyline(t.points.map(p=>[p.lat,p.lon]),{color:"#22b83f",weight:5}).addTo(m)})}
async function wake(on){try{if(on&&"wakeLock"in navigator&&!wakeLock)wakeLock=await navigator.wakeLock.request("screen");if(!on&&wakeLock){await wakeLock.release();wakeLock=null}$("wakeStatus").textContent=on?"Display: aktiv":"Display: bereit"}catch(e){$("wakeStatus").textContent="Display: nicht unterstützt"}}
$("startGpsBtn").onclick=()=>{wake(true);if(!navigator.geolocation)return alert("GPS nicht verfügbar");let track={id:"track-"+Date.now(),date:todayISO(),points:[],km:0,ms:0,start:Date.now()};activeTrip._liveTrack=track;watchId=navigator.geolocation.watchPosition(pos=>{const p={lat:pos.coords.latitude,lon:pos.coords.longitude,time:new Date().toISOString()};track.points.push(p);if(liveLayer)map.removeLayer(liveLayer);liveLayer=L.polyline(track.points.map(x=>[x.lat,x.lon]),{color:"#22b83f",weight:5}).addTo(map);if(liveMarker)liveMarker.setLatLng([p.lat,p.lon]);else liveMarker=L.marker([p.lat,p.lon]).addTo(map).bindPopup("🚙 Live");map.setView([p.lat,p.lon],15)},err=>alert(err.message),{enableHighAccuracy:true})}
$("pauseGpsBtn").onclick=()=>{if(watchId)navigator.geolocation.clearWatch(watchId);watchId=null;wake(false)}
$("finishTrackBtn").onclick=()=>{if(watchId)navigator.geolocation.clearWatch(watchId);watchId=null;const t=activeTrip._liveTrack;if(t){t.ms=Date.now()-t.start;t.km=estimateKm(t.points);activeTrip.tracks.push(t);delete activeTrip._liveTrack;save();renderAll();alert("Track gespeichert")}wake(false)}
function estimateKm(pts){let s=0;for(let i=1;i<pts.length;i++)s+=dist(pts[i-1],pts[i]);return s}function dist(a,b){const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lon-a.lon)*Math.PI/180;const x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
async function registerSW(){if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js")}
let deferredPrompt;window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;$("installBtn").hidden=false});$("installBtn").onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();deferredPrompt=null;$("installBtn").hidden=true}}
init();


/* ===== Core 1.1: delete/edit basics and demo cleanup ===== */
function core11SaveAndRender(){
  save();
  renderAll();
}

function isDemoPoi(p){
  return ["poi-1","poi-2"].includes(p.id) || ["Kajaktour Tarn","Stellplatz St. Chély"].includes(p.name);
}
function isDemoExpense(e){
  return ["exp-1","exp-2"].includes(e.id);
}
function isDemoJournal(j){
  return ["j-1"].includes(j.id);
}

function removeDemoData(){
  if(!confirm("Beispieldaten aus der aktiven Expedition entfernen? Eigene Daten bleiben erhalten.")) return;
  activeTrip.pois = (activeTrip.pois || []).filter(p => !isDemoPoi(p));
  activeTrip.expenses = (activeTrip.expenses || []).filter(e => !isDemoExpense(e));
  activeTrip.journal = (activeTrip.journal || []).filter(j => !isDemoJournal(j));
  core11SaveAndRender();
  alert("Beispieldaten entfernt.");
}

window.deletePoi = function(id){
  if(!confirm("POI wirklich löschen?")) return;
  activeTrip.pois = (activeTrip.pois || []).filter(p => p.id !== id);
  core11SaveAndRender();
};

window.deleteExpense = function(id){
  if(!confirm("Ausgabe wirklich löschen?")) return;
  activeTrip.expenses = (activeTrip.expenses || []).filter(e => e.id !== id);
  core11SaveAndRender();
};

window.deleteJournal = function(id){
  if(!confirm("Chronik-Eintrag wirklich löschen?")) return;
  activeTrip.journal = (activeTrip.journal || []).filter(j => j.id !== id);
  core11SaveAndRender();
};

window.deleteTrip = function(id){
  if(db.trips.length <= 1){
    alert("Mindestens eine Expedition muss bestehen bleiben.");
    return;
  }
  if(!confirm("Diese Expedition wirklich löschen?")) return;
  db.trips = db.trips.filter(t => t.id !== id);
  if(db.activeTripId === id){
    db.activeTripId = db.trips[0].id;
    activeTrip = db.trips[0];
  }
  core11SaveAndRender();
};

window.addPoiCore11 = function(){
  const name = prompt("Name des POI?");
  if(!name) return;
  const category = prompt("Kategorie? z. B. Camping, Aussicht, Kajak, Diesel", "Camping") || "Sonstiges";
  const note = prompt("Notiz?", "") || "";
  activeTrip.pois.push({
    id:"poi-"+Date.now(),
    name,
    category,
    rating:0,
    date:todayISO(),
    lat:0,
    lon:0,
    note,
    photos:[]
  });
  core11SaveAndRender();
};

window.addJournalCore11 = function(){
  const title = prompt("Titel des Chronik-Eintrags?");
  if(!title) return;
  const text = prompt("Text / Notiz?", "") || "";
  activeTrip.journal.push({
    id:"j-"+Date.now(),
    date:todayISO(),
    title,
    text,
    photos:[]
  });
  core11SaveAndRender();
};

// Override render functions with delete buttons
renderTrips = function(){
  $("tripList").innerHTML = db.trips.map(t => `
    <div class="item">
      <strong>${t.name}</strong><br>${t.subtitle || ""}
      <div class="item-actions">
        <button class="secondary" onclick="selectTrip('${t.id}')">Öffnen</button>
        <button class="danger" onclick="deleteTrip('${t.id}')">Löschen</button>
      </div>
    </div>
  `).join("");
};

renderJournal = function(){
  $("poiList").innerHTML = (activeTrip.pois || []).map(p => `
    <div class="item">
      <strong>${p.name}</strong><br>
      ${p.category} · <span class="stars">${"★".repeat(p.rating || 0)}${"☆".repeat(5-(p.rating || 0))}</span>
      <p>${p.note || ""}</p>
      <div class="item-actions">
        <button class="danger" onclick="deletePoi('${p.id}')">POI löschen</button>
      </div>
    </div>
  `).join("") || "<p>Noch keine POIs.</p>";

  const jl = document.getElementById("journalList");
  if(jl){
    jl.innerHTML = (activeTrip.journal || []).slice().reverse().map(j => `
      <div class="item">
        <strong>${j.date} · ${j.title}</strong>
        <p>${j.text || ""}</p>
        <div class="item-actions">
          <button class="danger" onclick="deleteJournal('${j.id}')">Eintrag löschen</button>
        </div>
      </div>
    `).join("") || "<p>Noch keine Chronik-Einträge.</p>";
  }
};

renderCash = function(){
  $("expenseList").innerHTML = (activeTrip.expenses || []).slice().reverse().map(e => `
    <div class="item">
      <strong>${e.category}</strong><span style="float:right">${money(e.amount)}</span><br>
      ${e.date} · ${e.note || ""}
      <div class="item-actions">
        <button class="danger" onclick="deleteExpense('${e.id}')">Ausgabe löschen</button>
      </div>
    </div>
  `).join("") || "<p>Noch keine Ausgaben.</p>";
};

const oldSetupFormsCore11 = setupForms;
setupForms = function(){
  oldSetupFormsCore11();

  const clean = document.getElementById("cleanDemoBtn");
  if(clean && !clean.__core11){
    clean.__core11 = true;
    clean.onclick = removeDemoData;
  }

  const addPoi = document.getElementById("addPoiBtn");
  if(addPoi && !addPoi.__core11){
    addPoi.__core11 = true;
    addPoi.onclick = addPoiCore11;
  }

  const addJournal = document.getElementById("addJournalBtn");
  if(addJournal && !addJournal.__core11){
    addJournal.__core11 = true;
    addJournal.onclick = addJournalCore11;
  }
};

// Core 1.1 post-init
setTimeout(() => {
  const clean = document.getElementById("cleanDemoBtn");
  if(clean) clean.onclick = removeDemoData;
  const addPoi = document.getElementById("addPoiBtn");
  if(addPoi) addPoi.onclick = addPoiCore11;
  const addJournal = document.getElementById("addJournalBtn");
  if(addJournal) addJournal.onclick = addJournalCore11;
  renderAll();
}, 800);
