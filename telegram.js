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
    // FIXAR MENSAGEM NO TOPO DO GRUPO (PIN MESSAGE)
    // ----------------------------------------------------
    async fixarMensagem(chatId, messageId) {
        if (!chatId || !messageId) return null;
        try {
            const resp = await fetch(`https://api.telegram.org/bot${this.token}/pinChatMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                    disable_notification: false // Alerta sonoro obrigatório no celular de todos!
                })
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

    // 1. Notificação do Anúncio Completo no Grupo (com WhatsApp direto, análise de mercado e fotos)
    async notificarAnuncioParceiro(item, media = null) {
        const security = require('./security');
        const ehOuro = item.analiseMercado?.classificacao === 'OPORTUNIDADE_DE_OURO';
        const ehBomPreco = item.analiseMercado?.classificacao === 'BOM_PRECO';

        // Cabeçalho por tipo de anúncio
        let header;
        if (item.apenasImagem) {
            header = `📸 <b>FOTO RECEBIDA — SEM TEXTO</b>\n<i>⚠️ Verifique se é procura ou venda e entre em contato!</i>`;
        } else if (ehOuro) {
            header = `🔥🔥🔥 <b>OPORTUNIDADE DE OURO!</b> 🔥🔥🔥`;
        } else if (ehBomPreco) {
            header = item.tipo === 'COMPRA'
                ? `🔍 <b>COMPRADOR LOCALIZADO</b>`
                : `💸 <b>BOM PREÇO • VENDA DETECTADA</b>`;
        } else {
            header = item.tipo === 'COMPRA'
                ? `🔍 <b>PROCURA / COMPRADOR</b>`
                : `💶 <b>DESAPEGO / VENDA</b>`;
        }

        // Preço e volume
        const precoTxt = item.preco ? `R$ ${item.preco.toFixed(2)}` : 'A combinar';
        const volTxt = item.volume ? ` • ${item.volume}ml` : '';
        const mlTxt = item.custoPorMl ? ` (R$ ${item.custoPorMl}/ml)` : '';

        // Contato
        const telInfo = security.formatarTelefoneWhatsapp(item.autorTelefone, item.autor);
        const linkWpp = telInfo.linkWpp || (item.autorTelefone ? `https://wa.me/${item.autorTelefone}` : '');
        const telExibicao = telInfo.formatado || (item.autorTelefone ? `+${item.autorTelefone}` : 'Não identificado');

        // Análise de Mercado — só aparece se for relevante (OURO ou BOM)
        let analiseTxt = '';
        if (ehOuro && item.analiseMercado) {
            analiseTxt = `
📊 <b>ANÁLISE:</b> <b>${item.analiseMercado.descontoPercent}% abaixo da média</b> (~R$ ${item.analiseMercado.precoMedioMercado})
💰 <b>LUCRO POSSÍVEL: R$ ${item.analiseMercado.spreadReais}+</b>`;
        } else if (ehBomPreco && item.analiseMercado) {
            analiseTxt = `
📊 <b>Mercado:</b> ${item.analiseMercado.descontoPercent}% abaixo da média (~R$ ${item.analiseMercado.precoMedioMercado}) • Margem ~R$ ${item.analiseMercado.spreadReais}`;
        }

        // Texto original do anúncio (truncado se muito longo)
        let descricaoOriginal = '';
        if (item.texto && item.texto !== '[Foto de perfume / desapego]') {
            const textoLimpo = item.texto.trim();
            const truncado = textoLimpo.length > 600 ? textoLimpo.substring(0, 597) + '...' : textoLimpo;
            descricaoOriginal = `

💬 <b>Mensagem original:</b>
<i>${escapeHtml(truncado)}</i>`;
        }

        const separador = ehOuro
            ? '\n═════════════════════════'
            : '\n─────────────────────────';

        const texto = `${header}${separador}
📦 <b>${item.perfume || 'Perfume / Desapego Geral'}</b>${volTxt}${mlTxt}
💰 <b>Preço:</b> <b>${precoTxt}</b>${analiseTxt}
👥 <b>Grupo:</b> ${item.grupoNome}
👤 <b>${item.autor}</b>
📲 <code>${telExibicao}</code>${descricaoOriginal}
🔗 <a href="${linkWpp}">Abrir WhatsApp</a> • 🆔 <code>${item.id}</code>${separador}`;

        // Botões inline
        const botoes = [];
        if (linkWpp) {
            botoes.push([{ text: '💬 Chamar no WhatsApp', url: linkWpp }]);
        }
        botoes.push([{ text: '🛡️ Checklist Anti-Golpe', callback_data: `checklist_${item.id}` }]);
        const replyMarkup = { inline_keyboard: botoes };

        // Fotos
        let fotos = Array.isArray(media) ? media : (media ? [media] : []);
        if (fotos.length === 0 && item?.fotos?.length > 0) fotos = item.fotos;
        else if (fotos.length === 0 && item?.foto) fotos = [item.foto];

        let resEnvio = null;
        if (fotos.length > 1) {
            resEnvio = await this.enviarAlbum(this.parceiroChatId, fotos, texto, replyMarkup);
        } else if (fotos.length === 1) {
            resEnvio = await this.enviarFoto(this.parceiroChatId, fotos[0], fotos[0]?.mimetype || 'image/jpeg', texto, replyMarkup);
        } else {
            resEnvio = await this.enviarMensagem(this.parceiroChatId, texto, 'HTML', replyMarkup);
        }

        // Se for OPORTUNIDADE DE OURO, fixa no topo do Telegram para ser IMPOSSÍVEL NÃO VER!
        if (ehOuro && resEnvio) {
            const msgId = resEnvio.result?.message_id || (Array.isArray(resEnvio.result) ? resEnvio.result[0]?.message_id : null);
            if (msgId) {
                await this.fixarMensagem(this.parceiroChatId, msgId);
                console.log(`📌 [PIN] Oportunidade de Ouro fixada no topo do Telegram! (Msg ID: ${msgId})`);
            }
        }
    }

    // 2. Notificação Completa para o Admin no Privado (se configurado)
    async notificarAnuncioAdmin(item, media = null) {
        if (!this.adminChatId) return;
        // Evita duplicar se o admin chat ID for o mesmo do grupo de parceiros
        if (String(this.adminChatId) === String(this.parceiroChatId)) return;

        const security = require('./security');
        const icone = item.tipo === 'COMPRA' ? '🔍 [COMPRA]' : '💎 [VENDA]';
        const telInfo = security.formatarTelefoneWhatsapp(item.autorTelefone, item.autor);
        const linkWpp = telInfo.linkWpp || (item.autorTelefone ? `https://wa.me/${item.autorTelefone}` : '');
        const telExibicao = telInfo.formatado || (item.autorTelefone ? `+${item.autorTelefone}` : 'Desconhecido');

        let analiseMercadoTxt = '';
        if (item.analiseMercado && item.analiseMercado.selo) {
            analiseMercadoTxt = `\n📊 <b>Mercado:</b> <b>${item.analiseMercado.selo}</b>\n💡 <i>${item.analiseMercado.parecer}</i>\n`;
        }

        const texto = `👑 <b>[PAINEL ADMIN] NOVO ANÚNCIO CAPTADO</b>
${icone} <b>${item.perfume || 'Perfume'}</b>
💰 <b>Valor:</b> ${item.preco ? `R$ ${item.preco.toFixed(2)}` : 'A negociar'}
👥 <b>Grupo:</b> ${item.grupoNome}
👤 <b>Autor:</b> ${item.autor}
📞 <b>Telefone:</b> ${telExibicao}
🔗 <b>WhatsApp:</b> <a href="${linkWpp}">${linkWpp}</a>
🆔 <b>Código:</b> <code>${item.id}</code>${analiseMercadoTxt}
💬 <b>Texto:</b>
${escapeHtml(item.texto)}`;

        const botoes = [];
        if (linkWpp) {
            botoes.push([{ text: '💬 Chamar no WhatsApp', url: linkWpp }]);
        }

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

    // 3. Alerta de Arbitragem Cruzada (Matching) - Enviado Diretamente para o Grupo
    async notificarMatchArbitragem(match) {
        const security = require('./security');
        const { demanda, oferta, perfume, seguranca, spread } = match;

        const lucroTxt = spread.lucroEstimado ? `R$ ${spread.lucroEstimado.toFixed(2)}` : 'A definir';
        const compraTxt = spread.precoCompraOrigem ? `R$ ${spread.precoCompraOrigem.toFixed(2)}` : 'A negociar';
        const vendaSugeridaTxt = spread.precoVendaFinal ? `R$ ${spread.precoVendaFinal.toFixed(2)}` : 'A negociar';

        const iconeSeguranca = seguranca.seguro ? '🟢 SEGURA' : '⚠️ ATENÇÃO';

        // Normalização de contatos do vendedor e do comprador
        const telVendedor = security.formatarTelefoneWhatsapp(oferta.autorTelefone, oferta.autor);
        const telComprador = security.formatarTelefoneWhatsapp(demanda.autorTelefone, demanda.autor);

        const textoMatch = `🎯 <b>OPORTUNIDADE DE ARBITRAGEM CRUZADA!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 <b>Perfume:</b> <b>${perfume}</b>
💰 <b>LUCRO ESTIMADO:</b> <b>${lucroTxt}</b> (Spread Bruto)
🛡️ <b>Segurança de Grupos:</b> <b>${iconeSeguranca}</b>
<i>${seguranca.motivo}</i>

💵 <b>SIMULAÇÃO FINANCEIRA:</b>
• Comprar de ${oferta.autor} por: <b>${compraTxt}</b>
• Vender para ${demanda.autor} por: <b>${vendaSugeridaTxt}</b>
• <b>Margem de Lucro:</b> <b>${lucroTxt}</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━
🛒 <b>VENDEDOR (Oferta):</b>
• <b>Nome:</b> ${oferta.autor}
• <b>Grupo:</b> ${oferta.grupoNome}
• <b>WhatsApp:</b> <code>${telVendedor.formatado}</code> (<a href="${telVendedor.linkWpp}">Chamar</a>)
• <b>Disse:</b> <i>"${escapeHtml(oferta.texto)}"</i>

🙋 <b>COMPRADOR (Procura):</b>
• <b>Nome:</b> ${demanda.autor}
• <b>Grupo:</b> ${demanda.grupoNome}
• <b>WhatsApp:</b> <code>${telComprador.formatado}</code> (<a href="${telComprador.linkWpp}">Chamar</a>)
• <b>Disse:</b> <i>"${escapeHtml(demanda.texto)}"</i>
━━━━━━━━━━━━━━━━━━━━━━━━━━`;

        const botoesMatch = [
            [
                { text: '🛒 Falar c/ Vendedor', url: telVendedor.linkWpp },
                { text: '🙋 Falar c/ Comprador', url: telComprador.linkWpp }
            ]
        ];

        // Envia diretamente no Grupo da Operação
        const resMatch = await this.enviarMensagem(this.parceiroChatId, textoMatch, 'HTML', { inline_keyboard: botoesMatch });
        if (resMatch?.result?.message_id) {
            await this.fixarMensagem(this.parceiroChatId, resMatch.result.message_id);
            console.log(`📌 [PIN] Match de arbitragem fixado no topo do Telegram! (Msg ID: ${resMatch.result.message_id})`);
        }

        // Envia também no privado do Admin se for diferente do grupo
        if (this.adminChatId && String(this.adminChatId) !== String(this.parceiroChatId)) {
            await this.enviarMensagem(this.adminChatId, textoMatch, 'HTML', { inline_keyboard: botoesMatch });
        }
    }

    // ----------------------------------------------------
    // POLLING DE COMANDOS DO TELEGRAM
    // ----------------------------------------------------
    iniciarPollingComandos(db) {
        this.database = db;
        if (!this.adminChatId && db && typeof db.obterAdminChatId === 'function') {
            const salvo = db.obterAdminChatId();
            if (salvo) {
                this.adminChatId = String(salvo);
                console.log(`👑 [ADMIN] ID Administrador carregado do banco: ${this.adminChatId}`);
            }
        }
        this.pollingAtivo = true;
        this._executarCicloPolling();
        console.log('🤖 [TELEGRAM] Escuta de comandos (/status, /buscar, /cotar, /preco, /liberar, /admin) ativada.');
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

• <code>/cotar [perfume]</code> - Cotação em tempo real (WhatsApp, OLX, ML, Enjoei)
• <code>/preco [perfume]</code> - Análise de preço médio e margem de revenda
• <code>/buscar [perfume]</code> - Busca pessoas vendendo ou procurando nos grupos
• <code>/status</code> - Visão geral de ofertas e demandas ativas
• <code>/grupos</code> - Lista os grupos monitorados e membros indexados
• <code>/liberar [código]</code> - Libera contato de um anúncio (ex: <i>/liberar OF-XXXX</i>)
• <code>/admin</code> - Define seu chat privado como painel mestre de administrador`;
            await this.enviarMensagem(chatId, ajuda);
        }
        else if (comando === '/admin') {
            // Se já tiver admin configurado, só o próprio admin pode reconfigurar
            if (this.adminChatId && String(senderId) !== String(this.adminChatId)) {
                await this.enviarMensagem(chatId, '⛔ <b>Acesso negado:</b> Já existe um Administrador mestre configurado para este bot.');
                return;
            }

            this.adminChatId = String(senderId);
            if (this.database && typeof this.database.definirAdminChatId === 'function') {
                this.database.definirAdminChatId(senderId);
            }
            await this.enviarMensagem(
                chatId,
                `👑 <b>ID ${senderId} configurado como Administrador permanente!</b>\n\n` +
                `✅ Seu ID foi salvo no banco de dados e não será perdido ao reiniciar o PM2.\n` +
                `✅ Você agora receberá todos os anúncios no privado com contatos completos (telefone, WhatsApp direto, auditoria anti-golpe e fotos).`
            );
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
        else if (comando === '/cotar' || comando === '/preco') {
            if (!argumento) {
                await this.enviarMensagem(chatId, '💡 Use: <code>/cotar [nome do perfume]</code>\nExemplo: <code>/cotar summer hammer</code> ou <code>/cotar sauvage</code>');
                return;
            }

            await this.enviarMensagem(chatId, `⏳ <b>PESQUISANDO MERCADO EM TEMPO REAL...</b>\nConsultando Grupos do WhatsApp, OLX, Mercado Livre e Enjoei para: <b>"${argumento.toUpperCase()}"</b>`);

            try {
                const sniperOlx = require('./sniper-olx');
                const sniperMl = require('./sniper-ml');
                const sniperEnjoei = require('./sniper-enjoei');

                // Executa consultas concorrentes em todas as plataformas
                const [ofertasWpp, adsOlx, adsMl, adsEnjoei] = await Promise.all([
                    Promise.resolve(this.database ? this.database.buscarOfertasParaPerfume(argumento, 20) : []),
                    sniperOlx.buscarParaCotacao(argumento).catch(() => []),
                    sniperMl.buscarParaCotacao(argumento).catch(() => []),
                    sniperEnjoei.buscarParaCotacao(argumento).catch(() => [])
                ]);

                // Consolida todos os preços válidos
                const todosAnuncios = [];

                for (const of of ofertasWpp) {
                    if (of.preco && of.preco > 30) {
                        todosAnuncios.push({
                            plataforma: `WhatsApp (${of.grupoNome || 'Grupo'})`,
                            titulo: of.perfume || of.texto?.substring(0, 40) || 'Perfume',
                            preco: of.preco,
                            url: of.linkWhatsapp || '',
                            autor: of.autor
                        });
                    }
                }

                todosAnuncios.push(...adsOlx);
                todosAnuncios.push(...adsMl);
                todosAnuncios.push(...adsEnjoei);

                if (todosAnuncios.length === 0) {
                    await this.enviarMensagem(chatId, `❌ Nenhum anúncio ativo encontrado para <b>"${argumento.toUpperCase()}"</b> no momento nas plataformas pesquisadas.`);
                    return;
                }

                // Cálculos estatísticos
                const precos = todosAnuncios.map(a => a.preco).sort((a, b) => a - b);
                const menorPreco = precos[0];
                const maiorPreco = precos[precos.length - 1];
                const somaPrecos = precos.reduce((acc, p) => acc + p, 0);
                const precoMedio = Math.round(somaPrecos / precos.length);

                // Sugestão para arbitragem: comprar com pelo menos 20% abaixo da média para revender com lucro
                const tetoCompraRecomendado = Math.round(precoMedio * 0.75);
                const potencialLucro = Math.max(50, Math.round(precoMedio - menorPreco));

                // Monta painel
                let painel = `📊 <b>COTAÇÃO DE MERCADO: "${argumento.toUpperCase()}"</b>\n`;
                painel += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                painel += `💰 <b>Menor Preço Encontrado:</b> <b>R$ ${menorPreco}</b>\n`;
                painel += `📈 <b>Preço Médio de Mercado:</b> <b>R$ ${precoMedio}</b>\n`;
                painel += `🏷️ <b>Maior Preço Anunciado:</b> <b>R$ ${maiorPreco}</b>\n`;
                painel += `📦 <b>Total de Anúncios Ativos:</b> <b>${todosAnuncios.length}</b>\n\n`;

                painel += `🎯 <b>ESTRATÉGIA DE LUCRO:</b>\n`;
                painel += `• <b>Pagar no Máximo:</b> <b>R$ ${tetoCompraRecomendado}</b> (para ter boa margem)\n`;
                painel += `• <b>Preço Sugerido de Venda:</b> <b>R$ ${precoMedio}</b>\n`;
                painel += `• <b>Margem de Lucro Estimada:</b> <b>R$ ${potencialLucro}+</b>\n`;
                painel += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

                painel += `🛒 <b>MELHORES OFERTAS ATIVAS AGORA:</b>\n`;
                // Top 5 anúncios mais baratos
                const topOfertas = todosAnuncios.sort((a, b) => a.preco - b.preco).slice(0, 5);
                for (const o of topOfertas) {
                    const linkFormatado = o.url ? `<a href="${o.url}">Abrir anúncio</a>` : 'No WhatsApp';
                    painel += `• <b>R$ ${o.preco}</b> [${o.plataforma}] - ${escapeHtml(o.titulo.substring(0, 35))} (${linkFormatado})\n`;
                }

                await this.enviarMensagem(chatId, painel);

            } catch (err) {
                console.error('❌ Erro na cotação:', err);
                await this.enviarMensagem(chatId, '⚠️ Erro ao consultar algumas plataformas de busca no momento.');
            }
        }
        else if (comando === '/buscar') {
            if (!this.database || !argumento) {
                await this.enviarMensagem(chatId, '💡 Use: <code>/buscar [nome do perfume]</code> (ex: <code>/buscar sauvage</code>)\nOu use <code>/cotar [perfume]</code> para cotação em todas as plataformas.');
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
            if (this.adminChatId && String(senderId) !== String(this.adminChatId)) {
                await this.enviarMensagem(chatId, '⛔ <b>Acesso negado:</b> Apenas o Administrador pode liberar contatos.');
                return;
            }

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
            if (this.adminChatId && user?.id && String(user.id) !== String(this.adminChatId)) {
                await this._responderCallback(query.id, '⛔ Apenas o Administrador pode liberar contatos.');
                return;
            }

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
