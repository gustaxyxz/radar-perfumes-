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

    // 1. Grupos configurados pelo nome exato (ignorando case e acentos)
    for (const g of config.GRUPOS_MONITORADOS) {
        if (normalizarTexto(g) === norm) return true;
    }

    // 2. Alias / fragmentos de nome flexível (para quando o grupo muda emoji/pontuação)
    if (config.GRUPOS_ALIAS && Array.isArray(config.GRUPOS_ALIAS)) {
        for (const alias of config.GRUPOS_ALIAS) {
            if (norm.includes(normalizarTexto(alias))) return true;
        }
    }

    // 3. Termos-chave obrigatórios de perfumaria (NÃO aceita qualquer grupo)
    const termosChave = [
        'locus', 'espirito', 'perfumad', 'perfume', 'desapego', 'decant',
        'nicho', 'fragranc', 'parfum', 'fracionado'
    ];
    for (const t of termosChave) {
        if (norm.includes(t)) return true;
    }

    // Grupo não reconhecido como de perfumaria — IGNORAR
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

    // 1. Tenta baixar via downloadMedia (5 tentativas com delay progressivo)
    for (let i = 1; i <= 5; i++) {
        try {
            msg.hasMedia = true; // Força flag para evitar abort precoce no downloadMedia
            const media = await msg.downloadMedia();
            if (media && media.data && media.data.length > 10) {
                // Aceita qualquer tipo com data, mas normaliza MIME para imagem
                const mime = media.mimetype || 'image/jpeg';
                return {
                    data: media.data,
                    mimetype: mime.startsWith('image/') ? mime : 'image/jpeg',
                    filename: media.filename || 'foto.jpg'
                };
            }
        } catch (e) {
            console.warn(`⚠️ [FOTO] Tentativa ${i}/5 falhou: ${e.message}`);
        }
        // Delay progressivo: 1.5s, 2s, 2.5s, 3s entre tentativas
        if (i < 5) {
            await new Promise(r => setTimeout(r, 1000 + (i * 500)));
        }
    }

    // 2. Fallback: thumbnail/imagem embutida diretamente no payload do WhatsApp Web (_data.body)
    // Existe em ~80% dos casos onde o download falha — é a versão comprimida da imagem
    if (msg._data && msg._data.body && typeof msg._data.body === 'string' && msg._data.body.length > 50) {
        console.log('📸 [FOTO] Usando thumbnail/imagem embutida do WhatsApp Web (_data.body)!');
        let rawData = msg._data.body;
        let mime = msg._data.mimetype || 'image/jpeg';
        if (rawData.includes(';base64,')) {
            const parts = rawData.split(';base64,');
            mime = parts[0].replace('data:', '') || mime;
            rawData = parts[1];
        }
        return {
            mimetype: mime.startsWith('image/') ? mime : 'image/jpeg',
            data: rawData,
            filename: 'foto_whatsapp.jpg'
        };
    }

    console.warn('⚠️ [FOTO] Todas as tentativas falharam — mensagem será enviada sem foto.');
    return null;
}

// --------------------------------------------------------
// BUFFER DE ANÚNCIOS: AGRUPAMENTO DE FOTOS E ÁLBUNS
// --------------------------------------------------------
// Evita que anúncios cheguem sem fotos quando o vendedor envia foto e texto separados
const bufferAnunciosPendentes = new Map();
const ultimosAnunciosDisparados = new Map(); // chave -> { itemSalvo, timestamp }

async function dispararAnuncioConsolidado(chave) {
    const entry = bufferAnunciosPendentes.get(chave);
    if (!entry) return;
    bufferAnunciosPendentes.delete(chave);

    try {
        const { origem, nomeGrupo, autorTelefone, autorNome, msgId, texto, fotos, ehTipoImagem, msgRef } = entry;

        // Validação final de contato bloqueado
        if (security.ehNumeroBloqueado(autorTelefone, texto)) {
            console.log(`🚫 [CONTATO BLOQUEADO] Descartando anúncio bufferizado de: ${autorTelefone}`);
            return;
        }

        // Última tentativa de foto: se a mensagem tem mídia mas ainda não baixamos, tenta agora
        if (ehTipoImagem && fotos.length === 0 && msgRef) {
            try {
                console.log(`📸 [FOTO FINAL] Última tentativa de download para ${autorNome}...`);
                const mediaFinal = await extrairFotoDeMensagem(msgRef);
                if (mediaFinal && mediaFinal.data) {
                    fotos.push(mediaFinal);
                    console.log(`✅ [FOTO FINAL] Foto obtida na última tentativa!`);
                }
            } catch(e) {
                console.warn(`⚠️ [FOTO FINAL] Falha definitiva no download: ${e.message}`);
            }
        }

        const classificacao = matcher.analisarMensagem(texto);
        const dadosExtraidos = matcher.extrairDados(texto);

        // Se for bate-papo neutro e sem fotos, descarta para não poluir
        if (classificacao.tipo === 'NEUTRO' && fotos.length === 0 && !ehTipoImagem) {
            return;
        }

        const tipoFinal = classificacao.tipo !== 'NEUTRO' ? classificacao.tipo : 'VENDA';

        const item = {
            msgId: msgId,
            autor: autorNome,
            autorTelefone: autorTelefone,
            grupoId: origem,
            grupoNome: nomeGrupo,
            texto: texto || '[Foto de desapego]',
            tipo: tipoFinal,
            perfume: dadosExtraidos.perfume,
            preco: dadosExtraidos.preco,
            volume: dadosExtraidos.volume,
            custoPorMl: dadosExtraidos.custoPorMl,
            oportunidadeDecant: dadosExtraidos.oportunidadeDecant,
            temFoto: fotos.length > 0,
            fotos: fotos,
            totalFotos: fotos.length
        };

        // Auditoria de Segurança e Prevenção Anti-Golpe
        item.auditoriaSeguranca = security.analisarSeguranca(item, fotos[0] || null);

        console.log('\n========================================================');
        console.log(`📩 [${tipoFinal}] ANÚNCIO DETECTADO EM: ${nomeGrupo}`);
        console.log(`👤 Autor: ${autorNome} (+${autorTelefone})`);
        if (dadosExtraidos.perfume) console.log(`📦 Perfume: ${dadosExtraidos.perfume}`);
        if (dadosExtraidos.preco) console.log(`💰 Preço: R$ ${dadosExtraidos.preco}`);
        if (fotos.length > 0) console.log(`📸 ${fotos.length} foto(s) anexada(s) (Álbum / Envio unificado)!`);
        console.log(`🛡️ Auditoria: ${item.auditoriaSeguranca.selo} (Score: ${item.auditoriaSeguranca.score}/100)`);
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

        // Envia Notificações para o Telegram (Álbum com fotos agrupadas ou Foto única)
        await telegram.notificarAnuncioParceiro(itemSalvo, fotos);
        await telegram.notificarAnuncioAdmin(itemSalvo, fotos);

        // Motor de Arbitragem Cruzada (Matching)
        const matches = matcher.processarCruzamento(itemSalvo, tipoFinal);
        if (matches && matches.length > 0) {
            for (const m of matches) {
                console.log(`🎯 MATCH DE ARBITRAGEM ENCONTRADO! Perfume: ${m.perfume} | Segurança: ${m.seguranca.nivel}`);
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

        const rawAuthor = msg.author || msg.from || '';
        const autorTelefone = rawAuthor.split('@')[0];
        const autorNome = msg._data?.notifyName || autorTelefone || 'Participante';
        const texto = msg.body?.trim() || '';

        // 0. BLOQUEIO RIGOROSO DE CONTATOS PROIBIDOS (+55 11 98026-6593 etc)
        if (security.ehNumeroBloqueado(autorTelefone, texto) ||
            security.ehNumeroBloqueado(rawAuthor, texto) ||
            security.ehNumeroBloqueado(msg._data?.participant, texto) ||
            security.ehNumeroBloqueado(msg.from, texto)) {
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

        // 2. Extrai mídia se for imagem (com retry e fallback para thumbnail embutida)
        //    NOTA: hasMedia pode chegar false no evento message_create mesmo sendo imagem;
        //    forçamos a tentativa baseada em tipo/directPath também.
        const ehTipoImagem = msg.hasMedia ||
            msg.type === 'image' ||
            msg.type === 'album' ||
            (msg._data && (msg._data.mimetype || '').startsWith('image/')) ||
            (msg._data && Boolean(msg._data.directPath));

        let media = ehTipoImagem ? await extrairFotoDeMensagem(msg) : null;
        let ehImagem = !!(media && media.data);

        // Ignora mensagens vazias que não possuem imagem
        if (!texto && !ehImagem) {
            // Se parece ter imagem mas download falhou, agendamos tentativa tardia
            if (ehTipoImagem) {
                console.log(`📸 [FOTO PENDENTE] Download falhou agora mas a mensagem tem mídia. Tentativa tardia agendada...`);
            } else {
                return;
            }
        }

        console.log(`📩 [MSG DETECTADA] Grupo: "${nomeGrupo}" | Autor: ${autorNome} (+${autorTelefone}) | Foto: ${ehImagem ? 'Sim' : (ehTipoImagem ? 'Baixando...' : 'Não')}`);

        const chave = `${origem}_${autorTelefone}`;
        const pendente = bufferAnunciosPendentes.get(chave);

        // Se for foto avulsa que chegou logo APÓS o anúncio ter sido disparado (últimos 60s)
        if (ehImagem && !pendente) {
            const adRecente = ultimosAnunciosDisparados.get(chave);
            if (adRecente && (Date.now() - adRecente.timestamp) < 60000) {
                console.log(`📸 [FOTO TARDIA] Foto recebida para o anúncio recente ${adRecente.itemSalvo.id} de ${autorNome}!`);
                const legendaExtra = `📸 <b>FOTO ADICIONAL DO ANÚNCIO:</b> <b>${adRecente.itemSalvo.perfume || 'Perfume'}</b>\n💰 <b>Preço:</b> R$ ${adRecente.itemSalvo.preco || 'A negociar'}\n🆔 Código: <code>${adRecente.itemSalvo.id}</code>`;
                await telegram.enviarFoto(config.TELEGRAM_PARCEIRO_CHAT_ID, media, media.mimetype, legendaExtra);
                if (config.TELEGRAM_ADMIN_CHAT_ID) {
                    await telegram.enviarFoto(config.TELEGRAM_ADMIN_CHAT_ID, media, media.mimetype, legendaExtra);
                }
                return;
            }
        }

        // 3. Classificação preliminar
        const classificacao = matcher.analisarMensagem(texto);

        // Se for bate-papo comum neutro sem imagem e sem anúncio pendente
        if (classificacao.tipo === 'NEUTRO' && !ehImagem && !pendente) {
            return;
        }

        // 4. Agrupamento no buffer (conecta texto + fotos sequenciais)
        if (pendente) {
            clearTimeout(pendente.timer);

            if (ehImagem && media) {
                pendente.fotos.push(media);
                console.log(`📸 Foto adicional agrupada ao anúncio de ${autorNome} (Total: ${pendente.fotos.length})`);
            }

            if (texto) {
                if (!pendente.texto || pendente.texto === '[Foto de desapego]') {
                    pendente.texto = texto;
                } else if (!pendente.texto.includes(texto)) {
                    pendente.texto += '\n' + texto;
                }
            }

            // Aguarda 6s por mais fotos antes de disparar
            pendente.timer = setTimeout(() => dispararAnuncioConsolidado(chave), 6000);
            return;
        }

        // Novo anúncio detectado: inicia buffer de 6 a 8 segundos para coletar fotos anexas
        // Se a mensagem tem tipo imagem mas o download falhou agora, tentamos novamente no meio do buffer
        const tempoEspera = (ehTipoImagem && !texto) ? 8000 : 6000;
        const novoEntry = {
            origem,
            nomeGrupo,
            rawAuthor,
            autorTelefone,
            autorNome,
            msgId: msg.id?._serialized,
            msgRef: msg, // guarda referência para retentativa de download
            texto: texto || (ehImagem ? '[Foto de desapego]' : ''),
            fotos: ehImagem && media ? [media] : [],
            ehTipoImagem,
            timer: null
        };

        // Se tem tipo imagem mas download falhou agora, agenda retentativa em 3s durante o buffer
        if (ehTipoImagem && !ehImagem) {
            novoEntry.timer = setTimeout(async () => {
                const entry = bufferAnunciosPendentes.get(chave);
                if (!entry) return;
                console.log(`📸 [RETENTATIVA FOTO] Tentando baixar mídia novamente para ${autorNome}...`);
                try {
                    const mediaRetry = await extrairFotoDeMensagem(msg);
                    if (mediaRetry && mediaRetry.data && entry.fotos.length === 0) {
                        entry.fotos.push(mediaRetry);
                        console.log(`✅ [RETENTATIVA FOTO] Foto obtida com sucesso na retentativa!`);
                    }
                } catch(e) {}
                clearTimeout(entry.timer);
                entry.timer = setTimeout(() => dispararAnuncioConsolidado(chave), tempoEspera - 3000);
            }, 3000);
        } else {
            novoEntry.timer = setTimeout(() => dispararAnuncioConsolidado(chave), tempoEspera);
        }

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