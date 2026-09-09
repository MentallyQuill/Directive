import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const available = createServer();
await new Promise(resolve => available.listen(0, '127.0.0.1', resolve));
const port = available.address().port;
await new Promise(resolve => available.close(resolve));
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['tools/scripts/serve-expanded-interface-preview.mjs'], {
  cwd: repoRoot, env: { ...process.env, DIRECTIVE_MOCKUP_PORT: String(port) }, stdio: ['ignore', 'ignore', 'inherit']
});
const artifacts = path.join(repoRoot, 'artifacts/narration-settings-browser');
const assets = loadAshesRuntimeAssets();
const browser = await chromium.launch({ headless: true });
try {
  for (let attempt=0; ; attempt++) {
    try { if ((await fetch(`${baseUrl}/reference`)).ok) break; } catch {}
    if (attempt===49) throw new Error('Narration browser harness failed to start');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  await mkdir(artifacts,{recursive:true});
  for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
    const page=await browser.newPage({viewport});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${baseUrl}/reference`);
    await page.evaluate(async assets => {
      const {renderSettingsPanel}=await import('/src/ui/settings-panel.js');
      const {renderMissionPanel}=await import('/src/ui/mission-panel.js');
      const {createDirectiveRuntimeApp}=await import('/src/runtime/runtime-app.mjs');
      const {createFakeDirectiveHost,createFakeGenerationClient}=await import('/src/hosts/fake/fake-host.mjs');
      const store=await import('/src/hosts/sillytavern/settings-store.mjs');
      const {createDirectiveExpandedShell}=await import('/src/ui/directive-expanded-shell.js');
      const {DIRECTIVE_PRIMARY_ROUTES}=await import('/src/ui/directive-routes.mjs');
      document.head.innerHTML='<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles/directive.css"><style>html,body{margin:0;width:100%;height:100%;background:#000}</style>';
      document.body.replaceChildren();
      const persisted=JSON.parse(localStorage.getItem('narration-browser-settings')||'{}');
      const context={extensionSettings:persisted,saveSettingsDebounced(){localStorage.setItem('narration-browser-settings',JSON.stringify(context.extensionSettings));}};
      const host=createFakeDirectiveHost({chatNative:true,generation:createFakeGenerationClient({responses:{openingSceneDirector:{text:JSON.stringify({kind:'directive.openingDirection.v1',sceneMaterialIds:['scene:0'],backgroundIds:['background:briefBiography'],emphasis:'balanced'})}}})});
      host.narration={getSettings:()=>store.getSillyTavernDirectiveNarrationSettings(context),updateSettings:patch=>store.updateSillyTavernDirectiveNarrationSettings(patch,context)};
      const {createSillyTavernProviderSettingsStore}=await import('/src/providers/directive-provider-settings.mjs');
      const providerStore=createSillyTavernProviderSettingsStore({context});
      host.providers.getSettings=()=>providerStore.getAll();
      host.providers.update=(kind,patch)=>providerStore.update(kind,patch);
      let fail=true;
      host.generation.generateNarration=async()=>{if(fail)throw new Error('Controlled browser opening failure');return {text:'The ready-room door was closed.'};};
      assets.missionDefinitionsById=new Map(assets.missionDefinitions.map(definition=>[definition.id,definition]));
      const app=createDirectiveRuntimeApp({host,packageLoader:async()=>assets});
      await app.initialize();
      let route='settings';
      const render=async()=>{
        document.body.replaceChildren();
        const shell=createDirectiveExpandedShell({id:'directive-runtime-panel',routes:DIRECTIVE_PRIMARY_ROUTES,activeRouteId:route,onSelectRoute(){}});
        shell.classList.add('directive-screen');document.body.appendChild(shell);
        const body=shell.querySelector('[data-directive-runtime-body="true"]');
        const view=await app.getCurrentView();
        if(route==='settings')renderSettingsPanel(body,view,{updateProviderSettings:input=>app.updateProviderSettings(input),updateNarrationSettings:async patch=>{await app.updateNarrationSettings(patch);await render();}});
        else renderMissionPanel(body,view,{retryOpening:()=>app.retryOpening(),refresh:render});
      };
      globalThis.proof={app,host,context,render,readSettings:()=>store.getSillyTavernDirectiveNarrationSettings({extensionSettings:JSON.parse(localStorage.getItem('narration-browser-settings')||'{}')}),async startFailure(){
        await app.startCreatorDraft();
        await app.saveCreatorDraft({patch:{activeStep:'review',input:{identity:{name:'Browser Tester',pronounsOrAddress:'they/them',speciesId:'human',ageBandId:'mid-career',appearance:'Attentive.'},service:{careerBackgroundId:'tactical-security',formativeExperienceId:'dominion-war-fleet-service',assignmentReasonId:'experienced-outsider-transfer'},personality:{traits:{insight:'perceptive',connection:'candid',execution:'decisive'},flawId:'impatient'},dossier:{briefBiography:'An officer with relief experience.',publicReputation:'An attentive officer.'}}}});
        await app.acceptCreatorDraftAndStartCampaign();route='mission';await render();
      },allowSuccess(){fail=false;}};
      await render();
    },JSON.parse(JSON.stringify(assets)));
    const pov=page.locator('[data-settings-control="narration-pov"]');
    const tense=page.locator('[data-settings-control="narration-tense"]');
    for(const selectedPov of ['first-person','second-person','third-person-limited'])for(const selectedTense of ['past','present']){
      await pov.selectOption(selectedPov);
      await page.waitForFunction(value=>proof.host.narration.getSettings().pov===value,selectedPov);
      await tense.selectOption(selectedTense);
      await page.waitForFunction(value=>proof.host.narration.getSettings().tense===value,selectedTense);
      await page.evaluate(()=>proof.render());
      assert.equal(await pov.inputValue(),selectedPov);assert.equal(await tense.inputValue(),selectedTense);
      assert.deepEqual(await page.evaluate(()=>proof.readSettings()),{pov:selectedPov,tense:selectedTense});
      assert.deepEqual(await page.evaluate(async()=> (await proof.app.getCurrentView()).narrationSettings),{pov:selectedPov,tense:selectedTense});
    }
    await pov.scrollIntoViewIfNeeded();
    assert.equal(await pov.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),true);
    await page.screenshot({path:path.join(artifacts,`settings-${viewport.width}.png`)});
    for(const kind of ['utility','reasoning']){
      const timeout=page.locator(`[data-settings-control="${kind}-timeoutSeconds"]`);
      await timeout.fill('1500');await timeout.press('Tab');
      await page.waitForFunction(kind=>proof.host.providers.getSettings()[kind].timeoutSeconds===1500,kind);
      await page.evaluate(()=>proof.render());
      assert.equal(await timeout.inputValue(),'1500');
      assert.equal(await page.evaluate(kind=>JSON.parse(localStorage.getItem('narration-browser-settings')).directive.providers[kind].timeoutSeconds,kind),1500);
      await timeout.scrollIntoViewIfNeeded();
      assert.equal(await timeout.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),true);
    }
    await page.screenshot({path:path.join(artifacts,`timeout-settings-${viewport.width}.png`)});
    await page.evaluate(()=>proof.startFailure());
    const retry=page.locator('[data-action="retry-opening"]');
    assert.equal(await retry.textContent(),'Retry opening');
    await retry.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(artifacts,`opening-failure-${viewport.width}.png`)});
    await page.evaluate(()=>proof.allowSuccess());await retry.click();
    await page.waitForFunction(()=>!document.querySelector('[data-action="retry-opening"]'));
    assert.equal(await page.evaluate(()=>proof.host.chat.messages().length),1);
    assert.equal(await page.evaluate(async()=>(await proof.app.getCurrentView()).openingGeneration.status),'ready');
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('PASS browser narration settings: six combinations on desktop/mobile, persistent store/runtime rerender, opening failure/retry.');
} finally {await browser.close();server.kill();}
