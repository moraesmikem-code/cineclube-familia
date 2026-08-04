/* Cineclube — Web Worker de recomendações (fórmula alinhada ao index.html) */
let movies = [];
let family = null;
let me = null;

const COUNTRY_CONTINENT = {
  'United States':'América do Norte','USA':'América do Norte','Canada':'América do Norte','Mexico':'América do Norte',
  'Brazil':'América do Sul','Argentina':'América do Sul','Chile':'América do Sul','Colombia':'América do Sul','Peru':'América do Sul','Uruguay':'América do Sul','Venezuela':'América do Sul','Bolivia':'América do Sul','Ecuador':'América do Sul','Paraguay':'América do Sul',
  'United Kingdom':'Europa','UK':'Europa','France':'Europa','Germany':'Europa','West Germany':'Europa','Italy':'Europa','Spain':'Europa','Portugal':'Europa','Netherlands':'Europa','Belgium':'Europa','Sweden':'Europa','Norway':'Europa','Denmark':'Europa','Finland':'Europa','Ireland':'Europa','Switzerland':'Europa','Austria':'Europa','Poland':'Europa','Russia':'Europa','Soviet Union':'Europa','Greece':'Europa','Hungary':'Europa','Czech Republic':'Europa','Czechoslovakia':'Europa','Romania':'Europa','Ukraine':'Europa','Iceland':'Europa','Croatia':'Europa','Serbia':'Europa','Yugoslavia':'Europa','Bulgaria':'Europa',
  'Japan':'Ásia','China':'Ásia','Hong Kong':'Ásia','South Korea':'Ásia','India':'Ásia','Thailand':'Ásia','Taiwan':'Ásia','Indonesia':'Ásia','Philippines':'Ásia','Vietnam':'Ásia','Israel':'Ásia','Iran':'Ásia','Turkey':'Ásia','Malaysia':'Ásia','Singapore':'Ásia','Pakistan':'Ásia','Saudi Arabia':'Ásia','United Arab Emirates':'Ásia','Lebanon':'Ásia',
  'South Africa':'África','Nigeria':'África','Egypt':'África','Morocco':'África','Kenya':'África','Tunisia':'África','Senegal':'África',
  'Australia':'Oceania','New Zealand':'Oceania',
};
function countryToContinent(c){ return COUNTRY_CONTINENT[c] || null; }
function runtimeBucket(min){
  if(min==null) return null;
  if(min<90) return 'curto (<90min)';
  if(min<=120) return 'médio (90-120min)';
  if(min<=150) return 'longo (120-150min)';
  return 'muito longo (150min+)';
}
function displayTitle(m){ return m.titlePt || m.titleOriginal || m.title || 'Sem título'; }


let _profileCache = {};
function buildTasteProfile(person, excludeId){
  let ratedCount = 0;
  movies.forEach(m=>{
    const v = m.votes[person];
    if((v && v.score!=null) || (m.dismissedBy && m.dismissedBy.includes(person))) ratedCount++;
  });
  const cacheKey = person + ':' + ratedCount;
  if(!_profileCache[cacheKey]){
    _profileCache = {}; // troca de pessoa/contagem: descarta cache antigo (evita crescer sem limite)
    _profileCache[cacheKey] = buildTasteProfileRaw(person, null);
  }
  const base = _profileCache[cacheKey];
  if(excludeId==null) return base;
  // só refaz do zero (mais caro) se o filme excluído realmente participa do perfil dessa pessoa
  const excludedMovie = movies.find(m=>m.id===excludeId);
  const participates = excludedMovie && (
    (excludedMovie.votes[person] && excludedMovie.votes[person].score!=null) ||
    (excludedMovie.dismissedBy && excludedMovie.dismissedBy.includes(person))
  );
  if(!participates) return base;
  return buildTasteProfileRaw(person, excludeId);
}

// Detecta mesma franquia/sequência pelo título (ex.: Tropa de Elite / Tropa de Elite 2)
function franchiseRoot(m){
  let t = displayTitle(m) || m.title || m.titleEn || m.titleOriginal || '';
  t = String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  t = t.replace(/:\s*.+$/, ''); // remove subtítulo após :
  t = t.replace(/\s*[-–—]\s*.+$/, '');
  t = t.replace(/\b(part|parte|chapter|capitulo|capítulo|volume|vol\.?)\s*\d+\b/g, '');
  t = t.replace(/\b(ii|iii|iv|v|vi|vii|viii|ix|x|\d+)\b/g, '');
  t = t.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  // primeiros tokens significativos (evita raiz vazia)
  const words = t.split(' ').filter(w => w.length > 1);
  return words.slice(0, 4).join(' ');
}
function sameFranchise(a, b){
  if(!a || !b || a.id === b.id) return false;
  const ra = franchiseRoot(a), rb = franchiseRoot(b);
  if(!ra || !rb || ra.length < 5 || rb.length < 5) return false;
  if(ra === rb) return true;
  if(ra.includes(rb) || rb.includes(ra)) return true;
  // mesmo diretor + títulos muito parecidos
  const da = (a.director||'').toLowerCase().split(',')[0].trim();
  const db = (b.director||'').toLowerCase().split(',')[0].trim();
  if(da && db && da === db){
    const wa = ra.split(' '), wb = rb.split(' ');
    const common = wa.filter(w => wb.includes(w));
    if(common.length >= 2) return true;
  }
  return false;
}

function buildTasteProfileRaw(person, excludeId){
  const maps = { genre:{}, director:{}, actor:{}, writer:{}, country:{}, decade:{}, studio:{}, genreDecade:{}, genreCountry:{}, genreDecadeCountry:{}, keyword:{}, runtime:{} };
  let count = 0;
  const target = excludeId ? movies.find(x => x.id === excludeId) : null;
  function bump(map, key, w){
    if(!map[key]) map[key] = { sum:0, n:0 };
    map[key].sum += w;
    map[key].n += 1;
  }
  function applyMovie(m, w){
    const decade = m.year ? Math.floor(parseInt(m.year)/10)*10 : null;
    (m.genres||[]).forEach(g=>{
      bump(maps.genre, g, w);
      if(decade!=null) bump(maps.genreDecade, g+'|'+decade, w);
      (m.countries||[]).forEach(c=>{
        bump(maps.genreCountry, g+'|'+c, w);
        const cont = countryToContinent(c);
        if(cont) bump(maps.genreCountry, g+'|cont:'+cont, w);
        if(decade!=null) bump(maps.genreDecadeCountry, g+'|'+decade+'|'+c, w);
      });
    });
    if(m.director) m.director.split(',').map(s=>s.trim()).forEach(d=>bump(maps.director, d, w));
    if(m.writer) m.writer.split(',').map(s=>s.trim()).forEach(wr=>bump(maps.writer, wr, w));
    if(m.actors) m.actors.split(',').map(s=>s.trim()).forEach(a=>bump(maps.actor, a, w));
    (m.countries||[]).forEach(c=>bump(maps.country, c, w));
    if(decade!=null) bump(maps.decade, decade, w);
    if(m.production) bump(maps.studio, m.production, w);
    (m.keywords||[]).forEach(k=>{
      const kk = String(k).toLowerCase().trim();
      if(kk) bump(maps.keyword, kk, w);
    });
    const rb = runtimeBucket(m.runtimeMin);
    if(rb) bump(maps.runtime, rb, w);
  }
  movies.forEach(m=>{
    if(m.id === excludeId) return;
    // Franquia/sequência: a nota de um não deve dominar a previsão do outro
    const franchiseMul = (target && sameFranchise(m, target)) ? 0.15 : 1;
    const v = m.votes[person];
    if(v && v.score!=null){
      count++;
      applyMovie(m, (v.score - 5.5) * franchiseMul);
    } else if(m.abandonedBy && m.abandonedBy[person]){
      const pct = m.abandonedBy[person].pctWatched;
      const eq = abandonToScore(pct);
      count++;
      applyMovie(m, (eq - 5.5) * 0.7 * franchiseMul);
    } else if(m.dismissedBy && m.dismissedBy.includes(person)){
      applyMovie(m, -2.5 * franchiseMul);
    }
  });
  return { maps, count };
}

let _crossAffinityCache = {};
function crossUserAffinity(personA, personB){
  const cacheKey = personA+'|'+personB+':'+movies.length;
  if(_crossAffinityCache[cacheKey]!==undefined) return _crossAffinityCache[cacheKey];
  const common = movies.filter(m=>{
    const a=m.votes[personA], b=m.votes[personB];
    return a && a.score!=null && b && b.score!=null;
  });
  let result;
  if(common.length < 3){ result = 0; } // exige mais filmes em comum antes de confiar na afinidade
  else {
    let sum=0;
    common.forEach(m=>{
      const diff = Math.abs(m.votes[personA].score - m.votes[personB].score);
      sum += (1 - diff/9);
    });
    const raw = (sum/common.length)*2 - 1; // -1..1
    const confidence = Math.min(1, common.length/8); // precisa de ~8 filmes em comum pra confiança máxima
    result = raw * confidence;
  }
  if(Object.keys(_crossAffinityCache).length > 200) _crossAffinityCache = {};
  _crossAffinityCache[cacheKey] = result;
  return result;
}

// Afinidade entre duas pessoas, mas específica pro contexto do filme (gênero, década, país) —
// já que duas pessoas podem concordar em comédia e discordar em terror, por exemplo.
function segmentAffinity(personA, personB, filterFn){
  const common = movies.filter(m=>{
    const a=m.votes[personA], b=m.votes[personB];
    return a && a.score!=null && b && b.score!=null && filterFn(m);
  });
  if(common.length < 2) return null;
  let sum=0;
  common.forEach(m=>{
    const diff = Math.abs(m.votes[personA].score - m.votes[personB].score);
    sum += (1 - diff/9);
  });
  const raw = (sum/common.length)*2 - 1;
  const confidence = Math.min(1, common.length/5);
  return { value: raw*confidence, n: common.length };
}

function crossUserAffinityFor(personA, personB, movie){
  const overall = crossUserAffinity(personA, personB);
  const decade = movie.year ? Math.floor(parseInt(movie.year)/10)*10 : null;
  const segments = [];
  (movie.genres||[]).forEach(g=>{
    const s = segmentAffinity(personA, personB, m=>(m.genres||[]).includes(g));
    if(s) segments.push(s);
  });
  if(decade!=null){
    const s = segmentAffinity(personA, personB, m=>{ const y=parseInt(m.year); return !isNaN(y) && Math.floor(y/10)*10===decade; });
    if(s) segments.push(s);
  }
  (movie.countries||[]).forEach(c=>{
    const s = segmentAffinity(personA, personB, m=>(m.countries||[]).includes(c));
    if(s) segments.push(s);
  });
  // combina: afinidade geral como "base" (peso 1) + cada afinidade específica pesada pelo quanto de dado ela tem
  let weightedSum = overall * 1;
  let totalWeight = 1;
  segments.forEach(s=>{
    const w = Math.min(3, s.n/2);
    weightedSum += s.value * w;
    totalWeight += w;
  });
  return weightedSum / totalWeight;
}

// Shrinkage por feature: k menor = confia mais rápido; k maior = exige mais repetições.
// Diretor/atores = sinal causal forte; estúdio/roteirista = mais ruidoso.
const SHRINK_K_BY_FEATURE = {
  director: 2.0,
  actor: 2.5,
  writer: 5.0,
  studio: 6.0,
  country: 3.0,
  decade: 3.0,
  genreDecade: 3.5,
  genreCountry: 3.5,
  genreDecadeCountry: 4.0,
  keyword: 4.0, // subgênero/tema (slasher, time travel…) — precisa de algumas repetições
  default: 3.0
};
function shrunkWeight(entry, feature){
  if(!entry || entry.n===0) return 0;
  const k = SHRINK_K_BY_FEATURE[feature] ?? SHRINK_K_BY_FEATURE.default;
  const avg = entry.sum / entry.n;
  const confidence = entry.n / (entry.n + k);
  return avg * confidence;
}

// Abandono → nota equivalente (proxy). Quanto mais cedo parou, mais negativo.
// 15% ≈ 2,3 · 60% ≈ 4,5 · 90% ≈ 6,0
function abandonToScore(pctWatched){
  const p = Math.max(0, Math.min(100, pctWatched == null ? 25 : Number(pctWatched))) / 100;
  return 1.5 + p * 5;
}
// Progresso de série a partir de episódios marcados
function seriesProgressPct(movie, person){
  const seasons = movie.seasons || [];
  let total = 0;
  seasons.forEach(s=>{ total += (s.episodeCount || 0); });
  if(total <= 0) return null;
  const votes = (movie.episodeVotes && movie.episodeVotes[person]) || {};
  let watched = 0;
  Object.keys(votes).forEach(k=>{ if(votes[k] && votes[k].watched) watched++; });
  return Math.round(100 * watched / total);
}

// Sinal "cru" — padrões de gosto (pessoas, país, década, combinações de gênero…).
function rawTasteSignal(movie, maps){
  let raw = 0, maxPossible = 0.0001;
  function add(map, keys, weightMul, feature){
    keys.forEach(k=>{
      const entry = map[k];
      if(!entry || entry.n===0) return;
      const eff = shrunkWeight(entry, feature);
      raw += eff*weightMul;
      maxPossible += (Math.abs(eff)+1)*weightMul;
    });
  }
  const decade = movie.year ? Math.floor(parseInt(movie.year)/10)*10 : null;
  // Gênero sozinho = 0. Combinações com década/país/continente = sim.
  add(maps.genre, movie.genres||[], 0, 'default');
  if(movie.director) add(maps.director, movie.director.split(',').map(s=>s.trim()), 1.4, 'director');
  if(movie.writer) add(maps.writer, movie.writer.split(',').map(s=>s.trim()), 1.0, 'writer');
  if(movie.actors) add(maps.actor, movie.actors.split(',').map(s=>s.trim()), 1.2, 'actor');
  add(maps.country, movie.countries||[], 0.8, 'country');
  if(decade!=null) add(maps.decade, [decade], 0.8, 'decade');
  if(movie.production) add(maps.studio, [movie.production], 0.7, 'studio');
  if(decade!=null) add(maps.genreDecade, (movie.genres||[]).map(g=>g+'|'+decade), 1.3, 'genreDecade');
  (movie.countries||[]).forEach(c=>{
    add(maps.genreCountry, (movie.genres||[]).map(g=>g+'|'+c), 1.1, 'genreCountry');
    const cont = countryToContinent(c);
    if(cont) add(maps.genreCountry, (movie.genres||[]).map(g=>g+'|cont:'+cont), 1.0, 'genreCountry');
    // Tríplice: gênero + década + país (ex.: terror americano anos 70)
    if(decade!=null){
      add(maps.genreDecadeCountry, (movie.genres||[]).map(g=>g+'|'+decade+'|'+c), 1.4, 'genreDecadeCountry');
    }
  });
  // Keywords TMDB ≈ tags de subgênero/tema do IMDb (slasher, based on novel, time travel…)
  if(movie.keywords && movie.keywords.length){
    const kws = movie.keywords.map(k=>String(k).toLowerCase().trim()).filter(Boolean);
    add(maps.keyword, kws, 1.15, 'keyword');
  }
  return { raw, maxPossible };
}

function pearson(xs, ys){
  const n = xs.length;
  if(n < 2) return 0;
  const mx = xs.reduce((a,b)=>a+b,0)/n;
  const my = ys.reduce((a,b)=>a+b,0)/n;
  let num=0, dx2=0, dy2=0;
  for(let i=0;i<n;i++){
    const dx=xs[i]-mx, dy=ys[i]-my;
    num += dx*dy; dx2 += dx*dx; dy2 += dy*dy;
  }
  if(dx2===0||dy2===0) return 0;
  return num/Math.sqrt(dx2*dy2);
}

// Auto-validação: esconde cada filme já avaliado, um de cada vez, prevê com o resto,
// e compara com a nota real dada — pra saber se o modelo é realmente confiável pra essa pessoa.
let _backtestCache = {};
function backtestAccuracy(person){
  const rated = movies.filter(m=>m.votes[person] && m.votes[person].score!=null);
  const cacheKey = person+':'+rated.length;
  if(_backtestCache[cacheKey]) return _backtestCache[cacheKey];
  if(rated.length < 8){
    const result = { corr: 0.35, n: rated.length }; // poucos dados: confiança moderada, não extrema
    _backtestCache[cacheKey] = result;
    return result;
  }
  const preds = [], actuals = [];
  rated.forEach(m=>{
    const { maps, count } = buildTasteProfile(person, m.id);
    if(count < 5) return;
    const { raw, maxPossible } = rawTasteSignal(m, maps);
    preds.push(raw/maxPossible);
    actuals.push(m.votes[person].score - 5.5);
  });
  const result = preds.length >= 6 ? { corr: pearson(preds, actuals), n: preds.length } : { corr: 0.35, n: preds.length };
  _backtestCache[cacheKey] = result;
  return result;
}

let _alignCache = {};
function aggregatorAlignment(person){
  const rated = movies.filter(m=>m.votes[person] && m.votes[person].score!=null);
  const cacheKey = person+':'+rated.length;
  if(_alignCache[cacheKey]) return _alignCache[cacheKey];
  function corrWith(getter){
    const xs=[], ys=[];
    rated.forEach(m=>{
      const ext = getter(m);
      if(ext==null) return;
      xs.push(m.votes[person].score);
      ys.push(ext);
    });
    if(xs.length<4) return 0;
    return pearson(xs,ys);
  }
  const result = {
    imdbCorr: corrWith(m=>m.ratings && m.ratings.imdb),
    criticCorr: corrWith(m=>{
      if(!m.ratings) return null;
      const vals=[m.ratings.rtCritics, m.ratings.metacritic].filter(v=>v!=null);
      return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
    })
  };
  _alignCache[cacheKey] = result;
  return result;
}

const PENALTY_COUNTRIES = new Set(['India','Turkey','Philippines','Indonesia','Nigeria','Turquia','Filipinas','Indonésia','Nigéria']);
const MINORITY_KW_LIST = [
  'gay','homosexual','homosexuality','bisexual','bisexuality','lgbt','lgbtq','queer',
  'transgender','transsexual','gender identity','gender expression','gender nonconforming',
  'gender reassignment','gender norm','transphobia','homophobia','internalized homophobia',
  'gay protagonist','gay romance','gay sex','gay kiss','gay friend','gay husband','gay parent',
  'gay scene','gay interest','gay kid','gay black man','gay african american','gay cowboy',
  'closeted homosexual','first gay sexual experience','male male kiss','male bisexuality',
  'bisexual protagonist','bisexual interest','pansexual','pansexual interest',
  'woman pretending to be a man','transgender woman','coming out','coming of age'
];
// Sexismo / feminismo / misoginia — penalidade em QUALQUER época
const SEXISM_KW_LIST = [
  'sexism','sexist','misogyny','misogynist','misogynistic','feminism','feminist',
  'patriarchy','patriarchal','male chauvinism','chauvinism','gender politics',
  'women\'s rights','womens rights','toxic masculinity','male gaze'
];
// Temas raciais — penalidade após 2012
const RACIAL_KW_LIST = [
  'racism','racist','racial tension','racial conflict','racial injustice','racial discrimination',
  'racial prejudice','systemic racism','institutional racism','police brutality',
  'black lives matter','white privilege','critical race','race relations','racial identity',
  'segregation','apartheid','civil rights movement'
];
// Xenofobia a estrangeiros — penalidade após 2006
const XENOPHOBIA_KW_LIST = [
  'xenophobia','xenophobic','anti-immigrant','anti immigration','anti-immigration',
  'immigrant discrimination','refugee crisis','border wall','illegal immigrant',
  'nationalism','nativism','foreigner hatred','hate immigrant'
];
// Filosofia / existencialismo — −10% em qualquer época (notas altas, ritmo lento)
const PHILOSOPHY_KW_LIST = [
  'philosophy','philosophical','philosopher','existentialism','existential',
  'existential crisis','metaphysics','metaphysical','nihilism','nihilist',
  'solipsism','ontology','epistemology','stoicism','absurdism','absurdist',
  'meaning of life','human condition','philosophical drama'
];
// Propaganda favorável a comunismo/socialismo — −20%
// NÃO inclui só ambientação histórica, crítica ao regime ou personagem comunista neutro.
const COMMIE_PROPAGANDA_KW_LIST = [
  'communist propaganda','socialist propaganda','marxist propaganda',
  'pro-communist','pro-communism','pro-socialist','pro-socialism',
  'revolutionary propaganda','soviet propaganda','maoist propaganda',
  'glorification of communism','glorification of socialism',
  'propaganda comunista','propaganda socialista','apologia ao comunismo',
  'apologia ao socialismo','cinema militante','filme militante',
  'agitprop','agit-prop','socialist realism film'
];
// Se estas keywords aparecerem, trata como crítica/contexto — NÃO penaliza
const COMMIE_CRITIQUE_KW_LIST = [
  'anti-communist','anti-communism','critique of communism','critique of socialism',
  'anti-soviet','gulag','stalinist terror','cultural revolution horror',
  'escape from communism','defector','dissident','iron curtain escape',
  'crítica ao comunismo','crítica ao socialismo','anticomunista'
];
// Títulos que o usuário pediu para penalizar explicitamente (−20%)
const COMMIE_FORCE_PENALTY_IMDB = new Set([
  'tt6016744',   // Democracia em Vertigem / The Edge of Democracy
  'tt14961016',  // Ainda Estou Aqui / I'm Still Here
  'tt27847051',  // O Agente Secreto / The Secret Agent
]);
const COMMIE_FORCE_PENALTY_TITLES = [
  'democracia em vertigem', 'edge of democracy',
  'ainda estou aqui', "i'm still here", 'im still here',
  'o agente secreto', 'the secret agent'
];
// Diretores associados a cinema político de esquerda (BR e afins)
const POLITICAL_LEFT_DIRECTORS = [
  'petra costa',
  'kleber mendonça filho', 'kleber mendonca filho',
  'juliano dornelles',
  'adirley queirós', 'adirley queiros',
  'laís bodanzky', 'lais bodanzky',
  'anna muylaert',
  'karim aïnouz', 'karim ainouz',
];
// Temas políticos pró-esquerda / denúncia (keywords e sinopse)
const POLITICAL_LEFT_THEME_KW = [
  'impeachment', 'lula', 'luiz inácio', 'luiz inacio', 'partido dos trabalhadores',
  'workers party', 'dilma', 'dilma rousseff',
  'military dictatorship', 'brazilian dictatorship', 'ditadura militar',
  'political documentary', 'documentário político', 'documentario politico',
  'left-wing', 'left wing politics', 'social justice', 'class struggle',
  'golpe de 2016', 'lawfare', 'petismo'
];
function _normTxt(s){
  return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function isForcedCommiePenalty(movie){
  const id = String(movie.imdbId || movie.id || '').toLowerCase();
  if(COMMIE_FORCE_PENALTY_IMDB.has(id)) return true;
  const titles = [movie.titlePt, movie.titleEn, movie.titleOriginal, movie.title, displayTitle(movie)]
    .filter(Boolean).map(t => _normTxt(t));
  if(COMMIE_FORCE_PENALTY_TITLES.some(needle => {
    const n = _normTxt(needle);
    return titles.some(t => t === n || t.includes(n));
  })) return true;

  // Diretores associados a certo cinema político
  const dir = _normTxt(movie.director || '');
  if(dir && POLITICAL_LEFT_DIRECTORS.some(d => dir.includes(_normTxt(d)))) return true;

  const countries = (movie.countries || []).map(c => _normTxt(c));
  const isBR = countries.some(c => c.includes('brasil') || c.includes('brazil'));
  const genres = (movie.genres || []).map(g => _normTxt(g));
  const isDoc = genres.some(g => g.includes('document'));
  const year = parseInt(movie.year);
  const isContemporary = !isNaN(year) && year >= 2010;
  const kwList = (movie.keywords || []).map(k => _normTxt(k));
  const text = _normTxt((movie.synopsisPt || '') + ' ' + (movie.plot || '') + ' ' + kwList.join(' '));

  const hasLeftTheme = POLITICAL_LEFT_THEME_KW.some(k => {
    const n = _normTxt(k);
    return kwList.some(kw => kw.includes(n) || n.includes(kw)) || text.includes(n);
  });
  // Tom de denúncia (sinopse)
  const hasDenuncia = /\b(denuncia|denúncia|injustica|injustiça|resistencia|resistência|oppress|opressao|opressão|golpe|lawfare|persecu|autoritarismo)\b/i.test(text);

  // Documentário político contemporâneo brasileiro + tema/denúncia
  if(isBR && isDoc && isContemporary && (hasLeftTheme || hasDenuncia)) return true;

  // Brasil + (impeachment/Lula/PT/ditadura) + tom de denúncia
  if(isBR && hasLeftTheme && hasDenuncia) return true;

  // Heurística crítica × público (Tropa 1 vs Tropa 2):
  // Filme político/BR + crítica alta (RT ≥ 8 ou média ≥ 7.5) → pró-esquerda.
  // Tropa 1: RT 5.3 → não penaliza | Tropa 2: RT 9.1 / Meta 7.1 → penaliza
  {
    const rt = movie.ratings && movie.ratings.rtCritics != null ? Number(movie.ratings.rtCritics) : null;
    const meta = movie.ratings && movie.ratings.metacritic != null ? Number(movie.ratings.metacritic) : null;
    const criticVals = [rt, meta].filter(v => v != null && !isNaN(v));
    const criticAvg = criticVals.length ? criticVals.reduce((a,b)=>a+b,0) / criticVals.length : null;
    const looksPolitical = hasLeftTheme || hasDenuncia
      || /\b(politic|politica|policial|corrup|congress|senado|partido|eleic|ditadura|military)\b/i.test(text)
      || genres.some(g => /politic|crime|police|policial/.test(g));
    if(isBR && looksPolitical && criticAvg != null){
      if((rt != null && rt >= 8.0) || criticAvg >= 7.5) return true;
    }
  }

  return false;
}

function estimateAffinity(movie, person){
  try {
  const { maps, count } = buildTasteProfile(person, movie.id);
  if(count < 6) return { ready:false, pct:50 };

  const { raw:tasteRaw, maxPossible:tasteMax } = rawTasteSignal(movie, maps);
  let raw = tasteRaw, maxPossible = tasteMax;

  // Camada de segurança: consenso de crítica externa, mas pesado por qual agregador mais "bate" com você
  // (algumas pessoas concordam mais com o público do IMDb, outras com a crítica do Metacritic/RT)
  const align = aggregatorAlignment(person);
  const ratings = movie.ratings || {};
  const imdbVal = ratings.imdb;
  const imdbVotes = ratings.imdbVotes;
  const rtVal = ratings.rtCritics;
  const metaVal = ratings.metacritic;

  // Qualidade externa em 2 camadas.
  // (A) IMDb alto + crítica baixa → IMDb puro (Tropa 1)
  // (B) político + crítica alta → só IMDb, sem prêmio de establishment (Tropa 2)
  let extScore = null;
  let discardedCriticsLow = false;
  {
    let criticVals = [];
    if (rtVal != null) criticVals.push(Number(rtVal));
    if (metaVal != null) criticVals.push(Number(metaVal));
    let criticAvg = criticVals.length
      ? criticVals.reduce((a,b)=>a+b,0) / criticVals.length
      : null;

    const textPol = ((movie.synopsisPt||'')+' '+(movie.plot||'')+' '+(movie.keywords||[]).join(' ')+' '+(movie.genres||[]).join(' ')+' '+(movie.director||'')).toLowerCase();
    const looksPolitical = /\b(politic|política|policial|corrup|congress|partido|eleic|ditadura|military|crime|police|impeachment|lula|dilma)\b/i.test(textPol)
      || (movie.genres||[]).some(g => /politic|crime|police|policial|document/i.test(String(g)));

    if (criticAvg != null && imdbVal != null) {
      const imdbN = Number(imdbVal);
      const criticsLow = imdbN >= 7.0 && criticAvg <= imdbN - 1.2;
      const criticsHigh = looksPolitical && (criticAvg >= 7.5 || (rtVal != null && Number(rtVal) >= 8.0));
      if (criticsLow) {
        criticAvg = null;
        discardedCriticsLow = true;
      } else if (criticsHigh) {
        criticAvg = null;
      }
    }

    if (discardedCriticsLow && imdbVal != null) {
      // Qualidade = IMDb puro, sem diluir com nada
      extScore = Number(imdbVal);
    } else {
      let sum = 0, wSum = 0;
      const CRITIC_W = 1.0;
      const IMDB_BASE_W = 2.0;
      if (imdbVal != null) {
        let imdbW = IMDB_BASE_W;
        if (imdbVotes != null) {
          imdbW = Math.min(4.0, IMDB_BASE_W + Math.log10(imdbVotes + 1) / 3);
        }
        if (criticAvg == null) imdbW = Math.max(imdbW, 3.0);
        sum += Number(imdbVal) * imdbW;
        wSum += imdbW;
      }
      if (criticAvg != null) {
        let cW = CRITIC_W;
        if (imdbVal != null && Math.abs(Number(imdbVal) - criticAvg) > 1.5) cW *= 0.5;
        sum += criticAvg * cW;
        wSum += cW;
      }
      if (wSum > 0) extScore = sum / wSum;
    }
  }
  const hasExtPenaltyCountry = (movie.countries || []).some(c => PENALTY_COUNTRIES.has(c));

  family.members.forEach(other=>{
    if(other===person) return;
    const v = movie.votes[other];
    if(!v || v.score==null) return;
    const affinity = crossUserAffinityFor(person, other, movie);
    if(affinity===0) return;
    const contribution = (v.score-5.5) * affinity * 0.9;
    raw += contribution;
    maxPossible += Math.abs(contribution) + 1;
  });

  const { corr } = backtestAccuracy(person);
  const reliability = Math.max(0.15, corr);

  // --- % baseada no gosto (diretor, ator, país, década…) ---
  // Piso de confiança mais alto: corr 0.19 não deve esmagar a variação.
  let fatorConfianca = Math.max(0.70, Math.sqrt(reliability));
  const sinalCru = (maxPossible > 0) ? (raw / maxPossible) : 0;
  let diferencaDoMeio = (sinalCru * 100) - 50;
  // Amplificador forte para separar "amei" de "ok"
  let amplificador = 4.0;
  let tastePctRaw = 50 + (diferencaDoMeio * fatorConfianca * amplificador);
  // Evidência: maxPossible baixo → não inventa preferência
  const tasteEvidence = Math.max(0, Math.min(1, maxPossible / 10));
  let tastePct = 50 + (tastePctRaw - 50) * tasteEvidence;

  // --- % baseada na qualidade externa — impacto DIRETO ---
  // Cada ponto acima/abaixo de 6.5 move ~11 pontos (mais espalhado).
  let qualityPct = 50;
  if (extScore != null && !hasExtPenaltyCountry) {
    qualityPct = 50 + (extScore - 6.5) * 11;
    let qualityConf = 1;
    if (discardedCriticsLow) {
      // Crítica hostil descartada: confia no IMDb (público) sem amortecer
      qualityConf = 1;
    } else if (imdbVal == null) {
      qualityConf = 0.25;
    } else if (imdbVotes != null) {
      qualityConf = Math.min(1, Math.log10(imdbVotes + 1) / 4.7);
      qualityConf = Math.max(0.20, qualityConf);
    } else {
      qualityConf = 0.45;
    }
    qualityPct = 50 + (qualityPct - 50) * qualityConf;
  }

  // Curva contínua (sigmoide) do peso gosto × evidência — sem degraus.
  // Evidência 0 → ~15% gosto; evidência 1 → ~35% gosto.
  // A confiança do gosto já multiplica: sinal fraco pesa menos sozinho.
  function sigmoid01(x){
    // centra em 0.5, suave
    return 1 / (1 + Math.exp(-8 * (x - 0.5)));
  }
  const PesoMin = 0.15, PesoMax = 0.35;
  let tasteWeight = PesoMin + (PesoMax - PesoMin) * sigmoid01(tasteEvidence);
  // Peso do gosto também escala com a confiança do modelo (corr)
  tasteWeight *= Math.max(0.55, fatorConfianca);
  if (imdbVal == null) {
    // Sem IMDb: não deixa crítica isolada dominar
    tasteWeight = Math.max(tasteWeight, 0.30);
  }
  // Garante faixa útil
  tasteWeight = Math.max(0.10, Math.min(0.45, tasteWeight));
  // Quando a crítica hostil foi descartada, o IMDb manda: reduz peso do gosto
  // (evita a nota 6 da sequência no mesmo diretor afundar o original no leave-one-out)
  if (discardedCriticsLow) {
    tasteWeight = Math.min(tasteWeight, 0.12);
  }
  const qualityWeight = 1 - tasteWeight;
  let pctFinal = tastePct * tasteWeight + qualityPct * qualityWeight;

  // Esticamento ASSIMÉTRICO
  if (pctFinal >= 50) {
    pctFinal = 50 + (pctFinal - 50) * 2.0;
  } else {
    pctFinal = 50 + (pctFinal - 50) * 1.15;
  }
  pctFinal = Math.max(5, Math.min(95, pctFinal));

  // Penalidades adicionais de origem e temática
  const hasPenaltyCountry = (movie.countries || []).some(c => PENALTY_COUNTRIES.has(c));
  if (hasPenaltyCountry) {
    pctFinal = pctFinal * 0.8; // diminui 20%
  }

  // Volume por país: se o usuário avaliou < 6 filmes do país principal → −15%
  {
    const mainCountry = (movie.countries || [])[0];
    if (mainCountry) {
      let n = 0;
      for (let i = 0; i < movies.length; i++) {
        const m2 = movies[i];
        if (m2.id === movie.id) continue;
        const v2 = m2.votes && m2.votes[person];
        if (v2 && v2.score != null && (m2.countries || []).includes(mainCountry)) n++;
      }
      if (n < 6) pctFinal = pctFinal * 0.85;
    }
  }
  // Temática de minorias após 1999: −20% se o ano > 1999 e houver palavras-chave típicas
  // (usa keywords da TMDB quando disponíveis; senão cai na sinopse/gênero)
  const yearNum = parseInt(movie.year);
  if (!isNaN(yearNum) && yearNum > 1999) {
    let hasMinorityTheme = false;
    if (movie.keywords && movie.keywords.length) {
      const kwSet = new Set(movie.keywords.map(k => String(k).toLowerCase()));
      hasMinorityTheme = MINORITY_KW_LIST.some(k => kwSet.has(k));
    }
    if (!hasMinorityTheme) {
      // fallback: sinopse + gêneros (para títulos ainda sem keywords carregadas)
      const textToCheck = ((movie.synopsisPt || '') + ' ' + (movie.plot || '') + ' ' + (movie.genres || []).join(' ')).toLowerCase();
      const fallbackRe = /\b(lgbt|lgbtq|queer|transgender|homosexual|bisexual|gay protagonist|gender identity|homophobia|transphobia|diversidade|inclusão|identidade de gênero)\b/i;
      hasMinorityTheme = fallbackRe.test(textToCheck);
    }
    if (hasMinorityTheme) {
      pctFinal = pctFinal * 0.8; // diminui 20%
    }
  }

  // Sexismo / feminismo / misoginia: −20% em QUALQUER época
  {
    let hasSexismTheme = false;
    if (movie.keywords && movie.keywords.length) {
      const kwSet = new Set(movie.keywords.map(k => String(k).toLowerCase()));
      hasSexismTheme = SEXISM_KW_LIST.some(k => kwSet.has(k));
    }
    if (!hasSexismTheme) {
      const textToCheck = ((movie.synopsisPt || '') + ' ' + (movie.plot || '') + ' ' + (movie.genres || []).join(' ')).toLowerCase();
      const sexismRe = /\b(sexism|sexist|misogyny|misogynist|feminism|feminist|patriarchy|patriarchal|chauvinism|toxic masculinity|male gaze|sexismo|misoginia|feminismo|feminista)\b/i;
      hasSexismTheme = sexismRe.test(textToCheck);
    }
    if (hasSexismTheme) {
      pctFinal = pctFinal * 0.8; // diminui 20%
    }
  }

  // Temas raciais: −20% se ano > 2012
  if (!isNaN(yearNum) && yearNum > 2012) {
    let hasRacialTheme = false;
    if (movie.keywords && movie.keywords.length) {
      const kwSet = new Set(movie.keywords.map(k => String(k).toLowerCase()));
      hasRacialTheme = RACIAL_KW_LIST.some(k => kwSet.has(k));
    }
    if (!hasRacialTheme) {
      const textToCheck = ((movie.synopsisPt || '') + ' ' + (movie.plot || '') + ' ' + (movie.genres || []).join(' ')).toLowerCase();
      const racialRe = /\b(racism|racist|racial (tension|conflict|injustice|discrimination|prejudice|identity)|systemic racism|police brutality|black lives matter|white privilege|race relations|racismo|racial)\b/i;
      hasRacialTheme = racialRe.test(textToCheck);
    }
    if (hasRacialTheme) {
      pctFinal = pctFinal * 0.8; // diminui 20%
    }
  }

  // Xenofobia a estrangeiros: −20% se ano > 2006
  if (!isNaN(yearNum) && yearNum > 2006) {
    let hasXenoTheme = false;
    if (movie.keywords && movie.keywords.length) {
      const kwSet = new Set(movie.keywords.map(k => String(k).toLowerCase()));
      hasXenoTheme = XENOPHOBIA_KW_LIST.some(k => kwSet.has(k));
    }
    if (!hasXenoTheme) {
      const textToCheck = ((movie.synopsisPt || '') + ' ' + (movie.plot || '') + ' ' + (movie.genres || []).join(' ')).toLowerCase();
      const xenoRe = /\b(xenophobia|xenophobic|anti-?immigrant|anti-?immigration|refugee crisis|nativism|xenofobia|xenófob)\b/i;
      hasXenoTheme = xenoRe.test(textToCheck);
    }
    if (hasXenoTheme) {
      pctFinal = pctFinal * 0.8; // diminui 20%
    }
  }

  // Filosofia / existencialismo: −10% em QUALQUER época
  {
    let hasPhilosophyTheme = false;
    if (movie.keywords && movie.keywords.length) {
      const kwSet = new Set(movie.keywords.map(k => String(k).toLowerCase()));
      hasPhilosophyTheme = PHILOSOPHY_KW_LIST.some(k => kwSet.has(k));
    }
    if (!hasPhilosophyTheme) {
      const textToCheck = ((movie.synopsisPt || '') + ' ' + (movie.plot || '') + ' ' + (movie.genres || []).join(' ')).toLowerCase();
      const philRe = /\b(philosophy|philosophical|philosopher|existentialism|existential|metaphysics|metaphysical|nihilism|absurdism|meaning of life|human condition|filosofia|filosófico|existencialismo|existencial)\b/i;
      hasPhilosophyTheme = philRe.test(textToCheck);
    }
    if (hasPhilosophyTheme) {
      pctFinal = pctFinal * 0.9; // diminui 10%
    }
  }

  // Propaganda pró-comunismo/socialismo: −20%
  // + lista explícita de títulos (Democracia em Vertigem, Ainda Estou Aqui, O Agente Secreto…)
  {
    let hasCommiePropaganda = isForcedCommiePenalty(movie);
    let isCritiqueOrContext = false;
    if (!hasCommiePropaganda) {
      if (movie.keywords && movie.keywords.length) {
        const kwSet = new Set(movie.keywords.map(k => String(k).toLowerCase()));
        isCritiqueOrContext = COMMIE_CRITIQUE_KW_LIST.some(k => kwSet.has(k));
        if (!isCritiqueOrContext) {
          hasCommiePropaganda = COMMIE_PROPAGANDA_KW_LIST.some(k => kwSet.has(k));
        }
      }
      if (!hasCommiePropaganda && !isCritiqueOrContext) {
        const textToCheck = ((movie.synopsisPt || '') + ' ' + (movie.plot || '')).toLowerCase();
        if (/\b(anti-?communis|anti-?socialis|crítica ao comunismo|crítica ao socialismo|gulag|dissiden|defector)\b/i.test(textToCheck)) {
          isCritiqueOrContext = true;
        } else {
          const propRe = /\b(propaganda comunista|propaganda socialista|apologia ao comunismo|apologia ao socialismo|pro-?communist|pro-?socialist|communist propaganda|socialist propaganda|agitprop|filme militante|cinema militante)\b/i;
          hasCommiePropaganda = propRe.test(textToCheck);
        }
      }
    }
    if (hasCommiePropaganda && !isCritiqueOrContext) {
      pctFinal = pctFinal * 0.8; // diminui 20%
    }
  }

  const pct = Math.round(pctFinal);
  return {
    ready: true,
    pct,
    _debug: {
      raw: raw.toFixed(2),
      maxPossible: maxPossible.toFixed(2),
      ratio: sinalCru.toFixed(3),
      corr: corr.toFixed(2),
      count,
      tasteEvidence: tasteEvidence.toFixed(2),
      tastePct: Math.round(tastePct),
      qualityPct: Math.round(qualityPct),
      extScore: extScore != null ? extScore.toFixed(1) : null,
      tasteW: tasteWeight.toFixed(2),
      pctFinal
    }
  };
  } catch(e) {
    console.error('estimateAffinity failed for', movie && movie.id, e);
    return { ready:false, pct:50 };
  }
}



function slimForWorker(m){
  // só campos usados no algoritmo
  return {
    id: m.id, imdbId: m.imdbId, type: m.type,
    titlePt: m.titlePt, titleOriginal: m.titleOriginal, titleEn: m.titleEn, title: m.title,
    year: m.year, director: m.director, writer: m.writer, actors: m.actors,
    genres: m.genres, countries: m.countries, production: m.production,
    runtimeMin: m.runtimeMin, keywords: m.keywords,
    ratings: m.ratings, votes: m.votes, checkins: m.checkins,
    dismissedBy: m.dismissedBy, abandonedBy: m.abandonedBy,
    synopsisPt: m.synopsisPt, plot: m.plot, seasons: m.seasons, episodeVotes: m.episodeVotes
  };
}

self.onmessage = function(e){
  const msg = e.data || {};
  const type = msg.type;
  try {
    if(type === 'INIT'){
      movies = (msg.movies || []).map(slimForWorker);
      family = msg.family || { members: [] };
      me = msg.me || null;
      // limpa caches ao reinicializar
      _profileCache = {};
      _crossAffinityCache = {};
      _backtestCache = {};
      _alignCache = {};
      self.postMessage({ type: 'READY', n: movies.length });
      return;
    }
    if(type === 'UPDATE_MOVIE'){
      const m = slimForWorker(msg.movie);
      const i = movies.findIndex(x => x.id === m.id);
      if(i >= 0) movies[i] = m; else movies.push(m);
      _profileCache = {};
      _crossAffinityCache = {};
      _backtestCache = {};
      _alignCache = {};
      self.postMessage({ type: 'UPDATED', id: m.id });
      return;
    }
    if(type === 'COMPUTE_ALL'){
      const person = msg.person || me;
      const results = {};
      const total = movies.length;
      const REPORT_EVERY = 200;
      for(let i = 0; i < total; i++){
        const m = movies[i];
        try {
          const rec = estimateAffinity(m, person);
          results[m.id] = (rec && rec.ready && rec.pct != null) ? rec.pct : -1;
        } catch(err){
          results[m.id] = -1;
        }
        if(i > 0 && i % REPORT_EVERY === 0){
          self.postMessage({ type: 'PROGRESS', done: i, total });
        }
      }
      self.postMessage({ type: 'RESULTS', data: results, person });
      return;
    }
    if(type === 'COMPUTE_ONE'){
      const person = msg.person || me;
      const movie = movies.find(x => x.id === msg.id) || (msg.movie ? slimForWorker(msg.movie) : null);
      if(!movie){ self.postMessage({ type: 'ONE_RESULT', id: msg.id, pct: -1 }); return; }
      let pct = -1;
      try {
        const rec = estimateAffinity(movie, person);
        if(rec && rec.ready && rec.pct != null) pct = rec.pct;
      } catch(err){}
      self.postMessage({ type: 'ONE_RESULT', id: movie.id, pct });
      return;
    }
  } catch(err){
    self.postMessage({ type: 'ERROR', message: String(err && err.message || err) });
  }
};
