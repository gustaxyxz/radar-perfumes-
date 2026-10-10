const telegram = require('./telegram');
const config = require('./config');

async function testarTelegram() {
    console.log('Enviando mensagem para:', config.TELEGRAM_PARCEIRO_CHAT_ID);
    const res = await telegram.enviarMensagem(
        config.TELEGRAM_PARCEIRO_CHAT_ID,
        '🚀 <b>RADAR DE PERFUMES 24/7 ONLINE NA AZURE</b>\n\n' +
        '✅ WhatsApp conectado com sucesso.\n' +
        '🤖 Bot ativo e monitorando grupos em tempo real.\n' +
        '🛡️ Auditoria anti-golpe operando.\n' +
        '🎯 Snipers de plataformas integrados.',
        'HTML'
    );
    console.log('Resultado Telegram:', res?.ok ? 'ENVIADO COM SUCESSO!' : res);
}

testarTelegram();
