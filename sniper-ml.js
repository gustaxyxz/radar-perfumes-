// ========================================================
// SNIPER MERCADO LIVRE - MONITOR EM TEMPO REAL DE PERFUMES
// Usa a API oficial pública do Mercado Livre (sem autenticação)
// Varre anúncios por categoria de perfumes a cada 40 segundos
// ========================================================

const config = require('./config');
const telegram = require('./telegram');
const security = require('./security');

// ID de categoria de perfumes no Mercado Livre Brasil: MLB1316
const CATEGORIA_PERFUMES = 'MLB1316';

const TERMOS_ML = [
    'perfume desapego',
    'sauvage',
    'bleu de chanel',
    'invictus',
    '212 vip',
    'parfums de marly layton',
    'good girl carolina herrera',
    'one million',
    'acqua di gio profondo',
    'armani code',
    'creed aventus',
    'baccarat rouge 540',
    'le male elixir',
    'hacivat nishane',
    'xerjoff naxos',
    'decant perfume nicho'
];

const idsJaVistos = new Set();
let indiceTermo = 0;

class MercadoLivreSniper {
    constructor() {
        this.ativo = false;
        this.intervalId = null;
        this.totalDetectados = 0;
    }

    async buscarRecentes(termo) {
        try {
            const termoCod = encodeURIComponent(termo);
            let url = `https://api.mercadolibre.com/sites/MLB/search?q=${termoCod}&category=${CATEGORIA_PERFUMES}&sort=date_desc&limit=20&offset=0`;

            const headers = {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (compatible; RadarPerfumes/1.0)'
            };

            // Se tiver token de desenvolvedor do Mercado Livre, autentica oficialmente
            if (config.ML_ACCESS_TOKEN) {
                headers['Authorization'] = `Bearer ${config.ML_ACCESS_TOKEN}`;
            } else if (config.SCRAPER_API_URL) {
                // Se tiver Scraper Gateway configurado
                url = `${config.SCRAPER_API_URL}${encodeURIComponent(url)}`;
            }

            const resp = await fetch(url, {
                headers: headers,
                signal: AbortSignal.timeout(10000)
            });

            if (!resp.ok) return [];
            const dados = await resp.json();
            return dados?.results || [];
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
            'STRONGER WITH YOU', 'LUNA ROSSA', 'PHANTOM', 'ULTRA MALE',
            'PEGASUS', 'HEROD', 'PERCIVAL', 'CARLISLE'
        ];
        for (const p of lista) {
            if (t.includes(p)) return p;
        }
        return null;
    }

    calcularDesconto(preco, precoOriginal) {
        if (!preco || !precoOriginal || precoOriginal <= preco) return null;
        return Math.round(((precoOriginal - preco) / precoOriginal) * 100);
    }

    async processarAnuncio(item) {
        const id = item.id;
        if (!id || idsJaVistos.has(String(id))) return;
        idsJaVistos.add(String(id));

        if (idsJaVistos.size > 5000) {
            const arr = [...idsJaVistos];
            arr.slice(0, 2000).forEach(i => idsJaVistos.delete(i));
        }

        const titulo = item.title || '';
        const preco = item.price;
        const precoOriginal = item.original_price;
        const url = item.permalink;
        const imagem = item.thumbnail;
        const vendedor = item.seller?.nickname || 'Vendedor';
        const condicao = item.condition === 'used' ? '🔄 Usado' : '✨ Novo';
        const qtdVendidos = item.sold_quantity;

        // Filtra condição nova com quantidade vendida alta (provavelmente loja, não desapego)
        if (item.condition === 'new' && qtdVendidos > 10) return;

        const preco_fmt = preco ? `R$ ${preco.toFixed(2)}` : 'A negociar';
        const perfume = this.extrairPerfume(titulo);
        const desconto = this.calcularDesconto(preco, precoOriginal);
        const descontoTxt = desconto ? ` 🔥 (-${desconto}% do original)` : '';

        const dadosSecurity = {
            autorTelefone: '',
            texto: titulo,
            tipo: 'VENDA',
            perfume: perfume,
            preco: preco,
            volume: null,
            grupoNome: 'Mercado Livre',
        };

        const auditoria = security.analisarSeguranca(dadosSecurity, null);
        const alertas = auditoria.alertas.filter(a => a.startsWith('🚨')).join('\n');

        const textoMsg = `🟡 <b>[MERCADO LIVRE SNIPER] DESAPEGO DETECTADO!</b>

📦 <b>${titulo}</b>
💰 <b>Preço:</b> ${preco_fmt}${descontoTxt}
🏷️ <b>Condição:</b> ${condicao}
👤 <b>Vendedor:</b> ${vendedor}
🛡️ <b>Auditoria:</b> ${auditoria.selo}${alertas ? `\n${alertas}` : ''}

🔗 <a href="${url}">Ver no Mercado Livre</a>`;

        const botoes = {
            inline_keyboard: [[
                { text: '🟡 Abrir no ML', url: url }
            ]]
        };

        const chatIdDestino = config.TELEGRAM_ADMIN_CHAT_ID || config.TELEGRAM_PARCEIRO_CHAT_ID;
        const imagemHd = imagem ? imagem.replace('-I.jpg', '-O.jpg').replace('-V.jpg', '-O.jpg') : null;
        if (imagemHd) {
            await telegram.enviarFoto(chatIdDestino, imagemHd, 'image/jpeg', textoMsg, botoes);
        } else {
            await telegram.enviarMensagem(chatIdDestino, textoMsg, 'HTML', botoes);
        }

        this.totalDetectados++;
        console.log(`🟡 [ML] Novo: ${titulo} - ${preco_fmt}`);
    }

    async executarCiclo() {
        const termo = TERMOS_ML[indiceTermo % TERMOS_ML.length];
        indiceTermo++;

        const anuncios = await this.buscarRecentes(termo);
        for (const a of anuncios) {
            await this.processarAnuncio(a);
        }
    }

    iniciar(intervaloSegundos = 40) {
        if (this.ativo) return;
        this.ativo = true;
        console.log(`🟡 [ML SNIPER] Ativado! ${TERMOS_ML.length} termos a cada ${intervaloSegundos}s`);

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
        console.log(`🟡 [ML SNIPER] Parado. Total: ${this.totalDetectados}`);
    async buscarParaCotacao(termo) {
        try {
            const results = await this.buscarRecentes(termo);
            const resultados = [];
            for (const r of results) {
                const titulo = r.title || '';
                const preco = r.price || 0;
                const url = r.permalink || '';
                if (preco && preco >= 30) {
                    resultados.push({
                        plataforma: 'Mercado Livre',
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

module.exports = new MercadoLivreSniper();
