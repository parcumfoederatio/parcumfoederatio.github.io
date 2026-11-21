// Textes publiés en ligne au Journal officiel (après validation du Consul fondateur)
import { db, $, esc, dateFr } from "./parcum.js?v=19";
import { onSnapshot, collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

onSnapshot(collection(db, "journal"), q => {
  const j = q.docs.map(d => d.data()).sort((a, b) => (b.publieLe?.seconds || 0) - (a.publieLe?.seconds || 0));
  $("#jo-en-ligne").innerHTML = j.map(x => `<details class="decret"><summary>${x.type === "loi" ? "Loi" : "Décret"} n°${esc(x.numero)} — ${esc(x.titre)} <span class="tag sans" style="margin-left:6px">Nouveau</span></summary>
    <div class="corps">${esc(x.contenu).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("")}<p class="note sans">Publié au Journal officiel le ${dateFr(x.publieLe)}${x.type === "loi" ? " · adoptée par le Sénat et le Conseil du MMT" : " · adopté par le Conseil du MMT"}.</p></div></details>`).join("");
}, () => {});
