// Module commun : connexion à Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

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
export const COULEURS = { orange: "#F28C28", rouge: "#C8090A", mauve: "#7B3FA0", bleu: "#2B4F9E", magenta: "#C2187A", noir: "#1b1b1f" };
export const ROLES = { visiteur: "Visiteur", citoyen: "Citoyen", consul: "Consul du MMT" };
export const numero = n => n == null ? "—" : "PF-" + String(n).padStart(3, "0");
export const dateFr = t => t?.toDate ? t.toDate().toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" }) : "—";
export const MAX_SPARCS = 121;

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

// Carte de citoyen numérique
export function carteHTML(u) {
  const coul = COULEURS[u.couleur] || "#c9c4b8";
  const statut = ROLES[u.role] || u.role;
  return `<div class="carte-id" style="--cc:${coul}">
    <div class="ci-haut"><img src="embleme.png" alt=""><div><div class="ci-pays">PARCUM FŒDERATIO</div><div class="ci-type">${u.role === "visiteur" ? "Compte visiteur" : "Carte de citoyen"}</div></div></div>
    <div class="ci-nom">${esc(u.pseudo)}</div>
    <div class="ci-grille">
      <div><span>Statut</span><b>${esc(statut)}</b></div>
      <div><span>N° de citoyenneté</span><b>${numero(u.citoyenNo)}</b></div>
      <div><span>Couleur</span><b>${u.couleur ? `<i class="pastille" style="background:${coul}"></i>${esc(u.couleur)}` : "—"}</b></div>
      <div><span>Membre depuis</span><b>${dateFr(u.creeLe)}</b></div>
    </div>
    <div class="ci-devise">« Que le Parc nous accepte et nous guide »</div>
  </div>`;
}
