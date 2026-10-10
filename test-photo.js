const telegram = require('./telegram');
const config = require('./config');

async function testarFoto() {
    // 1x1 transparent PNG in base64
    const base64Pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    console.log('Testando enviarFoto para:', config.TELEGRAM_PARCEIRO_CHAT_ID);
    const res = await telegram.enviarFoto(
        config.TELEGRAM_PARCEIRO_CHAT_ID,
        base64Pixel,
        'image/png',
        '📸 <b>TESTE DE FOTO DO RADAR</b>\nValidando envio de imagem para o Telegram!',
        null
    );
    console.log('Resultado envio de foto:', JSON.stringify(res, null, 2));
}

testarFoto();
