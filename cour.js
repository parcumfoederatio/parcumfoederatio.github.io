import { auth, db, $, esc, message, erreurFr, dateFr, nomOfficiel } from "./parcum.js?v=10";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { onSnapshot, collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let uid = null, moi = null, users = [], affaires = [], vue = "cours", edition = null;
const nomDe = id => nomOfficiel(users.find(u => u.id === id));
const confirmer = t => { try { return window.confirm(t); } catch { return true; } };
const erreur = (el, e) => message($(el), erreurFr(e), "erreur");
const admin = () => moi?.chef === true; // le Consul fondateur a accès à tout
const estJuge = u => !!u && (u.chef === true || u.juge === true);
const partie = (a, id) => a.demandeur === id || (a.defendeur && a.defendeur === id);
const numero = n => "Affaire n°" + String(n ?? "?").padStart(3, "0");
const ETIQ = { deposee: "Déposée", "en cours": "Audience en cours", jugee: "Jugée", irrecevable: "Irrecevable", retiree: "Retirée" };
const VERDICTS = { accueillie: "Accueillie", partielle: "Accueillie en partie", rejetee: "Rejetée" };
const enCours = a => ["deposee", "en cours"].includes(a.statut);

onAuthStateChanged(auth, user => {
  if (!user) return location.href = "connexion.html";
  uid = user.uid;
  onSnapshot(collection(db, "users"), s => {
    users = s.docs.map(d => ({ id: d.id, ...d.data() }));
    moi = users.find(u => u.id === uid) || null;
    $("#chargement").hidden = true; $("#espace").hidden = false;
    afficherJuges(); afficherDepot(); afficher();
  }, e => erreur("#chargement", e));
  onSnapshot(collection(db, "affaires"), s => { affaires = s.docs.map(d => ({ id: d.id, ...d.data() })); afficher(); }, e => erreur("#msg-affaires", e));
});

function afficherJuges() {
  const chef = users.filter(u => u.chef === true), sup = users.filter(u => u.juge === true && u.chef !== true);
  $("#juges").innerHTML = (chef.map(u => `<b>${esc(nomOfficiel(u))}</b> · juge en chef`).concat(sup.map(u => `<b>${esc(nomOfficiel(u))}</b> · juge suppléant`)).join("<br>")) || '<span class="vide">Aucun juge.</span>';
}

// ---------- Dépôt ----------
function afficherDepot() {
  if (!moi) return;
  const peut = ["citoyen", "consul", "resident"].includes(moi.role) || admin();
  $("#z-deposer").hidden = !peut; $("#z-pas-citoyen").hidden = peut;
  if (!peut) return;
  const sel = $("#a-def"), avant = sel.value;
  const autres = users.filter(u => u.id !== uid).sort((a, b) => nomOfficiel(a).localeCompare(nomOfficiel(b)));
  sel.innerHTML = '<option value="">— Personne en particulier —</option>' + autres.map(u => `<option value="${u.id}">${esc(nomOfficiel(u))}</option>`).join("") + '<option value="autre">Quelqu\'un qui n\'a pas de compte…</option>';
  sel.value = avant;
}
$("#a-def").onchange = () => { $("#l-def-autre").hidden = $("#a-def").value !== "autre"; };
$("#a-type").onchange = () => { $("#l-def").textContent = $("#a-type").value === "plainte" ? "Partie visée (défendeur)" : "Personne ou institution visée (optionnel)"; };

$("#f-affaire").onsubmit = async e => {
  e.preventDefault();
  const type = $("#a-type").value, d = $("#a-def").value;
  let defendeur = null, defendeurP = null;
  if (d === "autre") { defendeurP = $("#a-def-autre").value.trim() || null; }
  else if (d) { defendeur = d; defendeurP = nomDe(d); }
  if (type === "plainte" && !defendeurP) return message($("#msg-deposer"), "Une plainte doit viser quelqu'un. Choisis le défendeur.", "erreur");
  const numeroSuivant = Math.max(0, ...affaires.map(a => Number(a.numero) || 0)) + 1;
  try {
    await addDoc(collection(db, "affaires"), {
      numero: numeroSuivant, type, titre: $("#a-titre").value.trim(), demandeur: uid, demandeurP: nomOfficiel(moi),
      defendeur, defendeurP, faits: $("#a-faits").value.trim(), demande: $("#a-demande").value.trim(), textes: $("#a-textes").value.trim(),
      statut: "deposee", creeLe: serverTimestamp(), reponse: null, jugement: null, verdict: null, sanction: null, juge: null, jugeP: null, jugeLe: null
    });
    e.target.reset(); $("#l-def-autre").hidden = true;
    message($("#msg-deposer"), `${numero(numeroSuivant)} déposée devant la Cour.`, "ok"); choisirVue("miennes");
  } catch (err) { erreur("#msg-deposer", err); }
};

// ---------- Liste ----------
function choisirVue(v) { vue = v; document.querySelectorAll("#filtres .onglet").forEach(b => b.classList.toggle("on", b.dataset.v === v)); afficher(); }
document.querySelectorAll("#filtres .onglet").forEach(b => b.onclick = () => choisirVue(b.dataset.v));

function afficher() {
  if (!moi) return;
  $("#nb-cours").textContent = affaires.filter(enCours).length || "";
  const choix = affaires.filter(a => vue === "cours" ? enCours(a) : vue === "jugees" ? ["jugee", "irrecevable"].includes(a.statut) : vue === "miennes" ? partie(a, uid) : true)
    .sort((a, b) => (b.numero || 0) - (a.numero || 0));
  $("#affaires").innerHTML = choix.length ? choix.map(bloc).join("") : '<p class="vide sans">Aucune affaire ici.</p>';
  brancher();
}

const para = t => `<p class="contenu">${esc(t).replace(/\n/g, "<br>")}</p>`;
function bloc(a) {
  const juge = estJuge(moi), jePartie = partie(a, uid);
  let h = `<div class="bloc"><span class="tag sans">${ETIQ[a.statut] || a.statut}</span> <span class="tag sans">${a.type === "plainte" ? "Plainte" : "Doléances"}</span>
    <h3>${numero(a.numero)} — ${esc(a.titre)}</h3>
    <p class="sans"><small>${esc(a.demandeurP)}${a.defendeurP ? ` c. ${esc(a.defendeurP)}` : ""} · déposée le ${dateFr(a.creeLe)}</small></p>`;
  if (edition === a.id) h += formEdition(a);
  else {
    h += `<p class="sans"><b>Les faits</b></p>${para(a.faits)}<p class="sans"><b>Demande</b></p>${para(a.demande)}`;
    if (a.textes) h += `<p class="sans"><small>Textes invoqués : ${esc(a.textes)}</small></p>`;
  }
  if (a.reponse) h += `<p class="sans"><b>Réponse de ${esc(a.defendeurP)}</b></p>${para(a.reponse)}`;
  if (a.statut === "jugee") h += `<div class="etat" style="margin-top:12px"><h3>Jugement : ${esc(VERDICTS[a.verdict] || a.verdict)}</h3>${a.sanction ? `<p class="sans"><b>Sanction :</b> ${esc(a.sanction)}</p>` : ""}${a.jugement ? para(a.jugement) : ""}<p class="sans"><small>Rendu par ${esc(a.jugeP)} · ${dateFr(a.jugeLe)}</small></p></div>`;
  if (a.statut === "irrecevable") h += `<div class="etat refusee" style="margin-top:12px"><h3>Déclarée irrecevable</h3>${a.jugement ? para(a.jugement) : ""}<p class="sans"><small>Par ${esc(a.jugeP)} · ${dateFr(a.jugeLe)}</small></p></div>`;

  h += `<div data-zone="${a.id}"></div><div class="actions sans">`;
  if (enCours(a) && a.defendeur === uid) h += `<button class="btn sec" data-repondre="${a.id}">${a.reponse ? "Modifier ma réponse" : "Répondre à la plainte"}</button>`;
  if (enCours(a) && a.demandeur === uid && !admin()) h += `<button class="btn danger" data-retirer="${a.id}">Retirer mon affaire</button>`;
  if (juge && (!jePartie || admin())) {
    if (jePartie) h += '<span class="mini" style="width:100%">⚠️ Tu es partie à cette affaire : normalement, c\'est un juge suppléant qui la juge.</span>';
    if (a.statut === "deposee") h += `<button class="btn sec" data-statut="${a.id}" data-s="en cours">Ouvrir l'audience</button>`;
    if (enCours(a)) h += `<button class="btn" data-juger="${a.id}">Rendre le jugement</button><button class="btn danger" data-irrecevable="${a.id}">Irrecevable</button>`;
  }
  if (admin()) {
    h += '<span class="mini" style="width:100%">Accès fondateur :</span>';
    if (!enCours(a)) h += `<button class="btn sec" data-statut="${a.id}" data-s="en cours">Rouvrir</button>`;
    if (enCours(a)) h += `<button class="btn sec" data-statut="${a.id}" data-s="retiree">Classer (retirée)</button>`;
    h += `<button class="btn sec" data-modif="${a.id}">Modifier</button><button class="btn danger" data-suppr="${a.id}">Supprimer</button>`;
  }
  return h + "</div></div>";
}

function formEdition(a) {
  return `<form class="formu sans" data-edit="${a.id}" style="max-width:none;margin:10px 0">
    <label>Titre<input name="titre" maxlength="120" required value="${esc(a.titre)}"></label>
    <label>Les faits<textarea name="faits" maxlength="8000" required>${esc(a.faits)}</textarea></label>
    <label>Demande<textarea name="demande" maxlength="3000" required style="min-height:80px">${esc(a.demande)}</textarea></label>
    ${a.statut === "jugee" ? `<label>Sanction<input name="sanction" maxlength="300" value="${esc(a.sanction || "")}"></label>` : ""}
    ${a.jugement != null ? `<label>Motifs du jugement<textarea name="jugement" maxlength="8000">${esc(a.jugement || "")}</textarea></label>` : ""}
    <div class="actions"><button class="btn" type="submit">Enregistrer</button><button class="btn sec" type="button" data-fermer>Annuler</button></div></form>`;
}

function zone(id, html) { const z = document.querySelector(`[data-zone="${id}"]`); if (z) z.innerHTML = html; return z; }

function brancher() {
  document.querySelectorAll("[data-statut]").forEach(b => b.onclick = () => {
    const s = b.dataset.s;
    if (confirmer(`Passer l'affaire à « ${ETIQ[s]} » ?`)) updateDoc(doc(db, "affaires", b.dataset.statut), { statut: s }).catch(e => erreur("#msg-affaires", e));
  });
  document.querySelectorAll("[data-retirer]").forEach(b => b.onclick = () => confirmer("Retirer ton affaire ? La Cour ne la jugera pas.") && updateDoc(doc(db, "affaires", b.dataset.retirer), { statut: "retiree" }).catch(e => erreur("#msg-affaires", e)));
  document.querySelectorAll("[data-suppr]").forEach(b => b.onclick = () => confirmer("Supprimer définitivement cette affaire ?") && deleteDoc(doc(db, "affaires", b.dataset.suppr)).catch(e => erreur("#msg-affaires", e)));
  document.querySelectorAll("[data-modif]").forEach(b => b.onclick = () => { edition = b.dataset.modif; afficher(); });
  document.querySelectorAll("[data-fermer]").forEach(b => b.onclick = () => { edition = null; afficher(); });
  document.querySelectorAll("[data-edit]").forEach(f => f.onsubmit = async e => {
    e.preventDefault();
    const champs = {}; new FormData(f).forEach((v, k) => champs[k] = String(v).trim());
    try { await updateDoc(doc(db, "affaires", f.dataset.edit), champs); edition = null; afficher(); } catch (err) { erreur("#msg-affaires", err); }
  });

  document.querySelectorAll("[data-repondre]").forEach(b => b.onclick = () => {
    const a = affaires.find(x => x.id === b.dataset.repondre);
    const z = zone(a.id, `<form class="formu sans" style="max-width:none;margin:10px 0"><label>Ta réponse à la Cour<textarea maxlength="8000" required>${esc(a.reponse || "")}</textarea></label><div class="actions"><button class="btn" type="submit">Envoyer ma réponse</button><button class="btn sec" type="button">Annuler</button></div></form>`);
    const f = z.querySelector("form"); f.querySelector('button[type="button"]').onclick = () => zone(a.id, "");
    f.onsubmit = async e => { e.preventDefault(); try { await updateDoc(doc(db, "affaires", a.id), { reponse: f.querySelector("textarea").value.trim() }); } catch (err) { erreur("#msg-affaires", err); } };
  });

  document.querySelectorAll("[data-juger]").forEach(b => b.onclick = () => {
    const id = b.dataset.juger;
    const z = zone(id, `<form class="formu sans" style="max-width:none;margin:10px 0">
      <label>Verdict<select name="verdict">${Object.entries(VERDICTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
      <label>Sanction (optionnel)<input name="sanction" maxlength="300" placeholder="Ex. : hausse de taxe, révocation temporaire de pouvoirs…"></label>
      <label>Motifs du jugement<textarea name="jugement" maxlength="8000" required placeholder="Pourquoi la Cour rend cette décision"></textarea></label>
      <div class="actions"><button class="btn" type="submit">Rendre le jugement</button><button class="btn sec" type="button">Annuler</button></div></form>`);
    const f = z.querySelector("form"); f.querySelector('button[type="button"]').onclick = () => zone(id, "");
    f.onsubmit = async e => {
      e.preventDefault();
      if (!confirmer("Rendre ce jugement ? Il sera public.")) return;
      const fd = new FormData(f);
      try { await updateDoc(doc(db, "affaires", id), { statut: "jugee", verdict: fd.get("verdict"), sanction: String(fd.get("sanction")).trim() || null, jugement: String(fd.get("jugement")).trim(), juge: uid, jugeP: nomOfficiel(moi), jugeLe: serverTimestamp() }); }
      catch (err) { erreur("#msg-affaires", err); }
    };
  });

  document.querySelectorAll("[data-irrecevable]").forEach(b => b.onclick = () => {
    const id = b.dataset.irrecevable;
    const z = zone(id, `<form class="formu sans" style="max-width:none;margin:10px 0"><label>Pourquoi l'affaire est irrecevable<textarea maxlength="3000" required style="min-height:80px"></textarea></label><div class="actions"><button class="btn danger" type="submit">Déclarer irrecevable</button><button class="btn sec" type="button">Annuler</button></div></form>`);
    const f = z.querySelector("form"); f.querySelector('button[type="button"]').onclick = () => zone(id, "");
    f.onsubmit = async e => {
      e.preventDefault();
      try { await updateDoc(doc(db, "affaires", id), { statut: "irrecevable", jugement: f.querySelector("textarea").value.trim(), juge: uid, jugeP: nomOfficiel(moi), jugeLe: serverTimestamp() }); }
      catch (err) { erreur("#msg-affaires", err); }
    };
  });
}
