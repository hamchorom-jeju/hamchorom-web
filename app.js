// [app.js 수정] 시트에서 공지/소식 불러오기 및 이미지 처리
async function loadFarmNews() {
    try {
        const response = await fetch(`${API_URL}?action=getNewsAndStories`);
        const data = await response.json();

        // 1. 공지사항 표시 및 클릭 이벤트 추가
        if (data.notices && data.notices.length > 0) {
            const lastNotice = data.notices[0];
            const noticeBar = document.getElementById('notice-bar');
            const noticeContent = document.getElementById('notice-content');
            
            noticeBar.style.display = 'flex';
            noticeBar.style.cursor = 'pointer'; // 클릭 가능하다는 표시
            noticeContent.innerText = lastNotice.title;
            
            // 공지사항 클릭 시 상세내용 팝업 띄우기
            noticeBar.onclick = () => {
                const noticeData = {
                    imageUrl: "https://lh3.googleusercontent.com/d/1we1fXFJamRsf5BehxgoZlESSRlOOXH9B", // 기본 공지 이미지나 로고
                    title: lastNotice.title,
                    content: lastNotice.content
                };
                openStoryModal(noticeData);
            };
        }

        // 2. 농장소식(스토리) 표시
        if (data.stories && data.stories.length > 0) {
            const storyList = document.getElementById('story-list');
            document.getElementById('story-section').style.display = 'block';
            storyList.innerHTML = ''; // 중복 방지 초기화
            
            data.stories.forEach(story => {
                // 드라이브 링크를 직접 보여줄 수 있는 주소로 변환
                let rawUrl = story.imageUrl;
                let finalImgUrl = rawUrl;
                
                if(rawUrl.includes('id=')) {
                    const fileId = rawUrl.split('id=')[1].split('&')[0];
                    finalImgUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
                }

                const item = document.createElement('div');
                item.className = 'story-item';
                item.innerHTML = `
                    <img src="${finalImgUrl}" class="story-circle" onerror="this.src='https://via.placeholder.com/150?text=Hamchorom'">
                    <span>${story.title}</span>
                `;
                item.onclick = () => {
                    const storyWithCleanImg = {...story, imageUrl: finalImgUrl};
                    openStoryModal(storyWithCleanImg);
                };
                storyList.appendChild(item);
            });
        }
    } catch (e) { console.error("소식 로딩 실패:", e); }
}
