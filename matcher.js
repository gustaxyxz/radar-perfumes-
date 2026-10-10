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

class Matcher {
    // ----------------------------------------------------
    // CLASSIFICAÇÃO DA MENSAGEM
    // ----------------------------------------------------
    analisarMensagem(texto) {
        if (!texto || typeof texto !== 'string') {
            return { tipo: 'NEUTRO', confianca: 0 };
        }

        const t = texto.toLowerCase();

        // Padrões de procura / compra
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
            /\binteresse\s+em\b/
        ];

        // Padrões de venda / desapego
        const padroesVenda = [
            /\bvendo\b/,
            /\bvenda\b/,
            /\bdesapego\b/,
            /\bdesapegando\b/,
            /\bpasso\b/,
            /\bpassando\b/,
            /\bdispon[ií]vel\b/,
            /\bdisp\b/,
            /\br\$\s*\d+/,
            /\b\d+\s*reais\b/,
            /\bparcial\b/,
            /\blacrado\b/,
            /\btester\b/,
            /\bfracionado\b/
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
            // Se tem "procuro" no início, prioriza compra
            if (t.includes('procuro') || t.includes('busco') || t.includes('alguém tem') || t.includes('alguem tem')) {
                return { tipo: 'COMPRA', confianca: 0.8 };
            }
            return { tipo: 'VENDA', confianca: 0.8 };
        }

        // Se tem preço no texto e alguma menção a perfume/ml, provavelmente é anúncio
        if (/\br\$\s*\d+/.test(t) || /\b\d{2,4}\s*(reais|conto)\b/.test(t)) {
            return { tipo: 'VENDA', confianca: 0.7 };
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

        return {
            perfume: perfumeEncontrado,
            preco: preco,
            volume: volume,
            custoPorMl: custoPorMl,
            oportunidadeDecant: oportunidadeDecant
        };
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
