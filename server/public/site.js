/* site.js — les comportements propres au site MultiOutils, posés sur le
   design « encre » (encre.js, chargé juste avant). Aucune fenêtre grise du
   navigateur : confirmations, copies et messages passent par Encre.
   - Formulaires [data-confirmer] : confirmation intégrée avant l'envoi.
   - Formulaires [data-occupe] (et confirmés) : bouton bloqué jusqu'à la réponse.
   - Boutons [data-copier] et clips (Copier, Agrandir).
   - Filtres : dans une feuille du bas sur téléphone.
   - Réglages : la liste, puis le panneau ouvert (#apparence, #jetons…).
   - Recherche rapide (Ctrl K) : pages, réglages, dossiers et étiquettes. */
(function () {
  "use strict";

  function demarrer() {
    var E = window.Encre;
    if (!E) return;
    var $ = E.$, $$ = E.$$;

    /* ---------------------------------------------------- formulaires */
    function bloquer(form, submitter) {
      var btn = submitter || form.querySelector('[type="submit"]');
      if (btn) btn.classList.add("occupe");
    }
    document.addEventListener("submit", function (e) {
      var form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      // Zone sensible : ne confirmer que si l'accès local va être coupé.
      var sw = form.hasAttribute("data-sensible") && form.querySelector('[name="allowlocal"]');
      var aConfirmer = form.dataset.confirmer !== undefined && !form._confirme && !(sw && sw.checked);
      if (aConfirmer) {
        e.preventDefault();
        var submitter = e.submitter || null;
        var msg = form.dataset.confirmer;
        E.confirmer(msg, {
          titre: form.dataset.titre || "",
          ok: form.dataset.ok || "Confirmer",
          danger: form.hasAttribute("data-danger"),
        }).then(function (ok) {
          if (!ok) return;
          form._confirme = true;
          if (submitter && form.requestSubmit) form.requestSubmit(submitter);
          else if (form.requestSubmit) form.requestSubmit();
          else form.submit();
        });
        return;
      }
      if (form._envoye) { e.preventDefault(); return; }
      form._envoye = true;
      bloquer(form, e.submitter);
    });
    // Retour arrière (cache du navigateur) : on débloque les boutons.
    addEventListener("pageshow", function () {
      $$("form").forEach(function (f) { f._envoye = false; f._confirme = false; });
      $$(".btn.occupe").forEach(function (b) { b.classList.remove("occupe"); });
    });

    // Zone sensible : message de confirmation propre à la coupure de l'accès local.
    $$("form[data-sensible]").forEach(function (f) {
      f.dataset.confirmer = "L'accès direct sans badge Cloudflare sera refusé, y compris pour toi. Vérifie d'abord que Cloudflare fonctionne.";
      f.dataset.titre = "Couper l'accès local ?";
      f.dataset.ok = "Couper l'accès local";
      f.setAttribute("data-danger", "");
    });

    /* ------------------------------------------------------- copier */
    document.addEventListener("click", function (e) {
      var c = e.target.closest("[data-copier]");
      if (c) { E.copier(c.dataset.copier, c); return; }

      var cp = e.target.closest("[data-copy]");
      if (cp) {
        var pre = cp.closest(".clip") && cp.closest(".clip").querySelector("[data-clip]");
        if (pre) E.copier(pre.textContent || "", cp);
        return;
      }

      var ex = e.target.closest("[data-expand]");
      if (ex) {
        var src = ex.closest(".clip") && ex.closest(".clip").querySelector("[data-clip]");
        if (!src) return;
        var f = E.feuille({
          titre: "Texte complet",
          large: true,
          html: '<textarea class="input clip-plein" readonly aria-label="Texte complet"></textarea>' +
            '<div class="ligne clip-plein-bts"><button type="button" class="btn pri" data-tout>' + E.ic("copy", "s18") + "Copier tout</button>" +
            '<button type="button" class="btn gh" data-fermer>Fermer</button></div>',
        });
        var ta = f.el.querySelector("textarea");
        ta.value = src.textContent || "";
        f.el.querySelector("[data-tout]").addEventListener("click", function (ev) {
          E.copier(ta.value, ev.currentTarget);
        });
        return;
      }

      /* -------------------------------- filtres (feuille sur téléphone) */
      var fb = e.target.closest("[data-filtres]");
      if (fb) {
        var form = document.getElementById(fb.dataset.filtres);
        if (!form) return;
        var clone = form.cloneNode(true);
        clone.removeAttribute("id");
        clone.classList.add("dans-feuille");
        $$("[style]", clone).forEach(function (el) { el.removeAttribute("style"); });
        E.feuille({ titre: "Filtres", html: "" }).corps.append(clone);
      }
    });

    /* ---------------------------------------------- réglages (panneaux) */
    var reg = $("#reglages");
    if (reg) {
      var panneaux = $$(".reg-panneau", reg).map(function (s) { return s.dataset.panneau; });
      /* #panneau ouvre ce réglage (en plein écran sur téléphone) ; #liste
         ou rien revient à la liste. Après un envoi de formulaire, le serveur
         indique le panneau à rouvrir (data-ouvert). */
      var ouvertServeur = reg.dataset.ouvert || "";
      var depuisAdresse = function (defilement) {
        var h = decodeURIComponent(location.hash.slice(1));
        var choisi = panneaux.indexOf(h) >= 0 ? h : (!h && ouvertServeur ? ouvertServeur : "");
        var montre = choisi || panneaux[0];        // sur ordinateur, le premier par défaut
        reg.classList.toggle("detail", !!choisi);
        $$(".reg-panneau", reg).forEach(function (s) { s.hidden = s.dataset.panneau !== montre; });
        $$("[data-reg]", reg).forEach(function (a) { a.classList.toggle("on", a.dataset.reg === montre); });
        if (defilement) {
          scrollTo({ top: 0 });
          E.animerEntree($(".reg-det", reg));
        }
      };
      addEventListener("hashchange", function () { ouvertServeur = ""; depuisAdresse(true); });
      depuisAdresse(false);
    }

    /* --------------------------------------------- message au chargement */
    var t = $("[data-toast]");
    if (t) E.toast(t.dataset.toast);

    /* ------------------------------------------- recherche rapide (Ctrl K) */
    E.recherche.placeholder = "Une page, un réglage, un dossier…";
    /* Les raccourcis gardent toujours au moins une ligne : la recherche
       n'affiche ainsi jamais son message « Rien trouvé », qui porte un style
       en ligne que la CSP du site refuse (style-src 'self'). */
    var repli = { titre: "Galerie", sous: "Revenir à toutes les captures", icone: "grid", href: "/" };
    class Raccourcis extends Array {
      static get [Symbol.species]() { return Array; }
      filter(fn) { var r = Array.prototype.filter.call(this, fn); return r.length ? r : [repli]; }
    }
    E.recherche.raccourcis = Raccourcis.from([
      { titre: "Galerie", sous: "Toutes les captures", icone: "grid", mots: "captures images photos", href: "/" },
      { titre: "Clips", sous: "Textes, photos et fichiers partagés", icone: "layers", mots: "presse-papiers textes", href: "/clips" },
      { titre: "Déposer un clip", sous: "Texte, photo ou fichier", icone: "upload", mots: "envoyer ajouter", href: "/clips/deposer" },
      { titre: "Apparence", sous: "Couleur d'accent, thème", icone: "palette", mots: "couleur theme sombre clair", href: "/admin#apparence" },
      { titre: "Accès Cloudflare", sous: "Équipe, AUD, test", icone: "shield", mots: "cloudflare access jwt", href: "/admin#acces" },
      { titre: "Mot de passe de secours", icone: "lock", mots: "mot de passe local", href: "/admin#motdepasse" },
      { titre: "Jetons d'API", sous: "Relier le logiciel au serveur", icone: "key", mots: "token jeton api", href: "/admin#jetons" },
      { titre: "Taille maximale d'envoi", icone: "upload", mots: "limite mo taille", href: "/admin#envois" },
      { titre: "Mettre à jour le site", sous: "Vérifier, mettre à jour", icone: "refresh", mots: "mise à jour version", href: "/admin#maj" },
      { titre: "Zone sensible", sous: "Accès local", icone: "alert", mots: "secours local", href: "/admin#sensible" },
    ]);
    var donnees = $("#mo-donnees");
    var lire = function (cle) {
      try { return JSON.parse((donnees && donnees.dataset[cle]) || "[]"); } catch (_) { return []; }
    };
    var sans = function (s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); };
    var sources = [
      { cle: "capDossiers", groupe: "Dossiers des captures", icone: "lib", href: function (v) { return "/?folder=" + encodeURIComponent(v); } },
      { cle: "capTags", groupe: "Étiquettes des captures", icone: "hash", href: function (v) { return "/?tag=" + encodeURIComponent(v); } },
      { cle: "clipDossiers", groupe: "Dossiers des clips", icone: "lib", href: function (v) { return "/clips?folder=" + encodeURIComponent(v); } },
      { cle: "clipTags", groupe: "Étiquettes des clips", icone: "hash", href: function (v) { return "/clips?tag=" + encodeURIComponent(v); } },
    ].map(function (s) { s.valeurs = lire(s.cle); return s; });
    E.recherche.chercher = function (texte) {
      var q = sans(texte);
      var res = [];
      sources.forEach(function (s) {
        s.valeurs.filter(function (v) { return sans(v).indexOf(q) >= 0; }).slice(0, 6).forEach(function (v) {
          res.push({ groupe: s.groupe, iconeGroupe: s.icone, titre: v, icone: s.icone, href: s.href(v) });
        });
      });
      return Promise.resolve(res);
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();
})();
