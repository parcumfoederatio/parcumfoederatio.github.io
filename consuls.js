import { auth, db, $, esc, message, erreurFr, numero, dateFr, COULEURS, ROLES, MAX_SPARCS } from "./parcum.js?v=6";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, onSnapshot, collection, query, where, orderBy, limit, writeBatch, updateDoc, addDoc, deleteDoc, serverTimestamp, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let uid = null, moi = null, users = [];
const prochainNo = () => Math.max(0, ...users.map(u => Number(u.citoyenNo) || 0)) + 1;
const pseudoDe = id => users.find(u => u.id === id)?.pseudo || "?";

onAuthStateChanged(auth, async user => {
  if (!user) return location.href = "connexion.html" + location.search;
  uid = user.uid;
  const s = await getDoc(doc(db, "users", uid));
  moi = s.data();
  if (!moi || moi.role !== "consul") { $("#refus").hidden = false; return; }
  $("#espace").hidden = false;
  onSnapshot(collection(db, "users"), snap => { users = snap.docs.map(d => ({ id: d.id, ...d.data() })); afficherRegistre(); afficherEconomie(); });
  onSnapshot(query(collection(db, "demandes"), where("statut", "==", "en attente")), afficherDemandes);
  onSnapshot(collection(db, "brouillons"), afficherBrouillons);
  onSnapshot(query(collection(db, "transactions"), orderBy("date", "desc"), limit(30)), afficherTx);
});

document.querySelectorAll(".onglet").forEach(b => b.onclick = () => {
  document.querySelectorAll(".onglet").forEach(x => x.classList.toggle("on", x === b));
  document.querySelectorAll(".panneau").forEach(p => p.hidden = p.id !== b.dataset.v);
});

// ---------- Demandes de citoyenneté ----------
let demandes = [];
function afficherDemandes(snap) {
  demandes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  $("#nb-demandes").textContent = demandes.length || "";
  $("#demandes").innerHTML = demandes.length ? demandes.map(d => {
    const signe = d.signatures.includes(uid);
    return `<div class="bloc"><h3>${esc(d.nomComplet)} <small>(${esc(d.pseudo)})</small></h3>
      <p>Arrivée sur le territoire : ${esc(d.dateArrivee) || "—"} · Témoin : ${esc(d.temoin)}<br>Envoyée le ${dateFr(d.creeLe)}</p>
      <div class="barre-prog"><span style="width:${d.signatures.length * 20}%"></span></div>
      <p><b>${d.signatures.length} / 5</b> signatures${d.signatures.length ? " : " + d.signatures.map(s => esc(pseudoDe(s))).join(", ") : ""}</p>
      <div class="actions">${signe ? '<span class="tag sans">Tu as signé ✓</span>' : `<button class="btn" data-signer="${d.id}">Signer</button>`}
      <button class="btn danger" data-veto="${d.id}">Veto</button></div></div>`;
  }).join("") : '<p class="vide">Aucune demande en attente.</p>';
  document.querySelectorAll("[data-signer]").forEach(b => b.onclick = () => signer(b.dataset.signer));
  document.querySelectorAll("[data-veto]").forEach(b => b.onclick = () => veto(b.dataset.veto));
}

async function signer(id) {
  const d = demandes.find(x => x.id === id); if (!d) return;
  try {
    const batch = writeBatch(db);
    if (d.signatures.length + 1 >= 5) {
      const prochain = prochainNo();
      batch.update(doc(db, "demandes", id), { signatures: arrayUnion(uid), statut: "acceptee" });
      batch.update(doc(db, "users", id), { role: "citoyen", citoyenNo: prochain });
    } else batch.update(doc(db, "demandes", id), { signatures: arrayUnion(uid) });
    await batch.commit();
  } catch (e) { message($("#msg-demandes"), erreurFr(e), "erreur"); }
}
async function veto(id) {
  if (!confirmer("Mettre ton veto sur cette demande ? Elle sera refusée.")) return;
  try { await updateDoc(doc(db, "demandes", id), { statut: "refusee", veto: uid }); }
  catch (e) { message($("#msg-demandes"), erreurFr(e), "erreur"); }
}
function confirmer(t) { try { return window.confirm(t); } catch { return true; } }

// ---------- Registre ----------
function afficherRegistre() {
  const liste = [...users].sort((a, b) => (a.citoyenNo ?? 9999) - (b.citoyenNo ?? 9999) || a.pseudo.localeCompare(b.pseudo));
  $("#registre").innerHTML = liste.map(u => `<tr>
    <td><b>${esc(u.pseudo)}</b><br>${moi.chef ? `<small>PF-</small><input class="no" type="number" min="1" step="1" value="${u.citoyenNo ?? ""}" data-no="${u.id}">` : `<small>${numero(u.citoyenNo)}</small>`}</td>
    <td><select data-role="${u.id}" ${u.id === uid || !moi.chef ? "disabled" : ""}>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${u.role === k ? "selected" : ""}>${v}</option>`).join("")}</select></td>
    <td><select data-couleur="${u.id}"><option value="">—</option>${Object.keys(COULEURS).map(c => `<option ${u.couleur === c ? "selected" : ""}>${c}</option>`).join("")}</select></td>
    <td>${u.role === "citoyen" ? u.sparcs + " §" : "—"}</td></tr>`).join("");
  document.querySelectorAll("[data-role]").forEach(s => s.onchange = () => {
    const u = users.find(x => x.id === s.dataset.role);
    if (!confirmer(`Changer le statut de ${u?.pseudo} en « ${ROLES[s.value]} » ?`)) { s.value = u?.role; return; }
    changer(s.dataset.role, { role: s.value }, s.value === "citoyen");
  });
  document.querySelectorAll("[data-no]").forEach(i => i.onchange = () => {
    const v = i.value === "" ? null : parseInt(i.value, 10);
    if (v != null && !(v > 0)) return message($("#msg-registre"), "Le numéro doit être un entier plus grand que 0.", "erreur");
    const pris = users.find(x => x.id !== i.dataset.no && Number(x.citoyenNo) === v);
    if (v != null && pris) { i.value = users.find(x => x.id === i.dataset.no)?.citoyenNo ?? ""; return message($("#msg-registre"), `Le numéro ${numero(v)} appartient déjà à ${pris.pseudo}.`, "erreur"); }
    changer(i.dataset.no, { citoyenNo: v });
  });
  document.querySelectorAll("[data-couleur]").forEach(s => s.onchange = () => changer(s.dataset.couleur, { couleur: s.value || null }));
  $("#e-a").innerHTML = '<option value="">Choisir un citoyen…</option>' + liste.filter(u => u.role === "citoyen").map(u => `<option value="${u.id}">${esc(u.pseudo)} (${numero(u.citoyenNo)}) — ${u.sparcs} §</option>`).join("");
}
async function changer(id, champs, devientCitoyen) {
  if (champs.role && !moi.chef) return message($("#msg-registre"), "Seul le Consul fondateur peut changer les statuts.", "erreur");
  const u = users.find(x => x.id === id);
  if (devientCitoyen && u && u.citoyenNo == null) champs.citoyenNo = prochainNo();
  if (champs.role && champs.role !== "citoyen" && u?.sparcs) champs.sparcs = 0; // seuls les citoyens détiennent des Sparcs
  try { await updateDoc(doc(db, "users", id), champs); message($("#msg-registre"), "Modifié.", "ok"); }
  catch (e) { message($("#msg-registre"), erreurFr(e), "erreur"); }
}

// ---------- Économie ----------
const circulation = () => users.filter(u => u.role === "citoyen").reduce((s, u) => s + (u.sparcs || 0), 0);
function afficherEconomie() {
  const c = circulation();
  $("#circ").textContent = `${c} / ${MAX_SPARCS} §`;
  $("#circ-barre").style.width = Math.min(100, c / MAX_SPARCS * 100) + "%";
}
$("#f-emission").onsubmit = async e => {
  e.preventDefault();
  const a = $("#e-a").value, montant = parseInt($("#e-montant").value, 10), motif = $("#e-motif").value.trim().slice(0, 80);
  const u = users.find(x => x.id === a);
  if (!u) return message($("#msg-eco"), "Choisis un citoyen.", "erreur");
  if (!montant) return message($("#msg-eco"), "Le montant doit être un entier (négatif pour retirer).", "erreur");
  if (circulation() + montant > MAX_SPARCS) return message($("#msg-eco"), `Impossible : il ne peut pas y avoir plus de ${MAX_SPARCS} Sparcs en circulation (Décret n°030).`, "erreur");
  if (u.sparcs + montant < 0) return message($("#msg-eco"), "Ce citoyen n'a pas assez de Sparcs.", "erreur");
  try {
    const batch = writeBatch(db), refTx = doc(collection(db, "transactions"));
    batch.set(refTx, { de: "etat", a, montant, date: serverTimestamp(), deP: "État (Société d'État)", aP: u.pseudo, motif });
    batch.update(doc(db, "users", a), { sparcs: u.sparcs + montant });
    await batch.commit();
    message($("#msg-eco"), `${montant > 0 ? "Versé" : "Retiré"} : ${Math.abs(montant)} § à ${u.pseudo}.`, "ok"); e.target.reset();
  } catch (err) { message($("#msg-eco"), erreurFr(err), "erreur"); }
};
function afficherTx(snap) {
  $("#tx").innerHTML = snap.docs.length ? snap.docs.map(d => { const t = d.data();
    return `<li><span class="${t.montant < 0 ? "moins" : "plus"}">${t.montant} §</span><span>${esc(t.deP)} → ${esc(t.aP)}${t.motif ? " · " + esc(t.motif) : ""}</span><small>${dateFr(t.date)}</small></li>`; }).join("")
    : '<li class="vide">Aucune transaction.</li>';
}

// ---------- Brouillons et votes ----------
function afficherBrouillons(snap) {
  const b = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((x, y) => (y.creeLe?.seconds || 0) - (x.creeLe?.seconds || 0));
  $("#brouillons").innerHTML = b.length ? b.map(x => {
    const v = Object.values(x.votes || {}), pour = v.filter(y => y === "pour").length, contre = v.filter(y => y === "contre").length;
    const mien = x.votes?.[uid], auteur = x.auteur === uid;
    return `<div class="bloc"><span class="tag sans">${x.statut === "ouvert" ? "Vote en cours" : x.statut === "adopte" ? "Adopté ✓" : "Rejeté"}</span>
      <h3>${esc(x.titre)}</h3><p class="contenu">${esc(x.contenu).replace(/\n/g, "<br>")}</p>
      <p><small>Proposé par ${esc(x.auteurP)} · ${dateFr(x.creeLe)}</small></p>
      <p><b>Pour : ${pour}</b> · <b>Contre : ${contre}</b> · Majorité : 3 Consuls sur 5</p>
      <div class="actions">${x.statut === "ouvert" ? `<button class="btn ${mien === "pour" ? "" : "sec"}" data-vote="${x.id}" data-v="pour">Pour</button>
      <button class="btn ${mien === "contre" ? "danger" : "sec"}" data-vote="${x.id}" data-v="contre">Contre</button>` : ""}
      ${auteur && x.statut === "ouvert" ? `<button class="btn sec" data-statut="${x.id}" data-s="adopte">Marquer adopté</button><button class="btn sec" data-statut="${x.id}" data-s="rejete">Marquer rejeté</button>` : ""}
      ${auteur ? `<button class="btn danger" data-suppr="${x.id}">Supprimer</button>` : ""}</div></div>`;
  }).join("") : '<p class="vide">Aucun brouillon.</p>';
  document.querySelectorAll("[data-vote]").forEach(btn => btn.onclick = () => updateDoc(doc(db, "brouillons", btn.dataset.vote), { ["votes." + uid]: btn.dataset.v }).catch(e => message($("#msg-brouillons"), erreurFr(e), "erreur")));
  document.querySelectorAll("[data-statut]").forEach(btn => btn.onclick = () => updateDoc(doc(db, "brouillons", btn.dataset.statut), { statut: btn.dataset.s }).catch(e => message($("#msg-brouillons"), erreurFr(e), "erreur")));
  document.querySelectorAll("[data-suppr]").forEach(btn => btn.onclick = () => confirmer("Supprimer ce brouillon ?") && deleteDoc(doc(db, "brouillons", btn.dataset.suppr)).catch(e => message($("#msg-brouillons"), erreurFr(e), "erreur")));
}
$("#f-brouillon").onsubmit = async e => {
  e.preventDefault();
  try {
    await addDoc(collection(db, "brouillons"), { titre: $("#b-titre").value.trim(), contenu: $("#b-contenu").value.trim(), auteur: uid, auteurP: moi.pseudo, creeLe: serverTimestamp(), votes: {}, statut: "ouvert" });
    e.target.reset(); message($("#msg-brouillons"), "Brouillon proposé au Conseil.", "ok");
  } catch (err) { message($("#msg-brouillons"), erreurFr(err), "erreur"); }
};
