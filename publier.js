// Journal officiel : le Consul fondateur valide chaque texte adopté avant qu'il soit publié dans Documents
import { auth, db, $, esc, message, erreurFr, dateFr, confirmer } from "./parcum.js?v=20";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, onSnapshot, collection, query, where, writeBatch, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let decrets = [], lois = [], journal = [], lance = false;
const msg = (t, type) => message($("#msg-publier"), t, type);

onAuthStateChanged(auth, user => {
  if (!user) return;
  onSnapshot(doc(db, "users", user.uid), s => {
    const chef = s.exists() && s.data().chef === true;
    $("#t-publier").hidden = !chef;
    if (!chef || lance) return;
    lance = true;
    onSnapshot(query(collection(db, "brouillons"), where("statut", "==", "adopte")), q => { decrets = q.docs.map(d => ({ id: d.id, src: "brouillons", type: "decret", ...d.data() })); afficher(); });
    onSnapshot(query(collection(db, "lois"), where("statut", "==", "adoptee")), q => { lois = q.docs.map(d => ({ id: d.id, src: "lois", type: "loi", ...d.data() })); afficher(); });
    onSnapshot(collection(db, "journal"), q => { journal = q.docs.map(d => ({ id: d.id, ...d.data() })); afficher(); });
  });
});

// Prochain numéro libre : les décrets continuent après le n°030 publié à la main
function prochain(type) {
  const nums = journal.filter(j => j.type === type).map(j => parseInt(String(j.numero).replace(/\D/g, ""), 10)).filter(n => n > 0);
  const n = Math.max(type === "decret" ? 30 : 0, ...nums) + 1;
  return String(n).padStart(3, "0");
}

function afficher() {
  const attente = [...decrets, ...lois].filter(x => !x.publie).sort((a, b) => (a.creeLe?.seconds || 0) - (b.creeLe?.seconds || 0));
  $("#nb-publier").textContent = attente.length || "";
  $("#a-publier").innerHTML = attente.length ? attente.map(x => `<div class="bloc sans">
      <span class="tag">${x.type === "decret" ? "Décret adopté par le Conseil" : "Loi adoptée par le Sénat et le Conseil"}</span>
      <h3>${esc(x.titre)}</h3><p><small>Proposé par ${esc(x.auteurP || "?")} · ${dateFr(x.creeLe)}</small></p>
      <form class="formu" data-form-pub="${x.id}" style="max-width:none;margin-top:10px">
        <label>Type<select name="type"><option value="decret" ${x.type === "decret" ? "selected" : ""}>Décret</option><option value="loi" ${x.type === "loi" ? "selected" : ""}>Loi</option></select></label>
        <label>Numéro<input name="numero" maxlength="20" required value="${prochain(x.type)}"></label>
        <label>Titre<input name="titre" maxlength="160" required value="${esc(x.titre.replace(/^D[ée]cret\s*n°\s*[\w-]+\s*[—–-]\s*/i, ""))}"></label>
        <label>Texte publié<textarea name="contenu" maxlength="20000" required style="min-height:140px">${esc(x.contenu || "")}</textarea></label>
        <div class="actions"><button class="btn" type="submit">✅ Publier au Journal officiel</button><button class="btn sec" type="button" data-ignorer="${x.src}|${x.id}">Ne pas publier</button></div>
      </form></div>`).join("") : '<p class="vide sans">Rien à publier pour l\'instant.</p>';
  document.querySelectorAll("[data-form-pub]").forEach(f => f.onsubmit = e => { e.preventDefault(); publier(attente.find(x => x.id === f.dataset.formPub), f); });
  document.querySelectorAll("[data-ignorer]").forEach(b => b.onclick = async () => {
    const [src, id] = b.dataset.ignorer.split("|");
    if (!await confirmer("Ne pas publier ce texte ? Il restera adopté, mais n'apparaîtra pas dans Documents.")) return;
    const batch = writeBatch(db); batch.update(doc(db, src, id), { publie: "ignore" });
    batch.commit().catch(e => msg(erreurFr(e), "erreur"));
  });

  const pub = [...journal].sort((a, b) => (b.publieLe?.seconds || 0) - (a.publieLe?.seconds || 0));
  $("#publies").innerHTML = pub.length ? pub.map(j => `<div class="bloc sans"><span class="tag">${j.type === "decret" ? "Décret" : "Loi"} n°${esc(j.numero)}</span>
      <h3>${esc(j.titre)}</h3><p><small>Publié le ${dateFr(j.publieLe)}</small></p>
      <div class="actions"><button class="btn danger" data-retirer="${j.id}">Retirer du Journal officiel</button></div></div>`).join("") : '<p class="vide sans">Aucun texte publié en ligne pour l\'instant.</p>';
  document.querySelectorAll("[data-retirer]").forEach(b => b.onclick = async () => {
    const j = journal.find(x => x.id === b.dataset.retirer);
    if (!await confirmer(`Retirer « ${j.titre} » du Journal officiel ? Il reviendra dans « À publier ».`)) return;
    const batch = writeBatch(db);
    batch.delete(doc(db, "journal", j.id));
    if (j.source && j.sourceId) batch.update(doc(db, j.source, j.sourceId), { publie: deleteField() });
    batch.commit().then(() => msg("Texte retiré du Journal officiel.", "ok")).catch(e => msg(erreurFr(e), "erreur"));
  });
}

async function publier(x, f) {
  if (!x) return;
  const fd = new FormData(f), type = fd.get("type"), numero = String(fd.get("numero")).trim();
  if (journal.some(j => j.type === type && String(j.numero) === numero)) return msg(`Le ${type === "decret" ? "décret" : "la loi"} n°${numero} existe déjà au Journal officiel.`, "erreur");
  if (!await confirmer(`Publier ${type === "decret" ? "le Décret" : "la Loi"} n°${numero} au Journal officiel ? Il sera visible par tout le monde dans Documents.`)) return;
  const batch = writeBatch(db), ref = doc(collection(db, "journal"));
  batch.set(ref, { type, numero, titre: String(fd.get("titre")).trim(), contenu: String(fd.get("contenu")).trim(), source: x.src, sourceId: x.id, publieLe: serverTimestamp() });
  batch.update(doc(db, x.src, x.id), { publie: ref.id });
  try { await batch.commit(); msg(`${type === "decret" ? "Décret" : "Loi"} n°${numero} publié au Journal officiel.`, "ok"); }
  catch (e) { msg(erreurFr(e), "erreur"); }
}
