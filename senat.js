import { auth, db, $, esc, message, erreurFr, dateFr, nomOfficiel, PROVINCES, TERRITOIRES, estSenateurVotant } from "./parcum.js?v=8";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let uid = null, moi = null, users = [], lois = [], presidence = {}, vue = "senat";
const nomDe = id => nomOfficiel(users.find(u => u.id === id));
const votants = () => users.filter(estSenateurVotant);
const confirmer = t => { try { return window.confirm(t); } catch { return true; } };
const erreur = (el, e) => message($(el), erreurFr(e), "erreur");

onAuthStateChanged(auth, user => {
  if (!user) return location.href = "connexion.html";
  uid = user.uid;
  onSnapshot(collection(db, "users"), s => {
    users = s.docs.map(d => ({ id: d.id, ...d.data() }));
    moi = users.find(u => u.id === uid) || null;
    $("#chargement").hidden = true; $("#espace").hidden = false;
    tout();
  }, e => erreur("#chargement", e));
  onSnapshot(doc(db, "senat", "presidence"), s => { presidence = s.exists() ? s.data() : {}; tout(); }, () => {});
  onSnapshot(collection(db, "lois"), s => { lois = s.docs.map(d => ({ id: d.id, ...d.data() })); afficherLois(); }, e => erreur("#msg-lois", e));
});

function tout() { if (!moi) return; afficherComposition(); afficherProposer(); afficherLois(); }

// ---------- Présidence ----------
function president() {
  const ids = votants().map(u => u.id), compte = {};
  Object.entries(presidence.votes || {}).forEach(([qui, pour]) => { if (ids.includes(qui) && ids.includes(pour)) compte[pour] = (compte[pour] || 0) + 1; });
  const tri = Object.entries(compte).sort((a, b) => b[1] - a[1]);
  if (!tri.length || (tri[1] && tri[1][1] === tri[0][1])) return null; // personne ou égalité
  return tri[0][0];
}

// ---------- Composition ----------
function afficherComposition() {
  const pres = president();
  $("#presidence").innerHTML = pres ? `Président du Sénat : <b>${esc(nomDe(pres))}</b>` : "Président du Sénat : aucun pour l'instant (pas encore élu ou égalité).";
  const ligne = (p, obs) => {
    const s = users.filter(u => u.senat === p);
    return `<tr><td>${esc(p)}${obs ? ' <small>(territoire)</small>' : ""}</td><td>${s.length ? s.map(u => `<b>${esc(nomOfficiel(u))}</b>${obs ? " · observateur" : ""}${u.id === pres ? " · président" : ""}`).join("<br>") : '<span class="vide">Siège vacant</span>'}</td></tr>`;
  };
  $("#sieges").innerHTML = PROVINCES.map(p => ligne(p, false)).join("") + TERRITOIRES.map(p => ligne(p, true)).join("");
  const peutVoter = estSenateurVotant(moi);
  $("#z-election").hidden = !peutVoter;
  if (peutVoter) {
    const choix = presidence.votes?.[uid] || "";
    $("#e-candidat").innerHTML = '<option value="">Choisir un sénateur…</option>' + votants().map(u => `<option value="${u.id}" ${u.id === choix ? "selected" : ""}>${esc(nomOfficiel(u))} (${esc(u.senat)})</option>`).join("");
  }
}
$("#f-election").onsubmit = async e => {
  e.preventDefault();
  const c = $("#e-candidat").value;
  if (!c) return message($("#msg-election"), "Choisis un sénateur.", "erreur");
  try { await setDoc(doc(db, "senat", "presidence"), { votes: { [uid]: c } }, { merge: true }); message($("#msg-election"), "Vote enregistré.", "ok"); }
  catch (err) { erreur("#msg-election", err); }
};

// ---------- Proposer ----------
function afficherProposer() {
  const senateur = !!moi.senat, votant = estSenateurVotant(moi);
  $("#z-proposer").hidden = !senateur;
  if (!senateur) return;
  document.querySelector('[data-f="f-loi"]').hidden = !votant;
  if (!votant) basculer("f-acte");
  $("#a-province").textContent = `L'acte s'applique seulement à ${moi.senat}. Il entre en vigueur tout de suite, mais le Conseil du MMT peut l'annuler.`;
}
function basculer(id) {
  document.querySelectorAll("[data-f]").forEach(b => b.classList.toggle("on", b.dataset.f === id));
  $("#f-loi").hidden = id !== "f-loi"; $("#f-acte").hidden = id !== "f-acte";
}
document.querySelectorAll("[data-f]").forEach(b => b.onclick = () => basculer(b.dataset.f));

const base = () => ({ auteur: uid, auteurP: nomOfficiel(moi), creeLe: serverTimestamp(), votesSenat: {}, votesConseil: {} });
$("#f-loi").onsubmit = async e => {
  e.preventDefault();
  try {
    await addDoc(collection(db, "lois"), { ...base(), type: "loi", province: null, titre: $("#l-titre").value.trim(), contenu: $("#l-contenu").value.trim(), statut: "senat" });
    e.target.reset(); message($("#msg-proposer"), "Loi soumise au vote du Sénat.", "ok"); choisirVue("senat");
  } catch (err) { erreur("#msg-proposer", err); }
};
$("#f-acte").onsubmit = async e => {
  e.preventDefault();
  try {
    await addDoc(collection(db, "lois"), { ...base(), type: "acte", province: moi.senat, titre: $("#a-titre").value.trim(), contenu: $("#a-contenu").value.trim(), statut: "en vigueur" });
    e.target.reset(); message($("#msg-proposer"), "Acte provincial en vigueur.", "ok"); choisirVue("actes");
  } catch (err) { erreur("#msg-proposer", err); }
};

// ---------- Lois ----------
function choisirVue(v) {
  vue = v;
  document.querySelectorAll("#filtres .onglet").forEach(b => b.classList.toggle("on", b.dataset.v === v));
  afficherLois();
}
document.querySelectorAll("#filtres .onglet").forEach(b => b.onclick = () => choisirVue(b.dataset.v));

const compter = v => { const t = Object.values(v || {}); return { pour: t.filter(x => x === "pour").length, contre: t.filter(x => x === "contre").length }; };
const ETIQ = { senat: "Vote au Sénat", conseil: "Au Conseil du MMT", adoptee: "Adoptée ✓ (devient un décret)", rejetee: "Rejetée", "en vigueur": "En vigueur", annule: "Annulé par le Conseil" };

function afficherLois() {
  if (!moi) return;
  const lst = lois.filter(l => l.type === "loi");
  $("#nb-senat").textContent = lst.filter(l => l.statut === "senat").length || "";
  $("#nb-conseil").textContent = lst.filter(l => l.statut === "conseil").length || "";
  const choix = vue === "actes" ? lois.filter(l => l.type === "acte")
    : vue === "fini" ? lst.filter(l => ["adoptee", "rejetee"].includes(l.statut))
    : lst.filter(l => l.statut === vue);
  choix.sort((a, b) => (b.creeLe?.seconds || 0) - (a.creeLe?.seconds || 0));
  $("#lois").innerHTML = choix.length ? choix.map(bloc).join("") : '<p class="vide sans">Rien ici pour l\'instant.</p>';
  brancher();
}

function bloc(l) {
  const consul = moi.role === "consul", nb = votants().length;
  const s = compter(l.votesSenat), c = compter(l.votesConseil);
  const monS = l.votesSenat?.[uid], monC = l.votesConseil?.[uid];
  let h = `<div class="bloc"><span class="tag sans">${ETIQ[l.statut] || l.statut}</span>
    <h3>${esc(l.titre)}${l.province ? ` <small>· ${esc(l.province)}</small>` : ""}</h3>
    <div data-texte="${l.id}"><p class="contenu">${esc(l.contenu).replace(/\n/g, "<br>")}</p></div>
    <p class="sans"><small>Proposé par ${esc(l.auteurP)} · ${dateFr(l.creeLe)}</small></p>`;
  if (l.type === "loi") {
    h += `<p class="sans">Sénat : <b>Pour ${s.pour}</b> · <b>Contre ${s.contre}</b> · majorité : plus de la moitié des ${nb} sénateur${nb > 1 ? "s" : ""}</p>`;
    if (Object.keys(l.votesSenat || {}).length) h += `<p class="qui-vote sans">${Object.entries(l.votesSenat).map(([id, v]) => `${v === "pour" ? "✅" : "❌"} ${esc(nomDe(id))}`).join(" · ")}</p>`;
    if (l.statut !== "senat") h += `<p class="sans">Conseil du MMT : <b>Pour ${c.pour}</b> · <b>Contre ${c.contre}</b> · majorité : 3 Consuls sur 5</p>`;
    if (moi.chef && Object.keys(l.votesConseil || {}).length) h += `<div class="qui-vote sans"><b>Qui a voté au Conseil</b> (visible seulement par toi) : ${Object.entries(l.votesConseil).map(([id, v]) => `${v === "pour" ? "✅" : "❌"} ${esc(nomDe(id))}`).join(" · ")}</div>`;
  }
  h += '<div class="actions sans">';
  if (l.statut === "senat" && estSenateurVotant(moi)) {
    h += `<button class="btn ${monS === "pour" ? "" : "sec"}" data-vs="${l.id}" data-v="pour">Pour</button><button class="btn ${monS === "contre" ? "danger" : "sec"}" data-vs="${l.id}" data-v="contre">Contre</button>`;
    if (monS) h += `<span class="mini">Tu as voté ${monS}. Tu peux changer tant que le vote n'est pas fini.</span>`;
  }
  if (l.statut === "conseil" && consul) {
    h += `<button class="btn ${monC === "pour" ? "" : "sec"}" data-vc="${l.id}" data-v="pour">Pour</button><button class="btn ${monC === "contre" ? "danger" : "sec"}" data-vc="${l.id}" data-v="contre">Contre</button><button class="btn sec" data-modif="${l.id}">Modifier le texte</button>`;
    if (monC) h += `<span class="mini">Tu as voté ${monC}. Tu peux changer tant que la loi n'est pas passée.</span>`;
  }
  if (l.type === "acte" && l.statut === "en vigueur" && consul) h += `<button class="btn danger" data-annuler="${l.id}">Annuler l'acte</button>`;
  if (l.auteur === uid && (l.statut === "senat" || l.type === "acte")) h += `<button class="btn danger" data-suppr="${l.id}">Retirer</button>`;
  return h + "</div></div>";
}

function brancher() {
  document.querySelectorAll("[data-vs]").forEach(b => b.onclick = () => voterSenat(b.dataset.vs, b.dataset.v));
  document.querySelectorAll("[data-vc]").forEach(b => b.onclick = () => voterConseil(b.dataset.vc, b.dataset.v));
  document.querySelectorAll("[data-annuler]").forEach(b => b.onclick = () => confirmer("Annuler cet acte provincial ?") && updateDoc(doc(db, "lois", b.dataset.annuler), { statut: "annule" }).catch(e => erreur("#msg-lois", e)));
  document.querySelectorAll("[data-suppr]").forEach(b => b.onclick = () => confirmer("Retirer ce texte ?") && deleteDoc(doc(db, "lois", b.dataset.suppr)).catch(e => erreur("#msg-lois", e)));
  document.querySelectorAll("[data-modif]").forEach(b => b.onclick = () => modifier(b.dataset.modif));
}

async function voterSenat(id, v) {
  const l = lois.find(x => x.id === id); if (!l) return;
  const votes = { ...(l.votesSenat || {}), [uid]: v }, ids = votants().map(u => u.id);
  const valides = Object.fromEntries(Object.entries(votes).filter(([k]) => ids.includes(k)));
  const { pour, contre } = compter(valides), nb = ids.length;
  let statut = "senat";
  if (pour > nb / 2) statut = "conseil";
  else if (contre > nb / 2) statut = "rejetee";
  else if (pour + contre === nb && pour === contre) { // égalité : le président tranche
    const p = president();
    if (p && valides[p]) statut = valides[p] === "pour" ? "conseil" : "rejetee";
  }
  try {
    await updateDoc(doc(db, "lois", id), { ["votesSenat." + uid]: v, statut });
    if (statut === "conseil") message($("#msg-lois"), "Le Sénat a adopté la loi : elle passe au Conseil du MMT.", "ok");
    if (statut === "rejetee") message($("#msg-lois"), "Le Sénat a rejeté la loi.", "info");
    if (pour + contre === nb && pour === contre && statut === "senat") message($("#msg-lois"), "Égalité : il faut que le président du Sénat vote (ou qu'il soit élu).", "info");
  } catch (e) { erreur("#msg-lois", e); }
}

async function voterConseil(id, v) {
  const l = lois.find(x => x.id === id); if (!l) return;
  const { pour, contre } = compter({ ...(l.votesConseil || {}), [uid]: v });
  const champs = { ["votesConseil." + uid]: v };
  if (pour >= 3) { champs.statut = "adoptee"; champs.adopteeLe = serverTimestamp(); }
  else if (contre >= 3) champs.statut = "rejetee";
  try { await updateDoc(doc(db, "lois", id), champs); if (champs.statut === "adoptee") message($("#msg-lois"), "Loi adoptée par le Conseil : elle devient un décret.", "ok"); }
  catch (e) { erreur("#msg-lois", e); }
}

function modifier(id) {
  const l = lois.find(x => x.id === id), z = document.querySelector(`[data-texte="${id}"]`); if (!l || !z) return;
  z.innerHTML = `<form class="formu sans" style="max-width:none;margin:10px 0"><label>Titre<input maxlength="120" required value="${esc(l.titre)}"></label><label>Contenu<textarea maxlength="8000" required>${esc(l.contenu)}</textarea></label><div class="actions"><button class="btn" type="submit">Enregistrer</button><button class="btn sec" type="button">Annuler</button></div></form>`;
  const f = z.querySelector("form");
  f.querySelector('button[type="button"]').onclick = afficherLois;
  f.onsubmit = async e => {
    e.preventDefault();
    try { await updateDoc(doc(db, "lois", id), { titre: f.querySelector("input").value.trim(), contenu: f.querySelector("textarea").value.trim(), modifieeParConseil: true }); }
    catch (err) { erreur("#msg-lois", err); }
  };
}
