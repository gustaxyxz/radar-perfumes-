// ========================================================
// SNIPER OLX - MONITOR EM TEMPO REAL DE PERFUMES NA OLX
// Varre os anúncios mais recentes a cada 30-45 segundos
// usando a API interna JSON da OLX (sem Puppeteer/navegador)
// ========================================================

const config = require('./config');
const telegram = require('./telegram');
const security = require('./security');

// Termos de busca prioritários para perfumes
const TERMOS_BUSCA_OLX = [
    'perfume desapego',
    'sauvage dior',
    'bleu de chanel',
    'invictus',
    '212 vip',
    'aventus creed',
    'layton parfums de marly',
    'good girl carolina herrera',
    'bad boy carolina herrera',
    'one million paco rabanne',
    'acqua di gio',
    'armani code',
    'eros versace',
    'parfums de marly',
    'baccarat rouge',
    'le male jean paul gaultier',
    'perfume nicho',
    'decant perfume',
    'xerjoff',
    'nishane hacivat'
];

// Histórico de IDs já vistos para não notificar duplicados
const idsJaVistos = new Set();
let indiceTermo = 0; // Rotaciona os termos para não sobrecarregar

class OlxSniper {
    constructor() {
        this.ativo = false;
        this.intervalId = null;
        this.totalDetectados = 0;
    }

    async buscarAnunciosRecentes(termo) {
        try {
            // API interna da OLX para busca de anúncios recentes (mobile-friendly endpoint)
            const termoCodificado = encodeURIComponent(termo);
            let targetUrl = `https://www.olx.com.br/api/relevance/v2/search?q=${termoCodificado}&sc=1765&sf=1&sp=1&o=1&uq=1`;

            let fetchUrl = targetUrl;
            if (config.SCRAPER_API_URL) {
                fetchUrl = `${config.SCRAPER_API_URL}${encodeURIComponent(targetUrl)}`;
            }

            const resp = await fetch(fetchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'pt-BR,pt;q=0.9',
                    'Referer': 'https://www.olx.com.br/',
                    'x-origin-url': `https://www.olx.com.br/brasil?q=${termoCodificado}`
                },
                signal: AbortSignal.timeout(12000)
            });

            if (!resp.ok) return [];

            const dados = await resp.json();
            return dados?.data?.ads || [];

        } catch (e) {
            // Silencioso em timeout / bloqueio temporário
            return [];
        }
    }

    extrairPerfumeDoTitulo(titulo) {
        if (!titulo) return null;
        const t = titulo.toUpperCase();
        const perfumes = [
            'SAUVAGE', 'BLEU DE CHANEL', 'INVICTUS', '212 VIP', 'AVENTUS',
            'LAYTON', 'GOOD GIRL', 'BAD BOY', 'ONE MILLION', 'ACQUA DI GIO',
            'ARMANI CODE', 'EROS', 'BACCARAT ROUGE', 'BR540', 'LE MALE',
            'HACIVAT', 'NAXOS', 'ERBA PURA', 'CEDRAT BOISE', 'TOBACCO VANILLE',
            'OUD WOOD', 'LOST CHERRY', 'FAHRENHEIT', 'KOUROS', 'LIBRE', 'MYSLF',
            'STRONGER WITH YOU', 'LUNA ROSSA', 'PHANTOM', 'ULTRA MALE'
        ];
        for (const p of perfumes) {
            if (t.includes(p)) return p;
        }
        return null;
    }

    extrairPreco(anuncio) {
        const priceStr = anuncio.price || anuncio.priceValue || '';
        const match = String(priceStr).replace(/\./g, '').match(/(\d{2,4})/);
        if (match) {
            const val = parseInt(match[1], 10);
            if (val >= 30 && val <= 8000) return val;
        }
        return null;
    }

    async processarAnuncio(anuncio, termo) {
        const id = anuncio.listId || anuncio.id;
        if (!id || idsJaVistos.has(String(id))) return;
        idsJaVistos.add(String(id));

        // Limpa histórico se ficar muito grande
        if (idsJaVistos.size > 5000) {
            const arr = [...idsJaVistos];
            arr.slice(0, 2000).forEach(i => idsJaVistos.delete(i));
        }

        const titulo = anuncio.title || anuncio.subject || '';
        const descricao = anuncio.body || anuncio.description || '';
        const textoCompleto = `${titulo} ${descricao}`.toLowerCase();

        // Filtra anúncios que não parecem perfume real
        const ehPerfume = ['perfume', 'fragrance', 'fragrância', 'decant', 'ml', 'edp', 'edt', 'eau de', 'colônia', 'cologne'].some(t => textoCompleto.includes(t));
        if (!ehPerfume && !titulo.toLowerCase().includes(termo.split(' ')[0])) return;

        const preco = this.extrairPreco(anuncio);
        const perfume = this.extrairPerfumeDoTitulo(titulo);
        const url = anuncio.url || anuncio.linkData?.href || `https://www.olx.com.br/anuncio/${id}`;
        const imagem = anuncio.images?.[0]?.large || anuncio.thumbnail || null;
        const cidade = anuncio.location?.municipality || anuncio.municipalityLabel || '';
        const estado = anuncio.location?.uf || anuncio.stateLabel || '';

        const item = {
            autorTelefone: '',
            texto: `${titulo}\n${descricao}`.substring(0, 300),
            tipo: 'VENDA',
            perfume: perfume,
            preco: preco,
            volume: null,
            grupoNome: 'OLX',
            fonte: 'OLX'
        };

        const auditoria = security.analisarSeguranca(item, null);
        const precoTxt = preco ? `R$ ${preco.toFixed ? preco.toFixed(0) : preco}` : 'A negociar';
        const alertaRisco = auditoria.alertas.filter(a => a.startsWith('🚨')).join('\n');

        const textoMsg = `🔵 <b>[OLX SNIPER] DESAPEGO DETECTADO!</b>

📦 <b>${titulo}</b>
💰 <b>Preço:</b> ${precoTxt}
📍 <b>Local:</b> ${cidade}${estado ? `/${estado}` : ''}
🛡️ <b>Auditoria:</b> ${auditoria.selo}${alertaRisco ? `\n${alertaRisco}` : ''}

🔗 <a href="${url}">Ver anúncio na OLX</a>`;

        const botoes = {
            inline_keyboard: [[
                { text: '🔗 Abrir na OLX', url: url }
            ]]
        };

        const chatIdDestino = config.TELEGRAM_ADMIN_CHAT_ID || config.TELEGRAM_PARCEIRO_CHAT_ID;
        const fotos = (anuncio.images || []).map(img => img.original || img.large || img.url).filter(Boolean);
        if (fotos.length === 0 && imagem) {
            fotos.push(imagem);
        }

        if (fotos.length > 1) {
            await telegram.enviarAlbum(chatIdDestino, fotos.slice(0, 5), textoMsg, botoes);
        } else if (fotos.length === 1) {
            await telegram.enviarFoto(chatIdDestino, fotos[0], 'image/jpeg', textoMsg, botoes);
        } else {
            await telegram.enviarMensagem(chatIdDestino, textoMsg, 'HTML', botoes);
        }

        this.totalDetectados++;
        console.log(`🔵 [OLX] Novo anúncio detectado: ${titulo} - ${precoTxt}`);
    }

    async executarCiclo() {
        // Rotaciona os termos a cada ciclo para varrer mais sem ser bloqueado
        const termo = TERMOS_BUSCA_OLX[indiceTermo % TERMOS_BUSCA_OLX.length];
        indiceTermo++;

        const anuncios = await this.buscarAnunciosRecentes(termo);

        for (const anuncio of anuncios) {
            await this.processarAnuncio(anuncio, termo);
        }
    }

    iniciar(intervaloSegundos = 35) {
        if (this.ativo) return;
        this.ativo = true;

        console.log(`🔵 [OLX SNIPER] Ativado! Varrendo ${TERMOS_BUSCA_OLX.length} termos a cada ${intervaloSegundos}s`);

        // Ciclo imediato ao iniciar
        this.executarCiclo().catch(() => {});

        this.intervalId = setInterval(() => {
            this.executarCiclo().catch(() => {});
        }, intervaloSegundos * 1000);
    }

    parar() {
        this.ativo = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log(`🔵 [OLX SNIPER] Parado. Total detectados: ${this.totalDetectados}`);
    }
}

module.exports = new OlxSniper();
