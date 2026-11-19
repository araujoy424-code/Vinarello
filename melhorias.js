/* Vinarello — melhorias pontuais sobre as funções originais.
   Não muda a estrutura nem os produtos do primeiro projeto. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const cards=[...document.querySelectorAll('#productGrid .product')];
  cards.forEach((card,index)=>card.dataset.initialOrder=String(index));

  // Barra de busca/ordenacao que já existia na logica do primeiro Vinarello,
  // mas não tinha controles no HTML.
  window.searchProducts=function(){
    const query=($('productSearch')?.value||'').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    let visible=0;
    cards.forEach(card=>{
      const text=card.textContent.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const show=text.includes(query)&&matchesProductCategory(card);
      card.hidden=!show;
      if(show)visible++;
    });
    if($('catalogCount'))$('catalogCount').textContent=visible+' '+(visible===1?'rótulo encontrado':'rótulos encontrados');
    if($('catalogEmpty'))$('catalogEmpty').hidden=visible!==0;
    document.querySelectorAll('.sidebar a[onclick*="filterProducts"]').forEach(link=>{
      const matched=link.getAttribute('onclick')?.match(/filterProducts\('([^']+)'\)/);
      link.classList.toggle('is-current',matched?.[1]===activeProductCategory);
    });
  };
  window.sortProducts=function(){
    const grid=$('productGrid'),mode=$('productSort')?.value||'featured';if(!grid)return;
    const price=el=>{
      const s=el.querySelector('.price')?.textContent||'';
      return Number(s.replace(/[^\d,]/g,'').replace(',','.'))||0;
    };
    const sorted=[...cards].sort((a,b)=>{
      if(mode==='price-asc')return price(a)-price(b);
      if(mode==='price-desc')return price(b)-price(a);
      if(mode==='name')return a.querySelector('h3')?.textContent.trim().localeCompare(b.querySelector('h3')?.textContent.trim(),'pt-BR');
      return Number(a.dataset.initialOrder)-Number(b.dataset.initialOrder);
    });
    sorted.forEach(card=>grid.appendChild(card));
    searchProducts();
  };
  $('productSearch')?.addEventListener('input',searchProducts);
  $('productSort')?.addEventListener('change',sortProducts);
  $('resetCatalog')?.addEventListener('click',()=>{
    if($('productSearch'))$('productSearch').value='';
    if($('productSort'))$('productSort').value='featured';
    activeProductCategory='todos';sortProducts();$('productSearch')?.focus();
  });
  // Um feedback simples substitui o salto automático para o checkout após cada clique.
  const oldAdd=window.addToCart;
  const oldRender=window.renderCart;
  const toast=document.createElement('div');toast.className='vinarello-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');
  toast.innerHTML='<span id="vinarelloToastMessage">Vinho adicionado ao carrinho.</span><a href="#carrinho">Ver carrinho</a>';
  document.body.appendChild(toast);
  let toastTimer;
  if(typeof oldRender==='function')window.renderCart=function(){
    const result=oldRender.apply(this,arguments);
    const count=cart.reduce((sum,item)=>sum+Number(item.quantity||0),0);
    const chip=$('sidebarCartCount');if(chip){chip.hidden=count===0;chip.textContent=count>99?'99+':String(count);chip.setAttribute('aria-label',count+' itens no carrinho');}
    return result;
  };
  if(typeof oldAdd==='function')window.addToCart=function(name,price){
    // Mantém a mesma estrutura do carrinho e o mesmo armazenamento original.
    const existing=cart.find(item=>item.name===name);
    if(existing)existing.quantity=Math.min(999,existing.quantity+1);
    else cart.push({name,price:Number(price),quantity:1});
    saveCart();renderCart();
    $('vinarelloToastMessage').textContent=name+' adicionado ao carrinho.';
    toast.classList.add('show');clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>toast.classList.remove('show'),3500);
  };
  toast.querySelector('a').addEventListener('click',()=>toast.classList.remove('show'));

  // Menu mobile: corrige botão invisível no CSS original e melhora fechamento.
  const menu=$('sidebar'),button=document.querySelector('.menu-btn'),backdrop=$('sidebarBackdrop');
  function setMenu(open){
    if(!menu||!button)return;
    menu.classList.toggle('active',open);
    document.body.classList.toggle('menu-open',open);
    if(backdrop)backdrop.hidden=!open;
    button.textContent=open?'×':'☰';
    button.setAttribute('aria-expanded',String(open));
    button.setAttribute('aria-label',open?'Fechar menu':'Abrir menu');
  }
  window.toggleMenu=()=>setMenu(!menu?.classList.contains('active'));
  backdrop?.addEventListener('click',()=>setMenu(false));
  menu?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>setMenu(false)));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')setMenu(false);});
  window.addEventListener('resize',()=>{if(window.innerWidth>800)setMenu(false);});

  // Imagens reais do original continuam sendo prioridade; fallback só em erro de rede.
  const missing='assets/sem-foto.svg';
  cards.forEach(card=>{
    const image=card.querySelector('img');if(!image)return;
    image.addEventListener('error',function(){
      if(!image.dataset.fallbackApplied){image.dataset.originalSrc=image.src;image.dataset.fallbackApplied='true';image.src=missing;}
    });
    if(image.complete&&image.naturalWidth===0){image.dispatchEvent(new Event('error'));}
  });
  window.addEventListener('DOMContentLoaded',()=>{renderCart();searchProducts();});
  renderCart();searchProducts();
})();
