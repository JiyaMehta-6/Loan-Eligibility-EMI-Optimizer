(function(){
  // Helpers
  function money(x){ return Number(x).toLocaleString('en-IN',{maximumFractionDigits:0}); }

  function emi(principal, annualRate, years){
    if(principal<=0) return 0;
    const r = annualRate/100/12;
    const n = years*12;
    if(r===0) return principal/n;
    return (principal*r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1);
  }

  // Reverse EMI to compute max principal given EMI
  function principalFromEmi(emiAmt, annualRate, years){
    const r=annualRate/100/12; const n=years*12;
    if(r===0) return emiAmt*n;
    return emiAmt*(Math.pow(1+r,n)-1)/(r*Math.pow(1+r,n));
  }

  // DOM
  const incomeEl=document.getElementById('income');
  const existingEl=document.getElementById('existing');
  const creditEl=document.getElementById('credit');
  const requestedEl=document.getElementById('requested');
  const rateEl=document.getElementById('rate');
  const tenuresEl=document.getElementById('tenures');
  const dtiEl=document.getElementById('dti');
  const csMultEl=document.getElementById('cs-mult');

  const calcBtn=document.getElementById('calc');
  const resetBtn=document.getElementById('reset');

  const summary=document.getElementById('summary');
  const comparison=document.getElementById('comparison');
  const plan=document.getElementById('plan');
  const amort=document.getElementById('amort');
  const chart=document.getElementById('chart');
  const ctx=chart.getContext('2d');

  function clearResults(){
    comparison.innerHTML=''; plan.innerHTML='No plan selected.'; amort.innerHTML=''; ctx.clearRect(0,0,chart.width,chart.height);
  }

  resetBtn.addEventListener('click',()=>{
    incomeEl.value=50000; existingEl.value=8000; creditEl.value=720; requestedEl.value=''; rateEl.value=9.25; tenuresEl.value='5,10,15,20'; dtiEl.value=50; csMultEl.value='1.0';
    summary.textContent='Enter details and press Calculate.'; clearResults();
  });

  calcBtn.addEventListener('click',()=>{
    clearResults();
    // Read inputs
    const income=Number(incomeEl.value)||0;
    const existing=Number(existingEl.value)||0;
    const credit=Number(creditEl.value)||650;
    const requested=Number(requestedEl.value)||0;
    const baseRate=Number(rateEl.value)||8.5;
    const tenures = tenuresEl.value.split(',').map(t=>Number(t.trim())).filter(Boolean);
    const dti = Number(dtiEl.value)||50;
    const csMult = Number(csMultEl.value)||1.0;

    if(income<=0){ summary.innerHTML='<strong class="muted">Please enter a valid monthly income.</strong>'; return; }
    if(tenures.length===0){ summary.innerHTML='<strong class="muted">Enter at least one tenure.</strong>'; return; }

    // Compute available monthly for ALL EMIs
    const maxTotalEmi = (income * (dti/100));
    const availableForNew = Math.max(0, maxTotalEmi - existing);

    // Adjust available by credit score multiplier
    const adjustedAvailable = availableForNew * csMult;

    // If user requested a specific principal, compute EMI and check affordability across tenures
    summary.innerHTML = `Monthly income ₹${money(income)} • existing EMIs ₹${money(existing)} • DTI ${dti}% • available for new EMI ≈ <strong>₹${money(adjustedAvailable.toFixed(0))}</strong>`;

    // Build comparison table
    const table = document.createElement('table'); table.className='table';
    const thead=document.createElement('thead'); thead.innerHTML='<tr><th>Tenure (yrs)</th><th>Interest (ann.)</th><th>Monthly EMI (for selected loan)</th><th>Max Loan (₹)</th><th>Suggestion</th></tr>';
    table.appendChild(thead);
    const tbody=document.createElement('tbody');

    const results=[];

    tenures.forEach(years=>{
      // We will allow interest to vary slightly by credit score: better score -> lower rate
      let rateAdj = baseRate - ( (credit-650)/100 * 0.2 ); // small tweak
      if(rateAdj<3) rateAdj=3;

      const maxLoan = Math.floor(principalFromEmi(adjustedAvailable, rateAdj, years));
      const requestedLoan = requested>0?requested:maxLoan;
      const emiForRequested = Math.ceil(emi(requestedLoan, rateAdj, years));

      const suggestion = emiForRequested <= adjustedAvailable ? 'Affordable' : 'Exceeds allowable EMI';

      results.push({years,rate:rateAdj,emi:emiForRequested,maxLoan,affordable: suggestion==='Affordable'});

      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${years}</td><td>${rateAdj.toFixed(2)}%</td><td>₹${money(emiForRequested)}</td><td>₹${money(maxLoan)}</td><td>${suggestion}</td>`;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    comparison.appendChild(table);

    // Pick best candidate: smallest total interest among affordable options, or else the one with smallest EMI gap
    const affordable = results.filter(r=>r.affordable);
    let chosen;
    if(affordable.length>0){
      chosen = affordable.reduce((a,b)=>{
        // compute total interest over life
        const principal = requested>0?requested:b.maxLoan;
        const totalPaid = b.emi * b.years*12;
        const totalInterest = totalPaid - principal;
        const atotalPaid = a.emi * a.years*12; const ainterest = atotalPaid - (requested>0?a.maxLoan: a.maxLoan);
        return totalInterest < ainterest ? b : a;
      }, affordable[0]);
    } else {
      // choose the one with smallest EMI-overrun
      chosen = results.reduce((a,b)=>{
        const adiff = a.emi - adjustedAvailable; const bdiff = b.emi - adjustedAvailable;
        return Math.abs(bdiff) < Math.abs(adiff) ? b : a;
      }, results[0]);
    }

    // Display chosen plan
    plan.innerHTML = `<strong>${chosen.years} years @ ${chosen.rate.toFixed(2)}%:</strong> EMI ₹${money(chosen.emi)} • Max loan ₹${money(chosen.maxLoan)} • ${chosen.affordable?'<span class="muted">Affordable</span>':'<span class="muted">Not affordable</span>'}`;

    // Build amortization schedule for the chosen plan and requested loan or maxLoan
    const principal = requested>0?requested:chosen.maxLoan;
    const monthlyRate = chosen.rate/100/12;
    const n = chosen.years*12;
    let bal = principal;
    const rows = [];
    let totalInterest=0,totalPaid=0;
    for(let i=1;i<=n;i++){
      const interest = bal * monthlyRate;
      const principalPaid = chosen.emi - interest;
      bal = Math.max(0, bal - principalPaid);
      totalInterest += interest; totalPaid += chosen.emi;
      if(i%12===0 || i===1 || i===n){ // show every year + first + last
        rows.push({month:i,bal:Math.ceil(bal),interest:Math.ceil(totalInterest)});
      }
    }

    // Render amortization small table
    const amTable=document.createElement('table'); amTable.className='table';
    const th=document.createElement('thead'); th.innerHTML='<tr><th>Month</th><th>Remaining Balance (₹)</th><th>Cumulative Interest (₹)</th></tr>';
    amTable.appendChild(th);
    const tb=document.createElement('tbody');
    rows.forEach(r=>{
      const tr=document.createElement('tr'); tr.innerHTML=`<td>${r.month}</td><td>₹${money(r.bal)}</td><td>₹${money(r.interest)}</td>`; tb.appendChild(tr);
    });
    amTable.appendChild(tb);
    amort.appendChild(amTable);

    // Draw simple area chart of balance over time
    drawChart(principal,chosen.rate,chosen.years,chosen.emi);
  });

  function drawChart(principal,annualRate,years,monthlyEmi){
    const w=chart.width; const h=chart.height; ctx.clearRect(0,0,w,h);
    const r=annualRate/100/12; const n=years*12;
    let bal=principal; const points=[];
    for(let i=0;i<=n;i++){
      points.push(bal);
      if(i<n){
        const interest = bal * r; const principalPaid = monthlyEmi - interest; bal = Math.max(0, bal - principalPaid);
      }
    }
    const max = Math.max(...points);

    // background grid
    ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.lineWidth=1;
    for(let i=0;i<=4;i++){ const y = (h/4)*i; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

    ctx.beginPath();
    points.forEach((p,i)=>{
      const x = (i/(n))*w;
      const y = (p/max)* (h*0.9);
      const py = h - y - 10;
      if(i===0) ctx.moveTo(x,py); else ctx.lineTo(x,py);
    });
    ctx.lineWidth=2; ctx.strokeStyle='rgba(0, 255, 47, 0.95)'; ctx.stroke();

    // fill area
    ctx.lineTo(w, h-8); ctx.lineTo(0, h-8); ctx.closePath(); ctx.fillStyle='rgba(71, 241, 45, 0.36)'; ctx.fill();

    // labels
    ctx.fillStyle='rgba(255,255,255,0.8)'; ctx.font='12px Inter, sans-serif'; ctx.fillText('Remaining balance over time',10,16);
  }

})();