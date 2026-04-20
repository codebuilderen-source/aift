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

// 1. 메인 페이지: 사용자 목록 출력 및 메뉴 제공
app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT name FROM aift');
    let userList = result.rows.map(row => `<li>${row.name}</li>`).join('');

    res.send(`
      <h1>🎮 게임 커뮤니티 메인</h1>
      <nav>
        <a href="/">홈으로</a> | 
        <a href="/add-user">새 사용자 추가</a> | 
        <a href="/community">커뮤니티 게시판(내부 링크)</a>
      </nav>
      <hr>
      <h2>현재 등록된 사용자 목록</h2>
      <ul>${userList || '사용자가 없습니다.'}</ul>
    `);
  } catch (err) {
    res.status(500).send('DB Error');
  }
});

// 2. 사용자 추가 페이지 (입력 폼)
app.get('/add-user', (req, res) => {
  res.send(`
    <h1>새 사용자 등록</h1>
    <form action="/add-user" method="POST">
      <input type="text" name="userName" placeholder="이름을 입력하세요" required>
      <button type="submit">등록</button>
    </form>
    <br>
    <a href="/">메인으로 돌아가기</a>
  `);
});

// 3. 사용자 추가 처리 (DB INSERT)
app.post('/add-user', async (req, res) => {
  const { userName } = req.body;
  try {
    await pool.query('INSERT INTO aift (name) VALUES ($1)', [userName]);
    // 등록 후 메인 페이지로 리다이렉트
    res.redirect('/');
  } catch (err) {
    res.status(500).send('데이터 저장 중 오류가 발생했습니다.');
  }
});

// 4. 내부 링크 테스트용 (커뮤니티 게시판)
app.get('/community', (req, res) => {
  res.send(`
    <h1>게시판 페이지</h1>
    <p>여기에 게임 평론이나 게시글이 올라올 예정입니다.</p>
    <a href="/">메인으로 돌아가기</a>
  `);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
