const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// POST 요청의 본문(body)을 해석하기 위한 설정
app.use(express.urlencoded({ extended: true }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// [공통 로직] 상단 네비게이션 헤더 동적 생성 (게시판 간 이동 및 홈 백링크 제공)
async function getHeaderHTML() {
  try {
    const boardResult = await pool.query('SELECT name, slug FROM boards ORDER BY id ASC');
    let boardLinks = boardResult.rows.map(b => `<a href="/board/${b.slug}">${b.name}</a>`).join(' | ');
    
    return `
      <header>
        <h1><a href="/" style="text-decoration:none; color:black;">🏛️ 통합 커뮤니티</a></h1>
        <nav>
          <a href="/">홈(사용자목록)</a> | ${boardLinks}
        </nav>
      </header>
      <hr>
    `;
  } catch (err) {
    return `<h1><a href="/">🏛️ 통합 커뮤니티</a></h1><hr>`;
  }
}

// 1. 메인 페이지: 사용자 목록 출력 및 전체 메뉴 제공
app.get('/', async (req, res) => {
  try {
    const header = await getHeaderHTML();
    const result = await pool.query('SELECT name FROM aift');
    let userList = result.rows.map(row => `<li>${row.name}</li>`).join('');

    res.send(`
      ${header}
      <h2>현재 등록된 사용자 목록</h2>
      <ul>${userList || '등록된 사용자가 없습니다.'}</ul>
      <br>
      <a href="/add-user"><button>새 사용자 추가하기</button></a>
    `);
  } catch (err) {
    res.status(500).send('DB Error');
  }
});

// 2. 사용자 추가 페이지 (입력 폼)
app.get('/add-user', async (req, res) => {
  const header = await getHeaderHTML();
  res.send(`
    ${header}
    <h2>새 사용자 등록</h2>
    <form action="/add-user" method="POST">
      <input type="text" name="userName" placeholder="이름을 입력하세요" required>
      <button type="submit">등록</button>
    </form>
  `);
});

// 3. 사용자 추가 처리 (DB INSERT)
app.post('/add-user', async (req, res) => {
  const { userName } = req.body;
  try {
    await pool.query('INSERT INTO aift (name) VALUES ($1)', [userName]);
    res.redirect('/');
  } catch (err) {
    res.status(500).send('데이터 저장 중 오류가 발생했습니다.');
  }
});

// 4. 특정 게시판의 글 목록 보기 (/board/:slug)
app.get('/board/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    const header = await getHeaderHTML();
    
    // 현재 게시판 정보 가져오기
    const boardResult = await pool.query('SELECT * FROM boards WHERE slug = $1', [slug]);
    if (boardResult.rows.length === 0) return res.status(404).send('존재하지 않는 게시판입니다.');
    const board = boardResult.rows[0];

    // 해당 게시판의 글 목록 가져오기 (최신순)
    const postResult = await pool.query('SELECT id, title, author, created_at FROM posts WHERE board_id = $1 ORDER BY id DESC', [board.id]);
    let postList = postResult.rows.map(p => `
      <li>
        <a href="/post/${p.id}"><b>${p.title}</b></a> (작성자: ${p.author}) - <i>${p.created_at.toLocaleDateString()}</i>
      </li>
    `).join('');

    res.send(`
      ${header}
      <h2>🎈 ${board.name}</h2>
      <a href="/board/${slug}/add"><button>글쓰기</button></a>
      <br><br>
      <ul>${postList || '게시글이 없습니다. 첫 글을 남겨보세요!'}</ul>
    `);
  } catch (err) {
    res.status(500).send('게시판 조회 중 오류 발생');
  }
});

// 5. 게시글 작성 페이지 (입력 폼)
app.get('/board/:slug/add', async (req, res) => {
  const { slug } = req.params;
  const header = await getHeaderHTML();
  res.send(`
    ${header}
    <h2>✍️ 글 작성하기</h2>
    <form action="/board/${slug}/add" method="POST" style="display:flex; flex-direction:column; max-width:400px; gap:10px;">
      <input type="text" name="author" placeholder="작성자 닉네임" required>
      <input type="password" name="password" placeholder="비밀번호 (삭제/수정용)" required>
      <input type="text" name="title" placeholder="글 제목" required>
      <textarea name="content" placeholder="내용을 입력하세요" rows="5" required></textarea>
      <button type="submit">게시하기</button>
    </form>
  `);
});

// 6. 게시글 작성 처리 (DB INSERT)
app.post('/board/:slug/add', async (req, res) => {
  const { slug } = req.params;
  const { author, password, title, content } = req.body;
  try {
    const boardResult = await pool.query('SELECT id FROM boards WHERE slug = $1', [slug]);
    const boardId = boardResult.rows[0].id;

    await pool.query(
      'INSERT INTO posts (board_id, title, content, author, password) VALUES ($1, $2, $3, $4, $5)',
      [boardId, title, content, author, password]
    );
    res.redirect(`/board/${slug}`);
  } catch (err) {
    res.status(500).send('글 저장 실패');
  }
});

// 7. 게시글 상세보기 및 댓글 출력 (/post/:id)
app.get('/post/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const header = await getHeaderHTML();
    
    // 게시글 상세조회
    const postResult = await pool.query('SELECT p.*, b.slug FROM posts p JOIN boards b ON p.board_id = b.id WHERE p.id = $1', [id]);
    if (postResult.rows.length === 0) return res.status(404).send('글을 찾을 수 없습니다.');
    const post = postResult.rows[0];

    // 댓글 목록 조회
    const commentResult = await pool.query('SELECT * FROM comments WHERE post_id = $1 ORDER BY id ASC', [id]);
    let commentList = commentResult.rows.map(c => `
      <div style="border-bottom: 1px dashed #ccc; padding: 5px 0;">
        <b>${c.author}</b>: ${c.content} 
        <form action="/comment/${c.id}/delete" method="POST" style="display:inline; margin-left:10px;">
          <input type="hidden" name="postId" value="${id}">
          <input type="password" name="password" placeholder="비밀번호" style="width:70px;" required>
          <button type="submit" style="font-size:11px;">삭제</button>
        </form>
      </div>
    `).join('');

    res.send(`
      ${header}
      <p><a href="/board/${post.slug}">← 목록으로 돌아가기</a></p>
      <h2>${post.title}</h2>
      <p><b>작성자:</b> ${post.author} | <b>작성일:</b> ${post.created_at.toLocaleString()}</p>
      <div style="padding: 15px; border: 1px solid #ccc; min-height:100px; background:#fafafa;">
        ${post.content.replace(/\n/g, '<br>')}
      </div>
      
      <br>
      <form action="/post/${post.id}/delete" method="POST" style="display:inline;">
        <input type="hidden" name="slug" value="${post.slug}">
        <input type="password" name="password" placeholder="글 비밀번호" required>
        <button type="submit" style="background:#ffcccc;">게시글 삭제</button>
      </form>
      
      <hr>
      <h3>💬 댓글 (${commentResult.rows.length})</h3>
      <div>${commentList || '작성된 댓글이 없습니다.'}</div>
      
      <br>
      <form action="/post/${id}/comment" method="POST">
        <input type="text" name="author" placeholder="닉네임" style="width:100px;" required>
        <input type="password" name="password" placeholder="비밀번호" style="width:100px;" required>
        <input type="text" name="content" placeholder="댓글 내용을 입력하세요" style="width:300px;" required>
        <button type="submit">댓글달기</button>
      </form>
    `);
  } catch (err) {
    res.status(500).send('글 상세보기 로직 오류');
  }
});

// 8. 게시글 삭제 처리 (비밀번호 확인)
app.post('/post/:id/delete', async (req, res) => {
  const { id } = req.params;
  const { password, slug } = req.body;
  try {
    const postResult = await pool.query('SELECT password FROM posts WHERE id = $1', [id]);
    if (postResult.rows.length === 0) return res.status(404).send('글이 존재하지 않습니다.');
    
    // 비밀번호 평문 대조 검증
    if (postResult.rows[0].password === password) {
      await pool.query('DELETE FROM posts WHERE id = $1', [id]);
      res.send(`<script>alert("성공적으로 삭제되었습니다."); location.href="/board/${slug}";</script>`);
    } else {
      res.send(`<script>alert("비밀번호가 일치하지 않습니다!"); history.back();</script>`);
    }
  } catch (err) {
    res.status(500).send('삭제 중 오류가 발생했습니다.');
  }
});

// 9. 댓글 작성 처리
app.post('/post/:id/comment', async (req, res) => {
  const { id } = req.params;
  const { author, password, content } = req.body;
  try {
    await pool.query(
      'INSERT INTO comments (post_id, author, password, content) VALUES ($1, $2, $3, $4)',
      [id, author, password, content]
    );
    res.redirect(`/post/${id}`);
  } catch (err) {
    res.status(500).send('댓글 작성 실패');
  }
});

// 10. 댓글 삭제 처리 (비밀번호 확인)
app.post('/comment/:id/delete', async (req, res) => {
  const { id } = req.params;
  const { password, postId } = req.body;
  try {
    const commentResult = await pool.query('SELECT password FROM comments WHERE id = $1', [id]);
    if (commentResult.rows.length === 0) return res.status(404).send('댓글이 존재하지 않습니다.');

    if (commentResult.rows[0].password === password) {
      await pool.query('DELETE FROM comments WHERE id = $1', [id]);
      res.redirect(`/post/${postId}`);
    } else {
      res.send(`<script>alert("댓글 비밀번호가 틀렸습니다."); history.back();</script>`);
    }
  } catch (err) {
    res.status(500).send('댓글 삭제 실패');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
