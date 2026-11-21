import { db, $, esc, numero, COULEURS, ROLES, TERRITOIRES, dateFr } from "./parcum.js?v=20";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const id = new URLSearchParams(location.search).get("c");
const z = $("#verif");

function afficher(etat, titre, texte, carte) {
  z.innerHTML = `<div class="verif-etat">${etat}</div><h2>${titre}</h2><p>${texte}</p>${carte || ""}<p class="note sans" style="margin-top:18px">Vérifié le ${new Date().toLocaleString("fr-CA", { dateStyle: "long", timeStyle: "short" })} sur le site officiel de la Parcum Fœderatio.</p>`;
}

async function verifier() {
  if (!id || !/^[A-Za-z0-9]{10,40}$/.test(id)) return afficher("❌", "Carte invalide", "Ce QR code ne correspond à aucune carte de la Fédération.");
  try {
    const s = await getDoc(doc(db, "cartes", id));
    if (!s.exists()) return afficher("❌", "Carte introuvable", "Aucune carte de la Fédération ne correspond à ce QR code. Elle a peut-être été annulée.");
    const c = s.data(), nom = [c.prenom, c.nom].filter(Boolean).join(" ") || c.pseudo || "?";
    const coul = COULEURS[c.couleur] || "#c9c4b8";
    let statut = c.role === "consul" && c.chef ? "Consul fondateur" : (ROLES[c.role] || c.role);
    if (c.juge && !c.chef) statut += " · Juge suppléant";
    if (c.senat) statut += TERRITOIRES.includes(c.senat) ? ` · Observateur de ${c.senat}` : ` · Sénateur de ${c.senat}`;
    const carte = `<div class="carte-id" style="--cc:${coul}">
      <div class="ci-haut"><img src="embleme.png" alt=""><div><div class="ci-pays">PARCUM FŒDERATIO</div><div class="ci-type">Vérification officielle</div></div></div>
      <div class="ci-milieu"><div class="ci-nom">${esc(nom)}</div></div>
      <div class="ci-grille">
        <div><span>Statut</span><b>${esc(statut)}</b></div>
        <div><span>N° de citoyenneté</span><b>${numero(c.citoyenNo)}</b></div>
        <div><span>Couleur</span><b>${c.couleur ? `<i class="pastille" style="background:${coul}"></i>${esc(c.couleur)}` : "—"}</b></div>
        <div><span>Mise à jour</span><b>${dateFr(c.maj)}</b></div>
      </div></div>`;
    if (["citoyen", "consul"].includes(c.role)) afficher("✅", "Citoyen valide", `<b>${esc(nom)}</b> est ${c.role === "consul" ? "Consul et citoyen" : "citoyen"} de la Parcum Fœderatio.`, carte);
    else if (c.role === "resident") afficher("🟡", "Résident permanent", `<b>${esc(nom)}</b> est résident permanent de la Parcum Fœderatio. Il n'est pas citoyen.`, carte);
    else afficher("🟠", "Pas citoyen", `<b>${esc(nom)}</b> a un compte visiteur : ce n'est pas une carte de citoyen.`, carte);
  } catch (e) { afficher("⚠️", "Vérification impossible", "Le site n'a pas pu joindre le registre. Réessaie dans un instant."); }
}
verifier();
