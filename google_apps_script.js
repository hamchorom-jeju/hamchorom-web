/**
 * [함초롬 웹앱 통합 엔진 - 최종 수정판] 
 * 지니님의 통합보드 칼럼 순서 보존 + 주문 수정(Update) 기능 추가
 */

const SHEET_NAME = "웹앱주문서";

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  initDatabase(ss); // DB 자동 점검 및 생성
  var targetSheet = ss.getSheetByName(SHEET_NAME);

  try {
    var contents = e.postData.contents;
    if (!contents) return ContentService.createTextOutput("Error: No Contents");

    var payload = JSON.parse(contents);

    // ==========================================
    // 0. [회원 및 커뮤니티 전용 라우팅 처리]
    // ==========================================
    if (payload.action === "register") {
      return handleRegister(ss, payload);
    }
    if (payload.action === "login") {
      return handleLogin(ss, payload);
    }
    if (payload.action === "createPost") {
      return handleCreatePost(ss, payload);
    }
    if (payload.action === "createComment") {
      return handleCreateComment(ss, payload);
    }
    if (payload.action === "toggleLike") {
      return handleToggleLike(ss, payload);
    }

    // ==========================================
    // 1. [주문 수정 처리] 안티그래비티 이식 로직
    // ==========================================
    // === 수정된 updateOrder 판별 로직 (api.gs 내 doPost 상단) ===
if (payload.action === "updateOrder") {
  var targetId = String(payload.orderId || "").trim(); // 공백 제거 및 문자열 강제 변환
  
  var boardSheet = ss.getSheetByName("함초롬 통합보드");
  var statusSheet = ss.getSheetByName("주문 현황");
  var usedIds = {};

  // 데이터 비교를 위해 모든 ID를 문자열로 변환하여 수집
  if (boardSheet) {
    var bData = boardSheet.getDataRange().getValues();
    for (var i = 1; i < bData.length; i++) { usedIds[String(bData[i][0]).trim()] = true; }
  }
  if (statusSheet) {
    var sData = statusSheet.getDataRange().getValues();
    for (var i = 1; i < sData.length; i++) { usedIds[String(sData[i][0]).trim()] = true; }
  }

  if (usedIds[targetId]) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false, message: "원장님이 이미 처리 중인 주문이라 수정할 수 없습니다."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var wData = targetSheet.getDataRange().getDisplayValues();
  var found = false;

  for (var i = 1; i < wData.length; i++) {
    // 시트의 ID와 페이로드의 ID를 공백 제거 후 비교
    if (String(wData[i][0]).trim() === targetId) {
      var row = i + 1; 
      targetSheet.getRange(row, 3).setValue(payload.receiverName);
      targetSheet.getRange(row, 4).setValue(fixPhone(payload.receiverPhone));
      targetSheet.getRange(row, 5).setValue(payload.receiverAddress);
      
      // 🍊 [추가] 보내는 분 성함이 새로 입력되었거나 수정되었다면 반영 (G열)
      if (payload.senderName !== undefined) {
        targetSheet.getRange(row, 7).setValue(payload.senderName);
      }
      
      targetSheet.getRange(row, 9).setValue(payload.itemDetails);
      targetSheet.getRange(row, 11).setValue(payload.deliveryMsg);
      targetSheet.getRange(row, 13).setValue(payload.giftMessage);
      targetSheet.getRange(row, 15).setValue(payload.totalAmount);
      
      targetSheet.getRange(row, 1, 1, 15).setBackground("#FFFF00"); // 노란색 강조
      found = true;
      break;
    }
  }

  if (found) {
    return ContentService.createTextOutput(JSON.stringify({ success: true, message: "성공" })).setMimeType(ContentService.MimeType.JSON);
  } else {
    // 실행은 됐는데 행을 못 찾은 경우 알림
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "주문 번호를 찾을 수 없습니다." })).setMimeType(ContentService.MimeType.JSON);
  }
}

    // ==========================================
    // 2. [기존 신규 주문 저장] 원본 로직 보존 + 재고 검증 및 차감 로직 추가
    // ==========================================
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000); // 10초간 잠금 시도 (동시 주문 방지)
    } catch (e) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: "접속자가 많아 처리가 지연되고 있습니다. 잠시 후 다시 시도해주세요." })).setMimeType(ContentService.MimeType.JSON);
    }

    try {
      var productSheet = ss.getSheetByName("단가표");
      var pData = productSheet.getDataRange().getValues();
      var orderItems = payload.items || [];
      
      // [재고 검증 로직]
      if (orderItems.length > 0) {
        for (var j = 0; j < orderItems.length; j++) {
          var item = orderItems[j];
          for (var k = 1; k < pData.length; k++) {
            if (pData[k][0] === item.name) {
              var currentStock = parseInt(pData[k][11]);
              if (isNaN(currentStock)) currentStock = 0; // 빈 값/비숫자 예외 처리
              
              if (currentStock < item.quantity) {
                 return ContentService.createTextOutput(JSON.stringify({ success: false, message: "현재 재고가 부족합니다. (" + item.name + " 잔여: " + currentStock + "박스)" })).setMimeType(ContentService.MimeType.JSON);
              }
              break;
            }
          }
        }
        
        // [재고 차감 및 품절 상태 자동 전환]
        for (var j = 0; j < orderItems.length; j++) {
          var item = orderItems[j];
          for (var k = 1; k < pData.length; k++) {
            if (pData[k][0] === item.name) {
               var oldStock = parseInt(pData[k][11]);
               if (isNaN(oldStock)) oldStock = 0;
               var newStock = oldStock - item.quantity;
               
               // Index 11 (L열): 재고수량 업데이트
               productSheet.getRange(k + 1, 12).setValue(newStock);
               
               // Index 7 (H열): 자동 품절 처리
               if (newStock <= 0) {
                 productSheet.getRange(k + 1, 8).setValue("품절");
               }
               break;
            }
          }
        }
      }

      var now = new Date();
      var timestampId = Utilities.formatDate(now, "Asia/Seoul", "yyyy-MM-dd H:mm:ss");
      var today = Utilities.formatDate(now, "GMT+9", "yyyy-MM-dd");

      var totalAmount = payload.totalAmount || 0;
      var itemDetails = payload.itemDetails || "";
      
      // [회원 포인트 처리]
      var sPhoneClean = String(payload.senderPhone || "").replace(/[^0-9]/g, "");
      var usedPoints = Number(payload.usedPoints) || 0;
      var earnedPoints = Math.floor((totalAmount - usedPoints) * 0.01); // 실결제 금액의 1% 적립
      if (earnedPoints < 0) earnedPoints = 0;
      
      if (sPhoneClean && sPhoneClean !== "") {
        var mSheet = ss.getSheetByName("회원명단");
        if (mSheet) {
          var mData = mSheet.getDataRange().getValues();
          for (var i = 1; i < mData.length; i++) {
            var mPhone = String(mData[i][0]).replace(/[^0-9]/g, "");
            if (mPhone === sPhoneClean) {
              var currentPoints = Number(mData[i][5]) || 0;
              // 포인트 차감 및 적립 적용
              var nextPoints = currentPoints - usedPoints + earnedPoints;
              if (nextPoints < 0) nextPoints = 0;
              mSheet.getRange(i + 1, 6).setValue(nextPoints);
              break;
            }
          }
        }
      }

      var rowData = [
        timestampId,
        payload.wishDate || today,
        payload.receiverName,
        fixPhone(payload.receiverPhone),
        payload.receiverAddress,
        payload.depositorName,
        payload.senderName,
        fixPhone(payload.senderPhone),
        itemDetails,
        payload.nickname || "",
        payload.deliveryMsg || (usedPoints > 0 ? "[포인트사용: " + usedPoints + "p]" : ""),
        payload.orderPath || "웹앱_직접",
        payload.giftMessage || "",
        false,
        totalAmount - usedPoints // 포인트 차감된 실결제액 기록
      ];

      targetSheet.appendRow(rowData);
      return ContentService.createTextOutput(JSON.stringify({ 
        success: true, 
        message: "주문이 완료되었습니다." + (earnedPoints > 0 ? " (" + earnedPoints + "포인트 적립 예정) 🍊" : "") 
      })).setMimeType(ContentService.MimeType.JSON);

    } finally {
      lock.releaseLock();
    }

  } catch (f) {
    return ContentService.createTextOutput("Error: " + f.toString());
  }
}

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  initDatabase(ss); // DB 자동 점검 및 생성
  
  // [회원 및 커뮤니티 전용 GET 라우팅 처리]
  if (e.parameter.action === "getPosts") {
    return handleGetPosts(ss, e.parameter);
  }
  if (e.parameter.action === "getComments") {
    return handleGetComments(ss, e.parameter);
  }
  if (e.parameter.action === "getMemberProfile") {
    return handleGetMemberProfile(ss, e.parameter);
  }
  
  // 1. [단가표] 상품 목록 가져오기
  if (e.parameter.action === "getProducts") {
    var sheet = ss.getSheetByName("단가표");
    var data = sheet.getDataRange().getValues();
    var products = [];
    
    for (var i = 1; i < data.length; i++) {
        products.push({
          name: data[i][0],      // A
          variety: data[i][1],   // B
          usage: data[i][2],     // C
          weight: data[i][3],    // D
          count: data[i][4],     // E
          price: data[i][5],     // F
          shipping: data[i][6],  // G
          status: data[i][7],    // H (상태)
          image: data[i][8],     // I
          desc: data[i][9],      // J
          stock: data[i][11]     // L (재고수량)
        });
    }
    return ContentService.createTextOutput(JSON.stringify(products)).setMimeType(ContentService.MimeType.JSON);
  }
  // [함초롬 농장소식 & 공지사항 통합 불러오기 로직]
if (e.parameter.action === "getNewsAndStories") {
  var newsSheet = ss.getSheetByName("농장소식");
  
  // 시트가 없으면 빈 배열 반환하여 오류 방지
  if (!newsSheet) {
    return ContentService.createTextOutput(JSON.stringify({notices: [], stories: []}))
           .setMimeType(ContentService.MimeType.JSON);
  }
  
  var nData = newsSheet.getDataRange().getValues();
  var notices = [];
  var stories = [];
  
  // 1행(헤더) 제외하고 데이터 순회
  for (var i = 1; i < nData.length; i++) {
    var date = nData[i][0];
    var type = String(nData[i][1]).trim();     // 구분 (공지/스토리)
    var title = nData[i][2];                  // 제목
    var imgId = String(nData[i][3]).trim();    // 이미지ID
    var content = nData[i][4];                // 상세내용
    var isShow = String(nData[i][5]).trim();   // 노출여부 (Y/N)
    var subtitle = String(nData[i][6] || "").trim(); // G열: 부제목
    
    if (isShow === "Y") {
      var rawImg = String(nData[i][3]).trim(); // D열 데이터
      var finalUrl = "";
      
      if (rawImg) {
        // 🍊 만약 이미 완성된 링크라면 그대로 사용
        if (rawImg.includes("thumbnail?id=")) {
          finalUrl = rawImg;
        } 
        // 🍊 만약 ID만 들어있다면 주소 조립
        else {
          finalUrl = "https://drive.google.com/thumbnail?id=" + rawImg + "&sz=w500";
        }
      }

      var item = {
        date: date,
        title: title,
        subtitle: subtitle,
        content: content,
        imageUrl: finalUrl
      };
      
      if (type === "공지") {
        notices.push(item);
      } else if (type === "스토리") {
        stories.push(item);
      }
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    notices: notices,
    stories: stories
  })).setMimeType(ContentService.MimeType.JSON);
}

  // 2. [주문 조회] 전수 조사 버전
  if (e.parameter.action === "lookup" && e.parameter.phone) {
    var phoneInput = String(e.parameter.phone).replace(/[^0-9]/g, ''); 
    var searchResult = [];

    // [1단계] 주문 현황 시트 수집
    var historySheet = ss.getSheetByName("주문 현황");
    if (historySheet) {
      var hData = historySheet.getRange(1, 1, historySheet.getLastRow(), 11).getDisplayValues();
      for (var i = 1; i < hData.length; i++) {
        var rowPhoneB = String(hData[i][1] || "").replace(/[^0-9]/g, ''); // B열: 보내는 분 연락처
        
        if (rowPhoneB === phoneInput) {
          var senderName = String(hData[i][10]).trim(); // K열: 보내는 분
          searchResult.push({
            orderId: hData[i][0],
            status: hData[i][3],
            tracking: hData[i][4] || "-",
            receiver: hData[i][2],
            receiverPhone: hData[i][6],
            address: hData[i][7],
            items: hData[i][8],
            totalAmount: hData[i][9],
            sender: senderName,
            customerName: senderName || hData[i][2] // K열 있으면 보내는분, 없으면 받는분
          });
        }
      }
    }

    // [2단계] 웹앱주문서 시트 수집
    var webSheet = ss.getSheetByName("웹앱주문서");
    if (webSheet) {
      var wData = webSheet.getRange(1, 1, webSheet.getLastRow(), 15).getDisplayValues();
      for (var i = 1; i < wData.length; i++) {
        var sPhone = String(wData[i][7] || "").replace(/[^0-9]/g, ''); // H열: 보내는 분 연락처
        
        if (sPhone === phoneInput) {
          var customerName = String(wData[i][6]).trim() || String(wData[i][2]).trim(); // 보내는분(G) 없으면 받는분(C)
          var isAlreadyIn = searchResult.some(function(item) { return item.orderId === wData[i][0]; });
          
          if (!isAlreadyIn) {
            searchResult.push({
              orderId: wData[i][0],
              status: "✅ 주문접수 (확인 중)",
              totalAmount: wData[i][14],
              receiver: wData[i][2],
              receiverPhone: wData[i][3],
              address: wData[i][4],
              items: wData[i][8],
              sender: wData[i][6],          // G열: 보내는 분
              memo: wData[i][10],           // K열: 배송 메시지
              giftMessage: wData[i][12],    // M열: 선물 메시지
              customerName: customerName
            });
          } else {
            // 이미 주문 현황에 있는 경우 이름만 정확히 보정 (웹앱주문서 기준)
            searchResult.forEach(function(item) {
              if (item.orderId === wData[i][0]) {
                item.customerName = customerName;
                item.sender = wData[i][6];
                item.memo = wData[i][10];
              }
            });
          }
        }
      }
    }

    // --- [지니 보정본] 수정 가능 여부 판단 로직 ---
    var boardSheet = ss.getSheetByName("함초롬 통합보드");
    var statusSheet = ss.getSheetByName("주문 현황");
    var usedIds = {};

    if (boardSheet) {
      var bData = boardSheet.getDataRange().getValues();
      for (var i = 1; i < bData.length; i++) { usedIds[String(bData[i][0])] = true; }
    }
    if (statusSheet) {
      var sData = statusSheet.getDataRange().getValues();
      for (var i = 1; i < sData.length; i++) { usedIds[String(sData[i][0])] = true; }
    }

    searchResult.forEach(function(item) {
      var oid = String(item.orderId || "");
      // 웹앱주문서 상태이고 + 다른 시트에 없을 때만 수정 가능(editable: true)
      item.editable = (item.status === "✅ 주문접수 (확인 중)") && !usedIds[oid];
    });

    return ContentService.createTextOutput(JSON.stringify({ success: true, data: searchResult })).setMimeType(ContentService.MimeType.JSON);
  }

  // 3. [주소록 조회] 스마트 필터링 (자기 자신 제외 로직 포함)
  if (e.parameter.action === "getAddressHistory" && e.parameter.phone) {
    var searchPhone = String(e.parameter.phone).replace(/[^0-9]/g, '');
    var deliveryType = e.parameter.deliveryType;
    
    var historySheet = ss.getSheetByName("발송완료 리스트") || ss.getSheetByName("발송완료리스트");
    var addressList = [];
    var seen = {}; 

    if (historySheet) {
      var data = historySheet.getDataRange().getValues();
      // "self"/"gift" 또는 "직접받기"/"선물하기" 모두 대응
      var isSelf = (deliveryType === "self" || deliveryType === "직접받기");
      var isGift = (deliveryType === "gift" || deliveryType === "선물하기");
      var searchColIdx = isSelf ? 4 : 14;

      for (var i = 1; i < data.length; i++) {
        var rowSenderPhone = String(data[i][14] || "").replace(/[^0-9]/g, ''); // O열
        var rowRecipientPhone = String(data[i][4] || "").replace(/[^0-9]/g, ''); // E열
        var rowTargetPhone = (searchColIdx === 4) ? rowRecipientPhone : rowSenderPhone;
        
        if (rowTargetPhone === searchPhone) {
          // 🍊 [추가 로직] 선물하기일 때, 보낸 사람과 받는 사람이 같으면 제외
          if (isGift && rowSenderPhone === rowRecipientPhone) continue;

          var rName = String(data[i][2] || "").trim();    // C열
          var rAddr = String(data[i][5] || "").trim();    // F열
          
          if (!rAddr) continue;

          // 띄어쓰기나 줄바꿈 차이로 인해 중복으로 인식되는 것을 방지하기 위해 공백 모두 제거
          var normAddr = rAddr.replace(/\s+/g, '');
          var normName = rName.replace(/\s+/g, '');
          
          var key = isGift ? (normName + normAddr) : normAddr;
          
          if (!seen[key]) {
            addressList.push({
              name: rName,
              phone: rowRecipientPhone,
              address: rAddr
            });
            seen[key] = true;
          }
        }
      }
    }
    
    addressList.reverse();
    var resultData = addressList.slice(0, 10);
    
    // 결과가 있을 때만 성공 반환 (프론트에서 length 체크 용이하게)
    return ContentService.createTextOutput(JSON.stringify({ 
      success: resultData.length > 0, 
      data: resultData 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 숫자만 들어와도 010-0000-0000 형식으로 바꿔주는 마법의 함수
function fixPhone(num) {
  if (!num) return "";
  var cleaned = ('' + num).replace(/\D/g, '');
  var match = cleaned.match(/^(\d{3})(\d{4})(\d{4})$/);
  if (match) {
    return match[1] + '-' + match[2] + '-' + match[3];
  }
  return num;
}

// =========================================================================
// 🌐 [회원제 및 커뮤니티 전용 백엔드 핵심 엔진 구현]
// =========================================================================

// 데이터베이스 초기화 (회원, 게시판, 댓글, 좋아요 시트 생성)
function initDatabase(ss) {
  var sheets = {
    "회원명단": ["전화번호", "닉네임", "비밀번호", "기본배송지", "회원등급", "보유포인트", "가입일"],
    "커뮤니티게시판": ["게시글ID", "작성자전화번호", "분류", "제목", "내용", "이미지ID", "작성시간", "조회수"],
    "게시글댓글": ["댓글ID", "게시글ID", "작성자전화번호", "내용", "작성시간"],
    "좋아요기록": ["게시글ID", "작성자전화번호"]
  };
  
  for (var sheetName in sheets) {
    if (!ss.getSheetByName(sheetName)) {
      var sheet = ss.insertSheet(sheetName);
      sheet.appendRow(sheets[sheetName]);
      sheet.getRange(1, 1, 1, sheets[sheetName].length).setFontWeight("bold").setBackground("#E8F5E9");
    }
  }
}

// 패스워드 SHA-256 해시화 암호화 처리
function hashPassword(password) {
  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8);
  var hashStr = "";
  for (var i = 0; i < rawHash.length; i++) {
    var byteVal = rawHash[i];
    if (byteVal < 0) byteVal += 256;
    var byteString = byteVal.toString(16);
    if (byteString.length == 1) byteString = "0" + byteString;
    hashStr += byteString;
  }
  return hashStr;
}

// 회원 가입 처리 (1000포인트 축하금 지급)
function handleRegister(ss, payload) {
  var sheet = ss.getSheetByName("회원명단");
  var data = sheet.getDataRange().getValues();
  var phoneClean = String(payload.phone || "").replace(/[^0-9]/g, "");
  
  if (!phoneClean || !payload.nickname || !payload.password) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "필수 정보가 누락되었습니다." })).setMimeType(ContentService.MimeType.JSON);
  }
  
  for (var i = 1; i < data.length; i++) {
    var sPhone = String(data[i][0]).replace(/[^0-9]/g, "");
    if (sPhone === phoneClean) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: "이미 가입된 휴대폰 번호입니다." })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  var hashedPassword = hashPassword(payload.password);
  var now = new Date();
  var joinDateStr = Utilities.formatDate(now, "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
  
  sheet.appendRow([
    phoneClean,
    payload.nickname,
    hashedPassword,
    payload.address || "",
    "일반",
    1000,
    joinDateStr
  ]);
  
  return ContentService.createTextOutput(JSON.stringify({ 
    success: true, 
    message: "회원가입이 완료되었습니다! 가입 축하 1,000포인트가 적립되었습니다. 🍊" 
  })).setMimeType(ContentService.MimeType.JSON);
}

// 로그인 확인
function handleLogin(ss, payload) {
  var sheet = ss.getSheetByName("회원명단");
  var data = sheet.getDataRange().getValues();
  var phoneClean = String(payload.phone || "").replace(/[^0-9]/g, "");
  var password = payload.password;
  
  if (!phoneClean || !password) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "전화번호와 비밀번호를 입력해주세요." })).setMimeType(ContentService.MimeType.JSON);
  }
  
  var hashedPassword = hashPassword(password);
  
  for (var i = 1; i < data.length; i++) {
    var sPhone = String(data[i][0]).replace(/[^0-9]/g, "");
    if (sPhone === phoneClean) {
      var sPassword = String(data[i][2]);
      if (sPassword === hashedPassword) {
        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          member: {
            phone: phoneClean,
            nickname: String(data[i][1]),
            address: String(data[i][3]),
            grade: String(data[i][4]),
            points: Number(data[i][5]) || 0
          }
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({ success: false, message: "비밀번호가 올바르지 않습니다." })).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({ success: false, message: "등록되지 않은 번호입니다." })).setMimeType(ContentService.MimeType.JSON);
}

// 게시글 작성 (+100포인트)
function handleCreatePost(ss, payload) {
  var memberSheet = ss.getSheetByName("회원명단");
  var mData = memberSheet.getDataRange().getValues();
  var phoneClean = String(payload.phone || "").replace(/[^0-9]/g, "");
  
  var memberFound = false;
  var memberRowIdx = -1;
  var currentPoints = 0;
  for (var i = 1; i < mData.length; i++) {
    var sPhone = String(mData[i][0]).replace(/[^0-9]/g, "");
    if (sPhone === phoneClean) {
      memberFound = true;
      memberRowIdx = i + 1;
      currentPoints = Number(mData[i][5]) || 0;
      break;
    }
  }
  
  if (!memberFound) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "인증되지 않은 사용자입니다." })).setMimeType(ContentService.MimeType.JSON);
  }
  
  var postSheet = ss.getSheetByName("커뮤니티게시판");
  var postId = "POST_" + new Date().getTime();
  var now = new Date();
  var writeDateStr = Utilities.formatDate(now, "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
  
  postSheet.appendRow([
    postId,
    phoneClean,
    payload.category || "자유",
    payload.title || "",
    payload.content || "",
    payload.imageId || "",
    writeDateStr,
    0
  ]);
  
  var bonusPoints = 100;
  memberSheet.getRange(memberRowIdx, 6).setValue(currentPoints + bonusPoints);
  
  return ContentService.createTextOutput(JSON.stringify({ 
    success: true, 
    postId: postId,
    message: "게시글이 성공적으로 등록되었습니다! 소통 보너스 100포인트가 적립되었습니다. 🌱"
  })).setMimeType(ContentService.MimeType.JSON);
}

// 댓글 작성 (+10포인트)
function handleCreateComment(ss, payload) {
  var memberSheet = ss.getSheetByName("회원명단");
  var mData = memberSheet.getDataRange().getValues();
  var phoneClean = String(payload.phone || "").replace(/[^0-9]/g, "");
  
  var memberFound = false;
  var memberRowIdx = -1;
  var currentPoints = 0;
  for (var i = 1; i < mData.length; i++) {
    var sPhone = String(mData[i][0]).replace(/[^0-9]/g, "");
    if (sPhone === phoneClean) {
      memberFound = true;
      memberRowIdx = i + 1;
      currentPoints = Number(mData[i][5]) || 0;
      break;
    }
  }
  
  if (!memberFound) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "인증되지 않은 사용자입니다." })).setMimeType(ContentService.MimeType.JSON);
  }
  
  var commentSheet = ss.getSheetByName("게시글댓글");
  var commentId = "CMT_" + new Date().getTime();
  var now = new Date();
  var writeDateStr = Utilities.formatDate(now, "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
  
  commentSheet.appendRow([
    commentId,
    payload.postId,
    phoneClean,
    payload.content || "",
    writeDateStr
  ]);
  
  var bonusPoints = 10;
  memberSheet.getRange(memberRowIdx, 6).setValue(currentPoints + bonusPoints);
  
  return ContentService.createTextOutput(JSON.stringify({ 
    success: true, 
    commentId: commentId,
    message: "댓글이 등록되었습니다! (+10포인트 적립)"
  })).setMimeType(ContentService.MimeType.JSON);
}

// 좋아요 토글
function handleToggleLike(ss, payload) {
  var likeSheet = ss.getSheetByName("좋아요기록");
  var data = likeSheet.getDataRange().getValues();
  var phoneClean = String(payload.phone || "").replace(/[^0-9]/g, "");
  var postId = String(payload.postId);
  
  if (!phoneClean || !postId) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "오류가 발생했습니다." })).setMimeType(ContentService.MimeType.JSON);
  }
  
  var foundRow = -1;
  for (var i = 1; i < data.length; i++) {
    var sPostId = String(data[i][0]);
    var sPhone = String(data[i][1]).replace(/[^0-9]/g, "");
    if (sPostId === postId && sPhone === phoneClean) {
      foundRow = i + 1;
      break;
    }
  }
  
  var liked = false;
  if (foundRow !== -1) {
    likeSheet.deleteRow(foundRow);
    liked = false;
  } else {
    likeSheet.appendRow([postId, phoneClean]);
    liked = true;
  }
  
  return ContentService.createTextOutput(JSON.stringify({ success: true, liked: liked })).setMimeType(ContentService.MimeType.JSON);
}

// 게시판 목록 가져오기
function handleGetPosts(ss, params) {
  var postSheet = ss.getSheetByName("커뮤니티게시판");
  var memberSheet = ss.getSheetByName("회원명단");
  var commentSheet = ss.getSheetByName("게시글댓글");
  var likeSheet = ss.getSheetByName("좋아요기록");
  
  var postData = postSheet.getDataRange().getValues();
  var memberData = memberSheet.getDataRange().getValues();
  var commentData = commentSheet.getDataRange().getValues();
  var likeData = likeSheet.getDataRange().getValues();
  
  var requesterPhone = String(params.requesterPhone || "").replace(/[^0-9]/g, "");
  
  var nicknameMap = {};
  for (var i = 1; i < memberData.length; i++) {
    var phone = String(memberData[i][0]).replace(/[^0-9]/g, "");
    nicknameMap[phone] = String(memberData[i][1]);
  }
  
  var commentCountMap = {};
  for (var i = 1; i < commentData.length; i++) {
    var pId = String(commentData[i][1]);
    commentCountMap[pId] = (commentCountMap[pId] || 0) + 1;
  }
  
  var likeCountMap = {};
  var userLikedMap = {};
  for (var i = 1; i < likeData.length; i++) {
    var pId = String(likeData[i][0]);
    var phone = String(likeData[i][1]).replace(/[^0-9]/g, "");
    likeCountMap[pId] = (likeCountMap[pId] || 0) + 1;
    
    if (requesterPhone && phone === requesterPhone) {
      userLikedMap[pId] = true;
    }
  }
  
  var posts = [];
  var filterCategory = params.category;
  
  for (var i = postData.length - 1; i >= 1; i--) {
    var pId = String(postData[i][0]);
    var authorPhone = String(postData[i][1]).replace(/[^0-9]/g, "");
    var category = String(postData[i][2]);
    
    if (filterCategory && filterCategory !== "All" && category !== filterCategory) {
      continue;
    }
    
    posts.push({
      postId: pId,
      authorPhone: authorPhone,
      authorNickname: nicknameMap[authorPhone] || "함초롬이",
      category: category,
      title: String(postData[i][3]),
      content: String(postData[i][4]),
      imageId: String(postData[i][5]),
      writeDate: String(postData[i][6]),
      viewCount: Number(postData[i][7]) || 0,
      commentCount: commentCountMap[pId] || 0,
      likeCount: likeCountMap[pId] || 0,
      userLiked: !!userLikedMap[pId]
    });
  }
  
  return ContentService.createTextOutput(JSON.stringify({ success: true, data: posts })).setMimeType(ContentService.MimeType.JSON);
}

// 특정 게시글의 댓글들 조회
function handleGetComments(ss, params) {
  var commentSheet = ss.getSheetByName("게시글댓글");
  var memberSheet = ss.getSheetByName("회원명단");
  
  var commentData = commentSheet.getDataRange().getValues();
  var memberData = memberSheet.getDataRange().getValues();
  
  var targetPostId = String(params.postId);
  
  var nicknameMap = {};
  for (var i = 1; i < memberData.length; i++) {
    var phone = String(memberData[i][0]).replace(/[^0-9]/g, "");
    nicknameMap[phone] = String(memberData[i][1]);
  }
  
  var comments = [];
  for (var i = 1; i < commentData.length; i++) {
    var pId = String(commentData[i][1]);
    if (pId === targetPostId) {
      var authorPhone = String(commentData[i][2]).replace(/[^0-9]/g, "");
      comments.push({
        commentId: String(commentData[i][0]),
        postId: pId,
        authorPhone: authorPhone,
        authorNickname: nicknameMap[authorPhone] || "함초롬이",
        content: String(commentData[i][3]),
        writeDate: String(commentData[i][4])
      });
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({ success: true, data: comments })).setMimeType(ContentService.MimeType.JSON);
}

// 회원 프로필 및 과거 주문서 정보 조회
function handleGetMemberProfile(ss, params) {
  var memberSheet = ss.getSheetByName("회원명단");
  var mData = memberSheet.getDataRange().getValues();
  var phoneClean = String(params.phone || "").replace(/[^0-9]/g, "");
  
  if (!phoneClean) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "휴대폰 번호가 전달되지 않았습니다." })).setMimeType(ContentService.MimeType.JSON);
  }
  
  var profile = null;
  for (var i = 1; i < mData.length; i++) {
    var sPhone = String(mData[i][0]).replace(/[^0-9]/g, "");
    if (sPhone === phoneClean) {
      profile = {
        phone: phoneClean,
        nickname: String(mData[i][1]),
        address: String(mData[i][3]),
        grade: String(mData[i][4]),
        points: Number(mData[i][5]) || 0,
        joinDate: String(mData[i][6])
      };
      break;
    }
  }
  
  if (!profile) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "회원 정보를 찾을 수 없습니다." })).setMimeType(ContentService.MimeType.JSON);
  }
  
  var orders = [];
  var historySheet = ss.getSheetByName("주문 현황");
  if (historySheet) {
    var hData = historySheet.getRange(1, 1, historySheet.getLastRow(), 11).getDisplayValues();
    for (var i = 1; i < hData.length; i++) {
      var rowPhoneB = String(hData[i][1] || "").replace(/[^0-9]/g, '');
      if (rowPhoneB === phoneClean) {
        orders.push({
          orderId: hData[i][0],
          status: hData[i][3],
          tracking: hData[i][4] || "-",
          receiver: hData[i][2],
          items: hData[i][8],
          totalAmount: hData[i][9]
        });
      }
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({ 
    success: true, 
    profile: profile,
    orders: orders
  })).setMimeType(ContentService.MimeType.JSON);
}
