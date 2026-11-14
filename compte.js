import { auth, db, $, esc, message, erreurFr, carteHTML, numero, dateFr } from "./parcum.js?v=6";
import { onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, onSnapshot, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let moi = null, uid = null, stopDemande = null, photo = null;

onAuthStateChanged(auth, user => {
  if (!user) return location.href = "connexion.html" + location.search;
  uid = user.uid;
  onSnapshot(doc(db, "photos", uid), s => { photo = s.exists() ? s.data().img : null; if (moi) $("#carte").innerHTML = carteHTML(moi, photo); $("#suppr-photo").hidden = !photo; }, () => {});
  onSnapshot(doc(db, "users", uid), snap => {
    if (!snap.exists()) { $("#carte").innerHTML = '<div class="msg erreur">Profil introuvable. Déconnecte-toi et reconnecte-toi.</div>'; return; }
    const ancien = moi?.role;
    moi = snap.data();
    $("#carte").innerHTML = carteHTML(moi, photo);
    $("#pseudo").value = moi.pseudo;
    if (ancien !== moi.role) afficherRole();
    else if (moi.role === "citoyen") $("#solde").textContent = moi.sparcs;
  });
});

function afficherRole() {
  ["#z-visiteur", "#z-citoyen", "#z-consul"].forEach(z => $(z).hidden = true);
  if (stopDemande) { stopDemande(); stopDemande = null; }
  if (moi.role === "visiteur") { $("#z-visiteur").hidden = false; suivreDemande(); }
  if (moi.role === "citoyen") { $("#z-citoyen").hidden = false; $("#solde").textContent = moi.sparcs; chargerCitoyens(); chargerHistorique(); }
  if (moi.role === "consul") { $("#z-consul").hidden = false; }
}

// ---------- Demande de citoyenneté en ligne ----------
function suivreDemande() {
  stopDemande = onSnapshot(doc(db, "demandes", uid), snap => {
    const d = snap.exists() ? snap.data() : null;
    $("#f-demande").hidden = !!d;
    if (!d) { $("#etat-demande").innerHTML = ""; return; }
    const n = d.signatures?.length || 0;
    let html = `<div class="etat ${d.statut === "refusee" ? "refusee" : ""}"><h3>Ta demande : ${d.statut === "en attente" ? "en attente" : d.statut === "refusee" ? "refusée" : "acceptée"}</h3>
      <p>Envoyée le ${dateFr(d.creeLe)} · Témoin : ${esc(d.temoin)}</p>`;
    if (d.statut === "en attente") html += `<div class="barre-prog"><span style="width:${n * 20}%"></span></div><p><b>${n} / 5</b> signatures de Consuls. Tu deviens citoyen quand les cinq Consuls ont signé.</p>`;
    if (d.statut === "refusee") html += `<p>Un Consul a utilisé son droit de veto (Constitution, art. 1). Tu peux refaire une demande.</p><button class="btn sec" id="refaire">Refaire une demande</button>`;
    html += "</div>";
    $("#etat-demande").innerHTML = html;
    const r = $("#refaire"); if (r) r.onclick = () => deleteDoc(doc(db, "demandes", uid)).catch(e => message($("#msg-demande"), erreurFr(e), "erreur"));
  });
}

$("#f-demande").onsubmit = async e => {
  e.preventDefault();
  if (!$("#d-allegeance").checked) return message($("#msg-demande"), "Tu dois cocher la déclaration d'allégeance.", "erreur");
  try {
    await setDoc(doc(db, "demandes", uid), {
      nomComplet: $("#d-nom").value.trim(), pseudo: moi.pseudo, dateArrivee: $("#d-date").value,
      temoin: $("#d-temoin").value.trim(), allegeance: true, statut: "en attente", signatures: [], veto: null, creeLe: serverTimestamp()
    });
    message($("#msg-demande"), "Demande envoyée aux Consuls !", "ok");
  } catch (err) { message($("#msg-demande"), erreurFr(err), "erreur"); }
};

// ---------- Portefeuille de Sparcs ----------
async function chargerCitoyens() {
  const s = await getDocs(query(collection(db, "users"), where("role", "==", "citoyen")));
  const opts = s.docs.filter(d => d.id !== uid).map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.citoyenNo ?? 999) - (b.citoyenNo ?? 999));
  $("#t-a").innerHTML = '<option value="">Choisir un citoyen…</option>' + opts.map(o => `<option value="${o.id}">${esc(o.pseudo)} (${numero(o.citoyenNo)})</option>`).join("");
}

async function chargerHistorique() {
  const [a, b] = await Promise.all([
    getDocs(query(collection(db, "transactions"), where("de", "==", uid))),
    getDocs(query(collection(db, "transactions"), where("a", "==", uid)))
  ]);
  const tx = [...a.docs, ...b.docs].map(d => d.data()).sort((x, y) => (y.date?.seconds || 0) - (x.date?.seconds || 0)).slice(0, 25);
  $("#historique").innerHTML = tx.length ? tx.map(t => {
    const sortie = t.de === uid;
    return `<li><span class="${sortie ? "moins" : "plus"}">${sortie ? "−" : "+"}${Math.abs(t.montant)} §</span>
      <span>${sortie ? "à " + esc(t.aP) : "de " + esc(t.deP)}${t.motif ? " · " + esc(t.motif) : ""}</span><small>${dateFr(t.date)}</small></li>`;
  }).join("") : '<li class="vide">Aucune transaction pour l\'instant.</li>';
}

$("#f-transfert").onsubmit = async e => {
  e.preventDefault();
  const a = $("#t-a").value, montant = parseInt($("#t-montant").value, 10), motif = $("#t-motif").value.trim().slice(0, 80);
  if (!a) return message($("#msg-tx"), "Choisis à qui envoyer les Sparcs.", "erreur");
  if (!(montant > 0)) return message($("#msg-tx"), "Le montant doit être un nombre entier plus grand que 0.", "erreur");
  if (montant > moi.sparcs) return message($("#msg-tx"), "Tu n'as pas assez de Sparcs.", "erreur");
  try {
    await runTransaction(db, async t => {
      const refMoi = doc(db, "users", uid), refLui = doc(db, "users", a);
      const [sm, sl] = [await t.get(refMoi), await t.get(refLui)];
      if (sm.data().sparcs < montant) throw new Error("Solde insuffisant.");
      const refTx = doc(collection(db, "transactions"));
      t.set(refTx, { de: uid, a, montant, date: serverTimestamp(), deP: sm.data().pseudo, aP: sl.data().pseudo, motif });
      t.update(refMoi, { sparcs: sm.data().sparcs - montant, derniereTx: refTx.id });
      t.update(refLui, { sparcs: sl.data().sparcs + montant, derniereTx: refTx.id });
    });
    message($("#msg-tx"), `${montant} § envoyés !`, "ok");
    e.target.reset(); chargerHistorique();
  } catch (err) { message($("#msg-tx"), erreurFr(err), "erreur"); }
};

// ---------- Profil ----------
$("#f-pseudo").onsubmit = async e => {
  e.preventDefault();
  const p = $("#pseudo").value.trim();
  if (p.length < 2 || p.length > 30) return message($("#msg-profil"), "Le pseudo doit avoir entre 2 et 30 caractères.", "erreur");
  try { await updateDoc(doc(db, "users", uid), { pseudo: p }); await updateProfile(auth.currentUser, { displayName: p }); message($("#msg-profil"), "Pseudo changé.", "ok"); }
  catch (err) { message($("#msg-profil"), erreurFr(err), "erreur"); }
};
$("#deco").onclick = () => signOut(auth);

// ---------- Photo de la carte ----------
function reduire(fichier) {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => {
      const T = 320, c = document.createElement("canvas"); c.width = c.height = T;
      const s = Math.min(img.width, img.height);
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, T, T);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => ko(new Error("Image illisible. Essaie une photo JPG ou PNG."));
    img.src = URL.createObjectURL(fichier);
  });
}
$("#photo").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  message($("#msg-photo"), "Envoi de la photo…", "info");
  try {
    const img = await reduire(f);
    await setDoc(doc(db, "photos", uid), { img, majLe: serverTimestamp() });
    message($("#msg-photo"), "Photo ajoutée à ta carte !", "ok");
  } catch (err) { message($("#msg-photo"), erreurFr(err), "erreur"); }
  e.target.value = "";
};
$("#suppr-photo").onclick = async () => {
  try { await deleteDoc(doc(db, "photos", uid)); message($("#msg-photo"), "Photo retirée.", "ok"); }
  catch (err) { message($("#msg-photo"), erreurFr(err), "erreur"); }
};
