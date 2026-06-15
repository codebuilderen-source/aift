const express = require('express');
const { Pool } = require('pg');
const session = require('express-session'); // 세션 패키지 추가

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

// 세션 설정 (메모리에 로그인 증표를 임시 저장)
app.use(session({
  secret: 'secret-key-aift', // 세션 암호화 키
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60000 * 30 } // 30분 동안 로그인 유지
}));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// [공통 로직] 네비게이션 헤더 (로그인 상태에 따라 다르게 표시)
async function getHeaderHTML(req) {
  try {
    const boardResult = await pool.query('SELECT name, slug FROM boards ORDER BY id ASC');
    let boardLinks = boardResult.rows.map(b => `<a href="/board/${b.slug}">${b.name}</a>`).join(' | ');
    
    // 로그인 여부에 따른 우측 상단 메뉴 분기
    let authStatus = '';
    if (req.session.user) {
      authStatus = `<span style="float:right;">👤 <b>${req.session.user.name}</b>님 환영합니다! | <a href="/logout">로그아웃</a></span>`;
    } else {
      authStatus = `<span style="float:right;"><a href="/login">로그인</a> | <a href="/add-user">회원가입</a></span>`;
    }

    return `
      <header>
        ${authStatus}
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

// 1. 메인 페이지
app.get('/', async (req, res) => {
  try {
    const header = await getHeaderHTML(req);
    const result = await pool.query('SELECT name FROM aift ORDER BY id DESC');
    let userList = result.rows.map(row => `<li>${row.name}</li>`).join('');

    res.send(`
      ${header}
      <h2>현재 가입된 가입자 목록</h2>
      <ul>${userList || '가입된 사용자가 없습니다.'}</ul>
    `);
  } catch (err) {
    res.status(500).send(`오류: ${err.message}`);
  }
});

// 2. 회원가입(사용자 추가) 페이지
app.get('/add-user', async (req, res) => {
  const header = await getHeaderHTML(req);
  res.send(`
    ${header}
    <h2>📝 회원 가입</h2>
    <form action="/add-user" method="POST" style="max-width:300px; display:flex; flex-direction:column; gap:10px;">
      <input type="text" name="userName" placeholder="사용할 아이디" required>
      <input type="password" name="password" placeholder="비밀번호" required>
      <button type="submit">가입하기</button>
    </form>
  `);
});

// 3. 회원가입 처리
app.post('/add-user', async (req, res) => {
  const { userName, password } = req.body;
  try {
    await pool.query('INSERT INTO aift (name, password) VALUES ($1, $2)', [userName, password]);
    res.send(`<script>alert("가입 성공! 로그인해 주세요."); location.href="/login";</script>`);
  } catch (err) {
    res.status(500).send(`가입 오류 (아이디 중복 가능성): ${err.message}`);
  }
});

// 4. 로그인 페이지
app.get('/login', async (req, res) => {
  const header = await getHeaderHTML(req);
  res.send(`
    ${header}
    <h2>🔑 로그인</h2>
    <form action="/login" method="POST" style="max-width:300px; display:flex; flex-direction:column; gap:10px;">
      <input type="text" name="userName" placeholder="아이디" required>
      <input type="password" name="password" placeholder="비밀번호" required>
      <button type="submit">로그인</button>
    </form>
  `);
});

// 5. 로그인 처리
app.post('/login', async (req, res) => {
  const { userName, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM aift WHERE name = $1 AND password = $2', [userName, password]);
    if (result.rows.length > 0) {
      // 로그인 성공 시 세션에 유저 정보 저장 ⭐️
      req.session.user = { id: result.rows[0].id, name: result.rows[0].name };
      res.redirect('/');
    } else {
      res.send(`<script>alert("아이디 또는 비밀번호가 틀렸습니다."); history.back();</script>`);
    }
  } catch (err) {
    res.status(500).send(`로그인 오류: ${err.message}`);
  }
});

// 6. 로그아웃 처리
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// 7. 특정 게시판 목록 보기 (JOIN을 통해 작성자 이름 가져오기)
app.get('/board/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    const header = await getHeaderHTML(req);
    const boardResult = await pool.query('SELECT * FROM boards WHERE slug = $1', [slug]);
    if (boardResult.rows.length === 0) return res.status(404).send('존재하지 않는 게시판입니다.');
    const board = boardResult.rows[0];

    // posts와 aift 테이블을 JOIN하여 유저의 'name'을 작성자로 출력
    const postResult = await pool.query(
      'SELECT p.id, p.title, a.name AS author, p.created_at, p.likes FROM posts p JOIN aift a ON p.user_id = a.id WHERE p.board_id = $1 ORDER BY p.id DESC', 
      [board.id]
    );
    
    let postList = postResult.rows.map(p => `
      <li>
        <a href="/post/${p.id}"><b>${p.title}</b></a> (작성자: ${p.author}) - [추천: ${p.likes}]
      </li>
    `).join('');

    res.send(`
      ${header}
      <h2>🎈 ${board.name}</h2>
      <a href="/board/${slug}/add"><button>글쓰기</button></a>
      <br><br>
      <ul>${postList || '게시글이 없습니다.'}</ul>
    `);
  } catch (err) {
    res.status(500).send(`게시판 조회 오류: ${err.message}`);
  }
});

// 8. 게시글 작성 페이지 (아이디/비밀번호 입력칸 제거!)
app.get('/board/:slug/add', async (req, res) => {
  // 로그인 안 한 사용자는 글쓰기 차단
  if (!req.session.user) {
    return res.send(`<script>alert("로그인이 필요한 서비스입니다."); location.href="/login";</script>`);
  }

  const { slug } = req.params;
  const header = await getHeaderHTML(req);
  res.send(`
    ${header}
    <h2>✍️ 글 작성하기 (작성자: ${req.session.user.name})</h2>
    <form action="/board/${slug}/add" method="POST" style="display:flex; flex-direction:column; max-width:400px; gap:10px;">
      <input type="text" name="title" placeholder="글 제목" required>
      <textarea name="content" placeholder="내용을 입력하세요" rows="5" required></textarea>
      <button type="submit">게시하기</button>
    </form>
  `);
});

// 9. 게시글 작성 처리 (세션의 유저 ID 사용)
app.post('/board/:slug/add', async (req, res) => {
  if (!req.session.user) return res.status(403).send('로그인이 필요합니다.');
  
  const { slug } = req.params;
  const { title, content } = req.body;
  try {
    const boardResult = await pool.query('SELECT id FROM boards WHERE slug = $1', [slug]);
    const boardId = boardResult.rows[0].id;

    // 세션에 저장되어 있던 로그인 유저의 고유 id(req.session.user.id)를 삽입 ⭐️
    await pool.query(
      'INSERT INTO posts (board_id, title, content, user_id) VALUES ($1, $2, $3, $4)',
      [boardId, title, content, req.session.user.id]
    );
    res.redirect(`/board/${slug}`);
  } catch (err) {
    res.status(500).send(`글 저장 오류: ${err.message}`);
  }
});

// 10. 게시글 상세보기 및 댓글 (본인 글일 때만 삭제 버튼 노출)
app.get('/post/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const header = await getHeaderHTML(req);
    
    const postResult = await pool.query(
      'SELECT p.*, a.name AS author, b.slug FROM posts p JOIN aift a ON p.user_id = a.id JOIN boards b ON p.board_id = b.id WHERE p.id = $1', 
      [id]
    );
    if (postResult.rows.length === 0) return res.status(404).send('글을 찾을 수 없습니다.');
    const post = postResult.rows[0];

    // 댓글 목록 가져오기 (JOIN 활용)
    const commentResult = await pool.query(
      'SELECT c.id, c.content, a.name AS author, c.user_id FROM comments c JOIN aift a ON c.user_id = a.id WHERE c.post_id = $1 ORDER BY c.id ASC', 
      [id]
    );

    let commentList = commentResult.rows.map(c => {
      // 본인이 쓴 댓글인 경우에만 삭제 버튼 노출
      let deleteBtn = '';
      if (req.session.user && req.session.user.id === c.user_id) {
        deleteBtn = `
          <form action="/comment/${c.id}/delete" method="POST" style="display:inline; margin-left:10px;">
            <input type="hidden" name="postId" value="${id}">
            <button type="submit" style="font-size:11px; background:#ffcccc;">삭제</button>
          </form>
        `;
      }
      return `<div style="padding:5px 0;"><b>${c.author}</b>: ${c.content} ${deleteBtn}</div>`;
    }).join('');

    // 본인이 쓴 게시글일 때만 게시글 삭제 폼 활성화
    let deletePostForm = '';
    if (req.session.user && req.session.user.id === post.user_id) {
      deletePostForm = `
        <form action="/post/${post.id}/delete" method="POST" style="display:inline;">
          <input type="hidden" name="slug" value="${post.slug}">
          <button type="submit" style="background:#ff9999; padding:5px 10px;">본인 게시글 삭제</button>
        </form>
      `;
    }

    // 댓글 입력 폼 분기
    let commentForm = '';
    if (req.session.user) {
      commentForm = `
        <form action="/post/${id}/comment" method="POST">
          <b>${req.session.user.name}</b>: 
          <input type="text" name="content" placeholder="댓글 내용 입력" style="width:300px;" required>
          <button type="submit">댓글달기</button>
        </form>
      `;
    } else {
      commentForm = `<p><a href="/login">로그인</a> 후 댓글을 남길 수 있습니다.</p>`;
    }

    res.send(`
      ${header}
      <p><a href="/board/${post.slug}">← 목록으로</a></p>
      <h2>${post.title}</h2>
      <p>작성자: ${post.author} | 추천수: ${post.likes}</p>
      <div style="padding:15px; border:1px solid #ccc; background:#fafafa;">${post.content.replace(/\n/g, '<br>')}</div>
      <br>
      ${deletePostForm}
      <hr>
      <h3>💬 댓글</h3>
      <div>${commentList || '댓글이 없습니다.'}</div>
      <br>
      ${commentForm}
    `);
  } catch (err) {
    res.status(500).send(`상세보기 오류: ${err.message}`);
  }
});

// 11. 게시글 삭제 처리 (세션 ID 검증)
app.post('/post/:id/delete', async (req, res) => {
  if (!req.session.user) return res.status(403).send('로그인이 필요합니다.');
  const { id } = req.params;
  const { slug } = req.body;
  try {
    const postResult = await pool.query('SELECT user_id FROM posts WHERE id = $1', [id]);
    if (postResult.rows[0].user_id === req.session.user.id) {
      await pool.query('DELETE FROM posts WHERE id = $1', [id]);
      res.send(`<script>alert("삭제되었습니다."); location.href="/board/${slug}";</script>`);
    } else {
      res.status(403).send('본인 글만 삭제할 수 있습니다.');
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// 12. 댓글 작성 처리 (세션 ID 활용)
app.post('/post/:id/comment', async (req, res) => {
  if (!req.session.user) return res.status(403).send('로그인이 필요합니다.');
  const { id } = req.params;
  const { content } = req.body;
  try {
    await pool.query(
      'INSERT INTO comments (post_id, content, user_id) VALUES ($1, $2, $3)',
      [id, content, req.session.user.id]
    );
    res.redirect(`/post/${id}`);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// 13. 댓글 삭제 처리
app.post('/comment/:id/delete', async (req, res) => {
  if (!req.session.user) return res.status(403).send('로그인이 필요합니다.');
  const { id } = req.params;
  const { postId } = req.body;
  try {
    const commentResult = await pool.query('SELECT user_id FROM comments WHERE id = $1', [id]);
    if (commentResult.rows[0].user_id === req.session.user.id) {
      await pool.query('DELETE FROM comments WHERE id = $1', [id]);
      res.redirect(`/post/${postId}`);
    } else {
      res.status(403).send('본인 댓글만 삭제할 수 있습니다.');
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
// 게시글 수정 폼 띄우기
app.get('/board/:slug/post/:id/edit', async (req, res) => {
  if (!req.session.user) {
    return res.send('<script>alert("로그인이 필요합니다."); window.location.href="/";</script>');
  }

  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM posts WHERE id = $1', [id]);
    const post = result.rows[0];

    // 로그인된 사람의 user_id와 글의 user_id가 일치하는지 서버가 직접 판별 
    if (post.user_id !== req.session.user.id) {
      return res.send('<script>alert("본인이 작성한 글만 수정할 수 있습니다."); history.back();</script>');
    }

    res.send(`
      ${await getHeaderHTML(req)}
      <h2>게시글 수정</h2>
      <form action="/board/${req.params.slug}/post/${post.id}/edit" method="POST">
        <label>제목:</label><br>
        <input type="text" name="title" value="${post.title}" required><br><br>
        <label>내용:</label><br>
        <textarea name="content" rows="10" required>${post.content}</textarea><br><br>
        <button type="submit">수정 완료</button>
        <a href="/board/${req.params.slug}/post/${post.id}">취소</a>
      </form>
    `);
  } catch (err) {
    res.status(500).send('DB Error');
  }
});
