// ========================================================
// SNIPER ENJOEI - MONITOR EM TEMPO REAL DE PERFUMES NO ENJOEI
// Varre os anúncios mais recentes via API REST do Enjoei
// ========================================================

const config = require('./config');
const telegram = require('./telegram');
const security = require('./security');

const TERMOS_ENJOEI = [
    'perfume',
    'decant',
    'sauvage',
    'bleu de chanel',
    'invictus',
    'good girl',
    'bad boy',
    '212 vip',
    'parfums de marly',
    'creed aventus',
    'nicho perfume',
    'desapego perfume',
    'baccarat rouge',
    'le male',
    'armani code'
];

const idsJaVistos = new Set();
let indiceTermo = 0;

class EnjoeiSniper {
    constructor() {
        this.ativo = false;
        this.intervalId = null;
        this.totalDetectados = 0;
    }

    async buscarRecentes(termo) {
        try {
            const termoCod = encodeURIComponent(termo);
            let targetUrl = `https://www.enjoei.com.br/api/v2/searches?q=${termoCod}&page=1&per_page=20&order=newest`;

            let fetchUrl = targetUrl;
            if (config.SCRAPER_API_URL) {
                fetchUrl = `${config.SCRAPER_API_URL}${encodeURIComponent(targetUrl)}`;
            }

            const resp = await fetch(fetchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                    'Accept': 'application/json',
                    'Accept-Language': 'pt-BR,pt;q=0.9',
                    'Referer': 'https://www.enjoei.com.br/',
                    'x-requested-with': 'XMLHttpRequest'
                },
                signal: AbortSignal.timeout(12000)
            });

            if (!resp.ok) return [];
            const dados = await resp.json();
            return dados?.products || dados?.data || dados?.items || [];
        } catch (e) {
            return [];
        }
    }

    extrairPerfume(titulo) {
        if (!titulo) return null;
        const t = titulo.toUpperCase();
        const lista = [
            'SAUVAGE', 'BLEU DE CHANEL', 'INVICTUS', '212 VIP', 'AVENTUS',
            'LAYTON', 'GOOD GIRL', 'BAD BOY', 'ONE MILLION', 'ACQUA DI GIO',
            'ARMANI CODE', 'EROS', 'BACCARAT ROUGE', 'BR540', 'LE MALE',
            'HACIVAT', 'NAXOS', 'ERBA PURA', 'TOBACCO VANILLE', 'OUD WOOD',
            'STRONG WITH YOU', 'LUNA ROSSA', 'PHANTOM', 'ULTRA MALE'
        ];
        for (const p of lista) {
            if (t.includes(p)) return p;
        }
        return null;
    }

    async processarProduto(produto) {
        const id = produto.id || produto.slug;
        if (!id || idsJaVistos.has(String(id))) return;
        idsJaVistos.add(String(id));

        if (idsJaVistos.size > 5000) {
            const arr = [...idsJaVistos];
            arr.slice(0, 2000).forEach(i => idsJaVistos.delete(i));
        }

        const titulo = produto.title || produto.name || '';
        const descricao = produto.description || '';
        const preco = produto.price ? parseFloat(String(produto.price).replace(/[^\d.,]/g, '').replace(',', '.')) : null;
        const precoValido = preco && preco >= 20 && preco <= 8000 ? preco : null;
        const slug = produto.slug || produto.id;
        const url = `https://www.enjoei.com.br/p/${slug}`;
        const imagem = produto.photos?.[0]?.url || produto.image || null;
        const vendedor = produto.user?.login || produto.seller?.username || 'Vendedor';

        // Filtra se não parece perfume
        const textoLower = `${titulo} ${descricao}`.toLowerCase();
        const ehPerfume = ['perfume', 'decant', 'ml', 'edp', 'edt', 'eau de', 'fragrância', 'colônia'].some(t => textoLower.includes(t));
        if (!ehPerfume) return;

        const perfume = this.extrairPerfume(titulo);
        const precoTxt = precoValido ? `R$ ${precoValido.toFixed(2)}` : 'A negociar';

        const item = {
            autorTelefone: '',
            texto: `${titulo} ${descricao}`.substring(0, 300),
            tipo: 'VENDA',
            perfume: perfume,
            preco: precoValido,
            volume: null,
            grupoNome: 'Enjoei',
            fonte: 'Enjoei'
        };

        const auditoria = security.analisarSeguranca(item, null);
        const alertaRisco = auditoria.alertas.filter(a => a.startsWith('🚨')).join('\n');

        const textoMsg = `🟣 <b>[ENJOEI SNIPER] DESAPEGO DETECTADO!</b>

📦 <b>${titulo}</b>
💰 <b>Preço:</b> ${precoTxt}
👤 <b>Vendedor:</b> @${vendedor}
🛡️ <b>Auditoria:</b> ${auditoria.selo}${alertaRisco ? `\n${alertaRisco}` : ''}

🔗 <a href="${url}">Ver no Enjoei</a>`;

        const botoes = {
            inline_keyboard: [[
                { text: '🟣 Abrir no Enjoei', url: url }
            ]]
        };

        const chatIdDestino = config.TELEGRAM_ADMIN_CHAT_ID || config.TELEGRAM_PARCEIRO_CHAT_ID;
        const fotos = (produto.photos || []).map(p => p.url).filter(Boolean);
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
        console.log(`🟣 [ENJOEI] Novo: ${titulo} - ${precoTxt}`);
    }

    async executarCiclo() {
        const termo = TERMOS_ENJOEI[indiceTermo % TERMOS_ENJOEI.length];
        indiceTermo++;

        const produtos = await this.buscarRecentes(termo);
        for (const p of produtos) {
            await this.processarProduto(p);
        }
    }

    iniciar(intervaloSegundos = 45) {
        if (this.ativo) return;
        this.ativo = true;
        console.log(`🟣 [ENJOEI SNIPER] Ativado! ${TERMOS_ENJOEI.length} termos a cada ${intervaloSegundos}s`);

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
        console.log(`🟣 [ENJOEI SNIPER] Parado. Total: ${this.totalDetectados}`);
    async buscarParaCotacao(termo) {
        try {
            const products = await this.buscarRecentes(termo);
            const resultados = [];
            for (const p of products) {
                const titulo = p.title || p.name || '';
                const preco = this.extrairPreco(p);
                const slug = p.slug || p.id || '';
                const url = p.url ? (p.url.startsWith('http') ? p.url : `https://www.enjoei.com.br${p.url}`) : `https://www.enjoei.com.br/p/${slug}`;
                if (preco && preco >= 30) {
                    resultados.push({
                        plataforma: 'Enjoei',
                        titulo,
                        preco,
                        url,
                        data: 'Ativo'
                    });
                }
            }
            return resultados.sort((x, y) => x.preco - y.preco);
        } catch (e) {
            return [];
        }
    }
}

module.exports = new EnjoeiSniper();
