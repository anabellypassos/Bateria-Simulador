'use strict';

/* =========================================================
   1. CONFIGURAÇÃO
   Cada tecla aponta para um arquivo em sounds/ e para uma
   peça desenhada no SVG (atributo data-peca).
   Para trocar um som, basta trocar o arquivo .wav.
   ========================================================= */
const SONS = {
    keyq: { letra: 'Q', nome: 'Surdo', peca: 'surdo' },
    keyw: { letra: 'W', nome: 'Palmas (pad)', peca: 'pad' },
    keye: { letra: 'E', nome: 'Chimbal fechado', peca: 'chimbal', modo: 'fechado' },
    keya: { letra: 'A', nome: 'Bumbo', peca: 'bumbo' },
    keys: { letra: 'S', nome: 'Chimbal aberto', peca: 'chimbal', modo: 'aberto' },
    keyd: { letra: 'D', nome: 'Prato de condução', peca: 'ride' },
    keyz: { letra: 'Z', nome: 'Caixa', peca: 'caixa' },
    keyx: { letra: 'X', nome: 'Cowbell', peca: 'cowbell' },
    keyc: { letra: 'C', nome: 'Tom', peca: 'tom' },
};

const RITMOS = [
    { nome: 'Rock básico', texto: '(ae)e(ze)e(ae)(ae)(ze)e' },
    { nome: 'Rock no prato de condução', texto: '(ad)d(zd)d(ad)(ad)(zd)d' },
    { nome: 'Rock com chimbal aberto', texto: '(ae)e(ze)e(ae)(ae)(ze)s' },
    { nome: 'Disco', texto: '(ae)s(aze)s(ae)s(aze)s' },
    { nome: 'Hip-hop', texto: '(ae)e(we)e-(ae)(we)e' },
    { nome: 'Virada', texto: '(ae)e(ze)ezzcczzcc(aq)q(ad)---' },
    { nome: 'Cowbell!', texto: '(ax)x(zx)x(ax)(ax)(zx)x' },
];

const ARMAZENAMENTO = 'bateria-config';

/* =========================================================
   2. ÁUDIO
   Usa a Web Audio API (rápida e permite sons sobrepostos).
   Se o arquivo for aberto direto (file://), o navegador
   bloqueia o fetch, então caímos para elementos <audio>
   reaproveitados em "pool".
   ========================================================= */
const Som = {
    ctx: null,
    saida: null,
    buffers: {},
    pools: {},
    chimbalAberto: [],
    volume: 0.8,
    modoCompativel: false,

    async carregar() {
        const AC = window.AudioContext || window.webkitAudioContext;
        const podeBuscar = location.protocol !== 'file:';

        if (AC && podeBuscar) {
            try {
                this.ctx = new AC();
                this.saida = this.ctx.createGain();
                this.saida.gain.value = this.volume;
                this.saida.connect(this.ctx.destination);
            } catch (erro) {
                this.ctx = null;
            }
        }

        const resultados = await Promise.all(Object.keys(SONS).map(async (tecla) => {
            const arquivo = `sounds/${tecla}.wav`;
            if (this.ctx) {
                try {
                    const resposta = await fetch(arquivo);
                    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
                    const dados = await resposta.arrayBuffer();
                    this.buffers[tecla] = await this.ctx.decodeAudioData(dados);
                    return true;
                } catch (erro) {
                    console.warn(`Não consegui carregar ${arquivo} pela Web Audio:`, erro);
                }
            }
            this.pools[tecla] = this.criarPool(arquivo);
            this.modoCompativel = true;
            return true;
        }));

        return resultados.every(Boolean);
    },

    criarPool(arquivo, tamanho = 6) {
        const itens = [];
        for (let i = 0; i < tamanho; i++) {
            const audio = new Audio(arquivo);
            audio.preload = 'auto';
            itens.push(audio);
        }
        return { itens, proximo: 0 };
    },

    tocar(tecla) {
        // Chimbal fechado "abafa" o chimbal aberto, como numa bateria real
        if (tecla === 'keye') this.abafarChimbal();

        const buffer = this.buffers[tecla];
        if (buffer && this.ctx) {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            const fonte = this.ctx.createBufferSource();
            const ganho = this.ctx.createGain();
            fonte.buffer = buffer;
            fonte.connect(ganho);
            ganho.connect(this.saida);
            fonte.start();

            if (tecla === 'keys') {
                const item = { fonte, ganho };
                this.chimbalAberto.push(item);
                fonte.onended = () => {
                    this.chimbalAberto = this.chimbalAberto.filter((x) => x !== item);
                };
            }
            return;
        }

        const pool = this.pools[tecla];
        if (!pool) return;
        const audio = pool.itens[pool.proximo];
        pool.proximo = (pool.proximo + 1) % pool.itens.length;
        audio.volume = this.volume;
        try {
            audio.currentTime = 0;
        } catch (erro) { /* ainda carregando */ }
        const promessa = audio.play();
        if (promessa) promessa.catch(() => {});
    },

    abafarChimbal() {
        if (this.ctx) {
            const agora = this.ctx.currentTime;
            this.chimbalAberto.forEach(({ fonte, ganho }) => {
                ganho.gain.setTargetAtTime(0, agora, 0.015);
                try { fonte.stop(agora + 0.12); } catch (erro) { /* já parou */ }
            });
            this.chimbalAberto = [];
        }
        const pool = this.pools.keys;
        if (pool) pool.itens.forEach((audio) => { if (!audio.paused) audio.pause(); });
    },

    definirVolume(valor) {
        this.volume = valor;
        if (this.saida) this.saida.gain.value = valor;
    },
};

/* =========================================================
   3. VISUAL
   ========================================================= */
const kit = document.querySelector('#kit');
const legenda = document.querySelector('#legenda');
const pecas = {};
kit.querySelectorAll('.piece').forEach((el) => { pecas[el.dataset.peca] = el; });

// Monta os botões da legenda a partir da configuração
Object.entries(SONS).forEach(([tecla, info]) => {
    const botao = document.createElement('button');
    botao.className = 'tecla';
    botao.dataset.key = tecla;
    botao.type = 'button';
    botao.innerHTML = `<span class="letra">${info.letra}</span><span class="nome">${info.nome}</span>`;
    legenda.appendChild(botao);
});

function reiniciarAnimacao(el, ...classes) {
    el.classList.remove('hit', 'hit-aberto', 'hit-fechado');
    void el.getBoundingClientRect(); // força o navegador a "esquecer" a animação anterior
    el.classList.add(...classes);
}

function piscar(el, classe, tempo) {
    if (!el) return;
    el.classList.add(classe);
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove(classe), tempo);
}

function animar(tecla) {
    const info = SONS[tecla];
    const peca = pecas[info.peca];
    if (peca) {
        const classes = ['hit'];
        if (info.modo) classes.push(`hit-${info.modo}`);
        reiniciarAnimacao(peca, ...classes);
    }
    piscar(kit.querySelector(`.badge[data-key="${tecla}"]`), 'ativo', 160);
    piscar(legenda.querySelector(`[data-key="${tecla}"]`), 'active', 160);
}

/* =========================================================
   4. TOCAR (ponto central: teclado, clique, compositor e
      gravação passam todos por aqui)
   ========================================================= */
function tocar(tecla, origem = 'usuario') {
    if (!SONS[tecla]) return;
    Som.tocar(tecla);
    animar(tecla);
    if (origem === 'usuario' && Gravador.gravando) Gravador.registrar(tecla);
}

/* =========================================================
   5. COMPOSITOR
   ========================================================= */
const campo = document.querySelector('#input');
const trilha = document.querySelector('#trilha');
const bpm = document.querySelector('#bpm');
const bpmValor = document.querySelector('#bpmValor');
const loop = document.querySelector('#loop');

const Compositor = {
    passos: [],
    indice: 0,
    timer: null,
    tocando: false,

    // "(ae)e-z" -> [['keya','keye'], ['keye'], [], ['keyz']]
    interpretar(texto) {
        const passos = [];
        let grupo = null;
        for (const c of texto.toLowerCase()) {
            if (c === '(') { grupo = []; continue; }
            if (c === ')') {
                if (grupo) passos.push(grupo);
                grupo = null;
                continue;
            }
            if (c === '-' || c === '.') {
                if (!grupo) passos.push([]);
                continue;
            }
            const tecla = `key${c}`;
            if (!SONS[tecla]) continue; // espaços e letras sem som são ignorados
            if (grupo) {
                if (!grupo.includes(tecla)) grupo.push(tecla);
            } else {
                passos.push([tecla]);
            }
        }
        if (grupo && grupo.length) passos.push(grupo);
        return passos;
    },

    // Cada passo vale uma colcheia (meio tempo)
    intervalo() {
        return 60000 / Number(bpm.value) / 2;
    },

    desenhar() {
        this.passos = this.interpretar(campo.value);
        trilha.innerHTML = '';
        this.passos.forEach((passo) => {
            const el = document.createElement('span');
            el.className = passo.length ? 'passo' : 'passo pausa';
            el.textContent = passo.length ? passo.map((t) => SONS[t].letra).join('+') : '·';
            trilha.appendChild(el);
        });
    },

    destacar(i) {
        trilha.querySelectorAll('.atual').forEach((el) => el.classList.remove('atual'));
        const el = trilha.children[i];
        if (el) el.classList.add('atual');
    },

    tocar() {
        this.parar();
        this.desenhar();
        if (!this.passos.length || this.passos.every((p) => !p.length)) {
            campo.focus();
            return;
        }
        this.tocando = true;
        this.indice = 0;
        let alvo = performance.now();

        const passo = () => {
            if (!this.tocando) return;
            if (this.indice >= this.passos.length) {
                if (!loop.checked) { this.parar(); return; }
                this.indice = 0;
            }
            this.passos[this.indice].forEach((t) => tocar(t, 'compositor'));
            this.destacar(this.indice);
            this.indice++;
            alvo += this.intervalo(); // compensa atrasos do setTimeout
            this.timer = setTimeout(passo, Math.max(0, alvo - performance.now()));
        };
        passo();
    },

    parar() {
        this.tocando = false;
        clearTimeout(this.timer);
        this.destacar(-1);
    },
};

/* =========================================================
   6. GRAVADOR
   ========================================================= */
const btnGravar = document.querySelector('#btnGravar');
const btnOuvir = document.querySelector('#btnOuvir');
const btnParaCompositor = document.querySelector('#btnParaCompositor');
const statusGravacao = document.querySelector('#statusGravacao');

const Gravador = {
    gravando: false,
    inicio: 0,
    notas: [],
    timers: [],

    alternar() {
        if (this.gravando) this.parar();
        else this.iniciar();
    },

    iniciar() {
        pararTudo();
        this.notas = [];
        this.inicio = performance.now();
        this.gravando = true;
        btnGravar.classList.add('gravando');
        btnGravar.textContent = '■ Parar gravação';
        this.atualizar();
    },

    registrar(tecla) {
        this.notas.push({ tecla, ms: performance.now() - this.inicio });
        this.atualizar();
    },

    parar() {
        this.gravando = false;
        btnGravar.classList.remove('gravando');
        btnGravar.textContent = '● Gravar';
        this.atualizar();
    },

    duracao() {
        if (this.notas.length < 2) return 0;
        return (this.notas[this.notas.length - 1].ms - this.notas[0].ms) / 1000;
    },

    atualizar() {
        const n = this.notas.length;
        const temNotas = n > 0;
        btnOuvir.disabled = !temNotas || this.gravando;
        btnParaCompositor.disabled = !temNotas || this.gravando;
        if (this.gravando) {
            statusGravacao.textContent = `Gravando… ${n} ${n === 1 ? 'batida' : 'batidas'}`;
        } else if (temNotas) {
            statusGravacao.textContent = `Gravação: ${n} ${n === 1 ? 'batida' : 'batidas'}, ${this.duracao().toFixed(1).replace('.', ',')} s`;
        } else {
            statusGravacao.textContent = 'Nada gravado ainda.';
        }
    },

    ouvir() {
        if (!this.notas.length) return;
        pararTudo();
        const zero = this.notas[0].ms;
        this.notas.forEach((nota) => {
            this.timers.push(setTimeout(() => tocar(nota.tecla, 'gravacao'), nota.ms - zero));
        });
    },

    pararOuvir() {
        this.timers.forEach(clearTimeout);
        this.timers = [];
    },

    // Encaixa as batidas gravadas na grade do BPM atual
    paraCompositor() {
        if (!this.notas.length) return;
        const passo = Compositor.intervalo();
        const zero = this.notas[0].ms;
        const grade = new Map();
        let ultimo = 0;
        this.notas.forEach(({ tecla, ms }) => {
            const i = Math.round((ms - zero) / passo);
            ultimo = Math.max(ultimo, i);
            if (!grade.has(i)) grade.set(i, new Set());
            grade.get(i).add(SONS[tecla].letra.toLowerCase());
        });
        let texto = '';
        for (let i = 0; i <= ultimo; i++) {
            const letras = grade.has(i) ? [...grade.get(i)] : [];
            if (!letras.length) texto += '-';
            else if (letras.length === 1) texto += letras[0];
            else texto += `(${letras.join('')})`;
        }
        campo.value = texto;
        Compositor.desenhar();
        campo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
};

function pararTudo() {
    Compositor.parar();
    Gravador.pararOuvir();
}

/* =========================================================
   7. EVENTOS
   ========================================================= */
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        pararTudo();
        if (Gravador.gravando) Gravador.parar();
        return;
    }

    const alvo = e.target;
    // Enquanto digita no compositor, as letras não tocam
    if (alvo.matches('input[type="text"], textarea, select')) return;

    // Enter/Espaço numa peça focada (navegação por Tab)
    if ((e.key === 'Enter' || e.key === ' ') && alvo.closest && alvo.closest('#kit [data-key]')) {
        e.preventDefault();
        tocar(alvo.closest('[data-key]').dataset.key);
        return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;

    const tecla = (e.code || '').toLowerCase(); // 'KeyQ' -> 'keyq'
    if (SONS[tecla]) {
        e.preventDefault();
        tocar(tecla);
    }
});

// Clique / toque nas peças (vários dedos ao mesmo tempo funcionam)
kit.addEventListener('pointerdown', (e) => {
    const alvo = e.target.closest('[data-key]');
    if (!alvo) return;
    e.preventDefault();
    tocar(alvo.dataset.key);
});

legenda.addEventListener('pointerdown', (e) => {
    const alvo = e.target.closest('[data-key]');
    if (!alvo) return;
    e.preventDefault();
    tocar(alvo.dataset.key);
});
// Teclado (Enter/Espaço) nos botões da legenda gera "click" com detail 0
legenda.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-key]');
    if (alvo && e.detail === 0) tocar(alvo.dataset.key);
});

campo.addEventListener('input', () => Compositor.desenhar());
campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        Compositor.tocar();
    }
});
document.querySelector('#btnTocar').addEventListener('click', () => Compositor.tocar());
document.querySelector('#btnParar').addEventListener('click', () => pararTudo());

const seletorRitmos = document.querySelector('#ritmos');
RITMOS.forEach((ritmo, i) => {
    const opcao = document.createElement('option');
    opcao.value = i;
    opcao.textContent = ritmo.nome;
    seletorRitmos.appendChild(opcao);
});
seletorRitmos.addEventListener('change', () => {
    const ritmo = RITMOS[seletorRitmos.value];
    if (!ritmo) return;
    campo.value = ritmo.texto;
    loop.checked = true;
    Compositor.tocar();
    seletorRitmos.blur();
});

bpm.addEventListener('input', () => {
    bpmValor.textContent = bpm.value;
    salvarConfig();
});
loop.addEventListener('change', salvarConfig);

const volume = document.querySelector('#volume');
volume.addEventListener('input', () => {
    Som.definirVolume(volume.value / 100);
    salvarConfig();
});

const mostrarTeclas = document.querySelector('#mostrarTeclas');
mostrarTeclas.addEventListener('change', () => {
    kit.classList.toggle('sem-teclas', !mostrarTeclas.checked);
    salvarConfig();
});

btnGravar.addEventListener('click', () => Gravador.alternar());
btnOuvir.addEventListener('click', () => Gravador.ouvir());
btnParaCompositor.addEventListener('click', () => Gravador.paraCompositor());

/* =========================================================
   8. PREFERÊNCIAS (lembra volume, BPM etc. entre visitas)
   ========================================================= */
function salvarConfig() {
    try {
        localStorage.setItem(ARMAZENAMENTO, JSON.stringify({
            volume: Number(volume.value),
            bpm: Number(bpm.value),
            loop: loop.checked,
            teclas: mostrarTeclas.checked,
            composicao: campo.value,
        }));
    } catch (erro) { /* navegador sem armazenamento */ }
}

function carregarConfig() {
    let config = null;
    try {
        config = JSON.parse(localStorage.getItem(ARMAZENAMENTO));
    } catch (erro) { /* ignora */ }
    if (!config) return;
    if (typeof config.volume === 'number') volume.value = config.volume;
    if (typeof config.bpm === 'number') bpm.value = config.bpm;
    if (typeof config.loop === 'boolean') loop.checked = config.loop;
    if (typeof config.teclas === 'boolean') mostrarTeclas.checked = config.teclas;
    if (typeof config.composicao === 'string') campo.value = config.composicao;
}

campo.addEventListener('change', salvarConfig);
window.addEventListener('beforeunload', salvarConfig);

/* =========================================================
   9. INÍCIO
   ========================================================= */
(async function iniciar() {
    carregarConfig();
    bpmValor.textContent = bpm.value;
    Som.definirVolume(volume.value / 100);
    kit.classList.toggle('sem-teclas', !mostrarTeclas.checked);
    Compositor.desenhar();
    Gravador.atualizar();

    const status = document.querySelector('#status');
    await Som.carregar();
    if (Som.modoCompativel) {
        status.textContent = 'Pronto! Dica: abrindo pelo Live Server do VS Code o som responde mais rápido.';
        status.classList.add('aviso');
    } else {
        status.textContent = 'Pronto! Toque com o teclado ou clicando nas peças.';
    }
})();
