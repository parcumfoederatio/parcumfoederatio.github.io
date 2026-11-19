import { auth, db, $, esc, message, erreurFr, dateFr, nomOfficiel, MAX_SPARCS } from "./parcum.js?v=11";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, onSnapshot, collection, query, where, addDoc, updateDoc, deleteDoc, runTransaction, writeBatch, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let uid = null, moi = null, produits = [], commandes = [], vue = "payee", stops = [];
const confirmer = t => { try { return window.confirm(t); } catch { return true; } };
const erreur = (el, e) => message($(el), erreurFr(e), "erreur");
const consul = () => moi?.role === "consul";
const citoyen = () => moi?.role === "citoyen";
const ETIQ = { payee: "Payée, à livrer", livree: "Livrée ✓", annulee: "Annulée (remboursée)" };

// Les produits sont visibles par tout le monde, même sans compte
onSnapshot(collection(db, "produits"), s => { produits = s.docs.map(d => ({ id: d.id, ...d.data() })); afficherProduits(); }, e => erreur("#msg-boutique", e));

onAuthStateChanged(auth, user => {
  stops.forEach(f => f()); stops = [];
  uid = user?.uid || null; moi = null;
  if (!user) { afficherMoi(); afficherProduits(); return; }
  stops.push(onSnapshot(doc(db, "users", uid), s => {
    const ancien = moi?.role; moi = s.exists() ? s.data() : null;
    afficherMoi(); afficherProduits();
    if (ancien !== moi?.role) suivreCommandes();
  }));
});

function suivreCommandes() {
  if (stops.length > 1) stops.splice(1).forEach(f => f());
  if (!moi) return;
  const q = consul() ? collection(db, "commandes") : query(collection(db, "commandes"), where("acheteur", "==", uid));
  stops.push(onSnapshot(q, s => { commandes = s.docs.map(d => ({ id: d.id, ...d.data() })); afficherCommandes(); }, e => erreur("#msg-commandes", e)));
  $("#z-gestion").hidden = !consul();
  $("#z-commandes").hidden = consul();
}

function afficherMoi() {
  const z = $("#moi");
  if (!uid) { z.hidden = false; z.innerHTML = `<a href="connexion.html">Connecte-toi</a> pour acheter.`; return; }
  if (!moi) { z.hidden = true; return; }
  z.hidden = false;
  z.innerHTML = citoyen() ? `Ton solde : <b class="solde" style="font-size:1.6rem">${moi.sparcs} §</b>`
    : consul() ? "Tu es Consul : tu gères la boutique plus bas, mais tu ne peux pas acheter (Décret n°030)."
    : `Il faut être citoyen pour acheter. <a href="compte.html">Fais ta demande de citoyenneté</a>.`;
}

// ---------- Produits ----------
function afficherProduits() {
  const liste = produits.filter(p => p.actif || consul()).sort((a, b) => a.prix - b.prix || a.nom.localeCompare(b.nom));
  $("#produits").innerHTML = liste.length ? liste.map(p => {
    const epuise = typeof p.stock === "number" && p.stock <= 0;
    const max = Math.min(10, typeof p.stock === "number" ? p.stock : 10);
    let h = `<div class="carte o" style="${p.actif ? "" : "opacity:.55"}"><div style="font-size:2rem">${esc(p.icone || "🏛️")}</div>
      <h3>${esc(p.nom)}</h3>${p.description ? `<p>${esc(p.description)}</p>` : ""}
      <p class="solde" style="font-size:1.6rem;margin-top:8px">${p.prix} §</p>
      <p class="mini">${!p.actif ? "Pas en vente" : epuise ? "Épuisé" : typeof p.stock === "number" ? `${p.stock} en stock` : "Stock illimité"}</p>`;
    if (citoyen() && p.actif && !epuise) h += `<div class="actions"><input type="number" min="1" max="${max}" value="1" data-qte="${p.id}" style="width:64px;padding:8px;border:1px solid #d6d0c2;border-radius:8px;font:inherit"><button class="btn" data-acheter="${p.id}">Acheter</button></div>`;
    if (consul()) h += `<div class="actions"><button class="btn sec" data-editer="${p.id}">Modifier</button><button class="btn sec" data-basculer="${p.id}">${p.actif ? "Retirer de la vente" : "Remettre en vente"}</button><button class="btn danger" data-supprimer="${p.id}">Supprimer</button></div>`;
    return h + "</div>";
  }).join("") : '<p class="vide">La boutique est vide pour l\'instant.</p>';
  document.querySelectorAll("[data-acheter]").forEach(b => b.onclick = () => acheter(b.dataset.acheter));
  document.querySelectorAll("[data-editer]").forEach(b => b.onclick = () => editer(b.dataset.editer));
  document.querySelectorAll("[data-basculer]").forEach(b => b.onclick = () => { const p = produits.find(x => x.id === b.dataset.basculer); updateDoc(doc(db, "produits", p.id), { actif: !p.actif }).catch(e => erreur("#msg-produit", e)); });
  document.querySelectorAll("[data-supprimer]").forEach(b => b.onclick = () => confirmer("Supprimer ce produit de la boutique ?") && deleteDoc(doc(db, "produits", b.dataset.supprimer)).catch(e => erreur("#msg-produit", e)));
}

async function acheter(id) {
  const p = produits.find(x => x.id === id); if (!p) return;
  const qte = parseInt(document.querySelector(`[data-qte="${id}"]`).value, 10);
  if (!(qte >= 1 && qte <= 10)) return message($("#msg-boutique"), "La quantité doit être entre 1 et 10.", "erreur");
  const total = p.prix * qte;
  if (total > moi.sparcs) return message($("#msg-boutique"), `Il te manque ${total - moi.sparcs} § pour cet achat.`, "erreur");
  if (!confirmer(`Acheter ${qte} × ${p.nom} pour ${total} § ?`)) return;
  try {
    await runTransaction(db, async t => {
      const refMoi = doc(db, "users", uid), refP = doc(db, "produits", id);
      const [sm, sp] = [await t.get(refMoi), await t.get(refP)];
      const prod = sp.data(), solde = sm.data().sparcs;
      if (!prod?.actif) throw new Error("Ce produit n'est plus en vente.");
      if (prod.prix !== p.prix) throw new Error("Le prix vient de changer. Recharge la page.");
      if (typeof prod.stock === "number" && prod.stock < qte) throw new Error("Pas assez de stock.");
      if (solde < total) throw new Error("Solde insuffisant.");
      const refC = doc(collection(db, "commandes")), refTx = doc(collection(db, "transactions"));
      const motif = `Boutique : ${qte} × ${prod.nom}`.slice(0, 80);
      t.set(refC, { acheteur: uid, acheteurP: nomOfficiel(sm.data()), produit: id, produitNom: prod.nom, prix: prod.prix, quantite: qte, total, statut: "payee", date: serverTimestamp(), txId: refTx.id });
      t.set(refTx, { de: uid, a: "etat", montant: total, date: serverTimestamp(), deP: sm.data().pseudo, aP: "État (boutique)", motif, commande: refC.id });
      t.update(refMoi, { sparcs: solde - total, derniereTx: refTx.id });
      if (typeof prod.stock === "number") t.update(refP, { stock: prod.stock - qte, derniereCommande: refC.id });
    });
    message($("#msg-boutique"), `Achat confirmé : ${qte} × ${p.nom} (${total} §). Un Consul va te livrer.`, "ok");
  } catch (e) { erreur("#msg-boutique", e); }
}

// ---------- Gestion des produits (Consuls) ----------
function editer(id) {
  const p = produits.find(x => x.id === id); if (!p) return;
  $("#p-id").value = id; $("#p-nom").value = p.nom; $("#p-icone").value = p.icone || ""; $("#p-desc").value = p.description || "";
  $("#p-prix").value = p.prix; $("#p-stock").value = typeof p.stock === "number" ? p.stock : ""; $("#p-actif").checked = !!p.actif;
  $("#p-btn").textContent = "Enregistrer"; $("#p-annuler").hidden = false;
  $("#f-produit").scrollIntoView({ behavior: "smooth", block: "center" });
}
function viderForm() { $("#f-produit").reset(); $("#p-id").value = ""; $("#p-btn").textContent = "Ajouter le produit"; $("#p-annuler").hidden = true; }
$("#p-annuler").onclick = viderForm;
$("#f-produit").onsubmit = async e => {
  e.preventDefault();
  const prix = parseInt($("#p-prix").value, 10), st = $("#p-stock").value.trim();
  if (!(prix > 0)) return message($("#msg-produit"), "Le prix doit être un entier plus grand que 0.", "erreur");
  if (st !== "" && !(parseInt(st, 10) >= 0)) return message($("#msg-produit"), "Le stock doit être un entier (ou vide pour illimité).", "erreur");
  const champs = { nom: $("#p-nom").value.trim(), icone: $("#p-icone").value.trim(), description: $("#p-desc").value.trim(), prix, stock: st === "" ? null : parseInt(st, 10), actif: $("#p-actif").checked };
  try {
    if ($("#p-id").value) { await updateDoc(doc(db, "produits", $("#p-id").value), champs); message($("#msg-produit"), "Produit modifié.", "ok"); }
    else { await addDoc(collection(db, "produits"), { ...champs, creeLe: serverTimestamp(), derniereCommande: null }); message($("#msg-produit"), "Produit ajouté à la boutique.", "ok"); }
    viderForm();
  } catch (err) { erreur("#msg-produit", err); }
};

// ---------- Commandes ----------
document.querySelectorAll("#filtres .onglet").forEach(b => b.onclick = () => { vue = b.dataset.v; document.querySelectorAll("#filtres .onglet").forEach(x => x.classList.toggle("on", x === b)); afficherCommandes(); });

function afficherCommandes() {
  const tri = [...commandes].sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
  if (!consul()) {
    $("#mes-commandes").innerHTML = tri.length ? tri.map(c => `<li><span class="moins">−${c.total} §</span><span>${c.quantite} × ${esc(c.produitNom)} · ${ETIQ[c.statut] || c.statut}</span><small>${dateFr(c.date)}</small></li>`).join("") : '<li class="vide">Aucune commande pour l\'instant.</li>';
    return;
  }
  $("#nb-payee").textContent = commandes.filter(c => c.statut === "payee").length || "";
  const liste = tri.filter(c => c.statut === vue);
  $("#commandes").innerHTML = liste.length ? liste.map(c => `<div class="bloc sans"><span class="tag">${ETIQ[c.statut]}</span>
    <h3>${c.quantite} × ${esc(c.produitNom)} <small>· ${c.total} §</small></h3>
    <p><small>Acheté par ${esc(c.acheteurP)} · ${dateFr(c.date)}</small></p>
    <div class="actions">${c.statut === "payee" ? `<button class="btn" data-livrer="${c.id}">Marquer livrée</button><button class="btn danger" data-annuler="${c.id}">Annuler et rembourser</button>` : ""}
    ${c.statut === "livree" ? `<button class="btn sec" data-relivrer="${c.id}">Remettre « à livrer »</button>` : ""}
    ${moi.chef ? `<button class="btn danger" data-effacer="${c.id}">Supprimer</button>` : ""}</div></div>`).join("") : '<p class="vide sans">Aucune commande ici.</p>';
  document.querySelectorAll("[data-livrer]").forEach(b => b.onclick = () => updateDoc(doc(db, "commandes", b.dataset.livrer), { statut: "livree" }).catch(e => erreur("#msg-commandes", e)));
  document.querySelectorAll("[data-relivrer]").forEach(b => b.onclick = () => updateDoc(doc(db, "commandes", b.dataset.relivrer), { statut: "payee" }).catch(e => erreur("#msg-commandes", e)));
  document.querySelectorAll("[data-annuler]").forEach(b => b.onclick = () => annuler(b.dataset.annuler));
  document.querySelectorAll("[data-effacer]").forEach(b => b.onclick = () => confirmer("Supprimer cette commande de l'historique ? (Ça ne rembourse pas.)") && deleteDoc(doc(db, "commandes", b.dataset.effacer)).catch(e => erreur("#msg-commandes", e)));
}

async function annuler(id) {
  const c = commandes.find(x => x.id === id); if (!c) return;
  if (!confirmer(`Annuler la commande et rembourser ${c.total} § à ${c.acheteurP} ?`)) return;
  try {
    const cit = await getDocs(query(collection(db, "users"), where("role", "==", "citoyen")));
    const circ = cit.docs.reduce((s, d) => s + (d.data().sparcs || 0), 0);
    if (circ + c.total > MAX_SPARCS) return message($("#msg-commandes"), `Impossible : le remboursement dépasserait ${MAX_SPARCS} Sparcs en circulation.`, "erreur");
    const acheteur = cit.docs.find(d => d.id === c.acheteur);
    if (!acheteur) return message($("#msg-commandes"), "L'acheteur n'est plus citoyen : il ne peut pas recevoir de Sparcs.", "erreur");
    const batch = writeBatch(db), refTx = doc(collection(db, "transactions"));
    batch.set(refTx, { de: "etat", a: c.acheteur, montant: c.total, date: serverTimestamp(), deP: "État (boutique)", aP: acheteur.data().pseudo, motif: `Remboursement : ${c.produitNom}`.slice(0, 80) });
    batch.update(doc(db, "users", c.acheteur), { sparcs: (acheteur.data().sparcs || 0) + c.total });
    batch.update(doc(db, "commandes", id), { statut: "annulee", rembourseTx: refTx.id });
    const p = produits.find(x => x.id === c.produit);
    if (p && typeof p.stock === "number") batch.update(doc(db, "produits", p.id), { stock: p.stock + c.quantite });
    await batch.commit();
    message($("#msg-commandes"), `Commande annulée, ${c.total} § remboursés.`, "ok");
  } catch (e) { erreur("#msg-commandes", e); }
}
