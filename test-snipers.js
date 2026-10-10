const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function checkOlxDOM() {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            executablePath: '/snap/bin/chromium',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        await page.goto('https://www.olx.com.br/brasil?q=sauvage', { waitUntil: 'networkidle2', timeout: 35000 });
        
        // Let's inspect all script tags with type="application/ld+json" or data
        const scripts = await page.evaluate(() => {
            const sc = Array.from(document.querySelectorAll('script'));
            return sc.map(s => ({ id: s.id, type: s.type, src: s.src ? s.src.substring(0, 50) : '', len: s.textContent.length }));
        });
        console.log('Scripts:', JSON.stringify(scripts.filter(s => s.id || s.type.includes('json')), null, 2));

        // Find all listing elements or links
        const sampleLinks = await page.evaluate(() => {
            const a = Array.from(document.querySelectorAll('a[href]'));
            return a.filter(x => x.href.includes('/d/') || x.href.includes('/anuncio/')).slice(0, 5).map(x => ({ text: x.innerText, href: x.href }));
        });
        console.log('Sample links:', JSON.stringify(sampleLinks, null, 2));

        // What about all h2 on the page?
        const h2s = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('h2')).map(h => h.innerText).slice(0, 10);
        });
        console.log('H2s:', JSON.stringify(h2s, null, 2));

    } catch (e) {
        console.error('Erro:', e.message);
    } finally {
        if (browser) await browser.close();
    }
}

checkOlxDOM();
