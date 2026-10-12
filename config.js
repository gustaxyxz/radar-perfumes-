// ========================================================
// CONFIGURAÇÃO CENTRAL DO RADAR DE PERFUMES
// ========================================================

try {
    require('dotenv').config();
} catch (e) {}

module.exports = {
    // --------------------------------------------------------
    // TELEGRAM
    // --------------------------------------------------------
    TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN || '8633603260:AAG3ZAHGBZrOeyHwDXp55DjcjZSs_JqmuXM',

    // Canal do parceiro / Operação (onde chegam os anúncios com fotos, mas CONTATO OCULTO)
    TELEGRAM_PARCEIRO_CHAT_ID: process.env.TELEGRAM_PARCEIRO_CHAT_ID || '-5251221555',

    // Chat privado do Administrador / Dono (onde chegam contatos completos e alertas de arbitragem cruzada)
    TELEGRAM_ADMIN_CHAT_ID: process.env.TELEGRAM_ADMIN_CHAT_ID || '',

    // --------------------------------------------------------
    // GRUPOS MONITORADOS DO WHATSAPP (WHITELIST ESTRITA)
    // --------------------------------------------------------
    // Apenas mensagens desses grupos serão processadas pelo radar.
    GRUPOS_MONITORADOS: [
        'PERFUMADOS BRASIL - Desapego🇧🇷 1.0',
        '⭐Espírito Nicho!',
        '⭐Espírito Designer!',
        'Locus 2.0 Desapego ⚓️',
        'Locus Bate-Papo',
        '⚓️ Locus Bate-Papo ⚓️',
        'perfumes'   // grupo de teste isolado (match exato apenas)
    ],

    // Palavras-chave ou fragmentos para busca flexível de grupos (caso mudem emojis ou pontuação)
    GRUPOS_ALIAS: [
        'perfumados brasil - desapego',
        'perfumados brasil desapego',
        'espirito nicho',
        'espirito designer',
        'locus 2.0 desapego',
        'locus desapego',
        'locus bate-papo'
        // ATENÇÃO: NUNCA colocar 'perfumes' como alias aqui, para não capturar "Grupo de Perfumes" genérico!
    ],

    // --------------------------------------------------------
    // GRUPOS PROIBIDOS / BLACKLIST EXPLÍCITA
    // --------------------------------------------------------
    // Mensagens destes grupos são sumariamente descartadas sem qualquer processamento
    GRUPOS_BLOQUEADOS: [
        'Diamante GiftCards #11',
        'Diamante GiftCards #12',
        'Diamante GiftCards',
        'CONEXÃO FALCONE 🦅',
        'Conexão Falcone',
        'Falcone',
        'Grupo do Professor! 👨🏻🏫 #1',
        'Grupo do Professor',
        'Grupo de Perfumes', // Grupo genérico bloqueado a pedido do usuário
        '𝙈𝙊𝘾𝙃𝙄𝙇𝘼𝘿𝔼𝘾𝙍𝙄𝘼𝙉𝘾̧𝘼🎒 vendas',
        'mochiladecrianca',
        'TUDO COM 50% OFF,',
        'TUDO COM 50% OFF',
        '🅲🆄🅿️🆄🅻🅰️ 🅱️🅸🆁🅾️ 🅵🅰️🅺🅴🆂',
        'cupula biro fakes',
        'biro fakes'
    ],

    // --------------------------------------------------------
    // HISTÓRICO RETROATIVO
    // --------------------------------------------------------
    // Ao iniciar, puxar mensagens antigas dos grupos para alimentar o banco de dados
    SINCRONIZAR_HISTORICO_AO_INICIAR: true,
    LIMITE_MENSAGENS_HISTORICO: 100, // quantas mensagens antigas ler por grupo (50 a 150 é o ideal)

    // --------------------------------------------------------
    // REGRAS DE ARBITRAGEM E SEGURANÇA
    // --------------------------------------------------------
    // Percentual ou margem mínima sugerida para arbitragem
    MARGEM_MINIMA_LUCRO_REAIS: 50, // R$ 50 mínimo de spread para compensar

    // --------------------------------------------------------
    // NÚMEROS BLOQUEADOS / IGNORADOS
    // --------------------------------------------------------
    // Mensagens destes números são sumariamente descartadas e nunca enviadas
    NUMEROS_BLOQUEADOS: [
        '5511980266593',
        '551180266593',
        '11980266593',
        '1180266593',
        '980266593',
        '80266593'
    ],

    // --------------------------------------------------------
    // SNIPERS DE PLATAFORMAS EXTERNAS (OLX, ML, ENJOEI)
    // --------------------------------------------------------
    // Chave do ScraperAPI para furar o Cloudflare e bloqueio de Datacenter na Azure
    SCRAPER_API_KEY: process.env.SCRAPER_API_KEY || '9d8dca70619919cfa18ef76c48b2b540',
    get SCRAPER_API_URL() {
        return `https://api.scraperapi.com?api_key=${this.SCRAPER_API_KEY}&country_code=br&url=`;
    },

    // 1. Mercado Livre: Token oficial da API de Desenvolvedor (opcional)
    ML_ACCESS_TOKEN: process.env.ML_ACCESS_TOKEN || '',

    // Ou Proxy direto HTTP/SOCKS5
    HTTP_PROXY_URL: process.env.HTTP_PROXY_URL || ''
};

