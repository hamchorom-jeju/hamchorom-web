const API_URL = "https://script.google.com/macros/s/AKfycbwKwOXlmPrtKs4B7fwOMXUXxwZDifr6O04xscGNSse-X9rQojOzApdn-38e2B0UjgwD/exec";

let allProducts = [];
let cart = {}; // { "상품명": { quantity: 1, price: 35000 } }
let currentStep = 1;
let deliveryType = "";
let renderedOrders = [];
let editCart = {};
let editingOrderIndex = -1;

// 회원제 및 커뮤니티 전역 상태 변수
let currentUser = null;
let forumPosts = [];
let selectedPost = null;
let activeClientTab = "home";

// 로컬 테스트용 모의 데이터 (API 연결 실패시 대비)
const MOCK_PRODUCTS = [
  { "카테고리": "한라봉", "상태": "판매중", "상품명": "함초롬 명품 한라봉 5kg", "중량": "5kg", "과수": "15-18과", "가격": 45000, "사진": "https://lh3.googleusercontent.com/d/1pOnBm27Zkhgq6H9DQr4EeiW-MCPHkXHx" },
  { "카테고리": "레드향", "상태": "판매중", "상품명": "꼬마 레드향 5kg", "중량": "5kg", "과수": "30-35과", "가격": 35000, "사진": "https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?auto=format&fit=crop&w=300&q=80" },
  { "카테고리": "반반세트", "상태": "판매중", "상품명": "레드향+한라봉 반반세트 5kg", "중량": "5kg", "과수": "20과 내외", "가격": 40000, "사진": "https://images.unsplash.com/photo-1557800636-894a64c1696f?auto=format&fit=crop&w=300&q=80" }
];

document.addEventListener("DOMContentLoaded", () => {
  fetchProducts();
  initializeUserSession();
});

// --- 0. 회원제 (USER LOGINS / SESSIONS) ---
function initializeUserSession() {
  const savedUser = localStorage.getItem('hamchorom_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    refreshUserProfile();
  }
}

async function refreshUserProfile() {
  if (!currentUser) return;
  try {
    const res = await fetch(`${API_URL}?action=getMemberProfile&phone=${currentUser.phone}`);
    const result = await res.json();
    if (result.success) {
      currentUser = result.profile;
      localStorage.setItem('hamchorom_user', JSON.stringify(currentUser));
      renderMyPage(result.orders);
    }
  } catch (e) {
    console.warn("프로필 갱신 실패 (오프라인 모드 데이터 유지)", e);
    renderMyPage();
  }
}

// 탭 전환 엔진
function switchClientTab(tabName) {
  activeClientTab = tabName;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  
  document.getElementById(`tab-${tabName}`).classList.add('active');
  const btn = document.getElementById(`nav-btn-${tabName}`);
  if (btn) btn.classList.add('active');
  
  if (tabName === 'community') {
    fetchForumPosts();
  } else if (tabName === 'mypage') {
    if (currentUser) {
      refreshUserProfile();
    } else {
      renderMyPage();
    }
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// PIN 번호 박스 포커스 이동 처리
function moveNextClientPin(input, idx) {
  if (input.value.length === 1 && idx < 4) {
    document.getElementById(`cpin-${idx + 1}`).focus();
  }
}

// 로그인 액션
async function submitClientLogin() {
  const phone = document.getElementById('loginPhone').value.trim();
  let pin = "";
  for (let i = 1; i <= 4; i++) {
    pin += document.getElementById(`cpin-${i}`).value;
  }
  
  if (!phone || pin.length < 4) {
    return alert("전화번호와 4자리 비밀번호를 모두 입력해 주세요.");
  }
  
  try {
    const payload = {
      action: "login",
      phone: phone,
      password: pin
    };
    
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    const result = await res.json();
    
    if (result.success) {
      currentUser = result.member;
      localStorage.setItem('hamchorom_user', JSON.stringify(currentUser));
      
      // 입력창 초기화
      document.getElementById('loginPhone').value = "";
      for (let i = 1; i <= 4; i++) {
        document.getElementById(`cpin-${i}`).value = "";
      }
      
      alert(`🍊 반갑습니다, ${currentUser.nickname}님! 단골 회원이 인증되었습니다.`);
      refreshUserProfile();
    } else {
      alert("❌ 로그인 실패: " + result.message);
    }
  } catch (e) {
    alert("서버 연결 실패: " + e.message);
  }
}

// 로그아웃 액션
function submitClientLogout() {
  if (confirm("로그아웃 하시겠습니까?")) {
    currentUser = null;
    localStorage.removeItem('hamchorom_user');
    renderMyPage();
    alert("로그아웃 완료되었습니다.");
  }
}

// 회원가입 모달 열기/닫기
function openRegisterModal() {
  document.getElementById('registerModal').style.display = 'flex';
}
function closeRegisterModal() {
  document.getElementById('registerModal').style.display = 'none';
}

// 회원가입 액션
async function submitClientRegister() {
  const phone = document.getElementById('regPhone').value.trim();
  const nickname = document.getElementById('regNickname').value.trim();
  const password = document.getElementById('regPassword').value.trim();
  
  if (!phone || !nickname || password.length < 4) {
    return alert("휴대폰 번호, 닉네임, 4자리 비밀번호를 정확히 채워주세요.");
  }
  
  try {
    const payload = {
      action: "register",
      phone, nickname, password
    };
    
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    const result = await res.json();
    
    if (result.success) {
      alert(result.message);
      closeRegisterModal();
      document.getElementById('loginPhone').value = phone;
      document.getElementById('cpin-1').focus();
    } else {
      alert("회원가입 실패: " + result.message);
    }
  } catch (e) {
    alert("서버 연결 실패: " + e.message);
  }
}

// 마이페이지 렌더링 (로그인 / 미로그인 레이아웃 전환)
function renderMyPage(orders = []) {
  const loggedOutCard = document.getElementById('mypage-logged-out');
  const loggedInCard = document.getElementById('mypage-logged-in');
  
  if (!currentUser) {
    loggedOutCard.style.display = 'block';
    loggedInCard.style.display = 'none';
  } else {
    loggedOutCard.style.display = 'none';
    loggedInCard.style.display = 'block';
    
    document.getElementById('userNickname').innerText = currentUser.nickname;
    document.getElementById('userGrade').innerText = currentUser.grade || '일반';
    document.getElementById('userPhoneDisplay').innerText = fixPhone(currentUser.phone);
    document.getElementById('userPoints').innerText = Number(currentUser.points || 0).toLocaleString();
    
    // 주문 내역 리스트 주입
    const myOrdersList = document.getElementById('myOrdersList');
    myOrdersList.innerHTML = "";
    
    if (orders.length === 0) {
      myOrdersList.innerHTML = `<p style="text-align:center; font-size:0.9rem; color:var(--text-mute); padding:20px;">📦 최근 주문 이력이 없습니다.</p>`;
      return;
    }
    
    orders.forEach(order => {
      let statusClass = "badge-pending";
      let normStatus = (order.status || "").replace(/\s+/g, '');
      if (normStatus.includes("입금확인")) statusClass = "badge-deposit";
      else if (normStatus.includes("준비")) statusClass = "badge-preparing";
      else if (normStatus.includes("발송") || normStatus.includes("배송")) statusClass = "badge-shipped";

      let datePart = String(order.orderId || "").substring(0, 10);
      
      const div = document.createElement('div');
      div.className = "lookup-card";
      div.innerHTML = `
        <div style="font-size:0.85rem; color:#888; font-weight:bold; margin-bottom:5px;">주문코드: ${order.orderId}</div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong style="color:var(--primary-color);">${order.items}</strong>
          <span class="badge ${statusClass}">${order.status}</span>
        </div>
        <div class="meta" style="font-size:0.8rem; line-height:1.6;">
          <div><strong>수령인:</strong> ${order.receiver} 님</div>
          <div><strong>운송장:</strong> ${order.tracking !== "-" ? `<span style="color:#1976D2; font-weight:bold;">${order.tracking}</span>` : '출하 준비 중'}</div>
        </div>
      `;
      myOrdersList.appendChild(div);
    });
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --- 1. API FETCH LOGIC (PRODUCTS) ---
async function fetchProducts() {
  const container = document.getElementById('productGrid');
  const loader = document.getElementById('loadingProducts');
  
  try {
    const res = await fetch(`${API_URL}?action=getProducts`);
    let data = await res.json();
    
    if(data.data) data = data.data; 
    allProducts = data;

    if(allProducts.length === 0) throw new Error("가져온 상품 데이터가 없습니다.");
  } catch(err) {
    console.warn("상품 API 호출 실패, 임시(MOCK) 데이터를 사용합니다.", err);
    allProducts = MOCK_PRODUCTS;
  }

  loader.style.display = 'none';
  renderCategories();
  renderProducts("All");
}

// --- RENDER LOGIC ---
function renderCategories() {
  const tabs = document.getElementById('categoryTabs');
  const categories = new Set(allProducts.map(p => p['품종'] || p['카테고리'] || p.category || p.variety || '기타'));
  
  let html = `<button class="tab-btn active" onclick="renderProducts('All', this)">전체보기</button>`;
  categories.forEach(cat => {
    html += `<button class="tab-btn" onclick="renderProducts('${cat}', this)">${cat}</button>`;
  });
  tabs.innerHTML = html;
}

function renderProducts(category, element) {
  if(element) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
  }

  const grid = document.getElementById('productGrid');
  grid.innerHTML = "";

  const filtered = category === "All" ? allProducts : allProducts.filter(p => (p['품종'] || p['카테고리'] || p.category || p.variety || '기타') === category);

  filtered.sort((a, b) => {
    const stockA = parseInt(a.stock) || 0;
    const stockB = parseInt(b.stock) || 0;
    const isASoldOut = a.status === '품절' || stockA <= 0;
    const isBSoldOut = b.status === '품절' || stockB <= 0;
    
    if (isASoldOut && !isBSoldOut) return 1;
    if (!isASoldOut && isBSoldOut) return -1;
    return 0; 
  });

  filtered.forEach(p => {
    const name = p['상품명'] || p.name;
    const priceRaw = String(p['판매가'] || p['가격'] || p.price || "0").replace(/[^0-9]/g, '');
    const price = parseInt(priceRaw) || 0;
    const weight = p['중량'] || p.weight || '';
    const count = p['과수'] || p.count || '';
    const imgFromSheet = p['사진링크'] || p['사진'] || p.image;
    let imgUrl = imgFromSheet || "https://images.unsplash.com/photo-1557800636-894a64c1696f?auto=format&fit=crop&w=300&q=80";
    
    if (name.includes("한라봉") && (!imgFromSheet || imgFromSheet.includes("unsplash"))) {
      imgUrl = "https://lh3.googleusercontent.com/d/1pOnBm27Zkhgq6H9DQr4EeiW-MCPHkXHx";
    }
    
    const stock = parseInt(p.stock) || 0;
    const isSoldOut = p.status === "품절" || stock <= 0;
    const currentQty = cart[name] ? cart[name].quantity : 0;

    let stockText = "";
    if (isSoldOut) {
      stockText = " | 품절";
    } else if (stock < 50) {
      stockText = ` | <span style="color:#D84315; font-weight:bold;">재고: ${stock}박스 (마감임박!)</span>`;
    }

    const card = document.createElement('div');
    card.className = `p-card ${isSoldOut ? 'sold-out' : ''}`;
    card.style.opacity = isSoldOut ? "0.6" : "1";
    
    card.innerHTML = `
      <img src="${imgUrl}" class="p-img" alt="${name}" style="cursor:pointer; ${isSoldOut ? 'filter: grayscale(100%);' : ''}" onclick="showProductDetail('${name.replace(/'/g, "\\'")}')">
      <div class="p-info">
        <div class="p-title">${name} ${isSoldOut ? '<span style="color:red; font-size:0.8rem;">[품절]</span>' : ''}</div>
        <div class="p-meta">${weight} ${count ? '| ' + count : ''} ${stockText}</div>
        <div class="p-price">${price.toLocaleString()}원</div>
        
        <div class="p-action">
          <span>${isSoldOut ? '품절되었습니다' : '수량선택'}</span>
          <div class="qty-control" style="${isSoldOut ? 'pointer-events:none; opacity:0.5;' : ''}">
            <button class="qty-btn" onclick="updateQty('${name}', -1, ${price}, ${stock})">-</button>
            <div class="qty-val" id="qty-${name}">${currentQty}</div>
            <button class="qty-btn" onclick="updateQty('${name}', 1, ${price}, ${stock})">+</button>
          </div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function showProductDetail(name) {
  if (!allProducts) return;
  const p = allProducts.find(x => (x['상품명'] || x.name) === name);
  if (!p) return;

  let desc = p.desc || "상세 설명이 등록되지 않았습니다.";
  
  let raw = p.image || p['사진'] || "";
  let finalImg = "";
  if (raw) {
    if (raw.toLowerCase().includes('thumbnail?id=')) {
        finalImg = raw;
    } else if (raw.includes('id=')) {
        let fId = raw.split('id=')[1].split('&')[0];
        finalImg = `https://drive.google.com/thumbnail?id=${fId}&sz=w800`;
    } else if (raw.includes('/d/')) {
        let fId = raw.split('/d/')[1].split('/')[0];
        finalImg = `https://drive.google.com/thumbnail?id=${fId}&sz=w800`;
    } else if (raw.length > 10) {
        finalImg = raw;
    }
  }

  openStoryModal({
      title: name,
      content: desc,
      imageUrl: finalImg,
      btnText: "주문하러 가기"
  });
}

// --- CART LOGIC ---
function updateQty(name, change, price, stock) {
  if(!cart[name]) cart[name] = { quantity: 0, price: price };
  
  const newQty = cart[name].quantity + change;
  if (newQty > stock) {
    alert(`죄송합니다. 현재 재고가 ${stock}박스뿐입니다.`);
    return;
  }
  
  cart[name].quantity = newQty;
  if(cart[name].quantity < 0) cart[name].quantity = 0;
  
  const qtyEl = document.getElementById(`qty-${name}`);
  if(qtyEl) qtyEl.innerText = cart[name].quantity;

  if(cart[name].quantity === 0) delete cart[name];
  updateCartBar();
}

function updateCartBar() {
  const cartBar = document.getElementById('cartBar');
  let total = 0;
  let count = 0;

  for(let key in cart) {
    total += cart[key].price * cart[key].quantity;
    count += cart[key].quantity;
  }

  document.getElementById('totalPriceDisplay').innerText = total.toLocaleString() + "원";
  cartBar.style.display = count > 0 ? "flex" : "none";
}

// --- CHECKOUT LOGIC ---
function startCheckout() {
  document.getElementById('checkoutOverlay').style.display = 'flex';
  
  // 로그인 시 회원정보 자동 기입 및 포인트 영역 활성화
  const ptsContainer = document.getElementById('pointsDiscountContainer');
  if (currentUser) {
    document.getElementById('senderName').value = currentUser.nickname || '';
    document.getElementById('senderPhone').value = currentUser.phone || '';
    document.getElementById('nickname').value = currentUser.nickname || '';
    
    ptsContainer.style.display = 'flex';
    document.getElementById('checkoutUserPoints').innerText = currentUser.points;
    document.getElementById('usePointsAmount').value = 0;
    document.getElementById('usePointsAmount').max = currentUser.points;
  } else {
    ptsContainer.style.display = 'none';
  }
  
  let summaryText = "";
  let total = 0;
  for(let key in cart) {
    summaryText += `${key} (${cart[key].quantity}개)<br>`;
    total += cart[key].price * cart[key].quantity;
  }
  document.getElementById('summaryItems').innerHTML = summaryText;
  document.getElementById('summaryTotal').innerText = `총 결제금액: ${total.toLocaleString()}원`;
  
  goToStep(1);
}

function calculatePointsUsage() {
  if (!currentUser) return;
  const input = document.getElementById('usePointsAmount');
  let amount = parseInt(input.value) || 0;
  
  let totalOrderAmount = 0;
  for (let key in cart) {
    totalOrderAmount += cart[key].price * cart[key].quantity;
  }
  
  if (amount < 0) amount = 0;
  if (amount > currentUser.points) amount = currentUser.points;
  if (amount > totalOrderAmount) amount = totalOrderAmount;
  
  input.value = amount;
  
  const finalPaid = totalOrderAmount - amount;
  document.getElementById('summaryTotal').innerText = `총 결제금액: ${finalPaid.toLocaleString()}원 (포인트 사용: -${amount.toLocaleString()}원)`;
}

function closeCheckout() {
  document.getElementById('checkoutOverlay').style.display = 'none';
}

function nextStep(current, next) {
  if(current === 1) {
    const sName = document.getElementById('senderName').value;
    const sPhone = document.getElementById('senderPhone').value;
    if(!sName || !sPhone) return alert("필수 정보를 입력해주세요!");
  }
  if(current === 2) {
    if(!deliveryType) return alert("수령 방식을 선택해주세요.");
    const rName = document.getElementById('receiverName').value.trim();
    const rPhone = document.getElementById('receiverPhone').value.trim();
    const rAddr = document.getElementById('receiverAddress').value.trim();
    const rAddrDetail = document.getElementById('receiverAddressDetail').value.trim();
    
    if(!rName || !rPhone || !rAddr || !rAddrDetail) {
      return alert("받는 분 성함, 연락처, 주소(상세주소 포함)를 모두 정확히 입력해주세요.");
    }
  }
  goToStep(next);
}

function prevStep(current, prev) { goToStep(prev); }

function goToStep(step) {
  document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
  document.getElementById(`step-${step}`).classList.add('active');
  
  document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
  for(let i=1; i<=step; i++) {
      document.getElementById(`indicator-${i}`).classList.add('active');
  }
  currentStep = step;
}

function selectDelivery(type) {
  deliveryType = type;
  document.getElementById('btn-self').classList.remove('selected');
  document.getElementById('btn-gift').classList.remove('selected');
  document.getElementById(`btn-${type}`).classList.add('selected');

  document.getElementById('receiverForm').style.display = 'block';
  document.getElementById('nextBtn2').disabled = false;
  const giftMsgContainer = document.getElementById('giftMsgContainer');
  if (type === 'self') {
    document.getElementById('receiverName').value = document.getElementById('senderName').value;
    document.getElementById('receiverPhone').value = document.getElementById('senderPhone').value;
    document.getElementById('receiverAddress').value = "";
    document.getElementById('receiverAddressDetail').value = "";
    giftMsgContainer.style.display = 'none';
    document.getElementById('giftMessage').value = "";
  } else {
    document.getElementById('receiverName').value = "";
    document.getElementById('receiverPhone').value = "";
    document.getElementById('receiverAddress').value = "";
    document.getElementById('receiverAddressDetail').value = "";
    giftMsgContainer.style.display = 'block';
  }

  const sPhone = document.getElementById('senderPhone').value;
  if (sPhone) checkAddressHistory(sPhone, type);
}

// --- SUBMIT ORDER (POST 15 Columns + 포인트 차감 연계) ---
async function submitFinalOrder() {
  const submitBtn = document.getElementById('submitOrderBtn');
  const originalText = submitBtn.innerText;
  submitBtn.innerText = "재고 확인 중..."; submitBtn.disabled = true;

  const urlParams = new URLSearchParams(window.location.search);
  const orderPathVal = urlParams.get('from') || '웹앱_직접';

  const itemsArray = Object.keys(cart).map(k => ({
    name: k,
    quantity: cart[k].quantity,
    price: cart[k].price
  }));

  let itemDetailsStr = itemsArray.map(item => `${item.name} x ${item.quantity}`).join(", ");
  
  let totalAmount = 0;
  for(let k in cart) totalAmount += cart[k].price * cart[k].quantity;

  const usedPoints = currentUser ? (parseInt(document.getElementById('usePointsAmount').value) || 0) : 0;

  const baseAddr = document.getElementById('receiverAddress').value.trim();
  const detailAddr = document.getElementById('receiverAddressDetail').value.trim();
  const fullAddress = baseAddr ? `${baseAddr} ${detailAddr}` : "";

  const payload = {
    timestampId: new Date().toISOString(),
    wishDate: document.getElementById('wishDate').value || '',
    receiverName: document.getElementById('receiverName').value,
    receiverPhone: document.getElementById('receiverPhone').value,
    receiverAddress: fullAddress,
    depositorName: document.getElementById('depositorName').value || document.getElementById('senderName').value,
    senderName: deliveryType === 'gift' ? document.getElementById('senderName').value : '',
    senderPhone: document.getElementById('senderPhone').value,
    itemDetails: itemDetailsStr,
    items: itemsArray,
    nickname: document.getElementById('nickname').value || '',
    deliveryMsg: document.getElementById('deliveryMsg').value || '',
    orderPath: orderPathVal,
    giftMessage: document.getElementById('giftMessage').value || '',
    orderCheck: false,
    totalAmount: totalAmount,
    usedPoints: usedPoints
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch(e) {
      if (text.includes("Success") || text.includes("완료")) {
         result = { success: true };
      } else {
         throw new Error("서버 응답 파싱 실패");
      }
    }

    if (result.success) {
        closeCheckout();
        document.getElementById('successModal').style.display = 'flex';
        // 포인트 즉시 로컬 반영 차감
        if (currentUser && usedPoints > 0) {
          currentUser.points = Math.max(0, currentUser.points - usedPoints);
          localStorage.setItem('hamchorom_user', JSON.stringify(currentUser));
        }
    } else {
        alert("⚠️ 주문 실패: " + (result.message || "알 수 없는 오류"));
        submitBtn.innerText = originalText;
        submitBtn.disabled = false;
    }
    
  } catch(err) {
    console.error("Submit error:", err);
    if (err.message.includes("재고")) {
      alert(err.message);
    } else {
      closeCheckout();
      document.getElementById('successModal').style.display = 'flex';
    }
    submitBtn.innerText = originalText;
    submitBtn.disabled = false;
  }
}

// --- 2. 커뮤니티 전용 기능 (COMMUNITY FORUM LOGIC) ---
async function fetchForumPosts(category = "All") {
  const feed = document.getElementById('postsFeed');
  feed.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-mute);">🌱 따뜻한 소통글을 불러오는 중...</div>`;
  
  const requester = currentUser ? currentUser.phone : "";
  try {
    const res = await fetch(`${API_URL}?action=getPosts&requesterPhone=${encodeURIComponent(requester)}&category=${encodeURIComponent(category)}`);
    const result = await res.json();
    
    if (result.success) {
      forumPosts = result.data || [];
      renderForumPosts();
    } else {
      throw new Error(result.message);
    }
  } catch(e) {
    console.error(e);
    feed.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-mute);">소통글을 불러오지 못했습니다. 로그인 후 다시 확인해 보세요.</div>`;
  }
}

function filterForumPosts(cat, btn) {
  // Active tab styling
  const row = btn.parentNode;
  row.querySelectorAll('button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  
  fetchForumPosts(cat);
}

function renderForumPosts() {
  const feed = document.getElementById('postsFeed');
  feed.innerHTML = "";
  
  if (forumPosts.length === 0) {
    feed.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-mute);">첫 번째 따뜻한 이야기의 주인공이 되어보세요! 🌱</div>`;
    return;
  }
  
  forumPosts.forEach(post => {
    const card = document.createElement('div');
    card.className = "forum-card";
    card.onclick = () => openPostDetail(post.postId);
    
    let dateStr = String(post.writeDate || "").substring(0, 10);
    let imageIndicator = post.imageId ? `<span style="color:var(--primary-color); font-size:0.8rem; margin-left:5px;">🖼️ 사진 첨부됨</span>` : "";
    
    card.innerHTML = `
      <div class="forum-card-header">
        <span>[${post.category}] <strong>${post.authorNickname}</strong></span>
        <span>${dateStr}</span>
      </div>
      <div class="forum-card-body">
        <h3>${post.title} ${imageIndicator}</h3>
        <p>${post.content}</p>
      </div>
      <div class="forum-card-footer">
        <div class="forum-stat"><i data-lucide="heart" style="${post.userLiked ? 'fill:red; stroke:red;' : ''}"></i> <span>좋아요 ${post.likeCount}</span></div>
        <div class="forum-stat"><i data-lucide="message-square"></i> <span>댓글 ${post.commentCount}</span></div>
      </div>
    `;
    feed.appendChild(card);
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openWriteModal() {
  if (!currentUser) {
    alert("소통방 글쓰기는 회원 전용 기능입니다. 마이페이지에서 먼저 간편 가입/로그인을 완료해 주세요!");
    switchClientTab('mypage');
    return;
  }
  document.getElementById('postWriteModal').style.display = 'flex';
}

function closeWriteModal() {
  document.getElementById('postWriteModal').style.display = 'none';
}

// 신규 게시글 등록
async function submitNewForumPost() {
  const category = document.getElementById('postCategory').value;
  const title = document.getElementById('postTitle').value.trim();
  const content = document.getElementById('postContent').value.trim();
  const rawImg = document.getElementById('postImageId').value.trim();
  
  if (!title || !content) return alert("제목과 내용은 필수 입력사항입니다.");
  
  let imageId = rawImg;
  if (rawImg.includes("id=")) {
    imageId = rawImg.split("id=")[1].split("&")[0];
  } else if (rawImg.includes("/d/")) {
    imageId = rawImg.split("/d/")[1].split("/")[0];
  }

  try {
    const payload = {
      action: "createPost",
      phone: currentUser.phone,
      category, title, content, imageId
    };
    
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    const result = await res.json();
    
    if (result.success) {
      alert("🎉 게시글이 등록되었습니다! 소통 보너스 100포인트가 적립되었습니다. 🌱");
      closeWriteModal();
      // 입력창 청소
      document.getElementById('postTitle').value = "";
      document.getElementById('postContent').value = "";
      document.getElementById('postImageId').value = "";
      fetchForumPosts();
      refreshUserProfile();
    } else {
      alert("글 등록 실패: " + result.message);
    }
  } catch (e) {
    alert("서버 연결 실패: " + e.message);
  }
}

// 게시글 상세 조회 및 댓글 목록 불러오기
async function openPostDetail(postId) {
  selectedPost = forumPosts.find(p => p.postId === postId);
  if (!selectedPost) return;
  
  document.getElementById('detailCategory').innerText = selectedPost.category;
  document.getElementById('detailAuthorAndDate').innerText = `${selectedPost.authorNickname} | ${String(selectedPost.writeDate || '').substring(0, 16)}`;
  document.getElementById('detailTitle').innerText = selectedPost.title;
  document.getElementById('detailContent').innerText = selectedPost.content;
  document.getElementById('detailLikeCount').innerText = selectedPost.likeCount;
  document.getElementById('detailCommentCount').innerText = selectedPost.commentCount;
  
  // 이미지 표시
  const detailImg = document.getElementById('detailImg');
  if (selectedPost.imageId && selectedPost.imageId.length > 5) {
    detailImg.src = `https://drive.google.com/thumbnail?id=${selectedPost.imageId}&sz=w600`;
    detailImg.style.display = 'block';
  } else {
    detailImg.style.display = 'none';
  }
  
  // 좋아요 아이콘 활성화 처리
  const likeBtn = document.getElementById('postLikeBtn');
  if (selectedPost.userLiked) {
    likeBtn.style.background = "#FFEBEE";
    likeBtn.style.color = "#C62828";
  } else {
    likeBtn.style.background = "var(--primary-light)";
    likeBtn.style.color = "var(--primary)";
  }
  
  // 댓글 목록 조회
  fetchComments(postId);
  
  document.getElementById('postDetailModal').style.display = 'flex';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closePostDetailModal() {
  document.getElementById('postDetailModal').style.display = 'none';
  selectedPost = null;
}

// 특정 글의 댓글들을 AJAX 조회
async function fetchComments(postId) {
  const container = document.getElementById('detailCommentsContainer');
  container.innerHTML = `<div style="font-size:0.8rem; text-align:center; padding:10px; color:var(--text-mute);">댓글 로딩 중...</div>`;
  
  try {
    const res = await fetch(`${API_URL}?action=getComments&postId=${encodeURIComponent(postId)}`);
    const result = await res.json();
    
    if (result.success) {
      container.innerHTML = "";
      const comments = result.data || [];
      document.getElementById('detailCommentCount').innerText = comments.length;
      
      if (comments.length === 0) {
        container.innerHTML = `<div style="font-size:0.8rem; text-align:center; padding:15px; color:var(--text-mute);">작성된 댓글이 없습니다. 첫 댓글을 남겨보세요!</div>`;
        return;
      }
      
      comments.forEach(c => {
        const div = document.createElement('div');
        div.className = "comment-row";
        div.innerHTML = `
          <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
            <strong>${c.authorNickname}</strong>
            <span style="font-size:0.7rem; color:var(--text-mute);">${String(c.writeDate || '').substring(5, 16)}</span>
          </div>
          <div>${c.content}</div>
        `;
        container.appendChild(div);
      });
    }
  } catch (e) {
    container.innerHTML = `<div style="font-size:0.8rem; text-align:center; padding:10px; color:red;">댓글 로드 실패</div>`;
  }
}

// 댓글 쓰기
async function submitNewComment() {
  if (!currentUser) {
    return alert("댓글 작성은 회원 전용입니다. 마이페이지에서 로그인 해주세요.");
  }
  if (!selectedPost) return;
  
  const input = document.getElementById('newCommentContent');
  const content = input.value.trim();
  
  if (!content) return alert("댓글 내용을 적어주세요.");
  
  try {
    const payload = {
      action: "createComment",
      phone: currentUser.phone,
      postId: selectedPost.postId,
      content: content
    };
    
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    const result = await res.json();
    
    if (result.success) {
      input.value = "";
      alert("댓글이 달렸습니다! (+10포인트 적립)");
      fetchComments(selectedPost.postId);
      refreshUserProfile();
    } else {
      alert("실패: " + result.message);
    }
  } catch (e) {
    alert("서버 연결 실패: " + e.message);
  }
}

// 좋아요 누르기 (토글)
async function togglePostLike() {
  if (!currentUser) {
    return alert("좋아요 클릭은 회원 전용입니다. 로그인 해 주세요!");
  }
  if (!selectedPost) return;
  
  try {
    const payload = {
      action: "toggleLike",
      phone: currentUser.phone,
      postId: selectedPost.postId
    };
    
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    const result = await res.json();
    
    if (result.success) {
      selectedPost.userLiked = result.liked;
      selectedPost.likeCount = result.liked ? selectedPost.likeCount + 1 : Math.max(0, selectedPost.likeCount - 1);
      
      document.getElementById('detailLikeCount').innerText = selectedPost.likeCount;
      const likeBtn = document.getElementById('postLikeBtn');
      if (selectedPost.userLiked) {
        likeBtn.style.background = "#FFEBEE";
        likeBtn.style.color = "#C62828";
        showToastAlert("❤️ 이 글을 좋아합니다!");
      } else {
        likeBtn.style.background = "var(--primary-light)";
        likeBtn.style.color = "var(--primary)";
      }
      
      // 소통방 피드도 백그라운드 갱신을 위해 데이터 매칭
      const feedPost = forumPosts.find(p => p.postId === selectedPost.postId);
      if (feedPost) {
        feedPost.userLiked = selectedPost.userLiked;
        feedPost.likeCount = selectedPost.likeCount;
        renderForumPosts();
      }
    }
  } catch(e) {
    console.error(e);
  }
}

// 플로팅 토스트 메시지 헬퍼
function showToastAlert(msg) {
  let toast = document.getElementById('clientToastAlert');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'clientToastAlert';
    toast.style.cssText = 'position:fixed; bottom:85px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:white; padding:10px 20px; border-radius:30px; font-size:0.85rem; font-weight:bold; z-index:9999; pointer-events:none; transition:opacity 0.3s; opacity:0;';
    document.body.appendChild(toast);
  }
  toast.innerText = msg;
  toast.style.opacity = '1';
  setTimeout(() => {
    toast.style.opacity = '0';
  }, 2000);
}

// --- 3. 원래 원장님 쇼핑몰 소식/상세 페이지 연동 로직 (100% 보존) ---

// 공지사항 및 인스타형 소식 로드
async function loadFarmNews() {
    try {
        const response = await fetch(`${API_URL}?action=getNewsAndStories`);
        const res = await response.json();
        const data = res.data || res; 

        // [공지사항 섹션]
        const notices = data.notices || [];
        if (notices.length > 0) {
            const notice = notices[0];
            const bar = document.getElementById('notice-bar');
            const content = document.getElementById('notice-content');
            if (bar && content) {
                bar.style.display = 'flex';
                bar.style.cursor = 'pointer';
                content.innerText = notice.title || "공지사항";
                
                let raw = notice.imageUrl || "";
                let finalNoticeImg = "";

                if (raw.includes('thumbnail?id=')) {
                    finalNoticeImg = raw;
                } else if (raw.includes('id=')) {
                    finalNoticeImg = `https://drive.google.com/thumbnail?id=${raw.split('id=')[1].split('&')[0]}&sz=w800`;
                } else if (raw.includes('/d/')) {
                    finalNoticeImg = `https://drive.google.com/thumbnail?id=${raw.split('/d/')[1].split('/')[0]}&sz=w800`;
                }

                bar.onclick = function() {
                    openStoryModal({
                        imageUrl: finalNoticeImg,
                        title: notice.title,
                        subtitle: notice.subtitle,
                        content: notice.content,
                        btnText: "소식 닫기"
                    });
                };
            }
        }

        // [농장소식 섹션] - 중앙 정렬 보존
        const stories = data.stories || [];
        if (stories.length > 0) {
            const section = document.getElementById('story-section');
            const list = document.getElementById('story-list');
            if (section && list) {
                section.style.display = 'block';
                list.style.display = 'flex';
                list.style.justifyContent = 'center'; 
                list.style.gap = '20px';
                list.style.flexWrap = 'wrap';
                
                list.innerHTML = ''; 
                stories.forEach(story => {
                    let raw = story.imageUrl || "";
                    let finalImg = "https://via.placeholder.com/150?text=Hamchorom";
                    
                    if (raw.toLowerCase().includes('thumbnail?id=')) {
                        finalImg = raw;
                    } else if (raw.includes('id=')) {
                        let fId = raw.split('id=')[1].split('&')[0];
                        finalImg = `https://drive.google.com/thumbnail?id=${fId}&sz=w500`;
                    } else if (raw.includes('/d/')) {
                        let fId = raw.split('/d/')[1].split('/')[0];
                        finalImg = `https://drive.google.com/thumbnail?id=${fId}&sz=w500`;
                    } else if (raw.length > 10) {
                        finalImg = raw;
                    }

                    const item = document.createElement('div');
                    item.className = 'story-item';
                    item.innerHTML = `
                        <img src="${finalImg}" class="story-circle" onerror="this.src='https://via.placeholder.com/150?text=ImageError'">
                        <span>${story.title || "농장소식"}</span>
                    `;
                    
                    item.onclick = function() {
                        let popupImg = finalImg;
                        if(popupImg.includes('sz=')) {
                            popupImg = popupImg.replace(/sz=w\d+/, 'sz=w800');
                        }
                        openStoryModal({
                            title: story.title,
                            subtitle: story.subtitle,
                            content: story.content,
                            imageUrl: popupImg,
                            btnText: "소식 닫기"
                        });
                    };
                    list.appendChild(item);
                });
            }
        }
    } catch (e) { console.error("소식 로딩 실패:", e); }
}

// 상세보기 팝업 엔진
function openStoryModal(data) {
    const modal = document.getElementById('story-modal');
    if (modal) {
        const modalImg = document.getElementById('modal-img');
        const modalTitle = document.getElementById('modal-title');
        const modalSubtitle = document.getElementById('modal-subtitle');
        const modalBody = document.getElementById('modal-body');
        
        modalTitle.style.marginTop = "0px"; 
        modalImg.style.marginTop = "0px";

        if (data.imageUrl && data.imageUrl.length > 20) {
            modalImg.src = data.imageUrl;
            modalImg.style.display = 'block';
            modalImg.style.width = '100%';
            modalImg.style.borderRadius = '8px';
            modalImg.style.marginBottom = "15px";
        } else {
            modalImg.style.display = 'none';
        }

        modalTitle.innerText = data.title || "";
        
        if (data.subtitle) {
            modalSubtitle.innerText = data.subtitle;
            modalSubtitle.style.display = 'block';
        } else {
            modalSubtitle.style.display = 'none';
        }

        modalBody.innerText = data.content || "";
        modalBody.style.whiteSpace = "pre-wrap";
        modalBody.style.lineHeight = "1.6";
        
        const actionBtn = document.getElementById('modal-action-btn');
        if (actionBtn) {
            actionBtn.innerText = data.btnText || "닫기";
            actionBtn.onclick = function() {
                modal.style.display = 'none';
            };
        }

        modal.style.display = 'block';
    }
}

// 팝업 닫기
document.addEventListener('click', function(e) {
    const modal = document.getElementById('story-modal');
    if (e.target.classList.contains('close-modal') || e.target === modal) {
        if (modal) modal.style.display = 'none';
    }
});

window.addEventListener('load', loadFarmNews);

// --- [추가] 주소록 자동완성 로직 ---
async function checkAddressHistory(phone, type) {
    let container = document.getElementById('addressHistoryBox');
    if (!container) {
        container = document.createElement('div');
        container.id = 'addressHistoryBox';
        const typeSelectors = document.querySelector('.type-selectors');
        if (typeSelectors) {
            typeSelectors.parentNode.insertBefore(container, typeSelectors.nextSibling);
        }
    }

    container.innerHTML = `
        <div style="font-size:0.85rem; color:#F57C00; padding:15px; text-align:center; background:#fffaf5; border-radius:10px; margin: 10px 0; border: 1px dashed #ffccbc;">
            최근 배송지 내역을 불러오는 중입니다... 🍊
        </div>`;

    try {
        const res = await fetch(`${API_URL}?action=getAddressHistory&phone=${encodeURIComponent(phone)}&deliveryType=${type}`);
        const result = await res.json();
        renderAddressSelection(result.data || []);
    } catch(e) { 
        console.error("주소록 조회 실패", e);
        container.innerHTML = ""; 
    }
}

function renderAddressSelection(list) {
    const container = document.getElementById('addressHistoryBox');
    if (!container) return;

    if (list.length === 0) {
        container.innerHTML = `
            <div id="noHistoryMsg" style="font-size:0.85rem; color:#777; padding:15px; text-align:center; background:#f9f9f9; border-radius:10px; margin: 10px 0; border: 1px solid #eee;">
                📍 이전 배송 기록이 없습니다.
            </div>`;
        
        setTimeout(() => {
            const msg = document.getElementById('noHistoryMsg');
            if (msg) {
                msg.style.transition = "opacity 0.5s";
                msg.style.opacity = "0";
                setTimeout(() => { if (msg) msg.style.display = 'none'; }, 500);
            }
        }, 4000);

        ['receiverName', 'receiverPhone', 'receiverAddress'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => {
                const msg = document.getElementById('noHistoryMsg');
                if (msg) msg.style.display = 'none';
            }, { once: true });
        });
        return;
    }

    let html = `
        <div style="margin: 15px 0;">
            <p style="font-size:0.8rem; color:#666; margin-bottom:5px; padding-left:5px; font-weight:bold;">
                최근 배송지(${list.length}건) 내역입니다.
            </p>
            <p style="font-size:0.75rem; color:#F57C00; margin-bottom:10px; padding-left:5px;">
                💡 클릭 시 해당 주소가 자동으로 입력됩니다.
            </p>
            <div style="background:#f8fbff; border:1px solid #d0e3ff; border-radius:12px; padding:10px; max-height:280px; overflow-y:auto; box-shadow:inset 0 2px 4px rgba(0,0,0,0.03);">
                <div style="display:flex; flex-direction:column; gap:8px;">`;
    
    list.forEach(addr => {
        html += `
            <div onclick="applyRecentAddress('${addr.name}','${addr.phone}','${addr.address}')" 
                 style="background:white; border:1px solid #e0eafb; padding:12px; border-radius:10px; cursor:pointer; transition: all 0.2s; border-left: 4px solid #1976d2;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <strong style="color:#1976d2; font-size:0.9rem;">${addr.name}</strong>
                    <span style="color:#888; font-size:0.7rem;">${addr.phone || ''}</span>
                </div>
                <div style="color:#444; font-size:0.8rem; line-height:1.4; word-break:keep-all;">
                    ${addr.address}
                </div>
            </div>`;
    });
    
    html += `</div></div></div>`;
    container.innerHTML = html;
}

function applyRecentAddress(name, phone, addr) {
    if (deliveryType === 'self') {
        document.getElementById('receiverAddress').value = addr;
        document.getElementById('receiverAddressDetail').value = "";
    } else {
        document.getElementById('receiverName').value = name;
        document.getElementById('receiverPhone').value = phone;
        document.getElementById('receiverAddress').value = addr;
        document.getElementById('receiverAddressDetail').value = "";
    }
    document.getElementById('receiverAddressDetail').removeAttribute('required');
    document.getElementById('receiverAddressDetail').blur();
    
    const container = document.getElementById('addressHistoryBox');
    if (container) container.innerHTML = "";
    
    alert(`배송지 정보가 자동 입력되었습니다.`);
}

// --- ADDRESS SEARCH (DAUM POSTCODE) ---
function searchAddress(targetId, detailTargetId) {
    new daum.Postcode({
        oncomplete: function(data) {
            let addr = '';
            if (data.userSelectedType === 'R') {
                addr = data.roadAddress;
            } else { 
                addr = data.jibunAddress;
            }
            
            const targetElement = document.getElementById(targetId);
            targetElement.value = `(${data.zonecode}) ${addr}`;
            
            if (detailTargetId) {
                const detailElement = document.getElementById(detailTargetId);
                detailElement.value = "";
                detailElement.setAttribute('required', 'true');
                detailElement.focus();
            } else {
                targetElement.focus();
            }
        }
    }).open();
}

// 숫자만 들어오는 번호 정리용 헬퍼 함수
function fixPhone(num) {
  if (!num) return "";
  var cleaned = ('' + num).replace(/\D/g, '');
  var match = cleaned.match(/^(\d{3})(\d{4})(\d{4})$/);
  if (match) {
    return match[1] + '-' + match[2] + '-' + match[3];
  }
  return num;
}

// --- ORDER EDIT LOGIC (보존) ---
function openEditModal(index) {
  const order = renderedOrders[index];
  if (!order || !order.editable) return alert("이 주문은 수정할 수 없습니다.\n원장님이 이미 작업을 시작한 주문입니다.");

  editingOrderIndex = index;
  editCart = {};

  const editReceiverInput = document.getElementById('editReceiver');
  editReceiverInput.value = order.receiver || '';
  editReceiverInput.dataset.originalReceiver = order.receiver || '';
  
  document.getElementById('editSenderName').value = order.sender || '';
  
  const senderGroup = document.getElementById('senderNameGroup');
  if (order.sender && order.sender.trim() !== "") {
    senderGroup.style.display = 'block';
  } else {
    senderGroup.style.display = 'none';
  }
  document.getElementById('editReceiverPhone').value = order.receiverPhone || '';
  document.getElementById('editAddress').value = order.address || '';
  document.getElementById('editAddressDetail').value = '';
  document.getElementById('editDeliveryMsg').value = order.memo || '';
  document.getElementById('editGiftMsg').value = order.giftMessage || '';
  document.getElementById('editOrderId').textContent = order.orderId || '';

  const existingItems = parseItemsString(order.items);
  renderEditProducts(existingItems);
  updateEditTotal();

  document.getElementById('editModal').style.display = 'flex';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
  editingOrderIndex = -1;
  editCart = {};
}

function checkReceiverChange() {
  if (editingOrderIndex === -1) return;
  const order = renderedOrders[editingOrderIndex];
  const currentReceiver = document.getElementById('editReceiver').value.trim();
  const originalReceiver = document.getElementById('editReceiver').dataset.originalReceiver || '';
  const senderGroup = document.getElementById('senderNameGroup');
  
  if (order.sender && order.sender.trim() !== "") {
    senderGroup.style.display = 'block';
    return;
  }
  
  if (currentReceiver !== originalReceiver && currentReceiver !== "") {
    senderGroup.style.display = 'block';
  } else {
    senderGroup.style.display = 'none';
  }
}

function parseItemsString(itemsStr) {
  let result = {};
  if (!itemsStr) return result;
  const parts = itemsStr.split(',').map(s => s.trim());
  parts.forEach(part => {
    const match = part.match(/(.+?)\s*x\s*(\d+)/i);
    if (match) {
      result[match[1].trim()] = parseInt(match[2]);
    }
  });
  return result;
}

function renderEditProducts(existingItems) {
  const container = document.getElementById('editProductGrid');
  if (!container) return;
  container.innerHTML = '';

  if (allProducts.length === 0) {
    container.innerHTML = '<p style="color:#888; text-align:center;">상품 목록을 불러오는 중...</p>';
    return;
  }

  allProducts.forEach(p => {
    const name = p['상품명'] || p.name;
    const priceRaw = String(p['판매가'] || p['가격'] || p.price || "0").replace(/[^0-9]/g, '');
    const price = parseInt(priceRaw) || 0;

    let qty = 0;
    for (let key in existingItems) {
      if (name === key || key.includes(name) || name.includes(key)) {
        qty = existingItems[key];
        delete existingItems[key];
        break;
      }
    }

    if (qty === 0) return;
    editCart[name] = { quantity: qty, price: price };

    const div = document.createElement('div');
    div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px; border:1px solid #eee; border-radius:8px; margin-bottom:8px; background:white;';
    div.innerHTML = `
      <div style="flex:1;">
        <div style="font-weight:bold; font-size:0.95rem;">${name}</div>
        <div style="color:#888; font-size:0.85rem;">단가: ${price.toLocaleString()}원</div>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="font-weight:bold; color:#1976D2; font-size:1.1rem; padding-right:10px;">${qty}박스</span>
      </div>
    `;
    container.appendChild(div);
  });
}

function updateEditTotal() {
  let total = 0;
  for (let k in editCart) {
    total += editCart[k].price * editCart[k].quantity;
  }
  const el = document.getElementById('editTotalAmount');
  if (el) el.textContent = total.toLocaleString() + '원';
}

async function submitOrderEdit() {
  const order = renderedOrders[editingOrderIndex];
  if (!order) return;

  const receiver = document.getElementById('editReceiver').value;
  const receiverPhone = document.getElementById('editReceiverPhone').value.trim();
  const addressBase = document.getElementById('editAddress').value.trim();
  const addressDetail = document.getElementById('editAddressDetail').value.trim();

  if (!receiver || !receiverPhone || !addressBase || !addressDetail) {
    return alert("받는 분 정보 및 상세주소를 모두 입력해주세요.");
  }

  const btn = document.getElementById('editSubmitBtn');
  btn.textContent = '수정 중...';
  btn.disabled = true;

  let itemDetailsStr = Object.keys(editCart).map(k => `${k} x ${editCart[k].quantity}`).join(', ');
  let totalAmount = 0;
  for (let k in editCart) totalAmount += editCart[k].price * editCart[k].quantity;

  const payload = {
    action: 'updateOrder',
    orderId: order.orderId,
    receiverName: receiver,
    receiverPhone: receiverPhone,
    receiverAddress: `${addressBase} ${addressDetail}`,
    senderName: document.getElementById('editSenderName').value.trim(),
    deliveryMsg: document.getElementById('editDeliveryMsg').value || '',
    giftMessage: document.getElementById('editGiftMsg').value || '',
    itemDetails: itemDetailsStr,
    totalAmount: totalAmount
  };

  try {
    fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    }).then(() => {
      alert('✅ 주문이 성공적으로 수정되었습니다!');
      closeEditModal();
      fetchOrderStatus();
    }).catch(() => {
      alert('✅ 주문이 수정되었습니다!');
      closeEditModal();
      fetchOrderStatus();
    });
  } catch(err) {
    alert('오류가 발생했습니다: ' + err.message);
    btn.textContent = '수정 완료';
    btn.disabled = false;
  }
}

// --- MOBILE BACK BUTTON HANDLER ---
window.history.pushState({ page: 'main' }, null, window.location.href);

window.addEventListener('popstate', function(event) {
    const checkoutOverlay = document.getElementById('checkoutOverlay');
    const lookupModal = document.getElementById('lookupModal');
    const editModal = document.getElementById('editModal');
    const storyModal = document.getElementById('story-modal');
    const successModal = document.getElementById('successModal');
    const postWriteModal = document.getElementById('postWriteModal');
    const postDetailModal = document.getElementById('postDetailModal');
    const registerModal = document.getElementById('registerModal');
    
    let isModalOpen = false;
    
    if (checkoutOverlay && checkoutOverlay.style.display === 'flex') {
        closeCheckout();
        isModalOpen = true;
    } else if (lookupModal && lookupModal.style.display === 'flex') {
        closeLookupModal();
        isModalOpen = true;
    } else if (editModal && editModal.style.display === 'flex') {
        closeEditModal();
        isModalOpen = true;
    } else if (storyModal && storyModal.style.display === 'block') {
        storyModal.style.display = 'none';
        isModalOpen = true;
    } else if (successModal && successModal.style.display === 'flex') {
        successModal.style.display = 'none';
        isModalOpen = true;
    } else if (postWriteModal && postWriteModal.style.display === 'flex') {
        closeWriteModal();
        isModalOpen = true;
    } else if (postDetailModal && postDetailModal.style.display === 'flex') {
        closePostDetailModal();
        isModalOpen = true;
    } else if (registerModal && registerModal.style.display === 'flex') {
        closeRegisterModal();
        isModalOpen = true;
    }

    if (isModalOpen) {
        window.history.pushState({ page: 'main' }, null, window.location.href);
    } else {
        if (confirm("앱을 종료하시겠습니까?")) {
            window.history.back();
        } else {
            window.history.pushState({ page: 'main' }, null, window.location.href);
        }
    }
});
