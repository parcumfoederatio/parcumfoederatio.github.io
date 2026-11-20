// Module commun : connexion à Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator, doc as _doc, setDoc as _setDoc, serverTimestamp as _ts } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import qrcode from "./qrcode.mjs";
import { firebaseConfig } from "./firebase-config.js?v=18";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Tests locaux seulement
if (["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).has("emu")) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = s => document.querySelector(s);
export const COULEURS = { orange: "#F28C28", rouge: "#C8090A", mauve: "#7B3FA0", bleu: "#2B4F9E", vert: "#1E6B3A", noir: "#1b1b1f", pourpre: "#6E1440" };
export const ROLES = { visiteur: "Visiteur", resident: "Résident permanent", citoyen: "Citoyen", consul: "Consul du MMT" };
export const numero = n => n == null ? "—" : "PF-" + String(n).padStart(3, "0");
export const dateFr = t => t?.toDate ? t.toDate().toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" }) : "—";
export const MAX_SPARCS = 121;
// Sièges du Sénat : un par province ; les territoires ont un observateur sans droit de vote (Décret n°017)
export const PROVINCES = ["Saint-Paul-de-la-Croix", "Ahuntsic", "Sauvé", "Fleury", "Guzzo", "Desjardins", "Gouin", "Toilettes mixtes du CVM"];
export const TERRITOIRES = ["Place Fairfield"];
export const estSenateurVotant = u => !!u && PROVINCES.includes(u.senat);
// Nom officiel (prénom + nom) ; le pseudo sert de secours pour les vieux comptes
export const nomOfficiel = u => [u?.prenom, u?.nom].filter(Boolean).join(" ") || u?.pseudo || "?";

export function message(el, texte, type = "info") {
  el.innerHTML = texte ? `<div class="msg ${type}">${esc(texte)}</div>` : "";
}

export function erreurFr(e) {
  const c = e?.code || "";
  const m = {
    "auth/invalid-email": "Le courriel n'est pas valide.",
    "auth/email-already-in-use": "Ce courriel a déjà un compte. Connecte-toi plutôt.",
    "auth/weak-password": "Le mot de passe doit avoir au moins 6 caractères.",
    "auth/invalid-credential": "Courriel ou mot de passe incorrect.",
    "auth/wrong-password": "Courriel ou mot de passe incorrect.",
    "auth/user-not-found": "Aucun compte avec ce courriel.",
    "auth/too-many-requests": "Trop d'essais. Attends un peu et réessaie.",
    "auth/network-request-failed": "Problème de connexion Internet.",
    "permission-denied": "Action refusée : tu n'as pas la permission.",
  };
  return m[c] || ("Erreur : " + (e?.message || c));
}

// Confirmation dans la page (les fenêtres du navigateur peuvent être bloquées par Chrome)
export function confirmer(texte) {
  return new Promise(ok => {
    const fond = document.createElement("div");
    fond.className = "confirm-fond sans";
    fond.innerHTML = `<div class="confirm-boite" role="dialog" aria-modal="true"><p>${esc(texte)}</p><div class="actions"><button class="btn" data-oui>Confirmer</button><button class="btn sec" data-non>Annuler</button></div></div>`;
    const fin = r => { document.removeEventListener("keydown", touche); fond.remove(); ok(r); };
    const touche = e => { if (e.key === "Escape") fin(false); if (e.key === "Enter") fin(true); };
    fond.querySelector("[data-oui]").onclick = () => fin(true);
    fond.querySelector("[data-non]").onclick = () => fin(false);
    fond.onclick = e => { if (e.target === fond) fin(false); };
    document.addEventListener("keydown", touche);
    document.body.appendChild(fond);
    fond.querySelector("[data-oui]").focus();
  });
}

// Carte de citoyen numérique
// ---------- Carte vérifiable (QR code) ----------
// Copie publique et minimale du profil, que n'importe qui peut lire en scannant le QR
export const projectionCarte = u => ({
  prenom: u.prenom ?? null, nom: u.nom ?? null, pseudo: u.pseudo ?? null, citoyenNo: u.citoyenNo ?? null,
  role: u.role, couleur: u.couleur ?? null, senat: u.senat ?? null, juge: u.juge === true, chef: u.chef === true
});
export const memeCarte = (a, b) => !!a && Object.keys(b).every(k => (a[k] ?? null) === (b[k] ?? null));
export function syncCarte(id, u, actuelle) {
  if (!u || !id) return;
  const p = projectionCarte(u);
  if (memeCarte(actuelle, p)) return;
  return _setDoc(_doc(db, "cartes", id), { ...p, maj: _ts() }).catch(() => {});
}
export const lienVerif = id => { const url = new URL("verifier.html", location.href); url.search = "?c=" + encodeURIComponent(id); url.hash = ""; return url.href; };
export function qrSVG(texte) { const q = qrcode(0, "M"); q.addData(texte); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }

export function carteHTML(u, photo, id) {
  const coul = COULEURS[u.couleur] || "#c9c4b8";
  let statut = u.role === "consul" && u.chef === true ? "Consul fondateur" : (ROLES[u.role] || u.role);
  if (u.juge && !u.chef) statut += " · Juge suppléant";
  if (u.senat) statut += TERRITOIRES.includes(u.senat) ? ` · Observateur de ${u.senat}` : ` · Sénateur de ${u.senat}`;
  return `<div class="carte-id" style="--cc:${coul}">
    <div class="ci-haut"><img src="embleme.png" alt=""><div><div class="ci-pays">PARCUM FŒDERATIO</div><div class="ci-type">${u.role === "visiteur" ? "Compte visiteur" : u.role === "resident" ? "Carte de résident permanent" : "Carte de citoyen"}</div></div></div>
    <div class="ci-milieu">
      <div class="ci-photo">${photo ? `<img src="${photo}" alt="Photo de ${esc(nomOfficiel(u))}">` : `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4.2" fill="currentColor"/><path d="M3.5 21c.9-4.4 4.3-6.8 8.5-6.8s7.6 2.4 8.5 6.8" fill="currentColor"/></svg>`}</div>
      <div class="ci-nom">${esc(nomOfficiel(u))}${u.prenom || u.nom ? `<small class="ci-pseudo">« ${esc(u.pseudo)} »</small>` : ""}</div>
    </div>
    <div class="ci-grille">
      <div><span>Statut</span><b>${esc(statut)}</b></div>
      <div><span>N° de citoyenneté</span><b>${numero(u.citoyenNo)}</b></div>
      <div><span>Couleur</span><b>${u.couleur ? `<i class="pastille" style="background:${coul}"></i>${esc(u.couleur)}` : "—"}</b></div>
      <div><span>Membre depuis</span><b>${dateFr(u.creeLe)}</b></div>
    </div>
    <div class="ci-bas"><div class="ci-devise">« Que le Parc nous accepte et nous guide »</div>${id ? `<a class="ci-qr" href="${lienVerif(id)}" target="_blank" rel="noopener" title="Scanner pour vérifier la carte">${qrSVG(lienVerif(id))}</a>` : ""}</div>
  </div>`;
}
