// Script para listar todos os grupos em que o WhatsApp está conectado
// Sem reiniciar o client principal, podemos ler pelo chatid.js se existir ou via script
const fs = require('fs');

console.log('Verificando sessões salvas...');
const authFolder = './.wwebjs_auth';
if (fs.existsSync(authFolder)) {
    console.log('Pasta de autenticação existe:', fs.readdirSync(authFolder));
}
