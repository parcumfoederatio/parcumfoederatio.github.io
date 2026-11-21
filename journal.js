import { auth, db, $, esc, message, erreurFr, confirmer } from "./parcum.js?v=21";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const SAISONS = ["Saison 1", "Saison 3", "Saison 2", "Saison 4", "Hors Série"]; // dans l'ordre où elles se sont passées
const CONSULS = ["Aylane", "Joe", "Maxime", "William", "Youri"];
let moi = null, mmt = [], vue = "toutes", stopJ = null, stopU = null;
const consul = () => moi?.role === "consul";
const membre = () => ["citoyen", "resident", "consul"].includes(moi?.role);

const dateLongue = iso => iso ? new Date(iso + "T12:00:00").toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
const etoiles = r => r == null ? "" : `<span title="${r}/5" style="color:#F2B705;letter-spacing:1px">${"★".repeat(Math.round(r))}${"☆".repeat(5 - Math.round(r))}</span> <small>${String(Math.round(r * 100) / 100).replace(".", ",")}/5</small>`;

onAuthStateChanged(auth, user => {
  if (stopU) { stopU(); stopU = null; }
  if (!user) return prive(`Le journal est réservé aux citoyens, aux résidents et aux Consuls. <a href="connexion.html">Connecte-toi</a> pour le lire.`);
  stopU = onSnapshot(doc(db, "users", user.uid), s => {
    moi = s.exists() ? s.data() : null;
    if (!membre()) { if (stopJ) { stopJ(); stopJ = null; } return prive(`Le journal est réservé aux citoyens, aux résidents et aux Consuls. <a href="compte.html">Fais ta demande de citoyenneté</a>.`); }
    $("#j-prive").hidden = true; $("#j-zone").hidden = false;
    $("#j-gestion").hidden = !consul(); $("#j-import").hidden = moi?.chef !== true;
    if (!stopJ) stopJ = onSnapshot(collection(db, "mmt"), q => { mmt = q.docs.map(d => ({ id: d.id, ...d.data() })); afficher(); }, e => message($("#j-msg"), erreurFr(e), "erreur"));
  });
});

function prive(html) { $("#j-zone").hidden = true; $("#j-prive").hidden = false; $("#j-prive").innerHTML = `<p>🔒 ${html}</p>`; }

// ---------- Formulaire (Consuls) ----------
$("#j-saison").innerHTML = SAISONS.map(s => `<option>${s}</option>`).join("");
$("#j-membres").innerHTML = CONSULS.map(c => `<label class="case" style="margin:0"><input type="checkbox" value="${c}"><span>${c}</span></label>`).join("");
function viderForm() { $("#j-form").reset(); $("#j-id").value = ""; $("#j-btn").textContent = "Ajouter au journal"; $("#j-annuler").hidden = true; $("#j-form-titre").textContent = "Ajouter un MMT"; $("#j-saison").value = "Saison 4"; }
viderForm();
$("#j-annuler").onclick = viderForm;
$("#j-form").onsubmit = async e => {
  e.preventDefault();
  const r = $("#j-rating").value.trim(), n = $("#j-reel").value.trim();
  const champs = {
    saison: $("#j-saison").value, titre: $("#j-titre").value.trim(), date: $("#j-date").value, endroit: $("#j-endroit").value.trim(),
    membres: [...document.querySelectorAll("#j-membres input:checked")].map(i => i.value),
    invites: $("#j-invites").value.split(",").map(x => x.trim()).filter(Boolean).slice(0, 30),
    reel: n === "" ? null : parseInt(n, 10), rating: r === "" ? null : Math.min(5, Math.max(0, parseFloat(r))), note: $("#j-note").value.trim()
  };
  try {
    if ($("#j-id").value) { await updateDoc(doc(db, "mmt", $("#j-id").value), champs); message($("#j-msg-form"), "MMT modifié.", "ok"); }
    else { await addDoc(collection(db, "mmt"), { ...champs, creeLe: serverTimestamp() }); message($("#j-msg-form"), "MMT ajouté au journal.", "ok"); }
    viderForm();
  } catch (err) { message($("#j-msg-form"), erreurFr(err), "erreur"); }
};
function editer(id) {
  const m = mmt.find(x => x.id === id); if (!m) return;
  $("#j-id").value = id; $("#j-saison").value = m.saison; $("#j-titre").value = m.titre; $("#j-date").value = m.date; $("#j-endroit").value = m.endroit || "";
  document.querySelectorAll("#j-membres input").forEach(i => i.checked = (m.membres || []).includes(i.value));
  $("#j-invites").value = (m.invites || []).join(", "); $("#j-reel").value = m.reel ?? ""; $("#j-rating").value = m.rating ?? ""; $("#j-note").value = m.note || "";
  $("#j-btn").textContent = "Enregistrer"; $("#j-annuler").hidden = false; $("#j-form-titre").textContent = `Modifier : ${m.titre}`;
  $("#j-gestion").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- Import du registre (fondateur) ----------
$("#j-fichier").onchange = async () => {
  const f = $("#j-fichier").files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.format !== "parcum-mmt-v1" || !Array.isArray(data.mmt)) throw new Error("Ce fichier n'est pas un fichier d'import du journal.");
    const cle = m => `${m.saison}|${m.date}|${m.titre}|${m.endroit || ""}`;
    const deja = new Set(mmt.map(cle));
    const nouveaux = data.mmt.filter(m => !deja.has(cle(m)));
    if (!nouveaux.length) return message($("#j-msg-form"), "Tout est déjà dans le journal.", "info");
    if (!await confirmer(`Importer ${nouveaux.length} MMT dans le journal ?`)) return;
    for (let i = 0; i < nouveaux.length; i += 10) {
      const b = writeBatch(db);
      nouveaux.slice(i, i + 10).forEach(m => b.set(doc(collection(db, "mmt")), {
        saison: m.saison, titre: m.titre, date: m.date, endroit: m.endroit || "", membres: m.membres || [], invites: m.invites || [],
        reel: m.reel ?? null, rating: m.rating ?? null, note: m.note || "", creeLe: serverTimestamp()
      }));
      await b.commit();
    }
    message($("#j-msg-form"), `${nouveaux.length} MMT importés.`, "ok");
  } catch (e) { message($("#j-msg-form"), erreurFr(e), "erreur"); }
  $("#j-fichier").value = "";
};

// ---------- Affichage ----------
function afficher() {
  const reels = mmt.filter(m => m.reel != null && m.saison !== "Hors Série").length;
  const notes = mmt.filter(m => m.rating != null), moy = notes.length ? notes.reduce((s, m) => s + m.rating, 0) / notes.length : null;
  const presences = Object.fromEntries(CONSULS.map(c => [c, mmt.filter(m => (m.membres || []).includes(c)).length]));
  const parPresence = Object.entries(presences).sort((a, b) => b[1] - a[1]);
  const assidu = parPresence[0], moinsAssidu = parPresence[parPresence.length - 1];
  const parNote = [...notes].sort((a, b) => b.rating - a.rating);
  const meilleur = parNote[0], pire = parNote[parNote.length - 1];
  const horsSerie = mmt.filter(m => m.saison === "Hors Série").length;
  const nomMMT = m => m ? `${esc(m.titre)} <small>(${esc(m.saison)})</small> · ${String(m.rating).replace(".", ",")}/5` : "—";
  const consulTx = c => c && mmt.length ? `${c[0]} (${c[1]})` : "—";
  // Deux rangées alignées : chaque tuile du bas complète celle du haut
  $("#j-stats").innerHTML = [
    ["MMT au journal", mmt.length], ["MMT officiels", reels], ["Consul le plus assidu", consulTx(assidu)], ["MMT le mieux noté", nomMMT(meilleur)],
    ["Note moyenne", moy != null ? String(Math.round(moy * 100) / 100).replace(".", ",") + "/5" : "—"], ["MMT hors série", horsSerie], ["Consul le moins assidu", consulTx(moinsAssidu)], ["MMT le moins bien noté", nomMMT(pire)]
  ].map(([t, v]) => `<div class="carte o" style="padding:14px 16px"><span class="tag">${t}</span><h3 style="font-size:1.25rem;margin-top:6px">${v}</h3></div>`).join("");

  const comptes = Object.fromEntries(SAISONS.map(s => [s, mmt.filter(m => m.saison === s).length]));
  $("#j-filtres").innerHTML = [["toutes", "Tous", mmt.length], ...SAISONS.map(s => [s, s, comptes[s]])]
    .map(([v, t, n]) => `<button class="onglet ${vue === v ? "on" : ""}" data-v="${v}">${t}<span class="nb">${n || ""}</span></button>`).join("");
  document.querySelectorAll("#j-filtres .onglet").forEach(b => b.onclick = () => { vue = b.dataset.v; afficher(); });

  const liste = mmt.filter(m => vue === "toutes" || m.saison === vue).sort((a, b) => (a.date || "").localeCompare(b.date || "")); // du plus ancien au plus récent
  $("#j-liste").innerHTML = liste.length ? liste.map(m => `<div class="bloc mmt-entree">
      <div class="mmt-tete"><span class="tag sans">${esc(m.saison)}${m.reel != null ? ` · n° ${m.reel}` : ""}</span>${m.rating != null ? `<span class="sans">${etoiles(m.rating)}</span>` : ""}</div>
      <h3>${esc(m.titre)}${m.endroit ? ` <small>· ${esc(m.endroit)}</small>` : ""}</h3>
      <p class="sans mini" style="margin-top:2px">${dateLongue(m.date)}</p>
      ${(m.membres || []).length ? `<p class="sans" style="margin-top:8px">${CONSULS.map(c => `<span class="puce ${(m.membres || []).includes(c) ? "on" : ""}">${c}</span>`).join(" ")}</p>` : ""}
      ${(m.invites || []).length ? `<p class="sans mini" style="margin-top:6px">⭐ Invités spéciaux : ${m.invites.map(esc).join(", ")}</p>` : ""}
      ${m.note ? `<p style="margin-top:8px">${esc(m.note)}</p>` : ""}
      ${consul() ? `<div class="actions sans"><button class="btn sec" data-editer="${m.id}">Modifier</button><button class="btn danger" data-suppr="${m.id}">Supprimer</button></div>` : ""}
    </div>`).join("") : '<p class="vide sans">Aucun MMT ici pour l\'instant.</p>';
  document.querySelectorAll("[data-editer]").forEach(b => b.onclick = () => editer(b.dataset.editer));
  document.querySelectorAll("[data-suppr]").forEach(b => b.onclick = async () => { if (await confirmer("Supprimer ce MMT du journal ?")) deleteDoc(doc(db, "mmt", b.dataset.suppr)).catch(e => message($("#j-msg"), erreurFr(e), "erreur")); });
}
