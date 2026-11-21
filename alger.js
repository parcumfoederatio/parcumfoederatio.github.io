// Marche d'Alger : l'Assemblée vote les décrets (le vote du Gouverneur compte double), le Gouverneur les publie
import { auth, db, $, suivreUsers, esc, message, erreurFr, dateFr, nomOfficiel, confirmer } from "./parcum.js?v=23";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, onSnapshot, collection, query, where, addDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let uid = null, moi = null, users = [], decrets = [], vue = "vote", lance = false;
const gouv = () => moi?.chef === true;
const membre = () => gouv() || moi?.assemblee === true;
const nomDe = id => nomOfficiel(users.find(u => u.id === id));
const ETIQ = { vote: "En vote", adopte: "Adopté, en attente de publication", rejete: "Rejeté", publie: "Publié" };

// Les décrets publiés sont visibles par tout le monde
onSnapshot(query(collection(db, "marche"), where("statut", "==", "publie")), q => {
  const p = q.docs.map(d => d.data()).sort((a, b) => (b.publieLe?.seconds || 0) - (a.publieLe?.seconds || 0));
  $("#publies").innerHTML = p.length ? p.map(x => `<details class="decret"><summary>Décret d'Alger n°${esc(x.numero)} — ${esc(x.titre)}</summary><div class="corps">${esc(x.contenu).split(/\n{2,}/).map(t => `<p>${t.replace(/\n/g, "<br>")}</p>`).join("")}<p class="note sans">Adopté par l'Assemblée d'Alger · publié le ${dateFr(x.publieLe)}.</p></div></details>`).join("") : '<p class="vide sans">Aucun décret publié pour l\'instant.</p>';
}, () => { $("#publies").innerHTML = '<p class="vide sans">Aucun décret publié pour l\'instant.</p>'; });

onAuthStateChanged(auth, user => {
  if (!user) return;
  uid = user.uid;
  suivreUsers(uid, liste => {
    users = liste;
    moi = users.find(u => u.id === uid) || null;
    afficherMembres();
    $("#z-vote").hidden = !membre();
    if (membre() && !lance) { lance = true; onSnapshot(collection(db, "marche"), q => { decrets = q.docs.map(d => ({ id: d.id, ...d.data() })); afficher(); }, e => message($("#msg-votes"), erreurFr(e), "erreur")); }
  });
});

// Voix : chaque membre a 1 voix, le Gouverneur en a 2
const membres = () => users.filter(u => u.assemblee === true && u.chef !== true);
const gouverneur = () => users.find(u => u.chef === true);
const totalVoix = () => membres().length + (gouverneur() ? 2 : 0);
const poids = id => users.find(u => u.id === id)?.chef === true ? 2 : 1;
function compter(votes) {
  const ok = new Set([...membres().map(u => u.id), gouverneur()?.id].filter(Boolean));
  let pour = 0, contre = 0;
  Object.entries(votes || {}).forEach(([id, v]) => { if (!ok.has(id)) return; v === "pour" ? pour += poids(id) : contre += poids(id); });
  return { pour, contre };
}
// Décret d'Alger n°001, art. 9 : en cas d'égalité, peu importe le nombre de membres, le Gouverneur tranche.
// Donc dès que le camp du Gouverneur atteint la moitié des voix, il ne peut plus perdre : le décret est tranché.
function decider(votes) {
  const { pour, contre } = compter(votes), total = totalVoix(), seuil = Math.floor(total / 2) + 1;
  const gv = gouverneur() ? (votes || {})[gouverneur().id] : undefined, moitie = total / 2;
  if (pour >= seuil) return "adopte";
  if (contre >= seuil) return "rejete";
  if (Number.isInteger(moitie) && gv === "pour" && pour >= moitie) return "adopte";
  if (Number.isInteger(moitie) && gv === "contre" && contre >= moitie) return "rejete";
  return "vote";
}

function afficherMembres() {
  $("#z-membres").hidden = false;
  const g = gouverneur();
  $("#membres").innerHTML = (g ? [`<b>${esc(nomOfficiel(g))}</b> · Gouverneur (2 voix)`] : []).concat(membres().map(u => `<b>${esc(nomOfficiel(u))}</b> · membre`)).join("<br>") || '<span class="vide">Aucun membre.</span>';
  $("#voix").textContent = `${totalVoix()} voix au total · un décret est adopté avec plus de la moitié des voix (${Math.floor(totalVoix() / 2) + 1}). En cas d'égalité, le Gouverneur tranche (Décret d'Alger n°001).`;
}

$("#f-decret").onsubmit = async e => {
  e.preventDefault();
  try {
    await addDoc(collection(db, "marche"), { titre: $("#d-titre").value.trim(), contenu: $("#d-contenu").value.trim(), auteur: uid, auteurP: nomOfficiel(moi), creeLe: serverTimestamp(), votes: {}, statut: "vote" });
    e.target.reset(); message($("#msg-decret"), "Décret soumis à l'Assemblée.", "ok");
  } catch (err) { message($("#msg-decret"), erreurFr(err), "erreur"); }
};

document.querySelectorAll("#filtres .onglet").forEach(b => b.onclick = () => { vue = b.dataset.v; document.querySelectorAll("#filtres .onglet").forEach(x => x.classList.toggle("on", x === b)); afficher(); });

function prochainNo() { const n = decrets.filter(d => d.statut === "publie").map(d => parseInt(String(d.numero).replace(/\D/g, ""), 10)).filter(x => x > 0); return String(Math.max(0, ...n) + 1).padStart(3, "0"); }

function afficher() {
  $("#nb-vote").textContent = decrets.filter(d => d.statut === "vote").length || "";
  $("#nb-adopte").textContent = decrets.filter(d => d.statut === "adopte").length || "";
  const l = decrets.filter(d => d.statut === vue).sort((a, b) => (b.creeLe?.seconds || 0) - (a.creeLe?.seconds || 0));
  const seuil = Math.floor(totalVoix() / 2) + 1;
  $("#decrets-vote").innerHTML = l.length ? l.map(d => {
    const { pour, contre } = compter(d.votes), mien = d.votes?.[uid];
    return `<div class="bloc"><span class="tag sans">${ETIQ[d.statut]}</span><h3>${esc(d.titre)}</h3><p class="contenu">${esc(d.contenu).replace(/\n/g, "<br>")}</p>
      <p class="sans"><small>Proposé par ${esc(d.auteurP)} · ${dateFr(d.creeLe)}</small></p>
      <p class="sans">Pour : <b>${pour}</b> · Contre : <b>${contre}</b> voix · il en faut ${seuil}${totalVoix() % 2 === 0 ? `, ou ${totalVoix() / 2} avec le Gouverneur (il tranche les égalités)` : ""}</p>
      <p class="qui-vote sans">${Object.entries(d.votes || {}).map(([id, v]) => `${v === "pour" ? "✅" : "❌"} ${esc(nomDe(id))}${poids(id) === 2 ? " (×2)" : ""}`).join(" · ")}</p>
      <div data-zone="${d.id}"></div>
      <div class="actions sans">
        ${d.statut === "vote" ? `<button class="btn ${mien === "pour" ? "" : "sec"}" data-vote="${d.id}" data-v="pour">Pour</button><button class="btn ${mien === "contre" ? "danger" : "sec"}" data-vote="${d.id}" data-v="contre">Contre</button>${mien ? `<span class="mini">Tu as voté ${mien}. Tu peux changer tant que le vote n'est pas fini.</span>` : ""}` : ""}
        ${gouv() && d.statut === "adopte" ? `<button class="btn" data-publier="${d.id}">✅ Publier</button>` : ""}
        ${gouv() ? `<span class="mini" style="width:100%">Accès fondateur :</span>${d.statut !== "vote" ? `<button class="btn sec" data-statut="${d.id}" data-s="vote">Rouvrir le vote</button>` : `<button class="btn sec" data-statut="${d.id}" data-s="adopte">Adopter</button><button class="btn sec" data-statut="${d.id}" data-s="rejete">Rejeter</button>`}<button class="btn danger" data-suppr="${d.id}">Supprimer</button>` : (d.auteur === uid && d.statut === "vote" ? `<button class="btn danger" data-suppr="${d.id}">Retirer</button>` : "")}
      </div></div>`;
  }).join("") : '<p class="vide sans">Rien ici pour l\'instant.</p>';

  document.querySelectorAll("[data-vote]").forEach(b => b.onclick = async () => {
    const d = decrets.find(x => x.id === b.dataset.vote), v = b.dataset.v;
    const statut = decider({ ...(d.votes || {}), [uid]: v });
    try { await updateDoc(doc(db, "marche", d.id), { ["votes." + uid]: v, statut }); if (statut === "adopte") message($("#msg-votes"), "Décret adopté par l'Assemblée : il attend la publication du Gouverneur.", "ok"); }
    catch (e) { message($("#msg-votes"), erreurFr(e), "erreur"); }
  });
  document.querySelectorAll("[data-statut]").forEach(b => b.onclick = async () => { if (await confirmer(`Passer le décret à « ${ETIQ[b.dataset.s]} » ?`)) updateDoc(doc(db, "marche", b.dataset.statut), { statut: b.dataset.s }).catch(e => message($("#msg-votes"), erreurFr(e), "erreur")); });
  document.querySelectorAll("[data-suppr]").forEach(b => b.onclick = async () => { if (await confirmer("Supprimer ce décret ?")) deleteDoc(doc(db, "marche", b.dataset.suppr)).catch(e => message($("#msg-votes"), erreurFr(e), "erreur")); });
  document.querySelectorAll("[data-publier]").forEach(b => b.onclick = () => {
    const d = decrets.find(x => x.id === b.dataset.publier), z = document.querySelector(`[data-zone="${d.id}"]`);
    z.innerHTML = `<form class="formu sans" style="max-width:none;margin:10px 0"><label>Numéro<input name="numero" maxlength="20" required value="${prochainNo()}"></label><label>Titre<input name="titre" maxlength="120" required value="${esc(d.titre)}"></label><label>Texte publié<textarea name="contenu" maxlength="8000" required>${esc(d.contenu)}</textarea></label><div class="actions"><button class="btn" type="submit">Publier le décret</button><button class="btn sec" type="button">Annuler</button></div></form>`;
    const f = z.querySelector("form"); f.querySelector('button[type="button"]').onclick = () => z.innerHTML = "";
    f.onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(f);
      if (!await confirmer(`Publier le Décret d'Alger n°${fd.get("numero")} ? Il sera visible par tout le monde.`)) return;
      try { await updateDoc(doc(db, "marche", d.id), { statut: "publie", numero: String(fd.get("numero")).trim(), titre: String(fd.get("titre")).trim(), contenu: String(fd.get("contenu")).trim(), publieLe: serverTimestamp() }); message($("#msg-votes"), "Décret publié.", "ok"); }
      catch (err) { message($("#msg-votes"), erreurFr(err), "erreur"); }
    };
  });
}
