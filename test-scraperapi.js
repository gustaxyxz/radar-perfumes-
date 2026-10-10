const apiKey = '9d8dca70619919cfa18ef76c48b2b540';

async function testarScraperAPI() {
    console.log('--- TESTANDO SCRAPERAPI COM MERCADO LIVRE ---');
    try {
        const urlML = `https://api.scraperapi.com?api_key=${apiKey}&country_code=br&url=${encodeURIComponent('https://lista.mercadolivre.com.br/sauvage')}`;
        console.log('Chamando ScraperAPI para ML...');
        const resML = await fetch(urlML);
        console.log('Status ML:', resML.status);
        const textML = await resML.text();
        console.log('Tamanho ML:', textML.length);
        console.log('Contém produtos?', textML.includes('ui-search') || textML.includes('poly-component') || textML.includes('sauvage'));
    } catch (e) {
        console.error('Erro ML:', e.message);
    }

    console.log('\n--- TESTANDO SCRAPERAPI COM OLX ---');
    try {
        const urlOLX = `https://api.scraperapi.com?api_key=${apiKey}&country_code=br&url=${encodeURIComponent('https://www.olx.com.br/brasil?q=sauvage')}`;
        console.log('Chamando ScraperAPI para OLX...');
        const resOLX = await fetch(urlOLX);
        console.log('Status OLX:', resOLX.status);
        const textOLX = await resOLX.text();
        console.log('Tamanho OLX:', textOLX.length);
        console.log('Passou Cloudflare OLX?', !textOLX.includes('challenge') && !textOLX.includes('Attention Required'));
    } catch (e) {
        console.error('Erro OLX:', e.message);
    }

    console.log('\n--- TESTANDO SCRAPERAPI COM ENJOEI ---');
    try {
        const urlEnjoei = `https://api.scraperapi.com?api_key=${apiKey}&country_code=br&url=${encodeURIComponent('https://www.enjoei.com.br/busca?q=sauvage')}`;
        console.log('Chamando ScraperAPI para Enjoei...');
        const resEnjoei = await fetch(urlEnjoei);
        console.log('Status Enjoei:', resEnjoei.status);
        const textEnjoei = await resEnjoei.text();
        console.log('Tamanho Enjoei:', textEnjoei.length);
        console.log('Sucesso Enjoei?', !textEnjoei.includes('fora do ar') && resEnjoei.status === 200);
    } catch (e) {
        console.error('Erro Enjoei:', e.message);
    }
}

testarScraperAPI();
