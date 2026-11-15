/* Repères — application monopage, sans dépendance ni étape de build.
   Tout le contenu vit dans themes/ : voir README.md pour ajouter un thème. */

const app = document.getElementById('app');
const fil = document.getElementById('fil');
const memo = new Map();
let nav = 0;            // jeton de navigation : ignore les réponses arrivées trop tard
let session = null;     // test en cours
let nettoyage = null;   // ce que la vue affichée doit défaire en partant

/* ---------- Chargement du contenu ---------- */

function charger(url, type = 'json') {
  if (!memo.has(url)) {
    const p = fetch(url).then(r => {
      if (!r.ok) throw new Error(`${url} (${r.status})`);
      return type === 'json' ? r.json() : r.text();
    });
    p.catch(() => memo.delete(url));
    memo.set(url, p);
  }
  return memo.get(url);
}

const chargerTheme = id => charger(`themes/${id}/theme.json`);

function chargerBanque(t) {
  const cle = `banque:${t.id}`;
  if (!memo.has(cle)) {
    const p = Promise.all(t.chapitres.map(c => charger(`themes/${t.id}/questions/${c.id}.json`)))
      .then(lots => lots.flatMap((lot, i) => lot.map(q => ({ ...q, chapitre: t.chapitres[i].id }))));
    p.catch(() => memo.delete(cle));
    memo.set(cle, p);
  }
  return memo.get(cle);
}

/* ---------- Texte ---------- */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);
// Espaces insécables de la typographie française, posées à l'affichage.
const typo = s => s.replace(/ ([?!;])/g, ' $1').replace(/ ([:»])/g, ' $1').replace(/« /g, '« ');
// Textes courts des fichiers JSON : `code` et **gras** sont reconnus.
const fmt = s => typo(esc(s)).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
const sansAccent = s => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const duree = min => min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;

/* ---------- Sigles ---------- */

// Le glossaire est facultatif : un thème sans glossaire fonctionne, sans sigles développés.
const chargerGlossaire = t => charger(`themes/${t.id}/glossaire.json`).catch(() => []);

const motifs = new Map();
function motif(terme) {
  if (!motifs.has(terme)) {
    const brut = terme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    motifs.set(terme, new RegExp(`(^|[^\\p{L}\\p{N}])${brut}(?![\\p{L}\\p{N}])`, 'u'));
  }
  return motifs.get(terme);
}
// Les sigles du glossaire (entrées dotées du champ « s ») qui apparaissent dans un texte.
const siglesDans = (texte, glossaire) => glossaire
  .filter(x => x.s && motif(x.t).test(texte))
  .sort((a, b) => a.t.localeCompare(b.t, 'fr'));
// Texte d'un élément, nœud par nœud : « textContent » collerait entre elles les cellules d'un tableau.
function texteDe(element) {
  const marcheur = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const morceaux = [];
  while (marcheur.nextNode()) morceaux.push(marcheur.currentNode.nodeValue);
  return morceaux.join(' ');
}
const siglesDeQuestion = (it, glossaire) => siglesDans([it.q.q, ...it.choix, it.q.explication].join('\n'), glossaire);
const developpe = x => `<em>${esc(x.s)}</em>${x.f ? ` (${esc(x.f)})` : ''}`;
const ligneSigles = liste => liste.length
  ? `<p class="sigles"><b>Sigles.</b> ${liste.map(x => `${esc(x.t)} : ${developpe(x)}`).join(' · ')}</p>`
  : '';

function melanger(liste) {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- Progression (dans le navigateur uniquement) ---------- */

const CLE = 'reperes:v1';
let etat = null;

function lireEtat() {
  if (!etat) {
    try { etat = JSON.parse(localStorage.getItem(CLE)) || {}; } catch { etat = {}; }
  }
  return etat;
}
function suivi(id) {
  return { lus: {}, q: {}, sessions: [], ...(lireEtat()[id] || {}) };
}
function majSuivi(id, modifier) {
  const s = suivi(id);
  modifier(s);
  lireEtat()[id] = s;
  try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch { /* stockage indisponible : la progression reste en mémoire */ }
}
function maitrise(questions, s) {
  const ok = questions.filter(q => s.q[q.id]?.ok).length;
  return { ok, total: questions.length, pct: questions.length ? Math.round(100 * ok / questions.length) : 0 };
}

/* ---------- Routeur ---------- */

function teinte(t) {
  const style = document.documentElement.style;
  if (t?.couleur) {
    style.setProperty('--accent-clair', t.couleur.clair);
    style.setProperty('--accent-sombre', t.couleur.sombre);
  } else {
    style.removeProperty('--accent-clair');
    style.removeProperty('--accent-sombre');
  }
}

function afficher(vue) {
  nettoyage?.();
  nettoyage = null;
  document.title = vue.titre ? `${vue.titre} · Repères` : 'Repères';
  fil.innerHTML = (vue.miettes || []).map(([texte, href]) =>
    href ? `<a href="${href}">${esc(texte)}</a>` : `<span aria-current="page">${esc(texte)}</span>`
  ).join('<i class="sep" aria-hidden="true">/</i>');
  app.innerHTML = typo(vue.html);
  vue.apres?.(app);
  window.scrollTo(0, 0);
}

function aller(hash) {
  if (location.hash === hash) router();
  else location.hash = hash;
}

async function resoudre(p) {
  if (!p.length) { teinte(null); return vueAccueil(); }
  if (p[0] !== 't' || !p[1]) return vueIntrouvable();
  const { themes } = await charger('themes/index.json');
  if (!themes.includes(p[1])) return vueIntrouvable();
  const t = await chargerTheme(p[1]);
  teinte(t);
  const [, , section, arg] = p;
  if (!section) return vueTheme(t);
  if (section === 'cours') return arg ? vueChapitre(t, arg) : vueSommaire(t);
  if (section === 'test') return vueReglages(t, arg);
  if (section === 'glossaire') return vueGlossaire(t);
  return vueIntrouvable();
}

async function router() {
  const h = location.hash;
  if (h && !h.startsWith('#/')) return;
  const jeton = ++nav;
  session = null;
  const p = h.slice(2).split('/').filter(Boolean).map(decodeURIComponent);
  let vue;
  try {
    vue = await resoudre(p);
  } catch (e) {
    console.error(e);
    vue = vueErreur();
  }
  if (jeton === nav) afficher(vue);
}

/* ---------- Vues simples ---------- */

function vueIntrouvable() {
  return {
    titre: 'Page introuvable',
    html: `<section><h1>Cette page n'existe pas.</h1><p class="chapo">Le lien est peut-être ancien.</p><a class="bouton" href="#/">Revenir aux thèmes</a></section>`,
  };
}

function vueErreur() {
  return {
    titre: 'Contenu indisponible',
    html: `<section><h1>Le contenu n'a pas pu être chargé.</h1><p class="chapo">Vérifiez la connexion, puis réessayez.</p><button class="bouton" id="reessayer">Réessayer</button></section>`,
    apres: racine => racine.querySelector('#reessayer').addEventListener('click', router),
  };
}

const ICONE = {
  livre: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6.5C10.2 5.2 7.6 4.6 4 4.6v13.2c3.6 0 6.2.6 8 1.9 1.8-1.3 4.4-1.9 8-1.9V4.6c-3.6 0-6.2.6-8 1.9Z"/><path d="M12 6.5v13.2"/></svg>',
  cible: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.3 2.6 2.6 5-5.6"/></svg>',
};

async function vueAccueil() {
  const { themes } = await charger('themes/index.json');
  const liste = await Promise.all(themes.map(chargerTheme));
  const cartes = liste.map(t => {
    const s = suivi(t.id);
    const lus = t.chapitres.filter(c => s.lus[c.id]).length;
    const minutes = t.chapitres.reduce((n, c) => n + c.minutes, 0);
    return `<a class="carte-theme" href="#/t/${t.id}" style="--accent-clair:${esc(t.couleur.clair)};--accent-sombre:${esc(t.couleur.sombre)}">
      <span class="domaine">${esc(t.domaine)}</span>
      <h2>${fmt(t.titre)}</h2>
      <p>${fmt(t.accroche)}</p>
      <span class="meta">${pluriel(t.chapitres.length, 'chapitre')} · ${duree(minutes)} de lecture${lus ? ` · ${lus} lu${lus > 1 ? 's' : ''}` : ''}</span>
    </a>`;
  }).join('');
  return {
    titre: '',
    html: `<section class="accueil">
      <h1>Un thème, un cours, un test.</h1>
      <p class="chapo">Choisissez un thème. Lisez le cours pour comprendre, ou passez directement au test pour savoir où vous en êtes.</p>
      <div class="themes">${cartes}</div>
      <p class="note-bas">D'autres thèmes viendront s'ajouter ici.</p>
    </section>`,
  };
}

async function vueTheme(t) {
  const banque = await chargerBanque(t);
  const s = suivi(t.id);
  const n = t.chapitres.length;
  const lus = t.chapitres.filter(c => s.lus[c.id]).length;
  const minutes = t.chapitres.reduce((somme, c) => somme + c.minutes, 0);
  const m = maitrise(banque, s);
  const dernier = s.sessions.at(-1);
  return {
    titre: t.titreCourt,
    miettes: [[t.titreCourt, null]],
    html: `<section class="theme">
      <p class="surtitre">${esc(t.domaine)}</p>
      <h1>${fmt(t.titre)}</h1>
      <p class="chapo">${fmt(t.accroche)}</p>
      <div class="deux-voies">
        <a class="voie" href="#/t/${t.id}/cours">
          <span class="icone">${ICONE.livre}</span>
          <h2>Lire le cours</h2>
          <p>${pluriel(n, 'chapitre')}, ${duree(minutes)} de lecture en tout. Des schémas, des exemples, et l'essentiel à retenir à la fin de chaque chapitre.</p>
          <div class="jauge"><i style="width:${100 * lus / n}%"></i></div>
          <span class="meta">${lus} sur ${n} chapitres lus</span>
          <span class="appel">${lus === 0 ? 'Commencer' : lus === n ? 'Relire' : 'Reprendre'} →</span>
        </a>
        <a class="voie" href="#/t/${t.id}/test">
          <span class="icone">${ICONE.cible}</span>
          <h2>Se tester</h2>
          <p>${banque.length} questions corrigées et expliquées. Sur tout le thème, sur un chapitre, ou seulement sur vos erreurs.</p>
          <div class="jauge"><i style="width:${m.pct}%"></i></div>
          <span class="meta">${m.ok} sur ${m.total} questions réussies${dernier ? ` · dernier test : ${dernier.ok}/${dernier.n}` : ''}</span>
          <span class="appel">Lancer un test →</span>
        </a>
      </div>
      <div class="annexes">
        <a href="#/t/${t.id}/glossaire">Glossaire et sigles du thème</a>
        <button type="button" class="lien pousse" id="raz"${lus || dernier ? '' : ' hidden'}>Effacer ma progression sur ce thème</button>
      </div>
    </section>`,
    apres: racine => racine.querySelector('#raz').addEventListener('click', () => {
      if (!confirm('Effacer les chapitres lus et les résultats de test de ce thème ?')) return;
      majSuivi(t.id, s => { s.lus = {}; s.q = {}; s.sessions = []; });
      router();
    }),
  };
}

function vueSommaire(t) {
  const s = suivi(t.id);
  return {
    titre: `Cours · ${t.titreCourt}`,
    miettes: [[t.titreCourt, `#/t/${t.id}`], ['Cours', null]],
    html: `<section>
      <p class="surtitre">Le cours</p>
      <h1>${fmt(t.titre)}</h1>
      <p class="chapo">Les chapitres se lisent dans l'ordre, mais chacun tient debout tout seul.</p>
      <ol class="sommaire">${t.chapitres.map((c, i) => `
        <li class="${s.lus[c.id] ? 'lu' : ''}"><a href="#/t/${t.id}/cours/${c.id}">
          <span class="num">${i + 1}</span>
          <span class="txt"><strong>${fmt(c.titre)}</strong><span>${fmt(c.resume)}</span></span>
          <span class="meta">${s.lus[c.id] ? '✓ Lu' : `${c.minutes} min`}</span>
        </a></li>`).join('')}
      </ol>
    </section>`,
  };
}

/* ---------- Lecture d'un chapitre ---------- */

async function vueChapitre(t, id) {
  const i = t.chapitres.findIndex(c => c.id === id);
  if (i < 0) return vueIntrouvable();
  const c = t.chapitres[i];
  const [corps, banque, glossaire] = await Promise.all([
    charger(`themes/${t.id}/cours/${id}.html`, 'text'),
    chargerBanque(t),
    chargerGlossaire(t),
  ]);
  const s = suivi(t.id);
  const nbQuestions = banque.filter(q => q.chapitre === id).length;
  const prec = t.chapitres[i - 1];
  const suiv = t.chapitres[i + 1];
  const base = `#/t/${t.id}`;

  return {
    titre: c.titre,
    miettes: [[t.titreCourt, base], ['Cours', `${base}/cours`], [c.titre, null]],
    html: `<div class="progression" aria-hidden="true"><i></i></div>
    <div class="lecture">
      <nav class="plan" aria-label="Chapitres du cours">
        <h2>Le cours</h2>
        <ol>${t.chapitres.map(x => `<li class="${x.id === id ? 'ici' : ''} ${s.lus[x.id] ? 'lu' : ''}" data-chap="${x.id}"><a href="${base}/cours/${x.id}"><span>${fmt(x.titre)}</span></a></li>`).join('')}</ol>
      </nav>
      <article class="chapitre">
        <p class="surtitre">Chapitre ${i + 1} sur ${t.chapitres.length} · ${c.minutes} min de lecture</p>
        <h1>${fmt(c.titre)}</h1>
        <p class="chapo">${fmt(c.resume)}</p>
        <div class="prose">${typo(corps)}</div>
        <div class="fin">
          <div class="actions">
            <a class="bouton" id="tester" href="${base}/test/${id}">Tester ce chapitre · ${pluriel(nbQuestions, 'question')}</a>
            <button type="button" class="bouton second" id="lu"></button>
          </div>
          <nav class="pagination" aria-label="Chapitre précédent et suivant">
            ${prec ? `<a class="prec" href="${base}/cours/${prec.id}"><small>← Précédent</small>${fmt(prec.titre)}</a>` : ''}
            ${suiv ? `<a class="suiv" id="suivant" href="${base}/cours/${suiv.id}"><small>Suivant →</small>${fmt(suiv.titre)}</a>` : `<a class="suiv" href="${base}"><small>Fin du cours →</small>Retour au thème</a>`}
          </nav>
        </div>
      </article>
    </div>`,
    apres: racine => {
      // Récapitulatif des sigles rencontrés dans le chapitre, tiré du glossaire.
      const prose = racine.querySelector('.prose');
      const sigles = siglesDans(texteDe(prose), glossaire);
      if (sigles.length) {
        const bloc = document.createElement('aside');
        bloc.className = 'note sigles';
        bloc.innerHTML = typo(`<p class="etiquette">Sigles de ce chapitre</p>
          <div class="tableau"><table>
            <thead><tr><th>Sigle</th><th>En toutes lettres</th><th>En clair</th></tr></thead>
            <tbody>${sigles.map(x => `<tr><th>${esc(x.t)}</th><td><em>${esc(x.s)}</em></td><td>${esc(x.f || '')}</td></tr>`).join('')}</tbody>
          </table></div>
          <p class="meta">Les définitions complètes sont dans le <a href="${base}/glossaire">glossaire</a>.</p>`);
        prose.append(bloc);
      }

      // Plan interne : les titres de section du chapitre, sous le chapitre courant.
      const titres = [...racine.querySelectorAll('.prose h2')];
      if (titres.length) {
        const ul = document.createElement('ul');
        ul.className = 'sections';
        titres.forEach(h => {
          const li = document.createElement('li');
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = h.textContent;
          b.addEventListener('click', () => h.scrollIntoView({ behavior: 'smooth', block: 'start' }));
          li.append(b);
          ul.append(li);
        });
        racine.querySelector('.plan .ici').append(ul);
      }
      // Tableaux : défilement horizontal sur petit écran.
      racine.querySelectorAll('.prose > table').forEach(table => {
        const cadre = document.createElement('div');
        cadre.className = 'tableau';
        table.replaceWith(cadre);
        cadre.append(table);
      });

      const bouton = racine.querySelector('#lu');
      const peindre = () => {
        const lu = !!suivi(t.id).lus[id];
        bouton.textContent = lu ? '✓ Chapitre lu' : 'Marquer comme lu';
        bouton.setAttribute('aria-pressed', lu);
        racine.querySelector(`.plan [data-chap="${id}"]`).classList.toggle('lu', lu);
      };
      const marquer = lu => majSuivi(t.id, s => { if (lu) s.lus[id] = new Date().toISOString().slice(0, 10); else delete s.lus[id]; });
      bouton.addEventListener('click', () => { marquer(!suivi(t.id).lus[id]); peindre(); });
      racine.querySelector('#tester').addEventListener('click', () => marquer(true));
      racine.querySelector('#suivant')?.addEventListener('click', () => marquer(true));
      peindre();

      const barre = racine.querySelector('.progression i');
      const article = racine.querySelector('.chapitre');
      const avancer = () => {
        const total = article.offsetHeight - window.innerHeight * 0.6;
        const fait = window.scrollY - article.offsetTop + 80;
        barre.style.width = `${Math.max(0, Math.min(100, 100 * fait / total))}%`;
      };
      window.addEventListener('scroll', avancer, { passive: true });
      nettoyage = () => window.removeEventListener('scroll', avancer);
    },
  };
}

/* ---------- Test : réglages ---------- */

async function vueReglages(t, chapitreInitial) {
  const banque = await chargerBanque(t);
  const s = suivi(t.id);
  const glossaire = await chargerGlossaire(t);
  const pre = t.chapitres.some(c => c.id === chapitreInitial) ? chapitreInitial : null;
  const erreurs = banque.filter(q => s.q[q.id] && !s.q[q.id].ok);
  const base = `#/t/${t.id}`;
  const puce = (nom, valeur, texte, { coche = false, inactif = false } = {}) =>
    `<label class="puce"><input type="radio" name="${nom}" value="${valeur}"${coche ? ' checked' : ''}${inactif ? ' disabled' : ''}><span>${texte}</span></label>`;

  return {
    titre: `Test · ${t.titreCourt}`,
    miettes: [[t.titreCourt, base], ['Test', null]],
    html: `<section class="reglages">
      <p class="surtitre">Le test</p>
      <h1>Se tester</h1>
      <p class="chapo">Chaque question est corrigée et expliquée. Les questions jamais vues, puis celles que vous avez manquées, sortent en premier.</p>
      <form id="reglages">
        <fieldset>
          <legend>Sur quoi ?</legend>
          <div class="puces">
            ${puce('portee', 'tout', 'Tout le thème', { coche: !pre })}
            ${puce('portee', 'chapitres', 'Certains chapitres', { coche: !!pre })}
            ${puce('portee', 'erreurs', `Mes erreurs (${erreurs.length})`, { inactif: !erreurs.length })}
          </div>
          <ul class="choix-chapitres"${pre ? '' : ' hidden'}>${t.chapitres.map((c, i) => {
            const m = maitrise(banque.filter(q => q.chapitre === c.id), s);
            return `<li><label><input type="checkbox" name="chapitre" value="${c.id}"${!pre || pre === c.id ? ' checked' : ''}>
              <span>${i + 1}. ${fmt(c.titre)}</span>
              <span class="jauge"><i style="width:${m.pct}%"></i></span>
              <span class="meta">${m.ok}/${m.total}</span></label></li>`;
          }).join('')}</ul>
        </fieldset>
        <fieldset>
          <legend>Combien de questions ?</legend>
          <div class="puces">
            ${puce('nombre', '10', '10')}
            ${puce('nombre', '20', '20', { coche: !pre })}
            ${puce('nombre', '40', '40')}
            ${puce('nombre', '0', 'Toutes', { coche: !!pre })}
          </div>
        </fieldset>
        <fieldset>
          <legend>Quand voir la correction ?</legend>
          <div class="puces">
            ${puce('correction', 'immediate', 'Après chaque question', { coche: true })}
            ${puce('correction', 'fin', 'À la fin du test')}
          </div>
        </fieldset>
        <p class="dispo" aria-live="polite"></p>
        <button class="bouton" type="submit">Commencer le test</button>
      </form>
    </section>`,
    apres: racine => {
      const form = racine.querySelector('#reglages');
      const liste = racine.querySelector('.choix-chapitres');
      const dispo = racine.querySelector('.dispo');
      const envoyer = form.querySelector('[type=submit]');
      const vivier = () => {
        const d = new FormData(form);
        const portee = d.get('portee');
        if (portee === 'erreurs') return erreurs;
        if (portee === 'chapitres') { const choisis = d.getAll('chapitre'); return banque.filter(q => choisis.includes(q.chapitre)); }
        return banque;
      };
      const peindre = () => {
        const d = new FormData(form);
        liste.hidden = d.get('portee') !== 'chapitres';
        const v = vivier();
        const voulu = +d.get('nombre') || v.length;
        const n = Math.min(voulu, v.length);
        dispo.textContent = !v.length ? 'Cochez au moins un chapitre.'
          : n === v.length ? `${pluriel(n, 'question')} : tout ce qui est disponible sur ce choix.`
          : `${n} questions tirées parmi ${v.length}.`;
        envoyer.disabled = !v.length;
      };
      form.addEventListener('change', peindre);
      form.addEventListener('submit', e => {
        e.preventDefault();
        const d = new FormData(form);
        const v = vivier();
        if (!v.length) return;
        lancer(t, tirer(t, v, +d.get('nombre') || v.length), d.get('correction'), glossaire);
      });
      peindre();
    },
  };
}

// Tirage équilibré entre chapitres ; priorité aux questions jamais vues, puis aux erreurs.
function tirer(t, vivier, n) {
  const s = suivi(t.id);
  const rang = q => { const e = s.q[q.id]; return !e ? 0 : e.ok ? 2 : 1; };
  const files = new Map();
  for (const q of melanger(vivier).sort((a, b) => rang(a) - rang(b))) {
    if (!files.has(q.chapitre)) files.set(q.chapitre, []);
    files.get(q.chapitre).push(q);
  }
  const tirage = [];
  const tours = melanger([...files.values()]);
  while (tirage.length < n && tours.some(f => f.length)) {
    for (const f of tours) if (f.length && tirage.length < n) tirage.push(f.shift());
  }
  return melanger(tirage);
}

/* ---------- Test : déroulement ---------- */

const LETTRES = 'ABCDEF';
const juste = it => it.choisi.size === it.q.bonnes.length && it.q.bonnes.every(k => it.choisi.has(k));

function lancer(t, questions, correction, glossaire = []) {
  session = {
    t,
    correction,
    glossaire,
    i: 0,
    items: questions.map(q => {
      const choix = q.type === 'vf' ? ['Vrai', 'Faux'] : q.choix;
      const ordre = q.type === 'vf' ? [0, 1] : melanger(choix.map((_, k) => k));
      return { q, choix, ordre, choisi: new Set(), valide: false };
    }),
  };
  afficherQuestion();
}

function afficherQuestion() {
  const { t, items, i, correction } = session;
  const it = items[i];
  const multi = it.q.type === 'multi';
  const dernier = i === items.length - 1;
  const chap = t.chapitres.find(c => c.id === it.q.chapitre);
  const immediate = correction === 'immediate';

  afficher({
    titre: `Question ${i + 1} sur ${items.length}`,
    miettes: [[t.titreCourt, `#/t/${t.id}`], ['Test', null]],
    html: `<section class="quiz">
      <div class="quiz-tete"><span>Question <strong>${i + 1}</strong> sur ${items.length}</span><span>${esc(chap.titre)}</span></div>
      <div class="jauge"><i style="width:${100 * i / items.length}%"></i></div>
      <h1 class="enonce">${fmt(it.q.q)}</h1>
      <p class="consigne">${multi ? 'Plusieurs réponses attendues : cochez toutes les bonnes.' : it.q.type === 'vf' ? 'Vrai ou faux ?' : 'Une seule bonne réponse.'}</p>
      <div class="options">${it.ordre.map((k, pos) => `
        <button type="button" class="option" data-k="${k}" aria-pressed="false"><span class="lettre">${LETTRES[pos]}</span><span class="texte">${fmt(it.choix[k])}</span></button>`).join('')}
      </div>
      <div class="retour" aria-live="polite"></div>
      <div class="actions">
        <button type="button" class="bouton" id="suite" disabled>${immediate ? 'Valider' : dernier ? 'Terminer le test' : 'Question suivante'}</button>
        <button type="button" class="lien" id="arret">Arrêter le test</button>
      </div>
      <p class="raccourcis">Au clavier : <kbd>A</kbd> <kbd>B</kbd> <kbd>C</kbd>… pour choisir, <kbd>Entrée</kbd> pour valider.</p>
    </section>`,
    apres: racine => {
      const options = [...racine.querySelectorAll('.option')];
      const suite = racine.querySelector('#suite');
      const retour = racine.querySelector('.retour');

      const peindre = () => {
        options.forEach(b => {
          const choisie = it.choisi.has(+b.dataset.k);
          b.classList.toggle('choisie', choisie);
          b.setAttribute('aria-pressed', choisie);
        });
        suite.disabled = !it.choisi.size;
      };
      options.forEach(b => b.addEventListener('click', () => {
        if (it.valide) return;
        const k = +b.dataset.k;
        if (!multi) it.choisi.clear();
        if (multi && it.choisi.has(k)) it.choisi.delete(k); else it.choisi.add(k);
        peindre();
      }));

      const corriger = () => {
        it.valide = true;
        const bonnes = new Set(it.q.bonnes);
        options.forEach(b => {
          const k = +b.dataset.k;
          b.disabled = true;
          b.classList.add(bonnes.has(k) ? 'bonne' : it.choisi.has(k) ? 'fausse' : 'neutre');
        });
        const ok = juste(it);
        retour.innerHTML = typo(`<div class="verdict ${ok ? 'ok' : 'ko'}"><strong>${ok ? 'Exact.' : 'Pas tout à fait.'}</strong> ${fmt(it.q.explication)}${ligneSigles(siglesDeQuestion(it, session.glossaire))}</div>`);
        suite.textContent = dernier ? 'Voir le résultat' : 'Question suivante';
        suite.focus();
      };
      suite.addEventListener('click', () => {
        if (immediate && !it.valide) return corriger();
        it.valide = true;
        if (dernier) return terminer();
        session.i++;
        afficherQuestion();
      });
      racine.querySelector('#arret').addEventListener('click', () => {
        if (items.some(x => x.valide)) terminer();
        else aller(`#/t/${t.id}/test`);
      });
    },
  });
}

document.addEventListener('keydown', e => {
  if (!session || e.metaKey || e.ctrlKey || e.altKey) return;
  const options = [...app.querySelectorAll('.option')];
  const suite = app.querySelector('#suite');
  if (!options.length || !suite) return;
  const touche = e.key.toLowerCase();
  const rang = '123456'.includes(touche) ? '123456'.indexOf(touche) : 'abcdef'.indexOf(touche);
  if (touche.length === 1 && rang >= 0 && options[rang]) {
    e.preventDefault();
    options[rang].click();
  } else if (e.key === 'Enter' && !['suite', 'arret'].includes(document.activeElement?.id) && !suite.disabled) {
    e.preventDefault();
    suite.click();
  }
});

/* ---------- Test : résultat ---------- */

const PALIERS = [
  [85, 'Acquis', 'Le thème est en main. Un test de temps en temps suffit à l\'entretenir.'],
  [65, 'Solide', 'L\'essentiel est là. Relisez les chapitres où des erreurs subsistent, puis refaites-les.'],
  [40, 'En construction', 'Les bases se mettent en place. Reprenez les chapitres les plus faibles avant de retenter.'],
  [0, 'À reprendre', 'Mieux vaut repasser par le cours, chapitre par chapitre, et tester chacun dans la foulée.'],
];

function terminer() {
  const { t, items, glossaire } = session;
  session = null;
  const faits = items.filter(it => it.valide).map(it => ({ ...it, ok: juste(it) }));
  const nbOk = faits.filter(r => r.ok).length;
  const jour = new Date().toISOString().slice(0, 10);
  majSuivi(t.id, s => {
    faits.forEach(r => { s.q[r.q.id] = { ok: r.ok, n: (s.q[r.q.id]?.n || 0) + 1, d: jour }; });
    s.sessions = [...s.sessions, { d: jour, n: faits.length, ok: nbOk }].slice(-30);
  });

  const pct = Math.round(100 * nbOk / faits.length);
  const [, palier, conseil] = PALIERS.find(([seuil]) => pct >= seuil);
  const ratees = faits.filter(r => !r.ok);
  const base = `#/t/${t.id}`;
  const parChapitre = t.chapitres.map(c => {
    const lot = faits.filter(r => r.q.chapitre === c.id);
    return { c, n: lot.length, ok: lot.filter(r => r.ok).length };
  }).filter(x => x.n);

  const revue = r => {
    const bonnes = new Set(r.q.bonnes);
    const chap = t.chapitres.find(c => c.id === r.q.chapitre);
    return `<details class="${r.ok ? 'ok' : 'ko'}"${r.ok ? '' : ' open'}>
      <summary>${fmt(r.q.q)}</summary>
      <div class="corps">
        <ul>${r.ordre.map(k => {
          const bonne = bonnes.has(k), choisie = r.choisi.has(k);
          const marque = bonne && choisie ? 'Votre réponse, juste' : bonne ? 'Bonne réponse' : choisie ? 'Votre réponse' : '';
          return `<li class="${bonne ? 'bonne' : choisie ? 'fausse' : ''}">${fmt(r.choix[k])}${marque ? `<em>${marque}</em>` : ''}</li>`;
        }).join('')}</ul>
        <p>${fmt(r.q.explication)}</p>
        ${ligneSigles(siglesDeQuestion(r, glossaire))}
        <a href="${base}/cours/${chap.id}">Relire : ${esc(chap.titre)}</a>
      </div>
    </details>`;
  };

  afficher({
    titre: `Résultat · ${t.titreCourt}`,
    miettes: [[t.titreCourt, base], ['Test', `${base}/test`], ['Résultat', null]],
    html: `<section class="resultat">
      <p class="surtitre">Résultat du test</p>
      <div class="score">
        <div class="anneau" style="--p:${pct}"><span>${pct}<small>%</small></span></div>
        <div><h1>${palier}</h1><p>${nbOk} bonne${nbOk > 1 ? 's' : ''} réponse${nbOk > 1 ? 's' : ''} sur ${faits.length}. ${conseil}</p></div>
      </div>
      <div class="actions">
        ${ratees.length ? `<button type="button" class="bouton" id="refaire">Refaire mes ${pluriel(ratees.length, 'erreur')}</button>` : ''}
        <button type="button" class="bouton${ratees.length ? ' second' : ''}" id="nouveau">Nouveau test</button>
        <a class="bouton second" href="${base}">Retour au thème</a>
      </div>
      <h2>Par chapitre</h2>
      <ul class="par-chapitre">${parChapitre.map(({ c, n, ok }) => `
        <li><a href="${base}/cours/${c.id}">${esc(c.titre)}</a><span class="jauge"><i style="width:${100 * ok / n}%"></i></span><span class="meta">${ok}/${n}</span></li>`).join('')}
      </ul>
      <h2>Correction détaillée</h2>
      <div class="revue">${[...ratees, ...faits.filter(r => r.ok)].map(revue).join('')}</div>
    </section>`,
    apres: racine => {
      racine.querySelector('#refaire')?.addEventListener('click', () => lancer(t, melanger(ratees.map(r => r.q)), 'immediate', glossaire));
      racine.querySelector('#nouveau').addEventListener('click', () => aller(`${base}/test`));
    },
  });
}

/* ---------- Glossaire ---------- */

async function vueGlossaire(t) {
  const termes = [...await chargerGlossaire(t)].sort((a, b) => a.t.localeCompare(b.t, 'fr'));
  const nbSigles = termes.filter(x => x.s).length;
  const base = `#/t/${t.id}`;
  return {
    titre: `Glossaire · ${t.titreCourt}`,
    miettes: [[t.titreCourt, base], ['Glossaire', null]],
    html: `<section class="glossaire">
      <p class="surtitre">Glossaire</p>
      <h1>${pluriel(termes.length, 'terme')}, dont ${pluriel(nbSigles, 'sigle')}</h1>
      <p class="chapo">Chaque sigle est donné en toutes lettres, puis en clair. Chaque terme a une définition courte et renvoie au chapitre où il est expliqué.</p>
      <input class="recherche" type="search" placeholder="Chercher un terme ou un mot de la définition" aria-label="Chercher dans le glossaire">
      <div class="puces filtre">
        <label class="puce"><input type="radio" name="genre" value="tout" checked><span>Tout</span></label>
        <label class="puce"><input type="radio" name="genre" value="sigles"><span>Sigles seulement</span></label>
      </div>
      <p class="meta" id="compte" aria-live="polite"></p>
      <dl>${termes.map(x => {
        const chap = t.chapitres.find(c => c.id === x.c);
        return `<div class="terme" data-sigle="${x.s ? 1 : 0}" data-cle="${esc(sansAccent(`${x.t} ${x.s || ''} ${x.f || ''} ${x.d}`))}"><dt>${fmt(x.t)}${x.s ? ` <span class="developpe">${developpe(x)}</span>` : ''}</dt><dd>${fmt(x.d)}${chap ? ` <a href="${base}/cours/${chap.id}">${esc(chap.titre)} →</a>` : ''}</dd></div>`;
      }).join('')}</dl>
    </section>`,
    apres: racine => {
      const champ = racine.querySelector('.recherche');
      const compte = racine.querySelector('#compte');
      const lignes = [...racine.querySelectorAll('.terme')];
      const filtrer = () => {
        const mots = sansAccent(champ.value).split(/\s+/).filter(Boolean);
        const sigles = racine.querySelector('[name=genre]:checked').value === 'sigles';
        let n = 0;
        lignes.forEach(l => {
          const garde = (!sigles || l.dataset.sigle === '1') && mots.every(m => l.dataset.cle.includes(m));
          l.hidden = !garde;
          if (garde) n++;
        });
        compte.textContent = mots.length || sigles ? (n ? pluriel(n, sigles ? 'sigle' : 'terme') : 'Aucun terme ne correspond.') : '';
      };
      champ.addEventListener('input', filtrer);
      racine.querySelectorAll('[name=genre]').forEach(r => r.addEventListener('change', filtrer));
    },
  };
}

window.addEventListener('hashchange', router);
router();
