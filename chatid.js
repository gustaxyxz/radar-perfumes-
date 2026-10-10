const TOKEN = '8633603260:AAG3ZAHGBZrOeyHwDXp55DjcjZSs_JqmuXM';

async function main() {
    console.log('✅ Bot iniciado');
    console.log('⏳ Aguardando mensagem por até 50 segundos...\n');

    const webhookResp = await fetch(
        `https://api.telegram.org/bot${TOKEN}/getWebhookInfo`
    );

    const webhook = await webhookResp.json();

    console.log('Webhook:', webhook.result?.url || 'nenhum');

    const response = await fetch(
        `https://api.telegram.org/bot${TOKEN}/getUpdates?timeout=50`
    );

    const data = await response.json();

    console.log('\nResposta:');
    console.log(JSON.stringify(data, null, 2));

    if (!data.result || data.result.length === 0) {
        console.log('\n❌ Nenhuma mensagem chegou.');
        return;
    }

    for (const update of data.result) {
        if (update.message) {
            console.log('\n======================');
            console.log('Grupo:', update.message.chat.title);
            console.log('Tipo:', update.message.chat.type);
            console.log('CHAT ID:', update.message.chat.id);
            console.log('Mensagem:', update.message.text);
            console.log('======================');
        }

        if (update.my_chat_member) {
            console.log('\nBot no grupo:');
            console.log('Grupo:', update.my_chat_member.chat.title);
            console.log('CHAT ID:', update.my_chat_member.chat.id);
        }
    }
}

main().catch(console.error);