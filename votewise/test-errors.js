const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('LOG:', msg.text()));
  
  // Listen for CSP violations
  page.on('securitypanel', () => console.log('Security violation'));
  
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('Clicking step 1...');
  await page.click('#step-btn-1');
  
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('Done');
  await browser.close();
})();
