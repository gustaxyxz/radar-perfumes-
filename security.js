// ========================================================
// MÓDULO DE SEGURANÇA E AUDITORIA ANTI-GOLPE
// ========================================================

class SecurityService {
    /**
     * Realiza uma auditoria completa de risco do anúncio
     * @param {Object} item - Dados do anúncio extraídos
     * @param {Object} media - Mídia baixada (se houver)
     * @returns {Object} Relatório de segurança e recomendações
     */
    analisarSeguranca(item, media = null) {
        const alertas = [];
        const pontosPositivos = [];
        let scoreConfianca = 50; // Base neutra de 0 a 100

        const tel = String(item.autorTelefone || '').replace(/\D/g, '');
        const texto = (item.texto || '').toLowerCase();

        // 1. CHECAGEM DE NÚMERO / DDI
        const eNumeroBR = tel.startsWith('55') && (tel.length === 12 || tel.length === 13);
        if (!eNumeroBR) {
            alertas.push('🚨 DDI Estrangeiro ou formato atípico (+ ' + (tel.slice(0, 3) || '??') + ') - Risco altíssimo de clone/fake');
            scoreConfianca -= 40;
        } else {
            const ddd = parseInt(tel.slice(2, 4), 10);
            if (ddd >= 11 && ddd <= 99) {
                pontosPositivos.push(`📞 WhatsApp verificado com DDD ${ddd} (Brasil)`);
                scoreConfianca += 10;
            } else {
                alertas.push('⚠️ DDD fora do padrão brasileiro');
                scoreConfianca -= 15;
            }
        }

        // 2. PROCEDÊNCIA E BATCH CODE (LOTE)
        const temBatchCode = /\b(batch|batchcode|lote|codigo do lote|código)\b/i.test(texto);
        const temAdipec = /\b(adipec|selo adipec)\b/i.test(texto);
        const temNotaFiscal = /\b(nota fiscal|nf|danfe|comprovante|sephora|epoca cosm[eé]ticos|beleza na web)\b/i.test(texto);
        const temCaixa = /\b(com caixa|na caixa|lata original|completo)\b/i.test(texto);
        const semCaixa = /\b(sem caixa|sem tampa|tester sem tampa)\b/i.test(texto);

        if (temBatchCode) {
            pontosPositivos.push('🏷️ Batch code / lote citado na descrição');
            scoreConfianca += 15;
        }
        if (temAdipec) {
            pontosPositivos.push('🇧🇷 Selo ADIPEC de importação oficial citado');
            scoreConfianca += 20;
        }
        if (temNotaFiscal) {
            pontosPositivos.push('🧾 Nota fiscal ou compra em loja oficial citada');
            scoreConfianca += 15;
        }
        if (temCaixa) {
            pontosPositivos.push('📦 Acompanha caixa/lata original');
            scoreConfianca += 5;
        }
        if (semCaixa) {
            alertas.push('📦 Anunciado sem caixa ou sem tampa (Atenção redobrada)');
            scoreConfianca -= 5;
        }

        // 3. ANÁLISE DE FOTO / IMAGEM (ILUSTRATIVA VS REAL)
        const declarouIlustrativa = /\b(foto ilustrativa|fotos ilustrativas|imagem ilustrativa|foto do google|imagem do google|foto de catalogo|foto de catálogo)\b/i.test(texto);
        const prometeuFotosPrivado = /\b(fotos no pv|mando foto no pv|fotos reais no pv|fotos pelo pv|chama no pv para fotos)\b/i.test(texto);

        let tipoFoto = 'SEM_FOTO';
        if (media && media.data) {
            tipoFoto = 'FOTO_ANEXADA';
        }

        if (declarouIlustrativa) {
            tipoFoto = 'ILUSTRATIVA_DECLARADA';
            alertas.push('ℹ️ Foto informada como ilustrativa pelo vendedor');
            scoreConfianca -= 10;
        }

        if (prometeuFotosPrivado) {
            pontosPositivos.push('💬 Vendedor se dispôs a enviar fotos reais/batch no privado');
            scoreConfianca += 5;
        }

        if (tipoFoto === 'SEM_FOTO' && item.tipo === 'VENDA') {
            alertas.push('⚠️ Anúncio sem foto anexada no grupo');
            scoreConfianca -= 10;
        }

        // 4. ANÁLISE DE PREÇO VS ANOMALIA
        if (item.preco && item.preco > 0) {
            // Exemplo: Nicho caro anunciado por menos de R$ 200 é suspeito de réplica
            const perfumesCaros = ['AVENTUS', 'LAYTON', 'HEROD', 'NAXOS', 'ERBA PURA', 'HACIVAT', 'BACCARAT', 'BR540', 'ROJA'];
            const eCaro = perfumesCaros.some(p => (item.perfume || '').includes(p));

            if (eCaro && item.preco < 200 && (!item.volume || item.volume > 20)) {
                alertas.push('🚨 PREÇO MUITO BAIXO PARA NICHO: R$ ' + item.preco + ' (Alta probabilidade de réplica/fake ou golpe)');
                scoreConfianca -= 35;
            }
        }

        // 5. DETERMINAÇÃO FINAL DE NÍVEL
        scoreConfianca = Math.max(5, Math.min(100, scoreConfianca));

        let nivelRisco = 'MEDIO';
        let selo = '🟡 ATENÇÃO';
        if (scoreConfianca >= 70 && alertas.length === 0) {
            nivelRisco = 'BAIXO';
            selo = '🟢 VENDEDOR CONFIÁVEL';
        } else if (scoreConfianca < 40 || alertas.some(a => a.startsWith('🚨'))) {
            nivelRisco = 'ALTO';
            selo = '🔴 ALTO RISCO / SUSPEITO';
        }

        // 6. CHECKLIST DE NEGOCIAÇÃO RECOMENDADO
        const checklist = [
            '1. Exija foto do lote (batch code) gravado no vidro.',
            '2. Peça vídeo borrifando + papel com nome do vendedor e data ao lado.',
            '3. Confira se o nome no PIX bate com o nome do titular do WhatsApp.'
        ];

        return {
            score: scoreConfianca,
            nivel: nivelRisco,
            selo: selo,
            tipoFoto: tipoFoto,
            alertas: alertas,
            pontosPositivos: pontosPositivos,
            checklist: checklist
        };
    }

    /**
     * Verifica se um número de telefone ou texto provém de contato bloqueado
     * @param {string} telefone - Telefone, JID ou autor da mensagem
     * @param {string} texto - Texto ou corpo da mensagem (opcional)
     * @returns {boolean} True se for contato proibido
     */
    ehNumeroBloqueado(telefone, texto = '') {
        // Alvo proibido: +55 11 98026-6593
        const sufixosProibidos = ['980266593', '80266593'];

        // 1. Checa número de telefone / JID se existir
        if (telefone) {
            const telStr = String(telefone).replace(/\D/g, '');
            // Só valida se tiver pelo menos 8 dígitos para evitar falsos positivos com strings vazias/curtas
            if (telStr.length >= 8) {
                for (const sufixo of sufixosProibidos) {
                    if (telStr.includes(sufixo)) return true;
                }

                try {
                    const config = require('./config');
                    if (Array.isArray(config.NUMEROS_BLOQUEADOS)) {
                        for (const num of config.NUMEROS_BLOQUEADOS) {
                            const numLimpo = String(num).replace(/\D/g, '');
                            if (numLimpo && numLimpo.length >= 8 && telStr.includes(numLimpo)) {
                                return true;
                            }
                        }
                    }
                } catch (e) {}
            }
        }

        // 2. Checa se o texto menciona explicitamente o contato proibido (11 98026-6593)
        if (texto && typeof texto === 'string') {
            const regexBloqueado = /(?:11\s*)?9?8026[-.\s]*6593/i;
            if (regexBloqueado.test(texto)) {
                return true;
            }

            // 3. BLOQUEIO DE GOLPES FINANCEIROS, ESQUEMAS DE PIX, CONTAS PJ E SPAM
            const padroesGolpeFinanceiro = [
                /\bsicoob\b/i,
                /\blimite\s+pix\b/i,
                /\bfavorecidos\b/i,
                /\bencho\s+o\s+limite\b/i,
                /\bconta\s+pj\b/i,
                /\bbanco\s+inter\s+pj\b/i,
                /\besquema\s+pix\b/i,
                /\btrampo\s+pix\b/i,
                /\bnota\s+fake\b/i,
                /\bc[eé]dula(?:s)?\s+fake\b/i,
                /\bcart[aã]o\s+clonado\b/i,
                /\bcc\s+virada\b/i,
                /\bvirada\s+de\s+saldo\b/i,
                /\bgift\s*cards?\b/i
            ];

            for (const p of padroesGolpeFinanceiro) {
                if (p.test(texto)) {
                    console.log(`🚫 [GOLPE FINANCEIRO BLOQUEADO] Detectado termo suspeito: ${p}`);
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Normaliza e formata telefone para link direto do WhatsApp (wa.me) e exibição amigável
     * Trata contas antigas sem 9º dígito, DDI 55, sufixos de dispositivo (:12), LID do WhatsApp e validação real
     */
    formatarTelefoneWhatsapp(telefoneBruto, autorRaw = '') {
        let digitos = String(telefoneBruto || '').replace(/\D/g, '');

        if (!digitos && autorRaw) {
            digitos = String(autorRaw).split('@')[0].replace(/\D/g, '');
        }

        // Se for identificado como LID (Linked Device / WhatsApp Privacy ID, ex: 82283520335922)
        const ehLidRaw = (autorRaw && String(autorRaw).includes('@lid')) ||
                         (digitos.length >= 14 && !digitos.startsWith('55'));

        // Se for ID longo que contém número brasileiro dentro (ex: 556692505918...)
        if (digitos.length > 15) {
            const match55 = digitos.match(/55\d{10,11}/);
            if (match55) {
                digitos = match55[0];
            }
        }

        if (!digitos || digitos.length < 8) {
            return {
                valido: false,
                ehLid: false,
                numeroLimpo: '',
                formatado: 'Não identificado',
                linkWpp: ''
            };
        }

        // Se for LID puro não desmascarado
        if (ehLidRaw && !digitos.startsWith('55')) {
            return {
                valido: false,
                ehLid: true,
                numeroLimpo: digitos,
                formatado: `🆔 WhatsApp LID: ${digitos} (Privacidade ativada)`,
                linkWpp: '' // Não gera link fake quebrado com DDI internacional
            };
        }

        // Se não tiver o DDI 55 (Brasil) e tiver 10 ou 11 dígitos, adiciona 55
        if ((digitos.length === 10 || digitos.length === 11) && !digitos.startsWith('55')) {
            digitos = '55' + digitos;
        }

        // Se for número BR de 12 dígitos começando com 55 (55 + DDD + 8 dígitos)
        // No Brasil celulares têm 9 dígitos. Muitas contas do WhatsApp guardam sem o 9 no JID antigo.
        let digitosComNove = digitos;
        if (digitos.length === 12 && digitos.startsWith('55')) {
            const ddd = parseInt(digitos.slice(2, 4), 10);
            const primeiroDigito = digitos[4];
            if (ddd >= 11 && ddd <= 99) {
                digitosComNove = digitos.slice(0, 4) + '9' + digitos.slice(4);
            }
        }

        // Formatação visual amigável: +55 (66) 99250-5918
        let formatado = '+' + digitosComNove;
        if (digitosComNove.startsWith('55') && digitosComNove.length === 13) {
            formatado = `+55 (${digitosComNove.slice(2, 4)}) ${digitosComNove.slice(4, 9)}-${digitosComNove.slice(9)}`;
        } else if (digitosComNove.startsWith('55') && digitosComNove.length === 12) {
            formatado = `+55 (${digitosComNove.slice(2, 4)}) ${digitosComNove.slice(4, 8)}-${digitosComNove.slice(8)}`;
        }

        // Link oficial wa.me usando o número com 9 dígitos (padrão internacional)
        const linkWpp = `https://wa.me/${digitosComNove}`;

        return {
            valido: true,
            ehLid: false,
            numeroLimpo: digitosComNove,
            numeroOriginal: digitos,
            formatado,
            linkWpp
        };
    }
}

module.exports = new SecurityService();
