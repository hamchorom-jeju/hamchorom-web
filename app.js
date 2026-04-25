const API_URL = "https://script.google.com/macros/s/AKfycbwKwOXlmPrtKs4B7fwOMXUXxwZDifr6O04xscGNSse-X9rQojOzApdn-38e2B0UjgwD/exec";

let allProducts = [];
let cart = {}; // { "상품명": { quantity: 1, price: 35000 } }
let currentStep = 1;
let deliveryType = "";
let renderedOrders = [];
let editCart = {};
let editingOrderIndex = -1;

// 로컬 테스트용 모의 데이터 (API 연결 실패시 대비)
const MOCK_PRODUCTS = [
  { "카테고리": "한라봉", "상태": "판매중", "상품명": "함초롬 명품 한라봉 5kg", "중량": "5kg", "과수": "15-18과", "가격": 45000, "사진": "https://lh3.googleusercontent.com/d/1pOnBm27Zkhgq6H9DQr4EeiW-MCPHkXHx" },
  { "카테고리": "레드향", "상태": "판매중", "상품명": "꼬마 레드향 5kg", "중량": "5kg", "과수": "30-35과", "가격": 35000, "사진": "https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?auto=format&fit=crop&w=300&q=80" },
  { "카테고리": "반반세트", "상태": "판매중", "상품명": "레드향+한라봉 반반세트 5kg", "중량": "5kg", "과수": "20과 내외", "가격": 40000, "사진": "https://images.unsplash.com/photo-1557800636-894a64c1696f?auto=format&fit=crop&w=300&q=80" }
];

document.addEventListener("DOMContentLoaded", () => {
  fetchProducts();
});

// --- API FETCH LOGIC ---
async function fetchProducts() {
  const container = document.getElementById('productGrid');
  const loader = document.getElementById('loadingProducts');
  
  try {
    // API에 GET 요청 (action=getProducts 같은 파라미터를 사용했다면 맞게 수정 가능. 기본 GET요청 보냄)
    const res = await fetch(`${API_URL}?action=getProducts`);
    let data = await res.json();
    
    // 만약 data 구조가 배열이 아니라면 (구글 앱스크립트 응답 형태에 따라)
    if(data.data) data = data.data; 

    // 백엔드에서 이미 상태가 '판매중'인 데이터만 걸러서 보내주므로 그대로 쓰면 됨
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

  // 🍊 [추가 로직] 재고 기반 정렬 (판매중 상단 / 품절 하단)
  filtered.sort((a, b) => {
    const stockA = parseInt(a.stock) || 0;
    const stockB = parseInt(b.stock) || 0;
    const isASoldOut = a.status === '품절' || stockA <= 0;
    const isBSoldOut = b.status === '품절' || stockB <= 0;
    
    if (isASoldOut && !isBSoldOut) return 1;
    if (!isASoldOut && isBSoldOut) return -1;
    return 0; // 동일 상태면 원장님의 시트 순서 그대로 보존
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
    
    // 재고 및 상태 파악
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
      <img src="${imgUrl}" class="p-img" alt="${name}" style="${isSoldOut ? 'filter: grayscale(100%);' : ''}">
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
  
  // UI Update
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
  
  // Update Step 3 Summary
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

  // 🍊 [추가] 수령 방식 선택 시 주소록 실시간 조회 (전화번호 기준)
  const sPhone = document.getElementById('senderPhone').value;
  if (sPhone) checkAddressHistory(sPhone, type);
}

// --- SUBMIT ORDER (POST 15 Columns) ---
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
    totalAmount: totalAmount
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    
    // 302 리다이렉트 등으로 인해 response.json()이 실패할 수 있는 구글 스크립트 특성상
    // 텍스트로 받아 확인 프로세스를 거침
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch(e) {
      // JSON 파싱 실패 시 (구글의 HTML 안내 페이지 등이 오면) 성공으로 간주하던 관행 유지 혹은 확인 로직
      console.log("Response text check:", text);
      if (text.includes("Success") || text.includes("완료")) {
         result = { success: true };
      } else {
         throw new Error("서버 응답 파싱 실패");
      }
    }

    if (result.success) {
        closeCheckout();
        document.getElementById('successModal').style.display = 'flex';
    } else {
        alert("⚠️ 주문 실패: " + (result.message || "알 수 없는 오류"));
        submitBtn.innerText = originalText;
        submitBtn.disabled = false;
    }
    
  } catch(err) {
    console.error("Submit error:", err);
    // 구글 스크립트 특유의 CORS/Redirect 상황에서도 데이터는 들어갔을 확률이 높으므로
    // 명백한 재고 부족 메시지가 아니라면 성공 처리를 유도하거나 재시도를 안내
    if (err.message.includes("재고")) {
      alert(err.message);
    } else {
      // 원장님 버전: 일단 성공 모달 띄우기 (데이터 유실 방지 우선)
      closeCheckout();
      document.getElementById('successModal').style.display = 'flex';
    }
    submitBtn.innerText = originalText;
    submitBtn.disabled = false;
  }
}

// --- ORDER LOOKUP ---
function openLookupModal() { document.getElementById('lookupModal').style.display = 'flex'; }
function closeLookupModal() { document.getElementById('lookupModal').style.display = 'none'; }

async function fetchOrderStatus() {
  const phone = document.getElementById('lookupPhone').value;
  if(!phone) return alert("연락처를 입력해주세요.");
  
  const loader = document.getElementById('lookupLoading');
  const resultsDiv = document.getElementById('lookupResults');
  loader.style.display = 'block'; resultsDiv.innerHTML = "";

  try {
    const res = await fetch(`${API_URL}?action=lookup&phone=${encodeURIComponent(phone)}`);
    const result = await res.json();
    
    if(result && result.data && result.data.length > 0) {
      // 1단계: 배열 정렬 (다단계 우선순위 가중치 랭킹 시스템)
      result.data.sort((a, b) => {
        const getPriorityScore = (statusStr) => {
            const s = (statusStr || "").replace(/\s+/g, '');
            if (s.includes("주문접수")) return 1;
            if (s.includes("입금대기")) return 2;
            if (s.includes("입금확인")) return 3;
            if (s.includes("상품준비")) return 4;
            if (s.includes("발송준비")) return 5;
            if (s.includes("발송시작") || s.includes("배송중") || s.includes("배송완료") || s.includes("발송완료")) return 6;
            return 7;
        };
        
        // 우선순위 숫자가 작을수록(1점) 배열의 앞쪽(화면 상단)으로 오도록 오름차순 정렬
        return getPriorityScore(a.status) - getPriorityScore(b.status);
      });

      // 2단계: 백엔드 배열 렌더링
      let globalPendingTotal = 0;
      let cardsHtml = "";
      renderedOrders = [];

      const statusConfig = {
        "주문접수": {
          img: "https://lh3.googleusercontent.com/d/1fOqS9BPCzT7z-z5S_KLG28W8uDg8rbTU",
          showEdit: true
        },
        "입금대기": {
          img: "https://lh3.googleusercontent.com/d/1RCfl3twsjnbrCzMJjHjsUBKJKYXumPYx",
          showEdit: false
        },
        "입금확인": {
          img: "https://lh3.googleusercontent.com/d/1H_ou-5kFjcKVZqci1KvdUJYHR3BHy_K-",
          showEdit: false
        },
        "상품준비중": {
          img: "https://lh3.googleusercontent.com/d/1-ageN34CBr71tJKD-548CsYImDXRcwDf",
          showEdit: false
        },
        "발송시작": {
          img: "https://lh3.googleusercontent.com/d/1ZYY93vYMH27HiAoEWkXxfaLDmE28mxqn",
          showEdit: false
        }
      };

      result.data.forEach(order => {
        renderedOrders.push(order);
        const orderIdx = renderedOrders.length - 1;
        const currentStatus = order.status || "";
        const normStatus = currentStatus.replace(/\s+/g, '');
        const isPending = normStatus.includes("주문접수") || normStatus.includes("입금대기");

        let config = statusConfig["주문접수"];
        if (normStatus.includes("입금대기")) config = statusConfig["입금대기"];
        else if (normStatus.includes("입금확인")) config = statusConfig["입금확인"];
        else if (normStatus.includes("상품준비") || normStatus.includes("발송준비")) config = statusConfig["상품준비중"];
        else if (normStatus.includes("발송시작") || normStatus.includes("배송중") || normStatus.includes("배송완료") || normStatus.includes("발송완료")) config = statusConfig["발송시작"];
        else if (normStatus.includes("주문접수")) config = statusConfig["주문접수"];

        let badgeStatusMsg = currentStatus;
        if (normStatus.includes("주문접수")) {
            badgeStatusMsg = "주문서 확인중! 현단계에서만 변경사항 수정이 가능합니다.";
        }

        let trackingHtml = "";
        let amountHtml = "";

        if (isPending) {
            let orderAmt = Number(String(order.totalAmount || 0).replace(/[^0-9]/g, '')) || 0;
            globalPendingTotal += orderAmt;
            let justAmount = order.totalAmount ? `${orderAmt.toLocaleString()}원` : "확인 중";
            amountHtml = `
            <div style="font-weight:bold; font-size:1.15rem; color:#F57C00; margin-bottom: 5px;">입금하실 결제 금액: ${justAmount}</div>
            `;
        } else {
            const isShipped = normStatus.includes("발송시작") || normStatus.includes("배송중") || normStatus.includes("배송완료") || normStatus.includes("발송완료");
            if (isShipped && order.tracking) {
                trackingHtml = `
                <div style="font-size:1.1rem; font-weight:bold; color:#1976D2; border: 2px dashed #1976D2; padding: 12px; border-radius: 8px; margin-bottom: 15px; text-align: left; background:#E3F2FD;">
                    🚚 송장번호: <span style="font-size:1.4rem;">${order.tracking}</span>
                </div>`;
            }

            let orderAmt = order.totalAmount ? order.totalAmount : "확인완료";
            amountHtml = `
            <div style="font-size:0.95rem; font-weight:bold; color:#2E7D32; margin-bottom: 10px;">✅ 결제 완료된 금액: ${orderAmt}</div>
            `;
        }

        const cardColor = isPending ? '#F57C00' : '#ccc';
        const badgeBg = isPending ? '#FFF3E0' : '#E3F2FD';

        const editBtnHtml = config.showEdit && order.editable ? `
          <div style="margin-top:12px; text-align:center;">
            <button onclick="openEditModal(${orderIdx})" style="background:#F57C00; color:white; border:none; padding:10px 20px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:0.95rem; width:100%;">
              ✏️ 주문 수정하기
            </button>
          </div>
        ` : "";

        let miniatureHtml = `
        <div class="miniature-status-zone" style="justify-content: center; padding: 25px 15px;">
            <div class="miniature-img-box" style="flex: 0 0 220px; max-width: 100%;">
                <img src="${config.img}" alt="상태" class="floating-img" style="box-shadow: 0 10px 20px rgba(0,0,0,0.08);" />
            </div>
        </div>
        `;

        cardsHtml += `
          <div class="lookup-card" data-order-id="${order.orderId || ''}" style="text-align:left; border: 2px solid ${cardColor}; padding:15px; margin-bottom:15px; border-radius:12px;">
            <div style="font-size:0.85rem; color:#888; margin-bottom:5px; font-weight:bold;">주문번호: ${order.orderId || '번호 미발급'}</div>
            <div style="border-bottom:1px solid #eee; padding-bottom:10px; margin-bottom:15px; display:flex; flex-direction:column; gap:10px;">
                <h3 style="margin:0; font-size:1.15rem; color:#333;">📦 배송지: ${order.receiver || '확인중'} 님</h3>
                <span class="badge" style="font-size:0.95rem; padding:8px 12px; background:${badgeBg}; border-radius:8px; font-weight:bold; color:#333; word-break:keep-all; line-height:1.4;">
                    ${badgeStatusMsg || '상태 확인중'}
                </span>
            </div>

            ${miniatureHtml}

            ${trackingHtml}
            ${amountHtml}

            <div style="font-size:0.9rem; line-height:1.8; color:#444; background:#f9f9f9; padding: 12px; border-radius:8px;">
                <div><strong style="color:#2C3E50;">주문 상품:</strong> ${order.items || '-'}</div>
                <div><strong style="color:#2C3E50;">받는 분 성함:</strong> ${order.receiver || '-'}</div>
                <div><strong style="color:#2C3E50;">받는 분 연락처:</strong> ${order.receiverPhone || order.phone || '-'}</div>
                <div><strong style="color:#2C3E50;">배송지 (주소):</strong> ${order.address || '-'}</div>
                <div><strong style="color:#2C3E50;">보내는 분:</strong> ${order.sender || '-'}</div>
                <div><strong style="color:#2C3E50;">배송 메시지:</strong> ${order.memo || '-'}</div>
            </div>
            ${editBtnHtml}
          </div>
        `;
      });

      // 3단계: 상단 요약 바 원상복구 및 적용
      const dominantOrder = result.data[0];
      const customerName = dominantOrder.customerName || dominantOrder.sender || dominantOrder.receiver || "고객";
      const displayTitle = `${customerName}님, 실시간 주문현황입니다.`;

      let summaryHtml = `
      <div class="status-title-large uppercase" style="margin-bottom:15px;">${displayTitle}</div>
      `;

      if (globalPendingTotal > 0) {
          summaryHtml += `
          <div style="background:white; border:2px solid #F57C00; border-radius:12px; padding:15px; margin-bottom:20px; box-shadow:0 4px 10px rgba(0,0,0,0.05);">
              <div style="font-size:1.1rem; color:#444; margin-bottom:5px;">입금 확인이 필요한 금액: <strong style="color:#D84315; font-size:1.3rem;">${globalPendingTotal.toLocaleString()}원</strong></div>
              <div style="font-size:0.95rem; color:#388E3C; font-weight:bold; margin-top:10px; background:#f9f9f9; padding:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                  <span>농협 060-02-077998 문미진</span>
                  <button onclick="navigator.clipboard.writeText('060-02-077998'); alert('계좌번호가 복사되었습니다!');" style="background:#fff; border:1px solid #1976D2; color:#1976D2; padding:6px 12px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:0.85rem;">계좌복사</button>
              </div>
          </div>
          `;
      }

      resultsDiv.innerHTML = summaryHtml + cardsHtml;
    } else {
      resultsDiv.innerHTML = "<p style='color:red;'>일치하는 주문 내역이 없습니다.</p>";
    }
  } catch (err) {
    console.error(err);
    resultsDiv.innerHTML = `<p style='color:red;'>잠시후 다시 시도해주세요. (테스트 환경에서는 조회가 제한될 수 있습니다)</p>`;
  } finally {
    loader.style.display = 'none';
  }
}


// --- ORDER EDIT LOGIC ---
function openEditModal(index) {
  const order = renderedOrders[index];
  if (!order || !order.editable) return alert("이 주문은 수정할 수 없습니다.\n원장님이 이미 작업을 시작한 주문입니다.");

  editingOrderIndex = index;
  editCart = {};

  document.getElementById('editReceiver').value = order.receiver || '';
  document.getElementById('editReceiverPhone').value = order.receiverPhone || '';
  
  // 기존 통주소를 두 칸으로 대략 분리 시도 (하지만 완벽 분리는 어려우므로 기본 칸에 다 넣고 상세는 비움)
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
    const safeName = name.replace(/'/g, "\\'");
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

    // 현재 재고 및 상태 확인
    const stock = parseInt(p.stock) || 0;
    const isSoldOut = p.status === "품절" || stock <= 0;

    // 이미 주문한 상품이 아니고, 품절 상태라면 아예 화면에 그리지 않고 건너뜁니다.
    if (qty === 0 && isSoldOut) return;

    if (qty > 0) {
      editCart[name] = { quantity: qty, price: price };
    }

    const div = document.createElement('div');
    div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px; border:1px solid #eee; border-radius:8px; margin-bottom:8px; background:white;';
    div.innerHTML = `
      <div style="flex:1;">
        <div style="font-weight:bold; font-size:0.95rem;">${name}</div>
        <div style="color:#F57C00; font-size:0.85rem;">${price.toLocaleString()}원</div>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <button onclick="updateEditQty('${safeName}', -1, ${price})" style="width:30px; height:30px; border:1px solid #ddd; background:#f9f9f9; border-radius:6px; font-size:1rem; cursor:pointer;">-</button>
        <span id="editQty-${name}" style="font-weight:bold; min-width:25px; text-align:center;">${qty}</span>
        <button onclick="updateEditQty('${safeName}', 1, ${price})" style="width:30px; height:30px; border:1px solid #ddd; background:#f9f9f9; border-radius:6px; font-size:1rem; cursor:pointer;">+</button>
      </div>
    `;
    container.appendChild(div);
  });
}

function updateEditQty(name, change, price) {
  if (!editCart[name]) editCart[name] = { quantity: 0, price: price };
  editCart[name].quantity += change;
  if (editCart[name].quantity < 0) editCart[name].quantity = 0;

  const el = document.getElementById(`editQty-${name}`);
  if (el) el.textContent = editCart[name] ? editCart[name].quantity : 0;

  if (editCart[name].quantity === 0) delete editCart[name];
  updateEditTotal();
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
  if (Object.keys(editCart).length === 0) {
    return alert("최소 1개 이상의 상품을 선택해주세요.");
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

// --- 원장님의 성역 (allProducts, fetchProducts 등 상단 로직 100% 보존) ---

// 1. 농장소식 및 공지사항 로딩 엔진 (이미지 추출 로직만 강화)
// 1. 농장소식 및 공지사항 로딩 엔진 (이미지 주소 판별 로직 최적화)
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

                // 🍊 원장님이 주신 썸네일 링크가 이미 완성형이면 그대로 사용
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
                        content: notice.content
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
                    
                    // 🍊 [수정 핵심] 이미 thumbnail 주소면 자르지 말고 '통째로' 사용
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
                        // 팝업 시에는 sz 파라미터가 있다면 큰 사이즈로만 교체
                        let popupImg = finalImg;
                        if(popupImg.includes('sz=')) {
                            popupImg = popupImg.replace(/sz=w\d+/, 'sz=w800');
                        }
                        openStoryModal({
                            title: story.title,
                            content: story.content,
                            imageUrl: popupImg
                        });
                    };
                    list.appendChild(item);
                });
            }
        }
    } catch (e) { console.error("소식 로딩 실패:", e); }
}

// 2. 상세보기 팝업 엔진 (상단 여백 및 겹침 방지 정밀 보정)
function openStoryModal(data) {
    const modal = document.getElementById('story-modal');
    if (modal) {
        const modalImg = document.getElementById('modal-img');
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        
        // 🍊 [핵심] 이미지가 있든 없든 닫기(X) 버튼 영역을 침범하지 않게 기본 여백 설정
        // 모달 내부 컨테이너의 상단 패딩을 조정하거나, 첫 요소에 마진을 줍니다.
        modalTitle.style.marginTop = "0px"; 
        modalImg.style.marginTop = "0px";

        if (data.imageUrl && data.imageUrl.length > 20) {
            modalImg.src = data.imageUrl;
            modalImg.style.display = 'block';
            modalImg.style.width = '100%';
            modalImg.style.borderRadius = '8px';
            modalImg.style.marginBottom = "15px";
            
            // 🍊 이미지가 있을 때: X 버튼과 겹치지 않게 이미지 위에 여백 40px 부여
            modalImg.style.marginTop = "40px"; 
            modalTitle.style.marginTop = "10px";
        } else {
            modalImg.style.display = 'none';
            // 🍊 이미지가 없을 때: 제목이 X 버튼과 겹치지 않게 제목 위에 여백 50px 부여
            modalTitle.style.marginTop = "50px";
        }

        modalTitle.innerText = data.title || "";
        modalBody.innerText = data.content || "";
        
        // 줄바꿈 보존을 위해 스타일 살짝 보강
        modalBody.style.whiteSpace = "pre-wrap";
        modalBody.style.lineHeight = "1.6";
        
        modal.style.display = 'block';
    }
}

// 3. 팝업 닫기
document.addEventListener('click', function(e) {
    const modal = document.getElementById('story-modal');
    if (e.target.classList.contains('close-modal') || e.target === modal) {
        if (modal) modal.style.display = 'none';
    }
});

// 🚀 시동 열쇠
window.addEventListener('load', loadFarmNews);

// --- [추가] 주소록 자동완성 로직 (UX 개선 버전) ---
async function checkAddressHistory(phone, type) {
    let container = document.getElementById('addressHistoryBox');
    if (!container) {
        container = document.createElement('div');
        container.id = 'addressHistoryBox';
        // 위치 재배치: 방식 선택 버튼(.type-selectors) 바로 아래에 삽입
        const typeSelectors = document.querySelector('.type-selectors');
        if (typeSelectors) {
            typeSelectors.parentNode.insertBefore(container, typeSelectors.nextSibling);
        }
    }

    // 1. 로딩 즉시 시각화
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

    // 2. 데이터 부재 시 처리
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

    // 3. 데이터 존재 시 처리 (세로형 리스트 레이아웃)
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
    document.getElementById('receiverAddressDetail').focus();
    // 주소 입력 시 '기록 없음' 메시지 방지 위해 container 비움
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
                detailElement.focus();
            } else {
                targetElement.focus();
            }
        }
    }).open();
}
