(function () {
    const section = document.getElementById('section-audio');
    if (!section) return;

    const slug = new URLSearchParams(location.search).get('slug');
    if (!slug) return;

    // Cherche le client Supabase sous les noms courants
    function trouverClient() {
        const candidats = [
            typeof supabaseClient !== 'undefined' ? supabaseClient : null,
            typeof sb !== 'undefined' ? sb : null,
            typeof db !== 'undefined' ? db : null,
            window.supabaseClient,
            window.sb,
            window.db
        ];
        return candidats.find(c => c && typeof c.from === 'function') || null;
    }

    const client = trouverClient();
    if (!client) {
        console.warn('audio.js : client Supabase introuvable. Verifie son nom dans supabase-client.js.');
        return;
    }

    const NOMS_LANGUES = { wo: 'Wolof', fr: 'Français', ar: 'العربية', en: 'English' };

    const el = {
        select: document.getElementById('audio-serie-select'),
        desc: document.getElementById('audio-serie-desc'),
        titre: document.getElementById('audio-titre-en-cours'),
        vitesse: document.getElementById('audio-vitesse'),
        liste: document.getElementById('audio-lecons')
    };

    let series = [];
    let serie = null;
    let lecons = [];
    let courant = -1;
    let yt = null;

    const cleSauvegarde = () => `maktaba:audio:${slug}:${serie.id}`;

    function formaterDuree(s) {
        if (!s) return '';
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
    }

    // ---------- YouTube ----------
    function chargerApiYouTube() {
        return new Promise(resolve => {
            if (window.YT && window.YT.Player) return resolve();
            const precedent = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                if (precedent) precedent();
                resolve();
            };
            const s = document.createElement('script');
            s.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(s);
        });
    }

    function creerLecteur() {
        return new Promise(resolve => {
            yt = new YT.Player('audio-player', {
                playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
                events: {
                    onReady: () => resolve(),
                    onStateChange: e => {
                        if (e.data === YT.PlayerState.PLAYING) {
                            yt.setPlaybackRate(parseFloat(el.vitesse.value));
                        }
                        if (e.data === YT.PlayerState.ENDED && courant + 1 < lecons.length) {
                            jouer(courant + 1);
                        }
                    }
                }
            });
        });
    }

    // ---------- Données ----------
    async function chargerSeries() {
        const { data: livre, error: errLivre } = await client
            .from('livres').select('id').eq('slug', slug).single();
        if (errLivre || !livre) {
            console.warn('audio.js : livre introuvable pour ce slug.', errLivre);
            return [];
        }

        const { data, error } = await client
            .from('series_audio')
            .select('id, explicateur, titre, description, langue, source_url, lecons_audio(id, numero, titre, youtube_id, duree_secondes)')
            .eq('livre_id', livre.id)
            .order('numero', { referencedTable: 'lecons_audio', ascending: true });

        if (error) { console.error('audio.js :', error); return []; }
        return data.filter(s => s.lecons_audio && s.lecons_audio.length);
    }

    // ---------- Affichage ----------
    function afficherSerie(index) {
        serie = series[index];
        lecons = serie.lecons_audio;

        el.desc.textContent = '';
        const badge = document.createElement('span');
        badge.className = 'audio-badge-langue';
        badge.textContent = NOMS_LANGUES[serie.langue] || serie.langue;
        el.desc.append(badge, ' ', `${serie.explicateur}. ${serie.description || ''}`);

        if (serie.source_url) {
            const lien = document.createElement('a');
            lien.href = serie.source_url;
            lien.target = '_blank';
            lien.rel = 'noopener';
            lien.textContent = ' Voir la playlist';
            el.desc.appendChild(lien);
        }

        el.liste.lang = serie.langue;
        el.liste.innerHTML = '';

        lecons.forEach((l, i) => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.i = i;

            const num = document.createElement('span');
            num.className = 'lecon-numero';
            num.textContent = l.numero;

            const titre = document.createElement('span');
            titre.className = 'lecon-titre';
            titre.dir = 'auto';
            titre.textContent = l.titre;

            const duree = document.createElement('span');
            duree.className = 'lecon-duree';
            duree.textContent = formaterDuree(l.duree_secondes);

            btn.append(num, titre, duree);
            li.appendChild(btn);
            el.liste.appendChild(li);
        });

        courant = -1;
        el.titre.textContent = 'Choisis une leçon';

        // Reprise : charge la dernière leçon écoutée sans la lancer
        try {
            const sauv = JSON.parse(localStorage.getItem(cleSauvegarde()));
            if (sauv && lecons[sauv.index]) jouer(sauv.index, sauv.temps, false);
        } catch (_) { /* pas de sauvegarde */ }
    }

    function jouer(i, tempsDepart = 0, lancer = true) {
        courant = i;
        const l = lecons[i];
        const params = { videoId: l.youtube_id, startSeconds: tempsDepart };

        if (lancer) yt.loadVideoById(params);
        else yt.cueVideoById(params);

        el.titre.textContent = `Leçon ${l.numero} : ${l.titre}`;
        el.liste.querySelectorAll('button').forEach((b, j) =>
            b.classList.toggle('active', j === i));
    }

    // ---------- Événements ----------
    el.liste.addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (btn) jouer(+btn.dataset.i);
    });

    el.vitesse.addEventListener('change', () => {
        if (yt) yt.setPlaybackRate(parseFloat(el.vitesse.value));
    });

    // Sauvegarde de la position toutes les 5 s pendant la lecture
    setInterval(() => {
        if (!yt || courant < 0 || !yt.getPlayerState) return;
        if (yt.getPlayerState() !== YT.PlayerState.PLAYING) return;
        localStorage.setItem(cleSauvegarde(), JSON.stringify({
            index: courant,
            temps: Math.floor(yt.getCurrentTime())
        }));
    }, 5000);

    el.select.addEventListener('change', () => {
        if (yt) yt.stopVideo();
        afficherSerie(+el.select.value);
    });

    // ---------- Démarrage ----------
    (async function init() {
        series = await chargerSeries();
        if (!series.length) return; // pas de leçons : la section reste cachée

        if (series.length > 1) {
            series.forEach((s, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = `${s.explicateur} (${NOMS_LANGUES[s.langue] || s.langue}) : ${s.titre}`;
                el.select.appendChild(opt);
            });
            el.select.hidden = false;
        }

        section.hidden = false;
        await chargerApiYouTube();
        await creerLecteur();
        afficherSerie(0);
    })();
})();