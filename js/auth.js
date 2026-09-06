// ==========================================================================
// MAKTABA — AUTH (Connexion / Inscription) — CONNECTÉ À SUPABASE
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    // ==========================================
    // ÉLÉMENTS
    // ==========================================
    let formConnexion = document.getElementById("form-connexion");
    let formInscription = document.getElementById("form-inscription");
    let titreAuth = document.getElementById("titre-auth");
    let descriptionAuth = document.getElementById("description-auth");
    let lienVersInscription = document.getElementById("lien-vers-inscription");
    let lienVersConnexion = document.getElementById("lien-vers-connexion");
    let messageConnexion = document.getElementById("message-connexion");
    let messageInscription = document.getElementById("message-inscription");

    let onglets = document.getElementById("onglets-segment");
    let ongletBtnConnexion = document.getElementById("onglet-btn-connexion");
    let ongletBtnInscription = document.getElementById("onglet-btn-inscription");

    // ==========================================
    // HELPERS MESSAGES
    // ==========================================
    function afficherMessage(element, texte, type) {
        if (!element) return;
        element.hidden = false;
        element.textContent = texte;
        element.classList.remove("erreur", "succes");
        element.classList.add(type);
    }

    function cacherMessages() {
        if (messageConnexion) messageConnexion.hidden = true;
        if (messageInscription) messageInscription.hidden = true;
    }

    // ==========================================
    // 🧭 TRADUCTION DES ERREURS SUPABASE EN FRANÇAIS
    // ==========================================
    function traduireErreur(erreur) {
        if (!erreur) return "Une erreur inconnue est survenue.";

        let message = erreur.message || "";

        if (message.includes("Invalid login credentials")) {
            return "Adresse email ou mot de passe incorrect.";
        }
        if (message.includes("User already registered")) {
            return "Un compte existe déjà avec cette adresse email.";
        }
        if (message.includes("Password should be at least")) {
            return "Le mot de passe doit contenir au moins 6 caractères.";
        }
        if (message.includes("Unable to validate email address")) {
            return "Adresse email invalide.";
        }
        if (message.includes("Email not confirmed")) {
            return "Merci de confirmer votre adresse email avant de vous connecter.";
        }
        if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
            return "Impossible de contacter le serveur. Vérifiez votre connexion internet.";
        }

        return message || "Une erreur inconnue est survenue."; // fallback : message brut de Supabase si non reconnu
    }

    // ==========================================
    // ✨ FONCTION DE BASCULE AVEC ANIMATION
    // ==========================================
    function activerMode(mode) {
        let estConnexion = mode === "connexion";

        let formActif = estConnexion ? formConnexion : formInscription;
        let formInactif = estConnexion ? formInscription : formConnexion;

        if (!formActif || !formInactif) return;

        if (onglets) onglets.dataset.actif = mode;
        if (ongletBtnConnexion) ongletBtnConnexion.classList.toggle("actif", estConnexion);
        if (ongletBtnInscription) ongletBtnInscription.classList.toggle("actif", !estConnexion);

        formInactif.classList.add("masque-transition");
        if (titreAuth) titreAuth.classList.add("texte-masque");
        if (descriptionAuth) descriptionAuth.classList.add("texte-masque");

        setTimeout(() => {
            formInactif.hidden = true;
            formActif.hidden = false;
            formActif.classList.add("masque-transition");

            if (titreAuth) {
                titreAuth.textContent = estConnexion ? "Bon retour" : "Créer un compte";
            }
            if (descriptionAuth) {
                descriptionAuth.textContent = estConnexion
                    ? "Connectez-vous pour retrouver vos lectures."
                    : "Rejoignez Maktaba pour sauvegarder vos favoris.";
            }

            cacherMessages();

            setTimeout(() => {
                formActif.classList.remove("masque-transition");
                if (titreAuth) titreAuth.classList.remove("texte-masque");
                if (descriptionAuth) descriptionAuth.classList.remove("texte-masque");
            }, 50);

        }, 300);
    }

    // ==========================================
    // ÉCOUTEURS DE BASCULE (onglets + liens texte)
    // ==========================================
    if (ongletBtnConnexion) {
        ongletBtnConnexion.addEventListener("click", () => activerMode("connexion"));
    }

    if (ongletBtnInscription) {
        ongletBtnInscription.addEventListener("click", () => activerMode("inscription"));
    }

    if (lienVersInscription) {
        lienVersInscription.addEventListener("click", (e) => {
            e.preventDefault();
            activerMode("inscription");
        });
    }

    if (lienVersConnexion) {
        lienVersConnexion.addEventListener("click", (e) => {
            e.preventDefault();
            activerMode("connexion");
        });
    }

    // ==========================================
    // AFFICHER / MASQUER MOT DE PASSE
    // ==========================================
    document.querySelectorAll(".bouton-oeil").forEach((bouton) => {
        bouton.addEventListener("click", () => {
            let idCible = bouton.getAttribute("data-cible");
            let input = document.getElementById(idCible);
            let icone = bouton.querySelector("i");
            if (!input || !icone) return;

            let estCache = input.type === "password";
            input.type = estCache ? "text" : "password";

            icone.classList.toggle("fa-eye", !estCache);
            icone.classList.toggle("fa-eye-slash", estCache);
        });
    });

    // ==========================================
    // ✅ VALIDATION EMAIL EN TEMPS RÉEL
    // ==========================================
    document.querySelectorAll('input[type="email"]').forEach((input) => {
        input.addEventListener("input", () => {
            let valide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value);
            input.classList.toggle("champ-valide", valide);
            input.classList.toggle("champ-invalide", input.value.length > 0 && !valide);
        });
    });

    // ==========================================
    // 🔒 INDICATEUR DE FORCE DU MOT DE PASSE
    // ==========================================
    let mdpInscription = document.getElementById("mot-de-passe-inscription");
    let forceConteneur = document.getElementById("force-mdp-conteneur");

    if (mdpInscription && forceConteneur) {
        let texteForce = forceConteneur.querySelector(".texte-force-mdp b");

        mdpInscription.addEventListener("input", () => {
            let valeur = mdpInscription.value;
            forceConteneur.classList.toggle("actif", valeur.length > 0);

            let score = 0;
            if (valeur.length >= 6) score++;
            if (valeur.length >= 10) score++;
            if (/[A-Z]/.test(valeur) && /[0-9]/.test(valeur)) score++;
            if (/[^A-Za-z0-9]/.test(valeur)) score++;

            let libelles = ["Faible", "Moyen", "Bon", "Excellent"];
            forceConteneur.dataset.force = score;
            if (texteForce) {
                texteForce.textContent = score > 0 ? libelles[score - 1] : "—";
            }
        });
    }

    // ==========================================
    // 🔁 VÉRIFICATION CONFIRMATION MOT DE PASSE
    // ==========================================
    let confirmMdp = document.getElementById("confirm-mot-de-passe");

    if (confirmMdp && mdpInscription) {
        confirmMdp.addEventListener("input", () => {
            let correspond = confirmMdp.value === mdpInscription.value && confirmMdp.value.length > 0;
            confirmMdp.classList.toggle("champ-valide", correspond);
            confirmMdp.classList.toggle("champ-invalide", confirmMdp.value.length > 0 && !correspond);
        });
    }

    // ==========================================
    // ⏳ HELPER : ÉTAT DE CHARGEMENT SUR UN BOUTON
    // ==========================================
    function activerChargement(bouton, actif) {
        if (!bouton) return;
        let spinner = bouton.querySelector(".icone-spinner");
        bouton.classList.toggle("chargement", actif);
        bouton.disabled = actif;
        if (spinner) spinner.hidden = !actif;
    }

    // ==========================================
    // 🔐 SOUMISSION — CONNEXION (RÉELLE, VIA SUPABASE)
    // ==========================================
    if (formConnexion) {
        formConnexion.addEventListener("submit", async (e) => {
            e.preventDefault();

            if (!supabaseClient) {
                afficherMessage(messageConnexion, "Service indisponible pour le moment. Réessayez plus tard.", "erreur");
                return;
            }

            let email = document.getElementById("email-connexion").value.trim();
            let motDePasse = document.getElementById("mot-de-passe-connexion").value;
            let bouton = formConnexion.querySelector(".bouton-auth-pleine-largeur");

            cacherMessages();
            activerChargement(bouton, true);

            try {
                const { data, error } = await supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: motDePasse,
                });

                if (error) {
                    afficherMessage(messageConnexion, traduireErreur(error), "erreur");
                    return;
                }

                afficherMessage(messageConnexion, "Connexion réussie ! Redirection en cours...", "succes");

                setTimeout(() => {
                    window.location.href = "../index.html";
                }, 1200);
            } catch (erreur) {
                afficherMessage(messageConnexion, traduireErreur(erreur), "erreur");
            } finally {
                activerChargement(bouton, false);
            }
        });
    }

    // ==========================================
    // 🆕 SOUMISSION — INSCRIPTION (RÉELLE, VIA SUPABASE)
    // ==========================================
    if (formInscription) {
        formInscription.addEventListener("submit", async (e) => {
            e.preventDefault();

            if (!supabaseClient) {
                afficherMessage(messageInscription, "Service indisponible pour le moment. Réessayez plus tard.", "erreur");
                return;
            }

            let nom = document.getElementById("nom-inscription").value.trim();
            let email = document.getElementById("email-inscription").value.trim();
            let motDePasse = document.getElementById("mot-de-passe-inscription").value;
            let confirmation = document.getElementById("confirm-mot-de-passe").value;
            let accepteConditions = document.getElementById("accepter-conditions").checked;
            let bouton = formInscription.querySelector(".bouton-auth-pleine-largeur");

            cacherMessages();

            // Validations côté client avant d'appeler Supabase
            if (motDePasse !== confirmation) {
                afficherMessage(messageInscription, "Les mots de passe ne correspondent pas.", "erreur");
                return;
            }

            if (!accepteConditions) {
                afficherMessage(messageInscription, "Vous devez accepter les conditions pour continuer.", "erreur");
                return;
            }

            activerChargement(bouton, true);

            try {
                const { data, error } = await supabaseClient.auth.signUp({
                    email: email,
                    password: motDePasse,
                    options: {
                        data: {
                            nom_complet: nom, // récupéré par le trigger SQL pour remplir "profils"
                        },
                    },
                });

                if (error) {
                    afficherMessage(messageInscription, traduireErreur(error), "erreur");
                    return;
                }

                // 🔍 Si Supabase renvoie directement une session,
                // cela signifie que la confirmation email est désactivée
                // → l'utilisateur est déjà connecté, on le redirige directement.
                if (data.session) {
                    afficherMessage(messageInscription, "Compte créé avec succès ! Redirection en cours...", "succes");
                    setTimeout(() => {
                        window.location.href = "../index.html";
                    }, 1200);
                    return;
                }

                // Sinon, la confirmation par email est bien requise
                afficherMessage(
                    messageInscription,
                    "Compte créé avec succès ! Vérifiez votre boîte mail pour confirmer votre adresse.",
                    "succes"
                );

                formInscription.reset();
            } catch (erreur) {
                afficherMessage(messageInscription, traduireErreur(erreur), "erreur");
            } finally {
                activerChargement(bouton, false);
            }
        });
    }

    // ==========================================
    // 🔎 VÉRIFIER SI UN UTILISATEUR EST DÉJÀ CONNECTÉ
    // ==========================================
    async function verifierSessionActive() {
        if (!supabaseClient) return;
        try {
            const { data } = await supabaseClient.auth.getSession();
            if (data.session) {
                // Un utilisateur déjà connecté qui arrive sur la page connexion
                // est redirigé automatiquement vers l'accueil.
                window.location.href = "../index.html";
            }
        } catch (erreur) {
            console.error("Maktaba : erreur lors de la vérification de session.", erreur);
        }
    }

    verifierSessionActive();
});
