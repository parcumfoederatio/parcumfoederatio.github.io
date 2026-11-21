// Sauvegarde complète de la base (Consul fondateur seulement)
import { auth, db, $ } from "./parcum.js?v=23";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, getDocs, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLLECTIONS = ["users", "demandes", "brouillons", "transactions", "lois", "affaires", "produits", "commandes", "cartes", "mmt", "journal", "marche", "elections"];

onAuthStateChanged(auth, user => {
  if (!user) return;
  onSnapshot(doc(db, "users", user.uid), s => { $("#z-sauvegarde").hidden = !(s.exists() && s.data().chef === true); });
});

// Les dates Firestore deviennent des dates lisibles (ISO)
const propre = v => v && typeof v.toDate === "function" ? v.toDate().toISOString() : Array.isArray(v) ? v.map(propre) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, propre(x)])) : v;

$("#btn-sauvegarde").onclick = async () => {
  const m = $("#msg-sauvegarde"); m.textContent = "Préparation…";
  const sortie = { site: "parcumfoederatio.github.io", date: new Date().toISOString(), collections: {} };
  const erreurs = [];
  for (const c of COLLECTIONS) {
    try { const q = await getDocs(collection(db, c)); sortie.collections[c] = Object.fromEntries(q.docs.map(d => [d.id, propre(d.data())])); }
    catch (e) { erreurs.push(c); }
  }
  try { const p = await getDoc(doc(db, "senat", "presidence")); if (p.exists()) sortie.collections.senat = { presidence: propre(p.data()) }; } catch { erreurs.push("senat"); }
  const url = URL.createObjectURL(new Blob([JSON.stringify(sortie, null, 1)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = `sauvegarde-parcum-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  const total = Object.values(sortie.collections).reduce((s, x) => s + Object.keys(x).length, 0);
  m.textContent = `✅ ${total} éléments sauvegardés.` + (erreurs.length ? ` (Pas pu lire : ${erreurs.join(", ")})` : "");
};
