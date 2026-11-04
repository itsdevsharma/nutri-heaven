// Run Vite on :5173. All customer records, courier events and receipts are mocked.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {})});
try{for(const width of [1440,768,390,320]){
const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>localStorage.setItem('nutri_customer_access_token','fixture'));
const base={id:'NH-TRACKING',createdAt:'2026-11-04T05:00:00Z',customerName:'Test Buyer',status:'confirmed',paymentStatus:'paid',paymentMethod:'razorpay',subtotalPaise:29900,shippingPaise:10000,totalPaise:100,amountAdjustmentPaise:-39800,stockReserved:true,deliveryAddress:{street:'134 Market Road',landmark:'Near the park',city:'Faridabad',state:'Haryana',pin:'121002'},lines:[{productSlug:'nuts',productName:'Roasted Cashews',packSize:'250g',quantity:1,lineTotalPaise:29900}],statusHistory:[{status:'pending',at:'2026-11-04T05:00:00Z'},{status:'confirmed',at:'2026-11-04T05:02:00Z'}],activity:[]};
const orders=[base,{...base,id:'NH-UNPAID',status:'pending',paymentStatus:'pending',totalPaise:39900},{...base,id:'NH-COD',paymentMethod:'cod',paymentStatus:'pending',totalPaise:39900}];
let count=0,fail=false,receipts=0;
await page.route((process.env.API_ORIGIN || 'http://localhost:3000') + '/**',async route=>{
const req=route.request();const path=new URL(req.url()).pathname.replace(/^\/api/, '');
let body={};let status=200;
if(path==='/customer/me')body={id:'fixture',name:'Test Buyer',email:'buyer@example.com',phone:'9876543210',addresses:[]};
else if(path==='/customer/me/orders'){count++;if(fail){status=503;body={message:'Temporarily unavailable'};}else body=orders;}
else if(path.endsWith('/receipt')){receipts++;return route.fulfill({body:'<!doctype html><title>Receipt</title>',contentType:'text/html',headers:{'Access-Control-Allow-Origin':'*'}});}
else if(['/products','/categories','/customer/me/wishlist','/customer/me/notifications'].includes(path))body=[];
else if(path.startsWith('/cart'))body={items:[],subtotalPaise:0};
else if(path==='/payments/razorpay/config')body={enabled:true};
await route.fulfill({status,json:body,headers:{'Access-Control-Allow-Origin':'*'}});
});
await page.goto((process.env.FRONTEND_URL || 'http://127.0.0.1:5173') + '/account#account-orders');
const section=page.locator('#account-orders');await section.getByRole('heading',{name:'Your orders',exact:true}).waitFor();
await section.getByRole('heading',{name:'Waiting for acceptance',exact:true}).waitFor();
assert.equal(await section.getByRole('button',{name:'Download receipt'}).count(),1);
const unpaid=section.locator('.customer-order').filter({hasText:'NH-UNPAID'});await unpaid.getByRole('button',{name:'Complete payment · ₹399'}).waitFor();assert.equal(await unpaid.getByRole('button',{name:'Download receipt'}).count(),0);
const cod=section.locator('.customer-order').filter({hasText:'NH-COD'});await cod.locator('summary').first().click();assert.equal(await cod.getByRole('button',{name:'Download receipt'}).count(),0);await cod.getByText('Your receipt will be available once payment is received.',{exact:true}).waitFor();
await page.getByLabel('Full name',{exact:true}).fill('Unsaved profile name');
base.operations={fulfillment:'picking',shipment:'not_created'};base.activity=[{action:'accept',at:'2026-11-04T05:05:00Z'}];
await section.getByRole('button',{name:'Refresh orders'}).click();await section.getByRole('heading',{name:'Preparing',exact:true}).waitFor();
assert.equal(await page.getByLabel('Full name',{exact:true}).inputValue(),'Unsaved profile name');
base.status='shipped';base.operations={fulfillment:'dispatched',shipment:'in_transit',courier:'Test courier'};
base.deliveryTracking={courier:'Test courier',number:'TRACK123456789',url:'https://courier.example/track/TRACK123456789',status:'OUT FOR DELIVERY',updatedAt:'2026-11-04T05:20:00Z',activities:[{date:'2026-11-04T05:15:00Z',activity:'Out for delivery',location:'Faridabad'}]};
await section.getByRole('button',{name:'Refresh orders'}).click();await section.getByRole('heading',{name:'Out for delivery',exact:true}).waitFor();
assert.equal(await section.getByRole('link',{name:'Track delivery'}).getAttribute('href'),'https://courier.example/track/TRACK123456789');
await section.getByText('Courier updates (1)',{exact:true}).click();await section.getByText('Faridabad',{exact:true}).waitFor();
await section.getByRole('button',{name:'Download receipt'}).click();await page.getByText('Receipt downloaded.',{exact:false}).waitFor();assert.equal(receipts,1);
await page.evaluate(() => window.scrollTo({ top: document.getElementById('account-orders').getBoundingClientRect().top + window.scrollY - 90, behavior: 'instant' }));await page.screenshot({path:`/tmp/nutri-tracking-${width}.png`});
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflow');
fail=true;const before=count;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await section.getByText('Updates could not be checked.',{exact:false}).waitFor();assert(count>before);await section.getByRole('heading',{name:'Out for delivery',exact:true}).waitFor();
assert.deepEqual(errors,[]);console.log(width+'px: progress refresh, courier tracking, paid-only receipt, stale-data error, preserved profile and responsive layout passed');
await page.close();
}}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
