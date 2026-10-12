// ========================================================
// MOTOR DE INTELIGÊNCIA, CLASSIFICAÇÃO E ARBITRAGEM
// ========================================================

const database = require('./database');
const config = require('./config');

// Lista com termos de marcas e perfumes frequentes
const LISTA_PERFUMES = [
    // Carolina Herrera
    '212 VIP BLACK', '212 VIP MEN', '212 VIP ROSE', '212 VIP', '212 MEN', '212 SEXY', '212 HEROES',
    'BAD BOY', 'BAD BOY COBALT', 'GOOD GIRL', 'CH MEN', 'CH PRIVE',
    // Dior
    'SAUVAGE ELIXIR', 'SAUVAGE EDP', 'SAUVAGE EDT', 'SAUVAGE PARFUM', 'SAUVAGE',
    'DIOR HOMME INTENSE', 'DIOR HOMME 2020', 'DIOR HOMME COLOGNE', 'DIOR HOMME SPORT', 'DIOR HOMME',
    'FAHRENHEIT', 'EAU SAUVAGE',
    // Chanel
    'BLEU DE CHANEL PARFUM', 'BLEU DE CHANEL EDP', 'BLEU DE CHANEL EDT', 'BLEU DE CHANEL', 'BLEU',
    'ALLURE HOMME SPORT EAU EXTREME', 'ALLURE HOMME SPORT', 'ALLURE HOMME EDITION BLANCHE', 'ALLURE HOMME',
    'PLATINUM EGOISTE', 'EGOISTE', 'COCO MADEMOISELLE',
    // Jean Paul Gaultier
    'ULTRA MALE', 'LE MALE LE PARFUM', 'LE MALE ELIXIR', 'LE MALE', 'LE BEAU LE PARFUM', 'LE BEAU PARADISE GARDEN', 'LE BEAU',
    'SCANDAL POUR HOMME', 'SCANDAL',
    // Paco Rabanne
    'INVICTUS VICTORY ELIXIR', 'INVICTUS VICTORY', 'INVICTUS PLATINUM', 'INVICTUS AQUA', 'INVICTUS',
    '1 MILLION ELIXIR', '1 MILLION PARFUM', '1 MILLION PRIVÉ', '1 MILLION LUCKY', '1 MILLION ROYAL', 'ONE MILLION',
    'PHANTOM', 'BLACK XS',
    // Giorgio Armani
    'ACQUA DI GIO PROFONDO', 'ACQUA DI GIO PARFUM', 'ACQUA DI GIO PROFUMO', 'ACQUA DI GIO EDT', 'ACQUA DI GIO',
    'ARMANI CODE PARFUM', 'ARMANI CODE PROFUMO', 'ARMANI CODE ABSOLU', 'ARMANI CODE',
    'STRONGER WITH YOU INTENSELY', 'STRONGER WITH YOU ABSOLUTELY', 'STRONGER WITH YOU',
    // Yves Saint Laurent (YSL)
    'Y EDP', 'Y LE PARFUM', 'Y EDT', 'Y ELIXIR', 'LA NUIT DE L\'HOMME', 'L\'HOMME', 'KOUROS', 'MYSLF', 'LIBRE',
    // Versace
    'VERSACE EROS FLAME', 'VERSACE EROS EDP', 'VERSACE EROS EDT', 'EROS FLAME', 'EROS',
    'VERSACE DYLAN BLUE', 'DYLAN BLUE', 'VERSACE POUR HOMME',
    // Parfums de Marly
    'LAYTON', 'LAYTON EXCLUSIF', 'HEROD', 'PERCIVAL', 'SEDLEY', 'PEGASUS', 'PEGASUS EXCLUSIF', 'CARLISLE', 'HALTANE', 'GALLOWAY', 'GREENLEY',
    // Creed
    'AVENTUS', 'AVENTUS COLOGNE', 'SILVER MOUNTAIN WATER', 'GREEN IRISH TWEED', 'MILLÉSIME IMPÉRIAL', 'VIW', 'VIRGIN ISLAND WATER', 'ORIGINAL SANTAL',
    // Xerjoff
    'NAXOS', 'ERBA PURA', 'ALEXANDRIA II', 'RENAISSANCE', 'MEFISTO', 'TORINO21', 'TORINO22', '40 KNOTS',
    // Nishane
    'HACIVAT', 'ANI', 'FAN YOUR FLAMES', 'WULONG CHA', 'HUNDRED SILENT WAYS',
    // Tom Ford
    'TOBACCO VANILLE', 'OUD WOOD', 'LOST CHERRY', 'TUSCAN LEATHER', 'GREY VETIVER', 'OMBRE LEATHER', 'NEROLI PORTOFINO', 'NOIR EXTREME',
    // Mancera & Montale
    'CEDRAT BOISE', 'INTENSE CEDRAT BOISE', 'RED TOBACCO', 'INSTANT CRUSH', 'INTENSE CAFE', 'ARABIAN TONKA',
    // Outros Nicho / Designer Famosos
    'BACCARAT ROUGE 540', 'BR540', 'INTERLUDE', 'REFLECTION MAN', 'AMOUAGE',
    'PRADA L\'HOMME', 'PRADA L\'HOMME INTENSE', 'LUNA ROSSA BLACK', 'LUNA ROSSA CARBON', 'PRADA PARADOXE',
    'L\'HOMME IDEAL EDP', 'L\'HOMME IDEAL EXTREME', 'TERRE D\'HERMES', 'H24',
    'ROJA ELYSIUM', 'ELYSIUM'
];

// Tabela de Preço Médio de Referência (FIPE de Perfumes Importados)
// Baseada em valores praticados de desapego para frascos 100ml / nicho
const TABELA_MERCADO_REFERENCIA = {
    // Dior
    'SAUVAGE ELIXIR': { medio: 780, minimoLucro: 620, maximoRevenda: 850 },
    'SAUVAGE EDP': { medio: 480, minimoLucro: 390, maximoRevenda: 550 },
    'SAUVAGE EDT': { medio: 420, minimoLucro: 340, maximoRevenda: 480 },
    'SAUVAGE PARFUM': { medio: 520, minimoLucro: 420, maximoRevenda: 590 },
    'SAUVAGE': { medio: 450, minimoLucro: 360, maximoRevenda: 520 },
    'DIOR HOMME INTENSE': { medio: 580, minimoLucro: 460, maximoRevenda: 650 },
    'DIOR HOMME 2020': { medio: 460, minimoLucro: 370, maximoRevenda: 520 },
    'DIOR HOMME COLOGNE': { medio: 450, minimoLucro: 360, maximoRevenda: 510 },
    'DIOR HOMME SPORT': { medio: 450, minimoLucro: 360, maximoRevenda: 510 },
    'FAHRENHEIT': { medio: 440, minimoLucro: 350, maximoRevenda: 500 },

    // Chanel
    'BLEU DE CHANEL PARFUM': { medio: 680, minimoLucro: 550, maximoRevenda: 760 },
    'BLEU DE CHANEL EDP': { medio: 580, minimoLucro: 460, maximoRevenda: 650 },
    'BLEU DE CHANEL EDT': { medio: 490, minimoLucro: 390, maximoRevenda: 550 },
    'BLEU DE CHANEL': { medio: 550, minimoLucro: 440, maximoRevenda: 620 },
    'ALLURE HOMME SPORT EAU EXTREME': { medio: 580, minimoLucro: 460, maximoRevenda: 650 },
    'ALLURE HOMME SPORT': { medio: 520, minimoLucro: 420, maximoRevenda: 590 },
    'PLATINUM EGOISTE': { medio: 560, minimoLucro: 450, maximoRevenda: 630 },
    'COCO MADEMOISELLE': { medio: 550, minimoLucro: 440, maximoRevenda: 630 },

    // Creed
    'AVENTUS': { medio: 1850, minimoLucro: 1450, maximoRevenda: 2100 },
    'AVENTUS COLOGNE': { medio: 1750, minimoLucro: 1380, maximoRevenda: 1980 },
    'SILVER MOUNTAIN WATER': { medio: 1550, minimoLucro: 1200, maximoRevenda: 1750 },
    'GREEN IRISH TWEED': { medio: 1500, minimoLucro: 1180, maximoRevenda: 1700 },
    'MILLÉSIME IMPÉRIAL': { medio: 1450, minimoLucro: 1150, maximoRevenda: 1650 },

    // Parfums de Marly
    'LAYTON': { medio: 1250, minimoLucro: 980, maximoRevenda: 1400 },
    'LAYTON EXCLUSIF': { medio: 1350, minimoLucro: 1050, maximoRevenda: 1500 },
    'HEROD': { medio: 1200, minimoLucro: 950, maximoRevenda: 1350 },
    'PERCIVAL': { medio: 1150, minimoLucro: 900, maximoRevenda: 1300 },
    'SEDLEY': { medio: 1150, minimoLucro: 900, maximoRevenda: 1300 },
    'PEGASUS': { medio: 1150, minimoLucro: 900, maximoRevenda: 1300 },
    'HALTANE': { medio: 1380, minimoLucro: 1100, maximoRevenda: 1550 },
    'GREENLEY': { medio: 1250, minimoLucro: 980, maximoRevenda: 1400 },
    'CARLISLE': { medio: 1350, minimoLucro: 1050, maximoRevenda: 1500 },

    // Xerjoff
    'NAXOS': { medio: 1250, minimoLucro: 980, maximoRevenda: 1400 },
    'ERBA PURA': { medio: 1200, minimoLucro: 950, maximoRevenda: 1350 },
    'TORINO21': { medio: 1150, minimoLucro: 900, maximoRevenda: 1300 },
    'TORINO22': { medio: 1180, minimoLucro: 920, maximoRevenda: 1320 },
    '40 KNOTS': { medio: 1150, minimoLucro: 900, maximoRevenda: 1300 },
    'ALEXANDRIA II': { medio: 1650, minimoLucro: 1300, maximoRevenda: 1850 },
    'RENAISSANCE': { medio: 1050, minimoLucro: 820, maximoRevenda: 1180 },

    // Nishane
    'HACIVAT': { medio: 1050, minimoLucro: 820, maximoRevenda: 1200 },
    'ANI': { medio: 980, minimoLucro: 780, maximoRevenda: 1100 },
    'WULONG CHA': { medio: 980, minimoLucro: 780, maximoRevenda: 1100 },
    'FAN YOUR FLAMES': { medio: 950, minimoLucro: 750, maximoRevenda: 1080 },

    // Jean Paul Gaultier
    'ULTRA MALE': { medio: 420, minimoLucro: 330, maximoRevenda: 480 },
    'LE MALE LE PARFUM': { medio: 440, minimoLucro: 350, maximoRevenda: 500 },
    'LE MALE ELIXIR': { medio: 480, minimoLucro: 380, maximoRevenda: 550 },
    'LE MALE': { medio: 360, minimoLucro: 280, maximoRevenda: 420 },
    'LE BEAU LE PARFUM': { medio: 460, minimoLucro: 360, maximoRevenda: 520 },
    'LE BEAU PARADISE GARDEN': { medio: 520, minimoLucro: 410, maximoRevenda: 580 },
    'LE BEAU': { medio: 400, minimoLucro: 320, maximoRevenda: 460 },
    'SCANDAL POUR HOMME': { medio: 390, minimoLucro: 310, maximoRevenda: 450 },

    // Carolina Herrera
    '212 VIP BLACK': { medio: 340, minimoLucro: 270, maximoRevenda: 390 },
    '212 VIP MEN': { medio: 310, minimoLucro: 240, maximoRevenda: 360 },
    '212 VIP ROSE': { medio: 330, minimoLucro: 260, maximoRevenda: 380 },
    '212 MEN': { medio: 320, minimoLucro: 250, maximoRevenda: 370 },
    'BAD BOY': { medio: 360, minimoLucro: 280, maximoRevenda: 420 },
    'BAD BOY COBALT': { medio: 390, minimoLucro: 310, maximoRevenda: 450 },
    'GOOD GIRL': { medio: 380, minimoLucro: 300, maximoRevenda: 440 },

    // Paco Rabanne
    'INVICTUS VICTORY ELIXIR': { medio: 420, minimoLucro: 330, maximoRevenda: 480 },
    'INVICTUS VICTORY': { medio: 390, minimoLucro: 310, maximoRevenda: 450 },
    'INVICTUS PLATINUM': { medio: 380, minimoLucro: 300, maximoRevenda: 440 },
    'INVICTUS': { medio: 350, minimoLucro: 280, maximoRevenda: 410 },
    '1 MILLION ELIXIR': { medio: 420, minimoLucro: 330, maximoRevenda: 480 },
    '1 MILLION ROYAL': { medio: 430, minimoLucro: 340, maximoRevenda: 490 },
    '1 MILLION PARFUM': { medio: 390, minimoLucro: 310, maximoRevenda: 450 },
    'ONE MILLION': { medio: 340, minimoLucro: 270, maximoRevenda: 390 },
    'PHANTOM': { medio: 370, minimoLucro: 290, maximoRevenda: 430 },

    // Giorgio Armani
    'ACQUA DI GIO PROFONDO': { medio: 460, minimoLucro: 360, maximoRevenda: 520 },
    'ACQUA DI GIO PARFUM': { medio: 490, minimoLucro: 390, maximoRevenda: 550 },
    'ACQUA DI GIO PROFUMO': { medio: 620, minimoLucro: 490, maximoRevenda: 720 },
    'ACQUA DI GIO': { medio: 390, minimoLucro: 310, maximoRevenda: 450 },
    'ARMANI CODE PARFUM': { medio: 480, minimoLucro: 380, maximoRevenda: 550 },
    'STRONGER WITH YOU INTENSELY': { medio: 480, minimoLucro: 380, maximoRevenda: 550 },
    'STRONGER WITH YOU ABSOLUTELY': { medio: 480, minimoLucro: 380, maximoRevenda: 550 },

    // YSL
    'Y EDP': { medio: 480, minimoLucro: 380, maximoRevenda: 550 },
    'Y LE PARFUM': { medio: 530, minimoLucro: 420, maximoRevenda: 600 },
    'MYSLF': { medio: 460, minimoLucro: 360, maximoRevenda: 520 },
    'LA NUIT DE L\'HOMME': { medio: 430, minimoLucro: 340, maximoRevenda: 490 },
    'LIBRE': { medio: 480, minimoLucro: 380, maximoRevenda: 550 },

    // Versace
    'VERSACE EROS FLAME': { medio: 360, minimoLucro: 280, maximoRevenda: 420 },
    'VERSACE EROS EDP': { medio: 350, minimoLucro: 280, maximoRevenda: 410 },
    'VERSACE EROS EDT': { medio: 320, minimoLucro: 250, maximoRevenda: 380 },
    'VERSACE DYLAN BLUE': { medio: 330, minimoLucro: 260, maximoRevenda: 390 },
    'VERSACE POUR HOMME': { medio: 310, minimoLucro: 240, maximoRevenda: 360 },

    // Tom Ford
    'TOBACCO VANILLE': { medio: 1400, minimoLucro: 1100, maximoRevenda: 1600 },
    'OUD WOOD': { medio: 1300, minimoLucro: 1020, maximoRevenda: 1500 },
    'OMBRE LEATHER': { medio: 750, minimoLucro: 590, maximoRevenda: 860 },
    'LOST CHERRY': { medio: 1500, minimoLucro: 1180, maximoRevenda: 1750 },
    'NOIR EXTREME': { medio: 720, minimoLucro: 570, maximoRevenda: 830 },

    // Mancera & Montale
    'CEDRAT BOISE': { medio: 550, minimoLucro: 430, maximoRevenda: 630 },
    'INTENSE CEDRAT BOISE': { medio: 620, minimoLucro: 490, maximoRevenda: 710 },
    'RED TOBACCO': { medio: 580, minimoLucro: 460, maximoRevenda: 660 },
    'INSTANT CRUSH': { medio: 550, minimoLucro: 430, maximoRevenda: 630 },
    'ARABIAN TONKA': { medio: 600, minimoLucro: 470, maximoRevenda: 690 },

    // Prada & Outros
    'PRADA L\'HOMME': { medio: 460, minimoLucro: 360, maximoRevenda: 530 },
    'PRADA L\'HOMME INTENSE': { medio: 550, minimoLucro: 440, maximoRevenda: 640 },
    'LUNA ROSSA BLACK': { medio: 480, minimoLucro: 380, maximoRevenda: 550 },
    'LUNA ROSSA CARBON': { medio: 440, minimoLucro: 350, maximoRevenda: 500 },
    'TERRE D\'HERMES': { medio: 450, minimoLucro: 360, maximoRevenda: 520 },
    'BACCARAT ROUGE 540': { medio: 1950, minimoLucro: 1500, maximoRevenda: 2300 },
    'BR540': { medio: 1950, minimoLucro: 1500, maximoRevenda: 2300 }
};

class Matcher {
    // ----------------------------------------------------
    // CLASSIFICAÇÃO DA MENSAGEM
    // ----------------------------------------------------
    analisarMensagem(texto) {
        if (!texto || typeof texto !== 'string') {
            return { tipo: 'NEUTRO', confianca: 0 };
        }

        const t = texto.toLowerCase();

        // Mensagens de bate-papo que nunca são anúncios
        const ehBatepapo = [
            /^(oi|olá|olá!|e aí|boa|bom dia|boa tarde|boa noite|obrigad|valeu|vlw|ok|sim|não|ta|tá|tmb|tb|haha|rsrs|kk|kkk|k+|pós|bora|vai|vem|vai|só|bah|nossa|caramba|uau|top|exato|certeza|perfeito|amei|adorei|me manda|me passa|chama|entendi)$/i,
            /^(faz sentido|concordo|verdade|não sabia|boa pergunta|boa dica|boa informação)$/i
        ];
        if (ehBatepapo.some(r => r.test(t.trim()))) {
            return { tipo: 'NEUTRO', confianca: 0 };
        }

        // Padrões de procura / compra — com palavra-limite para evitar falsos positivos
        const padroesCompra = [
            /\bprocuro\b/,
            /\bbusco\b/,
            /\bcompro\b/,
            /\bcomprando\b/,
            /\balgu[eé]m\s+tem\b/,
            /\balgu[eé]m\s+vendendo\b/,
            /\balgu[eé]m\s+passando\b/,
            /\balgu[eé]m\s+com\b/,
            /\bquem\s+tem\b/,
            /\bquem\s+tiver\b/,
            /\bquero\s+comprar\b/,
            /\b[aà]\s+procura\b/,
            /\binteresse\s+em\b/,
            /\btem\s+pra\s+vender\b/,
            /\btem\s+algum\b/
        ];

        // Padrões de venda / desapego — mais restritivos para evitar bate-papo comum
        const padroesVenda = [
            /\bvendo\b/,
            /\bvenda\b/,
            /\bdesapego\b/,
            /\bdesapegando\b/,
            /\bdispon[ií]vel\b/,
            /\bdisp\b/,
            /\br\$\s*\d+/,                // preço com R$
            /\b\d+\s*reais\b/,
            /\b\d+\s*conto\b/,
            /\bparcial\b/,               // "parcial" só faz sentido em desapego
            /\blacrado\b/,
            /\btester\b/,
            /\bfracionado\b/,
            // "passando" só é venda se vier junto de perfume/ml/R$
            /\bpassando\b.{0,80}(?:r\$|\d+ml|\d+\s*ml|\bdesapeg|\bperfume|\bnicho|\bdecant)/,
            /(?:r\$|\d+ml|\d+\s*ml|\bperfume|\bnicho|\bdecant).{0,80}\bpassando\b/,
            // "passo" só é venda se vier acompanhado de preço, ml ou contexto de desapego
            /\bpasso\b.{0,60}(?:r\$|\d+ml|\d+\s*ml|\bpor\s+\d|\bdesapeg)/,
            /(?:r\$|\d+ml|\bdesapeg).{0,60}\bpasso\b/
        ];

        const ehCompra = padroesCompra.some(regex => regex.test(t));
        const ehVenda = padroesVenda.some(regex => regex.test(t));

        if (ehCompra && !ehVenda) {
            return { tipo: 'COMPRA', confianca: 0.9 };
        }

        if (ehVenda && !ehCompra) {
            return { tipo: 'VENDA', confianca: 0.9 };
        }

        if (ehCompra && ehVenda) {
            // Heurística: se a mensagem começa com palavras de busca, provavelmente é COMPRA
            const inicioCompra = /^(procuro|busco|al(gu[eé]m|gém)|quem\s+tem|quero\s+comprar)/i.test(t.trim());
            if (inicioCompra) return { tipo: 'COMPRA', confianca: 0.85 };

            // Se o texto tem preço anunciado claramente, é VENDA
            if (/r\$\s*\d+/.test(t) || /\d+\s*reais/.test(t)) {
                return { tipo: 'VENDA', confianca: 0.85 };
            }

            return { tipo: 'VENDA', confianca: 0.75 };
        }

        // Se tem preço e alguma menção a perfume/ml, provavelmente é anúncio
        if (/r\$\s*\d+/.test(t) || /\b\d{2,4}\s*(reais|conto)\b/.test(t)) {
            // Só classifica se tiver algum contexto de perfumaria para não pegar qualquer mensagem com número
            const temContextoPerfume = /\b(ml|perfume|nicho|decant|frasco|desapeg|lacrado|tester|edp|edt|parfum)\b/i.test(t);
            if (temContextoPerfume) {
                return { tipo: 'VENDA', confianca: 0.7 };
            }
        }

        return { tipo: 'NEUTRO', confianca: 0 };
    }

    // ----------------------------------------------------
    // EXTRAÇÃO DE DETALHES (PERFUME, PREÇO, VOLUME)
    // ----------------------------------------------------
    extrairDados(texto) {
        if (!texto) return { perfume: null, preco: null, volume: null, oportunidadeDecant: false };

        const textoLimpo = texto.toUpperCase();
        let perfumeEncontrado = null;

        // 1. Busca perfume pela lista
        for (const item of LISTA_PERFUMES) {
            if (textoLimpo.includes(item)) {
                perfumeEncontrado = item;
                break;
            }
        }

        // Se não achou na lista direta, tenta capturar após palavras-chave
        if (!perfumeEncontrado) {
            const matchGen = texto.match(/(?:desapego|vendo|procuro|busco|alguém tem|alguem tem)\s+([A-Za-z0-9\s-]{3,30})/i);
            if (matchGen && matchGen[1]) {
                const candidato = matchGen[1].trim().split('\n')[0].replace(/(r\$|\d+ml|\d+\s*reais).*/i, '').trim();
                if (candidato.length >= 3 && !/^(um|uma|algo|alguém|quem)$/i.test(candidato)) {
                    perfumeEncontrado = candidato.toUpperCase();
                }
            }
        }

        // 2. Extrai Preço — versão robusta com múltiplos formatos brasileiros
        let preco = null;

        function extrairPrecoRobusto(txt) {
            if (!txt) return null;

            // Normaliza texto para facilitar regex
            const t = txt;

            // Helper: converte string "1.200,00" ou "1200" ou "1.200" para número
            function parseValor(raw) {
                if (!raw) return null;
                let s = raw.trim();
                // Remove ponto de milhar se houver vírgula decimal depois: "1.200,50" -> "1200.50"
                // Ou se for no formato "1.200" sem centavos (ponto como milhar)
                if (/^\d{1,3}\.\d{3}(,\d{1,2})?$/.test(s)) {
                    s = s.replace('.', '').replace(',', '.');
                } else {
                    s = s.replace(',', '.');
                }
                const n = parseFloat(s);
                return isNaN(n) ? null : n;
            }

            const padroes = [
                // R$ 1.200,00 / R$ 1200 / R$ 350 / R$ 350,00
                /(?:R\$|RS|\$)\s*(\d{1,3}(?:\.\d{3})?(?:,\d{1,2})?|\d{2,5}(?:,\d{1,2})?)/i,
                // "preço: 450" / "valor: 350" / "valor de 350"
                /(?:pre[çc]o|valor)\s*(?:de\s+)?[:\s]+(\d{1,3}(?:\.\d{3})?(?:,\d{1,2})?|\d{2,5}(?:,\d{1,2})?)/i,
                // "por 450" / "por R$ 450"
                /\bpor\s+(?:R\$\s*)?(\d{1,3}(?:\.\d{3})?(?:,\d{1,2})?|\d{2,5}(?:,\d{1,2})?)/i,
                // "pedindo 750" / "faço 650" / "passo por 450" / "apenas 380"
                /\b(?:pedindo|fa[çc]o|passo\s+por|apenas|custando|custa)\s+(?:R\$\s*)?(\d{1,3}(?:\.\d{3})?(?:,\d{1,2})?|\d{2,5}(?:,\d{1,2})?)/i,
                // "380 + frete" / "380 c/ frete" / "380 com frete" / "380 frete"
                /(\d{2,5}(?:,\d{1,2})?)\s*(?:\+|c\/|com\s+)?\s*frete/i,
                // "- 420" ou ": 450" (listas de preço)
                /(?:^|\n)\s*[-•]\s*(\d{2,5}(?:,\d{1,2})?)\s*(?:reais|conto|pilas|$)/im,
                // "350 reais" / "450 conto" / "380 pilas"
                /(\d{2,5}(?:,\d{1,2})?)\s*(?:reais|conto|pilas)/i,
                // Número no formato milhar+centavos: 1.500,00 / 1.200,00 (sem prefixo R$)
                /\b(\d{1,3}\.\d{3},\d{2})\b/,
                // Número isolado no formato "450,00" (não precedido por ponto de milhar)
                /(?<!\.\d{0,2})\b(\d{2,4},\d{2})\b/
            ];

            for (const regex of padroes) {
                const m = t.match(regex);
                if (m && m[1]) {
                    const val = parseValor(m[1]);
                    if (val !== null && val > 10 && val <= 20000) {
                        return val;
                    }
                }
            }
            return null;
        }

        preco = extrairPrecoRobusto(texto);

        // 3. Extrai Volume (ml)
        let volume = null;
        const volumeMatch = texto.match(/(\d{1,3})\s*(?:ml|\/)/i);
        if (volumeMatch && volumeMatch[1]) {
            volume = parseInt(volumeMatch[1], 10);
            if (isNaN(volume) || volume <= 0 || volume > 500) {
                volume = null;
            }
        }

        // 4. Verificação de Oportunidade de Decant (custo por ml vantajoso)
        let oportunidadeDecant = false;
        let custoPorMl = null;

        if (preco && volume && volume > 0) {
            custoPorMl = Number((preco / volume).toFixed(2));
            // Se frasco parcial ou com custo por ml muito baixo
            if (custoPorMl <= 4.0 || (perfumeEncontrado && custoPorMl <= 8.0)) {
                oportunidadeDecant = true;
            }
        }

        const analiseMercado = this.avaliarPrecoMercado(perfumeEncontrado, preco, volume);

        return {
            perfume: perfumeEncontrado,
            preco: preco,
            volume: volume,
            custoPorMl: custoPorMl,
            oportunidadeDecant: oportunidadeDecant,
            analiseMercado: analiseMercado
        };
    }

    // ----------------------------------------------------
    // ANÁLISE REAL DE MERCADO E OPORTUNIDADE COMERCIAL
    // ----------------------------------------------------
    avaliarPrecoMercado(perfume, precoAnunciado, volume = 100) {
        if (!perfume || !precoAnunciado || precoAnunciado <= 0) return null;

        const perfumeUpper = perfume.toUpperCase();
        let ref = TABELA_MERCADO_REFERENCIA[perfumeUpper];

        // Se não encontrar exato, busca por fragmento conhecido
        if (!ref) {
            for (const [nomeRef, dadosRef] of Object.entries(TABELA_MERCADO_REFERENCIA)) {
                if (perfumeUpper.includes(nomeRef) || nomeRef.includes(perfumeUpper)) {
                    ref = dadosRef;
                    break;
                }
            }
        }

        if (!ref) {
            return {
                classificacao: 'SEM_TABELA',
                selo: '⚖️ PREÇO ANUNCIADO: R$ ' + precoAnunciado.toFixed(2),
                parecer: 'Preço anunciado para avaliação direta no grupo.',
                margemEstimada: null
            };
        }

        // Fator proporcional se o volume informado for diferente de 100ml
        const fatorVol = (volume && volume > 0 && volume <= 300) ? (volume / 100) : 1;
        const precoRefMedio = Math.round(ref.medio * fatorVol);
        const precoRefMinimo = Math.round(ref.minimoLucro * fatorVol);

        const descontoPercent = Math.round(((precoRefMedio - precoAnunciado) / precoRefMedio) * 100);
        const spreadReais = Math.round(precoRefMedio - precoAnunciado);

        if (precoAnunciado <= precoRefMinimo) {
            return {
                classificacao: 'OPORTUNIDADE_DE_OURO',
                selo: '🔥 OPORTUNIDADE DE OURO',
                precoMedioMercado: precoRefMedio,
                descontoPercent,
                spreadReais,
                parecer: `💰 Preço <b>${descontoPercent}% abaixo</b> da média de desapego (~R$ ${precoRefMedio}). Potencial de lucro líquido rápido de <b>R$ ${spreadReais}+</b> na revenda!`
            };
        } else if (precoAnunciado < precoRefMedio) {
            return {
                classificacao: 'BOM_PRECO',
                selo: '💎 BOM PREÇO P/ REVENDA',
                precoMedioMercado: precoRefMedio,
                descontoPercent,
                spreadReais,
                parecer: `💵 Preço <b>${descontoPercent}% abaixo</b> da média (~R$ ${precoRefMedio}). Margem bruta de ~<b>R$ ${spreadReais}</b>.`
            };
        } else if (precoAnunciado <= Math.round(ref.maximoRevenda * fatorVol)) {
            return {
                classificacao: 'PRECO_JUSTO',
                selo: '⚖️ PREÇO DENTRO DA MÉDIA',
                precoMedioMercado: precoRefMedio,
                descontoPercent: 0,
                spreadReais: 0,
                parecer: `Alinhado ao valor médio de mercado praticado em grupos (~R$ ${precoRefMedio}).`
            };
        } else {
            return {
                classificacao: 'ACIMA_DO_MERCADO',
                selo: '⚠️ ACIMA DA MÉDIA',
                precoMedioMercado: precoRefMedio,
                descontoPercent: Math.abs(descontoPercent),
                spreadReais: spreadReais,
                parecer: `Valor acima da média de desapego (~R$ ${precoRefMedio}). Pouca margem para intermediação rápida.`
            };
        }
    }

    // ----------------------------------------------------
    // VERIFICADOR DE ARBITRAGEM E SEGURANÇA DE GRUPOS
    // ----------------------------------------------------
    processarCruzamento(itemNovo, tipo) {
        if (!itemNovo.perfume) return null;

        const matchesEncontrados = [];

        if (tipo === 'COMPRA') {
            // Alguém quer comprar! Busca ofertas no banco
            const ofertas = database.buscarOfertasParaPerfume(itemNovo.perfume, 15);

            for (const oferta of ofertas) {
                if (oferta.autorTelefone === itemNovo.autorTelefone) continue; // mesma pessoa
                if (database.jaNotificouMatch(oferta.id, itemNovo.id)) continue;

                const resultadoSeguranca = this.avaliarSegurancaGrupos(oferta.autorTelefone, itemNovo.autorTelefone);
                const spreadEstimado = this.calcularSpread(oferta.preco, itemNovo.precoEstimado);

                matchesEncontrados.push({
                    demanda: itemNovo,
                    oferta: oferta,
                    perfume: itemNovo.perfume,
                    seguranca: resultadoSeguranca,
                    spread: spreadEstimado,
                    origemGatilho: 'NOVA_DEMANDA'
                });

                database.registrarMatchNotificado(oferta.id, itemNovo.id);
            }
        } else if (tipo === 'VENDA') {
            // Alguém colocou para vender! Busca quem estava procurando no banco
            const demandas = database.buscarDemandasParaPerfume(itemNovo.perfume, 15);

            for (const demanda of demandas) {
                if (demanda.autorTelefone === itemNovo.autorTelefone) continue;
                if (database.jaNotificouMatch(itemNovo.id, demanda.id)) continue;

                const resultadoSeguranca = this.avaliarSegurancaGrupos(itemNovo.autorTelefone, demanda.autorTelefone);
                const spreadEstimado = this.calcularSpread(itemNovo.preco, demanda.precoEstimado);

                matchesEncontrados.push({
                    demanda: demanda,
                    oferta: itemNovo,
                    perfume: itemNovo.perfume,
                    seguranca: resultadoSeguranca,
                    spread: spreadEstimado,
                    origemGatilho: 'NOVA_OFERTA'
                });

                database.registrarMatchNotificado(itemNovo.id, demanda.id);
            }
        }

        return matchesEncontrados;
    }

    // ----------------------------------------------------
    // AVALIAÇÃO DE SEGURANÇA (VERIFICAÇÃO DE GRUPOS CRUZADOS)
    // ----------------------------------------------------
    avaliarSegurancaGrupos(telVendedor, telComprador) {
        const gruposEmComum = database.verificarGruposEmComum(telVendedor, telComprador);
        const gruposVendedor = database.obterGruposDoUsuario(telVendedor);
        const gruposComprador = database.obterGruposDoUsuario(telComprador);

        if (gruposEmComum.length > 0) {
            return {
                nivel: 'ALTO_RISCO',
                seguro: false,
                motivo: `⚠️ ATENÇÃO: Vendedor e Comprador estão no mesmo grupo (${gruposEmComum.join(', ')}). Risco de se conhecerem ou verem o anúncio um do outro!`,
                gruposEmComum,
                gruposVendedor,
                gruposComprador
            };
        }

        return {
            nivel: 'SEGURO',
            seguro: true,
            motivo: `🟢 ARBITRAGEM 100% SEGURA! Vendedor e Comprador NÃO dividem nenhum dos grupos monitorados. Zero risco de sobreposição!`,
            gruposEmComum: [],
            gruposVendedor,
            gruposComprador
        };
    }

    calcularSpread(precoVendaOriginal, precoCompradorTeto) {
        if (!precoVendaOriginal) return { margemSugerida: null, precoVendaSugerido: null };

        // Se o comprador estipulou teto
        if (precoCompradorTeto && precoCompradorTeto > precoVendaOriginal) {
            const lucroBruto = precoCompradorTeto - precoVendaOriginal;
            return {
                lucroEstimado: lucroBruto,
                precoCompraOrigem: precoVendaOriginal,
                precoVendaFinal: precoCompradorTeto
            };
        }

        // Sugestão padrão de margem saudável (25% a 35% + frete)
        const margem = Math.max(config.MARGEM_MINIMA_LUCRO_REAIS || 50, Math.round(precoVendaOriginal * 0.25));
        return {
            lucroEstimado: margem,
            precoCompraOrigem: precoVendaOriginal,
            precoVendaFinal: precoVendaOriginal + margem
        };
    }
}

module.exports = new Matcher();
