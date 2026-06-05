
let db, activeTrip, map, miniMap;
let plannedLayer = null, drivenLayer = null, liveLayer = null, liveMarker = null;
let watchId = null, wakeLock = null;
const ROUTE_CACHE_PREFIX = "expedition-core1-2-route:";
const $ = id => document.getElementById(id);
const save = () => localStorage.setItem("expedition-core1", JSON.stringify(db));
const money = v => Number(v||0).toLocaleString("de-DE",{style:"currency",currency:"EUR"});
const todayISO = () => new Date().toISOString().slice(0,10);
const tripDays = t => Math.max(1, Math.round((new Date(t.endDate)-new Date(t.startDate))/86400000)+1);
const currentDay = t => Math.min(tripDays(t), Math.max(1, Math.round((new Date()-new Date(t.startDate))/86400000)+1));
const fmtMs = ms => {const m=Math.floor((ms||0)/60000),h=Math.floor(m/60);return `${h}:${String(m%60).padStart(2,"0")}`};
const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function init(){
  const stored = localStorage.getItem("expedition-core1");
  db = stored ? JSON.parse(stored) : await fetch("trips.json").then(r=>r.json());
  db.trips ||= [];
  activeTrip = db.trips.find(t=>t.id===db.activeTripId) || db.trips[0];
  normalizeTrip(activeTrip);
  setupNav();
  setupForms();
  renderAll();
  registerSW();
}
function normalizeTrip(t){
  t.legs ||= []; t.pois ||= []; t.expenses ||= []; t.tracks ||= []; t.journal ||= [];
  t.routeMode ||= "osrm"; t.orsApiKey ||= "";
  normalizeLegModel(t);
}
function normalizeLegModel(t){
  t.legs.forEach((l, idx) => {
    if(l.fromLat === undefined || l.fromLon === undefined){
      if(idx === 0){ l.fromLat = 53.183; l.fromLon = 8.000; }
      else {
        const prev = t.legs[idx-1];
        l.fromLat = Number(prev.toLat ?? prev.lat ?? 0);
        l.fromLon = Number(prev.toLon ?? prev.lon ?? 0);
      }
    }
    if(l.toLat === undefined || l.toLon === undefined){
      l.toLat = Number(l.lat || 0);
      l.toLon = Number(l.lon || 0);
    }
    l.fromLat = Number(l.fromLat || 0); l.fromLon = Number(l.fromLon || 0);
    l.toLat = Number(l.toLat || 0); l.toLon = Number(l.toLon || 0);
    l.lat = l.toLat; l.lon = l.toLon;
  });
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
function drivenKm(){return activeTrip.tracks.reduce((s,t)=>s+Number(t.km||0),0)}
function expenseSum(){return activeTrip.expenses.reduce((s,e)=>s+Number(e.amount||0),0)}
function photoCount(){return activeTrip.pois.reduce((s,p)=>s+(p.photos?.length||0),0)+activeTrip.journal.reduce((s,j)=>s+(j.photos?.length||0),0)}
function currentLeg(){return activeTrip.legs[0] || null}
function renderDashboard(){
  $("activeTripSub").textContent = activeTrip.name;
  $("dashTripName").textContent=activeTrip.name;
  $("dashTripMeta").textContent=activeTrip.subtitle||activeTrip.vehicle||"";
  const days=tripDays(activeTrip), cur=currentDay(activeTrip), pct=Math.round(cur/days*100);
  $("tripProgressBar").style.width=pct+"%";
  $("statDays").textContent=`${cur} / ${days}`;
  $("statKm").textContent=`${drivenKm().toFixed(0)} km`;
  $("statTime").textContent=fmtMs(activeTrip.tracks.reduce((s,t)=>s+(t.ms||0),0));
  const leg=currentLeg();
  $("currentLegTitle").textContent=leg?.title||"Keine Etappe";
  $("currentLegMeta").textContent=leg?`${leg.date} · ${leg.plannedKm} km · ${leg.plannedTime}`:"";
  $("countPois").textContent=activeTrip.pois.length;
  $("countPhotos").textContent=photoCount();
  $("sumExpenses").textContent=money(expenseSum());
  $("countNights").textContent=activeTrip.legs.filter(l=>l.overnight).length;
  renderExpenseSummary(); renderLatestPois(); renderLatestJournal();
  setTimeout(initMiniMap,100);
}
function renderExpenseSummary(){
  const cats={};
  activeTrip.expenses.forEach(e=>cats[e.category]=(cats[e.category]||0)+Number(e.amount||0));
  $("expenseSummary").innerHTML=`<h2>${money(expenseSum())}</h2>`+(Object.entries(cats).map(([k,v])=>`<div class="item"><strong>${escapeHtml(k)}</strong><span style="float:right">${money(v)}</span></div>`).join("") || "<p>Keine Ausgaben.</p>");
}
function renderLatestPois(){
  $("latestPois").innerHTML=activeTrip.pois.slice(-3).reverse().map(p=>`<div class="item"><strong>${escapeHtml(p.name)}</strong><br><span class="stars">${"★".repeat(p.rating||0)}${"☆".repeat(5-(p.rating||0))}</span><span style="float:right">${escapeHtml(p.category)}</span></div>`).join("")||"<p>Noch keine POIs.</p>";
}
function renderLatestJournal(){
  const j=activeTrip.journal.at(-1);
  $("latestJournal").innerHTML=j?`<strong>${escapeHtml(j.date)} · ${escapeHtml(j.title)}</strong><p>${escapeHtml(j.text)}</p>`:"<p>Noch kein Eintrag.</p>";
}
function renderTrips(){
  $("tripList").innerHTML=db.trips.map(t=>`<div class="item"><strong>${escapeHtml(t.name)}</strong><br>${escapeHtml(t.subtitle||"")}<div class="item-actions"><button class="secondary" onclick="selectTrip('${t.id}')">Öffnen</button><button class="danger" onclick="deleteTrip('${t.id}')">Löschen</button></div></div>`).join("");
}
window.selectTrip=id=>{db.activeTripId=id;activeTrip=db.trips.find(t=>t.id===id);normalizeTrip(activeTrip);save();resetMaps();renderAll();showView("dashboard")};
window.deleteTrip=id=>{if(db.trips.length<=1)return alert("Mindestens eine Expedition muss bestehen bleiben.");if(!confirm("Expedition löschen?"))return;db.trips=db.trips.filter(t=>t.id!==id);db.activeTripId=db.trips[0].id;activeTrip=db.trips[0];save();resetMaps();renderAll();};


function renderPlanning(){
  $("legList").innerHTML=activeTrip.legs.map((l,i)=>`
    <div class="leg-card" draggable="true" data-leg-id="${l.id}">
      <div class="leg-card-head">
        <div>
          <strong>${i+1}. ${escapeHtml(l.title)}</strong><br>
          ${escapeHtml(l.date)} · ${escapeHtml(l.from)} → ${escapeHtml(l.to)}<br>
          ${escapeHtml(l.overnight||"")}
        </div>
        <button class="secondary" onclick="editLeg('${l.id}')">Bearbeiten</button>
      </div>
      <div class="leg-route-meta">
        <div><strong id="legKm-${l.id}">${Number(l.routeKm || l.plannedKm || 0).toFixed(0)} km</strong><small>${l.routeKm ? "echte Route" : "Planwert"}</small></div>
        <div><strong id="legTime-${l.id}">${l.routeTime || escapeHtml(l.plannedTime||"–")}</strong><small>${l.routeTime ? "Routingzeit" : "Planzeit"}</small></div>
      </div>
      <div class="leg-mini-map" id="legMap-${l.id}"></div>
      <div class="leg-actions">
        <button onclick="buildLegRoute('${l.id}', true)">Route laden</button>
        <button class="secondary" onclick="openLegInMap('${l.id}')">Große Karte</button>
        <button class="secondary" onclick="moveLeg('${l.id}',-1)">↑</button>
        <button class="secondary" onclick="moveLeg('${l.id}',1)">↓</button>
        <button class="secondary" onclick="duplicateLeg('${l.id}')">Duplizieren</button>
        <button class="danger" onclick="deleteLeg('${l.id}')">Löschen</button>
      </div>
    </div>`).join("") || "<p>Noch keine Etappen.</p>";
  setupLegDragDrop();
  setTimeout(initLegMiniMaps, 150);
}

const legMiniMaps = {};
function legRouteCacheKey(id){
  const leg = activeTrip.legs.find(l=>l.id===id);
  if(!leg) return null;
  return `expedition-core1-5-legroute:${activeTrip.id}:${activeTrip.routeMode||"osrm"}:${id}:${Number(leg.fromLat).toFixed(5)},${Number(leg.fromLon).toFixed(5)}:${Number(leg.toLat).toFixed(5)},${Number(leg.toLon).toFixed(5)}`;
}
function legPair(id){
  const i=activeTrip.legs.findIndex(l=>l.id===id);
  if(i<0) return null;
  const l=activeTrip.legs[i];
  return {i,a:{lat:Number(l.fromLat),lon:Number(l.fromLon),title:l.from||"Start"},b:{lat:Number(l.toLat),lon:Number(l.toLon),title:l.to||"Ziel"},leg:l};
}
function nextLegPair(id){ return legPair(id); }
function initLegMiniMaps(){
  activeTrip.legs.forEach(leg=>{
    const el=document.getElementById(`legMap-${leg.id}`);
    if(!el || legMiniMaps[leg.id]) return;
    const startLat=Number(leg.fromLat||leg.toLat||46), startLon=Number(leg.fromLon||leg.toLon||3);
    const m=L.map(el,{zoomControl:false,attributionControl:false}).setView([startLat,startLon],8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(m);
    legMiniMaps[leg.id]=m;
    drawLegMiniRoute(leg.id);
    setTimeout(()=>m.invalidateSize(),200);
  });
}
function clearMiniMap(m){
  m.eachLayer(layer=>{if(layer instanceof L.Marker || layer instanceof L.Polyline)m.removeLayer(layer);});
}
function drawLegMiniRoute(id){
  const pair=legPair(id), m=legMiniMaps[id];
  if(!pair||!m) return;
  clearMiniMap(m);
  const {a,b}=pair;
  if(!Number(a.lat)||!Number(a.lon)||!Number(b.lat)||!Number(b.lon)) return;
  L.marker([a.lat,a.lon]).addTo(m).bindPopup(a.title||"Start");
  L.marker([b.lat,b.lon]).addTo(m).bindPopup(b.title||"Ziel");
  const cached=localStorage.getItem(legRouteCacheKey(id));
  if(cached){
    try{
      const payload=JSON.parse(cached);
      const line=L.polyline(payload.coords.map(c=>[c[1],c[0]]),{color:"#4e9cff",weight:4}).addTo(m);
      m.fitBounds(line.getBounds(),{padding:[12,12]});
      updateLegRouteMeta(id,payload);
      return;
    }catch(e){}
  }
  const line=L.polyline([[a.lat,a.lon],[b.lat,b.lon]],{color:"#4e9cff",weight:3,opacity:.55,dashArray:"6 6"}).addTo(m);
  m.fitBounds(line.getBounds(),{padding:[12,12]});
}
function updateLegRouteMeta(id,payload){
  const km=document.getElementById(`legKm-${id}`);
  const time=document.getElementById(`legTime-${id}`);
  if(km) km.textContent=`${(payload.distanceM/1000).toFixed(0)} km`;
  if(time){const h=Math.floor(payload.durationS/3600), mi=Math.round((payload.durationS%3600)/60);time.textContent=`${h}:${String(mi).padStart(2,"0")} h`;}
}
async function buildLegRoute(id, force=false){
  const pair=legPair(id);
  if(!pair){alert("Etappe nicht gefunden.");return;}
  const {a,b,leg}=pair, key=legRouteCacheKey(id);
  if(!force&&key&&localStorage.getItem(key)){drawLegMiniRoute(id);return;}
  if((activeTrip.routeMode||"osrm")==="ors-avoid"&&!activeTrip.orsApiKey){alert("Für 'ohne Autobahn' bitte in der Kartenansicht einen OpenRouteService API-Key eintragen.");return;}
  try{
    const res=(activeTrip.routeMode||"osrm")==="ors-avoid" ? await fetchOrs(a,b) : await fetchOsrm(a,b);
    const payload={coords:res.coords,distanceM:res.distanceM,durationS:res.durationS,createdAt:new Date().toISOString()};
    localStorage.setItem(key,JSON.stringify(payload));
    leg.routeKm=res.distanceM/1000;
    const h=Math.floor(res.durationS/3600), mi=Math.round((res.durationS%3600)/60);
    leg.routeTime=`${h}:${String(mi).padStart(2,"0")} h`;
    save();
    drawLegMiniRoute(id);
    updateLegRouteMeta(id,payload);
    renderDashboard();
  }catch(e){console.error(e);alert("Etappenroute konnte nicht berechnet werden: "+e.message);}
}
function openLegInMap(id){
  showView("mapView");
  setTimeout(()=>{
    initMap();
    const pair=legPair(id);
    if(!pair||!map)return;
    const {a,b}=pair;
    if(Number(a.lat)&&Number(a.lon)&&Number(b.lat)&&Number(b.lon)) map.fitBounds([[a.lat,a.lon],[b.lat,b.lon]],{padding:[40,40]});
  },250);
}
function clearLegRouteCaches(){Object.keys(localStorage).filter(k=>k.startsWith("expedition-core1-5-legroute:")||k.startsWith("expedition-core1-3-legroute:")).forEach(k=>localStorage.removeItem(k));}
function setupLegDragDrop(){
  const items = document.querySelectorAll("#legList [data-leg-id]");
  let dragId = null;
  items.forEach(item=>{
    item.addEventListener("dragstart",()=>{dragId=item.dataset.legId;item.classList.add("dragging");});
    item.addEventListener("dragend",()=>{item.classList.remove("dragging");dragId=null;});
    item.addEventListener("dragover",e=>e.preventDefault());
    item.addEventListener("drop",e=>{
      e.preventDefault();
      const targetId=item.dataset.legId;
      if(!dragId || dragId===targetId)return;
      const from=activeTrip.legs.findIndex(l=>l.id===dragId);
      const to=activeTrip.legs.findIndex(l=>l.id===targetId);
      const [moved]=activeTrip.legs.splice(from,1);
      activeTrip.legs.splice(to,0,moved);
      save(); renderPlanning(); resetMaps();
    });
  });
}
window.editLeg=id=>{
  const l=activeTrip.legs.find(x=>x.id===id);
  const e=$("legEditor");
  e.hidden=false; e.className="editor";
  e.innerHTML=`<h3>Etappe bearbeiten</h3>
    <input id="le-title" value="${escapeHtml(l.title)}" placeholder="Titel">
    <div class="two"><input id="le-date" value="${escapeHtml(l.date)}" placeholder="Datum"><input id="le-km" type="number" value="${Number(l.plannedKm||0)}" placeholder="Plan-km"></div>
    <div class="two"><input id="le-from" value="${escapeHtml(l.from)}" placeholder="Start"><input id="le-to" value="${escapeHtml(l.to)}" placeholder="Ziel"></div>
    <div class="two"><input id="le-fromLat" type="number" step="0.000001" value="${Number(l.fromLat||0)}" placeholder="Start Breitengrad"><input id="le-fromLon" type="number" step="0.000001" value="${Number(l.fromLon||0)}" placeholder="Start Längengrad"></div>
    <div class="two"><input id="le-toLat" type="number" step="0.000001" value="${Number(l.toLat||0)}" placeholder="Ziel Breitengrad"><input id="le-toLon" type="number" step="0.000001" value="${Number(l.toLon||0)}" placeholder="Ziel Längengrad"></div>
    <div class="two"><input id="le-time" value="${escapeHtml(l.plannedTime||"")}" placeholder="Planzeit"><input id="le-overnight" value="${escapeHtml(l.overnight||"")}" placeholder="Übernachtung"></div>
    <textarea id="le-notes" placeholder="Notizen">${escapeHtml(l.notes||"")}</textarea>
    <div class="action-row"><button onclick="saveLeg('${id}')">Etappe speichern</button><button class="secondary" onclick="$('legEditor').hidden=true">Abbrechen</button></div>`;
  e.scrollIntoView({behavior:"smooth", block:"start"});
};
window.saveLeg=id=>{
  const l=activeTrip.legs.find(x=>x.id===id);
  Object.assign(l,{
    title:$("le-title").value,date:$("le-date").value,plannedKm:Number($("le-km").value||0),
    from:$("le-from").value,to:$("le-to").value,plannedTime:$("le-time").value,overnight:$("le-overnight").value,
    fromLat:Number($("le-fromLat").value||0),fromLon:Number($("le-fromLon").value||0),
    toLat:Number($("le-toLat").value||0),toLon:Number($("le-toLon").value||0),
    lat:Number($("le-toLat").value||0),lon:Number($("le-toLon").value||0),notes:$("le-notes").value
  });
  delete l.routeKm; delete l.routeTime;
  clearLegRouteCaches(); save(); $("legEditor").hidden=true; renderAll(); resetMaps();
};
window.moveLeg=(id,d)=>{const a=activeTrip.legs,i=a.findIndex(l=>l.id===id),j=i+d;if(i<0||j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];save();renderPlanning();resetMaps();};
window.duplicateLeg=id=>{const i=activeTrip.legs.findIndex(l=>l.id===id);if(i<0)return;const copy=JSON.parse(JSON.stringify(activeTrip.legs[i]));copy.id="leg-"+Date.now();copy.title += " (Kopie)";activeTrip.legs.splice(i+1,0,copy);save();renderPlanning();};
window.deleteLeg=id=>{if(!confirm("Etappe löschen?"))return;activeTrip.legs=activeTrip.legs.filter(l=>l.id!==id);save();renderAll();resetMaps();};

function renderJournal(){
  $("poiList").innerHTML=activeTrip.pois.map(p=>`<div class="item"><strong>${escapeHtml(p.name)}</strong><br>${escapeHtml(p.category)} · <span class="stars">${"★".repeat(p.rating||0)}${"☆".repeat(5-(p.rating||0))}</span><p>${escapeHtml(p.note||"")}</p><div class="item-actions"><button class="danger" onclick="deletePoi('${p.id}')">POI löschen</button></div></div>`).join("")||"<p>Noch keine POIs.</p>";
  $("journalList").innerHTML=activeTrip.journal.slice().reverse().map(j=>`<div class="item"><strong>${escapeHtml(j.date)} · ${escapeHtml(j.title)}</strong><p>${escapeHtml(j.text||"")}</p><div class="item-actions"><button class="danger" onclick="deleteJournal('${j.id}')">Eintrag löschen</button></div></div>`).join("")||"<p>Noch keine Chronik-Einträge.</p>";
}
window.deletePoi=id=>{if(!confirm("POI löschen?"))return;activeTrip.pois=activeTrip.pois.filter(p=>p.id!==id);save();renderAll();};
window.deleteJournal=id=>{if(!confirm("Chronik-Eintrag löschen?"))return;activeTrip.journal=activeTrip.journal.filter(j=>j.id!==id);save();renderAll();};
function renderCash(){
  $("expenseList").innerHTML=activeTrip.expenses.slice().reverse().map(e=>`<div class="item"><strong>${escapeHtml(e.category)}</strong><span style="float:right">${money(e.amount)}</span><br>${escapeHtml(e.date)} · ${escapeHtml(e.note||"")}<div class="item-actions"><button class="danger" onclick="deleteExpense('${e.id}')">Ausgabe löschen</button></div></div>`).join("")||"<p>Noch keine Ausgaben.</p>";
}
window.deleteExpense=id=>{if(!confirm("Ausgabe löschen?"))return;activeTrip.expenses=activeTrip.expenses.filter(e=>e.id!==id);save();renderAll();};

function setupForms(){
  $("addLegBtn").onclick=()=>{const prev=activeTrip.legs.at(-1)||{};const l={id:"leg-"+Date.now(),date:"",title:"Neue Etappe",from:prev.to||"",to:"Neues Ziel",plannedKm:0,plannedTime:"",fromLat:Number(prev.toLat||prev.lat||0),fromLon:Number(prev.toLon||prev.lon||0),toLat:Number(prev.toLat||prev.lat||0),toLon:Number(prev.toLon||prev.lon||0),lat:Number(prev.toLat||prev.lat||0),lon:Number(prev.toLon||prev.lon||0),overnight:"",notes:""};activeTrip.legs.push(l);save();renderPlanning();editLeg(l.id);};
  $("expenseForm").onsubmit=e=>{e.preventDefault();activeTrip.expenses.push({id:"exp-"+Date.now(),date:todayISO(),category:$("expenseCategory").value,amount:Number($("expenseAmount").value||0),note:$("expenseNote").value});save();e.target.reset();renderAll();};
  $("newTripBtn").onclick=()=>{const name=prompt("Name der Expedition?");if(!name)return;const t={id:"trip-"+Date.now(),name,subtitle:"Neue Expedition",startDate:todayISO(),endDate:todayISO(),routeMode:"osrm",orsApiKey:"",legs:[],pois:[],expenses:[],tracks:[],journal:[]};db.trips.push(t);db.activeTripId=t.id;activeTrip=t;save();resetMaps();renderAll();showView("dashboard");};
  $("exportAllBtn").onclick=()=>downloadJSON(db,"expeditionstagebuch-core1-backup.json");
  $("exportTripBtn").onclick=()=>downloadJSON(activeTrip,`${activeTrip.id}.json`);
  $("importAllInput").onchange=e=>importJSON(e.target.files[0],data=>{if(!data.trips)throw new Error("Ungültiges Backup");db=data;activeTrip=db.trips.find(t=>t.id===db.activeTripId)||db.trips[0];normalizeTrip(activeTrip);save();resetMaps();renderAll();});
  $("importTripInput").onchange=e=>importJSON(e.target.files[0],data=>{normalizeTrip(data);data.id=data.id||"trip-"+Date.now();db.trips.push(data);db.activeTripId=data.id;activeTrip=data;save();resetMaps();renderAll();showView("dashboard");});
  $("addPoiBtn").onclick=()=>{const name=prompt("Name des POI?");if(!name)return;const category=prompt("Kategorie?", "Camping")||"Sonstiges";const note=prompt("Notiz?", "")||"";activeTrip.pois.push({id:"poi-"+Date.now(),name,category,rating:0,date:todayISO(),lat:0,lon:0,note,photos:[]});save();renderAll();};
  $("addJournalBtn").onclick=()=>{const title=prompt("Titel?");if(!title)return;const text=prompt("Text?", "")||"";activeTrip.journal.push({id:"j-"+Date.now(),date:todayISO(),title,text,photos:[]});save();renderAll();};
  $("routeMode").onchange=()=>{activeTrip.routeMode=$("routeMode").value;save();};
  $("orsApiKey").onchange=()=>{activeTrip.orsApiKey=$("orsApiKey").value.trim();save();};
  $("buildRouteBtn").onclick=()=>buildRoadRoute(true);
  $("clearRouteCacheBtn").onclick=()=>{Object.keys(localStorage).filter(k=>k.startsWith(ROUTE_CACHE_PREFIX)).forEach(k=>localStorage.removeItem(k));setRouteStatus("Routencache gelöscht.");buildRoadRoute(true);};
}
function downloadJSON(data,name){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.download=name;a.click();}
function importJSON(file,cb){if(!file)return;const r=new FileReader();r.onload=()=>{try{cb(JSON.parse(r.result));}catch(e){alert("Import fehlgeschlagen: "+e.message)}};r.readAsText(file);}

function resetMaps(){miniMap=null;map=null;plannedLayer=null;drivenLayer=null;liveLayer=null;liveMarker=null;Object.keys(legMiniMaps).forEach(k=>delete legMiniMaps[k]);$("miniMap").innerHTML="";$("map").innerHTML="";}
function initMiniMap(){if(miniMap)return;miniMap=L.map("miniMap",{zoomControl:false,attributionControl:false}).setView([46,3],5);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(miniMap);drawStraightRoute(miniMap);}
function initMap(){if(map){map.invalidateSize();return;}map=L.map("map").setView([46,3],5);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);$("routeMode").value=activeTrip.routeMode||"osrm";$("orsApiKey").value=activeTrip.orsApiKey||"";drawStraightRoute(map);drawTracks(map);setTimeout(()=>buildRoadRoute(false),200);}
function routePoints(){
  const pts=[];
  if(activeTrip.legs.length){
    const first=activeTrip.legs[0];
    if(Number(first.fromLat)&&Number(first.fromLon)) pts.push({lat:Number(first.fromLat),lon:Number(first.fromLon),title:first.from||"Start"});
  }
  activeTrip.legs.forEach(l=>{
    const lat=Number(l.toLat ?? l.lat), lon=Number(l.toLon ?? l.lon);
    if(Number.isFinite(lat)&&Number.isFinite(lon)&&lat&&lon) pts.push({lat,lon,title:l.to||l.title});
  });
  return pts;
}
function drawStraightRoute(m){const pts=routePoints().map(p=>[p.lat,p.lon]);if(!pts.length)return;const line=L.polyline(pts,{color:"#4e9cff",weight:4,opacity:.65,dashArray:"6 6"}).addTo(m);routePoints().forEach((p,i)=>L.marker([p.lat,p.lon]).addTo(m).bindPopup(`${i+1}. ${escapeHtml(p.title)}`));try{m.fitBounds(line.getBounds(),{padding:[20,20]});}catch(e){}}
function drawTracks(m){activeTrip.tracks.forEach(t=>{if(t.points?.length)L.polyline(t.points.map(p=>[p.lat,p.lon]),{color:"#22b83f",weight:5}).addTo(m);});}
function routeCacheKey(){return ROUTE_CACHE_PREFIX+activeTrip.id+":"+activeTrip.routeMode+":"+activeTrip.legs.map(l=>`${Number(l.lat).toFixed(5)},${Number(l.lon).toFixed(5)}`).join("|");}
function setRouteStatus(s){$("routeStatus").textContent=s;}
async function buildRoadRoute(force=false){
  if(!map)return;
  const mode=activeTrip.routeMode||"osrm";
  if(mode==="straight"){setRouteStatus("Luftlinie aktiv.");return;}
  const pts=routePoints();
  if(pts.length<2){setRouteStatus("Zu wenige Etappenpunkte.");return;}
  const cache=localStorage.getItem(routeCacheKey());
  if(cache&&!force){try{drawRoad(JSON.parse(cache));setRouteStatus("Straßenroute aus Cache geladen.");return;}catch(e){}}
  if(mode==="ors-avoid"&&!activeTrip.orsApiKey){setRouteStatus("Für Autobahnen vermeiden wird ein OpenRouteService API-Key benötigt.");return;}
  setRouteStatus("Straßenroute wird berechnet …");
  const coords=[];let dist=0,dur=0;
  try{
    for(let i=0;i<pts.length-1;i++){
      const res=mode==="ors-avoid" ? await fetchOrs(pts[i],pts[i+1]) : await fetchOsrm(pts[i],pts[i+1]);
      coords.push(...(i===0?res.coords:res.coords.slice(1)));dist+=res.distanceM;dur+=res.durationS;
      setRouteStatus(`Abschnitt ${i+1}/${pts.length-1} berechnet …`);
    }
    const payload={coords,distanceM:dist,durationS:dur,mode,createdAt:new Date().toISOString()};
    localStorage.setItem(routeCacheKey(),JSON.stringify(payload));
    drawRoad(payload);
    setRouteStatus(`Straßenroute: ${(dist/1000).toFixed(1)} km · ${Math.floor(dur/3600)}:${String(Math.round((dur%3600)/60)).padStart(2,"0")} h`);
  }catch(e){console.error(e);setRouteStatus("Routing fehlgeschlagen: "+e.message);}
}
async function fetchOsrm(a,b){
  const url=`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&steps=false`;
  const r=await fetch(url);if(!r.ok)throw new Error("OSRM "+r.status);const d=await r.json();if(!d.routes?.[0])throw new Error("keine OSRM-Route");
  return{coords:d.routes[0].geometry.coordinates,distanceM:d.routes[0].distance||0,durationS:d.routes[0].duration||0};
}
async function fetchOrs(a,b){
  const body={coordinates:[[a.lon,a.lat],[b.lon,b.lat]],options:{avoid_features:["highways"]}};
  const r=await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson",{method:"POST",headers:{Authorization:activeTrip.orsApiKey,"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok)throw new Error("ORS "+r.status);const d=await r.json();const f=d.features?.[0];if(!f)throw new Error("keine ORS-Route");
  const s=f.properties?.summary||{};return{coords:f.geometry.coordinates,distanceM:s.distance||0,durationS:s.duration||0};
}
function drawRoad(payload){
  if(plannedLayer)map.removeLayer(plannedLayer);
  plannedLayer=L.polyline(payload.coords.map(c=>[c[1],c[0]]),{color:"#4e9cff",weight:5,opacity:.9}).addTo(map);
  try{map.fitBounds(plannedLayer.getBounds(),{padding:[20,20]});}catch(e){}
}

async function wake(on){try{if(on&&"wakeLock"in navigator&&!wakeLock)wakeLock=await navigator.wakeLock.request("screen");if(!on&&wakeLock){await wakeLock.release();wakeLock=null;}$("wakeStatus").textContent=on?"Display: aktiv":"Display: bereit";}catch(e){$("wakeStatus").textContent="Display: nicht unterstützt";}}
$("startGpsBtn").onclick=()=>{wake(true);showView("mapView");if(!navigator.geolocation)return alert("GPS nicht verfügbar");let track={id:"track-"+Date.now(),date:todayISO(),points:[],km:0,ms:0,start:Date.now()};activeTrip._liveTrack=track;watchId=navigator.geolocation.watchPosition(pos=>{const p={lat:pos.coords.latitude,lon:pos.coords.longitude,time:new Date().toISOString()};track.points.push(p);if(liveLayer)map.removeLayer(liveLayer);liveLayer=L.polyline(track.points.map(x=>[x.lat,x.lon]),{color:"#22b83f",weight:5}).addTo(map);if(liveMarker)liveMarker.setLatLng([p.lat,p.lon]);else liveMarker=L.marker([p.lat,p.lon]).addTo(map).bindPopup("🚙 Live");map.setView([p.lat,p.lon],15);},err=>alert(err.message),{enableHighAccuracy:true,maximumAge:5000,timeout:15000});};
$("pauseGpsBtn").onclick=()=>{if(watchId)navigator.geolocation.clearWatch(watchId);watchId=null;wake(false);};
$("finishTrackBtn").onclick=()=>{if(watchId)navigator.geolocation.clearWatch(watchId);watchId=null;const t=activeTrip._liveTrack;if(t){t.ms=Date.now()-t.start;t.km=estimateKm(t.points);activeTrip.tracks.push(t);delete activeTrip._liveTrack;save();renderAll();alert("Track gespeichert.");}wake(false);};
function estimateKm(pts){let s=0;for(let i=1;i<pts.length;i++)s+=dist(pts[i-1],pts[i]);return s;}
function dist(a,b){const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lon-a.lon)*Math.PI/180;const x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x));}

async function registerSW(){if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js");}
let deferredPrompt;window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;$("installBtn").hidden=false;});
$("installBtn").onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();deferredPrompt=null;$("installBtn").hidden=true;}};


/* ===== Core 1.4: responsive map handling on rotation/resize ===== */
let resizeRefreshTimer = null;

function allActiveMaps(){
  const maps = [];
  if(miniMap) maps.push({map: miniMap, type: "mini"});
  if(map) maps.push({map: map, type: "main"});
  Object.keys(legMiniMaps || {}).forEach(id => {
    if(legMiniMaps[id]) maps.push({map: legMiniMaps[id], type: "leg", id});
  });
  return maps;
}

function fitLegMapToRoute(id){
  const m = legMiniMaps[id];
  const pair = nextLegPair(id);
  if(!m || !pair) return;
  const {a,b} = pair;
  const cached = localStorage.getItem(legRouteCacheKey(id));
  try{
    if(cached){
      const payload = JSON.parse(cached);
      if(payload.coords && payload.coords.length){
        const bounds = L.latLngBounds(payload.coords.map(c => [c[1], c[0]]));
        m.fitBounds(bounds, {padding:[18,18]});
        return;
      }
    }
    if(b && Number(a.lat) && Number(a.lon) && Number(b.lat) && Number(b.lon)){
      m.fitBounds([[a.lat,a.lon],[b.lat,b.lon]], {padding:[18,18]});
    } else if(Number(a.lat) && Number(a.lon)){
      m.setView([a.lat,a.lon], 10);
    }
  }catch(e){}
}

function fitMainMapToVisibleRoute(){
  if(!map) return;
  try{
    if(plannedLayer && plannedLayer.getBounds){
      map.fitBounds(plannedLayer.getBounds(), {padding:[28,28]});
      return;
    }
    const pts = routePoints().map(p => [p.lat,p.lon]);
    if(pts.length >= 2) map.fitBounds(pts, {padding:[28,28]});
    else if(pts.length === 1) map.setView(pts[0], 10);
  }catch(e){}
}

function refreshMapsAfterLayoutChange(){
  clearTimeout(resizeRefreshTimer);
  resizeRefreshTimer = setTimeout(() => {
    allActiveMaps().forEach(entry => {
      try{ entry.map.invalidateSize(true); }catch(e){}
    });

    if(miniMap){
      try{
        const pts = routePoints().map(p => [p.lat,p.lon]);
        if(pts.length >= 2) miniMap.fitBounds(pts, {padding:[18,18]});
      }catch(e){}
    }

    Object.keys(legMiniMaps || {}).forEach(id => {
      try{
        drawLegMiniRoute(id);
        setTimeout(() => fitLegMapToRoute(id), 80);
      }catch(e){}
    });

    setTimeout(fitMainMapToVisibleRoute, 80);
  }, 250);
}

window.addEventListener("resize", refreshMapsAfterLayoutChange);
window.addEventListener("orientationchange", refreshMapsAfterLayoutChange);

const originalShowViewCore14 = typeof showView === "function" ? showView : null;
if(originalShowViewCore14){
  showView = function(id){
    originalShowViewCore14(id);
    setTimeout(refreshMapsAfterLayoutChange, 250);
  };
  window.showView = showView;
}

const originalInitLegMiniMapsCore14 = typeof initLegMiniMaps === "function" ? initLegMiniMaps : null;
if(originalInitLegMiniMapsCore14){
  initLegMiniMaps = function(){
    originalInitLegMiniMapsCore14();
    setTimeout(refreshMapsAfterLayoutChange, 350);
  };
}

const originalDrawRoadCore14 = typeof drawRoad === "function" ? drawRoad : null;
if(originalDrawRoadCore14){
  drawRoad = function(payload){
    originalDrawRoadCore14(payload);
    setTimeout(fitMainMapToVisibleRoute, 120);
  };
}



/* ===== Core 1.6: robust per-leg routes and batch routing ===== */
function core16SetBatchStatus(text, pct=null){
  const el = document.getElementById("routeBatchStatus");
  if(!el) return;
  el.innerHTML = escapeHtml(text) + (pct !== null ? `<div class="route-batch-progress"><span style="width:${Math.max(0,Math.min(100,pct))}%"></span></div>` : "");
}

function core16ClearOldRouteCaches(){
  Object.keys(localStorage)
    .filter(k => k.startsWith("expedition-core1-3-legroute:") || k.startsWith("expedition-core1-5-legroute:"))
    .forEach(k => localStorage.removeItem(k));
}

function normalizeLegModel(t){
  t.legs ||= [];
  t.legs.forEach((l, idx) => {
    const prev = idx > 0 ? t.legs[idx-1] : null;
    if(!Number(l.fromLat) || !Number(l.fromLon)){
      if(idx === 0){ l.fromLat = 53.183; l.fromLon = 8.000; }
      else if(prev){ l.fromLat = Number(prev.toLat ?? prev.lat ?? 0); l.fromLon = Number(prev.toLon ?? prev.lon ?? 0); }
    }
    if(!Number(l.toLat) || !Number(l.toLon)){
      l.toLat = Number(l.lat || 0);
      l.toLon = Number(l.lon || 0);
    }
    l.fromLat = Number(l.fromLat || 0);
    l.fromLon = Number(l.fromLon || 0);
    l.toLat = Number(l.toLat || 0);
    l.toLon = Number(l.toLon || 0);
    l.lat = l.toLat;
    l.lon = l.toLon;
    if(!l.routeStatus) l.routeStatus = l.routeGeometry?.length ? "ok" : "not_loaded";
  });
}

function legRouteCacheKey(id){
  const leg = activeTrip.legs.find(l=>l.id===id);
  if(!leg) return null;
  return `expedition-core1-6-legroute:${activeTrip.id}:${activeTrip.routeMode||"osrm"}:${id}:${Number(leg.fromLat).toFixed(5)},${Number(leg.fromLon).toFixed(5)}:${Number(leg.toLat).toFixed(5)},${Number(leg.toLon).toFixed(5)}`;
}

function legPair(id){
  const i = activeTrip.legs.findIndex(l=>l.id===id);
  if(i < 0) return null;
  const l = activeTrip.legs[i];
  return {
    i,
    a:{lat:Number(l.fromLat), lon:Number(l.fromLon), title:l.from||"Start"},
    b:{lat:Number(l.toLat), lon:Number(l.toLon), title:l.to||"Ziel"},
    leg:l
  };
}
function nextLegPair(id){ return legPair(id); }

function routeChipHtml(l){
  if(l.routeStatus === "ok" && l.routeGeometry?.length) return `<span class="route-chip ok">Route gespeichert</span>`;
  if(l.routeStatus === "error") return `<span class="route-chip err">Routingfehler</span>`;
  if(!Number(l.fromLat)||!Number(l.fromLon)||!Number(l.toLat)||!Number(l.toLon)) return `<span class="route-chip err">Koordinaten fehlen</span>`;
  return `<span class="route-chip warn">Luftlinie / Route nicht geladen</span>`;
}

function renderPlanning(){
  normalizeLegModel(activeTrip);
  $("legList").innerHTML=activeTrip.legs.map((l,i)=>`
    <div class="leg-card" draggable="true" data-leg-id="${l.id}">
      <div class="leg-card-head">
        <div>
          <strong>${i+1}. ${escapeHtml(l.title)}</strong><br>
          ${escapeHtml(l.date)} · ${escapeHtml(l.from)} → ${escapeHtml(l.to)}<br>
          ${escapeHtml(l.overnight||"")}<br>${routeChipHtml(l)}
        </div>
        <button class="secondary" onclick="editLeg('${l.id}')">Bearbeiten</button>
      </div>
      <div class="leg-point-grid">
        <div><strong>Start</strong>${escapeHtml(l.from)}<br><small>${Number(l.fromLat||0).toFixed(5)}, ${Number(l.fromLon||0).toFixed(5)}</small></div>
        <div><strong>Ziel</strong>${escapeHtml(l.to)}<br><small>${Number(l.toLat||0).toFixed(5)}, ${Number(l.toLon||0).toFixed(5)}</small></div>
      </div>
      <div class="leg-route-meta">
        <div><strong id="legKm-${l.id}">${Number(l.routeKm || l.plannedKm || 0).toFixed(0)} km</strong><small>${l.routeKm ? "echte Route" : "Planwert"}</small></div>
        <div><strong id="legTime-${l.id}">${l.routeTime || escapeHtml(l.plannedTime||"–")}</strong><small>${l.routeTime ? "Routingzeit" : "Planzeit"}</small></div>
      </div>
      <div class="leg-mini-map" id="legMap-${l.id}"></div>
      <div class="leg-actions">
        <button onclick="buildLegRoute('${l.id}', true)">Route laden</button>
        <button class="secondary" onclick="openLegInMap('${l.id}')">Große Karte</button>
        <button class="secondary" onclick="moveLeg('${l.id}',-1)">↑</button>
        <button class="secondary" onclick="moveLeg('${l.id}',1)">↓</button>
        <button class="secondary" onclick="duplicateLeg('${l.id}')">Duplizieren</button>
        <button class="danger" onclick="deleteLeg('${l.id}')">Löschen</button>
      </div>
    </div>`).join("") || "<p>Noch keine Etappen.</p>";
  setupLegDragDrop();
  setTimeout(initLegMiniMaps, 180);
}

function initLegMiniMaps(){
  normalizeLegModel(activeTrip);
  activeTrip.legs.forEach(leg=>{
    const el=document.getElementById(`legMap-${leg.id}`);
    if(!el) return;
    if(legMiniMaps[leg.id]){
      try{ legMiniMaps[leg.id].invalidateSize(true); drawLegMiniRoute(leg.id); }catch(e){}
      return;
    }
    const startLat=Number(leg.fromLat||leg.toLat||46), startLon=Number(leg.fromLon||leg.toLon||3);
    const m=L.map(el,{zoomControl:false,attributionControl:false}).setView([startLat,startLon],8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(m);
    legMiniMaps[leg.id]=m;
    setTimeout(()=>{ m.invalidateSize(true); drawLegMiniRoute(leg.id); }, 180);
  });
}

function drawLegMiniRoute(id){
  const pair=legPair(id), m=legMiniMaps[id];
  if(!pair||!m) return;
  clearMiniMap(m);
  const {a,b,leg}=pair;
  if(!Number(a.lat)||!Number(a.lon)||!Number(b.lat)||!Number(b.lon)) return;

  L.marker([a.lat,a.lon]).addTo(m).bindPopup(a.title||"Start");
  L.marker([b.lat,b.lon]).addTo(m).bindPopup(b.title||"Ziel");

  let payload = null;
  if(leg.routeGeometry?.length){
    payload = {coords: leg.routeGeometry, distanceM: Number(leg.routeDistanceM||0), durationS: Number(leg.routeDurationS||0)};
  } else {
    const cached = localStorage.getItem(legRouteCacheKey(id));
    if(cached){ try{ payload = JSON.parse(cached); }catch(e){} }
  }

  if(payload?.coords?.length){
    const line=L.polyline(payload.coords.map(c=>[c[1],c[0]]),{color:"#4e9cff",weight:4}).addTo(m);
    try{ m.fitBounds(line.getBounds(),{padding:[14,14]}); }catch(e){}
    updateLegRouteMeta(id,payload);
    return;
  }

  const line=L.polyline([[a.lat,a.lon],[b.lat,b.lon]],{color:"#4e9cff",weight:3,opacity:.55,dashArray:"6 6"}).addTo(m);
  try{ m.fitBounds(line.getBounds(),{padding:[14,14]}); }catch(e){}
}

async function buildLegRoute(id, force=false){
  const pair=legPair(id);
  if(!pair){ alert("Etappe nicht gefunden."); return false; }
  const {a,b,leg}=pair, key=legRouteCacheKey(id);

  if(!Number(a.lat)||!Number(a.lon)||!Number(b.lat)||!Number(b.lon)){
    leg.routeStatus = "error"; save(); alert("Start- oder Zielkoordinaten fehlen."); renderPlanning(); return false;
  }

  if(!force && leg.routeGeometry?.length){ drawLegMiniRoute(id); return true; }

  if(!force && key && localStorage.getItem(key)){
    try{
      const payload = JSON.parse(localStorage.getItem(key));
      persistLegRoute(leg, payload); drawLegMiniRoute(id); save(); return true;
    }catch(e){}
  }

  if((activeTrip.routeMode||"osrm")==="ors-avoid" && !activeTrip.orsApiKey){
    alert("Für 'ohne Autobahn' bitte in der Kartenansicht einen OpenRouteService API-Key eintragen.");
    return false;
  }

  try{
    leg.routeStatus = "loading";
    const res=(activeTrip.routeMode||"osrm")==="ors-avoid" ? await fetchOrs(a,b) : await fetchOsrm(a,b);
    const payload={coords:res.coords,distanceM:res.distanceM,durationS:res.durationS,createdAt:new Date().toISOString()};
    localStorage.setItem(key,JSON.stringify(payload));
    persistLegRoute(leg, payload);
    save(); drawLegMiniRoute(id); updateLegRouteMeta(id,payload); return true;
  }catch(e){
    console.error(e);
    leg.routeStatus = "error"; leg.routeError = e.message; save(); drawLegMiniRoute(id);
    alert("Etappenroute konnte nicht berechnet werden: " + e.message);
    return false;
  }
}

function persistLegRoute(leg, payload){
  leg.routeGeometry = payload.coords || [];
  leg.routeDistanceM = Number(payload.distanceM || 0);
  leg.routeDurationS = Number(payload.durationS || 0);
  leg.routeKm = leg.routeDistanceM/1000;
  const h=Math.floor(leg.routeDurationS/3600), mi=Math.round((leg.routeDurationS%3600)/60);
  leg.routeTime=`${h}:${String(mi).padStart(2,"0")} h`;
  leg.routeStatus = "ok";
  delete leg.routeError;
}

async function buildAllLegRoutes(){
  normalizeLegModel(activeTrip);
  const legs = activeTrip.legs;
  if(!legs.length) return;
  let ok = 0;
  for(let i=0;i<legs.length;i++){
    core16SetBatchStatus(`Berechne Etappe ${i+1}/${legs.length}: ${legs[i].title}`, Math.round(i/legs.length*100));
    const success = await buildLegRoute(legs[i].id, true);
    if(success) ok++;
    renderPlanning();
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  core16SetBatchStatus(`Fertig: ${ok}/${legs.length} Etappen berechnet.`, 100);
  save(); renderAll();
}

function clearLegRouteCaches(){
  Object.keys(localStorage)
    .filter(k => k.startsWith("expedition-core1-6-legroute:") || k.startsWith("expedition-core1-5-legroute:") || k.startsWith("expedition-core1-3-legroute:"))
    .forEach(k=>localStorage.removeItem(k));
}

function invalidateLegRoute(leg){
  delete leg.routeGeometry; delete leg.routeDistanceM; delete leg.routeDurationS; delete leg.routeKm; delete leg.routeTime;
  leg.routeStatus = "not_loaded"; delete leg.routeError;
}

const originalSetupFormsCore16 = typeof setupForms === "function" ? setupForms : null;
if(originalSetupFormsCore16){
  setupForms = function(){
    originalSetupFormsCore16();
    const allBtn = document.getElementById("buildAllRoutesBtn");
    if(allBtn && !allBtn.__core16){ allBtn.__core16 = true; allBtn.onclick = buildAllLegRoutes; }
  };
}

const originalSaveLegCore16 = typeof saveLeg === "function" ? saveLeg : null;
if(originalSaveLegCore16){
  saveLeg = function(id){
    const leg = activeTrip.legs.find(l=>l.id===id);
    if(leg) invalidateLegRoute(leg);
    originalSaveLegCore16(id);
    normalizeLegModel(activeTrip);
    save();
  };
}

setTimeout(() => {
  core16ClearOldRouteCaches();
  normalizeLegModel(activeTrip);
  const allBtn = document.getElementById("buildAllRoutesBtn");
  if(allBtn) allBtn.onclick = buildAllLegRoutes;
  save();
  renderAll();
}, 800);


/* ===== Core 1.6a: fix identical start/target coordinates and stay days ===== */
const CORE16A_PLACE_FIXES={"dierre":[47.3497,0.9578],"chenonceau":[47.3249,1.0703],"chenonceaux":[47.3309,1.0676],"chambord":[47.6161,1.5172]};
function core16aDistanceMeters(aLat,aLon,bLat,bLon){const R=6371000,dLat=(bLat-aLat)*Math.PI/180,dLon=(bLon-aLon)*Math.PI/180;const x=Math.sin(dLat/2)**2+Math.cos(aLat*Math.PI/180)*Math.cos(bLat*Math.PI/180)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function core16aIsSamePoint(leg){return core16aDistanceMeters(Number(leg.fromLat||0),Number(leg.fromLon||0),Number(leg.toLat||0),Number(leg.toLon||0))<80;}
function core16aKnownFixFor(leg){const text=`${leg.to||""} ${leg.title||""}`.toLowerCase();for(const [k,v] of Object.entries(CORE16A_PLACE_FIXES)){if(text.includes(k))return v;}return null;}
function core16aApplyKnownFixes(leg){if(!core16aIsSamePoint(leg))return false;const fix=core16aKnownFixFor(leg);if(!fix)return false;leg.toLat=fix[0];leg.toLon=fix[1];leg.lat=fix[0];leg.lon=fix[1];invalidateLegRoute(leg);return true;}
function normalizeLegModel(t){t.legs||=[];t.legs.forEach((l,idx)=>{const prev=idx>0?t.legs[idx-1]:null;if(!Number(l.fromLat)||!Number(l.fromLon)){if(idx===0){l.fromLat=53.183;l.fromLon=8.000;}else if(prev){l.fromLat=Number(prev.toLat??prev.lat??0);l.fromLon=Number(prev.toLon??prev.lon??0);}}if(!Number(l.toLat)||!Number(l.toLon)){l.toLat=Number(l.lat||0);l.toLon=Number(l.lon||0);}l.fromLat=Number(l.fromLat||0);l.fromLon=Number(l.fromLon||0);l.toLat=Number(l.toLat||0);l.toLon=Number(l.toLon||0);l.lat=l.toLat;l.lon=l.toLon;if(core16aApplyKnownFixes(l)){l.routeStatus="not_loaded";return;}if(core16aIsSamePoint(l)){l.routeStatus="stay";l.routeKm=0;l.routeTime="0:00 h";delete l.routeGeometry;delete l.routeDistanceM;delete l.routeDurationS;}else if(!l.routeStatus||l.routeStatus==="stay"){l.routeStatus=l.routeGeometry?.length?"ok":"not_loaded";}});}
function routeChipHtml(l){if(l.routeStatus==="ok"&&l.routeGeometry?.length)return `<span class="route-chip ok">Route gespeichert</span>`;if(l.routeStatus==="stay")return `<span class="route-chip stay">Rundtag / Aufenthalt</span>`;if(l.routeStatus==="error")return `<span class="route-chip err">Routingfehler</span>`;if(!Number(l.fromLat)||!Number(l.fromLon)||!Number(l.toLat)||!Number(l.toLon))return `<span class="route-chip err">Koordinaten fehlen</span>`;return `<span class="route-chip warn">Luftlinie / Route nicht geladen</span>`;}
function core16aWarningHtml(l){return l.routeStatus==="stay"?`<div class="leg-warning">Start und Ziel sind identisch. Diese Etappe wird als Rundtag/Aufenthalt behandelt. Für eine echte Route bitte im Editor andere Zielkoordinaten setzen.</div>`:"";}
function renderPlanning(){normalizeLegModel(activeTrip);$("legList").innerHTML=activeTrip.legs.map((l,i)=>`
    <div class="leg-card" draggable="true" data-leg-id="${l.id}">
      <div class="leg-card-head"><div><strong>${i+1}. ${escapeHtml(l.title)}</strong><br>${escapeHtml(l.date)} · ${escapeHtml(l.from)} → ${escapeHtml(l.to)}<br>${escapeHtml(l.overnight||"")}<br>${routeChipHtml(l)}</div><button class="secondary" onclick="editLeg('${l.id}')">Bearbeiten</button></div>
      ${core16aWarningHtml(l)}
      <div class="leg-point-grid"><div><strong>Start</strong>${escapeHtml(l.from)}<br><small>${Number(l.fromLat||0).toFixed(5)}, ${Number(l.fromLon||0).toFixed(5)}</small></div><div><strong>Ziel</strong>${escapeHtml(l.to)}<br><small>${Number(l.toLat||0).toFixed(5)}, ${Number(l.toLon||0).toFixed(5)}</small></div></div>
      <div class="leg-route-meta"><div><strong id="legKm-${l.id}">${Number(l.routeKm || l.plannedKm || 0).toFixed(0)} km</strong><small>${l.routeStatus==="stay"?"Aufenthalt":(l.routeKm?"echte Route":"Planwert")}</small></div><div><strong id="legTime-${l.id}">${l.routeTime || escapeHtml(l.plannedTime||"–")}</strong><small>${l.routeStatus==="stay"?"keine Fahrt":(l.routeTime?"Routingzeit":"Planzeit")}</small></div></div>
      <div class="leg-mini-map" id="legMap-${l.id}"></div>
      <div class="leg-actions"><button onclick="buildLegRoute('${l.id}', true)">${l.routeStatus==="stay"?"Route prüfen":"Route laden"}</button><button class="secondary" onclick="openLegInMap('${l.id}')">Große Karte</button><button class="secondary" onclick="moveLeg('${l.id}',-1)">↑</button><button class="secondary" onclick="moveLeg('${l.id}',1)">↓</button><button class="secondary" onclick="duplicateLeg('${l.id}')">Duplizieren</button><button class="danger" onclick="deleteLeg('${l.id}')">Löschen</button></div>
    </div>`).join("")||"<p>Noch keine Etappen.</p>";setupLegDragDrop();setTimeout(initLegMiniMaps,180);}
function drawLegMiniRoute(id){const pair=legPair(id),m=legMiniMaps[id];if(!pair||!m)return;clearMiniMap(m);const {a,b,leg}=pair;if(!Number(a.lat)||!Number(a.lon)||!Number(b.lat)||!Number(b.lon))return;if(leg.routeStatus==="stay"||core16aIsSamePoint(leg)){L.marker([a.lat,a.lon]).addTo(m).bindPopup(`${a.title||"Aufenthalt"} / ${b.title||""}`);m.setView([a.lat,a.lon],14);return;}L.marker([a.lat,a.lon]).addTo(m).bindPopup(a.title||"Start");L.marker([b.lat,b.lon]).addTo(m).bindPopup(b.title||"Ziel");let payload=null;if(leg.routeGeometry?.length){payload={coords:leg.routeGeometry,distanceM:Number(leg.routeDistanceM||0),durationS:Number(leg.routeDurationS||0)};}else{const cached=localStorage.getItem(legRouteCacheKey(id));if(cached){try{payload=JSON.parse(cached);}catch(e){}}}if(payload?.coords?.length){const line=L.polyline(payload.coords.map(c=>[c[1],c[0]]),{color:"#4e9cff",weight:4}).addTo(m);try{m.fitBounds(line.getBounds(),{padding:[14,14]});}catch(e){}updateLegRouteMeta(id,payload);return;}const line=L.polyline([[a.lat,a.lon],[b.lat,b.lon]],{color:"#4e9cff",weight:3,opacity:.55,dashArray:"6 6"}).addTo(m);try{m.fitBounds(line.getBounds(),{padding:[14,14]});}catch(e){}}
async function buildLegRoute(id,force=false){normalizeLegModel(activeTrip);const pair=legPair(id);if(!pair){alert("Etappe nicht gefunden.");return false;}const {a,b,leg}=pair,key=legRouteCacheKey(id);if(core16aApplyKnownFixes(leg)){save();}if(core16aIsSamePoint(leg)){leg.routeStatus="stay";leg.routeKm=0;leg.routeTime="0:00 h";delete leg.routeGeometry;delete leg.routeDistanceM;delete leg.routeDurationS;save();drawLegMiniRoute(id);renderPlanning();return true;}if(!Number(a.lat)||!Number(a.lon)||!Number(b.lat)||!Number(b.lon)){leg.routeStatus="error";save();alert("Start- oder Zielkoordinaten fehlen.");renderPlanning();return false;}if(!force&&leg.routeGeometry?.length){drawLegMiniRoute(id);return true;}if(!force&&key&&localStorage.getItem(key)){try{const payload=JSON.parse(localStorage.getItem(key));persistLegRoute(leg,payload);drawLegMiniRoute(id);save();renderPlanning();return true;}catch(e){}}if((activeTrip.routeMode||"osrm")==="ors-avoid"&&!activeTrip.orsApiKey){alert("Für 'ohne Autobahn' bitte in der Kartenansicht einen OpenRouteService API-Key eintragen.");return false;}try{leg.routeStatus="loading";const res=(activeTrip.routeMode||"osrm")==="ors-avoid"?await fetchOrs(a,b):await fetchOsrm(a,b);const payload={coords:res.coords,distanceM:res.distanceM,durationS:res.durationS,createdAt:new Date().toISOString()};localStorage.setItem(key,JSON.stringify(payload));persistLegRoute(leg,payload);save();drawLegMiniRoute(id);updateLegRouteMeta(id,payload);renderPlanning();return true;}catch(e){console.error(e);leg.routeStatus="error";leg.routeError=e.message;save();drawLegMiniRoute(id);alert("Etappenroute konnte nicht berechnet werden: "+e.message);renderPlanning();return false;}}
async function buildAllLegRoutes(){normalizeLegModel(activeTrip);const legs=activeTrip.legs;if(!legs.length)return;let ok=0;for(let i=0;i<legs.length;i++){core16SetBatchStatus(`Berechne/prüfe Etappe ${i+1}/${legs.length}: ${legs[i].title}`,Math.round(i/legs.length*100));const success=await buildLegRoute(legs[i].id,true);if(success)ok++;await new Promise(r=>setTimeout(r,250));}core16SetBatchStatus(`Fertig: ${ok}/${legs.length} Etappen geprüft/berechnet.`,100);save();renderAll();}
setTimeout(()=>{normalizeLegModel(activeTrip);save();renderAll();},1200);

init();
