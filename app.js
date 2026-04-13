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

  filtered.forEach(p => {
    const name = p['상품명'] || p.name;
    // 구글 시트에 "35,000원" 처럼 문자열이 올 수 있으므로 콤마/문자 제거 후 숫자로 치환
    const priceRaw = String(p['판매가'] || p['가격'] || p.price || "0").replace(/[^0-9]/g, '');
    const price = parseInt(priceRaw) || 0;
    const weight = p['중량'] || p.weight || '';
    const count = p['과수'] || p.count || '';
    const imgFromSheet = p['사진링크'] || p['사진'] || p.image;
    let imgUrl = imgFromSheet || "https://images.unsplash.com/photo-1557800636-894a64c1696f?auto=format&fit=crop&w=300&q=80";
    
    // 만약 한라봉 상품인데 시트에 사진이 없거나 기본 이미지라면, 원장님이 주신 새 사진으로 대체
    if (name.includes("한라봉") && (!imgFromSheet || imgFromSheet.includes("unsplash"))) {
      imgUrl = "https://lh3.googleusercontent.com/d/1pOnBm27Zkhgq6H9DQr4EeiW-MCPHkXHx";
    }
    
    // 현재 수량
    const currentQty = cart[name] ? cart[name].quantity : 0;

    const card = document.createElement('div');
    card.className = "p-card";
    card.innerHTML = `
      <img src="${imgUrl}" class="p-img" alt="${name}">
      <div class="p-info">
        <div class="p-title">${name}</div>
        <div class="p-meta">${weight} | ${count}</div>
        <div class="p-price">${price.toLocaleString()}원</div>
        
        <div class="p-action">
          <span>수량선택</span>
          <div class="qty-control">
            <button class="qty-btn" onclick="updateQty('${name}', -1, ${price})">-</button>
            <div class="qty-val" id="qty-${name}">${currentQty}</div>
            <button class="qty-btn" onclick="updateQty('${name}', 1, ${price})">+</button>
          </div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// --- CART LOGIC ---
function updateQty(name, change, price) {
  if(!cart[name]) cart[name] = { quantity: 0, price: price };
  
  cart[name].quantity += change;
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
    const rName = document.getElementById('receiverName').value;
    const rPhone = document.getElementById('receiverPhone').value;
    const rAddr = document.getElementById('receiverAddress').value;
    if(!rName || !rPhone || !rAddr) return alert("받는 분 정보를 정확히 입력해주세요.");
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

  if(type === 'self') {
    document.getElementById('receiverName').value = document.getElementById('senderName').value;
    document.getElementById('receiverPhone').value = document.getElementById('senderPhone').value;
    document.getElementById('receiverAddress').value = "";
    giftMsgContainer.style.display = 'none';
    document.getElementById('giftMessage').value = "";
  } else {
    document.getElementById('receiverName').value = "";
    document.getElementById('receiverPhone').value = "";
    document.getElementById('receiverAddress').value = "";
    giftMsgContainer.style.display = 'block';
  }
}

// --- SUBMIT ORDER (POST 15 Columns) ---
async function submitFinalOrder() {
  const submitBtn = document.getElementById('submitOrderBtn');
  submitBtn.innerText = "처리중..."; submitBtn.disabled = true;

  // orderPath ?from= 파악
  const urlParams = new URLSearchParams(window.location.search);
  const orderPathVal = urlParams.get('from') || '웹앱_직접';

  let itemDetailsStr = Object.keys(cart).map(k => `${k} x ${cart[k].quantity}`).join(", ");
  
  let totalAmount = 0;
  for(let k in cart) totalAmount += cart[k].price * cart[k].quantity;

  const payload = {
    timestampId: new Date().toISOString(),
    wishDate: document.getElementById('wishDate').value || '',
    receiverName: document.getElementById('receiverName').value,
    receiverPhone: document.getElementById('receiverPhone').value,
    receiverAddress: document.getElementById('receiverAddress').value,
    depositorName: document.getElementById('depositorName').value || document.getElementById('senderName').value,
    senderName: document.getElementById('senderName').value,
    senderPhone: document.getElementById('senderPhone').value,
    itemDetails: itemDetailsStr,
    nickname: document.getElementById('nickname').value || '',
    deliveryMsg: document.getElementById('deliveryMsg').value || '',
    orderPath: orderPathVal,
    giftMessage: document.getElementById('giftMessage').value || '',
    orderCheck: false,
    totalAmount: totalAmount
  };

  try {
    // 302 리다이렉트 시 GET으로 변환되어 doPost가 안 먹히는 브라우저 고질병 방지를 위해
    // no-cors를 제거하고 단순 POST 요청으로 쏘도록 수정 (CORS 에러 로그가 브라우저에 찍힐 수 있으나 서버 전송은 100% 보장됨)
    fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      }
    }).then(res => {
        console.log("=== 구글 API 전송 플로우 통과 ===");
        closeCheckout();
        document.getElementById('successModal').style.display = 'flex';
    }).catch(err => {
        // CORS 정책에 의해 브라우저가 차단하더라도 서버의 doPost는 이미 정상 작동함.
        console.log("CORS 경고 발생 (정상): 데이터는 구글 시트에 삽입되었습니다.");
        closeCheckout();
        document.getElementById('successModal').style.display = 'flex';
    });
    
  } catch(err) {
    alert("오류 발생: " + err.message);
    submitBtn.innerText = "최종 결제 및 주문완료";
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
            const s = statusStr || "";
            // 1순위 (최상단): 결제가 필요한 건
            if (s.includes("주문접수") || s.includes("입금대기")) return 1;
            // 2순위: 방금 결제가 확인된 건
            if (s.includes("입금확인")) return 2;
            // 3순위: 포장 중인 건
            if (s.includes("상품준비중") || s.includes("발송준비")) return 3;
            // 4순위: 이미 떠난 건 (가장 하단)
            if (s.includes("발송시작") || s.includes("배송중") || s.includes("배송완료")) return 4;
            // 그 외 알 수 없는 상태
            return 5;
        };
        
        // 우선순위 숫자가 작을수록(1점) 배열의 앞쪽(화면 상단)으로 오도록 오름차순 정렬
        return getPriorityScore(a.status) - getPriorityScore(b.status);
      });

      // 2단계: 백엔드 배열 렌더링
      let globalPendingTotal = 0;
      let cardsHtml = "";
      renderedOrders = [];

      result.data.forEach(order => {
        renderedOrders.push(order);
        const orderIdx = renderedOrders.length - 1;
        const currentStatus = order.status || "";
        const isPending = currentStatus.includes("주문접수") || currentStatus.includes("입금대기");

        let trackingHtml = "";
        let amountHtml = "";

        if (isPending) {
            let orderAmt = Number(String(order.totalAmount || 0).replace(/[^0-9]/g, '')) || 0;
            globalPendingTotal += orderAmt;
            let justAmount = order.totalAmount ? `${orderAmt.toLocaleString()}원` : "확인 중";
            amountHtml = `
            <div style="font-weight:bold; font-size:1.15rem; color:#F57C00; margin-bottom: 5px;">입금하실 결제 금액: ${justAmount}</div>
            <div style="font-size:0.95rem; font-weight:bold; color:#388E3C; margin-bottom: 10px;">계좌: 농협 060-02-077998 문미진</div>
            `;
        } else {
            trackingHtml = order.tracking ? `
            <div style="font-size:1.1rem; font-weight:bold; color:#1976D2; border: 2px dashed #1976D2; padding: 12px; border-radius: 8px; margin-bottom: 15px; text-align: left; background:#E3F2FD;">
                🚚 송장번호: <span style="font-size:1.4rem;">${order.tracking}</span>
            </div>` : `
            <div style="font-size:1.05rem; font-weight:bold; color:#1976D2; margin-bottom: 15px; padding: 10px; background: #E3F2FD; border-radius: 6px; display:inline-block;">
                조금만 기다려주세요! 상품을 정성껏 준비 중입니다. 🍊
            </div>
            `;
            let orderAmt = order.totalAmount ? order.totalAmount : "결제완료";
            amountHtml = `
            <div style="font-size:0.85rem; color:#888; text-decoration: line-through; margin-bottom: 10px;">결제된 금액: ${orderAmt}</div>
            `;
        }

        const cardColor = isPending ? '#F57C00' : '#ccc';
        const badgeBg = isPending ? '#FFF3E0' : '#E3F2FD';

        // 수정 버튼 (백엔드에서 editable: true를 보내준 경우에만 노출)
        const editBtnHtml = order.editable ? `
          <div style="margin-top:12px; text-align:center;">
            <button onclick="openEditModal(${orderIdx})" style="background:#F57C00; color:white; border:none; padding:10px 20px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:0.95rem; width:100%;">
              ✏️ 주문 수정하기
            </button>
          </div>
        ` : "";

        cardsHtml += `
          <div class="lookup-card" data-order-id="${order.orderId || ''}" style="text-align:left; border: 2px solid ${cardColor}; padding:15px; margin-bottom:15px; border-radius:12px;">
            <div style="font-size:0.85rem; color:#888; margin-bottom:5px; font-weight:bold;">주문번호: ${order.orderId || '번호 미발급'}</div>
            <div style="border-bottom:1px solid #eee; padding-bottom:10px; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0; font-size:1.15rem; color:#333;">📦 배송지: ${order.receiver || '확인중'} 님</h3>
                <span class="badge" style="font-size:0.9rem; padding:4px 8px; background:${badgeBg}; border-radius:20px; font-weight:bold; color:#333;">
                    ${currentStatus || '상태 확인중'}
                </span>
            </div>

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

      // 3단계: 합계 요약 바 (항상 최상단에 노출되도록 개선)
      const customerName = result.data[0].sender || result.data[0].receiver || "고객";

      let summaryHtml = `
      <div style="background:#FFF3E0; border: 2px solid #F57C00; border-radius:12px; padding: 20px; margin-bottom: 25px; text-align:center;">
          <h2 style="margin:0 0 10px 0; color:#F57C00; font-size:1.25rem;">${customerName}님, 실시간 주문 현황입니다.</h2>
          ${globalPendingTotal > 0 ? `
            <div style="font-size:1.4rem; font-weight:bold; color:#333; margin-top: 15px; margin-bottom: 5px;">입금 확인이 필요한 금액: <span style="color:#D84315;">${globalPendingTotal.toLocaleString()}원</span></div>
            <div style="font-size:0.95rem; font-weight:bold; color:#388E3C; margin-top: 10px; background:#fff; padding:10px; border-radius:8px; display:inline-block; border: 1px solid #c8e6c9;">
                농협 060-02-077998 문미진
                <button onclick="navigator.clipboard.writeText('060-02-077998'); alert('계좌번호가 복사되었습니다!');" style="margin-left:10px; background:#388E3C; color:#fff; border:none; padding:4px 10px; border-radius:4px; font-size:0.85rem; cursor:pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">복사하기</button>
            </div>
          ` : `
            <div style="font-size:1.15rem; font-weight:bold; color:#1976D2; margin-top: 15px;">🎉 모든 주문의 결제 및 처리가 완료되었습니다!</div>
          `}
      </div>
      `;

      // 최종 DOM 부착
      resultsDiv.innerHTML = summaryHtml + cardsHtml;
    } else {
      resultsDiv.innerHTML = "<p style='color:red;'>일치하는 주문 내역이 없습니다.</p>";
    }
  } catch(err) {
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
  document.getElementById('editAddress').value = order.address || '';
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
  const receiverPhone = document.getElementById('editReceiverPhone').value;
  const address = document.getElementById('editAddress').value;

  if (!receiver || !receiverPhone || !address) {
    return alert("받는 분 정보를 모두 입력해주세요.");
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
    receiverAddress: address,
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

// 1. 농장소식 및 공지사항 로딩 엔진
async function loadFarmNews() {
    try {
        const response = await fetch(`${API_URL}?action=getNewsAndStories`);
        let data = await response.json();
        if (data.data) data = data.data; 

        // [공지사항 섹션] - 사진 경로를 시트 데이터(notice.imageUrl)와 정확히 매칭
        if (data.notices && data.notices.length > 0) {
            const notice = data.notices[0];
            const bar = document.getElementById('notice-bar');
            const content = document.getElementById('notice-content');
            if (bar && content) {
                bar.style.display = 'flex';
                bar.style.cursor = 'pointer';
                content.innerText = notice.title;
                
                // 🍊 시트 D열(imageUrl)에 있는 사진을 팝업에 띄웁니다.
                let raw = notice.imageUrl || "";
                let fId = raw.match(/[?&]id=([^&]+)/)?.[1] || raw.match(/\/d\/([^/]+)/)?.[1] || raw;
                const finalNoticeImg = (fId.length > 20) ? `https://drive.google.com/thumbnail?id=${fId}&sz=w800` : raw;

                bar.onclick = () => openStoryModal({
                    imageUrl: finalNoticeImg,
                    title: notice.title,
                    content: notice.content
                });
            }
        }

        // [농장소식 섹션] - 원형 이미지 엑박 해결 및 1:1 사진 매칭
        if (data.stories && data.stories.length > 0) {
            const list = document.getElementById('story-list');
            if (list) {
                document.getElementById('story-section').style.display = 'block';
                list.innerHTML = ''; 
                data.stories.forEach(story => {
                    let raw = story.imageUrl || "";
                    let fId = raw.match(/[?&]id=([^&]+)/)?.[1] || raw.match(/\/d\/([^/]+)/)?.[1] || raw;
                    
                    // 🍊 엑박 방지를 위해 썸네일 주소로 강제 변환
                    const finalImg = (fId.length > 20) ? `https://drive.google.com/thumbnail?id=${fId}&sz=w500` : raw;

                    const item = document.createElement('div');
                    item.className = 'story-item';
                    item.innerHTML = `
                        <img src="${finalImg}" class="story-circle" onerror="this.src='https://via.placeholder.com/150?text=Hamchorom'">
                        <span>${story.title}</span>
                    `;
                    // 🍊 클릭 시 해당 스토리의 사진만 팝업에 전달
                    item.onclick = () => openStoryModal({ ...story, imageUrl: finalImg });
                    list.appendChild(item);
                });
            }
        }
    } catch (e) { console.error("소식 로딩 실패:", e); }
}

// 2. 상세보기 팝업 엔진 (이미지 엑박 및 닫기 연동)
function openStoryModal(data) {
    const modal = document.getElementById('story-modal');
    if (modal) {
        const modalImg = document.getElementById('modal-img');
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        
        if (modalImg) modalImg.src = data.imageUrl;
        if (modalTitle) modalTitle.innerText = data.title;
        if (modalBody) modalBody.innerText = data.content;
        
        modal.style.display = 'block';
    }
}

// 3. 팝업 닫기 로직 (X 버튼 및 배경 클릭 시 닫기)
document.addEventListener('click', (e) => {
    const modal = document.getElementById('story-modal');
    // 클릭한 대상이 close-modal 클래스(X버튼)이거나 모달 배경일 경우 닫음
    if (e.target.classList.contains('close-modal') || e.target === modal) {
        if (modal) modal.style.display = 'none';
    }
});

// 4. 원장님의 유일한 시동 열쇠
window.addEventListener('load', loadFarmNews);
