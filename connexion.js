import { auth, db, $, message, erreurFr } from "./parcum.js?v=4";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const suite = () => location.href = "compte.html" + location.search;
let enCreation = false;
onAuthStateChanged(auth, u => { if (u && !enCreation) suite(); });

document.querySelectorAll(".onglet").forEach(b => b.onclick = () => {
  document.querySelectorAll(".onglet").forEach(x => x.classList.toggle("on", x === b));
  $("#f-connexion").hidden = b.dataset.v !== "connexion";
  $("#f-inscription").hidden = b.dataset.v !== "inscription";
  message($("#msg"), "");
});

$("#f-connexion").onsubmit = async e => {
  e.preventDefault();
  try { await signInWithEmailAndPassword(auth, $("#c-email").value.trim(), $("#c-mdp").value); }
  catch (err) { message($("#msg"), erreurFr(err), "erreur"); }
};

$("#f-inscription").onsubmit = async e => {
  e.preventDefault();
  const pseudo = $("#i-pseudo").value.trim();
  if (pseudo.length < 2 || pseudo.length > 30) return message($("#msg"), "Le pseudo doit avoir entre 2 et 30 caractères.", "erreur");
  if ($("#i-mdp").value !== $("#i-mdp2").value) return message($("#msg"), "Les deux mots de passe sont différents.", "erreur");
  enCreation = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, $("#i-email").value.trim(), $("#i-mdp").value);
    await updateProfile(cred.user, { displayName: pseudo });
    await setDoc(doc(db, "users", cred.user.uid), { pseudo, role: "visiteur", citoyenNo: null, couleur: null, sparcs: 0, creeLe: serverTimestamp(), derniereTx: null });
    suite();
  } catch (err) { enCreation = false; message($("#msg"), erreurFr(err), "erreur"); }
};

$("#oubli").onclick = async () => {
  const email = $("#c-email").value.trim();
  if (!email) return message($("#msg"), "Écris ton courriel en haut, puis clique encore sur « Mot de passe oublié ».", "erreur");
  try { await sendPasswordResetEmail(auth, email); message($("#msg"), "Un courriel pour changer ton mot de passe a été envoyé.", "ok"); }
  catch (err) { message($("#msg"), erreurFr(err), "erreur"); }
};
