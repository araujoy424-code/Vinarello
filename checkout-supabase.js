// VINARELLO — sessão persistente, perfil, entrega e pedidos no Supabase.
// Carregar depois do script principal do catálogo/carrinho.

let customerMode = 'register';
let accountIntent = 'purchase';
let accountBusy = false;
let orderBusy = false;
let pendingOrderId = null;
let pendingOrderFingerprint = null;
let lastSimulatedPaymentResult = 'aprovado';
let accountRenderSerial = 0;
let currentAccountUser = null;
let currentAccountProfile = null;
let profileSaveBusy = false;


const byId = (id) => document.getElementById(id);
const field = (id) => (byId(id)?.value || '').trim();

function requireSupabase() {
  if (!window.vinarelloDb) throw new Error('Conexão com o Supabase indisponível. Confira supabase-config.js.');
  return window.vinarelloDb;
}
function readableError(error) {
  const message = String(error?.message || error || 'Erro desconhecido.');
  if (/invalid login credentials/i.test(message)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(message)) return 'Confirme seu e-mail antes de entrar. Confira também a caixa de spam.';
  if (/user already registered/i.test(message)) return 'Este e-mail já possui cadastro. Use a opção Entrar.';
  if (/failed to fetch|networkerror|load failed/i.test(message)) return 'Não foi possível acessar o Supabase. Confira sua internet, URL e chave pública.';
  if (/vinarello_criar_pedido.*not found|PGRST202/i.test(message)) return 'A função do banco não foi encontrada. Execute SUPABASE_COMPLETO.sql no projeto correto.';
  if (/permission denied|insufficient privilege|row-level security/i.test(message)) return 'O banco bloqueou a operação. Confira se SUPABASE_COMPLETO.sql foi executado por inteiro.';
  return message;
}
function showCustomerMessage(message, type='error') {
  const box=byId('customerMessage'); if(!box) return;
  box.textContent=message; box.className='customer-message show '+type;
}
function hideCustomerMessage() {
  const box=byId('customerMessage'); if(!box) return;
  box.textContent=''; box.className='customer-message';
}
function setAccountBusy(busy) {
  accountBusy=busy;
  const button=byId('customerSubmitButton'); if(!button) return;
  button.disabled=busy;
  button.textContent=busy?'Aguarde...':(customerMode==='register'?'Criar conta e continuar':'Entrar e continuar');
}
function setOrderBusy(busy) {
  orderBusy=busy;
  const button=byId('finishPurchaseButton');
  if(button){button.disabled=busy;button.textContent=busy?'Salvando pedido...':'Finalizar pedido';}
}
function openCustomerModal() {
  accountIntent='purchase';
  if(customerMode==='login') showLogin(); else showRegister();
  byId('customerModal')?.classList.add('active');
}
async function openAccountAccess(mode='register') {
  accountIntent='account';
  try {
    if(window.vinarelloDb){
      const {data}=await window.vinarelloDb.auth.getSession();
      if(data?.session?.user){
        await updateAccountStatus();
        byId('minha-conta')?.scrollIntoView({behavior:'smooth',block:'start'});
        return;
      }
    }
  } catch(error){console.warn('Não foi possível consultar a sessão:',error);}
  if(mode==='login') showLogin(); else showRegister();
  byId('customerModal')?.classList.add('active');
}
async function openMyOrders() {
  await updateAccountStatus();
  if(currentAccountUser) {
    showAccountPanel('orders');
  } else {
    openAccountAccess('login');
  }
}
function closeCustomerModal() {
  if(!accountBusy) byId('customerModal')?.classList.remove('active');
}
function showLogin() {
  customerMode='login';
  byId('customerModalTitle').textContent='Entrar na sua conta';
  byId('customerModalDescription').textContent='Entre uma vez. Sua sessão ficará salva neste dispositivo para as próximas compras.';
  byId('nameGroup').style.display='none';
  byId('customerPhone').parentElement.style.display='none';
  byId('passwordGroup').style.display='block';
  byId('loginOption').innerHTML='Ainda não possui cadastro? <button type="button" onclick="showRegister()">Criar conta</button><br><button type="button" onclick="resetCustomerPassword()">Esqueci minha senha</button>';
  byId('customerForm').reset(); hideCustomerMessage(); setAccountBusy(false);
}
function showRegister() {
  customerMode='register';
  byId('customerModalTitle').textContent='Criar minha conta';
  byId('customerModalDescription').textContent='Seus dados de acesso e perfil ficarão salvos com segurança no Supabase.';
  byId('nameGroup').style.display='block';
  byId('customerPhone').parentElement.style.display='block';
  byId('passwordGroup').style.display='block';
  byId('loginOption').innerHTML='Já possui cadastro? <button type="button" onclick="showLogin()">Entrar</button>';
  byId('customerForm').reset(); hideCustomerMessage(); setAccountBusy(false);
}


async function resetCustomerPassword() {
  const email=field('customerEmail').toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    showCustomerMessage('Digite seu e-mail acima para receber o link de redefinição.');return;
  }
  try {
    const {error}=await requireSupabase().auth.resetPasswordForEmail(email,{
      redirectTo:window.location.origin+window.location.pathname
    });
    if(error)throw error;
    showCustomerMessage('Se esse e-mail estiver cadastrado, enviaremos um link para redefinir sua senha. Confira sua caixa de entrada.','success');
  } catch(error) {
    showCustomerMessage(readableError(error));
  }
}

async function registerAndFinish(event) {
  event.preventDefault();
  if(accountBusy||orderBusy) return;
  const name=field('customerName');
  const email=field('customerEmail').toLowerCase();
  const phone=field('customerPhone');
  const password=byId('customerPassword').value;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){showCustomerMessage('Digite um e-mail válido.');return;}
  if(password.length<8){showCustomerMessage('Use uma senha com pelo menos 8 caracteres.');return;}
  if(customerMode==='register'&&(name.length<3||phone.replace(/\D/g,'').length<10)){
    showCustomerMessage('Informe seu nome completo e telefone com DDD.');return;
  }
  setAccountBusy(true);
  try {
    const db=requireSupabase();
    if(customerMode==='register'){
      const {data,error}=await db.auth.signUp({email,password,options:{data:{name,phone}}});
      if(error) throw error;
      if(!data.session){
        showCustomerMessage('Cadastro criado. Confirme o e-mail pelo link enviado. Depois volte, entre na conta e finalize; seu carrinho e endereço continuam nesta página.','success');
        return;
      }
    } else {
      const {error}=await db.auth.signInWithPassword({email,password});
      if(error) throw error;
    }
    byId('customerModal').classList.remove('active');
    await updateAccountStatus();
    if(accountIntent==='purchase') {
      await completeOrder();
    } else {
      showAccountFeedback('Você entrou na sua conta com sucesso.','success');
      byId('minha-conta')?.scrollIntoView({behavior:'smooth',block:'start'});
    }
  } catch(error) {
    console.error('Falha no cadastro/login:',error);
    showCustomerMessage(readableError(error));
  } finally {setAccountBusy(false);}
}

function currentDelivery() {
  return {
    rua:field('deliveryStreet'),
    numero:field('deliveryNumber'),
    complemento:field('deliveryComplement'),
    bairro:field('deliveryNeighborhood'),
    cep:field('deliveryPostalCode').replace(/\D/g,''),
    cidade:field('deliveryCity'),
    estado:field('deliveryState').toUpperCase()
  };
}
function currentCustomer() {
  return {nome:field('deliveryCustomerName'),telefone:field('deliveryCustomerPhone')};
}
function validateDelivery() {
  const d=currentDelivery(), c=currentCustomer();
  if(c.nome.length<3){showOrderError('Informe seu nome completo nos dados do comprador.');byId('deliveryCustomerName')?.focus();return false;}
  if(c.telefone.replace(/\D/g,'').length<10){showOrderError('Informe um telefone com DDD.');byId('deliveryCustomerPhone')?.focus();return false;}
  if(d.rua.length<3||!d.numero||d.bairro.length<2||d.cep.length!==8||d.cidade.length<2||d.estado.length!==2){
    showOrderError('Preencha rua, número, bairro, CEP, cidade e estado para a entrega.');return false;
  }
  return true;
}
function fillIfBlank(id,value) {
  const el=byId(id);
  if(el && value && !el.value.trim()) el.value=value;
}
// A área do cliente acompanha a sessão: convidado e autenticado não compartilham botões.
function showAccountFeedback(message, type='success') {
  const el=byId('accountFeedback');
  if(!el)return;
  el.textContent=message;
  el.className='account-feedback '+type;
  el.hidden=!message;
}
function showAccountPanel(panel='overview') {
  byId('accountPanelProfile').hidden=panel!=='profile';
  byId('accountPanelOrders').hidden=panel!=='orders';
  if(panel==='profile') byId('accountProfileName')?.focus({preventScroll:true});
}
function accountProfileFields(profile={}) {
  const pairs={
    accountProfileName:profile.nome||currentAccountUser?.user_metadata?.name||'',
    accountProfilePhone:profile.telefone||currentAccountUser?.user_metadata?.phone||'',
    accountProfileStreet:profile.rua||'',
    accountProfileNumber:profile.numero||'',
    accountProfileComplement:profile.complemento||'',
    accountProfileNeighborhood:profile.bairro||'',
    accountProfilePostalCode:profile.cep||'',
    accountProfileCity:profile.cidade||'',
    accountProfileState:profile.estado||''
  };
  Object.entries(pairs).forEach(([id,value])=>{const el=byId(id);if(el)el.value=value;});
}
function renderAccountArea(user, profile=null) {
  byId('accountLoading').hidden=true;
  byId('accountGuest').hidden=Boolean(user);
  byId('accountSignedIn').hidden=!user;
  const heading=byId('accountHeading'),intro=byId('accountIntro');
  if(!user){
    if(heading) heading.textContent='Sua experiência, em um só lugar.';
    if(intro)intro.textContent='Crie sua conta ou entre para acompanhar seus pedidos, manter seus dados de entrega salvos e tornar suas próximas compras mais práticas.';
    if(byId('accountSecurityTip'))byId('accountSecurityTip').textContent='Entre com seu e-mail e sua senha.';
    byId('accountDisplayEmail').textContent='';
    byId('accountOrdersCount').textContent='—';
    byId('accountOrdersList').textContent='Entre na sua conta para consultar seus pedidos.';
    showAccountPanel('overview');
    showAccountFeedback('');
    return;
  }
  const name=profile?.nome && profile.nome!=='Cliente' ? profile.nome
    : user.user_metadata?.name || user.email?.split('@')[0] || 'Cliente';
  const first=name.split(/\s+/)[0];
  byId('accountDisplayName').textContent=name;
  byId('accountDisplayEmail').textContent=user.email||'';
  byId('accountAvatar').textContent=name.split(/\s+/).slice(0,2).map(word=>word[0]||'').join('').toUpperCase()||'V';
  byId('accountVerification').textContent=user.email_confirmed_at?'E-mail confirmado':'Conta ativa';
  if(heading) heading.textContent='Olá, '+first+'. Sua Vinarello.';
  if(intro)intro.textContent='Seu espaço para acompanhar pedidos, atualizar seus dados e continuar descobrindo nossa seleção de vinhos.';
  if(byId('accountSecurityTip'))byId('accountSecurityTip').textContent='Sua sessão permanece salva neste dispositivo.';
}
function clearCustomerFields() {
  ['deliveryCustomerName','deliveryCustomerPhone','deliveryStreet','deliveryNumber',
  'deliveryComplement','deliveryNeighborhood','deliveryPostalCode','deliveryCity','deliveryState']
    .forEach(id=>{if(byId(id))byId(id).value='';});
  byId('accountProfileForm')?.reset();
}
async function loadCustomerProfile(user) {
  if(!user)return null;
  const {data,error}=await requireSupabase().from('vinarello_clientes')
    .select('nome,email,telefone,rua,numero,complemento,bairro,cep,cidade,estado')
    .eq('id',user.id).maybeSingle();
  if(error){console.warn('Perfil ainda não disponível:',error);return null;}
  return data||null;
}
function fillDeliveryFromProfile(profile,user) {
  const p=profile||{};
  fillIfBlank('deliveryCustomerName',p.nome&&p.nome!=='Cliente'?p.nome:user.user_metadata?.name||'');
  fillIfBlank('deliveryCustomerPhone',p.telefone||user.user_metadata?.phone||'');
  fillIfBlank('deliveryStreet',p.rua);
  fillIfBlank('deliveryNumber',p.numero);
  fillIfBlank('deliveryComplement',p.complemento);
  fillIfBlank('deliveryNeighborhood',p.bairro);
  fillIfBlank('deliveryPostalCode',p.cep);
  fillIfBlank('deliveryCity',p.cidade);
  fillIfBlank('deliveryState',p.estado);
  const hint=byId('deliverySaveHint');
  if(hint)hint.textContent='Dados vinculados à sua conta. Ao finalizar, as alterações serão salvas para a próxima compra.';
}
async function updateAccountStatus() {
  const serial=++accountRenderSerial;
  const status=byId('sessionStatus'),logout=byId('logoutButton');
  if(!status)return;
  if(!window.vinarelloDb){
    status.textContent='Conexão indisponível. Confira a configuração do Supabase.';
    if(logout)logout.hidden=true;
    currentAccountUser=null;currentAccountProfile=null;
    renderAccountArea(null);
    return;
  }
  let user=null;
  try {
    const {data,error}=await window.vinarelloDb.auth.getSession();
    if(error)throw error;
    user=data?.session?.user||null;
  } catch(error){
    if(serial!==accountRenderSerial)return;
    console.error('Falha ao consultar sessão:',error);
    status.textContent='Não foi possível verificar sua sessão. Atualize a página e tente novamente.';
    byId('accountLoading').hidden=false;
    return;
  }
  if(serial!==accountRenderSerial)return;
  const previousId=currentAccountUser?.id;
  currentAccountUser=user;
  if(previousId!==user?.id)currentAccountProfile=null;
  if(!user){
    currentAccountProfile=null;
    status.textContent='Você ainda não entrou na sua conta.';
    if(logout)logout.hidden=true;
    const hint=byId('deliverySaveHint');
    if(hint)hint.textContent='Entre na sua conta para salvar seus dados e reutilizá-los nas próximas compras.';
    renderAccountArea(null);
    await loadOrderHistory(null,serial);
    return;
  }
  status.textContent='Conectado: '+(user.email||'sua conta')+' · seus dados ficam salvos';
  if(logout)logout.hidden=false;
  if(previousId!==user.id)showAccountPanel('overview');
  renderAccountArea(user,currentAccountProfile);
  const profile=await loadCustomerProfile(user);
  if(serial!==accountRenderSerial)return;
  currentAccountProfile=profile;
  renderAccountArea(user,profile);
  if(previousId!==user.id || byId('accountPanelProfile').hidden)accountProfileFields(profile||{});
  fillDeliveryFromProfile(profile,user);
  await loadOrderHistory(user,serial);
}

async function loadOrderHistory(user,serial=accountRenderSerial) {
  const list=byId('orderHistoryList'),empty=document.querySelector('.history-empty');
  const accountList=byId('accountOrdersList'),count=byId('accountOrdersCount');
  if(!list||!empty)return;
  list.innerHTML='';
  if(!user){
    empty.textContent='Entre na sua conta para consultar seus pedidos.';empty.hidden=false;
    if(accountList)accountList.textContent='Entre para consultar seus pedidos.';
    if(count)count.textContent='—';
    return;
  }
  empty.textContent='Carregando seus pedidos...';empty.hidden=false;
  if(accountList)accountList.textContent='Carregando seus pedidos…';
  try {
    const {data,error}=await requireSupabase().from('vinarello_pedidos')
      .select('numero,pagamento,total,status,criado_em,pagamento_resultado_simulado')
      .eq('cliente_id',user.id)
      .order('criado_em',{ascending:false}).limit(20);
    if(error)throw error;
    if(serial!==accountRenderSerial)return;
    if(count)count.textContent=String(data?.length||0);
    if(!data?.length){
      empty.textContent='Você ainda não possui pedidos.';
      if(accountList)accountList.innerHTML='<div class="account-empty-orders"><span aria-hidden="true">◇</span><strong>Nenhum pedido ainda</strong><p>Quando você fizer sua primeira compra, ela aparecerá aqui.</p><a href="#vinhos">Explorar vinhos →</a></div>';
      return;
    }
    empty.hidden=true;
    const labels={
      aguardando_pagamento:'Aguardando pagamento',aguardando_confirmacao:'Aguardando confirmação',
      pago:'Pago',em_separacao:'Em separação',enviado:'Enviado',entregue:'Entregue',
      cancelado:'Cancelado',reembolsado:'Reembolsado'
    };
    const html=data.map(order=>{
      const date=new Date(order.criado_em).toLocaleDateString('pt-BR');
      const total=Number(order.total).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
      const statusLabel=labels[order.status]||order.status;
      const simLabel=({aprovado:'Simulação aprovada',pendente:'Simulação pendente',recusado:'Simulação recusada'})[order.pagamento_resultado_simulado]||'Sem simulação';
      return `<div class="history-item"><span><strong>${escapeHTML(order.numero)}</strong><br><small>${date} · ${escapeHTML(order.pagamento)} · ${escapeHTML(statusLabel)} · ${escapeHTML(simLabel)}</small></span><strong>${total}</strong></div>`;
    }).join('');
    list.innerHTML=html;
    if(accountList)accountList.innerHTML=html;
  } catch(error){
    if(serial!==accountRenderSerial)return;
    empty.textContent='Não foi possível carregar o histórico. Confira as permissões do banco.';
    if(accountList)accountList.textContent='Não foi possível carregar os pedidos. Tente atualizar a página.';
    if(count)count.textContent='—';
    console.error('Falha no histórico:',error);
  }
}

async function saveAccountProfile(event) {
  event.preventDefault();
  if(profileSaveBusy)return;
  const user=currentAccountUser;
  if(!user){showAccountFeedback('Entre na sua conta antes de atualizar seus dados.','error');return;}
  const profile={
    nome:field('accountProfileName'),telefone:field('accountProfilePhone'),
    rua:field('accountProfileStreet'),numero:field('accountProfileNumber'),
    complemento:field('accountProfileComplement'),bairro:field('accountProfileNeighborhood'),
    cep:field('accountProfilePostalCode').replace(/\D/g,''),
    cidade:field('accountProfileCity'),estado:field('accountProfileState').toUpperCase(),
    atualizado_em:new Date().toISOString()
  };
  if(profile.nome.length<3 || profile.telefone.replace(/\D/g,'').length<10){
    showAccountFeedback('Preencha seu nome completo e um telefone com DDD.','error');return;
  }
  const address=[profile.rua,profile.numero,profile.bairro,profile.cep,profile.cidade,profile.estado];
  if(address.some(Boolean) && (!address.every(Boolean)||profile.cep.length!==8||profile.estado.length!==2)){
    showAccountFeedback('Para salvar o endereço, preencha rua, número, bairro, CEP com 8 dígitos, cidade e UF.','error');return;
  }
  const button=byId('accountSaveButton');
  profileSaveBusy=true;
  if(button){button.disabled=true;button.textContent='Salvando…';}
  try {
    const {data:{user:verifiedUser},error:authError}=await requireSupabase().auth.getUser();
    if(authError||!verifiedUser||verifiedUser.id!==user.id)throw new Error('Sua sessão expirou. Entre novamente.');
    const {data,error}=await requireSupabase().from('vinarello_clientes')
      .update(profile).eq('id',user.id).select('id').maybeSingle();
    if(error)throw error;
    if(!data)throw new Error('Seu perfil não foi encontrado no banco. Verifique se o cadastro automático foi instalado.');
    currentAccountProfile={...(currentAccountProfile||{}),...profile};
    // As próximas compras usam os dados atualizados pelo cliente.
    const map={deliveryCustomerName:'nome',deliveryCustomerPhone:'telefone',deliveryStreet:'rua',
      deliveryNumber:'numero',deliveryComplement:'complemento',deliveryNeighborhood:'bairro',
      deliveryPostalCode:'cep',deliveryCity:'cidade',deliveryState:'estado'};
    Object.entries(map).forEach(([id,key])=>{const el=byId(id);if(el)el.value=profile[key]||'';});
    renderAccountArea(user,currentAccountProfile);
    showAccountPanel('overview');
    showAccountFeedback('Seus dados foram atualizados com sucesso.','success');
  } catch(error){
    console.error('Não foi possível salvar o perfil:',error);
    showAccountFeedback(readableError(error),'error');
  } finally {
    profileSaveBusy=false;
    if(button){button.disabled=false;button.textContent='Salvar alterações';}
  }
}

async function logoutCustomer() {
  try {
    const {error}=await requireSupabase().auth.signOut();
    if(error)throw error;
    clearCustomerFields();
    currentAccountUser=null;currentAccountProfile=null;
    await updateAccountStatus();
    byId('minha-conta')?.scrollIntoView({behavior:'smooth',block:'start'});
  } catch(error){
    showAccountFeedback(readableError(error),'error');
    showOrderError(readableError(error));
  }
}
function getSimulatedPaymentResult(){return byId('simulatedPaymentResult')?.value||'aprovado';}
function showOrderError(message) {
  const result=byId('orderResult');if(!result)return;
  result.innerHTML='<h3>Não foi possível finalizar o pedido</h3><p>'+escapeHTML(message)+'</p><p>Seu carrinho foi preservado. Corrija os dados e tente novamente.</p>';
  result.classList.add('active');result.scrollIntoView({behavior:'smooth',block:'center'});
}
function newOrderId() {
  if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
async function finishPurchase() {
  if(orderBusy||accountBusy)return;
  if(!cart.length){alert('Seu carrinho está vazio. Adicione um produto antes de finalizar.');return;}
  if(!validatePayment())return;
  if(!validateDelivery())return;
  try {
    const {data,error}=await requireSupabase().auth.getSession();
    if(error)throw error;
    if(!data.session){customerMode='register';openCustomerModal();return;}
    await completeOrder();
  } catch(error){showOrderError(readableError(error));}
}
async function completeOrder() {
  if(orderBusy)return;
  const selected=getSelectedPayment();
  if(!cart.length||!selected||!validatePayment()||!validateDelivery()){
    showOrderError('Confira carrinho, forma de pagamento, idade e endereço de entrega.');return;
  }
  setOrderBusy(true);
  try {
    const db=requireSupabase();
    const {data:authData,error:authError}=await db.auth.getUser();
    if(authError||!authData.user)throw new Error('Sua sessão expirou. Entre novamente.');
    const items=cart.map(item=>({nome:item.name,quantidade:Number(item.quantity)}));
    const endereco=currentDelivery(),cliente=currentCustomer();
    const fingerprint=JSON.stringify([authData.user.id,selected.value,items,endereco,cliente]);
    if(fingerprint!==pendingOrderFingerprint){pendingOrderFingerprint=fingerprint;pendingOrderId=newOrderId();}
    const {data:order,error}=await db.rpc('vinarello_criar_pedido',{
      p_id:pendingOrderId,
      p_pagamento:selected.value,
      p_itens:items,
      p_endereco:endereco,
      p_cliente:cliente,
      p_resultado_simulado:getSimulatedPaymentResult()
    });
    if(error)throw error;
    if(!order||typeof order.numero!=='string'||!Number.isFinite(Number(order.total)))
      throw new Error('O banco não retornou uma confirmação válida.');
    const orderNumber=order.numero,total=Number(order.total);
    const simulatedResult=order.pagamento_resultado_simulado||getSimulatedPaymentResult();
    const simulatedLabel=({aprovado:'Aprovado na simulação',pendente:'Pendente na simulação',recusado:'Recusado na simulação'})[simulatedResult]||'Resultado simulado';
    // O pedido é salvo como aguardando_pagamento. Nenhum pagamento é falsamente aprovado.
    clearCart();pendingOrderId=null;pendingOrderFingerprint=null;
    clearDemoCardFields();selected.checked=false;byId('paymentFields').innerHTML='<p class="payment-placeholder">Pedido registrado. Escolha novamente uma forma de pagamento para outro pedido.</p>';
    const result=byId('orderResult');
    result.innerHTML=`
      <h3>Pedido registrado com sucesso!</h3>
      <p>Pedido: <strong>${escapeHTML(orderNumber)}</strong></p>
      <p>Cliente: <strong>${escapeHTML(cliente.nome)}</strong></p>
      <p>Total: <strong>R$ ${formatMoney(total)}</strong></p>
      <p>Status do pedido: <strong>Aguardando confirmação</strong></p>
      <p>Resultado do pagamento: <strong>${escapeHTML(simulatedLabel)}</strong></p>
      <p>Pedido e itens gravados no Supabase. Esta é uma simulação acadêmica: nenhuma cobrança ou transferência aconteceu.</p>`;
    result.classList.add('active');result.scrollIntoView({behavior:'smooth',block:'center'});
    await updateAccountStatus();
  } catch(error) {
    console.error('Erro ao registrar pedido no Supabase:',error);
    showOrderError(readableError(error));
  } finally {setOrderBusy(false);}
}

document.addEventListener('DOMContentLoaded',()=>{
  updateAccountStatus();
  if(window.vinarelloDb){
    window.vinarelloDb.auth.onAuthStateChange((event,session)=>{
      // Evita operações pesadas dentro do callback síncrono do Auth.
      if(event==='SIGNED_OUT') clearCustomerFields();
      if(['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT','USER_UPDATED','TOKEN_REFRESHED'].includes(event)){
        setTimeout(()=>updateAccountStatus(),0);
      }
    });
  }
});
