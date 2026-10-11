// ========================================================
// SINCRONIZAÇÃO DE HISTÓRICO E INDEXAÇÃO DE MEMBROS
// ========================================================

const database = require('./database');
const matcher = require('./matcher');
const telegram = require('./telegram');
const config = require('./config');
const security = require('./security');

async function sincronizarHistoricoGrupos(client, chatsAlvo) {
    console.log('\n🔄 [HISTÓRICO] Iniciando varredura retroativa e mapeamento de membros...');

    let totalOfertasIndexadas = 0;
    let totalDemandasIndexadas = 0;
    let totalMatchesEncontrados = 0;

    for (const chat of chatsAlvo) {
        try {
            console.log(`📡 Indexando grupo: "${chat.name}"...`);

            // 1. Mapear membros do grupo para o sistema de segurança
            if (chat.participants && Array.isArray(chat.participants)) {
                database.registrarGrupo(chat.id._serialized, chat.name, chat.participants);
                console.log(`   👥 ${chat.participants.length} membros mapeados neste grupo.`);
            }

            if (!config.SINCRONIZAR_HISTORICO_AO_INICIAR) {
                continue;
            }

            // 2. Buscar mensagens recentes
            const limite = config.LIMITE_MENSAGENS_HISTORICO || 100;
            const mensagens = await chat.fetchMessages({ limit: limite });
            console.log(`   📩 ${mensagens.length} mensagens antigas recuperadas.`);

            const limiteDias = 15;
            const timestampMinimo = Math.floor(Date.now() / 1000) - (limiteDias * 24 * 60 * 60);

            for (const msg of mensagens) {
                // Mensagens com mais de 15 dias são ignoradas
                if (msg.timestamp && msg.timestamp < timestampMinimo) {
                    continue;
                }

                const texto = msg.body?.trim();
                if (!texto || texto.length < 5) continue;

                const rawAuthor = msg.author || msg._data?.participant || '';
                const autorTelefone = rawAuthor ? rawAuthor.split('@')[0] : '';
                const autorNome = msg._data?.notifyName || autorTelefone || 'Participante';

                // BLOQUEIO RIGOROSO DE CONTATOS PROIBIDOS (+55 11 98026-6593 etc)
                if (security.ehNumeroBloqueado(autorTelefone, texto) ||
                    (rawAuthor && security.ehNumeroBloqueado(rawAuthor, texto))) {
                    continue;
                }

                const classificacao = matcher.analisarMensagem(texto);
                if (classificacao.tipo === 'NEUTRO') continue;

                const dadosExtraidos = matcher.extrairDados(texto);

                // Extrai mídia / foto da mensagem do histórico se houver
                let mediaFoto = null;
                if (msg.hasMedia || msg.type === 'image' || (msg._data && (msg._data.mimetype || '').startsWith('image/'))) {
                    try {
                        if (msg.id && !msg.id._serialized) {
                            if (msg.id.$1) {
                                msg.id._serialized = msg.id.$1;
                            } else if (msg.id.fromMe !== undefined && msg.id.remote && msg.id.id) {
                                msg.id._serialized = `${msg.id.fromMe}_${msg.id.remote}_${msg.id.id}`;
                            }
                        }
                        msg.hasMedia = true;
                        mediaFoto = await msg.downloadMedia();
                    } catch (e) {}

                    if (!mediaFoto && msg._data?.body && typeof msg._data.body === 'string' && msg._data.body.startsWith('data:image/') && msg._data.body.includes(';base64,')) {
                        const parts = msg._data.body.split(';base64,');
                        const mime = parts[0].replace('data:', '') || 'image/jpeg';
                        mediaFoto = { mimetype: mime, data: parts[1], filename: 'foto_whatsapp.jpg' };
                    }
                }

                const item = {
                    msgId: msg.id?._serialized || `${chat.id._serialized}_${msg.timestamp}`,
                    autor: autorNome,
                    autorTelefone: autorTelefone,
                    grupoId: chat.id._serialized,
                    grupoNome: chat.name,
                    texto: texto,
                    tipo: classificacao.tipo,
                    perfume: dadosExtraidos.perfume,
                    preco: dadosExtraidos.preco,
                    volume: dadosExtraidos.volume,
                    custoPorMl: dadosExtraidos.custoPorMl,
                    oportunidadeDecant: dadosExtraidos.oportunidadeDecant,
                    timestamp: msg.timestamp,
                    temFoto: !!mediaFoto,
                    fotos: mediaFoto ? [mediaFoto] : []
                };

                if (classificacao.tipo === 'VENDA') {
                    const itemSalvo = database.adicionarOferta(item);
                    totalOfertasIndexadas++;

                    // Notifica no Telegram as ofertas mais recentes (últimas 24h) com perfume e preço identificados
                    const umDiaAtras = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
                    if (msg.timestamp && msg.timestamp >= umDiaAtras && itemSalvo && itemSalvo.perfume && itemSalvo.preco) {
                        try {
                            await telegram.notificarAnuncioParceiro(itemSalvo, mediaFoto);
                        } catch (e) {}
                    }
                } else if (classificacao.tipo === 'COMPRA') {
                    database.adicionarDemanda(item);
                    totalDemandasIndexadas++;
                }

                // Cruzamento de oportunidades retroativas
                const matches = matcher.processarCruzamento(item, classificacao.tipo);
                if (matches && matches.length > 0) {
                    for (const m of matches) {
                        totalMatchesEncontrados++;
                        // Notifica matches seguros encontrados no histórico
                        if (m.seguranca.seguro) {
                            await telegram.notificarMatchArbitragem(m);
                        }
                    }
                }
            }
        } catch (erro) {
            console.error(`⚠️ Falha ao sincronizar grupo "${chat.name}":`, erro.message);
        }
    }

    console.log(`\n✅ [HISTÓRICO CONCLUÍDO]`);
    console.log(`   📦 Ofertas catalogadas: ${totalOfertasIndexadas}`);
    console.log(`   🔍 Demandas em aberto catalogadas: ${totalDemandasIndexadas}`);
    console.log(`   🎯 Oportunidades retroativas encontradas: ${totalMatchesEncontrados}\n`);

    // Envia relatório de sincronização para o Telegram
    try {
        const chatIdDestino = config.TELEGRAM_PARCEIRO_CHAT_ID;
        await telegram.enviarMensagem(
            chatIdDestino,
            `📊 <b>VARREDURA DE GRUPOS CONCLUÍDA!</b>\n\n` +
            `• 📦 Ofertas ativas catalogadas: <b>${totalOfertasIndexadas}</b>\n` +
            `• 🔍 Compradores procurando: <b>${totalDemandasIndexadas}</b>\n` +
            `• 🎯 Oportunidades de lucro/spread: <b>${totalMatchesEncontrados}</b>\n\n` +
            `<i>Radar operando em tempo real 24/7 na Azure. Novas mensagens serão notificadas instantaneamente!</i>`,
            'HTML'
        );
    } catch (e) {}

    if (totalOfertasIndexadas > 0 || totalDemandasIndexadas > 0) {
        const resumo = `📊 <b>RADAR SINCRONIZADO COM SUCESSO!</b>
Histórico retroativo dos últimos dias analisado:
• <b>${totalOfertasIndexadas}</b> anúncios de venda catalogados
• <b>${totalDemandasIndexadas}</b> pedidos de compra em aberto
• <b>${totalMatchesEncontrados}</b> cruzamentos potenciais identificados.

<i>O bot agora está monitorando em tempo real com download de fotos e verificação de grupos!</i>`;

        await telegram.enviarMensagem(config.TELEGRAM_PARCEIRO_CHAT_ID, resumo);
    }
}

module.exports = {
    sincronizarHistoricoGrupos
};
