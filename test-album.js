const telegram = require('./telegram');
const config = require('./config');

async function testarAlbum() {
    console.log('Testando telegram.enviarAlbum para:', config.TELEGRAM_PARCEIRO_CHAT_ID);

    // 2 imagens de teste válidas (URLs)
    const fotos = [
        'https://picsum.photos/400/400',
        'https://picsum.photos/401/401'
    ];

    const replyMarkup = {
        inline_keyboard: [
            [{ text: '🛎️ Solicitar Contato', callback_data: 'solicitar_teste' }]
        ]
    };

    const res = await telegram.enviarAlbum(
        config.TELEGRAM_PARCEIRO_CHAT_ID,
        fotos,
        '📸 <b>TESTE DE ÁLBUM MULTI-FOTOS</b>\nTodas as fotos do vendedor agrupadas em uma só postagem!',
        replyMarkup
    );

    console.log('Resultado enviarAlbum:', res?.ok ? '✅ ENVIADO COM SUCESSO!' : res);
}

testarAlbum();
