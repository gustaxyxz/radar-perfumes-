// ========================================================
// CONFIGURAÇÃO CENTRAL DO RADAR DE PERFUMES
// ========================================================

module.exports = {
    // --------------------------------------------------------
    // TELEGRAM
    // --------------------------------------------------------
    TELEGRAM_TOKEN: '8633603260:AAG3ZAHGBZrOeyHwDXp55DjcjZSs_JqmuXM',

    // Canal do parceiro / Operação (onde chegam os anúncios com fotos, mas CONTATO OCULTO)
    TELEGRAM_PARCEIRO_CHAT_ID: '-5251221555',

    // Chat privado do Administrador / Dono (onde chegam contatos completos e alertas de arbitragem cruzada)
    // DICA: Você pode colocar o seu ID pessoal do Telegram aqui ou o ID de um grupo VIP só seu.
    // Se deixar vazio (''), os alertas de admin também irão para o TELEGRAM_PARCEIRO_CHAT_ID de forma segura.
    TELEGRAM_ADMIN_CHAT_ID: '',

    // --------------------------------------------------------
    // GRUPOS MONITORADOS DO WHATSAPP
    // --------------------------------------------------------
    // Apenas mensagens desses grupos serão processadas pelo radar.
    GRUPOS_MONITORADOS: [
        'Locus 2.0 Desapego ⚓️',
        '⭐Espírito Designer!',
        'PERFUMADOS BRASIL - Desapego🇧🇷 1.0',
        '⭐Espírito Nicho!',
        '⚓️ Locus Bate-Papo ⚓️'
    ],

    // Palavras-chave ou fragmentos para busca flexível de grupos (caso mudem emojis ou pontuação)
    GRUPOS_ALIAS: [
        'locus 2.0 desapego',
        'locus desapego',
        'espirito designer',
        'perfumados brasil - desapego',
        'perfumados brasil desapego',
        'espirito nicho',
        'locus bate-papo',
        'locus bate papo'
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
    SCRAPER_API_KEY: '9d8dca70619919cfa18ef76c48b2b540',
    SCRAPER_API_URL: 'https://api.scraperapi.com?api_key=9d8dca70619919cfa18ef76c48b2b540&country_code=br&url=',

    // 1. Mercado Livre: Token oficial da API de Desenvolvedor (opcional)
    ML_ACCESS_TOKEN: '',

    // Ou Proxy direto HTTP/SOCKS5
    HTTP_PROXY_URL: ''
};

