// Run Vite on :5173 first. Every API call and courier booking is intercepted; no live orders are changed.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH} : {})});try{
for(const width of [1440,768,390,320]){
const page=await browser.newPage({viewport:{width,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>sessionStorage.setItem('nutri_admin_session',JSON.stringify({accessToken:'fixture.'+btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600}))+'.fixture',admin:{email:'staff@example.com',name:'Store staff',role:'super_admin'}})));
let configured=false, shipment=null,bookings=0,trackingSaved=false;
const order={id:'NH-PREVIEW',customerName:'Dev Sharma',customerEmail:'dev@example.com',customerPhone:'9000000000',createdAt:new Date().toISOString(),status:'confirmed',paymentStatus:'pending',paymentMethod:'cod',stockReserved:true,totalPaise:204035,subtotalPaise:194035,shippingPaise:10000,deliveryAddress:{street:'123 Market Road',city:'Hisar',state:'Haryana',pin:'125001'},operations:{fulfillment:'unaccepted',shipment:'not_created',returnStatus:'not_requested'},allowedActions:['accept','verify'],lines:[{productSlug:'almonds',productName:'Almonds',packSize:'250g',quantity:2,lineTotalPaise:194035}],shippingQuote:{source:'store',name:'Regional delivery'},statusHistory:[],activity:[]};
await page.route('http://localhost:3000/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;let body=[];
if(path==='/orders/admin')body=[order];
else if(path==='/admin/shipping/configuration')body={configured,defaults:{weight:0.5,length:20,breadth:12,height:6,pickupLocation:'Store'}};
else if(path==='/admin/shipping/orders/NH-PREVIEW')body=shipment;
else if(path.endsWith('/verify-and-ship')){bookings++;const payload=req.postDataJSON();assert.equal(payload.weight,0.5);assert.equal(payload.breadth,12);await new Promise(r=>setTimeout(r,250));body=shipment={providerOrderId:123,shipmentId:456,awb:'TRACK123',courier:'Preview courier',pickupScheduled:true,labelUrl:'https://example.com/label',manifestUrl:'https://example.com/list',parcel:payload};}
else if(path==='/orders/admin/NH-PREVIEW/actions/accept'){assert(req.postDataJSON().reason.length>3);order.operations.fulfillment='accepted';order.allowedActions=['pick','verify'];body=order;}
else if(path==='/orders/admin/NH-PREVIEW/status'){trackingSaved=true;assert.equal(req.postDataJSON().trackingNumber,'TRACK-MANUAL');body=order;}
await route.fulfill({json:body,headers:{'Access-Control-Allow-Origin':'*'}});});
await page.goto((process.env.FRONTEND_URL || 'http://127.0.0.1:5173') + '/admin/orders');await page.getByRole('button',{name:'View order →'}).click();
const dialog=page.getByRole('dialog',{name:'Order NH-PREVIEW'});
await dialog.getByRole('heading',{name:'1. Prepare the order'}).waitFor();
assert.equal(await dialog.getByRole('heading',{name:'Book a courier pickup'}).count(),0);
await dialog.getByRole('button',{name:'Accept this order',exact:true}).click();await dialog.getByRole('button',{name:'Confirm: Accept this order'}).click();await dialog.getByRole('button',{name:'Start collecting items',exact:true}).waitFor();
await dialog.getByLabel('Parcel tracking number').fill('TRACK-MANUAL');await dialog.getByRole('button',{name:'Save tracking details'}).click();await page.getByText('Tracking details saved.',{exact:true}).waitFor();assert(trackingSaved);
await page.screenshot({path:`/tmp/nutri-order-manual-${width}.png`,fullPage:true});
await dialog.getByRole('radio',{name:/Book through Shiprocket/}).check();await dialog.getByText(/Shiprocket is not connected yet/).waitFor();assert.equal(await dialog.getByRole('spinbutton').count(),0);
configured=true;await dialog.getByRole('radio',{name:/Use my own courier/}).check();await dialog.getByRole('radio',{name:/Book through Shiprocket/}).check();
await dialog.getByLabel('Packed weight (kg)').waitFor();assert.equal(await dialog.getByLabel('Packed weight (kg)').inputValue(),'0.5');assert(!await dialog.getByLabel('Packed weight (kg)').isDisabled());
await page.screenshot({path:`/tmp/nutri-order-shiprocket-${width}.png`,fullPage:true});
await dialog.getByRole('checkbox',{name:/I checked the payment/}).check();await dialog.getByRole('button',{name:'Book courier pickup',exact:true}).click();await dialog.getByText('Open shipping label ↗').waitFor();assert.equal(bookings,1);assert.equal(await dialog.getByRole('heading',{name:'Book a courier pickup'}).count(),1);
await dialog.locator('summary').filter({hasText:'Courier support tools'}).click();await dialog.getByRole('button',{name:'Refresh courier details'}).waitFor();
assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth),'dialog overflow');assert.deepEqual(errors,[]);console.log(`${width}px passed: next step, saved tracking, unavailable courier, parcel inputs, single mocked booking, document links`);await page.close();}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
