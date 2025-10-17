// CSVXiPhone5splus — iOS 8.4.1 compat (ES5)

// Stato
var listino = [];
var articoliAggiunti = [];
var autoPopolaCosti = true;
var mostraDettagliServizi = true;

function roundTwo(n){ return Math.round(n*100)/100; }

// --- CSV parser minimale ES5 ---
// Supporta delimitatore "," o ";" (auto-detect), virgolette "..." e \n / \r\n.
function parseCSV(text){
  var delim = (text.indexOf(";\n")>-1 || text.indexOf(";")>-1) ? ";" : ",";
  var rows = [];
  var i=0, cur="", inQuotes=false, row=[];
  while(i<text.length){
    var ch = text.charAt(i);
    if(ch === '"'){
      if(inQuotes && text.charAt(i+1) === '"'){ cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if(ch === delim && !inQuotes){
      row.push(cur); cur="";
    } else if((ch === '\n' || ch === '\r') && !inQuotes){
      if(cur !== "" || row.length){ row.push(cur); rows.push(row); row=[]; cur=""; }
      // gestisci \r\n
      if(ch === '\r' && text.charAt(i+1)==='\n'){ i++; }
    } else {
      cur += ch;
    }
    i++;
  }
  if(cur !== "" || row.length){ row.push(cur); rows.push(row); }

  if(!rows.length) return {header:[], data:[]};

  // Prima riga = header
  var header = rows[0];
  var data = [];
  for(var r=1; r<rows.length; r++){
    if(rows[r].length===1 && rows[r][0]==="") continue;
    var obj = {};
    for(var c=0; c<header.length; c++){
      obj[header[c]] = rows[r][c] != null ? rows[r][c] : "";
    }
    data.push(obj);
  }
  return {header: header, data: data};
}

// --- Helpers DOM ---
function byId(id){ return document.getElementById(id); }
function createEl(tag){ return document.createElement(tag); }

// --- Init ---
document.addEventListener("DOMContentLoaded", function(){
  byId("csvFileInput").addEventListener("change", handleCSVUpload, false);
  byId("searchListino").addEventListener("input", aggiornaListinoSelect, false);
  byId("btnAddFromListino").addEventListener("click", aggiungiArticoloDaListino, false);
  byId("btnManual").addEventListener("click", mostraFormArticoloManuale, false);

  byId("toggleCosti").addEventListener("change", function(){
    autoPopolaCosti = byId("toggleCosti").checked;
    var second = byId("toggleMostraServizi");
    second.disabled = !autoPopolaCosti;
    mostraDettagliServizi = second.checked;

    // Risincronizza costi con listino originale solo se possibile
    for(var i=0;i<articoliAggiunti.length;i++){
      var a = articoliAggiunti[i];
      if(!autoPopolaCosti){
        a.costoTrasporto = 0;
        a.costoInstallazione = 0;
      } else {
        // prova a ritrovare nel listino
        var j, base=null;
        for(j=0;j<listino.length;j++){
          if(listino[j].codice === a.codice){ base = listino[j]; break; }
        }
        if(base){
          a.costoTrasporto = base.costoTrasporto || 0;
          a.costoInstallazione = base.costoInstallazione || 0;
        }
      }
    }
    aggiornaTabellaArticoli();
    aggiornaTotaliGenerali();
  }, false);

  byId("toggleMostraServizi").addEventListener("change", function(){
    mostraDettagliServizi = byId("toggleMostraServizi").checked;
  }, false);

  byId("btnWA").addEventListener("click", inviaReportWhatsApp, false);
  byId("btnTXT").addEventListener("click", generaTXTReport, false);
  byId("btnWAnm").addEventListener("click", inviaReportWhatsAppSenzaMargine, false);
  byId("btnTXTnm").addEventListener("click", generaTXTReportSenzaMargine, false);
});

// --- Caricamento CSV (FileReader) ---
function handleCSVUpload(evt){
  var file = evt.target.files[0];
  if(!file){ return; }
  var reader = new FileReader();
  reader.onload = function(e){
    try{
      var parsed = parseCSV(e.target.result);
      if(!parsed.data || !parsed.data.length){ byId("csvError").style.display="block"; return; }

      listino = [];
      for(var i=0;i<parsed.data.length;i++){
        var row = parsed.data[i];
        var get = function(k){ return (row[k]||"").replace(/\s+$/,""); };

        var prezzoLordo = parseFloat((get("PrezzoLordo")||"0").replace(",", ".")) || 0;
        var cTr = parseFloat((get("CostoTrasporto")||"0").replace(",", ".")) || 0;
        var cInst = parseFloat((get("CostoInstallazione")||"0").replace(",", ".")) || 0;

        listino.push({
          codice: (get("Codice") || "").trim(),
          descrizione: (get("Descrizione") || "").trim(),
          prezzoLordo: prezzoLordo,
          sconto: 0,
          sconto2: 0,
          margine: 0,
          costoTrasporto: cTr,
          costoInstallazione: cInst,
          quantita: 1
        });
      }
      aggiornaListinoSelect();
      byId("csvError").style.display="none";
    }catch(err){
      byId("csvError").style.display="block";
    }
  };
  reader.onerror = function(){ byId("csvError").style.display="block"; };
  reader.readAsText(file);
}

// --- UI Listino ---
function aggiornaListinoSelect(){
  var select = byId("listinoSelect");
  var search = (byId("searchListino").value || "").toLowerCase();
  while(select.firstChild){ select.removeChild(select.firstChild); }

  for(var i=0;i<listino.length;i++){
    var item = listino[i];
    var testo = (item.codice+" - "+item.descrizione).toLowerCase();
    if(testo.indexOf(search) > -1){
      var opt = createEl("option");
      opt.value = item.codice;
      opt.appendChild(document.createTextNode(item.codice+" - "+item.descrizione+" - €"+item.prezzoLordo));
      select.appendChild(opt);
    }
  }
}

function trovaInListino(codice){
  for(var i=0;i<listino.length;i++){
    if(listino[i].codice === codice) return listino[i];
  }
  return null;
}

function aggiungiArticoloDaListino(){
  var select = byId("listinoSelect");
  if(!select.value){ return; }
  var base = trovaInListino(select.value);
  if(!base){ alert("Errore: articolo non trovato nel listino."); return; }

  var nuovo = {
    codice: base.codice,
    descrizione: base.descrizione,
    prezzoLordo: base.prezzoLordo,
    sconto: 0,
    sconto2: 0,
    margine: 0,
    costoTrasporto: autoPopolaCosti ? (base.costoTrasporto||0) : 0,
    costoInstallazione: autoPopolaCosti ? (base.costoInstallazione||0) : 0,
    quantita: 1,
    venduto: 0
  };
  articoliAggiunti.push(nuovo);
  aggiornaTabellaArticoli();
  aggiornaTotaliGenerali();
}

// --- Tabella articoli ---
function inputNum(val){ return (typeof val==="number" && !isNaN(val)) ? val : 0; }

function aggiornaTabellaArticoli(){
  var tbody = document.querySelector("#articoli-table tbody");
  while(tbody.firstChild){ tbody.removeChild(tbody.firstChild); }

  for(var i=0;i<articoliAggiunti.length;i++){
    var a = articoliAggiunti[i];

    var s1 = inputNum(a.sconto);
    var s2 = inputNum(a.sconto2);
    var prezzoScontato = a.prezzoLordo * (1 - s1/100) * (1 - s2/100);
    var totale = roundTwo(prezzoScontato);

    var m = inputNum(a.margine);
    var conMargine = roundTwo(totale / (1 - m/100));

    var granTot = (conMargine + inputNum(a.costoTrasporto) + inputNum(a.costoInstallazione)) * (a.quantita||1);
    var granTotFinal = roundTwo(granTot);

    var venduto = inputNum(a.venduto);
    var diff = roundTwo(venduto - granTotFinal);

    var tr = createEl("tr");

    tr.appendChild(tdTxt(a.codice));
    tr.appendChild(tdTxt(a.descrizione));
    tr.appendChild(tdTxt(a.prezzoLordo + "€"));

    tr.appendChild(tdInputNum(i,"sconto", s1));
    tr.appendChild(tdInputNum(i,"sconto2", s2));
    tr.appendChild(tdInputNum(i,"margine", a.margine||0));

    tr.appendChild(tdTxt(totale.toFixed(2)+"€"));
    tr.appendChild(tdInputNum(i,"costoTrasporto", a.costoTrasporto||0));
    tr.appendChild(tdInputNum(i,"costoInstallazione", a.costoInstallazione||0));
    tr.appendChild(tdInputNum(i,"quantita", a.quantita||1, 1));

    tr.appendChild(tdTxt(granTotFinal.toFixed(2)+"€"));
    tr.appendChild(tdInputNum(i,"venduto", venduto));
    tr.appendChild(tdTxt(diff.toFixed(2)+"€"));

    var tdAz = createEl("td");
    var btnRem = createEl("button");
    btnRem.appendChild(document.createTextNode("Rimuovi"));
    btnRem.setAttribute("data-index", i);
    btnRem.onclick = function(ev){
      var idx = parseInt(ev.target.getAttribute("data-index"),10);
      articoliAggiunti.splice(idx,1);
      aggiornaTabellaArticoli();
      aggiornaTotaliGenerali();
    };
    tdAz.appendChild(btnRem);
    tr.appendChild(tdAz);

    tbody.appendChild(tr);
  }
}

function tdTxt(t){ var td=createEl("td"); td.appendChild(document.createTextNode(t)); return td; }

function tdInputNum(index, field, value, minVal){
  var td = createEl("td");
  var inp = createEl("input");
  inp.type = "number";
  inp.value = value;
  if(minVal){ inp.min = String(minVal); }
  inp.setAttribute("data-index", index);
  inp.setAttribute("data-field", field);
  inp.oninput = aggiornaCampo;
  td.appendChild(inp);
  return td;
}

function aggiornaCampo(ev){
  var input = ev.target;
  var index = parseInt(input.getAttribute("data-index"),10);
  var field = input.getAttribute("data-field");
  var val = parseFloat(String(input.value).replace(",", ".")) || 0;

  if((field==="sconto"||field==="sconto2"||field==="margine") && val<0) val=0;
  if(field==="quantita" && val<1) val=1;

  articoliAggiunti[index][field] = val;
  aggiornaCalcoli(index);
  aggiornaTotaliGenerali();
}

function aggiornaCalcoli(index){
  var a = articoliAggiunti[index];

  var s1 = inputNum(a.sconto);
  var s2 = inputNum(a.sconto2);
  var totale = roundTwo(inputNum(a.prezzoLordo) * (1 - s1/100) * (1 - s2/100));
  var m = inputNum(a.margine);
  var conMargine = roundTwo(totale / (1 - m/100));
  var granTot = (conMargine + inputNum(a.costoTrasporto) + inputNum(a.costoInstallazione)) * (a.quantita||1);
  var granTotFinal = roundTwo(granTot);
  var venduto = inputNum(a.venduto);
  var diff = roundTwo(venduto - granTotFinal);

  var row = document.querySelector("#articoli-table tbody tr:nth-child("+(index+1)+")");
  if(row){
    row.cells[6].textContent = totale.toFixed(2)+"€";
    row.cells[10].textContent = granTotFinal.toFixed(2)+"€";
    row.cells[12].textContent = diff.toFixed(2)+"€";
  }
}

// --- Totali ---
function aggiornaTotaliGenerali(){
  var totNoServ = 0, totConServ = 0, totVend = 0, totDiff = 0;

  for(var i=0;i<articoliAggiunti.length;i++){
    var a = articoliAggiunti[i];
    var s1 = inputNum(a.sconto);
    var s2 = inputNum(a.sconto2);
    var t = roundTwo(inputNum(a.prezzoLordo) * (1 - s1/100) * (1 - s2/100));
    var m = inputNum(a.margine);
    var conM = roundTwo(t / (1 - m/100));
    var q = a.quantita||1;

    var gran = (conM + inputNum(a.costoTrasporto) + inputNum(a.costoInstallazione)) * q;
    var granF = roundTwo(gran);
    var vend = inputNum(a.venduto);
    var diff = vend - granF;

    totNoServ += conM * q;
    totConServ += granF;
    totVend += vend;
    totDiff += roundTwo(diff);
  }

  var holder = byId("totaleGenerale");
  var html = "<strong>Totale Netto (senza Trasporto/Installazione):</strong> "+totNoServ.toFixed(2)+"€<br>";
  html += "<strong>Totale Complessivo (inclusi Trasporto/Installazione):</strong> "+totConServ.toFixed(2)+"€<br>";
  html += "<strong>Totale Venduto:</strong> "+totVend.toFixed(2)+"€<br>";
  html += "<strong>Totale Differenza Sconto:</strong> "+totDiff.toFixed(2)+"€";
  holder.innerHTML = html;
}

// --- Aggiunta manuale ---
function mostraFormArticoloManuale(){
  var tbody = document.querySelector("#articoli-table tbody");
  if(byId("manual-input-row")) return;

  var tr = createEl("tr");
  tr.id = "manual-input-row";
  tr.innerHTML =
    '<td><input type="text" id="manualCodice" placeholder="Codice"></td>'+
    '<td><input type="text" id="manualDescrizione" placeholder="Descrizione"></td>'+
    '<td><input type="number" id="manualPrezzo" placeholder="€" step="0.01"></td>'+
    '<td><input type="number" id="manualSconto1" placeholder="%" value="0" step="0.01"></td>'+
    '<td><input type="number" id="manualSconto2" placeholder="%" value="0" step="0.01"></td>'+
    '<td><input type="number" id="manualMargine" placeholder="%" value="0" step="0.01"></td>'+
    '<td><span id="manualTotale">—</span></td>'+
    '<td><input type="number" id="manualTrasporto" placeholder="€" value="0" step="0.01"></td>'+
    '<td><input type="number" id="manualInstallazione" placeholder="€" value="0" step="0.01"></td>'+
    '<td><input type="number" id="manualQuantita" placeholder="1" value="1" min="1"></td>'+
    '<td><span id="manualGranTotale">—</span></td>'+
    '<td><input type="number" id="manualVenduto" placeholder="€" value="0" step="0.01"></td>'+
    '<td><span id="manualDifferenza">—</span></td>'+
    '<td><button id="btnOK">✅</button> <button id="btnKO">❌</button></td>';

  tbody.appendChild(tr);

  var ids = ["manualPrezzo","manualSconto1","manualSconto2","manualMargine","manualTrasporto","manualInstallazione","manualQuantita","manualVenduto"];
  for(var i=0;i<ids.length;i++){
    byId(ids[i]).addEventListener("input", calcolaRigaManuale, false);
  }
  byId("btnOK").onclick = aggiungiArticoloManuale;
  byId("btnKO").onclick = annullaArticoloManuale;
}

function calcolaRigaManuale(){
  var prezzoLordo = parseFloat(byId("manualPrezzo").value)||0;
  var s1 = parseFloat(byId("manualSconto1").value)||0;
  var s2 = parseFloat(byId("manualSconto2").value)||0;
  var m = parseFloat(byId("manualMargine").value)||0;
  var trp = parseFloat(byId("manualTrasporto").value)||0;
  var inst = parseFloat(byId("manualInstallazione").value)||0;
  var q = parseInt(byId("manualQuantita").value,10)||1;
  var vend = parseFloat(byId("manualVenduto").value)||0;

  var scontato = roundTwo(prezzoLordo * (1 - s1/100) * (1 - s2/100));
  var conM = roundTwo(scontato / (1 - m/100));
  var gran = roundTwo((conM + trp + inst) * q);
  var diff = roundTwo(vend - gran);

  byId("manualTotale").textContent = scontato.toFixed(2)+"€";
  byId("manualGranTotale").textContent = gran.toFixed(2)+"€";
  byId("manualDifferenza").textContent = diff.toFixed(2)+"€";
}

function aggiungiArticoloManuale(){
  var nuovo = {
    codice: (byId("manualCodice").value||"").trim(),
    descrizione: (byId("manualDescrizione").value||"").trim(),
    prezzoLordo: parseFloat(byId("manualPrezzo").value)||0,
    sconto: parseFloat(byId("manualSconto1").value)||0,
    sconto2: parseFloat(byId("manualSconto2").value)||0,
    margine: parseFloat(byId("manualMargine").value)||0,
    costoTrasporto: parseFloat(byId("manualTrasporto").value)||0,
    costoInstallazione: parseFloat(byId("manualInstallazione").value)||0,
    quantita: parseInt(byId("manualQuantita").value,10)||1,
    venduto: parseFloat(byId("manualVenduto").value)||0
  };
  articoliAggiunti.push(nuovo);
  aggiornaTabellaArticoli();
  aggiornaTotaliGenerali();
  annullaArticoloManuale();
}

function annullaArticoloManuale(){
  var row = byId("manual-input-row");
  if(row && row.parentNode){ row.parentNode.removeChild(row); }
}

// --- Report (TXT + WhatsApp compat) ---
function generaReportTesto(includeMargine){
  var report = includeMargine ? "Report Articoli:\n\n" : "Report Articoli (senza Margine):\n\n";
  var totNoServ=0, totConServ=0, sommaDiff=0, totVend=0;

  var showServ = byId("toggleMostraServizi") && byId("toggleMostraServizi").checked;

  for(var i=0;i<articoliAggiunti.length;i++){
    var a = articoliAggiunti[i];
    var s1 = inputNum(a.sconto);
    var s2 = inputNum(a.sconto2);
    var q = a.quantita||1;

    var netto = roundTwo(inputNum(a.prezzoLordo) * (1 - s1/100) * (1 - s2/100));
    var lineaTot = 0;

    if(includeMargine){
      var m = inputNum(a.margine);
      var conM = roundTwo(netto / (1 - m/100));
      var gran = roundTwo((conM + inputNum(a.costoTrasporto) + inputNum(a.costoInstallazione)) * q);
      lineaTot = gran;

      totNoServ += conM * q;
      totConServ += gran;
      totVend += inputNum(a.venduto);
      sommaDiff += roundTwo(inputNum(a.venduto) - gran);
    } else {
      var gran2 = roundTwo((netto + inputNum(a.costoTrasporto) + inputNum(a.costoInstallazione)) * q);
      lineaTot = gran2;

      totNoServ += netto * q;
      totConServ += gran2;
      totVend += inputNum(a.venduto);
    }

    report += (i+1)+". Codice: "+a.codice+"\n";
    report += "Descrizione: "+a.descrizione+"\n";
    report += "Prezzo netto (dopo sconto): "+netto.toFixed(2)+"€\n";
    report += "Sconto 1: "+s1+"%\n";
    report += "Sconto 2: "+s2+"%\n";
    report += "Quantità: "+q+"\n";
    if(showServ && autoPopolaCosti){
      report += "Trasporto: "+inputNum(a.costoTrasporto)+"€\n";
      report += "Installazione: "+inputNum(a.costoInstallazione)+"€\n";
    }
    report += "Totale: "+lineaTot.toFixed(2)+"€\n";
    if(includeMargine){
      report += "Venduto A: "+inputNum(a.venduto).toFixed(2)+"€\n";
      report += "Differenza sconto: "+(inputNum(a.venduto)-lineaTot).toFixed(2)+"€\n";
    }
    report += "\n";
  }

  report += "Totale Netto (senza Trasporto/Installazione): "+totNoServ.toFixed(2)+"€\n";
  if(autoPopolaCosti){
    report += "Totale Complessivo (inclusi Trasporto/Installazione): "+totConServ.toFixed(2)+"€\n";
  }
  report += "Totale Venduto: "+totVend.toFixed(2)+"€\n";
  if(includeMargine){
    report += "Totale Differenza Sconto: "+sommaDiff.toFixed(2)+"€";
  }
  return report;
}

function openDataTextFile(filename, content){
  // iOS 8 non supporta il download attribute. Usiamo data URI.
  var uri = "data:text/plain;charset=utf-8," + encodeURIComponent(content);
  // Apri in una nuova scheda (in web app fullscreen potrebbe aprirsi in Safari)
  window.open(uri, "_blank");
}

function inviaReportWhatsApp(){
  var report = generaReportTesto(true);
  shareWhatsApp(report);
}
function generaTXTReport(){
  var report = generaReportTesto(true);
  openDataTextFile("report.txt", report);
}
function inviaReportWhatsAppSenzaMargine(){
  var report = generaReportTesto(false);
  shareWhatsApp(report);
}
function generaTXTReportSenzaMargine(){
  var report = generaReportTesto(false);
  openDataTextFile("report_senza_margine.txt", report);
}

function shareWhatsApp(text){
  // Schema app (preferibile su iOS 8)
  var appUrl = "whatsapp://send?text=" + encodeURIComponent(text);
  // Fallback web
  var webUrl = "https://api.whatsapp.com/send?text=" + encodeURIComponent(text);
  // Prova ad aprire schema app
  var t = setTimeout(function(){ window.open(webUrl, "_blank"); }, 800);
  window.location = appUrl;
}
