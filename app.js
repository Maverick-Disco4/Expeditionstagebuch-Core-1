
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
    <div class="item" draggable="true" data-leg-id="${l.id}">
      <strong>${i+1}. ${escapeHtml(l.title)}</strong><br>
      ${escapeHtml(l.date)} · ${Number(l.plannedKm||0)} km · ${escapeHtml(l.plannedTime||"")}<br>
      ${escapeHtml(l.overnight||"")}
      <div class="item-actions">
        <button onclick="editLeg('${l.id}')">Bearbeiten</button>
        <button class="secondary" onclick="moveLeg('${l.id}',-1)">↑</button>
        <button class="secondary" onclick="moveLeg('${l.id}',1)">↓</button>
        <button class="secondary" onclick="duplicateLeg('${l.id}')">Duplizieren</button>
        <button class="danger" onclick="deleteLeg('${l.id}')">Löschen</button>
      </div>
    </div>`).join("") || "<p>Noch keine Etappen.</p>";
  setupLegDragDrop();
}
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
    <div class="two"><input id="le-date" value="${escapeHtml(l.date)}" placeholder="Datum"><input id="le-km" type="number" value="${Number(l.plannedKm||0)}" placeholder="km"></div>
    <div class="two"><input id="le-from" value="${escapeHtml(l.from)}" placeholder="Von"><input id="le-to" value="${escapeHtml(l.to)}" placeholder="Ziel"></div>
    <div class="two"><input id="le-time" value="${escapeHtml(l.plannedTime||"")}" placeholder="Fahrtzeit"><input id="le-overnight" value="${escapeHtml(l.overnight||"")}" placeholder="Übernachtung"></div>
    <div class="two"><input id="le-lat" type="number" step="0.000001" value="${Number(l.lat||0)}" placeholder="Breitengrad"><input id="le-lon" type="number" step="0.000001" value="${Number(l.lon||0)}" placeholder="Längengrad"></div>
    <textarea id="le-notes" placeholder="Notizen">${escapeHtml(l.notes||"")}</textarea>
    <div class="action-row"><button onclick="saveLeg('${id}')">Etappe speichern</button><button class="secondary" onclick="$('legEditor').hidden=true">Abbrechen</button></div>`;
  e.scrollIntoView({behavior:"smooth", block:"start"});
};
window.saveLeg=id=>{
  const l=activeTrip.legs.find(x=>x.id===id);
  Object.assign(l,{title:$("le-title").value,date:$("le-date").value,plannedKm:Number($("le-km").value||0),from:$("le-from").value,to:$("le-to").value,plannedTime:$("le-time").value,overnight:$("le-overnight").value,lat:Number($("le-lat").value||0),lon:Number($("le-lon").value||0),notes:$("le-notes").value});
  save(); $("legEditor").hidden=true; renderAll(); resetMaps();
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
  $("addLegBtn").onclick=()=>{const prev=activeTrip.legs.at(-1)||{};const l={id:"leg-"+Date.now(),date:"",title:"Neue Etappe",from:prev.to||"",to:"Neues Ziel",plannedKm:0,plannedTime:"",lat:Number(prev.lat||0),lon:Number(prev.lon||0),overnight:"",notes:""};activeTrip.legs.push(l);save();renderPlanning();editLeg(l.id);};
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

function resetMaps(){miniMap=null;map=null;plannedLayer=null;drivenLayer=null;liveLayer=null;liveMarker=null;$("miniMap").innerHTML="";$("map").innerHTML="";}
function initMiniMap(){if(miniMap)return;miniMap=L.map("miniMap",{zoomControl:false,attributionControl:false}).setView([46,3],5);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(miniMap);drawStraightRoute(miniMap);}
function initMap(){if(map){map.invalidateSize();return;}map=L.map("map").setView([46,3],5);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);$("routeMode").value=activeTrip.routeMode||"osrm";$("orsApiKey").value=activeTrip.orsApiKey||"";drawStraightRoute(map);drawTracks(map);setTimeout(()=>buildRoadRoute(false),200);}
function routePoints(){return activeTrip.legs.map(l=>({lat:Number(l.lat),lon:Number(l.lon),title:l.title})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&p.lat&&p.lon);}
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
init();
