// ========================================================
// MÓDULO DE INTEGRAÇÃO COM TELEGRAM (TEXTO, FOTOS E ALERTAS)
// ========================================================

const config = require('./config');

class TelegramService {
    constructor() {
        this.token = config.TELEGRAM_TOKEN;
        this.parceiroChatId = config.TELEGRAM_PARCEIRO_CHAT_ID;
        this.adminChatId = config.TELEGRAM_ADMIN_CHAT_ID || null;
        this.pollingOffset = 0;
        this.pollingAtivo = false;
        this.database = null;
    }

    setDatabase(db) {
        this.database = db;
    }

    // ----------------------------------------------------
    // ENVIAR MENSAGEM DE TEXTO (COM SUPORTE A BOTÕES INLINE)
    // ----------------------------------------------------
    async enviarMensagem(chatId, texto, parseMode = 'HTML', replyMarkup = null) {
        if (!chatId) return null;

        try {
            const bodyPayload = {
                chat_id: chatId,
                text: texto,
                parse_mode: parseMode,
                disable_web_page_preview: true
            };

            if (replyMarkup) {
                bodyPayload.reply_markup = replyMarkup;
            }

            const resp = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload)
            });

            const data = await resp.json();
            if (!data.ok) {
                // Tenta fallback sem parseMode se falhou por formatação
                if (data.description?.includes('entity') || data.description?.includes('can\'t parse')) {
                    return await this.enviarMensagemSemFormatacao(chatId, texto, replyMarkup);
                }
                console.error('❌ Erro Telegram sendMessage:', data.description);
            }
            return data;
        } catch (erro) {
            console.error('❌ Falha na requisição sendMessage Telegram:', erro.message);
            return null;
        }
    }

    async enviarMensagemSemFormatacao(chatId, texto, replyMarkup = null) {
        try {
            const bodyPayload = { chat_id: chatId, text: texto };
            if (replyMarkup) bodyPayload.reply_markup = replyMarkup;

            const resp = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload)
            });
            return await resp.json();
        } catch (e) {
            return null;
        }
    }

    // ----------------------------------------------------
    // ENVIAR FOTO COM LEGENDA (URL, BASE64 OU BUFFER)
    // ----------------------------------------------------
    async enviarFoto(chatId, fotoInput, mimeType = 'image/jpeg', legenda = '', replyMarkup = null) {
        if (!chatId || !fotoInput) return null;

        let legendaTruncada = (legenda || '').trim();
        if (legendaTruncada.length > 1000) {
            legendaTruncada = legendaTruncada.substring(0, 995) + '...';
        }

        let foto = fotoInput;
        let mime = mimeType || 'image/jpeg';
        if (typeof fotoInput === 'object' && fotoInput !== null && !Buffer.isBuffer(fotoInput)) {
            if (fotoInput.data) {
                foto = fotoInput.data;
                if (fotoInput.mimetype) mime = fotoInput.mimetype;
            } else if (fotoInput.url) {
                foto = fotoInput.url;
            }
        }

        // CASO 1: URL HTTP/HTTPS (OLX, Mercado Livre, Enjoei, etc.)
        if (typeof foto === 'string' && (foto.startsWith('http://') || foto.startsWith('https://'))) {
            // Tenta 1: Enviar URL direta via JSON para a API do Telegram
            try {
                const bodyPayload = {
                    chat_id: chatId,
                    photo: foto
                };
                if (legendaTruncada) {
                    bodyPayload.caption = legendaTruncada;
                    bodyPayload.parse_mode = 'HTML';
                }
                if (replyMarkup) {
                    bodyPayload.reply_markup = replyMarkup;
                }

                const resp = await fetch(`https://api.telegram.org/bot${this.token}/sendPhoto`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyPayload)
                });
                const data = await resp.json();
                if (data.ok) return data;
                console.warn(`⚠️ Telegram recusou URL direta (${data.description}), baixando imagem localmente...`);
            } catch (errUrl) {
                console.warn('⚠️ Falha ao enviar foto por URL JSON:', errUrl.message);
            }

            // Tenta 2: Baixar a imagem pelo Node com User-Agent de navegador e enviar buffer
            try {
                const imgResp = await fetch(foto, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                        'Referer': 'https://www.olx.com.br/'
                    },
                    signal: AbortSignal.timeout(10000)
                });
                if (imgResp.ok) {
                    const arrayBuffer = await imgResp.arrayBuffer();
                    const buf = Buffer.from(arrayBuffer);
                    return await this._enviarFotoBuffer(chatId, buf, imgResp.headers.get('content-type') || mime, legendaTruncada, replyMarkup);
                }
            } catch (errDownload) {
                console.warn('⚠️ Falha ao baixar imagem localmente:', errDownload.message);
            }
        }

        // CASO 2: Base64 ou Buffer
        try {
            let buffer;
            if (Buffer.isBuffer(foto)) {
                buffer = foto;
            } else if (typeof foto === 'string') {
                buffer = Buffer.from(foto, 'base64');
            }

            if (buffer && buffer.length > 0) {
                return await this._enviarFotoBuffer(chatId, buffer, mime, legendaTruncada, replyMarkup);
            }
        } catch (erroBuf) {
            console.error('❌ Erro ao converter buffer de foto:', erroBuf.message);
        }

        // FALLBACK SEGURO: se a foto falhou, envia o anúncio como texto para não perder a oportunidade
        if (legenda) {
            console.warn('⚠️ Enviando como mensagem de texto devido a erro no anexo da foto.');
            return await this.enviarMensagem(chatId, legenda, 'HTML', replyMarkup);
        }
        return null;
    }

    async _enviarFotoBuffer(chatId, buffer, mimeType, legenda, replyMarkup) {
        const formData = new FormData();
        formData.append('chat_id', chatId);
        const mime = mimeType || 'image/jpeg';
        const ext = mime.includes('png') ? 'png' : 'jpg';
        const blob = new Blob([buffer], { type: mime });
        formData.append('photo', blob, `foto.${ext}`);

        if (legenda) {
            formData.append('caption', legenda);
            formData.append('parse_mode', 'HTML');
        }
        if (replyMarkup) {
            formData.append('reply_markup', typeof replyMarkup === 'string' ? replyMarkup : JSON.stringify(replyMarkup));
        }

        const resp = await fetch(`https://api.telegram.org/bot${this.token}/sendPhoto`, {
            method: 'POST',
            body: formData
        });
        const data = await resp.json();
        if (!data.ok) {
            if (data.description?.includes('entity') || data.description?.includes('parse')) {
                const fdFallback = new FormData();
                fdFallback.append('chat_id', chatId);
                fdFallback.append('photo', blob, `foto.${ext}`);
                if (legenda) fdFallback.append('caption', legenda.replace(/<[^>]*>/g, ''));
                if (replyMarkup) fdFallback.append('reply_markup', typeof replyMarkup === 'string' ? replyMarkup : JSON.stringify(replyMarkup));
                const resp2 = await fetch(`https://api.telegram.org/bot${this.token}/sendPhoto`, {
                    method: 'POST',
                    body: fdFallback
                });
                const d2 = await resp2.json();
                if (d2.ok) return d2;
            }
            console.error('❌ Erro _enviarFotoBuffer Telegram:', data.description);
            // Fallback para texto se a foto for rejeitada pelo Telegram
            if (legenda) {
                return await this.enviarMensagem(chatId, legenda, 'HTML', replyMarkup);
            }
        }
        return data;
    }

    // ----------------------------------------------------
    // ENVIAR ÁLBUM DE MÚLTIPLAS FOTOS (SENDMEDIAGROUP)
    // ----------------------------------------------------
    async enviarAlbum(chatId, listaFotos, legenda = '', replyMarkup = null) {
        if (!chatId) return null;
        if (!listaFotos || !Array.isArray(listaFotos) || listaFotos.length === 0) {
            return await this.enviarMensagem(chatId, legenda, 'HTML', replyMarkup);
        }

        if (listaFotos.length === 1) {
            return await this.enviarFoto(chatId, listaFotos[0], 'image/jpeg', legenda, replyMarkup);
        }

        try {
            const fotosValidas = listaFotos.slice(0, 10);
            const formData = new FormData();
            formData.append('chat_id', chatId);

            let legendaTruncada = (legenda || '').trim();
            if (legendaTruncada.length > 1000) {
                legendaTruncada = legendaTruncada.substring(0, 995) + '...';
            }

            const mediaElements = [];
            let attachIndex = 0;

            for (let i = 0; i < fotosValidas.length; i++) {
                const itemFoto = fotosValidas[i];
                let foto = itemFoto?.data || itemFoto?.url || itemFoto;
                let mime = itemFoto?.mimetype || 'image/jpeg';

                if (typeof foto === 'string' && (foto.startsWith('http://') || foto.startsWith('https://'))) {
                    const elem = { type: 'photo', media: foto };
                    if (i === 0 && legendaTruncada) {
                        elem.caption = legendaTruncada;
                        elem.parse_mode = 'HTML';
                    }
                    mediaElements.push(elem);
                } else {
                    let buf;
                    if (Buffer.isBuffer(foto)) {
                        buf = foto;
                    } else if (typeof foto === 'string') {
                        buf = Buffer.from(foto, 'base64');
                    }

                    if (buf && buf.length > 0) {
                        const attachName = `photo_${attachIndex}`;
                        attachIndex++;
                        const elem = { type: 'photo', media: `attach://${attachName}` };
                        if (i === 0 && legendaTruncada) {
                            elem.caption = legendaTruncada;
                            elem.parse_mode = 'HTML';
                        }
                        mediaElements.push(elem);
                        formData.append(attachName, new Blob([buf], { type: mime }), `${attachName}.jpg`);
                    }
                }
            }

            if (mediaElements.length === 0) {
                return await this.enviarMensagem(chatId, legenda, 'HTML', replyMarkup);
            }

            formData.append('media', JSON.stringify(mediaElements));

            const resp = await fetch(`https://api.telegram.org/bot${this.token}/sendMediaGroup`, {
                method: 'POST',
                body: formData
            });

            const data = await resp.json();
            if (data.ok) {
                if (replyMarkup) {
                    await this.enviarMensagem(chatId, '👇 <i>Ações rápidas para esta oportunidade:</i>', 'HTML', replyMarkup);
                }
                return data;
            } else {
                console.warn('⚠️ Falha no sendMediaGroup, enviando primeira foto:', data.description);
                return await this.enviarFoto(chatId, fotosValidas[0], 'image/jpeg', legenda, replyMarkup);
            }
        } catch (erro) {
            console.error('❌ Erro no envio de álbum:', erro.message);
            if (listaFotos[0]) {
                return await this.enviarFoto(chatId, listaFotos[0], 'image/jpeg', legenda, replyMarkup);
            }
            return await this.enviarMensagem(chatId, legenda, 'HTML', replyMarkup);
        }
    }

    // ----------------------------------------------------
    // NOTIFICAÇÕES FORMATADAS
    // ----------------------------------------------------

    // 1. Notificação do Anúncio (Grupo Parceiro — contato mascarado, admin libera depois)
    async notificarAnuncioParceiro(item, media = null) {
        const icone = item.tipo === 'COMPRA' ? '🔍 [PROCURA]' : '💎 [DESAPEGO / VENDA]';
        const precoTxt = item.preco ? `R$ ${item.preco.toFixed(2)}` : 'Não informado';
        const volTxt = item.volume ? `${item.volume}ml` : 'Não informado';

        let extraDecant = '';
        if (item.oportunidadeDecant && item.custoPorMl) {
            extraDecant = `\n🧪 <b>Oportunidade Decant:</b> Custo ~ R$ ${item.custoPorMl}/ml`;
        }

        let auditTxt = '';
        if (item.auditoriaSeguranca) {
            auditTxt = `\n🛡️ <b>Auditoria:</b> ${item.auditoriaSeguranca.selo}`;
        }

        const texto = `<b>${icone} OPORTUNIDADE IDENTIFICADA</b>

📦 <b>Perfume:</b> ${item.perfume || 'Diversos / Anúncio Geral'}
💰 <b>Preço:</b> ${precoTxt}
🧪 <b>Volume:</b> ${volTxt}${extraDecant}${auditTxt}
👥 <b>Grupo Origem:</b> ${item.grupoNome}
🆔 <b>Código:</b> <code>${item.id}</code>

🔒 <b>Contato Vendedor:</b> <i>[Solicite ao Admin pelo botão abaixo]</i>

💬 <b>Mensagem Original:</b>
<i>${escapeHtml(item.texto.substring(0, 400))}</i>`;

        const replyMarkup = {
            inline_keyboard: [
                [{ text: '🛎️ Solicitar Contato ao Admin', callback_data: `solicitar_${item.id}` }],
                [{ text: '🛡️ Checklist Anti-Golpe', callback_data: `checklist_${item.id}` }]
            ]
        };

        let fotos = Array.isArray(media) ? media : (media ? [media] : []);
        if (fotos.length === 0 && item?.fotos && Array.isArray(item.fotos) && item.fotos.length > 0) {
            fotos = item.fotos;
        } else if (fotos.length === 0 && item?.foto) {
            fotos = [item.foto];
        }

        if (fotos.length > 1) {
            await this.enviarAlbum(this.parceiroChatId, fotos, texto, replyMarkup);
        } else if (fotos.length === 1) {
            await this.enviarFoto(this.parceiroChatId, fotos[0], fotos[0]?.mimetype || 'image/jpeg', texto, replyMarkup);
        } else {
            await this.enviarMensagem(this.parceiroChatId, texto, 'HTML', replyMarkup);
        }
    }

    // 2. Notificação Completa para o Admin (com WhatsApp direto, Auditoria e Botões Rápidos)
    async notificarAnuncioAdmin(item, media = null) {
        if (!this.adminChatId) return;

        const icone = item.tipo === 'COMPRA' ? '🔍 [COMPRA]' : '💎 [VENDA]';
        const telFormatado = item.autorTelefone ? `+${item.autorTelefone}` : 'Desconhecido';
        const linkWpp = item.autorTelefone ? `https://wa.me/${item.autorTelefone}` : '';

        let auditAdmin = '';
        if (item.auditoriaSeguranca) {
            const aud = item.auditoriaSeguranca;
            auditAdmin = `\n🛡️ <b>Auditoria Anti-Golpe:</b> ${aud.selo} (Score: ${aud.score}/100)\n`;
            if (aud.alertas && aud.alertas.length > 0) {
                auditAdmin += aud.alertas.map(a => `• ${a}`).join('\n') + '\n';
            }
            if (aud.pontosPositivos && aud.pontosPositivos.length > 0) {
                auditAdmin += aud.pontosPositivos.slice(0, 2).map(p => `• ${p}`).join('\n') + '\n';
            }
        }

        const texto = `👑 <b>[PAINEL ADMIN] NOVO ANÚNCIO DETECTADO</b>
${icone} <b>${item.perfume || 'Perfume'}</b>

💰 <b>Valor:</b> ${item.preco ? `R$ ${item.preco.toFixed(2)}` : 'A negociar'}
👥 <b>Grupo:</b> ${item.grupoNome}
👤 <b>Autor:</b> ${item.autor}
📞 <b>Telefone:</b> ${telFormatado}
🔗 <b>WhatsApp Direto:</b> <a href="${linkWpp}">${linkWpp}</a>
🆔 <b>Código Interno:</b> <code>${item.id}</code>${auditAdmin}
💬 <b>Texto:</b>
${escapeHtml(item.texto)}`;

        const botoes = [];
        const linha = [];
        if (item.autorTelefone) {
            linha.push({ text: '💬 Chamar no WhatsApp', url: linkWpp });
        }
        linha.push({ text: '🔓 Liberar p/ Parceiro', callback_data: `liberar_${item.id}` });
        botoes.push(linha);

        botoes.push([
            { text: '🛡️ Checklist Anti-Golpe', callback_data: `checklist_${item.id}` }
        ]);

        const replyMarkup = { inline_keyboard: botoes };

        let fotosAdmin = Array.isArray(media) ? media : (media ? [media] : []);
        if (fotosAdmin.length === 0 && item?.fotos && Array.isArray(item.fotos)) {
            fotosAdmin = item.fotos;
        } else if (fotosAdmin.length === 0 && item?.foto) {
            fotosAdmin = [item.foto];
        }

        if (fotosAdmin.length > 1) {
            await this.enviarAlbum(this.adminChatId, fotosAdmin, texto, replyMarkup);
        } else if (fotosAdmin.length === 1) {
            await this.enviarFoto(this.adminChatId, fotosAdmin[0], fotosAdmin[0].mimetype || 'image/jpeg', texto, replyMarkup);
        } else {
            await this.enviarMensagem(this.adminChatId, texto, 'HTML', replyMarkup);
        }
    }

    // 3. Alerta de Arbitragem Cruzada (Matching)
    async notificarMatchArbitragem(match) {
        const { demanda, oferta, perfume, seguranca, spread } = match;

        const lucroTxt = spread.lucroEstimado ? `R$ ${spread.lucroEstimado.toFixed(2)}` : 'A definir';
        const compraTxt = spread.precoCompraOrigem ? `R$ ${spread.precoCompraOrigem.toFixed(2)}` : 'A negociar';
        const vendaSugeridaTxt = spread.precoVendaFinal ? `R$ ${spread.precoVendaFinal.toFixed(2)}` : 'A negociar';

        const iconeSeguranca = seguranca.seguro ? '🟢 SEGURA' : '⚠️ ALTO RISCO';

        const textoAdmin = `🎯 <b>OPORTUNIDADE DE ARBITRAGEM CRUZADA!</b>
━━━━━━━━━━━━━━━━━━━━
📦 <b>Perfume:</b> <b>${perfume}</b>
🛡️ <b>Segurança de Grupos:</b> <b>${iconeSeguranca}</b>
${seguranca.motivo}

💵 <b>SIMULAÇÃO FINANCEIRA:</b>
• Compra de ${oferta.autor} por: <b>${compraTxt}</b>
• Vender para ${demanda.autor} por: <b>${vendaSugeridaTxt}</b>
• <b>Lucro Estimado:</b> <b>${lucroTxt}</b> (+ ganho na emissão de frete)

━━━━━━━━━━━━━━━━━━━━
🛒 <b>VENDEDOR (Oferta):</b>
• Nome: ${oferta.autor}
• Grupo postado: ${oferta.grupoNome}
• WhatsApp: <a href="https://wa.me/${oferta.autorTelefone}">https://wa.me/${oferta.autorTelefone}</a>
• Código: <code>${oferta.id}</code>

🙋 <b>COMPRADOR (Demanda):</b>
• Nome: ${demanda.autor}
• Grupo postado: ${demanda.grupoNome}
• WhatsApp: <a href="https://wa.me/${demanda.autorTelefone}">https://wa.me/${demanda.autorTelefone}</a>
• Código: <code>${demanda.id}</code>
━━━━━━━━━━━━━━━━━━━━`;

        const botoesAdmin = [
            [
                { text: '🛒 Chamar Vendedor', url: `https://wa.me/${oferta.autorTelefone}` },
                { text: '🙋 Chamar Comprador', url: `https://wa.me/${demanda.autorTelefone}` }
            ]
        ];

        if (this.adminChatId) {
            await this.enviarMensagem(this.adminChatId, textoAdmin, 'HTML', { inline_keyboard: botoesAdmin });
        } else {
            const textoParceiro = `🎯 <b>OPORTUNIDADE DE INTERMEDIAÇÃO DETECTADA!</b>
━━━━━━━━━━━━━━━━━━━━
📦 <b>Perfume:</b> <b>${perfume}</b>
🛡️ <b>Status de Grupos:</b> ${iconeSeguranca}
${seguranca.motivo}

💰 <b>Preço Compra:</b> ${compraTxt}
📈 <b>Venda Sugerida:</b> ${vendaSugeridaTxt}
💵 <b>Lucro Estimado:</b> ${lucroTxt}

🆔 <b>Código Compra:</b> <code>${oferta.id}</code>
🆔 <b>Código Venda:</b> <code>${demanda.id}</code>
<i>(Clique abaixo para solicitar os dados ao Admin)</i>
━━━━━━━━━━━━━━━━━━━━`;
            await this.enviarMensagem(this.parceiroChatId, textoParceiro, 'HTML', {
                inline_keyboard: [
                    [{ text: '🛎️ Solicitar Intermediação ao Admin', callback_data: `solicitar_${oferta.id}` }]
                ]
            });
        }
    }

    // ----------------------------------------------------
    // POLLING DE COMANDOS DO TELEGRAM
    // ----------------------------------------------------
    iniciarPollingComandos(db) {
        this.database = db;
        this.pollingAtivo = true;
        this._executarCicloPolling();
        console.log('🤖 [TELEGRAM] Escuta de comandos (/status, /buscar, /liberar, /admin) ativada.');
    }

    async _executarCicloPolling() {
        while (this.pollingAtivo) {
            try {
                const resp = await fetch(
                    `https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.pollingOffset}&timeout=20`
                );
                const data = await resp.json();

                if (data.ok && Array.isArray(data.result)) {
                    for (const update of data.result) {
                        this.pollingOffset = update.update_id + 1;
                        if (update.message) {
                            await this._processarComando(update.message);
                        } else if (update.callback_query) {
                            await this._processarCallback(update.callback_query);
                        }
                    }
                }
            } catch (e) {
                // Silencioso em caso de timeout transitório
                await new Promise(r => setTimeout(r, 4000));
            }
        }
    }

    async _processarComando(msg) {
        const texto = (msg.text || '').trim();
        const chatId = msg.chat?.id;
        const senderId = msg.from?.id;

        if (!texto.startsWith('/')) return;

        const partes = texto.split(' ');
        const comando = partes[0].toLowerCase().split('@')[0];
        const argumento = partes.slice(1).join(' ').trim();

        if (comando === '/ajuda' || comando === '/help' || comando === '/start') {
            const ajuda = `🧭 <b>COMANDOS DO RADAR DE PERFUMES:</b>

• <code>/status</code> - Visão geral de ofertas e demandas ativas
• <code>/grupos</code> - Lista os grupos monitorados e membros indexados
• <code>/buscar [perfume]</code> - Busca pessoas vendendo ou procurando (ex: <i>/buscar 212</i>)
• <code>/liberar [código]</code> - Libera contato de um anúncio (ex: <i>/liberar OF-XXXX</i>)
• <code>/admin</code> - Define seu chat privado como painel mestre de administrador`;
            await this.enviarMensagem(chatId, ajuda);
        }
        else if (comando === '/admin') {
            this.adminChatId = String(senderId);
            await this.enviarMensagem(chatId, `✅ <b>ID ${senderId} configurado como Administrador!</b>\nVocê agora receberá contatos completos e alertas de arbitragem no privado.`);
        }
        else if (comando === '/status') {
            if (!this.database) return;
            const totalOfertas = this.database.dados.ofertas.length;
            const totalDemandas = this.database.dados.demandas.length;
            const totalGrupos = Object.keys(this.database.dados.gruposInfo).length;

            const statusTxt = `📊 <b>STATUS DO RADAR DE PERFUMES:</b>
• Grupos monitorados indexados: <b>${totalGrupos}</b>
• Anúncios de desapego no banco: <b>${totalOfertas}</b>
• Pedidos de compra em aberto: <b>${totalDemandas}</b>
• Monitoramento ativo e operando em tempo real.`;
            await this.enviarMensagem(chatId, statusTxt);
        }
        else if (comando === '/grupos') {
            if (!this.database) return;
            const grupos = Object.values(this.database.dados.gruposInfo);
            if (grupos.length === 0) {
                await this.enviarMensagem(chatId, 'ℹ️ Nenhum grupo registrado ainda no banco.');
                return;
            }

            let msgGrupos = `👥 <b>GRUPOS MONITORADOS ATIVOS (${grupos.length}):</b>\n\n`;
            for (const g of grupos) {
                msgGrupos += `• <b>${g.nome}</b>\n  └ Membros: <b>${g.totalMembros || 'N/A'}</b>\n`;
            }
            await this.enviarMensagem(chatId, msgGrupos);
        }
        else if (comando === '/buscar') {
            if (!this.database || !argumento) {
                await this.enviarMensagem(chatId, '💡 Use: <code>/buscar [nome do perfume]</code> (ex: <code>/buscar sauvage</code>)');
                return;
            }

            const ofertas = this.database.buscarOfertasParaPerfume(argumento, 20);
            const demandas = this.database.buscarDemandasParaPerfume(argumento, 20);

            let resposta = `🔎 <b>RESULTADOS PARA: "${argumento.toUpperCase()}"</b>\n\n`;

            if (ofertas.length === 0 && demandas.length === 0) {
                resposta += '<i>Nenhum anúncio ou pedido recente encontrado para este perfume.</i>';
            } else {
                if (ofertas.length > 0) {
                    resposta += `💎 <b>VENDAS RECENTES (${ofertas.length}):</b>\n`;
                    for (const of of ofertas.slice(0, 5)) {
                        const pr = of.preco ? `R$ ${of.preco}` : 'S/ valor';
                        resposta += `• <b>${of.perfume || 'Perfume'}</b> - ${pr} (Grupo: ${of.grupoNome}) [ID: <code>${of.id}</code>]\n`;
                    }
                    resposta += '\n';
                }

                if (demandas.length > 0) {
                    resposta += `🔍 <b>COMPRADORES PROCURANDO (${demandas.length}):</b>\n`;
                    for (const dm of demandas.slice(0, 5)) {
                        resposta += `• <b>${dm.perfume || 'Perfume'}</b> - Solicitado por ${dm.autor} (Grupo: ${dm.grupoNome}) [ID: <code>${dm.id}</code>]\n`;
                    }
                }
            }

            await this.enviarMensagem(chatId, resposta);
        }
        else if (comando === '/liberar') {
            if (!argumento) {
                await this.enviarMensagem(chatId, '💡 Use: <code>/liberar [ID_DO_CODIGO]</code> (ex: <code>/liberar OF-XXXX</code>)');
                return;
            }

            const item = this.database.obterOfertaPorId(argumento) || this.database.obterDemandaPorId(argumento);
            if (!item) {
                await this.enviarMensagem(chatId, `❌ Código <code>${argumento}</code> não encontrado no banco.`);
                return;
            }

            const tel = item.autorTelefone;
            const msgLiberacao = `🔓 <b>CONTATO LIBERADO PELO ADMIN</b>
🆔 Código: <code>${item.id}</code>
📦 Perfume: <b>${item.perfume || 'Geral'}</b>
👤 Nome: <b>${item.autor}</b>
📞 WhatsApp: +${tel}
🔗 Link direto: <a href="https://wa.me/${tel}">https://wa.me/${tel}</a>`;

            await this.enviarMensagem(this.parceiroChatId, msgLiberacao);
            if (chatId !== this.parceiroChatId) {
                await this.enviarMensagem(chatId, `✅ Contato do anúncio <code>${item.id}</code> enviado para a operação.`);
            }
        }
    }

    async _responderCallback(callbackQueryId, texto = '') {
        try {
            await fetch(`https://api.telegram.org/bot${this.token}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callback_query_id: callbackQueryId,
                    text: texto,
                    show_alert: !!texto
                })
            });
        } catch (e) {
            // Falha silenciosa em answerCallbackQuery
        }
    }

    async _processarCallback(query) {
        const data = query.data || '';
        const user = query.from;

        if (data.startsWith('liberar_')) {
            const idItem = data.replace('liberar_', '');
            if (!this.database) {
                await this._responderCallback(query.id, 'Banco de dados não carregado.');
                return;
            }

            const item = this.database.obterOfertaPorId(idItem) || this.database.obterDemandaPorId(idItem);
            if (!item) {
                await this._responderCallback(query.id, 'Item não encontrado no banco.');
                return;
            }

            const tel = item.autorTelefone;
            const msgLiberacao = `🔓 <b>CONTATO LIBERADO PELO ADMIN</b>
🆔 Código: <code>${item.id}</code>
📦 Perfume: <b>${item.perfume || 'Geral'}</b>
👤 Nome: <b>${item.autor}</b>
📞 WhatsApp: +${tel}
🔗 Link direto: <a href="https://wa.me/${tel}">https://wa.me/${tel}</a>`;

            await this.enviarMensagem(this.parceiroChatId, msgLiberacao);
            await this._responderCallback(query.id, `✅ Contato de ${item.autor} liberado para a operação!`);

            if (this.adminChatId) {
                await this.enviarMensagem(this.adminChatId, `✅ Você liberou o contato do item <code>${item.id}</code>.`);
            }
        }
        else if (data.startsWith('solicitar_')) {
            const idItem = data.replace('solicitar_', '');
            await this._responderCallback(query.id, 'Solicitação enviada ao Admin!');

            if (this.adminChatId) {
                const item = this.database ? (this.database.obterOfertaPorId(idItem) || this.database.obterDemandaPorId(idItem)) : null;
                const nomePerfume = item?.perfume ? ` (${item.perfume})` : '';

                const markupLiberar = {
                    inline_keyboard: [
                        [{ text: '🔓 Liberar Agora p/ Operação', callback_data: `liberar_${idItem}` }]
                    ]
                };

                await this.enviarMensagem(
                    this.adminChatId,
                    `🛎️ <b>SOLICITAÇÃO DE CONTATO RECEBIDA:</b>\nA operação solicitou o contato do item <code>${idItem}</code>${nomePerfume}.\nClique abaixo para autorizar:`,
                    'HTML',
                    markupLiberar
                );
            }
        }
        else if (data.startsWith('checklist_')) {
            const checklistTxt = "🛡️ CHECKLIST ANTI-GOLPE:\n\n1. Peça vídeo borrifando o perfume\n2. Foto do lote (batch code) gravado no frasco com um papel escrito o nome do vendedor ao lado\n3. Verifique se o nome no PIX é idêntico ao titular do WhatsApp";
            await this._responderCallback(query.id, checklistTxt);
        }
    }
}

function escapeHtml(texto) {
    if (!texto) return '';
    return texto
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

module.exports = new TelegramService();
