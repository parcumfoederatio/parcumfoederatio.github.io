// Élections et révocations des sénateurs, par province. Le Consul fondateur lance, ferme et valide.
import { auth, db, $, esc, message, erreurFr, dateFr, nomOfficiel, confirmer, PROVINCES } from "./parcum.js?v=21";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let uid = null, moi = null, users = [], elections = [], vue = "en-cours", lance = false;
const chef = () => moi?.chef === true;
const nomDe = id => nomOfficiel(users.find(u => u.id === id));
const electeurs = p => users.filter(u => ["citoyen", "consul"].includes(u.role) && u.province === p);
const peutVoter = e => ["citoyen", "consul"].includes(moi?.role) && moi?.province === e.province;
const senateurDe = p => users.find(u => u.senat === p);
const ETIQ = { candidatures: "Candidatures ouvertes", vote: "Vote en cours", fermee: "Vote fermé, en attente de validation", validee: "Résultat validé ✓", annulee: "Annulée" };
const msg = (t, type) => message($("#msg-elections"), t, type);

onAuthStateChanged(auth, user => {
  if (!user) return;
  uid = user.uid;
  onSnapshot(collection(db, "users"), s => {
    users = s.docs.map(d => ({ id: d.id, ...d.data() }));
    moi = users.find(u => u.id === uid) || null;
    $("#z-elections").hidden = false;
    $("#z-ouvrir").hidden = !chef();
    $("#ma-province").innerHTML = moi?.province ? `Ta province de vote : <b>${esc(moi.province)}</b>.` : ["citoyen", "consul"].includes(moi?.role) ? "Tu n'es rattaché à aucune province pour l'instant. Le Consul fondateur t'en assigne une dans le Registre (la plus proche de chez toi)." : "Seuls les citoyens votent aux élections du Sénat.";
    if (!lance) { lance = true; onSnapshot(collection(db, "elections"), q => { elections = q.docs.map(d => ({ id: d.id, ...d.data() })); afficher(); }, e => msg(erreurFr(e), "erreur")); }
    else afficher();
  });
});

$("#e-province").innerHTML = PROVINCES.map(p => `<option>${esc(p)}</option>`).join("");
$("#f-lancer").onsubmit = async e => {
  e.preventDefault();
  const type = $("#e-type").value, province = $("#e-province").value;
  if (elections.some(x => x.province === province && ["candidatures", "vote", "fermee"].includes(x.statut))) return message($("#msg-ouvrir"), `Il y a déjà un vote en cours pour ${province}.`, "erreur");
  if (type === "revocation" && !senateurDe(province)) return message($("#msg-ouvrir"), `${province} n'a pas de sénateur à révoquer.`, "erreur");
  if (!await confirmer(type === "election" ? `Lancer l'élection du sénateur de ${province} ? Les candidatures s'ouvrent.` : `Lancer un vote de révocation contre ${nomOfficiel(senateurDe(province))}, sénateur de ${province} ?`)) return;
  try {
    await addDoc(collection(db, "elections"), { type, province, statut: type === "election" ? "candidatures" : "vote", candidats: [], votes: {}, vise: type === "revocation" ? senateurDe(province).id : null, creeLe: serverTimestamp() });
    message($("#msg-ouvrir"), "Vote lancé.", "ok");
  } catch (err) { message($("#msg-ouvrir"), erreurFr(err), "erreur"); }
};

document.querySelectorAll("#e-filtres .onglet").forEach(b => b.onclick = () => { vue = b.dataset.v; document.querySelectorAll("#e-filtres .onglet").forEach(x => x.classList.toggle("on", x === b)); afficher(); });

// Résultat : un candidat est élu à la majorité des votes exprimés ; une révocation passe à la majorité de TOUS les citoyens de la province
function resultat(e) {
  const inscrits = electeurs(e.province).map(u => u.id), votes = Object.entries(e.votes || {}).filter(([id]) => inscrits.includes(id));
  if (e.type === "revocation") {
    const pour = votes.filter(([, v]) => v === "pour").length, contre = votes.length - pour;
    return { pour, contre, inscrits: inscrits.length, passe: pour > inscrits.length / 2, texte: `Pour la révocation : ${pour} · Contre : ${contre} · ${inscrits.length} citoyens inscrits (il faut ${Math.floor(inscrits.length / 2) + 1} voix pour)` };
  }
  const compte = Object.fromEntries((e.candidats || []).map(c => [c, 0]));
  votes.forEach(([, c]) => { if (c in compte) compte[c]++; });
  const tri = Object.entries(compte).sort((a, b) => b[1] - a[1]);
  const gagnant = tri.length && tri[0][1] > 0 && !(tri[1] && tri[1][1] === tri[0][1]) ? tri[0][0] : null;
  return { compte: tri, gagnant, inscrits: inscrits.length, votants: votes.length };
}

function afficher() {
  const enCours = x => ["candidatures", "vote", "fermee"].includes(x.statut);
  $("#nb-elections").textContent = elections.filter(enCours).length || "";
  const l = elections.filter(x => vue === "en-cours" ? enCours(x) : !enCours(x)).sort((a, b) => (b.creeLe?.seconds || 0) - (a.creeLe?.seconds || 0));
  $("#liste-elections").innerHTML = l.length ? l.map(e => {
    const r = resultat(e), mien = e.votes?.[uid], candidat = (e.candidats || []).includes(uid), visible = e.statut !== "vote" || chef();
    let h = `<div class="bloc sans"><span class="tag">${ETIQ[e.statut]}</span>
      <h3>${e.type === "election" ? "Élection du sénateur" : "Révocation du sénateur"} · ${esc(e.province)}</h3>
      <p><small>Lancée le ${dateFr(e.creeLe)}${e.type === "revocation" ? ` · vise ${esc(nomDe(e.vise))}` : ""} · ${r.inscrits} citoyen${r.inscrits > 1 ? "s" : ""} inscrit${r.inscrits > 1 ? "s" : ""} dans la province</small></p>`;
    if (e.resultat) h += `<div class="etat" style="margin:10px 0"><b>Résultat :</b> ${esc(e.resultat)}</div>`;
    if (e.type === "election") {
      h += `<p><b>Candidats :</b> ${(e.candidats || []).length ? e.candidats.map(c => esc(nomDe(c))).join(", ") : "aucun pour l'instant"}</p>`;
      if (visible && e.statut !== "candidatures") h += `<p>${r.compte.map(([c, n]) => `${esc(nomDe(c))} : <b>${n}</b>`).join(" · ")}${r.gagnant ? ` → <b>${esc(nomDe(r.gagnant))}</b> en tête` : r.votants ? " → égalité" : ""}</p>`;
    } else if (visible) h += `<p>${r.texte}</p>`;
    if (e.statut === "vote" && !chef()) h += `<p class="mini">Vote secret : les résultats s'affichent quand le vote est fermé.</p>`;
    if (chef() && Object.keys(e.votes || {}).length) h += `<div class="qui-vote"><b>Qui a voté</b> (visible seulement par toi) : ${Object.entries(e.votes).map(([id, v]) => `${esc(nomDe(id))} → ${esc(e.type === "election" ? nomDe(v) : v)}`).join(" · ")}</div>`;
    h += `<div class="actions">`;
    if (e.statut === "candidatures" && peutVoter(e)) h += candidat ? `<button class="btn sec" data-cand="${e.id}">Retirer ma candidature</button>` : `<button class="btn" data-cand="${e.id}">Me présenter</button>`;
    if (e.statut === "vote" && peutVoter(e)) {
      if (e.type === "election") h += (e.candidats || []).map(c => `<button class="btn ${mien === c ? "" : "sec"}" data-voter="${e.id}" data-v="${c}">${esc(nomDe(c))}</button>`).join("");
      else h += `<button class="btn ${mien === "pour" ? "danger" : "sec"}" data-voter="${e.id}" data-v="pour">Pour la révocation</button><button class="btn ${mien === "contre" ? "" : "sec"}" data-voter="${e.id}" data-v="contre">Contre</button>`;
      if (mien) h += `<span class="mini">Ton vote est enregistré. Tu peux le changer tant que le vote est ouvert.</span>`;
    }
    if (chef()) {
      h += '<span class="mini" style="width:100%">Accès fondateur :</span>';
      if (e.statut === "candidatures") h += `<button class="btn sec" data-statut="${e.id}" data-s="vote">Ouvrir le vote</button>`;
      if (e.statut === "vote") h += `<button class="btn sec" data-statut="${e.id}" data-s="fermee">Fermer le vote</button>`;
      if (e.statut === "fermee") h += `<button class="btn" data-valider="${e.id}">✅ Valider le résultat</button><button class="btn sec" data-statut="${e.id}" data-s="vote">Rouvrir le vote</button>`;
      if (["candidatures", "vote", "fermee"].includes(e.statut)) h += `<button class="btn danger" data-statut="${e.id}" data-s="annulee">Annuler</button>`;
      h += `<button class="btn danger" data-suppr="${e.id}">Supprimer</button>`;
    }
    return h + "</div></div>";
  }).join("") : '<p class="vide sans">Aucun vote ici.</p>';

  document.querySelectorAll("[data-cand]").forEach(b => b.onclick = async () => {
    const e = elections.find(x => x.id === b.dataset.cand), c = e.candidats || [];
    const nouv = c.includes(uid) ? c.filter(x => x !== uid) : [...c, uid];
    updateDoc(doc(db, "elections", e.id), { candidats: nouv }).catch(err => msg(erreurFr(err), "erreur"));
  });
  document.querySelectorAll("[data-voter]").forEach(b => b.onclick = () => updateDoc(doc(db, "elections", b.dataset.voter), { ["votes." + uid]: b.dataset.v }).then(() => msg("Vote enregistré.", "ok")).catch(err => msg(erreurFr(err), "erreur")));
  document.querySelectorAll("[data-statut]").forEach(b => b.onclick = async () => {
    const e = elections.find(x => x.id === b.dataset.statut), s = b.dataset.s;
    if (s === "vote" && e.type === "election" && !(e.candidats || []).length) return msg("Il faut au moins un candidat pour ouvrir le vote.", "erreur");
    if (await confirmer(`Passer à « ${ETIQ[s]} » ?`)) updateDoc(doc(db, "elections", e.id), { statut: s }).catch(err => msg(erreurFr(err), "erreur"));
  });
  document.querySelectorAll("[data-suppr]").forEach(b => b.onclick = async () => { if (await confirmer("Supprimer ce vote de l'historique ?")) deleteDoc(doc(db, "elections", b.dataset.suppr)).catch(err => msg(erreurFr(err), "erreur")); });
  document.querySelectorAll("[data-valider]").forEach(b => b.onclick = () => valider(elections.find(x => x.id === b.dataset.valider)));
}

async function valider(e) {
  const r = resultat(e), batch = writeBatch(db), ancien = senateurDe(e.province);
  let texte;
  if (e.type === "election") {
    if (!r.gagnant) return msg("Pas de gagnant (aucun vote ou égalité). Rouvre le vote ou annule l'élection.", "erreur");
    texte = `${nomDe(r.gagnant)} devient sénateur de ${e.province}${ancien && ancien.id !== r.gagnant ? ` (à la place de ${nomOfficiel(ancien)})` : ""}.`;
    if (!await confirmer(`Valider le résultat ? ${texte}`)) return;
    if (ancien && ancien.id !== r.gagnant) batch.update(doc(db, "users", ancien.id), { senat: null });
    batch.update(doc(db, "users", r.gagnant), { senat: e.province });
    batch.update(doc(db, "elections", e.id), { statut: "validee", resultat: texte, elu: r.gagnant, valideLe: serverTimestamp() });
  } else {
    texte = r.passe ? `${nomDe(e.vise)} est révoqué : le siège de ${e.province} est libre.` : `La révocation est rejetée : ${nomDe(e.vise)} reste sénateur de ${e.province}.`;
    if (!await confirmer(`Valider le résultat ? ${texte}`)) return;
    if (r.passe && senateurDe(e.province)?.id === e.vise) batch.update(doc(db, "users", e.vise), { senat: null });
    batch.update(doc(db, "elections", e.id), { statut: "validee", resultat: texte, valideLe: serverTimestamp() });
  }
  try { await batch.commit(); msg(texte, "ok"); } catch (err) { msg(erreurFr(err), "erreur"); }
}
