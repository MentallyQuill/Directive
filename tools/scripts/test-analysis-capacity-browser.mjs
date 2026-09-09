import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright';

const available=createServer(); await new Promise(resolve=>available.listen(0,'127.0.0.1',resolve));
const port=available.address().port; await new Promise(resolve=>available.close(resolve));
const baseUrl=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['tools/scripts/serve-expanded-interface-preview.mjs'],{cwd:process.cwd(),env:{...process.env,DIRECTIVE_MOCKUP_PORT:String(port)},stdio:['ignore','ignore','inherit']});
const browser=await chromium.launch({headless:true});
const artifacts=path.resolve('artifacts/analysis-capacity-browser');
const initialize=async()=>{
  const {renderSettingsPanel}=await import('/src/ui/settings-panel.js');
  const {createSillyTavernProviderSettingsStore}=await import('/src/providers/directive-provider-settings.mjs');
  const {resolveAnalysisLimits,resolveProviderMaxTokens}=await import('/src/generation/analysis-limits.mjs');
  const {createDirectiveExpandedShell}=await import('/src/ui/directive-expanded-shell.js');
  const {DIRECTIVE_PRIMARY_ROUTES}=await import('/src/ui/directive-routes.mjs');
  document.head.innerHTML='<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles/directive.css"><style>html,body{margin:0;width:100%;height:100%;background:#000}</style>';
  const context={extensionSettings:JSON.parse(localStorage.getItem('capacity-settings')||'{}'),saveSettingsDebounced(){localStorage.setItem('capacity-settings',JSON.stringify(context.extensionSettings));}};
  const store=createSillyTavernProviderSettingsStore({context});
  const render=()=>{
    document.body.replaceChildren();
    const shell=createDirectiveExpandedShell({id:'directive-runtime-panel',routes:DIRECTIVE_PRIMARY_ROUTES,activeRouteId:'settings',onSelectRoute(){}});
    shell.classList.add('directive-screen'); document.body.appendChild(shell);
    renderSettingsPanel(shell.querySelector('[data-directive-runtime-body="true"]'),{providerConfiguration:{settings:store.getAll(),profiles:[],status:{}}},{updateProviderSettings:async({kind,patch})=>({settings:store.update(kind,patch)})});
  };
  window.capacityProof={store,render,effective:()=>resolveAnalysisLimits(store.get('utility')),tokens:()=>resolveProviderMaxTokens(store.getAll(),'reasoning')};render();
};
try {
  for(let attempt=0;;attempt++){try{if((await fetch(`${baseUrl}/reference`)).ok)break;}catch{}if(attempt===49)throw Error('Preview did not start');await new Promise(resolve=>setTimeout(resolve,100));}
  await mkdir(artifacts,{recursive:true});
  for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
    const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${baseUrl}/reference`);await page.evaluate(initialize);
    const slider=page.locator('[data-settings-control="analysis-capacity"]');
    const advanced=page.locator('.settings-analysis-advanced');
    assert.equal(await slider.count(),1);assert.equal(await advanced.getAttribute('open'),null);
    assert.equal(await page.locator('[data-settings-control="reasoning-maxTokens"]').isVisible(),false);
    await page.evaluate(()=>{capacityProof.store.update('utility',{timeoutSeconds:733,analysisOverrides:{threadInactivityRevisions:27},roleLimits:{acceptedPairMissionEvidence:{maxAttempts:4}}});capacityProof.render();});
    for(const capacity of [0.5,5,1.7]){
      await slider.evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},capacity);
      assert.equal(await page.locator('[data-analysis-capacity-value]').textContent(),`${capacity.toFixed(1)}×`);
      await slider.dispatchEvent('change');await page.waitForFunction(value=>capacityProof.store.get('utility').analysisCapacity===value,capacity);
      assert.equal(await page.evaluate(()=>capacityProof.store.get('utility').timeoutSeconds),733);
      assert.equal(await page.evaluate(()=>capacityProof.effective().threadInactivityRevisions),27);
      assert.equal(await page.evaluate(()=>capacityProof.store.get('utility').roleLimits.acceptedPairMissionEvidence.maxAttempts),4);
      await page.reload();await page.evaluate(initialize);assert.equal(Number(await slider.inputValue()),capacity);
    }
    await slider.scrollIntoViewIfNeeded();
    assert.equal(await slider.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),true);
    await page.screenshot({path:path.join(artifacts,`capacity-${viewport.width}.png`)});
    await advanced.locator('summary').click();
    const fact=page.locator('[data-settings-control="analysis-continuityFactCharacters"]');
    await fact.fill('900');await fact.press('Tab');await page.waitForFunction(()=>capacityProof.effective().continuityFactCharacters===900);
    assert.match(await page.locator('[data-analysis-override-hint]').textContent(),/active/);
    await fact.fill('');await fact.press('Tab');await page.waitForFunction(()=>!Object.hasOwn(capacityProof.store.get('utility').analysisOverrides,'continuityFactCharacters'));
    assert.equal(await fact.getAttribute('placeholder'),'Inherit (870)');
    await fact.fill('900');await fact.press('Tab');
    const tokens=page.locator('[data-settings-control="reasoning-maxTokens"]');await tokens.fill('19000');await tokens.press('Tab');
    await page.waitForFunction(()=>capacityProof.tokens()===19000);
    await page.locator('[data-settings-action="reset-analysis-overrides"]').click();
    await page.waitForFunction(()=>Object.keys(capacityProof.store.get('utility').analysisOverrides).length===0&&capacityProof.store.get('reasoning').outputTokenOverride===null);
    assert.equal(await page.evaluate(()=>capacityProof.store.get('utility').timeoutSeconds),733);
    assert.equal(await page.evaluate(()=>capacityProof.store.get('utility').analysisCapacity),1.7);
    await page.locator('[data-settings-action="reset-analysis-capacity"]').click();await page.waitForFunction(()=>capacityProof.store.get('utility').analysisCapacity===1);
    await page.reload();await page.evaluate(initialize);assert.equal(await advanced.getAttribute('open'),null);assert.equal(await slider.inputValue(),'1');
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Analysis capacity browser tests passed: desktop/mobile, .5x–5x, reload, inheritance, reset, and independent timings.');
}finally{await browser.close();server.kill();}
