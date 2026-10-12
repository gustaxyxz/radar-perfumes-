// ========================================================
// RADAR DE PERFUMES - MOTOR PRINCIPAL
// ========================================================

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');

const config = require('./config');
const database = require('./database');
const matcher = require('./matcher');
const security = require('./security');
const telegram = require('./telegram');
const { sincronizarHistoricoGrupos } = require('./history');
const sniperOlx = require('./sniper-olx');
const sniperEnjoei = require('./sniper-enjoei');
const sniperMl = require('./sniper-ml');

// Cache em memória para IDs dos grupos monitorados: grupoId -> nomeGrupo
const gruposPermitidosMap = new Map();
const gruposIgnoradosSet = new Set();

// --------------------------------------------------------
// INICIALIZAÇÃO DO CLIENTE WHATSAPP (COMPATÍVEL COM LINUX/WINDOWS)
// --------------------------------------------------------
const puppeteerOptions = {
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
    ]
};

// Detecção automática de Chromium para VPS Linux (Oracle Cloud ARM / x86)
const fs = require('fs');
const possiveisCaminhos = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium'
].filter(Boolean);

for (const p of possiveisCaminhos) {
    if (fs.existsSync(p)) {
        puppeteerOptions.executablePath = p;
        break;
    }
}

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'radar-perfumes'
    }),
    puppeteer: puppeteerOptions
});

// --------------------------------------------------------
// UTILITÁRIO: VALIDADOR DE GRUPOS
// --------------------------------------------------------
function normalizarTexto(txt) {
    return (txt || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

function ehGrupoMonitorado(nomeGrupo) {
    if (!nomeGrupo) return false;
    const norm = normalizarTexto(nomeGrupo);

    // 1. Grupos configurados pelo nome exato (ignorando case, acentos e emojis)
    for (const g of config.GRUPOS_MONITORADOS) {
        if (normalizarTexto(g) === norm) return true;
    }

    // 2. Alias / fragmentos de nome flexível (para quando o grupo muda emoji/pontuação)
    if (config.GRUPOS_ALIAS && Array.isArray(config.GRUPOS_ALIAS)) {
        for (const alias of config.GRUPOS_ALIAS) {
            if (norm.includes(normalizarTexto(alias))) return true;
        }
    }

    // NÃO aceita grupos desconhecidos — filtro estrito para evitar capturar grupos errados
    return false;
}

async function carregarChatsComRetry(maxTentativas = 10, esperaMs = 5000) {
    for (let i = 1; i <= maxTentativas; i++) {
        try {
            console.log(`⏳ [SINCRONIZAÇÃO] Aguardando WhatsApp carregar conversas (tentativa ${i}/${maxTentativas})...`);
            await new Promise(r => setTimeout(r, esperaMs));
            const chats = await client.getChats();
            if (chats && chats.length > 0) {
                console.log(`✅ [SINCRONIZAÇÃO] ${chats.length} conversas carregadas do WhatsApp!`);
                return chats;
            }
        } catch (erro) {
            console.warn(`⏳ Tentativa ${i}/${maxTentativas} aguardando sincronização interna... (${erro.message || erro})`);
            if (i === maxTentativas) return [];
        }
    }
    return [];
}

// --------------------------------------------------------
// EVENTOS DO WHATSAPP
// --------------------------------------------------------

client.on('qr', async qr => {
    console.log('\n📱 ESCANEIE O QR CODE NO SEU WHATSAPP:\n');
    qrcodeTerminal.generate(qr, { small: true });

    // Envia a imagem do QR Code diretamente para o Telegram (essencial para VPS / Oracle Cloud!)
    try {
        const buffer = await QRCode.toBuffer(qr);
        const chatIdDestino = config.TELEGRAM_ADMIN_CHAT_ID || config.TELEGRAM_PARCEIRO_CHAT_ID;
        await telegram.enviarFoto(
            chatIdDestino,
            buffer.toString('base64'),
            'image/png',
            '📱 <b>CONEXÃO DO RADAR NECESSÁRIA:</b>\nAbra o WhatsApp > Aparelhos Conectados > Conectar um aparelho e aponte a câmera para este QR Code!'
        );
        console.log('📲 Imagem do QR Code enviada para o Telegram com sucesso!');
    } catch (e) {
        console.warn('⚠️ Falha ao enviar QR Code para o Telegram:', e.message);
    }
});

client.on('ready', async () => {
    console.log('\n========================================================');
    console.log('✅ WHATSAPP CONECTADO COM SUCESSO!');
    console.log('🤖 Ativando escuta de comandos no Telegram...');

    // Ativa escuta de comandos no Telegram (/status, /buscar, /liberar, /admin)
    telegram.iniciarPollingComandos(database);

    console.log('🔎 Mapeando grupos autorizados...');
    try {
        const chats = await carregarChatsComRetry(10, 5000);
        const chatsAutorizados = [];

        console.log(`\n📋 TOTAL DE CONVERSAS IDENTIFICADAS: ${chats.length}`);
        for (const chat of chats) {
            if (chat.isGroup) {
                const monitorado = ehGrupoMonitorado(chat.name);
                console.log(`  ${monitorado ? '⭐ [MONITORADO]' : '⚪ [OUTRO GRUPO]'} "${chat.name}" (ID: ${chat.id._serialized})`);
                if (monitorado) {
                    gruposPermitidosMap.set(chat.id._serialized, chat.name);
                    chatsAutorizados.push(chat);
                }
            }
        }

        if (chatsAutorizados.length === 0) {
            console.log('ℹ️ Grupos de perfumaria serão vinculados automaticamente conforme novas mensagens chegarem.');
        } else {
            console.log(`\n🎯 Total de grupos monitorando ativamente: ${chatsAutorizados.length}`);
            // Sincroniza histórico recente dos grupos autorizados
            await sincronizarHistoricoGrupos(client, chatsAutorizados);
        }

    } catch (erro) {
        console.warn('ℹ️ Inicialização de lista de grupos em segundo plano:', erro.message);
    }

    console.log('========================================================');
    console.log('👀 RADAR EM TEMPO REAL OPERANDO!\n');

    // Ativar Snipers de plataformas externas (OLX, Enjoei, Mercado Livre)
    setTimeout(() => {
        sniperOlx.iniciar(35);
        sniperEnjoei.iniciar(45);
        sniperMl.iniciar(40);
        console.log('🎯 Snipers externos ativados: OLX (35s), Enjoei (45s), Mercado Livre (40s)');
    }, 5000); // aguarda 5s para WhatsApp estabilizar
});

client.on('auth_failure', erro => {
    console.error('❌ ERRO DE AUTENTICAÇÃO WHATSAPP:', erro);
});

client.on('disconnected', motivo => {
    console.warn('⚠️ WHATSAPP DESCONECTADO:', motivo);
});

// --------------------------------------------------------
// UTILITÁRIO: EXTRAÇÃO ROBUSTA DE MÍDIA COM RETRY E THUMBNAIL
// --------------------------------------------------------
async function extrairFotoDeMensagem(msg) {
    if (!msg) return null;

    const ehTipoImagem = msg.hasMedia ||
                         msg.type === 'image' ||
                         msg.type === 'album' ||
                         (msg._data && (msg._data.mimetype || '').startsWith('image/')) ||
                         (msg._data && (msg._data.type || '') === 'image') ||
                         (msg._data && Boolean(msg._data.directPath)) ||
                         (msg._data && Boolean(msg._data.mediaKey));

    if (!ehTipoImagem) return null;

    // Normaliza id._serialized caso venha como id.$1
    if (msg.id && !msg.id._serialized) {
        if (msg.id.$1) {
            msg.id._serialized = msg.id.$1;
        } else if (msg.id.fromMe !== undefined && msg.id.remote && msg.id.id) {
            msg.id._serialized = `${msg.id.fromMe}_${msg.id.remote}_${msg.id.id}`;
        }
    }

    // 1. Tenta baixar via downloadMedia (4 tentativas com delay progressivo)
    for (let i = 1; i <= 4; i++) {
        try {
            msg.hasMedia = true;
            const media = await msg.downloadMedia();
            if (media && media.data) {
                // Valida o tamanho: base64 de uma foto real tem pelo menos ~10KB (13000 chars)
                // Thumbnails do WhatsApp costumam ter menos de 5000 chars
                const tamanhoEstimado = media.data.length * 0.75; // bytes aproximados
                if (tamanhoEstimado > 5000) {
                    const mime = media.mimetype || 'image/jpeg';
                    console.log(`📸 [FOTO OK] downloadMedia sucesso (tentativa ${i}): ~${Math.round(tamanhoEstimado/1024)}KB`);
                    return {
                        data: media.data,
                        mimetype: mime.startsWith('image/') ? mime : 'image/jpeg',
                        filename: media.filename || 'foto.jpg'
                    };
                } else {
                    console.log(`⚠️ [FOTO THUMBNAIL] Imagem muito pequena (~${Math.round(tamanhoEstimado/1024)}KB), tentando novamente...`);
                }
            }
        } catch (e) {
            console.log(`⏳ [FOTO RETRY ${i}/4] ${e.message || e}`);
        }
        // Delay progressivo: 1.5s, 3s, 5s entre tentativas
        const delays = [1500, 3000, 5000];
        if (i < 4) {
            await new Promise(r => setTimeout(r, delays[i - 1] || 3000));
        }
    }

    // 2. Fallback de imagem embutida no payload do WhatsApp Web (_data.body)
    // ATENÇÃO: _data.body pode ser thumbnail de baixíssima qualidade (<5KB)
    // Só usar se o buffer for grande o suficiente para ser foto real
    if (msg._data && typeof msg._data.body === 'string' && msg._data.body.length > 6700) {
        let rawData = msg._data.body;
        let mime = msg._data.mimetype || 'image/jpeg';
        const tamanhoBytes = rawData.length * 0.75;

        if (rawData.startsWith('data:image/')) {
            const parts = rawData.split(';base64,');
            mime = parts[0].replace('data:', '') || mime;
            rawData = parts[1];
            if (rawData && rawData.length * 0.75 > 5000) {
                console.log(`📸 [FOTO BODY] Imagem embutida via data-url (~${Math.round(rawData.length * 0.75 / 1024)}KB)`);
                return { data: rawData, mimetype: mime, filename: 'foto_whatsapp.jpg' };
            }
        } else if (
            (rawData.startsWith('/9j/') || rawData.startsWith('iVBOR') || rawData.startsWith('UklGR')) &&
            tamanhoBytes > 5000
        ) {
            console.log(`📸 [FOTO BODY] Imagem embutida via _data.body (~${Math.round(tamanhoBytes/1024)}KB)`);
            return {
                data: rawData,
                mimetype: mime.startsWith('image/') ? mime : 'image/jpeg',
                filename: 'foto_whatsapp.jpg'
            };
        }
    }

    console.log('⚠️ [FOTO] Não foi possível extrair foto em boa qualidade desta mensagem.');
    return null;
}

// --------------------------------------------------------
// BUFFER DE ANÚNCIOS: AGRUPAMENTO DE FOTOS E ÁLBUNS
// --------------------------------------------------------
const bufferAnunciosPendentes = new Map();
const ultimosAnunciosDisparados = new Map(); // chave -> { itemSalvo, timestamp }

async function dispararAnuncioConsolidado(chave) {
    const entry = bufferAnunciosPendentes.get(chave);
    if (!entry) return;
    bufferAnunciosPendentes.delete(chave);

    try {
        const { origem, nomeGrupo, autorTelefone, autorNome, msgId, texto, fotos, mensagensRefs, ehTipoImagem } = entry;

        // Validação final de contato bloqueado
        if (security.ehNumeroBloqueado(autorTelefone, texto)) {
            console.log(`🚫 [CONTATO BLOQUEADO] Descartando anúncio de: ${autorTelefone}`);
            return;
        }

        // Momento perfeito: já se passaram 6 a 8 segundos desde o anúncio!
        // Todas as mídias pendentes já foram processadas internamente pelo WhatsApp Web.
        if (mensagensRefs && mensagensRefs.length > 0) {
            for (const mRef of mensagensRefs) {
                const ehMidia = mRef.hasMedia || mRef.type === 'image' || mRef.type === 'album' ||
                                (mRef._data && (mRef._data.mimetype || '').startsWith('image/')) ||
                                (mRef._data && Boolean(mRef._data.directPath));
                if (ehMidia) {
                    try {
                        const mediaExtraida = await extrairFotoDeMensagem(mRef);
                        if (mediaExtraida && mediaExtraida.data) {
                            const jaExiste = fotos.some(f => f.data.substring(0, 50) === mediaExtraida.data.substring(0, 50));
                            if (!jaExiste) {
                                fotos.push(mediaExtraida);
                            }
                        }
                    } catch (e) {
                        console.warn(`⚠️ [FOTO BUFFER] Falha ao extrair foto de mensagem:`, e.message);
                    }
                }
            }
        }

        const classificacao = matcher.analisarMensagem(texto);
        const dadosExtraidos = matcher.extrairDados(texto);

        // Se for bate-papo neutro sem nenhuma foto e sem intenção de compra/venda, descarta
        if (classificacao.tipo === 'NEUTRO' && fotos.length === 0 && !ehTipoImagem) {
            return;
        }

        // Define tipo final:
        // - Se tem classificação clara, usa ela
        // - Se é só foto sem texto, marca como FOTO_SEMTEXTO para notificação especial
        const apenasImagem = ehTipoImagem && (!texto || texto === '[Foto de perfume / desapego]');
        const tipoFinal = classificacao.tipo !== 'NEUTRO' ? classificacao.tipo
            : apenasImagem ? 'FOTO_SEMTEXTO'
            : 'VENDA';

        // Texto descritivo para caso de foto sem texto
        const textoItem = texto || (ehTipoImagem ? '📸 Foto enviada sem texto — verifique manualmente se é procura ou venda!' : '[Sem descrição]');

        // Normalização completa do telefone e link wa.me
        const telInfo = security.formatarTelefoneWhatsapp(autorTelefone, entry.rawAuthor);

        const item = {
            msgId: msgId,
            autor: autorNome,
            autorTelefone: telInfo.numeroLimpo || autorTelefone,
            telefoneFormatado: telInfo.formatado,
            linkWhatsapp: telInfo.linkWpp,
            grupoId: origem,
            grupoNome: nomeGrupo,
            texto: textoItem,
            tipo: tipoFinal === 'FOTO_SEMTEXTO' ? 'VENDA' : tipoFinal,
            apenasImagem: apenasImagem,
            perfume: dadosExtraidos.perfume,
            preco: dadosExtraidos.preco,
            volume: dadosExtraidos.volume,
            custoPorMl: dadosExtraidos.custoPorMl,
            oportunidadeDecant: dadosExtraidos.oportunidadeDecant,
            analiseMercado: dadosExtraidos.analiseMercado,
            temFoto: fotos.length > 0,
            fotos: fotos,
            totalFotos: fotos.length
        };

        // Auditoria de Segurança Anti-Golpe
        item.auditoriaSeguranca = security.analisarSeguranca(item, fotos[0] || null);

        console.log('\n========================================================');
        console.log(`📩 [${tipoFinal}] ANÚNCIO IDENTIFICADO EM: ${nomeGrupo}`);
        console.log(`👤 Autor: ${autorNome} (${telInfo.formatado})`);
        if (dadosExtraidos.perfume) console.log(`📦 Perfume: ${dadosExtraidos.perfume}`);
        if (dadosExtraidos.preco) console.log(`💰 Preço: R$ ${dadosExtraidos.preco}`);
        if (item.analiseMercado?.selo) console.log(`📊 Mercado: ${item.analiseMercado.selo}`);
        console.log(`📸 Fotos anexadas: ${fotos.length} foto(s)`);
        console.log('========================================================\n');

        // Armazena no Banco Local
        let itemSalvo = null;
        if (tipoFinal === 'VENDA') {
            itemSalvo = database.adicionarOferta(item);
        } else {
            itemSalvo = database.adicionarDemanda(item);
        }

        if (!itemSalvo) return;

        // Registra no cache recente (últimos 60s) para anexar fotos complementares tardias
        ultimosAnunciosDisparados.set(chave, { itemSalvo, timestamp: Date.now() });

        // Envia Notificação Completa para o Grupo do Telegram (com todas as fotos e links)
        await telegram.notificarAnuncioParceiro(itemSalvo, fotos);
        await telegram.notificarAnuncioAdmin(itemSalvo, fotos);

        // Motor de Arbitragem Cruzada (Matching) - Dispara oportunidades no grupo!
        const matches = matcher.processarCruzamento(itemSalvo, tipoFinal);
        if (matches && matches.length > 0) {
            for (const m of matches) {
                console.log(`🎯 MATCH DE ARBITRAGEM ENCONTRADO! Perfume: ${m.perfume}`);
                await telegram.notificarMatchArbitragem(m);
            }
        }

    } catch (erro) {
        console.error('❌ Erro no disparo de anúncio consolidado:', erro);
    }
}

// --------------------------------------------------------
// PROCESSAMENTO DE MENSAGENS EM TEMPO REAL
// --------------------------------------------------------

client.on('message_create', async msg => {
    try {
        const origem = msg.from || '';

        // Apenas mensagens de grupos
        if (!origem.endsWith('@g.us')) {
            return;
        }

        const rawAuthor = msg.author || msg._data?.participant || '';
        const autorTelefone = rawAuthor ? rawAuthor.split('@')[0] : '';
        const autorNome = msg._data?.notifyName || autorTelefone || 'Participante';
        const texto = msg.body?.trim() || '';

        // 0. BLOQUEIO RIGOROSO DE CONTATOS PROIBIDOS (+55 11 98026-6593 etc)
        if (security.ehNumeroBloqueado(autorTelefone, texto) ||
            (rawAuthor && security.ehNumeroBloqueado(rawAuthor, texto))) {
            console.log(`🚫 [CONTATO BLOQUEADO] Descartando mensagem/anúncio do número bloqueado: ${autorTelefone}`);
            return;
        }

        // 1. Checa se o grupo é autorizado
        let nomeGrupo = gruposPermitidosMap.get(origem);

        if (!nomeGrupo) {
            try {
                const chat = await msg.getChat();
                if (chat && chat.isGroup) {
                    nomeGrupo = chat.name || 'Grupo de Perfumes';
                    gruposPermitidosMap.set(origem, nomeGrupo);
                    database.registrarGrupo(origem, nomeGrupo, chat.participants || []);
                    console.log(`\n⭐ GRUPO REGISTRADO: "${nomeGrupo}" (ID: ${origem})`);
                }
            } catch (e) {
                nomeGrupo = msg._data?.chat?.name || 'Grupo de Perfumes';
                gruposPermitidosMap.set(origem, nomeGrupo);
            }
        }

        // 2. Identifica se a mensagem contém imagem ou mídia
        const ehTipoImagem = msg.hasMedia ||
            msg.type === 'image' ||
            msg.type === 'album' ||
            (msg._data && (msg._data.mimetype || '').startsWith('image/')) ||
            (msg._data && Boolean(msg._data.directPath)) ||
            (msg._data && Boolean(msg._data.mediaKey));

        // 3. Classificação preliminar de texto
        const classificacao = matcher.analisarMensagem(texto);

        const chave = `${origem}_${autorTelefone}`;
        const pendente = bufferAnunciosPendentes.get(chave);

        // Se for bate-papo comum neutro sem imagem e sem anúncio pendente, descarta
        if (classificacao.tipo === 'NEUTRO' && !ehTipoImagem && !pendente) {
            return;
        }

        console.log(`📩 [MSG DETECTADA] Grupo: "${nomeGrupo}" | Autor: ${autorNome} (+${autorTelefone}) | Tipo: ${ehTipoImagem ? 'Imagem' : 'Texto'}`);

        // Se for foto avulsa que chegou logo APÓS o anúncio ter sido disparado (últimos 60s)
        if (ehTipoImagem && !pendente) {
            const adRecente = ultimosAnunciosDisparados.get(chave);
            if (adRecente && (Date.now() - adRecente.timestamp) < 60000) {
                console.log(`📸 [FOTO TARDIA] Foto recebida para o anúncio recente ${adRecente.itemSalvo.id} de ${autorNome}! Baixando...`);
                const mediaTardia = await extrairFotoDeMensagem(msg);
                if (mediaTardia && mediaTardia.data) {
                    const legendaExtra = `📸 <b>FOTO ADICIONAL DO ANÚNCIO:</b> <b>${adRecente.itemSalvo.perfume || 'Perfume'}</b>\n💰 <b>Preço:</b> R$ ${adRecente.itemSalvo.preco || 'A negociar'}\n🆔 Código: <code>${adRecente.itemSalvo.id}</code>`;
                    await telegram.enviarFoto(config.TELEGRAM_PARCEIRO_CHAT_ID, mediaTardia, mediaTardia.mimetype, legendaExtra);
                    if (telegram.adminChatId && String(telegram.adminChatId) !== String(config.TELEGRAM_PARCEIRO_CHAT_ID)) {
                        await telegram.enviarFoto(telegram.adminChatId, mediaTardia, mediaTardia.mimetype, legendaExtra);
                    }
                    return;
                }
            }
        }

        // 4. Agrupamento no buffer (acumula referências de fotos e concatena textos)
        if (pendente) {
            clearTimeout(pendente.timer);
            pendente.mensagensRefs.push(msg);

            if (ehTipoImagem) {
                pendente.ehTipoImagem = true;
                console.log(`📸 Imagem adicional anexada ao buffer de ${autorNome} (Total mídias/mensagens: ${pendente.mensagensRefs.length})`);
            }

            if (texto) {
                if (!pendente.texto || pendente.texto === '[Foto de perfume / desapego]') {
                    pendente.texto = texto;
                } else if (!pendente.texto.includes(texto)) {
                    pendente.texto += '\n' + texto;
                }
            }

            // Aguarda 6s por mais mensagens/fotos antes de consolidar
            pendente.timer = setTimeout(() => dispararAnuncioConsolidado(chave), 6000);
            return;
        }

        // Novo anúncio detectado: inicia buffer de 8 a 10 segundos para permitir download interno pelo WhatsApp
        // Imagens com álbum precisam de mais tempo para todas as fotos chegarem e serem decriptadas
        const tempoEspera = ehTipoImagem ? (texto ? 8000 : 10000) : 6000;
        const novoEntry = {
            origem,
            nomeGrupo,
            rawAuthor,
            autorTelefone,
            autorNome,
            msgId: msg.id?._serialized,
            texto: texto || (ehTipoImagem ? '[Foto de perfume / desapego]' : ''),
            fotos: [],
            mensagensRefs: [msg],
            ehTipoImagem,
            timer: null
        };

        novoEntry.timer = setTimeout(() => dispararAnuncioConsolidado(chave), tempoEspera);
        bufferAnunciosPendentes.set(chave, novoEntry);

    } catch (erro) {
        console.error('❌ Erro no processamento de mensagem:', erro);
    }
});

// --------------------------------------------------------
// INICIAR RADAR
// --------------------------------------------------------
console.log('🚀 INICIANDO RADAR DE PERFUMES 2.0...');
client.initialize();